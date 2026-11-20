/* 打分：先杀负信号，再算正分。
   核心思想：播放量不是指标，互动率/收藏率/评论区才是。 */

const CLICKBAIT = [/震惊|惊呆|必看|速看|保姆级|一篇搞定|全网最全|史上最/,
  /(2024|2025|2026)\s*最新|最新.*(合集|教程)/,
  /0\s*基础.{0,6}(天|周).{0,6}(学会|入门|上岗)/,
  /看完.{0,8}(上岗|年薪|月入|变现)/];

const SALES = /加群|进群|交流群|领取|资料包|课程咨询|私信|vx|微信|扫码|付费|报名/;
const OFFTOPIC = /漫剧|短剧|小说|推文|带货|副业|变现|引流|写真|壁纸|游戏实况|开箱/;
const NEG_COMMENT = /念稿|AI配音|ai配音|听不懂|废话|广告|割韭菜|标题党|搬运|水视频|别浪费/g;
const POS_COMMENT = /讲得(好|清楚|明白|透)|终于(懂|明白|理解)|清晰|透彻|受益匪浅|讲人话|深入浅出|跪了/g;

export function classify(v) {
  const t = `${v.title} ${v.desc || ''}`;
  if (/面试|八股|offer|招聘|面经/.test(t)) return 'interview';
  if (/做一个|搭建|实战|手把手|上手|部署|Cursor|代码实现|写一个/.test(t)) return 'build';
  if (/历史|发展|起源|往事|十年|寒冬|诞生|年表|谁发明/.test(t)) return 'history';
  return 'concepts';
}

export function modesOf(v) {
  const t = `${v.title} ${v.desc || ''}`;
  const modes = [v.duration <= 600 ? 'relax' : 'focus'];  // 短视频 ≤10 分钟
  const needsScreen = /手写|代码|演示|实操|搭建|做一个|PPT|终端|编辑器|实战/.test(t);
  if (!needsScreen) modes.push('listen');
  return modes;
}

export function score(v, comments = []) {
  const s = v.stat || {};
  const view = Math.max(s.view || 0, 1);
  const rate = ((s.like || 0) + (s.coin || 0) + (s.favorite || 0)) / view;
  const favRate = (s.favorite || 0) / view;

  const negs = [];
  const reasons = [];
  let penalty = 0;

  // 一票否决类
  if (OFFTOPIC.test(v.title)) {
    return { score: 0, rate: +(rate * 100).toFixed(2), favRate: +(favRate * 100).toFixed(2), reasons: [], negatives: ['跑题：' + v.title.match(OFFTOPIC)[0]], reject: true };
  }
  if (CLICKBAIT.some((re) => re.test(v.title))) {
    penalty += 25;
    negs.push('标题党');
  }
  if (SALES.test(v.desc || '')) { penalty += 20; negs.push('简介导流'); }

  const texts = comments.map((c) => c.text).join(' ');
  const negHit = (texts.match(NEG_COMMENT) || []).length;
  const posHit = (texts.match(POS_COMMENT) || []).length;
  if (negHit >= 2) { penalty += 15; negs.push(`评论差评 ×${negHit}`); }

  if (v.duration < 60) { penalty += 20; negs.push('不足 1 分钟'); }
  if (v.duration > 7200) { penalty += 15; negs.push('超长（>2 小时）'); }

  // 正分（0-1）
  const I = Math.min(1, Math.sqrt(rate / 0.12));        // 12% 互动率 = 满分
  const F = Math.min(1, Math.sqrt(favRate / 0.05));     // 5% 收藏率 = 满分
  const commentN = comments.length ? Math.min(1, (posHit * 0.6 + 0.2) / 1.4) : 0.5;

  let T = 0.7;
  if (v.title.length >= 14 && /[\u4e00-\u9fa5]{4,}/.test(v.title)) T += 0.08;  // 标题具体、不是纯口号
  if (/原理|为什么|怎么|本质|拆解|全流程|一口气|详解/.test(v.title)) T += 0.1;

  let total = 100 * (0.45 * I + 0.25 * F + 0.15 * commentN + 0.15 * T) - penalty;

  if (I > 0.75) reasons.push(`互动率 ${(rate * 100).toFixed(1)}%`);
  if (F > 0.5) reasons.push(`收藏率 ${(favRate * 100).toFixed(1)}%`);
  if (posHit) reasons.push('评论正向');

  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    rate: +(rate * 100).toFixed(2),
    favRate: +(favRate * 100).toFixed(2),
    reasons,
    negatives: negs,
    reject: penalty >= 25,
  };
}
