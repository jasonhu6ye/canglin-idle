import { baseOf } from '../core/quality';
import { HW_BOX, HW_POINT } from '../core/halloween';
import { pumpkinBoxUrl, pumpkinPointUrl } from '../game/halloweenArt';
import { CROPS, ITEMS, MONSTERS, TIERS, tierName } from '../core/data';

const CROP_COLOR: Record<string, [string, string]> = Object.fromEntries(CROPS.map((c) => [c[0], [c[3], c[5]]]));
import { resIconUrl } from '../game/resArt';
import { equipIconUrl } from '../game/equipArt';
import { bannerIconUrl, chestIconUrl, luckyBagIconUrl, trophyIconUrl, worldChestIconUrl } from '../game/lootArt';
import { openItem } from './itemOpen';
import { dungeonIconUrl } from '../game/dungeonArt';
import { wolfIconUrl } from '../game/wolfArt';
import { foalIconUrl, horseIconUrl } from '../game/horseArt';
import { aptOf, coatOf, FOAL } from '../core/ranch';

/** 坐骑图标：马按毛色画，别的是狼 */
export const mountIconUrl = (id: string) => (aptOf(id) ? horseIconUrl(coatOf(aptOf(id))) : wolfIconUrl());
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
  pan: [
    '.......kkkk.',
    '......kbccbk',
    '......kbkcbk',
    '.....kbbkcbk',
    '.....kbkbbk.',
    '.....kbbbk..',
    '....kkkkk...',
    '...okk......',
    '..oO........',
    '.oO.........',
    'oO..........',
    'k...........',
  ],
  mail: [
    '............',
    '............',
    'kkkkkkkkkkkk',
    'kckbbbbbbkck',
    'kbckbbbbkcbk',
    'kbbckbbkcbbk',
    'kbbbckkcbbbk',
    'kbbbbrrbbbbk',
    'kbbbbrrbbbbk',
    'kaaaaaaaaaak',
    'kkkkkkkkkkkk',
    '............',
  ],
  friends: [
    '............',
    '..kkk..kkk..',
    '.kcbbkkbcck.',
    '.kbbbkkbbbk.',
    '.kbbbkkbbbk.',
    '..kkk..kkk..',
    '.kkkkkkkkkk.',
    'kcbbbkkcbbbk',
    'kbbbbkkbbbbk',
    'kbbbbkkbbbbk',
    'kkkkkkkkkkkk',
    '............',
  ],
  chat: [
    '............',
    '.kkkkkkkkkk.',
    'kbbbbbbbbbbk',
    'kbccccccccbk',
    'kbcwbbwbbcbk',
    'kbcbbbbbbcbk',
    'kbcwbwbbbcbk',
    'kbccccccccbk',
    '.kkkbbkkkkk.',
    '...kbk......',
    '...kk.......',
    '............',
  ],
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
  meat: [
    '............',
    '.......kk...',
    '......kwwk..',
    '...kkkkwwk..',
    '..kccccbkk..',
    '.kcwccbbbk..',
    'kccccbbbbak.',
    'kcbbbbbbbak.',
    'kbbbbbbbaak.',
    '.kbbbbaaak..',
    '..kkkkkkk...',
    '............',
  ],
  core: [
    '............',
    '.....kk.....',
    '....kcck....',
    '...kcwcbk...',
    '..kcwccbbk..',
    '.kccccbbbak.',
    '.kbbbbbbaak.',
    '..kbbbbaak..',
    '...kbbaak...',
    '....kaak....',
    '.....kk.....',
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
  // 肥料袋：鼓鼓的麻袋，袋口冒出一片嫩芽，袋身染色
  fert: [
    '.....lL.....',
    '....lLl.....',
    '...kkLkk....',
    '..kOooOOk...',
    '..kkkkkkk...',
    '.kccccccbk..',
    'kcccwccbbak.',
    'kccccccbbak.',
    'kcbbbbbbaak.',
    'kbbbbbbaaak.',
    '.kaaaaaaak..',
    '..kkkkkkk...',
  ],
  // 洒水器：金属转头喷出水花
  sprinkler: [
    '.w..w..w....',
    '..w.w.w.....',
    'w..www..w...',
    '...kkkk.....',
    '..kchhbk....',
    '...kbak.....',
    '....kk......',
    '....ka......',
    '....ka......',
    '...kbak.....',
    '..kHHHHk....',
    '..kkkkkk....',
  ],
  // 种子袋：麻布小袋，袋口露出几颗种子（种子颜色 = 作物颜色）
  seed: [
    '............',
    '....kkkk....',
    '...kcbcbk...',
    '....kOOk....',
    '...koooOk...',
    '..koooooOk..',
    '.kooooooOOk.',
    '.koowooooOk.',
    '.kooooooOOk.',
    '..kOOOOOOk..',
    '...kkkkkk...',
    '............',
  ],
  // 圆滚滚的蔬菜瓜果，顶上两片叶子
  veg: [
    '.....kk.....',
    '...kklLkk...',
    '..klLkkLlk..',
    '...kkbbkk...',
    '..kcccbbbk..',
    '.kcwccbbbak.',
    '.kccbbbbbak.',
    '.kcbbbbbaak.',
    '.kbbbbbaaak.',
    '..kbbbaaak..',
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
  spear: [
    '.........kk.',
    '........kcck',
    '.......kcwbk',
    '........kbk.',
    '.......kGk..',
    '......kOk...',
    '.....kOk....',
    '....kOk.....',
    '...kOk......',
    '..kOk.......',
    '.kOk........',
    '.kk.........',
  ],
  dagger: [
    '............',
    '.........kk.',
    '........kck.',
    '.......kcbk.',
    '......kcbk..',
    '.....kcbk...',
    '...kkcbk....',
    '...kGbk.....',
    '..kOkGk.....',
    '.kOk.kk.....',
    '.kk.........',
    '............',
  ],
  longbow: [
    '..kk........',
    '..kbk.......',
    '..kbkw......',
    '...kbkw.....',
    '...kbk.w....',
    '...kOk.w....',
    '...kOk.w....',
    '...kbk.w....',
    '...kbkw.....',
    '..kbkw......',
    '..kbk.......',
    '..kk........',
  ],
  crossbow: [
    '............',
    '.kk......kk.',
    '.kbkk..kkbk.',
    '..kbbkkbbk..',
    '...kkcckk...',
    '....kcwk....',
    '....kOOk....',
    '....kOOk....',
    '....kOOk....',
    '....kOOk....',
    '....kkkk....',
    '............',
  ],
  boots: [
    '............',
    '............',
    '.kkkk..kkkk.',
    '.kcbk..kcbk.',
    '.kcbk..kcbk.',
    '.kcbk..kcbk.',
    '.kcbk..kcbk.',
    '.kcbbkkkcbbk',
    'kcwbbakcwbbk',
    'kbbbbakbbbak',
    'kkkkkkkkkkkk',
    '............',
  ],
  gauntlet: [
    '............',
    '..kkkkkk....',
    '.kcwcbbbk...',
    '.kccbkbkbk..',
    '.kcbbkbkbk..',
    '.kcbbbbbbkk.',
    '.kcbbbbbbkbk',
    '.kbbbbbbbbk.',
    '..kHhHhHhk..',
    '..khHhHhHk..',
    '..kkkkkkkk..',
    '............',
  ],
  cap: [
    '............',
    '............',
    '............',
    '....kkkk....',
    '...kccbbk...',
    '..kcwcbbak..',
    '..kccbbbak..',
    '.kbbbbbbbak.',
    'kOOOOOOOOOOk',
    '.kkkkkkkkkk.',
    '............',
    '............',
  ],
  jacket: [
    '............',
    '..kk....kk..',
    '.kcbkkkkbak.',
    'kcbbkOOkbbak',
    'kcbbbkkbbbak',
    'kcbbbOkbbbak',
    '.kkbbbkbbkk.',
    '..kbbbObbk..',
    '..kbbbkbak..',
    '..kOOOOOOk..',
    '..kkkkkkkk..',
    '............',
  ],
  hood: [
    '............',
    '....kkkk....',
    '...kccbbk...',
    '..kcwcbbbk..',
    '..kcckkbbk..',
    '.kcbkeekbak.',
    '.kcbkeekbak.',
    '.kcbbkkbbak.',
    '.kbbbbbbbak.',
    'kbbbbbbbbaak',
    'kkkkkkkkkkkk',
    '............',
  ],
  robe: [
    '............',
    '...kk..kk...',
    '..kcbkkbak..',
    '.kcbbggbbak.',
    'kcbkbggbkbak',
    'kbk.kbbk.kak',
    '.k.kcbbbk.k.',
    '...kcbbbak..',
    '..kcbbbbbak.',
    '..kbbbbbbak.',
    '.kggggggggk.',
    '.kkkkkkkkkk.',
  ],
  shoes: [
    '............',
    '............',
    '............',
    '............',
    '..kkk...kkk.',
    '.kcbk..kcbk.',
    '.kcbbk.kcbbk',
    'kcwbbbkcwbbk',
    'kbbbbakbbbak',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  sickle: [
    '............',
    '....kkkk....',
    '...kccbbk...',
    '..kck..kbk..',
    '.kck....kbk.',
    '.kbk.....kk.',
    '.kbk........',
    '..kbk.......',
    '...kkkk.....',
    '.....kOk....',
    '......kOk...',
    '.......kk...',
  ],
  hammer: [
    '............',
    '.kkkkkkk....',
    'kcwcccbbk...',
    'kccbbbbak...',
    'kbbbbbaak...',
    '.kkkOkkk....',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kOk.....',
    '....kkk.....',
  ],
  needle: [
    '..........k.',
    '.........kwk',
    '........kck.',
    '.......kck..',
    '......kck...',
    '.....kck....',
    '....kck.....',
    '...kck.rr...',
    '..kck.r..r..',
    '.kck...rr...',
    '.kk.........',
    '............',
  ],
  plank: [
    '............',
    '............',
    '.kkkkkkkkkk.',
    'kccccccccbbk',
    'kbbbObbbbbak',
    'kkkkkkkkkkkk',
    'kccccccccbbk',
    'kbbbbbbObbak',
    'kkkkkkkkkkkk',
    '............',
    '............',
    '............',
  ],
  leather: [
    '............',
    '..kkkkkkkk..',
    '.kccccbbbbk.',
    '.kcwcbbbbak.',
    '.kcbbbbbbak.',
    'kcbbbbbbbbak',
    'kcbbkkkkbbak',
    'kbbk....kbak',
    '.kk......kk.',
    '............',
    '............',
    '............',
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
  // 养殖：一只小绵羊，羊毛按技能颜色
  sheep: [
    '............',
    '...bcbcb....',
    '..bcwcbcbb..',
    '.bcwccbbcbb.',
    'kkbcccbbbbak',
    'keekbbbbbbak',
    'kewekbbbbaak',
    'keeekbbbaak.',
    '.kkk.kaaak..',
    '.....ke.ke..',
    '.....ke.ke..',
    '.....kk.kk..',
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
  wood: '#c89a60', copper: '#d07a3a', tin: '#d8dce4', iron: '#8a8f99', titanium: '#8ad8ff', runic: '#b070ff', meteor: '#ff8a2a', adamant: '#4ad898',
};
const WOOD: Record<string, string> = {
  plain: '#a87a48', birch: '#e0d8c0', pine: '#d0a860', oak: '#8a6a40', cedar: '#d08060', bloodoak: '#c02a2a', ashbark: '#5a5450', white: '#f4ecc8',
};
const HIDE_TINT = ['#a07a50', '#b8925a', '#7e7e84', '#6a4430', '#e8ecf2', '#8a3a22', '#2e282e', '#5a3e8a'];
const CLOTH_TINT = ['#d8d4cc', '#f4e6c0', '#fcd4dc', '#d4e8fc', '#f0faff', '#f8d070', '#ffa868', '#e8d8ff'];
const SPECIFIC: Record<string, [string, string]> = {
  coins: ['coins', '#f0c850'], bones: ['bones', '#ffffff'], burnt_food: ['food', '#3a2a22'], shaft: ['shaft', '#9a6a3a'],
  sapphire: ['gem', '#3a6ae0'], ruby: ['gem', '#e03a4a'], diamond: ['gem', '#e8f8ff'],
  fert_basic: ['fert', '#8a6a3a'], fert_rich: ['fert', '#6a4a8a'], sprinkler: ['sprinkler', '#5a9ad0'],
  potato: ['veg', '#b08a50'], baked_potato: ['food', '#c8803a'], bread: ['food', '#d8a060'], wheat: ['herb', '#e0c050'],
  green_herb: ['herb', '#6ac04a'], fire_bloom: ['herb', '#f07a3a'], moon_herb: ['herb', '#c0d0ff'],
  silver_leaf: ['herb', '#d0d8d8'], flame_heart: ['herb', '#ff4a2a'], frost_lotus: ['herb', '#8ad8ff'],
};

/** 装备 key → 图标模板 */
const EQUIP_TPL: Record<string, string> = {
  sword: 'sword', spear: 'spear', dagger: 'dagger', shortbow: 'bow', longbow: 'longbow', crossbow: 'crossbow', staff: 'staff',
  handaxe: 'axe', greatshield: 'shield', buckler: 'shield', torch: 'staff', quiver: 'arrow', tome: 'rune',
  plate_head: 'helm', plate_body: 'body', plate_feet: 'boots', plate_hands: 'gauntlet',
  leather_head: 'cap', leather_body: 'jacket', leather_feet: 'boots', leather_hands: 'gloves',
  cloth_head: 'hood', cloth_body: 'robe', cloth_feet: 'shoes', cloth_hands: 'gloves',
  axe: 'axe', pickaxe: 'pickaxe', sickle: 'sickle', knife: 'knife', rod: 'rod', hoe: 'hoe', hammer: 'hammer', needle: 'needle', pan: 'pan',
};

/** 物品 → [模板, 颜色]（矿石、木头、棉花、兽皮另有专门的图，见 resIconUrl） */
export function itemIcon(id: string): [string, string] {
  if (SPECIFIC[id]) return SPECIFIC[id];
  const it = ITEMS[id];
  const tier = it?.tier ?? 0;
  const prefix = id.split('_')[0];
  if (id.startsWith('raw_')) return ['fish', '#8aa0b8'];
  if (id.startsWith('seed_')) return ['seed', CROP_COLOR[id.slice(5)]?.[0] ?? '#c8a040'];
  if (CROP_COLOR[id]) return [CROP_COLOR[id][1] === 'grain' ? 'herb' : 'veg', CROP_COLOR[id][0]];
  // 兽肉、魔核按阶级换颜色
  if (id.startsWith('meat_')) return ['meat', ['#d06a6a', '#c85a5a', '#b84a5a', '#a84050', '#c05080', '#9a3a70', '#7a3a8a', '#d0a040'][tier]];
  if (id.startsWith('steak_')) return ['meat', ['#a8643a', '#a05a30', '#985030', '#904828', '#8a4a40', '#7a3a30', '#6a3a40', '#b07a2a'][tier]];
  if (id.startsWith('core_')) return ['core', ['#a0c070', '#d08a4a', '#c8d0e0', '#8a9098', '#70c8f0', '#b070ff', '#ff8a3a', '#40d898'][tier]];
  // 外圈新材料做的符文、箭、香料料理
  if (id.startsWith('crystal_rune_')) return ['rune', ['#e8eef4', '#a060e0', '#f0d040', '#3aa060', '#3a7ad0', '#c0b0ff', '#ff8a2a', '#7a3ad0'][tier]];
  if (id.startsWith('feather_arrow_')) return ['arrow', ['#a07a50', '#3a3a5a', '#7a5232', '#e8e8e8', '#2aa08a', '#3a5ab0', '#8ad0f0', '#ff8a2a'][tier]];
  if (id.startsWith('spice_meal_')) return ['food', ['#6ac860', '#c8a040', '#b0642e', '#8a4a2a', '#8ac050', '#c02a1a', '#e03a2a', '#9a5ad8'][tier]];
  if (it?.category === 'food') return ['fish', '#d08a4a'];
  if (id.endsWith('_potion')) return ['potion', SPECIFIC[id.replace('_potion', '')]?.[1] ?? '#c04ae0'];
  if (id.startsWith('plank_')) return ['plank', WOOD[TIERS[tier].wood]];
  if (id.startsWith('leather_')) return ['leather', HIDE_TINT[tier]];
  if (id.startsWith('cloth_')) return ['cloth', CLOTH_TINT[tier]];
  if (id.endsWith('_bar')) return ['bar', METAL[prefix] ?? '#aaa'];
  if (id.endsWith('_arrowhead')) return ['arrowhead', METAL[prefix]];
  if (id.endsWith('_arrow')) return ['arrow', METAL[prefix]];
  if (id.endsWith('_rune')) return ['rune', METAL[prefix]];
  const e = it?.equip;
  if (e) {
    if (e.slot === 'ring' || e.slot === 'neck') return [e.slot === 'ring' ? 'ring' : 'amulet', SPECIFIC[prefix]?.[1] ?? '#f0c850'];
    const key = id.slice(prefix.length + 1);
    // 皮甲用皮革色，布甲用布料色，弓和法杖用本阶木色，其余用金属色
    const tint = key.startsWith('leather_') ? HIDE_TINT[tier] : key.startsWith('cloth_') ? CLOTH_TINT[tier]
      : ['shortbow', 'longbow', 'crossbow', 'staff', 'rod'].includes(key) ? WOOD[TIERS[tier].wood] : METAL[prefix] ?? '#c8c8c8';
    return [EQUIP_TPL[key] ?? 'bag', tint];
  }
  return ['bag', '#a08060'];
}

export const SKILL_ICON: Record<SkillId, [string, string]> = {
  mining: ['pickaxe', '#c5cad2'], woodcutting: ['axe', '#c5cad2'], fishing: ['fish', '#5a9ad8'], gathering: ['herb', '#7cc456'], farming: ['hoe', '#c8a040'],
  hunting: ['knife', '#c5cad2'], husbandry: ['sheep', '#f4ecdc'], thieving: ['bag', '#8a7ab8'], cooking: ['food', '#d8a060'], smithing: ['anvil', '#8a8f99'],
  fletching: ['bow', '#c09060'], herblore: ['potion', '#4ab89a'], crafting: ['gem', '#e07ab0'], enhancing: ['stone', '#e8d04a'],
  melee: ['sword', '#c5cad2'], ranged: ['arrow', '#c08040'], magic: ['staff', '#5a7ae8'], defence: ['shield', '#7a8ab8'], hitpoints: ['heart', '#e04a5a'],
};

/** 物品图标；分阶资源右下角标 T1-T8。默认点一下弹出物品详情（用户 10-23），放在按钮里另有用途的传 info={false} */
export function Icon({ item, size = 32, info = true }: { item: string; size?: number; info?: boolean }) {
  const icon = <BareIcon item={item} size={size} />;
  if (!info || !ITEMS[item]) return icon;
  return (
    <span className="icon-info" role="button" title={ITEMS[item].name} onClick={(e) => { e.stopPropagation(); e.preventDefault(); openItem(item); }}>
      {icon}
    </span>
  );
}

/** 装备（武器、盔甲、工具）用逐阶不同造型的大图标（用户 10-23 要求重做，不能只换颜色） */
function equipUrl(id: string): string | null {
  const it = ITEMS[id];
  if (!it?.equip || it.tier === undefined || it.equip.slot === 'ring' || it.equip.slot === 'neck') return null;
  const base = baseOf(id);
  const prefix = base.split('_')[0];
  return equipIconUrl(base.slice(prefix.length + 1), it.tier);
}

/** 福袋、宝箱、首领宝藏、首领战利品和战旗 */
function lootUrl(id: string): string | null {
  const it = ITEMS[id];
  if (!it) return null;
  // 副本钥匙、强化石和碎片、回城卷轴（10-25 副本更新）
  const dg = dungeonIconUrl(id, it.tier);
  if (dg) return dg;
  if (it.tier === undefined) return null;
  if (id.startsWith('worldchest_')) return worldChestIconUrl();
  if (it.boss) {
    const m = MONSTERS[it.boss];
    if (!m) return null;
    return id.startsWith('banner_') ? bannerIconUrl(m.art.color, m.art.accent, m.family) : trophyIconUrl(m.art.color, m.art.accent, m.family);
  }
  if (id.startsWith('luckybag_')) return luckyBagIconUrl(it.tier);
  if (id.startsWith('bosschest_')) return chestIconUrl(it.tier, true);
  if (id.startsWith('chest_')) return chestIconUrl(it.tier, false);
  return null;
}

/** 物品图标的图片地址（家园岛上摆战利品用） */
export function itemImageUrl(item: string): string | undefined {
  if (!ITEMS[item]) return undefined;
  if (item === HW_BOX) return pumpkinBoxUrl();
  if (item === FOAL) return foalIconUrl();
  if (item.startsWith('mount_')) return mountIconUrl(item);
  if (item === HW_POINT) return pumpkinPointUrl();
  const res = resIconUrl(item) ?? equipUrl(item) ?? lootUrl(item);
  if (res) return res;
  const [tpl, tint] = itemIcon(baseOf(item));
  return iconUrl(tpl, tint);
}

/** 装备品质（用户 10-25）：图标外加一圈品质色的边框，普通不加 */
function BareIcon({ item, size }: { item: string; size: number }) {
  const q = ITEMS[item]?.quality ?? 0;
  if (!q) return <PlainIcon item={item} size={size} />;
  return <span className={`qual q${q}`} style={{ width: size, height: size }}><PlainIcon item={item} size={size} /></span>;
}

function PlainIcon({ item, size }: { item: string; size: number }) {
  // 万圣节活动：南瓜礼盒、南瓜积分
  if (item === HW_BOX || item === HW_POINT) return <img className="icon" src={item === HW_BOX ? pumpkinBoxUrl() : pumpkinPointUrl()} width={size} height={size} alt="" draggable={false} />;
  if (item.startsWith('mount_')) return <img className="icon" src={mountIconUrl(item)} width={size} height={size} alt="" draggable={false} />;
  if (item === FOAL) return <img className="icon" src={foalIconUrl()} width={size} height={size} alt="" draggable={false} />;
  const res = resIconUrl(item) ?? equipUrl(item) ?? lootUrl(item);
  if (res) {
    const tier = ITEMS[item].tier;
    if (tier === undefined) return <img className="icon" src={res} width={size} height={size} alt="" draggable={false} />;
    return (
      <span className="icon-tier" style={{ width: size, height: size }}>
        <img className="icon" src={res} width={size} height={size} alt="" draggable={false} />
        {size >= 22 && <b className={`tier t${tier + 1}`}>{tierName(tier)}</b>}
      </span>
    );
  }
  const [tpl, tint] = itemIcon(baseOf(item));
  const tier = ITEMS[item]?.tier;
  const img = <img className="icon" src={iconUrl(tpl, tint)} width={size} height={size} alt="" draggable={false} />;
  if (tier === undefined || size < 22) return img;
  return (
    <span className="icon-tier" style={{ width: size, height: size }}>
      {img}
      <b className={`tier t${tier + 1}`}>{tierName(tier)}</b>
    </span>
  );
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
