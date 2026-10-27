import { MONSTERS } from '../../src/core/data';
import { QUALITY_COLOR } from '../../src/core/quality';
import { paintProp } from '../../src/game/art';
import { dgBannerUrl, dgBossUrl, dgChestsUrl, dgGateUrl, dgPartyUrl } from '../../src/game/dungeonPoster';
import { equipIconUrl } from '../../src/game/equipArt';
import { paintCrop } from '../../src/game/fxArt';
import { OUTFITS } from '../../src/game/hero';
import { drawMonsterFrame, monsterFrameSize } from '../../src/game/monsterArt';
import { phash } from '../../src/game/pix';
import { paintResNode } from '../../src/game/resArt';
import { canvas, glowAt, hero, rider, scene, sparkles, stand, tile } from './scene';

/*
 * 宣传长图（朋友圈 / Discord 往下翻的那种，10-27 用户要求）：介绍游戏 + 地图扩图历程，中英两版。
 * /scripts/poster/long.html 中文，?lang=en 英文（英文名 Sword and Spells）。宽 1080，用 Playwright 整页截图。
 */

const EN = new URLSearchParams(location.search).get('lang') === 'en';
document.body.classList.toggle('en', EN);
const L = (zh: string, en: string) => (EN ? en : zh);

/** 小画布放大成 <img>（保持像素感） */
function img(c: HTMLCanvasElement | string, k: number, w?: number, h?: number) {
  const el = document.createElement('img');
  if (typeof c === 'string') { el.src = c; if (w) el.style.width = `${w * k}px`; if (h) el.style.height = `${h * k}px`; }
  else { el.src = c.toDataURL(); el.style.width = `${c.width * k}px`; el.style.height = `${c.height * k}px`; }
  return el.outerHTML;
}

// ---------- 技能小图：一块草地上一个人在干活 ----------
type Ground = Parameters<typeof tile>[1];
function vignette(ground: Ground, draw: (ctx: CanvasRenderingContext2D) => void, water = false) {
  const { c, ctx } = canvas(72, 54);
  for (let y = 0; y < 54; y += 16) for (let x = 0; x < 72; x += 16) tile(ctx, ground, Math.floor(phash(x, y, 2) * 4), x, y);
  if (water) for (let y = 0; y < 54; y += 16) for (let x = 48; x < 72; x += 16) tile(ctx, 'water', Math.floor(phash(x, y, 4) * 4), x, y);
  draw(ctx);
  return c;
}
const SKILLS: [string, string, HTMLCanvasElement][] = [
  [L('采矿', 'Mining'), L('8 阶矿石，石头到精金', '8 ore tiers'), vignette('gravel', (x) => { stand(x, paintResNode('ore', 4), 48, 44); hero(x, 0, 'work-mine', 3, 24, 48); })],
  [L('伐木', 'Woodcutting'), L('原木到白木', 'Logs to Whitewood'), vignette('grass', (x) => { stand(x, paintResNode('log', 2), 46, 46); hero(x, 1, 'work-chop', 2, 24, 48); })],
  [L('钓鱼', 'Fishing'), L('43 种鱼，下雨更好钓', '43 fish, better in rain'), vignette('grass', (x) => hero(x, 2, 'work-fish', 6, 30, 46), true)],
  [L('种植', 'Farming'), L('四块田，作物和种子', 'Crops & seeds'), vignette('farm', (x) => { stand(x, paintCrop('#e0b040', 'grain', 3), 52, 40); stand(x, paintCrop('#d04a3a', 'veg', 3), 60, 50); hero(x, 3, 'work-farm', 2, 26, 48); })],
  [L('烹饪', 'Cooking'), L('40 道料理带增益', '40 dishes with buffs'), vignette('cobble', (x) => { glowAt(x, 50, 40, 14, 'rgba(255,150,60,0.6)'); stand(x, paintProp('ember'), 50, 46); hero(x, 4, 'work-craft', 2, 26, 48); })],
  [L('锻造', 'Smithing'), L('T1 木制到 T8 精金', 'Wood to Adamant gear'), vignette('cobble', (x) => { stand(x, paintProp('barrel'), 56, 44); hero(x, 0, 'work-craft', 4, 30, 48); })],
  [L('狩猎', 'Hunting'), L('剥兽皮做皮甲', 'Hides for leather'), vignette('darkgrass', (x) => { stand(x, paintResNode('hide', 3), 46, 46); hero(x, 1, 'work-skin', 2, 26, 48); })],
  [L('战斗', 'Combat'), L('近战 远程 魔法', 'Melee, ranged, magic'), vignette('darkgrass', (x) => { const m = MONSTERS.dire_bear; const S = monsterFrameSize(m); x.drawImage(drawMonsterFrame(m, 'attack', 1).canvas(), 0, 0, S, S, 30, 50 - S, S, S); hero(x, 3, 'fight-sword-ready', 1, 22, 50); })],
];

// ---------- 装备：三排武器，每阶造型都不一样 ----------
function gearRow(key: string) {
  return Array.from({ length: 8 }, (_, t) => {
    const url = equipIconUrl(key, t);
    return url ? `<div style="background:#10132a;border:3px solid ${QUALITY_COLOR[Math.min(5, Math.floor(t * 0.75))]};padding:4px">${img(url, 3, 24, 24)}</div>` : '';
  }).join('');
}

// ---------- 怪物墙 ----------
/** 裁掉四周透明的边，怪物在格子里才不会显得太小 */
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
function monsterWall() {
  const all = Object.values(MONSTERS).filter((m) => !m.world && !m.event && !m.dungeon);
  const pick = Array.from({ length: 24 }, (_, i) => all[Math.floor(((i + 0.5) / 24) * all.length)]);
  return pick.map((m) => {
    const c = trim(drawMonsterFrame(m, 'idle', 0).canvas());
    const k = Math.max(1, Math.min(5, Math.floor(Math.min(130 / c.width, 100 / c.height))));
    return `<div class="tile" style="padding:8px;display:flex;align-items:center;justify-content:center;height:112px">${img(c, k)}</div>`;
  }).join('');
}
const WORLD: [string, string, string][] = [
  ['wb_flame_dragon', L('炎煌古龙', 'Infernal Elder Dragon'), 'Lv 50'],
  ['wb_soul_tree', L('噬魂魔树', 'Soul-Eater Tree'), 'Lv 70'],
  ['wb_frost_colossus', L('永冬巨像', 'Everwinter Colossus'), 'Lv 90'],
  ['wb_thunder_roc', L('天罚雷鹏', 'Thunderwrath Roc'), 'Lv 110'],
  ['wb_void_eye', L('虚无魔眼', 'Void Eye'), 'Lv 135'],
];
function worldBoss(id: string) {
  const { c, ctx } = canvas(104, 100);
  const m = MONSTERS[id];
  glowAt(ctx, 52, 56, 50, `${m.art.accent}55`);
  sparkles(ctx, 0, 0, 104, 100, [m.art.accent, '#ffffff'], 16, id.length);
  ctx.drawImage(drawMonsterFrame(m, 'attack', 2).canvas(), 4, 2);
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

// ---------- 版面 ----------
/** 结尾用左右翻过来的场景，和开头不重样 */
function mirror(src: HTMLCanvasElement) {
  const { c, ctx } = canvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}
const nMon = Object.values(MONSTERS).filter((m) => !m.dungeon && !m.event).length;
const T1 = L('苍岭放置', 'Sword and Spells');

function header() {
  return `<div class="hero">${img(scene(360, 330, false), 3)}
  <div class="title"><div class="t1">${T1}</div>
  <div class="t2">MMORPG Idle · ${L('像素放置网游', 'Pixel Fantasy Adventure')}</div>
  <div class="t3">${L('一个关掉游戏也在运转的像素大世界', 'A pixel world that keeps running even when you log off')}</div></div></div>`;
}

const intro = () => `<section>
  <h2>${L('这是一款什么游戏？', 'What is this game?')}</h2>
  <div class="lead">${L(
    `《苍岭放置》是一款 <b>MMORPG Idle</b>（放置类大型多人在线角色扮演）游戏。你只要给角色安排任务——挖矿、伐木、钓鱼、打怪、锻造——他就会<b>自己走过去开工</b>，任务排好队一件接一件做，<b>关掉游戏也照样在干</b>，下次上线直接收获。`,
    `<b>Sword and Spells</b> is an <b>MMORPG Idle</b> game. Give your hero a job — mining, woodcutting, fishing, fighting, smithing — and they <b>walk there and get to work on their own</b>, working through a queue of tasks. <b>They keep going even after you close the game</b>, so there is loot waiting every time you come back.`)}</div>
  <div class="lead">${L(
    `和一般的单机放置游戏不一样，这里有一张<b>真正可以走的大地图</b>：你能看到其他玩家在身边挖矿、骑着马跑过去，可以<b>组队下副本、加入公会、聊天、交易</b>。`,
    `Unlike most idle games, there is a <b>real open world map</b>. Other players mine right next to you and gallop past on horseback, and you can <b>party up for dungeons, join a guild, chat and trade</b>.`)}</div>
  <div class="badges">
    <div class="badge"><div class="k">${L('离线也在成长', 'Offline progress')}</div><div class="v">${L('下线后继续干活、打怪、升级', 'Keeps working, fighting and leveling while you are away')}</div></div>
    <div class="badge"><div class="k">${L('和真人同屏', 'Real players')}</div><div class="v">${L('组队、公会、好友、排行榜', 'Parties, guilds, friends, leaderboards')}</div></div>
    <div class="badge"><div class="k">${L('电脑手机都能玩', 'PC & mobile')}</div><div class="v">${L('点一下地面就能走', 'Tap the ground to walk')}</div></div>
  </div>
  <div class="stat">
    <div><b>19</b><span>${L('项技能', 'skills')}</span></div>
    <div><b>${nMon}+</b><span>${L('种怪物', 'monsters')}</span></div>
    <div><b>10</b><span>${L('座城镇', 'towns')}</span></div>
    <div><b>12080²</b><span>${L('格大地图', 'tile world')}</span></div>
  </div>
</section>`;

const skills = () => `<section>
  <h2>${L('19 项技能，等级无上限', '19 skills, no level cap')}</h2>
  <div class="lead">${L('前 50 级升得飞快，越往后越考验坚持。工具和等级越高，干活越快、产出越多。', 'The first 50 levels fly by; after that it is a long road. Better tools and higher levels mean faster work and bigger yields.')}</div>
  <div class="grid g4">${SKILLS.map(([n, d, c]) => `<div class="tile">${img(c, 3)}<div class="n">${n}</div><div class="d">${d}</div></div>`).join('')}</div>
  <div class="chips">
    ${L('采矿 伐木 钓鱼 采集 种植 狩猎 偷窃 养殖', 'Mining Woodcutting Fishing Gathering Farming Hunting Thieving Husbandry').split(' ').map((s) => `<span class="chip g">${s}</span>`).join('')}
    ${L('烹饪 锻造 制弓 药剂 工艺 强化', 'Cooking Smithing Fletching Herblore Crafting Enhancing').split(' ').map((s) => `<span class="chip p">${s}</span>`).join('')}
    ${L('近战 远程 魔法 防御 生命', 'Melee Ranged Magic Defence Hitpoints').split(' ').map((s) => `<span class="chip c">${s}</span>`).join('')}
  </div>
</section>`;

const QN = EN ? ['Common', 'Fine', 'Superior', 'Epic', 'Legendary', 'Mythic'] : ['普通', '良好', '优秀', '史诗', '传说', '神话'];
const gear = () => `<section>
  <h2>${L('T1 到 T8，每一阶都长得不一样', 'Tier 1 to 8, every tier looks different')}</h2>
  <div class="lead">${L('从木制一路做到精金。武器、护甲、工具、副手、项链戒指全部自己采料自己打造，制作时还会随机出品质。', 'From wood all the way to adamant. Gather the materials and craft every weapon, armor piece, tool, off-hand and piece of jewelry yourself. Every craft rolls a random quality.')}</div>
  <div class="card"><div class="grid" style="grid-template-columns:repeat(8,1fr);gap:12px;justify-items:center">${gearRow('sword')}${gearRow('longbow')}${gearRow('staff')}${gearRow('pickaxe')}</div></div>
  <div class="chips">${QN.map((n, i) => `<span class="chip" style="border-color:${QUALITY_COLOR[i]};color:${QUALITY_COLOR[i]}">${n}</span>`).join('')}</div>
</section>`;

const monsters = () => `<section>
  <h2>${L(`${nMon}+ 种怪物，5 位世界首领`, `${nMon}+ monsters, 5 world bosses`)}</h2>
  <div class="lead">${L('每种怪物都有自己的外形、特性和掉落，怪物图鉴会记下你打过的每一只。精英会重击，首领会放毁灭一击，残血还会狂怒。', 'Every monster has its own look, traits and loot, and the bestiary records each one you defeat. Elites hit hard, bosses unleash devastating blows and go berserk at low health.')}</div>
  <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:12px">${monsterWall()}</div>
  <div class="lead" style="margin-top:40px">${L('大陆边缘盘踞着 5 位<b>世界首领</b>，每位都有专属大招和宝库：', 'Five <b>world bosses</b> lurk at the edges of the continent, each with a signature attack and a treasure vault:')}</div>
  <div class="grid g5" style="gap:12px">${WORLD.map(([id, n, lv]) => `<div class="tile" style="padding:8px 4px 12px">${img(worldBoss(id), 1.5)}<div class="n">${n}</div><div class="d">${lv}</div></div>`).join('')}</div>
</section>`;

const dungeons = () => `<section>
  <h2>${L('地下副本：绿洞 · 蓝洞', 'Dungeons: Green & Blue Caves')}</h2>
  <div class="lead">${L('用钥匙在身边打开一个 30 分钟的洞口，钻进去一层层往下打。<b>每次地形、路线、怪物都随机</b>，清光所有怪物，最后一层首领守着的宝箱才归你。绿洞可以单刷，蓝洞必须组队，队友一起分战利品。', 'Use a key to open a 30-minute cave portal next to you and fight your way down, floor by floor. <b>Every run has a random layout, route and monster lineup.</b> Clear every monster and the boss-guarded chest on the last floor is yours. Green caves can be soloed; blue caves need a party, and the loot is shared.')}</div>
  ${img(dgBannerUrl(), 4, 240, 100)}
  <div class="grid g3" style="margin-top:18px">${[dgGateUrl(), dgBossUrl(), dgChestsUrl()].map((u) => `<div class="tile" style="padding:6px">${img(u, 2.4, 120, 90)}</div>`).join('')}</div>
</section>`;

const mounts = () => `<section>
  <h2>${L('坐骑与外观', 'Mounts & outfits')}</h2>
  <div class="lead">${L('骑上狼或马，跑图快一倍多。野外的野马会掉小马崽，带回城里的畜牧站养大，每匹的资质和毛色都不一样。', 'Ride a wolf or a horse to cross the map more than twice as fast. Wild horses drop foals you can raise at the ranch in town, and every horse gets its own aptitude and coat.')}</div>
  <div class="grid g3">${[mountCard('wolf', 0, 5), mountCard(0, 1, 10), mountCard(1, 2, 14), mountCard(2, 4, 20), mountCard(3, 3, 26), mountCard('wolf', 5, 18)].map((c) => `<div class="tile" style="padding:6px">${img(c, 4)}</div>`).join('')}</div>
  <div class="lead" style="margin-top:36px">${L('衣橱里还有 10 套外观，包括南瓜提灯人、白发魔骑、骸骨术士这些限定款：', 'The wardrobe holds 10 outfits, including limited ones like the Pumpkin Lantern, the Pale Knight and the Bone Sorcerer:')}</div>
  <div class="grid g5">${OUTFITS.slice(0, 10).map((_, i) => `<div class="tile" style="padding:8px">${img(outfit(i), 5)}</div>`).join('')}</div>
</section>`;

const home = () => `<section>
  <h2>${L('家园岛屿 · 公会 · 组队', 'Home island, guilds, parties')}</h2>
  <div class="lead">${L('从城里的传送门去到自己的小岛，<b>自由摆放近百种墙、地板、家具和制作台</b>，在岛上就能直接干活。', 'Step through the portal in town to your own island. <b>Build freely with nearly a hundred walls, floors, furniture pieces and crafting stations</b>, and work right there on the island.')}</div>
  <img class="shot" src="./maps/home.jpg">
  <div class="lead" style="margin-top:36px">${L('加入公会，一起升公会等级、做每日任务、用公会仓库（在哪都能存取）；组队打怪有经验加成，队长一声召集，队友自动赶过来。', 'Join a guild to level it up together, complete daily tasks and share a guild bank you can reach from anywhere. Parties earn bonus XP, and when the leader rallies, everyone heads over automatically.')}</div>
  <div style="display:flex;justify-content:center">${img(dgPartyUrl(), 6, 120, 90)}</div>
</section>`;

const STEPS: [string, string, string, string][] = [
  [L('第一版：一眼就能看完的小镇', 'Version 1: a map you could see at a glance'), '1080 × 1080',
    L('最早的原型。城镇在正中间，几条土路通向冰霜之巅、红木林、熔岩巢穴、深海码头……十几个地点挤在一张图上。能玩，但走两步就到头了。', 'The first prototype. A town in the middle and a few dirt roads to a dozen spots: Frost Peak, the Redwoods, the Lava Den, the Deep Sea Dock... It worked, but you hit the edge after a few steps.'), 'map1.jpg'],
  [L('第二版：九大群系', 'Version 2: nine biomes'), '2188 × 2188',
    L('第一次大改。地图分成九块：冰封雪原、巨木森林、灰岩高地、金沙海岸、熔岩荒地、深渊裂谷、亡者沼泽、幽深林地，中间是安全的城镇。加上了河流、湖泊和码头，世界第一次有了「地理」。', 'The first big rework. The map was split into nine regions: Frostbound Wastes, Giantwood Forest, Greystone Highlands, Goldsand Coast, Lava Barrens, Abyssal Rift, Deadman\'s Marsh and Shadowdeep Woods, around a safe town. Rivers, lakes and docks gave the world real geography.'), 'map2.jpg'],
  [L('第三版：给每块土地定规矩', 'Version 3: giving every region a purpose'), L('区域规划', 'Zone planning'),
    L('给每个群系划出采集点和怪物区，标上等级区间（Lv1 到 Lv80）。从城镇出发一圈圈往外走，越远越危险，奖励也越好。', 'Every biome got its own gathering spots and monster zones with level ranges from Lv1 to Lv80. Head out from town ring by ring: the farther you go, the more dangerous it gets and the better the rewards.'), 'map3.jpg'],
  [L('第四版：世界往外长了一圈', 'Version 4: the world grows a new ring'), '5088 → 8848',
    L('原来的世界整个放在正中，外面再围上 8 个新区域：枫红秋林、云岭高山、赤岩峡谷、珊瑚群岛、流沙大漠、晶簇荒原、蛮荒雨林、金穗草原。第二座城「落霞城」出现了，还有千岛湖、星渊祭坛、菌丝深谷这些带名字的特色地点和新首领。', 'The old world moved to the center and eight new regions wrapped around it: Crimson Maple Woods, Cloudridge Peaks, Redrock Canyon, Coral Isles, Shifting Sands, Crystal Wastes, Wildheart Jungle and Goldenear Prairie. A second city, Duskhaven, appeared, along with landmarks like Thousand Isle Lake and the Star Abyss Altar, each with a new boss.'), 'map4.jpg'],
  [L('现在：一整片大陆', 'Today: a whole continent'), '12080 × 12080',
    L('最外圈加上海岸和群岛，新建 8 座城镇（凤麦镇、雪隘堡、岩灯城、珊瑚港、灰烬营地、晶辉要塞、遗忘哨塔、虚辉遗都），5 位世界首领盘踞在大陆边缘。地图面积已经是第一版的 125 倍，骑马跑一趟也要好一阵。', 'Coastlines and islands now ring the edge, with eight new towns: Wheatwind, Snowpass Keep, Lanternrock, Coral Harbor, Ashen Camp, Crystalglow Bastion, Forgotten Watch and Voidlight Ruins. Five world bosses guard the far corners. The map is now 125 times the size of the first version, and even on horseback a trip takes a while.'), 'map5.jpg'],
];
const SIZES = [1080, 2188, 5088, 8848, 12080];
const journey = () => `<section>
  <h2>${L('地图更新心路历程', 'How the map grew')}</h2>
  <div class="lead">${L('地图是这款游戏改得最多的地方。从一张能一眼看完的小图，到现在骑马都要跑好一阵的大陆，前后一共经历了五个版本。', 'The map is the part of the game we reworked the most. It went from a map you could take in at a glance to a continent that takes a long ride to cross, across five versions.')}</div>
  <div class="grow">${SIZES.map((s) => `<div style="flex:1;height:${Math.max(8, (s / 12080) ** 2 * 230)}px"><span>${s}²</span></div>`).join('')}</div>
  <div class="sub" style="margin:52px 0 46px;text-align:center">${L('地图面积对比（格²）', 'Map area by version (tiles²)')}</div>
  <div class="tl">${STEPS.map(([h, sz, p, f], i) => `<div class="step" data-n="${i + 1}"><h3>${h}</h3><div class="size">${sz}</div><div class="lead" style="margin:0">${p}</div><img src="./maps/${f}"></div>`).join('')}</div>
  <div class="lead">${L('而且地图还会继续长大：外海的群岛已经画好了，等航海系统做出来，就能开船过去。', 'And it is not done growing. The outer islands are already drawn and waiting for the sailing system, so you will be able to sail out to them.')}</div>
</section>`;

const ending = () => `<div class="end">${img(mirror(scene(360, 280, false)), 3)}
  <div class="box"><div class="big">${L('计划 11 月登陆 Steam', 'Coming to Steam this November')}<small>${L('敬请期待', 'Stay tuned')}</small></div>
  <div class="tag">${T1} · MMORPG Idle</div></div></div>`;

document.getElementById('app')!.innerHTML = header() + intro() + skills() + gear() + monsters() + dungeons() + mounts() + home() + journey() + ending();
Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))])
  .then(() => { (window as unknown as { posterReady: boolean }).posterReady = true; });
