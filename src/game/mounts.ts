import type Phaser from 'phaser';
import { aptOf } from '../core/ranch';
import { coatOf, horseKind, horseSaddle, HORSE_ANIMS, paintHorseSheet } from './horseArt';
import { HW_MOUNT } from '../core/halloween';
import { UNICORN_MOUNT } from '../core/data';
import type { Pix } from './pix';
import { paintPumpkinSheet, pumpkinFrame, pumpkinSaddle, PK_ANIMS } from './pumpkinArt';
import { paintWolfSheet, wolfFrame, wolfSaddle, WOLF_ANIMS, WOLF_FEET, WOLF_H, WOLF_W } from './wolfArt';
import { paintUnicornSheet, unicornFrame, unicornHornTip, unicornSaddle, UNI_ANIMS } from './unicornArt';
import { pumpkinEyes } from './pumpkinArt';
import { PumpkinFx, type PkState } from './pumpkinFx';
import { UnicornFx } from './unicornFx';

/** 坐骑的种类：狼 wolf，马按毛色 horse0…horse3，南瓜 pumpkin，独角兽 unicorn（主角和其他玩家共用） */
export function mountKindOf(id: string | undefined) {
  if (id === HW_MOUNT) return 'pumpkin';
  if (id === UNICORN_MOUNT) return 'unicorn';
  const apt = aptOf(id);
  return apt ? horseKind(coatOf(apt)) : 'wolf';
}

/** 第一次用到某种坐骑时才画它的精灵表；动画名 mount:<种类>-<动作>-<层> */
export function ensureMountTex(scene: Phaser.Scene, kind: string) {
  const tex = `mount-${kind}`;
  if (scene.textures.exists(tex)) return;
  const horse = kind.startsWith('horse');
  const pk = kind === 'pumpkin';
  const un = kind === 'unicorn';
  const sheet = un ? paintUnicornSheet() : pk ? paintPumpkinSheet() : horse ? paintHorseSheet(Number(kind.slice(5))) : paintWolfSheet();
  const t = scene.textures.addCanvas(tex, sheet.canvas)!;
  const fr = mountFrameOf(kind);
  for (const f of sheet.frames) t.add(f.name, 0, f.x, f.y, fr.w, fr.h);
  const list = un ? UNI_ANIMS : pk ? PK_ANIMS : horse ? HORSE_ANIMS : WOLF_ANIMS.map((a) => ({ ...a, key: a.key.slice(5) }));
  for (const a of list) {
    for (const layer of ['b', 'f']) {
      const key = `mount:${kind}-${a.key}-${layer}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key, frameRate: a.rate, repeat: a.key === 'howl' ? 0 : -1,
        frames: Array.from({ length: a.frames }, (_, i) => ({ key: tex, frame: `${kind}-${a.key}-${i}-${layer}` })),
      });
    }
  }
}

/** 每种坐骑一帧多大、脚底在哪一行（现在都和狼一样）；精灵的 origin 用 feet/h */
export function mountFrameOf(_kind: string) {
  return { w: WOLF_W, h: WOLF_H, feet: WOLF_FEET };
}

/** 骑手坐在背上的位置（相对脚底，侧面按朝右算）；马和独角兽的背比狼背高 */
export function seatOf(kind: string, dir: 'side' | 'down' | 'up') {
  const up = kind === 'wolf' ? 0 : kind === 'pumpkin' ? PK_SEAT : 5;
  // 南瓜正面、背面：屁股压进南瓜顶，跨开的小腿藏到南瓜前层后面，看着是坐在上面（用户 10-30）
  const sink = kind === 'pumpkin' ? 6 : 0;
  return dir === 'side' ? { x: -3, y: -16 - up } : dir === 'down' ? { x: 0, y: -19 - up + sink } : { x: 0, y: -17 - up + sink };
}

/** 跑动时背随着步子起伏：按坐骑前层当前帧算 */
export function saddleBob(frameName: string) {
  const m = /^([a-z]+\d?)-(.+)-(\d+)-f$/.exec(frameName);
  return !m ? 0 : m[1] === 'unicorn' ? unicornSaddle(m[2], +m[3]) : m[1] === 'pumpkin' ? pumpkinSaddle(m[2], +m[3]) : m[1] === 'wolf' ? wolfSaddle(`wolf-${m[2]}`, +m[3]) : horseSaddle(m[2], +m[3]);
}

/** 坐骑在旁边等的时候离人多远（马比狼大） */
export const besideXOf = (kind: string) => (kind === 'wolf' ? -22 : -26);
/** 南瓜顶比狼背高多少 */
const PK_SEAT = 13;

/** 带特效的坐骑：地图上跟着它走的光、火星等（南瓜、独角兽）；没有的返回 undefined */
export interface MountFx { step(time: number, o: PkState | null): void; burst(x: number, y: number, depth: number): void; destroy(): void }
export function mountFxOf(scene: Phaser.Scene, kind: string): MountFx | undefined {
  return kind === 'pumpkin' ? new PumpkinFx(scene) : kind === 'unicorn' ? new UnicornFx(scene) : undefined;
}
/** 这一帧眼睛（独角兽是角尖）的位置（相对脚底中心，侧面按朝右算），给眼睛/角尖特效用 */
export function mountEyes(kind: string, frameName: string): [number, number][] {
  return kind === 'pumpkin' ? pumpkinEyes(frameName) : kind === 'unicorn' ? unicornHornTip(frameName) : [];
}

/** 衣橱「坐骑」栏展示的限定坐骑（马在畜牧站养，不在这里） */
export const MOUNT_GALLERY: { kind: string; id: string }[] = [
  { kind: 'wolf', id: 'mount_danmark' },
  { kind: 'pumpkin', id: HW_MOUNT },
  { kind: 'unicorn', id: UNICORN_MOUNT },
];
/** 衣橱预览用：侧面待机第 i 帧（24 帧，10 帧/秒）的后层和前层 */
export function mountPreviewFrame(kind: string, i: number): [Pix, Pix] {
  return kind === 'unicorn' ? unicornFrame('idle-side', i, 24) : kind === 'pumpkin' ? pumpkinFrame('idle-side', i, 24) : wolfFrame('wolf-idle-side', i, 24);
}
