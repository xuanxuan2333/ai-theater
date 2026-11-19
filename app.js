/* AI 放映厅
   页面与数据分离：所有内容在 data/videos.js，这里只有逻辑。
   换视频 = 只改那个文件，不用碰这里。 */

let MODS = [];
let VIDEOS = [];
let DATA = null;

const MODES = {
  relax:  { name: '刷一刷', desc: '5 分钟以内，碎片时间' },
  focus:  { name: '专注',   desc: '长视频，坐下来看' },
  listen: { name: '只听',   desc: '不看画面也能懂' },
};

const KEY = 'ai-theater-v1';
const DAY = 86400000;

/* ---------------- state ---------------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      seen: s.seen || {},
      liked: s.liked || {},
      disliked: s.disliked || {},
      views: s.views || { relax: 0, focus: 0, listen: 0 },
      lastModule: s.lastModule || null,
      lastMode: s.lastMode || 'relax',
    };
  } catch (e) {
    return { seen: {}, liked: {}, disliked: {}, views: { relax: 0, focus: 0, listen: 0 }, lastModule: null, lastMode: 'relax' };
  }
}
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

const isSeen = (id) => S.seen[id] && Date.now() - S.seen[id] < 30 * DAY;
const mod = (id) => MODS.find((m) => m.id === id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtL = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} 小时 ${Math.round((s % 3600) / 60)} 分` : `${Math.round(s / 60)} 分钟`);

/* ---------------- queue ---------------- */
function buildQueue(module, mode) {
  const pool = VIDEOS.filter(
    (v) => v.module === module && v.modes.includes(mode) && !isSeen(v.id) && !S.disliked[v.id]
  );
  // 质量优先 + 一点随机，保证每次进来的顺序不一样
  return pool
    .map((v) => ({ v, k: v.quality + Math.random() * 9 }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.v);
}

function counts(module) {
  const all = VIDEOS.filter((v) => v.module === module);
  const alive = all.filter((v) => !isSeen(v.id) && !S.disliked[v.id]);
  const by = (m) => alive.filter((v) => v.modes.includes(m)).length;
  return { total: all.length, left: alive.length, relax: by('relax'), focus: by('focus'), listen: by('listen') };
}

/* ---------------- view helpers ---------------- */
const app = document.getElementById('app');
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 1800);
}

const GRADS = [
  'linear-gradient(135deg,#1b4a6b,#3ddcc0 70%,#a8f7b0)',
  'linear-gradient(135deg,#2a1a4a,#8b5cf6)',
  'linear-gradient(135deg,#7a1f1f,#ff6b6b)',
  'linear-gradient(135deg,#0f2a4a,#1e6fff)',
  'linear-gradient(135deg,#3a1e00,#ff9b3d)',
  'linear-gradient(135deg,#0c8f7c,#1e9eff)',
  'linear-gradient(135deg,#2a1435,#c04bff)',
  'linear-gradient(135deg,#33131a,#ff5f5f)',
];
const gradOf = (v) => GRADS[(v.id.charCodeAt(v.id.length - 1) + v.id.length) % GRADS.length];

/* ---------------- boot ---------------- */
function boot() {
  // 数据由 data/videos.js 通过 <script> 注入，file:// 双击也能用
  const raw = window.THEATER_DATA;
  if (raw && Array.isArray(raw.videos)) {
    DATA = raw;
    MODS = raw.modules || [];
    VIDEOS = raw.videos;
    route();
    return;
  }

  // 兜底：如果哪天换回 data/videos.json（http 环境），也能读
  app.innerHTML = `<div class="page" style="display:grid;place-items:center"><div class="empty">载入中…</div></div>`;
  fetch('data/videos.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      MODS = d.modules || [];
      VIDEOS = d.videos || [];
      route();
    })
    .catch((err) => renderLoadError(err));
}

function renderLoadError(err) {
  const isFile = location.protocol === 'file:';
  const dir = isFile ? decodeURIComponent(location.pathname.replace(/\/[^/]*$/, '')) : '';
  const cmd = isFile ? `cd "${dir}" && python3 -m http.server 8080` : '';
  app.innerHTML = `
    <div class="page top">
      <div style="padding-top:36px">
        <div style="font-size:22px;font-weight:800;color:#eef1f8">读不到数据文件</div>
        <div style="margin-top:10px;font-size:13px;color:#8b94a9;line-height:1.9">
          ${isFile
            ? '数据文件没加载成功：确认 <code>data/videos.js</code> 存在，并且 index.html 里有对应的 script 标签。'
            : '文件不存在，或者 JSON 格式有误。'}
          <br><span style="color:#4d566c;font-size:11px">${String((err && err.message) || err)}</span>
        </div>

        ${isFile ? `
        <div style="margin-top:26px;background:#0f141d;border:1px solid #232c3e;border-radius:12px;padding:14px 16px">
          <div style="font-size:11px;color:#5c6579;letter-spacing:.1em;margin-bottom:8px">在终端里执行</div>
          <div id="cmd" style="font-family:Menlo,monospace;font-size:12px;color:#9fb0d8;line-height:1.7;word-break:break-all">${cmd.replace(/"/g, '&quot;')}</div>
          <button id="copycmd" style="margin-top:12px;height:40px;padding:0 18px;border-radius:10px;background:#1b2433;border:1px solid #2c3a52;color:#cfd6e6;font-size:13px">复制命令</button>
        </div>

        <div style="margin-top:14px;font-size:13px;color:#8b94a9;line-height:2">
          执行后打开 <b style="color:#c9d0ff">http://127.0.0.1:8080</b><br>
          或者直接双击 <b style="color:#c9d0ff">启动.command</b>（它会自动做上面这件事）
        </div>

        <div style="margin-top:22px;font-size:12px;color:#4d566c;line-height:1.9">
          部署到 GitHub Pages 之后不存在这个问题：线上走的是 http，打开就能用。
        </div>` : ''}
      </div>
    </div>`;

  const btn = document.getElementById('copycmd');
  if (btn) {
    btn.addEventListener('click', () => {
      const text = document.getElementById('cmd').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => toast('已复制，去终端粘贴执行'),
          () => toast('复制失败，请手动选中')
        );
      } else {
        const r = document.createRange();
        r.selectNodeContents(document.getElementById('cmd'));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        toast('已选中，按 ⌘C 复制');
      }
    });
  }
}

/* ---------------- home ---------------- */
function renderHome() {
  document.title = 'AI 放映厅';
  const cards = MODS.map((m) => {
    const c = counts(m.id);
    const pct = c.total ? Math.round(((c.total - c.left) / c.total) * 100) : 0;
    return `
      <button class="mod ${m.cls}" data-go="#/m/${m.id}">
        <div class="row1">
          <span style="font-size:19px">${m.icon}</span>
          <span class="name">${m.name}</span>
          <span class="left">${c.total} 条 · 还剩 ${c.left}</span>
        </div>
        <div class="desc">${m.desc}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="meta">
          <span>专注 ${c.focus}</span><span>刷一刷 ${c.relax}</span><span>只听 ${c.listen}</span>
        </div>
      </button>`;
  }).join('');

  app.innerHTML = `
    <div class="page top">
      <div class="home-head">
        <div>
          <div class="eyebrow">Pick one</div>
          <h1 class="title">今天看点什么</h1>
        </div>
        <button class="avatar" data-go="#/me">L</button>
      </div>
      ${cards}
      <div class="home-foot">
        共 ${VIDEOS.length} 条 · 数据更新于 ${DATA.updatedAt || '—'}<br>
        点开就接着上次的地方刷
      </div>
    </div>`;
}

/* ---------------- feed ---------------- */
let feedObserver = null;
let startId = null;

function renderFeed(module, mode) {
  const m = mod(module);
  if (!m) return (location.hash = '#/');
  mode = MODES[mode] ? mode : 'relax';
  S.lastModule = module;
  S.lastMode = mode;
  S.views[mode] = (S.views[mode] || 0) + 1;
  save();

  const list = buildQueue(module, mode);
  document.title = `${m.name} · ${MODES[mode].name}`;

  const top = `
    <div class="feed-top">
      <button class="back" data-go="#/">‹</button>
      <span class="nm">${m.name}</span>
      <div class="modes">
        ${Object.entries(MODES).map(([k, v]) => `<button class="${k === mode ? 'on' : ''}" data-mode="${k}" data-module="${module}">${v.name}</button>`).join('')}
      </div>
      <span class="counter" id="counter">${list.length ? '1' : '0'}/${list.length}</span>
    </div>`;

  if (!list.length) {
    app.innerHTML = top + `<div class="page" style="display:grid;place-items:center;text-align:center">
      <div class="empty">这个模式刷完了 🎉<br>换一个场景，或者回首页换个模块</div></div>`;
    return;
  }

  const slides = list.map((v, i) => `
    <section class="slide ${mode === 'listen' ? 'listen' : ''}" data-idx="${i}" data-id="${v.id}">
      ${mode === 'listen' ? `
      <div class="listen-hero">
        <div class="cover-big" style="background:${gradOf(v)}"></div>
        <div class="wave">${[8, 15, 10, 21, 7, 17, 12, 23, 9, 14].map((h) => `<i style="height:${h}px"></i>`).join('')}</div>
        <div class="lnote">屏幕常亮 · 锁屏会暂停</div>
      </div>
      <div class="stage"></div>` : ''}
      ${mode !== 'listen' ? `<div class="stage">
        <div class="cover" style="background:${gradOf(v)}"></div>
        <span class="demo">${v.bvid === 'DEMO' ? '示例' : 'B 站'}</span>
        <button class="playbtn" data-play="${v.id}">▶</button>
        <span class="dur">${fmt(v.duration)}</span>
      </div>` : ''}
      <div class="info">
        <div class="vtitle">${v.title}</div>
        <div class="vmeta"><span class="dot"></span><span>${v.up}</span><span>· ${(v.views / 10000).toFixed(1)} 万播放</span></div>
        <div class="acts">
          <button class="act like" data-like="${v.id}">👍 喜欢</button>
          <button class="act dis" data-dislike="${v.id}">👎 不感兴趣</button>
        </div>
        <div class="tags">${v.tags.map((t) => `<span class="tag">${t}</span>`).join('')}<span class="tag">${fmtL(v.duration)}</span></div>
      </div>
      <div class="feed-foot">
        <div class="pbar"><i style="width:${((i + 1) / list.length) * 100}%"></i></div>
        <div class="swipe">⌃ 上滑下一个 · 下滑回上一条</div>
      </div>
    </section>`).join('');

  app.innerHTML = top + `<div class="feed" id="feed">${slides}</div>`;

  const feed = document.getElementById('feed');
  const counter = document.getElementById('counter');

  if (feedObserver) feedObserver.disconnect();
  const seenTimers = {};
  feedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const i = +e.target.dataset.idx;
        const id = e.target.dataset.id;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          counter.textContent = `${i + 1}/${list.length}`;
          clearTimeout(seenTimers[id]);
          seenTimers[id] = setTimeout(() => {
            if (!S.seen[id]) {
              S.seen[id] = Date.now();
              save();
            }
          }, 1200);
        }
      });
    },
    { root: feed, threshold: [0.6] }
  );
  feed.querySelectorAll('.slide').forEach((s) => feedObserver.observe(s));

  if (startId) {
    const target = feed.querySelector(`.slide[data-id="${startId}"]`);
    startId = null;
    if (target) requestAnimationFrame(() => { feed.scrollTop = target.offsetTop; });
  }
}

function goNext() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  const slides = [...feed.querySelectorAll('.slide')];
  const cur = slides.findIndex((s) => {
    const r = s.getBoundingClientRect();
    return r.top > -10 && r.top < window.innerHeight * 0.5;
  });
  const next = slides[Math.max(0, cur) + 1];
  if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else toast('这个队列刷完了，换一个场景吧');
}

function mountPlayer(stage, v) {
  if (!v.bvid || v.bvid === 'DEMO') {
    toast('示例数据：在 data/videos.json 里填真实 bvid 就能播');
    return;
  }
  const url = `https://player.bilibili.com/player.html?bvid=${v.bvid}&autoplay=1&danmaku=0&high_quality=1`;
  stage.innerHTML = `<iframe src="${url}" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="no-referrer" scrolling="no" frameborder="0" allowfullscreen></iframe>`;
}

/* ---------------- list ---------------- */
let listFilter = 'all';
function renderList(module) {
  const m = mod(module);
  if (!m) return (location.hash = '#/');
  document.title = `${m.name} · 列表`;

  const all = VIDEOS.filter((v) => v.module === module);
  const items = all.filter((v) => {
    if (listFilter === 'short') return v.duration <= 300;
    if (listFilter === 'long') return v.duration > 300;
    if (listFilter === 'unseen') return !isSeen(v.id);
    return true;
  });

  const groups = {};
  items.forEach((v) => (groups[v.up] = groups[v.up] || []).push(v));
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

  const body = keys.map((up) => {
    const vs = groups[up].sort((a, b) => b.quality - a.quality);
    return `
      <div class="group">
        <div class="group-h"><b>${up}</b><span>${vs.length} 条</span></div>
        ${vs.map((v) => `
          <button class="vrow" data-watch="${v.module}/${v.id}">
            <div class="cv" style="background:${gradOf(v)}"><span class="d">${fmt(v.duration)}</span></div>
            <div style="min-width:0">
              <div class="t">${v.title}</div>
              <div class="m">${v.tags.join(' · ')}${isSeen(v.id) ? '<span class="seen-dot">已看</span>' : ''}</div>
            </div>
          </button>`).join('')}
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="page top">
      <div class="feed-top" style="position:static;background:none;padding:0 0 6px;backdrop-filter:none">
        <button class="back" data-go="#/m/${module}">‹</button>
        <span class="nm">${m.name} · ${all.length} 条</span>
        <span class="counter">按 UP 分组</span>
      </div>
      <div class="chips">
        ${[['all', '全部'], ['short', '短视频 ≤5分'], ['long', '长视频 >5分'], ['unseen', '未看']]
          .map(([k, l]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
      </div>
      ${body || '<div class="empty">没有符合条件的视频</div>'}
      <div style="height:30px"></div>
    </div>`;
}

/* ---------------- me ---------------- */
function renderMe() {
  document.title = '我的';
  const seenN = Object.keys(S.seen).filter(isSeen).length;
  const likeN = Object.keys(S.liked).length;
  const disN = Object.keys(S.disliked).length;
  const total = S.views.relax + S.views.focus + S.views.listen || 1;
  const pct = (k) => Math.round(((S.views[k] || 0) / total) * 100);

  app.innerHTML = `
    <div class="page top">
      <div class="me-head">
        <div class="ava">L</div>
        <div><b>梁</b><p>本地记录 · 不上传任何数据</p></div>
      </div>

      <div class="stats">
        <div><div class="n">${seenN}</div><div class="l">已看</div></div>
        <div><div class="n" style="color:var(--m2)">${likeN}</div><div class="l">喜欢</div></div>
        <div><div class="n" style="color:#ff9b9b">${disN}</div><div class="l">不感兴趣</div></div>
      </div>

      <div class="sect">你都在什么场景下看</div>
      <div class="usage">
        <div><div class="v">${pct('focus')}%</div><div class="k">🎯 专注</div></div>
        <div><div class="v">${pct('relax')}%</div><div class="k">☕ 刷一刷</div></div>
        <div><div class="v">${pct('listen')}%</div><div class="k">🎧 只听</div></div>
      </div>

      <div class="sect">你的赞踩在调什么</div>
      <div class="line"><span>喜欢的作者会多抓</span><span class="r">${topUp('liked')}</span></div>
      <div class="line"><span>不感兴趣的作者会少抓</span><span class="r">${topUp('disliked')}</span></div>
      <div class="line"><span>已看过的视频</span><span class="r">30 天后才可能再出现</span></div>

      <div class="sect">数据</div>
      <div class="line"><span>data/videos.js</span><span class="r">${VIDEOS.length} 条 · v${DATA.version || 1} · ${DATA.updatedAt || '—'}</span></div>
      <div class="line" style="border-bottom:none"><span>更新方式</span><span class="r">只改数据文件，不改页面</span></div>

      <button class="btn-block" id="export">导出我的记录（JSON）</button>
      <button class="btn-block" id="reset" style="color:#ff9b9b">清空本地记录</button>
    </div>`;
}

function topUp(kind) {
  const ids = Object.keys(S[kind]);
  if (!ids.length) return '还没有';
  const ups = ids.map((id) => (VIDEOS.find((v) => v.id === id) || {}).up).filter(Boolean);
  const cnt = {};
  ups.forEach((u) => (cnt[u] = (cnt[u] || 0) + 1));
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  return top ? `${top} ${kind === 'liked' ? '↑' : '↓'}` : '还没有';
}

/* ---------------- router & events ---------------- */
function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!p.length) return renderHome();
  if (p[0] === 'me') return renderMe();
  if (p[0] === 'm' && p[1]) {
    if (p[2] === 'list') return renderList(p[1]);
    return renderFeed(p[1], p[2] || S.lastMode || 'relax');
  }
  renderHome();
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; return; }

  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) { location.hash = `#/m/${modeBtn.dataset.module}/${modeBtn.dataset.mode}`; return; }

  const play = e.target.closest('[data-play]');
  if (play) {
    const v = VIDEOS.find((x) => x.id === play.dataset.play);
    if (v) mountPlayer(play.closest('.stage'), v);
    return;
  }

  const like = e.target.closest('[data-like]');
  if (like) {
    S.liked[like.dataset.like] = Date.now(); save();
    toast('已记录：多推这类'); goNext(); return;
  }

  const dis = e.target.closest('[data-dislike]');
  if (dis) {
    S.disliked[dis.dataset.dislike] = Date.now(); save();
    toast('已记下，以后少推这种'); goNext(); return;
  }

  const watch = e.target.closest('[data-watch]');
  if (watch) {
    const [m, vid] = watch.dataset.watch.split('/');
    startId = vid;
    location.hash = `#/m/${m}/${S.lastMode || 'relax'}`;
    return;
  }

  const filter = e.target.closest('[data-filter]');
  if (filter) { listFilter = filter.dataset.filter; renderList(location.hash.split('/')[2]); return; }

  if (e.target.id === 'export') {
    const data = JSON.stringify({ ...S, exportedAt: new Date().toISOString() }, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(data).then(
        () => toast('已复制到剪贴板'),
        () => toast('复制失败，请手动保存')
      );
    } else {
      toast('当前环境不支持剪贴板');
    }
  }

  if (e.target.id === 'reset') {
    if (confirm('确定清空本地记录？')) {
      S = { seen: {}, liked: {}, disliked: {}, views: { relax: 0, focus: 0, listen: 0 }, lastModule: null, lastMode: 'relax' };
      save(); renderMe();
    }
  }
});

window.addEventListener('hashchange', route);
boot();
