import { mix, Pix } from './pix';
import { COATS, drawHorseLook, HORSE_ANIMS, HORSE_FEET, HORSE_H, HORSE_W, horseSaddle, lastHornTip, ramp, type Look, type UniLook } from './horseArt';

/*
 * 粉色独角兽坐骑「晨曦独角兽」（用户 11-02）：用坐骑马的骨架和动作（四拍跑步、待机、吃草、嘶鸣），
 * 换成樱粉的身子、金色螺旋角、彩虹长鬃长尾、金蹄、紫晶眼、淡紫鞍褥，鬃毛边上一闪一闪的小星。
 * 帧和马一样大（64×44，脚底第 42 行），后层/前层夹着骑手。地图上的光尘特效在 unicornFx.ts。
 */

export const UNI_W = HORSE_W;
export const UNI_H = HORSE_H;
export const UNI_FEET = HORSE_FEET;
export const UNI_ANIMS = HORSE_ANIMS;

const BODY = '#f6a8cf';
/** 彩虹鬃尾的五种颜色：粉、薰衣草紫、天蓝、薄荷、奶黄（各自补成 5 阶） */
const RAINBOW = ['#ff58b4', '#b888ff', '#78c8ff', '#9af0dc', '#fff0a0'].map((c) => ramp(c));
const GOLD = ['#8a5a10', '#c8921c', '#f0c040', '#ffe48a', '#fff8d8'];
const UNI: UniLook = {
  horn: GOLD,
  rainbow: RAINBOW,
  hoof: GOLD,
  leather: ['#b0789a', '#e0a8c8', '#f6d2e6', '#fff0f8'],
  eye: '#7a3cc8',
  blanket: ramp('#d8c0ff'),
  sparkle: ['#ffd8f0', '#ffffff'],
};
const LOOK: Look = {
  R: ramp(BODY),
  M: ramp('#ff7fc8'),
  coat: { ...COATS[0], body: BODY, mane: '#ff7fc8', blanket: '#d8c0ff', sock: false },
  saddle: true,
  uni: UNI,
};

export const unicornSaddle = horseSaddle;

/** 每帧角尖的位置（画精灵表时记下来） */
const tips = new Map<string, [number, number]>();
/** 一帧（后层、前层） */
export function unicornFrame(key: string, i: number, n: number): [Pix, Pix] {
  const r = drawHorseLook(LOOK, key, i, n);
  if (lastHornTip) tips.set(`${key}-${i}`, lastHornTip);
  return r;
}

export const UNICORN_KIND = 'unicorn';

/** 整张精灵表：每帧 `unicorn-${key}-${i}-b` / `-f` */
export function paintUnicornSheet() {
  const total = UNI_ANIMS.reduce((k, a) => k + a.frames * 2, 0);
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * UNI_W;
  canvas.height = Math.ceil(total / cols) * UNI_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of UNI_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      unicornFrame(a.key, i, a.frames).forEach((pix, j) => {
        const x = (k % cols) * UNI_W;
        const y = Math.floor(k / cols) * UNI_H;
        ctx.drawImage(pix.canvas(), x, y);
        frames.push({ name: `${UNICORN_KIND}-${a.key}-${i}-${j ? 'f' : 'b'}`, x, y });
        k++;
      });
    }
  }
  return { canvas, frames };
}

let icon = '';
/** 物品图标：侧面站着那一帧 */
export function unicornMountIconUrl() {
  if (icon) return icon;
  const [b, f] = unicornFrame('idle-side', 0, 24);
  const c = document.createElement('canvas');
  c.width = 46;
  c.height = 46;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(b.canvas(), -10, 2);
  ctx.drawImage(f.canvas(), -10, 2);
  icon = c.toDataURL();
  return icon;
}

/** 这一帧角尖的位置（相对脚底中心，侧面按朝右算）：角尖光点特效用 */
export function unicornHornTip(frameName: string): [number, number][] {
  const m = /^unicorn-(.+)-(\d+)-[bf]$/.exec(frameName);
  const tip = m && tips.get(`${m[1]}-${m[2]}`);
  return tip ? [tip] : [];
}

export const UNI_BODY = BODY;
export const UNI_RAINBOW = RAINBOW.map((r) => r[3]);
export const uniMix = mix;
