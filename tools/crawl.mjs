#!/usr/bin/env node
/* 抓取 + 打分 + 入库
   用法：
     node tools/crawl.mjs                # 用 seeds.json 扩散，输出 tools/candidates.json
     node tools/crawl.mjs --limit 80     # 限制候选数量
     node tools/crawl.mjs --apply        # 把 >=75 分的并入 data/videos.js
     node tools/crawl.mjs --apply --replace-demo   # 顺便清掉占位的 DEMO 数据
*/

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bili from './lib/bili.mjs';
import { score, classify, modesOf } from './lib/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data/videos.js');
const CAND = path.join(ROOT, 'tools/candidates.json');

const AI_TERMS = /大模型|LLM|GPT|Transformer|注意力|RAG|检索增强|Agent|智能体|提示词|Prompt|微调|预训练|推理|对齐|RLHF|DPO|Embedding|向量|多模态|扩散|Sora|Claude|OpenAI|Anthropic|DeepSeek|Kimi|豆包|通义|智谱|千问|ChatGPT|人工智能|机器学习|深度学习|神经网络|面试|八股|Cursor|Copilot/i;

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const LIMIT = Number(get('--limit', 80));
const MIN_SCORE = Number(get('--min-score', 75));
const PICK = (get('--pick', '') || '').split(',').map((x) => x.trim()).filter(Boolean);

/* ---------- 读写数据 ---------- */
function readData() {
  const code = fs.readFileSync(DATA, 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  return ctx.window.THEATER_DATA;
}
function writeData(d) {
  d.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(DATA, '/* 数据文件 · 只改这个文件 */\nwindow.THEATER_DATA = ' + JSON.stringify(d, null, 2) + ';\n');
}

/* ---------- 抓 ---------- */
async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/seeds.json'), 'utf8'));
  const seeds = cfg.seeds || [];
  const data = readData();
  const known = new Set(data.videos.map((v) => v.bvid));
  const pool = new Map(); // bvid -> {bvid,title,up,duration,play,desc,source,layer}

  const add = (v, source, layer) => {
    if (!v?.bvid || known.has(v.bvid) || pool.has(v.bvid)) return;
    if (!AI_TERMS.test(v.title + ' ' + (v.desc || ''))) return;
    if ((v.play || 0) < 3000) return;
    pool.set(v.bvid, { ...v, source, layer });
  };

  // 0) 种子本身
  for (const id of seeds) {
    const v = await bili.view(id);
    if (v) add({ bvid: v.bvid, title: v.title, up: v.up, duration: v.duration, play: v.stat.view, desc: v.desc }, 'seed', 0);
  }
  console.log(`种子: ${seeds.length} → 有效 ${pool.size}`);

  // 1) 一层扩散
  const layer1 = [];
  for (const id of seeds) {
    const rel = await bili.related(id);
    for (const v of rel) { add(v, 'related', 1); layer1.push(v); }
  }
  console.log(`一层: 相关 ${layer1.length} 条 → 池 ${pool.size}`);

  // 1.5) 关键词搜索（每个模块一组，结果带上模块提示）
  const wanted = cfg.keywords || {};
  for (const [module, kws] of Object.entries(wanted)) {
    for (const kw of kws) {
      const list = await bili.searchAll(kw, 1);
      let n = 0;
      for (const v of list) {
        const before = pool.size;
        add(v, 'search', 1);
        if (pool.size > before) { pool.get(v.bvid).hint = module; n++; }
      }
      console.log(`  搜索「${kw}」→ ${list.length} 条，新入池 ${n}`);
    }
  }

  // 2) 二层扩散：取一层里播放最高的 6 条继续拓
  const hot = [...pool.values()].sort((a, b) => (b.play || 0) - (a.play || 0)).slice(0, 6);
  for (const v of hot) {
    const rel = await bili.related(v.bvid);
    for (const r of rel) add(r, 'related2', 2);
  }
  console.log(`二层: 池 ${pool.size}`);

  // 3) 补全统计 + 评论（按播放排序取前 LIMIT）
  let list = [...pool.values()].sort((a, b) => (b.play || 0) - (a.play || 0)).slice(0, LIMIT);
  console.log(`补全 ${list.length} 条的播放/点赞/收藏…`);

  const out = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const full = await bili.view(v.bvid);
    if (!full) continue;
    const comments = i < 40 ? await bili.replies(full.aid, 20) : [];
    const s = score(full, comments);
    out.push({
      bvid: full.bvid,
      title: full.title,
      up: full.up,
      mid: full.mid,
      duration: full.duration,
      pubdate: full.pubdate,
      cover: bili.normalizeUrl(full.cover),
      desc: (full.desc || '').slice(0, 120),
      play: full.stat.view,
      like: full.stat.like,
      favorite: full.stat.favorite,
      coin: full.stat.coin,
      reply: full.stat.reply,
      rate: s.rate,
      favRate: s.favRate,
      score: s.score,
      reasons: s.reasons,
      negatives: s.negatives,
      comments: comments.slice(0, 3).map((c) => c.text.slice(0, 40)),
      module: v.hint || classify(full),
      modes: modesOf(full),
      layer: v.layer,
      source: v.source,
      hint: v.hint || null,
    });
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${list.length}\n`);
  }

  out.sort((a, b) => b.score - a.score);
  fs.writeFileSync(CAND, JSON.stringify({ generatedAt: new Date().toISOString(), count: out.length, list: out }, null, 2));

  /* ---------- 报告 ---------- */
  const good = out.filter((v) => v.score >= MIN_SCORE && !v.negatives.some((n) => n.startsWith('标题党')));
  const bad = out.filter((v) => v.score < 55);
  console.log(`\n候选 ${out.length} 条；≥${MIN_SCORE} 分 ${good.length} 条；<55 分 ${bad.length} 条`);
  console.log('\n排名 分数 时长 播放   互动  UP / 标题');
  out.slice(0, 15).forEach((v, i) => {
    const dur = `${Math.floor(v.duration / 60)}分`;
    console.log(
      `${String(i + 1).padStart(3)}  ${String(v.score).padStart(3)}  ${dur.padStart(4)} ${(v.play / 10000).toFixed(0).padStart(4)}万 ` +
      `${String(v.rate).padStart(5)}%  ${v.up} / ${v.title.slice(0, 34)}`
    );
  });
  if (bad.length) {
    console.log('\n被砍掉的例子：');
    bad.slice(0, 5).forEach((v) => console.log(`  ${v.score} 分 ${v.title.slice(0, 30)} ← ${v.negatives.join('，') || '低互动'}`));
  }
  console.log(`\n完整结果：tools/candidates.json`);
  console.log(`入库：node tools/crawl.mjs --apply${has('--replace-demo') ? ' --replace-demo' : ''}`);

  /* ---------- 入库 ---------- */
  if (has('--apply')) {
    const pick = PICK.length
      ? out.filter((v) => PICK.includes(v.bvid))
      : good.slice(0, 40);
    if (PICK.length) console.log(`手动挑选 ${PICK.length} 条，命中 ${pick.length} 条`);
    const tagPool = ['大模型', 'Transformer', 'RAG', 'Agent', 'AI 发展史', '面试', '实战'];
    let added = 0;
    for (const c of pick) {
      if (data.videos.some((v) => v.bvid === c.bvid)) continue;
      data.videos.push({
        id: `bili-${c.bvid}`,
        bvid: c.bvid,
        title: c.title,
        up: c.up,
        duration: c.duration,
        module: c.module,
        modes: c.modes,
        tags: tagPool.filter((t) => c.title.includes(t)).slice(0, 2).concat([c.module === 'build' ? '实操' : '讲解']),
        quality: c.score,
        views: c.play,
        cover: c.cover,
        curate: { source: c.source, layer: c.layer, rate: c.rate, at: new Date().toISOString().slice(0, 10) },
      });
      added++;
    }
    if (has('--replace-demo')) {
      data.videos = data.videos.filter((v) => v.bvid !== 'DEMO');
      console.log('已清掉占位 DEMO 数据');
    }
    writeData(data);
    console.log(`✅ 入库 ${added} 条，当前共 ${data.videos.length} 条`);
  }
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1); });
