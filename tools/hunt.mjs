#!/usr/bin/env node
/* 顺着「相关推荐」往下翻，找同类。默认从某个模块已有的视频出发。
   node tools/hunt.mjs --module history --depth 2 --limit 70
*/
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bili from './lib/bili.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MODULE = get('--module', 'history');
const DEPTH = Number(get('--depth', 2));
const LIMIT = Number(get('--limit', 70));

const COMPANY = /英伟达|NVIDIA|黄仁勋|OpenAI|奥特曼|Altman|Anthropic|Claude|DeepMind|哈萨比斯|Meta|Llama|谷歌|Google|微软|Microsoft|马斯克|xAI|Grok|DeepSeek|月之暗面|Kimi|智谱|通义|千问|豆包|字节|百度|文心|MiniMax|芯片|GPU|算力|公司|创业|崛起|兴衰|帝国|宫斗|收购|估值|融资/i;

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/videos.js'), 'utf8'), ctx);
const data = ctx.window.THEATER_DATA;
const known = new Set(data.videos.map((v) => v.bvid));

const seeds = data.videos.filter((v) => v.module === MODULE).map((v) => v.bvid);
console.log(`种子 ${seeds.length} 条（${MODULE}）`);

const pool = new Map();
const add = (v, layer) => {
  if (!v?.bvid || known.has(v.bvid) || pool.has(v.bvid)) return;
  if (!COMPANY.test(v.title + ' ' + (v.desc || ''))) return;
  if ((v.play || 0) < 5000) return;
  if (v.duration < 180) return;
  pool.set(v.bvid, { ...v, layer });
};

// 第一层
for (const id of seeds) {
  const rel = await bili.related(id);
  rel.forEach((r) => add(r, 1));
}
console.log(`一层后：${pool.size}`);

// 第二层：取一层里播放最高的 8 条继续
if (DEPTH >= 2) {
  const hot = [...pool.values()].sort((a, b) => b.play - a.play).slice(0, 8);
  for (const v of hot) {
    const rel = await bili.related(v.bvid);
    rel.forEach((r) => add(r, 2));
  }
  console.log(`二层后：${pool.size}`);
}

// 补全统计
const top = [...pool.values()].sort((a, b) => b.play - a.play).slice(0, LIMIT);
console.log(`补全 ${top.length} 条…`);
const rows = [];
for (let i = 0; i < top.length; i++) {
  const f = await bili.view(top[i].bvid);
  if (f) {
    const s = f.stat;
    rows.push({
      bvid: f.bvid, title: f.title, up: f.up, dur: f.duration,
      view: s.view, like: s.like, fav: s.favorite,
      rate: +(((s.like + s.coin + s.favorite) / Math.max(s.view, 1)) * 100).toFixed(2),
      favRate: +((s.favorite / Math.max(s.view, 1)) * 100).toFixed(2),
      layer: top[i].layer,
    });
  }
  if ((i + 1) % 15 === 0) process.stdout.write(`  ${i + 1}/${top.length}\n`);
}

rows.sort((a, b) => b.fav - a.fav);
fs.writeFileSync(path.join(ROOT, 'tools/hunt.json'), JSON.stringify(rows, null, 2));

const n = (x) => (x >= 10000 ? (x / 10000).toFixed(1) + '万' : String(x));
console.log('\n排名  收藏   点赞   播放   互动   收藏率  时长  UP / 标题');
rows.slice(0, 25).forEach((v, i) => {
  console.log(`${String(i + 1).padStart(3)} ${n(v.fav).padStart(6)} ${n(v.like).padStart(6)} ${n(v.view).padStart(6)} ${String(v.rate).padStart(5)}% ${String(v.favRate).padStart(5)}% ${String(Math.round(v.dur / 60)).padStart(4)}分 ${v.up.slice(0, 10)} / ${v.title.slice(0, 36)}`);
});

// 从标题里提关键词，供下一轮搜索
const STOP = /的|了|是|在|和|与|一个|什么|怎么|为什么|视频|全集|合集/g;
const freq = {};
rows.forEach((v) => {
  (v.title.match(/[A-Za-z][A-Za-z0-9.]+|[\u4e00-\u9fa5]{2,4}/g) || []).forEach((w) => {
    if (STOP.test(w) || w.length < 2) return;
    freq[w] = (freq[w] || 0) + 1;
  });
});
const kws = Object.entries(freq).filter(([w, c]) => c >= 3 && COMPANY.test(w)).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\n高频词（可直接当搜索词）：', kws.map(([w, c]) => `${w}(${c})`).join('  '));
