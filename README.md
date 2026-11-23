# AI 放映厅

一个**纯静态**的 AI 视频站：选一个模块 → 一直往下刷 → 喜欢 / 不感兴趣。

**页面和数据是分开的**：所有内容在 `data/videos.js`，页面只负责读它。更新视频，只改这一个文件。

## 打开

**双击 `index.html`** 就行。

（之前那版双击打不开，是因为用 `fetch` 读 `.json`——浏览器不允许 `file://` 页面读本地 JSON。现在改成和 DayFlow 一样的做法：数据文件用 `<script>` 引入，双击必开，不需要服务器。）

想在手机上看，就双击 `启动.command`，它会起一个局域网服务并给出地址。

## 更新数据

只改 `data/videos.js`。它的内容就是一个 JSON，外面包了一层：

```js
window.THEATER_DATA = {
  "version": 1,
  "updatedAt": "2026-11-20",
  "modules": [ ... ],
  "videos": [
    {
      "id": "history-16",
      "bvid": "BV1xx411c7mD",
      "title": "视频标题",
      "up": "UP 主",
      "duration": 268,
      "module": "history",
      "modes": ["relax", "listen"],
      "tags": ["历史"],
      "quality": 90,
      "views": 120000
    }
  ]
};
```

如果你的爬虫输出的是纯 JSON，在最前面加一句 `window.THEATER_DATA = `，末尾加个 `;` 就行。

字段：

| 字段 | 作用 |
|---|---|
| `bvid` | 填真实 BV 号就自动变成 B 站播放器；`DEMO` 是占位 |
| `duration` | 秒。**≤600 进「刷一刷」，>600 进「专注」**（短视频不足 3 条时自动补最短的） |
| `modes` | `relax` / `focus` / `listen`，一个视频可占多个 |
| `quality` | 0-100，决定队列排序 |
| `module` | 必须和 `modules[].id` 对得上 |

改完刷新页面就生效，**不用动任何代码，也不用重新构建**。

## 部署到 GitHub Pages

**第 1 次：**

1. 打开 https://github.com/new?name=ai-theater&visibility=public
   仓库名 `ai-theater`，选 **Public**，**不要**勾 README / .gitignore / license，点 Create。
2. 双击 **`发布.command`** —— 它会 push 上去，并打开 Pages 设置页。
3. 在 Pages 设置里：Source 选 **Deploy from a branch** → `main` / `(root)` → Save。
4. 等 1 分钟，访问 **https://xuanxuan2333.github.io/ai-theater/**

**以后更新：**

改完 `data/videos.js`，双击 `发布.command` 即可，不用再动 Pages 设置。

手机打开那个地址 → 分享 → **添加到主屏幕**，就是个 App（有图标、全屏、没有地址栏）。

## 已实现

- 4 个模块 × 3 种场景（专注 / 刷一刷 / 只听），各自独立队列
- 一屏一条，**上/下都能翻**：滑动手势 + 「上一条 / 下一条」按钮，看过的不消失，可以反复看
- 喜欢 / 不感兴趣，记在本地，点完自动下一条；**只有点过播放才算「已看」**
- 已看 30 天不上浮
- **列表页三列网格**，一屏 8 条；可筛 ≤10 分 / >10 分 / 未看，也可切「按 UP」分组
- 只听模式：盖住画面，只留封面、标题、波形
- 我的：已看 / 喜欢 / 场景占比；**可清空浏览记录**（喜欢和不喜欢保留），记录可导出

## 文档

| 文件 | 内容 |
|---|---|
| [docs/概要设计.md](docs/概要设计.md) | 三场景、五个屏、数据模型、里程碑 |
| [docs/策展引擎.md](docs/策展引擎.md) | 内容从哪来、怎么判优劣（真正的难点） |
| [design/out/app-m0.png](design/out/app-m0.png) | 实机截图 |
| [design/out/simple.png](design/out/simple.png) | 交互设计图 |
