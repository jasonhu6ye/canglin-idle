import { WORLD_SKILL } from '../../src/core/bestiary';
import { ACTIONS, buffText, ITEMS, MONSTERS, SKILLS } from '../../src/core/data';
import { QUALITY_COLOR, QUALITY_NAME, qualityOdds } from '../../src/core/quality';
import type { SkillId } from '../../src/core/types';
import { paintProp } from '../../src/game/art';
import { paintDgFloor, keyIconUrl, enhStoneIconUrl } from '../../src/game/dungeonArt';
import { dgBannerUrl, dgBossUrl, dgChestsUrl, dgGateUrl, dgMapUrl, dgPartyUrl } from '../../src/game/dungeonPoster';
import { equipIconUrl } from '../../src/game/equipArt';
import { paintCrop } from '../../src/game/fxArt';
import { OUTFITS } from '../../src/game/hero';
import { paintFoal, paintRanch } from '../../src/game/horseArt';
import { drawMonsterFrame, monsterFrameSize } from '../../src/game/monsterArt';
import { phash } from '../../src/game/pix';
import { paintResNode } from '../../src/game/resArt';
import { iconUrl, itemImageUrl, SKILL_ICON } from '../../src/ui/icons';
import { canvas, glowAt, hero, rider, scene, sparkles, stand, tile } from './scene';

/*
 * 宣传长图·详细版（10-27 用户：继续设计更精美、更详细的宣传海报）。
 * /scripts/poster/promo.html 中文，?lang=en 英文（Sword and Spells，游戏里的名字也跟着变英文）。
 * 宽 1080，Playwright 整页截图。实机截图在 shots/（用 scratchpad 里的 cap2 脚本从游戏本体截的，白天、满级存档）。
 */

const EN = new URLSearchParams(location.search).get('lang') === 'en';
document.body.classList.toggle('en', EN);
const L = (zh: string, en: string) => (EN ? en : zh);
const LANG = EN ? 'en' : 'zh';

function img(c: HTMLCanvasElement | string, k: number, w?: number, h?: number) {
  const el = document.createElement('img');
  if (typeof c === 'string') { el.src = c; if (w) el.style.width = `${w * k}px`; if (h) el.style.height = `${h * k}px`; }
  else { el.src = c.toDataURL(); el.style.width = `${c.width * k}px`; el.style.height = `${c.height * k}px`; }
  return el.outerHTML;
}
const icon = (id: string) => itemImageUrl(id) ?? '';
const name = (id: string) => ITEMS[id]?.baseName ?? ITEMS[id]?.name ?? id;

// ---------- 装饰：像素花边框、分隔花纹、底纹 ----------
/** 9 宫格边框：外黑线、金边、内暗线，四角一颗宝石；k 倍放大后给 border-image 用 */
function frame(gold: string, gem: string, k: number) {
  const N = 10;
  const { c, ctx } = canvas(N * k, N * k);
  const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x * k, y * k, k, k); };
  for (let i = 0; i < N; i++) for (const [a, b] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) px(a, b, '#120804');
  for (let i = 1; i < N - 1; i++) for (const [a, b] of [[i, 1], [i, N - 2], [1, i], [N - 2, i]]) px(a, b, gold);
  for (let i = 2; i < N - 2; i++) for (const [a, b] of [[i, 2], [i, N - 3], [2, i], [N - 3, i]]) px(a, b, '#6a3c12');
  for (let i = 3; i < N - 3; i++) for (const [a, b] of [[i, 3], [i, N - 4], [3, i], [N - 4, i]]) px(a, b, '#140c18');
  for (const [cx, cy] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) px(cx + x, cy + y, (x === 0 || y === 0 || x === 3 || y === 3) ? '#120804' : gold);
    px(cx + 1, cy + 1, gem); px(cx + 2, cy + 1, '#ffffff'); px(cx + 1, cy + 2, gem); px(cx + 2, cy + 2, gem);
  }
  return c.toDataURL();
}
document.documentElement.style.setProperty('--frame', `url(${frame('#ffd25a', '#e84a3a', 3)})`);
document.documentElement.style.setProperty('--frame2', `url(${frame('#9a8ad8', '#5ad0ff', 3)})`);

/** 标题下面的分隔花纹：一道金线，中间一颗菱形，两头小钻 */
function ornament() {
  const { c, ctx } = canvas(140, 9);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(8, 4, 124, 1);
  ctx.fillStyle = '#7a5a20';
  ctx.fillRect(8, 5, 124, 1);
  const dia = (cx: number, r: number, col: string) => { ctx.fillStyle = col; for (let d = -r; d <= r; d++) ctx.fillRect(cx - (r - Math.abs(d)), 4 + d, (r - Math.abs(d)) * 2 + 1, 1); };
  dia(70, 4, '#2a1006'); dia(70, 3, '#ffd25a'); ctx.fillStyle = '#fff'; ctx.fillRect(69, 2, 1, 1);
  dia(4, 2, '#ffd25a'); dia(136, 2, '#ffd25a'); dia(52, 1, '#ffd25a'); dia(88, 1, '#ffd25a');
  return img(c, 4);
}
/** 每个分区的底纹：游戏里的地砖，压得很暗 */
function texture(draw: (ctx: CanvasRenderingContext2D) => void, dark = 0.84) {
  const { c, ctx } = canvas(32, 32);
  draw(ctx);
  ctx.fillStyle = `rgba(8,10,24,${dark})`;
  ctx.fillRect(0, 0, 32, 32);
  return `background-image:url(${c.toDataURL()});background-size:96px 96px`;
}
const groundBg = (g: Parameters<typeof tile>[1], dark?: number) => texture((ctx) => { for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) tile(ctx, g, Math.floor(phash(x, y, 1) * 4), x, y); }, dark);
const caveBg = (t: Parameters<typeof paintDgFloor>[0]) => texture((ctx) => { for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) ctx.drawImage(paintDgFloor(t, Math.floor(phash(x, y, 2) * 4)), x, y); }, 0.8);

function head(eyebrow: string, title: string) {
  return `<div class="eyebrow">${eyebrow}</div><h2>${title}</h2><div class="orn">${ornament()}</div>`;
}
const sec = (bg: string, body: string) => `<section style="${bg}">${body}</section>`;
const shot = (n: string, cap: string) => `<div class="fr2" style="padding:0">${`<img class="shot" src="./shots/${LANG}-${n}.jpg">`}</div><div class="cap">${cap}</div>`;

// ---------- 技能小图 ----------
type Ground = Parameters<typeof tile>[1];
function vignette(ground: Ground, draw: (ctx: CanvasRenderingContext2D) => void, water = false) {
  const { c, ctx } = canvas(72, 54);
  for (let y = 0; y < 54; y += 16) for (let x = 0; x < 72; x += 16) tile(ctx, ground, Math.floor(phash(x, y, 2) * 4), x, y);
  if (water) for (let y = 0; y < 54; y += 16) for (let x = 48; x < 72; x += 16) tile(ctx, 'water', Math.floor(phash(x, y, 4) * 4), x, y);
  draw(ctx);
  return c;
}
const S = (k: SkillId) => SKILLS[k].name;
const VIGNETTES: [string, string, HTMLCanvasElement][] = [
  [S('mining'), L('石头到精金 8 阶矿', '8 ore tiers'), vignette('gravel', (x) => { stand(x, paintResNode('ore', 5), 48, 44); hero(x, 0, 'work-mine', 3, 24, 48); })],
  [S('woodcutting'), L('原木到白木', 'Plain to white logs'), vignette('grass', (x) => { stand(x, paintResNode('log', 2), 46, 46); hero(x, 1, 'work-chop', 2, 24, 48); })],
  [S('fishing'), L('下雨天钓得更快', 'Faster in the rain'), vignette('grass', (x) => hero(x, 2, 'work-fish', 6, 30, 46), true)],
  [S('farming'), L('四块田自动补种', 'Auto-replant fields'), vignette('farm', (x) => { stand(x, paintCrop('#e0b040', 'grain', 3), 52, 40); stand(x, paintCrop('#d04a3a', 'veg', 3), 60, 50); hero(x, 3, 'work-farm', 2, 26, 48); })],
  [S('cooking'), L('料理带限时增益', 'Dishes give buffs'), vignette('cobble', (x) => { glowAt(x, 50, 40, 14, 'rgba(255,150,60,0.6)'); stand(x, paintProp('ember'), 50, 46); hero(x, 4, 'work-craft', 2, 26, 48); })],
  [S('smithing'), L('锻造全套装备', 'Forge every piece'), vignette('cobble', (x) => { stand(x, paintProp('barrel'), 56, 44); hero(x, 0, 'work-craft', 4, 30, 48); })],
  [S('hunting'), L('剥兽皮做皮甲', 'Hides for leather'), vignette('darkgrass', (x) => { stand(x, paintResNode('hide', 3), 46, 46); hero(x, 1, 'work-skin', 2, 26, 48); })],
  [L('战斗', 'Combat'), L('近战 远程 魔法', 'Melee, ranged, magic'), vignette('darkgrass', (x) => { const m = MONSTERS.dire_bear; const sz = monsterFrameSize(m); x.drawImage(drawMonsterFrame(m, 'attack', 1).canvas(), 0, 0, sz, sz, 30, 50 - sz, sz, sz); hero(x, 3, 'fight-sword-ready', 1, 22, 50); })],
];
const GROUPS: [string, string, SkillId[]][] = [
  [L('采集', 'Gathering'), '#5aa04a', ['mining', 'woodcutting', 'fishing', 'gathering', 'farming', 'hunting', 'thieving', 'husbandry']],
  [L('生产', 'Production'), '#c89040', ['cooking', 'smithing', 'fletching', 'herblore', 'crafting', 'enhancing']],
  [L('战斗', 'Combat'), '#c04a4a', ['melee', 'ranged', 'magic', 'defence', 'hitpoints']],
];

// ---------- 资源和装备 ----------
const RES_ROWS: [string, string[]][] = [
  [L('矿石', 'Ores'), ['stone', 'copper_ore', 'tin_ore', 'iron_ore', 'titanium_ore', 'rune_ore', 'meteor_ore', 'adamant_ore']],
  [L('木头', 'Logs'), ['plain_log', 'birch_log', 'pine_log', 'oak_log', 'cedar_log', 'bloodoak_log', 'ashbark_log', 'white_log']],
  [L('棉花', 'Cotton'), Array.from({ length: 8 }, (_, i) => `cotton_${i + 1}`)],
  [L('兽皮', 'Hides'), Array.from({ length: 8 }, (_, i) => `hide_${i + 1}`)],
];
const BARS = Object.values(ACTIONS).filter((a) => a.id.startsWith('smelt_') && a.kind === 'skill').sort((a, b) => a.level - b.level).slice(0, 8).map((a) => (a.kind === 'skill' ? a.outputs[0].item : ''));
const iconRow = (lab: string, ids: string[]) => `<div class="iconrow"><div class="lab">${lab}</div>${ids.map((id, t) => `<div class="ic"><img src="${icon(id)}"><span>T${t + 1}</span></div>`).join('')}</div>`;
function gearRow(key: string) {
  return Array.from({ length: 8 }, (_, t) => {
    const url = equipIconUrl(key, t);
    return url ? `<div style="background:#0e1126;border:3px solid ${QUALITY_COLOR[Math.min(5, Math.floor(t * 0.75))]};padding:6px;display:flex;justify-content:center">${img(url, 3, 24, 24)}</div>` : '';
  }).join('');
}
const smithSword = ACTIONS.smith_iron_sword;
const FLOW = smithSword && smithSword.kind === 'skill' ? ['iron_ore', 'iron_bar', smithSword.outputs[0].item] : [];

// ---------- 鱼和料理 ----------
const FISH = Object.values(ITEMS).filter((i) => i.id.startsWith('raw_') && i.category === 'resource');
const pickN = <T,>(a: T[], n: number) => Array.from({ length: Math.min(n, a.length) }, (_, i) => a[Math.floor(((i + 0.5) / n) * a.length)]);
const DISHES = Object.values(ITEMS).filter((i) => i.category === 'food' && i.buff);

// ---------- 怪物 ----------
function trim(src: HTMLCanvasElement) {
  const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    if (d[(y * src.width + x) * 4 + 3] < 20) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const { c, ctx } = canvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx.drawImage(src, -x0, -y0);
  return c;
}
const ALL_MON = Object.values(MONSTERS).filter((m) => !m.world && !m.event && !m.dungeon).sort((a, b) => a.level - b.level);
const nMon = Object.values(MONSTERS).filter((m) => !m.dungeon && !m.event).length;
function monsterTile(id: string) {
  const m = MONSTERS[id];
  const c = trim(drawMonsterFrame(m, 'idle', 0).canvas());
  const k = Math.max(1, Math.min(4, Math.floor(Math.min(130 / c.width, 86 / c.height))));
  const rank = m.rank === 'boss' ? `<span style="color:#ff6a4a">${L('首领', 'Boss')}</span> · ` : m.rank === 'elite' ? `<span style="color:#ffb030">${L('精英', 'Elite')}</span> · ` : '';
  return `<div class="tile fr2" style="padding:4px 2px 8px"><div style="height:96px;display:flex;align-items:center;justify-content:center">${img(c, k)}</div><div class="d" style="color:#f2ead6;font-size:18px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</div><div class="d" style="font-size:16px;margin:2px 0 0">${rank}Lv ${m.level}</div></div>`;
}
const WORLD = ['wb_flame_dragon', 'wb_soul_tree', 'wb_frost_colossus', 'wb_thunder_roc', 'wb_void_eye'];
function worldBoss(id: string) {
  const { c, ctx } = canvas(104, 100);
  const m = MONSTERS[id];
  glowAt(ctx, 52, 56, 50, `${m.art.accent}55`);
  sparkles(ctx, 0, 0, 104, 100, [m.art.accent, '#ffffff'], 16, id.length);
  ctx.drawImage(drawMonsterFrame(m, 'skill', 3).canvas(), 4, 2);
  return c;
}

// ---------- 坐骑、外观 ----------
function mountCard(mount: 'wolf' | number, o: number, i: number) {
  const { c, ctx } = canvas(70, 52);
  glowAt(ctx, 35, 34, 30, 'rgba(255,210,90,0.16)');
  rider(ctx, o, mount, i, 35, 50, 1);
  return c;
}
function outfit(o: number) {
  const { c, ctx } = canvas(32, 34);
  hero(ctx, o, 'idle-down', 0, 16, 33);
  return c;
}
function mirror(src: HTMLCanvasElement) {
  const { c, ctx } = canvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

const T1 = L('苍岭放置', 'Sword and Spells');

// ---------- 版面 ----------
const header = () => `<div class="hero">${img(scene(360, 380, false), 3)}
  <div class="stamp">${L('计划 11 月', 'Coming')}<small>${L('登陆 Steam', 'to Steam · Nov')}</small></div>
  <div class="title"><div class="t1">${T1}</div>
  <div class="t2">MMORPG IDLE</div>
  <div class="t3">${L('一个关掉游戏也在运转的像素大世界', 'A pixel world that keeps running even when you log off')}</div></div></div>`;

const intro = () => sec(groundBg('darkgrass'), `${head('ABOUT', L('这是一款什么游戏？', 'What kind of game is this?'))}
  <div class="lead">${L(
    `《苍岭放置》是一款 <b>MMORPG Idle</b>（放置类大型多人在线角色扮演）游戏。给角色安排好任务——挖矿、伐木、钓鱼、打怪、锻造——他会<b>自己走过去开工</b>，排好的任务一件接一件做，<b>关掉游戏也照样在干</b>，下次上线直接收获。`,
    `<b>Sword and Spells</b> is an <b>MMORPG Idle</b> game. Give your hero a job — mining, woodcutting, fishing, fighting, smithing — and they <b>walk there and get to work on their own</b>, going down your task queue one job after another. <b>They keep going after you close the game</b>, so there is always loot waiting when you return.`)}</div>
  <div class="lead">${L(
    `和一般的放置游戏不同，这里有一张<b>真正可以走的大地图</b>：你能看到其他玩家在身边挖矿、骑马跑过，可以<b>组队下副本、加入公会、聊天、交易</b>。电脑和手机都能玩，手机上点一下地面就能走。`,
    `Unlike most idle games, there is a <b>real open world to walk around</b>. Other players mine right next to you and gallop past on horseback, and you can <b>party up for dungeons, join a guild, chat and trade</b>. It plays on both PC and phone — on mobile, just tap the ground to walk.`)}</div>
  <div class="grid g3">
    ${[[L('离线也在成长', 'Offline progress'), L('下线后继续干活、打怪、升级，回来一次领完', 'Keeps working, fighting and leveling while you are away')], [L('和真人同屏', 'Real players'), L('组队、公会、好友、排行榜、交易', 'Parties, guilds, friends, ranks, trading')], [L('一切都能自己做', 'Craft everything'), L('从一块矿石到一身神话装备', 'From one ore to a full set of mythic gear')]]
      .map(([k, v]) => `<div class="fr pad" style="text-align:center"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
  </div>
  <div class="stats">
    ${[['19', L('项技能', 'skills')], [`${nMon}+`, L('种怪物', 'monsters')], ['10', L('座城镇', 'towns')], ['12080²', L('格大地图', 'tile world')]].map(([b, s]) => `<div class="fr2"><b class="hl">${b}</b><span>${s}</span></div>`).join('')}
  </div>`);

const gallery = () => sec(groundBg('basalt'), `${head('GAMEPLAY', L('实机画面', 'In-game screenshots'))}
  ${shot('boss', L('世界首领「炎煌古龙」：血条、伤害数字、闪避和失误都会飘出来', 'World boss: the Infernal Elder Dragon, with live health bars and floating damage'))}
  <div class="grid g2" style="margin-top:26px"><div>${shot('mine', L('高阶矿区：精金矿', 'High-tier mining: Adamant'))}</div><div>${shot('fish', L('极光冰湖钓鲟鱼', 'Sturgeon fishing at Aurora Lake'))}</div></div>
  <div style="margin-top:26px">${shot('map', L('世界地图：城镇、资源点、怪物区、石碑和洞窟一目了然', 'World map: towns, resources, monster zones, waystones and caves'))}</div>
  <div class="grid g2" style="margin-top:26px"><div>${shot('pchar', L('角色属性：每一项加成都写清楚来源', 'Character sheet: every bonus shows where it comes from'))}</div><div>${shot('pskills', L('19 项技能，各自升级', '19 skills, each leveled on its own'))}</div></div>
  <div class="grid" style="grid-template-columns:1fr 1.15fr;gap:22px;margin-top:26px;align-items:center"><div class="fr pad"><div class="k">${L('仓库不限容量', 'An unlimited bank')}</div><div class="v">${L('东西多了按类别整理：资源、材料、食物、战利品、装饰。背包装满了，角色会自己走回仓库存好，再走回去接着干——离线也一样。', 'Sorted by category: resources, materials, food, trophies and decor. When the bag fills up, your hero walks back to the bank, stores everything and returns to work — even while offline.')}</div></div><div>${shot('pbank', '')}</div></div>`);

const skills = () => sec(groundBg('grass'), `${head('SKILLS', L('19 项技能 · 等级无上限', '19 skills · No level cap'))}
  <div class="lead">${L('前 50 级升得飞快（10 级大约 6 分钟），越往后越考验坚持：95 级才能碰 T8，140 级要几千小时。每升一级干活快一点，工具越好、等级越高，产出也越多。', 'The first 50 levels fly by (level 10 takes about six minutes); after that it is a long road — Tier 8 unlocks at level 95, and level 140 takes thousands of hours. Every level makes you a little faster, and better tools and higher levels bring bigger yields.')}</div>
  ${GROUPS.map(([g, col, ks]) => `<div class="row" style="margin:14px 0 8px"><span style="width:14px;height:30px;background:${col}"></span><span class="k" style="margin:0;font-size:26px">${g}</span></div>
    <div class="chips">${ks.map((k) => `<span class="chip" style="border-color:${col}"><img src="${iconUrl(...SKILL_ICON[k])}">${S(k)}</span>`).join('')}</div>`).join('')}
  <div class="grid g4" style="margin-top:30px">${VIGNETTES.map(([n, d, c]) => `<div class="tile fr2">${img(c, 3)}<div class="n">${n}</div><div class="d">${d}</div></div>`).join('')}</div>`);

const crafting = () => sec(groundBg('cobble'), `${head('CRAFTING', L('从一块矿石到一身神装', 'From a single ore to a full set of gear'))}
  <div class="lead">${L('资源分 T1 到 T8 八个阶级，每一阶都有自己的地图点位和图标。两份原料炼成锭、板材、皮革、布料，再做成武器、护甲和工具。', 'Every resource comes in eight tiers, each with its own spots on the map. Refine two raw materials into a bar, plank, leather or cloth, then turn those into weapons, armor and tools.')}</div>
  <div class="fr pad">${RES_ROWS.map(([l, ids]) => iconRow(l, ids)).join('')}${BARS.length === 8 ? iconRow(L('锭', 'Bars'), BARS) : ''}</div>
  ${FLOW.length ? `<div class="flow">${FLOW.map((id, i) => `${i ? '<span class="ar">➜</span>' : ''}<div class="ic"><img src="${icon(id)}"><span>${name(id)}${i === 0 ? ' ×2' : ''}</span></div>`).join('')}</div>` : ''}
  <div class="lead" style="margin-top:34px">${L('装备从 T1 木制一路做到 T8 精金，<b>每一阶造型都不一样</b>，不是简单换个颜色：', 'Gear goes from Tier 1 wood to Tier 8 adamant, and <b>every tier has its own design</b> — not just a new color:')}</div>
  <div class="fr pad"><div class="grid g8" style="gap:10px">${gearRow('sword')}${gearRow('longbow')}${gearRow('staff')}${gearRow('greatshield')}${gearRow('pickaxe')}</div></div>
  <div class="lead" style="margin-top:34px">${L('每次制作都会随机出<b>品质</b>，品质越高属性越强（神话属性 ×1.8）：', 'Every craft rolls a random <b>quality</b> — the higher it is, the stronger the item (Mythic is ×1.8):')}</div>
  <div class="grid g3" style="gap:12px">${QUALITY_NAME.map((n, i) => `<div class="fr2" style="text-align:center;padding:8px"><div style="font-size:28px;font-weight:bold;color:${QUALITY_COLOR[i]}">${n}</div><div class="v">${L('T1 出货率', 'T1 chance')} ${qualityOdds(0)[i]}%</div></div>`).join('')}</div>`);

const MENU = pickN(DISHES.filter((d) => d.buff), 12);
const food = () => sec(groundBg('beach'), `${head('FISHING & COOKING', L('鱼和料理', 'Fishing & cooking'))}
  <div class="lead">${L(`湖泊、海岸、熔池、冰湖里一共有 ${FISH.length} 种鱼，下雨天钓得更快。烹饪能做出几十道料理，有的回血，有的带<b>限时增益</b>。打怪时装备栏有单独的食物栏和药水栏，血少了自动吃。`, `${FISH.length} kinds of fish live in lakes, coasts, lava pools and frozen lakes, and they bite faster in the rain. Cooking turns your catch into dozens of dishes: some heal, others grant <b>timed buffs</b>. In combat you get dedicated food and potion slots, and your hero eats automatically when health runs low.`)}</div>
  <div class="fr" style="padding:22px 30px">
    <div style="text-align:center;font-size:34px;font-weight:bold;color:#ffd25a;letter-spacing:6px">${L('— 今日菜单 —', '— TODAY’S MENU —')}</div>
    <div class="grid g2" style="gap:6px 30px;margin-top:14px">${MENU.map((d) => `<div class="row" style="border-bottom:2px dashed #3a3466;padding:8px 0"><img src="${icon(d.id)}" style="width:48px;height:48px"><div style="flex:1"><div style="font-size:24px;font-weight:bold">${d.name}</div><div style="font-size:19px;color:#9ad8a0">${d.buff ? buffText(d.buff) : ''}</div></div>${d.heals ? `<div style="font-size:20px;color:#ff8a8a">❤ ${d.heals}</div>` : ''}</div>`).join('')}</div>
  </div>`);

const combat = () => sec(groundBg('ash'), `${head('MONSTERS', L(`${nMon}+ 种怪物`, `${nMon}+ monsters`))}
  <div class="lead">${L('每种怪物都有自己的外形、特性和掉落。怪物页会告诉你打一只要几秒、会掉多少血、一小时能打多少只，怪物图鉴会记下你打过的每一只。', 'Every monster has its own look, traits and loot. The monster page tells you how long each kill takes, how much health you will lose and how many you can kill per hour, and the bestiary records every one you defeat.')}</div>
  <div class="grid g6" style="gap:10px">${pickN(ALL_MON, 24).map((m) => monsterTile(m.id)).join('')}</div>
  <div class="mech" style="margin-top:30px">
    ${[[L('暴击与套装', 'Crits & armor sets'), L('5% 暴击 ×1.5 伤害；板甲每件减伤、皮甲加闪避、布甲加暴击', '5% crits for ×1.5; plate reduces damage, leather adds dodge, cloth adds crit')],
      [L('精英和首领', 'Elites & bosses'), L('精英每 6 下一记重击；首领每 5 下毁灭一击，残血 30% 进入狂怒', 'Elites land a heavy blow every 6 hits; bosses unleash a devastating strike every 5 and enrage at 30% health')],
      [L('武器射程', 'Weapon range'), L('近战贴身打，长弓站在 4 格外射；弓、弩、法杖各有站位', 'Melee fights up close, longbows shoot from 4 tiles away; bows, crossbows and staves each have their spot')],
      [L('战利品', 'Loot'), L('福袋、宝箱、首领宝箱，每个首领还有专属战利品和战旗', 'Lucky bags, chests, boss chests, plus a unique trophy and banner for every boss')]]
      .map(([k, v]) => `<div class="fr pad"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
  </div>`);

const bosses = () => sec(caveBg('lava'), `${head('WORLD BOSSES', L('五位世界首领', 'Five world bosses'))}
  <div class="lead">${L('它们盘踞在大陆最危险的五个角落，血量是普通首领的 4 倍，每 4 下放一次专属大招（伤害 ×2.6），打赢必掉宝库。', 'They lurk in the five most dangerous corners of the continent with four times the health of a normal boss. Every fourth attack is a signature move dealing ×2.6 damage, and every victory drops a treasure vault.')}</div>
  ${WORLD.map((id, i) => { const m = MONSTERS[id]; const sk = WORLD_SKILL[id]; return `<div class="fr" style="display:flex;gap:22px;align-items:center;padding:14px 22px;margin-bottom:16px;${i % 2 ? 'flex-direction:row-reverse;text-align:right' : ''}">${img(worldBoss(id), 2.4)}<div style="flex:1"><div class="k" style="font-size:36px">${m.name} <span style="font-size:24px;color:#b9c0d8">Lv ${m.level}</span></div><div class="v" style="font-size:25px;color:#ffb070;margin-bottom:6px">${L('大招', 'Signature')}：${sk?.name ?? ''}</div><div class="v" style="font-size:22px">${sk?.desc ?? ''}</div></div></div>`; }).join('')}`);

const dungeons = () => sec(caveBg('crystal'), `${head('DUNGEONS', L('地下副本：绿洞 · 蓝洞', 'Dungeons: Green & Blue Caves'))}
  <div class="lead">${L('用钥匙在身边打开一个 30 分钟的洞口，钻进去一层层往下打。<b>每次地形、路线和怪物都随机</b>；清光所有怪物，最后一层首领守着的宝箱才归你。绿洞可以单刷，蓝洞必须组队，开箱的一瞬间就定好每个人分到什么。', 'Use a key to open a 30-minute cave portal right next to you and fight your way down floor by floor. <b>Every run has a random layout, route and lineup</b>; clear every monster and the boss-guarded chest on the last floor is yours. Green caves can be soloed; blue caves need a party, and everyone’s share is decided the moment the chest opens.')}</div>
  <div class="fr2" style="padding:0">${img(dgBannerUrl(), 4, 240, 100)}</div>
  <div class="grid g4" style="margin-top:16px;gap:12px">${[dgGateUrl(), dgMapUrl(), dgBossUrl(), dgChestsUrl()].map((u) => `<div class="fr2" style="padding:0">${img(u, 1.83, 120, 90)}</div>`).join('')}</div>
  <div class="grid g2" style="margin-top:22px">
    <div class="fr pad"><div class="k">${L('钥匙', 'Keys')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${[4, 5, 6, 7, 8].map((t) => `<img src="${keyIconUrl('green', t)}" style="width:60px;height:60px">`).join('')}${[4, 5, 6, 7, 8].map((t) => `<img src="${keyIconUrl('blue', t)}" style="width:60px;height:60px">`).join('')}</div><div class="v">${L('T4 到 T8，城里的副本商人有卖', 'Tier 4 to 8, sold by the dungeon merchant in town')}</div></div>
    <div class="fr pad"><div class="k">${L('强化石', 'Enhancement stones')}</div><div class="row" style="gap:6px;flex-wrap:wrap">${[0, 1, 2, 3, 4, 5, 6, 7].map((t) => `<img src="${enhStoneIconUrl(t, false)}" style="width:56px;height:56px">`).join('')}</div><div class="v">${L('副本宝箱里掉，碎片 10 合 1', 'Drop from dungeon chests; 10 shards make one stone')}</div></div>
  </div>
  <div style="display:flex;justify-content:center;margin-top:22px"><div class="fr2" style="padding:0">${img(dgPartyUrl(), 6, 120, 90)}</div></div>`);

const mounts = () => sec(groundBg('meadow'), `${head('MOUNTS & OUTFITS', L('坐骑 · 畜牧 · 外观', 'Mounts, ranching & outfits'))}
  <div class="lead">${L('骑上狼或马，跑图快一倍多。野外的野马会掉小马崽，带回城里的<b>畜牧站</b>养大，每匹马的资质（50 到 200）和毛色都不一样，资质越高跑得越快。', 'Ride a wolf or a horse to cross the map more than twice as fast. Wild horses drop foals you can raise at the <b>ranch</b> in town, and every horse rolls its own aptitude (50 to 200) and coat — the higher the aptitude, the faster it runs.')}</div>
  <div class="grid g3">${[mountCard('wolf', 0, 5), mountCard(0, 1, 10), mountCard(1, 2, 14), mountCard(2, 4, 20), mountCard(3, 3, 26), mountCard('wolf', 5, 18)].map((c) => `<div class="fr2" style="padding:4px">${img(c, 4)}</div>`).join('')}</div>
  <div class="fr" style="display:flex;gap:24px;align-items:center;margin-top:22px;padding:14px">${img(paintRanch(), 3)}<div><div class="k">${L('畜牧站', 'The ranch')}</div><div class="v">${L('三个马栏，小马崽养 1 小时左右长大，养殖等级越高长得越快。', 'Three pens; a foal grows up in about an hour, faster as your Husbandry level rises.')}</div><div style="margin-top:10px">${img(paintFoal(0, 3, 32), 3)}</div></div></div>
  <div class="lead" style="margin-top:34px">${L('衣橱里有 10 套外观，包括南瓜提灯人、白发魔骑、骸骨术士这些限定款，有的还带粒子特效：', 'The wardrobe holds 10 outfits, including limited ones like the Pumpkin Lantern, the Pale Knight and the Bone Sorcerer, some with particle effects:')}</div>
  <div class="grid g5">${OUTFITS.slice(0, 10).map((o, i) => `<div class="tile fr2" style="padding:6px">${img(outfit(i), 5)}<div class="d" style="font-size:18px;margin:0">${o.name}</div></div>`).join('')}</div>`);

const home = () => sec(groundBg('grass'), `${head('HOME & GUILD', L('家园岛屿 · 公会 · 组队', 'Home island, guilds & parties'))}
  <div class="lead">${L('从城里的传送门去到自己的小岛，<b>自由摆放近百种墙、地板、家具和制作台</b>，岛还能扩建两次。岛上有制作台就能直接干活，不用跑回城。', 'Step through the portal in town to your own island. <b>Build freely with nearly a hundred walls, floors, furniture pieces and crafting stations</b>, and expand the island twice. With stations at home you can craft right there instead of running back to town.')}</div>
  <div class="fr2" style="padding:0"><img class="shot" src="./maps/home.jpg"></div>
  <div class="mech" style="margin-top:26px">
    ${[[L('公会', 'Guilds'), L('公会等级和加成、每日任务、贡献，公会仓库在哪都能存取', 'Guild levels and perks, daily tasks, contribution, and a guild bank you can reach from anywhere')],
      [L('组队', 'Parties'), L('每多一个队友经验 +5%（最多 25%），队长一声召集，队友自动赶过来', '+5% XP per party member (up to 25%); when the leader rallies, everyone heads over automatically')],
      [L('好友与交易', 'Friends & trading'), L('8 位数字 ID 加好友，双方确认才成交的安全交易', 'Add friends by their 8-digit ID and trade safely — nothing changes hands until both confirm')],
      [L('聊天与排行榜', 'Chat & leaderboards'), L('世界、公会、队伍、私聊频道，按技能分的等级排行榜', 'World, guild, party and private chat, plus leaderboards for every skill')]]
      .map(([k, v]) => `<div class="fr pad"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
  </div>`);

const STEPS: [string, string, string, string, string[]][] = [
  [L('第一版：一眼就能看完的小镇', 'Version 1: a map you could see at a glance'), '1080 × 1080',
    L('最早的原型。城镇在正中间，几条土路通向冰霜之巅、红木林、熔岩巢穴、深海码头……十几个地点挤在一张图上。能玩，但走两步就到头了。', 'The first prototype: a town in the middle and a few dirt roads to a dozen spots — Frost Peak, the Redwoods, the Lava Den, the Deep Sea Dock... It worked, but you hit the edge after a few steps.'), 'map1.jpg',
    [L('1 座城', '1 town'), L('十几个地点', 'about a dozen spots')]],
  [L('第二版：九大群系', 'Version 2: nine biomes'), '2188 × 2188',
    L('第一次大改。地图分成九块：冰封雪原、巨木森林、灰岩高地、金沙海岸、熔岩荒地、深渊裂谷、亡者沼泽、幽深林地，围着中间安全的城镇。加上河流、湖泊和码头，世界第一次有了「地理」。', 'The first big rework. The map split into nine regions — Frostbound Wastes, Giantwood Forest, Greystone Highlands, Goldsand Coast, Lava Barrens, Abyssal Rift, Deadman\'s Marsh and Shadowdeep Woods — around a safe town. Rivers, lakes and docks gave the world real geography.'), 'map2.jpg',
    [L('9 个群系', '9 biomes'), L('河流和湖泊', 'rivers & lakes')]],
  [L('第三版：给每块土地定规矩', 'Version 3: a purpose for every region'), L('区域规划', 'Zone planning'),
    L('给每个群系划出采集点和怪物区，标上等级区间（Lv1 到 Lv80）。从城镇出发一圈圈往外走，越远越危险，奖励也越好。', 'Every biome got its own gathering spots and monster zones with level ranges from Lv1 to Lv80. Head out from town ring by ring: the farther you go, the more dangerous it gets — and the better the rewards.'), 'map3.jpg',
    [L('Lv1 → Lv80', 'Lv1 → Lv80'), L('越远越危险', 'danger grows outward')]],
  [L('第四版：世界往外长了一圈', 'Version 4: a whole new ring'), '5088 → 8848',
    L('原来的世界整个放到正中，外面再围上 8 个新区域：枫红秋林、云岭高山、赤岩峡谷、珊瑚群岛、流沙大漠、晶簇荒原、蛮荒雨林、金穗草原。第二座城「落霞城」出现了，还有千岛湖、星渊祭坛、菌丝深谷这些带名字的地点，每处都有新首领。', 'The old world moved to the center and eight new regions wrapped around it: Crimson Maple Woods, Cloudridge Peaks, Redrock Canyon, Coral Isles, Shifting Sands, Crystal Wastes, Wildheart Jungle and Goldenear Prairie. A second city, Duskhaven, appeared, along with landmarks like Thousand Isle Lake and the Star Abyss Altar, each with a new boss.'), 'map4.jpg',
    [L('17 个区域', '17 regions'), L('第 2 座城', '2nd city'), L('12 个洞窟', '12 caves')]],
  [L('现在：一整片大陆', 'Today: a whole continent'), '12080 × 12080',
    L('最外圈加上海岸和群岛，新建 8 座城镇：凤麦镇、雪隘堡、岩灯城、珊瑚港、灰烬营地、晶辉要塞、遗忘哨塔、虚辉遗都。5 位世界首领盘踞在大陆边缘。地图面积已经是第一版的 125 倍，骑马跑一趟也要好一阵。', 'Coastlines and islands now ring the edge, with eight new towns: Wheatwind, Snowpass Keep, Lanternrock, Coral Harbor, Ashen Camp, Crystalglow Bastion, Forgotten Watch and Voidlight Ruins. Five world bosses guard the far corners. The map is now 125 times the size of the first version, and even on horseback a trip takes a while.'), 'map5.jpg',
    [L('10 座城镇', '10 towns'), L('5 位世界首领', '5 world bosses'), L('×125 面积', '×125 area')]],
];
const SIZES = [1080, 2188, 5088, 8848, 12080];
const journey = () => sec(groundBg('sand', 0.88), `${head('THE STORY OF THE MAP', L('地图更新心路历程', 'How the map grew'))}
  <div class="lead">${L('地图是这款游戏改得最多的地方。从一张能一眼看完的小图，到现在骑马都要跑好一阵的大陆，前后一共经历了五个版本。', 'The map is the part of the game we reworked the most. It grew from a map you could take in at a glance into a continent that takes a long ride to cross, across five versions.')}</div>
  <div class="fr pad" style="padding-bottom:60px"><div class="grow">${SIZES.map((s) => `<div style="height:${Math.max(6, (s / 12080) ** 2 * 200)}px"><em>${Math.round((s / 1080) ** 2)}×</em><span>${s}²</span></div>`).join('')}</div></div>
  <div class="sub" style="margin:14px 0 46px;text-align:center">${L('每一版的地图面积，以第一版为 1×', 'Map area of each version, relative to the first')}</div>
  <div class="tl">${STEPS.map(([h, sz, p, f, facts], i) => `<div class="step" data-n="${i + 1}"><h3>${h}</h3><div class="size">${sz}</div><div class="lead" style="margin:0">${p}</div><div class="facts">${facts.map((x) => `<span>${x}</span>`).join('')}</div><div class="fr2"><img class="shot" src="./maps/${f}"></div></div>`).join('')}</div>
  <div class="lead">${L('地图还会继续长大：外海的群岛已经画好了，等航海系统做出来，就能开船过去。', 'And it is not done growing. The outer islands are already drawn and waiting for the sailing system, so one day you will sail out to them.')}</div>`);

const ending = () => `<div class="end">${img(mirror(scene(360, 300, false)), 3)}
  <div class="box"><div class="big fr">${L('计划 11 月登陆 Steam', 'Coming to Steam this November')}<small>${L('敬请期待', 'Stay tuned')}</small></div>
  <div class="tag">${T1} · MMORPG Idle</div></div></div>`;

document.getElementById('app')!.innerHTML = header() + intro() + gallery() + skills() + crafting() + food() + combat() + bosses() + dungeons() + mounts() + home() + journey() + ending();
Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))])
  .then(() => { (window as unknown as { posterReady: boolean }).posterReady = true; });
