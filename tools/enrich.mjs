/* 给已有视频补 aid / cid / 封面（播放器官方嵌入需要） */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bili from './lib/bili.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'data/videos.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(F, 'utf8'), ctx);
const d = ctx.window.THEATER_DATA;

let n = 0;
for (const v of d.videos) {
  const f = await bili.view(v.bvid);
  if (!f) { console.log('✗', v.bvid); continue; }
  v.aid = f.aid;
  v.cid = f.cid || (f.pages && f.pages[0] && f.pages[0].cid) || null;
  v.cover = bili.normalizeUrl(f.cover);
  v.up = f.up || v.up;
  v.duration = f.duration || v.duration;
  n++;
  process.stdout.write(`\r补全 ${n}/${d.videos.length}`);
}
d.updatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(F, '/* 数据文件 · 只改这个文件 */\nwindow.THEATER_DATA = ' + JSON.stringify(d, null, 2) + ';\n');
console.log('\n完成，缺 cid 的：', d.videos.filter((v) => !v.cid).length);
