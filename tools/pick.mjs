#!/usr/bin/env node
/* 手动挑选入库：给一批 BV 号，逐条体检、打分，再决定收不收。
   node tools/pick.mjs --module concepts --bv BV1x,BV2y
   node tools/pick.mjs --module concepts --bv ... --apply --replace-demo
*/
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bili from './lib/bili.mjs';
import { score, modesOf } from './lib/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'data/videos.js');
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

const module_ = get('--module', 'concepts');
const bvids = (get('--bv', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

function readData() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(F, 'utf8'), ctx);
  return ctx.window.THEATER_DATA;
}
function writeData(d) {
  d.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(F, '/* 数据文件 · 只改这个文件 */\nwindow.THEATER_DATA = ' + JSON.stringify(d, null, 2) + ';\n');
}

const TAGS = [['Transformer', /Transformer/i], ['RAG', /RAG|检索/], ['Agent', /Agent|智能体/i],
  ['注意力', /注意力|Attention/i], ['提示词', /提示词|Prompt/i], ['神经网络', /神经网络|深度学习/],
  ['面试', /面试|八股/], ['实战', /实战|做出|搭建|开发/], ['发展史', /历史|发展史|诞生|十年/],
  ['MCP', /MCP/i], ['Claude Code', /Claude Code/i], ['Vibe Coding', /Vibe ?Coding/i]];

async function main() {
  const data = readData();
  const rows = [];
  for (const id of bvids) {
    const v = await bili.view(id);
    if (!v) { console.log(`✗ ${id} 取不到`); continue; }
    const cs = await bili.replies(v.aid, 20);
    const s = score(v, cs);
    rows.push({ v, s, cs });
    const neg = s.negatives.length ? `  ⚠ ${s.negatives.join('，')}` : '';
    console.log(`${String(s.score).padStart(3)}分 ${String(Math.round(v.duration / 60)).padStart(4)}分 ${(v.stat.view / 10000).toFixed(0).padStart(4)}万 互动${String(s.rate).padStart(5)}%  ${v.up} / ${v.title.slice(0, 36)}${neg}`);
    if (cs[0]) console.log(`      评论：${cs[0].text.slice(0, 46)}`);
  }

  if (!has('--apply')) {
    console.log('\n确认没问题再加 --apply 入库');
    return;
  }
  let added = 0;
  for (const { v, s } of rows) {
    if (data.videos.some((x) => x.bvid === v.bvid)) continue;
    const tags = TAGS.filter(([, re]) => re.test(v.title + v.desc)).map(([t]) => t).slice(0, 2);
    data.videos.push({
      id: `bili-${v.bvid}`,
      bvid: v.bvid,
      title: v.title,
      up: v.up,
      duration: v.duration,
      module: module_,
      modes: modesOf(v),
      tags: tags.length ? tags : ['AI'],
      quality: s.score,
      views: v.stat.view,
      cover: bili.normalizeUrl(v.cover),
      curate: { rate: s.rate, pick: 'manual', at: new Date().toISOString().slice(0, 10) },
    });
    added++;
  }
  if (has('--replace-demo')) {
    data.videos = data.videos.filter((x) => x.bvid !== 'DEMO');
    console.log('已清掉占位数据');
  }
  writeData(data);
  console.log(`\n✅ 入库 ${added} 条 · 当前共 ${data.videos.length} 条`);
}

main();
