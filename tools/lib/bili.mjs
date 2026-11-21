/* B 站只读接口封装：搜索 / 相关推荐 / 详情 / 热评 / 排行榜
   注意：只读、低频（默认 1 次/秒）。搜索接口需要 WBI 签名 + buvid3。 */

import crypto from 'node:crypto';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HDRS = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Accept: 'application/json, text/plain, */*' };

let cookieJar = '';
let lastCall = 0;
const MIN_GAP = 900; // ms

export function setCookie(c) { cookieJar = c || ''; }

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function req(url, { raw = false } = {}) {
  const gap = MIN_GAP - (Date.now() - lastCall);
  if (gap > 0) await sleep(gap);
  lastCall = Date.now();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { ...HDRS, ...(cookieJar ? { Cookie: cookieJar } : {}) } });
      if (raw) return await res.text();
      const json = await res.json();
      if (json.code === -412 || json.code === -352) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      return json;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(2000);
    }
  }
  return null;
}

/* ---------- 拿 buvid3（没有 cookie 时） ---------- */
export async function ensureCookie() {
  if (cookieJar) return cookieJar;
  try {
    const res = await fetch('https://www.bilibili.com/', { headers: { 'User-Agent': UA } });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const pick = setCookie.map((c) => c.split(';')[0]).filter((c) => /^(buvid3|buvid4|b_nut)=/.test(c));
    if (pick.length) cookieJar = pick.join('; ');
  } catch {}
  return cookieJar;
}

/* ---------- WBI 签名 ---------- */
const MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
let wbiKeys = null;
let wbiTime = 0;

async function getWbiKeys() {
  if (wbiKeys && Date.now() - wbiTime < 3600_000) return wbiKeys;
  const j = await req('https://api.bilibili.com/x/web-interface/nav');
  const img = j?.data?.wbi_img?.img_url || '';
  const sub = j?.data?.wbi_img?.sub_url || '';
  const key = (u) => u.split('/').pop().split('.')[0];
  wbiKeys = { img: key(img), sub: key(sub) };
  wbiTime = Date.now();
  return wbiKeys;
}

function mixinKey({ img, sub }) {
  const raw = img + sub;
  return MIXIN_TAB.map((i) => raw[i]).join('').slice(0, 32);
}

async function signed(params) {
  const { img, sub } = await getWbiKeys();
  const mk = mixinKey({ img, sub });
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(p).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  const w_rid = crypto.createHash('md5').update(query + mk).digest('hex');
  return `${query}&w_rid=${w_rid}`;
}

/* ---------- 对外方法 ---------- */
export async function search(keyword, { order = 'totalrank', page = 1, duration = 0 } = {}) {
  await ensureCookie();
  const q = await signed({ search_type: 'video', keyword, page, order, duration, tids: 0 });
  const j = await req(`https://api.bilibili.com/x/web-interface/wbi/search/type?${q}`);
  if (j?.code !== 0) return { error: j?.code ?? 'unknown', list: [] };
  const list = (j.data?.result || []).map((v) => ({
    bvid: v.bvid,
    title: stripTags(v.title),
    author: v.author,
    mid: v.mid,
    duration: clockToSec(v.duration),
    play: v.play,
    pubdate: v.pubdate,
    desc: stripTags(v.description || ''),
    cover: normalizeUrl(v.pic),
    source: 'search',
  }));
  return { list, numPages: j.data?.numPages || 0 };
}

export async function searchAll(keyword, page = 1) {
  const j = await req(`https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(keyword)}&page=${page}`);
  if (j?.code !== 0) return [];
  const g = (j.data?.result || []).find((x) => x.result_type === 'video');
  return (g?.data || []).map((v) => ({
    bvid: v.bvid,
    title: stripTags(v.title),
    author: v.author,
    mid: v.mid,
    duration: clockToSec(v.duration),
    play: v.play,
    pubdate: v.pubdate,
    desc: stripTags(v.description || ''),
    cover: normalizeUrl(v.pic),
    source: 'search',
  }));
}

export async function related(bvid) {
  const j = await req(`https://api.bilibili.com/x/web-interface/archive/related?bvid=${bvid}`);
  if (j?.code !== 0) return [];
  return (j.data || []).map((v) => ({
    bvid: v.bvid, title: v.title, author: v.owner?.name, mid: v.owner?.mid,
    duration: v.duration, play: v.stat?.view, pubdate: v.pubdate,
    desc: stripTags(v.desc || ''), cover: normalizeUrl(v.pic), source: 'related',
  }));
}

export async function view(bvid) {
  const j = await req(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  if (j?.code !== 0) return null;
  const d = j.data;
  return {
    bvid: d.bvid, aid: d.aid, cid: d.cid || (d.pages && d.pages[0] && d.pages[0].cid), title: d.title, desc: stripTags(d.desc || ''),
    duration: d.duration, pubdate: d.pubdate, cover: d.pic,
    up: d.owner?.name, mid: d.owner?.mid, tags: (d.tname ? [d.tname] : []),
    stat: {
      view: d.stat?.view, like: d.stat?.like, coin: d.stat?.coin,
      favorite: d.stat?.favorite, share: d.stat?.share,
      reply: d.stat?.reply, danmaku: d.stat?.danmaku,
    },
  };
}

export async function replies(aid, ps = 20) {
  const j = await req(`https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=2&ps=${ps}&pn=1`);
  if (j?.code !== 0) return [];
  return (j.data?.replies || []).map((r) => ({ text: r.content?.message || '', like: r.like || 0 }));
}

export async function ranking(rid = 0) {
  const j = await req(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`);
  if (j?.code !== 0) return [];
  return (j.data?.list || []).map((v) => ({
    bvid: v.bvid, title: v.title, author: v.owner?.name, mid: v.owner?.mid,
    duration: v.duration, play: v.stat?.view, pubdate: v.pubdate,
    desc: stripTags(v.desc || ''), cover: normalizeUrl(v.pic), source: 'ranking',
  }));
}

/* ---------- 工具 ---------- */
export function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}
export function normalizeUrl(u) {
  if (!u) return '';
  let s = u.startsWith('//') ? 'https:' + u : u;
  return s.replace(/^http:/, 'https:');
}
export function clockToSec(c) {
  if (!c) return 0;
  if (typeof c === 'number') return c;
  return String(c).split(':').reduce((acc, n) => acc * 60 + Number(n || 0), 0);
}
export const sleepMs = sleep;
