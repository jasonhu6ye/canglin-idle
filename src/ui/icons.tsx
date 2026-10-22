import { ITEMS, TIERS, tierName } from '../core/data';
import { resIconUrl } from '../game/resArt';
import type { SkillId } from '../core/types';

/*
 * 物品和技能的像素图标：12×12 字符画模板 + 按材质染色。
 * a/b/c = 染色的暗/中/亮，其余字母是固定颜色。
 */

const FIXED: Record<string, string> = {
  k: '#1a120e', w: '#ffffff', o: '#9a6a3a', O: '#6a4426', g: '#f0c850', G: '#a07a1a',
  h: '#c5cad2', H: '#6a7078', r: '#e04a4a', R: '#901e22', e: '#2a1e17', l: '#7cc456', L: '#3c7a32',
};

const TPL: Record<string, string[]> = {
  ore: [
    '............',
    '....kkkk....',
    '..kkHhhHkk..',
    '.kHhcbHhHHk.',
    '.khHbaHhHHk.',
    'kHhHHhhcbHHk',
    'kHcbHhhbaHHk',
    'kHbaHhHHHHHk',
    '.kHHHHcbHHk.',
    '..kkHHbaHk..',
    '....kkkkk...',
    '............',
  ],
  gem: [
    '............',
    '...kkkkkk...',
    '..kcwcbbbk..',
    '.kcwccbbbak.',
    'kccccbbbbaak',
    'kbbbbbbaaaak',
    '.kbbbbaaaak.',
    '..kbbbaaak..',
    '...kbbaak...',
    '....kbak....',
    '.....kk.....',
    '............',
  ],
  bar: [
    '............',
    '............',
    '............',
    '....kkkkkkk.',
    '...kccccccbk',
    '..kcwcccccak',
    '.kcccccccbak',
    'kbbbbbbbbaak',
    'kbbbbbbbbak.',
    'kaaaaaaaak..',
    '.kkkkkkkk...',
    '............',
  ],
  log: [
    '............',
    '............',
    '.....kkkkkk.',
    '...kkbbbbkck',
    '..kbbbbbkcOc',
    '.kbabbbbkOcO',
    'kbbbbabbkcOc',
    'kbabbbbbbkck',
    'kbbbbbbabk..',
    '.kaaaaaak...',
    '..kkkkkk....',
    '............',
  ],
  fish: [
    '............',
    '............',
    '.....kkkk...',
    '...kkccccak.',
    'kk.kcwkbbbak',
    'kak.kcbbbbbk',
    'kbakkbbbbbak',
    'kbbbbbbbbak.',
    'kak.kaaaak..',
    'kk...kkkk...',
    '............',
    '............',
  ],
  food: [
    '............',
    '............',
    '....kkkk....',
    '..kkccccbk..',
    '.kcwccbbbbk.',
    'kccccbbbbbak',
    'kcbbbbbabbak',
    'kbbbabbbbaak',
    '.kbbbbbbaak.',
    '..kaaaaaak..',
    '...kkkkkk...',
    '............',
  ],
  herb: [
    '............',
    '.....kk.....',
    '....kck..k..',
    '.kk.kcbk.kk.',
    'kcbkkcbkkcbk',
    '.kcbkcbkcbk.',
    '..kcbcbcbk..',
    '...kbbbak...',
    '....kLLk....',
    '....kLk.....',
    '....kk......',
    '............',
  ],
  potion: [
    '....kkkk....',
    '....kOOk....',
    '....kwwk....',
    '...kwkkwk...',
    '..kcwcccbk..',
    '.kcwccbbbak.',
    '.kccbbbbbak.',
    '.kbbbbbbaak.',
    '.kbbbbbaaak.',
    '..kaaaaaak..',
    '...kkkkkk...',
    '............',
  ],
  hide: [
    '............',
    '.kk......kk.',
    'kbbk.kk.kbbk',
    '.kbbkbbkbbk.',
    '..kbbbbbbk..',
    '.kcbbbbbbak.',
    '.kcbbabbbak.',
    '.kbbbbbbaak.',
    'kbbk.kbk.kbk',
    '.kk...k...k.',
    '............',
    '............',
  ],
  cloth: [
    '............',
    '............',
    '..kkkkkkkk..',
    '.kccccccccbk',
    '.kcwwwwwwcbk',
    '.kbbbbbbbbak',
    '.kccccccccbk',
    '.kbbbbbbbbak',
    '.kaaaaaaaaak',
    '..kkkkkkkkk.',
    '............',
    '............',
  ],
  arrowhead: [
    '............',
    '............',
    '.....kk.....',
    '....kcbk....',
    '...kcwbak...',
    '..kcwbbbak..',
    '.kcbbbbbaak.',
    '.kkkkOOkkkk.',
    '.....OO.....',
    '.....kk.....',
    '............',
    '............',
  ],
  arrow: [
    '.........kkk',
    '........kcbk',
    '.......kcbak',
    '......kOkak.',
    '.....kOk.k..',
    '....kOk.....',
    '...kOk......',
    '..kOk.......',
    'kkOk........',
    'kwkk........',
    'kwwk........',
    '.kk.........',
  ],
  shaft: [
    '............',
    '.........kk.',
    '........kok.',
    '......kkok..',
    '.....kokk...',
    '....kok.....',
    '...kok..kk..',
    '..kok..kok..',
    '.kok..kok...',
    'kok..kok....',
    'kk..kok.....',
    '....kk......',
  ],
  knife: [
    '............',
    '.........kk.',
    '........kcbk',
    '.......kcbak',
    '......kcbak.',
    '.....kcbak..',
    '....kcbak...',
    '...kkbak....',
    '..kOOkk.....',
    '.kOOk.......',
    'kOOk........',
    '.kk.........',
  ],
  rune: [
    '............',
    '...kkkkkk...',
    '..kHHhhHHk..',
    '.kHhhwbhhHk.',
    'kHhhbwbbhhHk',
    'kHhhhbchhhHk',
    'kHhhbwbbhhHk',
    'kHhhhbbhhhHk',
    '.kHhhhhhhHk.',
    '..kHHHHHHk..',
    '...kkkkkk...',
    '............',
  ],
  stone: [
    '............',
    '.....kk.....',
    '....kcbk....',
    '...kcwbbk...',
    '..kcwcbbak..',
    '.kccbbbbaak.',
    '.kbbbbbbaak.',
    '..kbbbbaak..',
    '...kbbaak...',
    '....kaak....',
    '.....kk.....',
    '............',
  ],
  sword: [
    '..........kk',
    '.........kck',
    '........kcbk',
    '.......kcbk.',
    '......kcbk..',
    '.....kcbk...',
    '.kk.kcbk....',
    '.kGkcbk.....',
    '..kGbk......',
    '..kOkGk.....',
    '.kOk.kGk....',
    'kkk...kk....',
  ],
  bow: [
    '...kkk......',
    '..kbbbk.....',
    '.kbk.kwk....',
    '.kbk..kwk...',
    'kbk....kw...',
    'kbk....kw...',
    'kbk....kw...',
    'kbk....kw...',
    '.kbk..kwk...',
    '.kbk.kwk....',
    '..kbbbk.....',
    '...kkk......',
  ],
  staff: [
    '........kkk.',
    '.......kcwck',
    '.......kbcbk',
    '.......kkbk.',
    '......kOkk..',
    '.....kOk....',
    '....kOk.....',
    '...kOk......',
    '..kOk.......',
    '.kOk........',
    'kOk.........',
    'kk..........',
  ],
  rod: [
    '.........kk.',
    '........kok.',
    '.......kok.k',
    '......kok..w',
    '.....kok...w',
    '....kok....w',
    '...kok.....w',
    '..kOk......w',
    '.kOk......kr',
    'kOk.......kr',
    'kk.........k',
    '............',
  ],
  shield: [
    '............',
    '.kkkkkkkkkk.',
    'kccccccbbbak',
    'kcwcccbbbbak',
    'kccccgbbbbak',
    'kcccgggbbbak',
    'kbbbbgbbbbak',
    '.kbbbbbbbak.',
    '.kbbbbbbaak.',
    '..kbbbbaak..',
    '...kkaakk...',
    '.....kk.....',
  ],
  helm: [
    '............',
    '............',
    '...kkkkkk...',
    '..kccccbbk..',
    '.kcwcccbbak.',
    '.kcccbbbbak.',
    '.kbbkkkkbak.',
    '.kbk.kk.kak.',
    '.kbk.kk.kak.',
    '.kak....kak.',
    '..kk....kk..',
    '............',
  ],
  body: [
    '............',
    '.kkk....kkk.',
    'kcbbkkkkbbak',
    'kcbbccbbbbak',
    'kccbcwcbbbak',
    '.kkbcccbbkk.',
    '..kbbbbbbk..',
    '..kbbgbbak..',
    '..kbbbbbak..',
    '..kbbbbaak..',
    '...kkkkkk...',
    '............',
  ],
  legs: [
    '............',
    '..kkkkkkkk..',
    '..kGGGGGGk..',
    '..kccbbbak..',
    '..kcbbbbak..',
    '..kcbkkbak..',
    '..kcbk.kbk..',
    '..kcbk.kbk..',
    '..kcbk.kbk..',
    '.kcbbk.kbak.',
    '.kkkkk.kkkk.',
    '............',
  ],
  pickaxe: [
    '............',
    '..kkkkkkk...',
    '.kccbbbbbkk.',
    'kck.kOk..kak',
    'kk..kOk...kk',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kkk.....',
    '............',
  ],
  axe: [
    '............',
    '...kkkk.....',
    '..kccbbk....',
    '.kcwbbbkOk..',
    '.kcbbbbkOk..',
    '..kbbaakOk..',
    '...kkkkkOk..',
    '.......kOk..',
    '.......kOk..',
    '.......kOk..',
    '.......kkk..',
    '............',
  ],
  hoe: [
    '............',
    '.kkkkk......',
    'kcbbbbkkk...',
    '.kkkkkOOk...',
    '.....kkOk...',
    '......kOk...',
    '.......kOk..',
    '.......kOk..',
    '........kOk.',
    '........kOk.',
    '.........kk.',
    '............',
  ],
  gloves: [
    '............',
    '...k.k.k....',
    '..kckckck...',
    '..kcbcbcbk..',
    '..kcbbbbbkk.',
    '..kcbbbbbkbk',
    '..kcbbbbbbk.',
    '..kbbbbbbak.',
    '...kbbbbak..',
    '...kgggggk..',
    '...kkkkkkk..',
    '............',
  ],
  ring: [
    '............',
    '.....kk.....',
    '....kcbk....',
    '...kkbakk...',
    '..kgGkkgGk..',
    '.kgk....kGk.',
    '.kgk....kGk.',
    '.kgk....kGk.',
    '..kgk..kGk..',
    '...kggGGk...',
    '....kkkk....',
    '............',
  ],
  amulet: [
    'kk........kk',
    '.kGk....kGk.',
    '..kGk..kGk..',
    '...kGkkGk...',
    '....kggk....',
    '...kcbbak...',
    '..kcwbbbak..',
    '..kcbbbbak..',
    '...kbbbak...',
    '....kaak....',
    '.....kk.....',
    '............',
  ],
  coins: [
    '............',
    '....kkkk....',
    '...kggggk...',
    '..kgwgggGk..',
    '..kggGggGk..',
    '.kkkgggGGk..',
    'kggkkkkkk...',
    'kgwggggGk...',
    'kggGgggGk...',
    '.kggggGk....',
    '..kkkkk.....',
    '............',
  ],
  bones: [
    '............',
    '.kk......kk.',
    'kwwk....kwwk',
    'kwwwkkkkwwwk',
    '.kwwwwwwwwk.',
    '..khhhhhhk..',
    '.kwwwwwwwwk.',
    'kwwwkkkkwwwk',
    'kwwk....kwwk',
    '.kk......kk.',
    '............',
    '............',
  ],
  heart: [
    '............',
    '.kkk...kkk..',
    'kcwck.kccbk.',
    'kwccckcbbbak',
    'kccbbbbbbbak',
    '.kcbbbbbbak.',
    '..kbbbbbak..',
    '...kbbbak...',
    '....kbak....',
    '.....kk.....',
    '............',
    '............',
  ],
  anvil: [
    '............',
    '............',
    'kkkkkkkkkk..',
    'kccccccccbk.',
    '.kbbbbbbbbbk',
    '..kkbbbbakk.',
    '....kbbak...',
    '....kbbak...',
    '...kbbbbak..',
    '..kaaaaaaak.',
    '..kkkkkkkkk.',
    '............',
  ],
  bag: [
    '............',
    '....kkkk....',
    '...kgkkgk...',
    '....kggk....',
    '..kkcbbbkk..',
    '.kccbbbbbak.',
    'kcwcbbbbbbak',
    'kccbbgbbbbak',
    'kcbbgggbbaak',
    'kbbbbgbbaaak',
    '.kaaaaaaaak.',
    '..kkkkkkkk..',
  ],
};

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

const cache = new Map<string, string>();

export function iconUrl(tpl: string, tint: string): string {
  const key = `${tpl}|${tint}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = TPL[tpl] ?? TPL.ore;
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const ctx = c.getContext('2d')!;
  const pal: Record<string, string> = { ...FIXED, a: shade(tint, -0.4), b: tint, c: shade(tint, 0.4) };
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const METAL: Record<string, string> = {
  stone: '#9a9a9e', copper: '#d07a3a', bronze: '#c09040', iron: '#8a8f99', titanium: '#8ad8ff', runic: '#b070ff', meteor: '#ff8a2a', adamant: '#4ad898',
};
const WOOD: Record<string, string> = {
  plain: '#a87a48', birch: '#e0d8c0', pine: '#d0a860', oak: '#8a6a40', cedar: '#d08060', bloodoak: '#c02a2a', ashbark: '#5a5450', white: '#f4ecc8',
};
const HIDE_TINT = ['#a07a50', '#b8925a', '#7e7e84', '#6a4430', '#e8ecf2', '#8a3a22', '#2e282e', '#5a3e8a'];
const CLOTH_TINT = ['#d8d4cc', '#f4e6c0', '#fcd4dc', '#d4e8fc', '#f0faff', '#f8d070', '#ffa868', '#e8d8ff'];
const SPECIFIC: Record<string, [string, string]> = {
  coins: ['coins', '#f0c850'], bones: ['bones', '#ffffff'], burnt_food: ['food', '#3a2a22'], shaft: ['shaft', '#9a6a3a'],
  sapphire: ['gem', '#3a6ae0'], ruby: ['gem', '#e03a4a'], diamond: ['gem', '#e8f8ff'],
  potato: ['food', '#b08a50'], baked_potato: ['food', '#c8803a'], bread: ['food', '#d8a060'], wheat: ['herb', '#e0c050'],
  green_herb: ['herb', '#6ac04a'], fire_bloom: ['herb', '#f07a3a'], moon_herb: ['herb', '#c0d0ff'],
  silver_leaf: ['herb', '#d0d8d8'], flame_heart: ['herb', '#ff4a2a'], frost_lotus: ['herb', '#8ad8ff'],
  enh_basic: ['stone', '#8ad8ff'], enh_mid: ['stone', '#7ac04a'], enh_high: ['stone', '#e0a040'], enh_legend: ['stone', '#e04ae0'],
};

/** 物品 → [模板, 颜色]（分阶资源另有专门的图，见 resIconUrl） */
export function itemIcon(id: string): [string, string] {
  if (SPECIFIC[id]) return SPECIFIC[id];
  const it = ITEMS[id];
  const prefix = id.split('_')[0];
  if (id.startsWith('raw_')) return ['fish', '#8aa0b8'];
  if (it?.category === 'food') return ['fish', '#d08a4a'];
  if (id.endsWith('_potion')) return ['potion', SPECIFIC[id.replace('_potion', '')]?.[1] ?? '#c04ae0'];
  if (id.endsWith('_bar')) return ['bar', METAL[prefix] ?? '#aaa'];
  if (id.endsWith('_arrowhead')) return ['arrowhead', METAL[prefix]];
  if (id.endsWith('_arrow')) return ['arrow', METAL[prefix]];
  if (id.endsWith('_rune')) return ['rune', METAL[prefix]];
  const e = it?.equip;
  if (e) {
    const light = /^(leather|robe)(\d)_/.exec(id);
    const tint = light ? (light[1] === 'leather' ? HIDE_TINT : CLOTH_TINT)[+light[2] - 1] : METAL[prefix] ?? WOOD[prefix] ?? '#c8c8c8';
    if (e.slot === 'weapon') return [e.style === 'ranged' ? 'bow' : e.style === 'magic' ? 'staff' : 'sword', tint];
    if (e.slot === 'ring' || e.slot === 'neck') return [e.slot === 'ring' ? 'ring' : 'amulet', SPECIFIC[prefix]?.[1] ?? '#f0c850'];
    const tpl = { head: 'helm', body: 'body', legs: 'legs', shield: 'shield', pickaxe: 'pickaxe', axe: 'axe', rod: 'rod', hoe: 'hoe', knife: 'knife', gloves: 'gloves' }[e.slot];
    return [tpl ?? 'bag', tint];
  }
  return ['bag', '#a08060'];
}

export const SKILL_ICON: Record<SkillId, [string, string]> = {
  mining: ['pickaxe', '#c5cad2'], woodcutting: ['axe', '#c5cad2'], fishing: ['fish', '#5a9ad8'], farming: ['herb', '#7cc456'],
  hunting: ['knife', '#c5cad2'], thieving: ['bag', '#8a7ab8'], cooking: ['food', '#d8a060'], smithing: ['anvil', '#8a8f99'],
  fletching: ['bow', '#c09060'], herblore: ['potion', '#4ab89a'], crafting: ['gem', '#e07ab0'], enhancing: ['stone', '#e8d04a'],
  melee: ['sword', '#c5cad2'], ranged: ['arrow', '#c08040'], magic: ['staff', '#5a7ae8'], defence: ['shield', '#7a8ab8'], hitpoints: ['heart', '#e04a5a'],
};

/** 物品图标；分阶资源右下角标 T1-T8 */
export function Icon({ item, size = 32 }: { item: string; size?: number }) {
  const res = resIconUrl(item);
  if (res) {
    const tier = ITEMS[item].tier!;
    return (
      <span className="icon-tier" style={{ width: size, height: size }}>
        <img className="icon" src={res} width={size} height={size} alt="" draggable={false} />
        {size >= 22 && <b className={`tier t${tier + 1}`}>{tierName(tier)}</b>}
      </span>
    );
  }
  const [tpl, tint] = itemIcon(item);
  return <img className="icon" src={iconUrl(tpl, tint)} width={size} height={size} alt="" draggable={false} />;
}

export function SkillIcon({ skill, size = 24 }: { skill: SkillId; size?: number }) {
  const [tpl, tint] = SKILL_ICON[skill];
  return <img className="icon" src={iconUrl(tpl, tint)} width={size} height={size} alt="" draggable={false} />;
}

export function TplIcon({ tpl, tint, size = 20 }: { tpl: string; tint: string; size?: number }) {
  return <img className="icon" src={iconUrl(tpl, tint)} width={size} height={size} alt="" draggable={false} />;
}

/** 防止未使用：TIERS 在这里只用来确保装备档位和颜色表同步 */
export const ICON_TIERS_COVERED = TIERS.every((t) => METAL[t.id] && WOOD[t.wood]);
