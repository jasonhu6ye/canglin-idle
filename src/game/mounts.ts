import type Phaser from 'phaser';
import { aptOf } from '../core/ranch';
import { coatOf, horseKind, horseSaddle, HORSE_ANIMS, paintHorseSheet } from './horseArt';
import { HW_MOUNT } from '../core/halloween';
import { paintPumpkinSheet, pumpkinSaddle, PK_ANIMS } from './pumpkinArt';
import { paintWolfSheet, wolfSaddle, WOLF_ANIMS, WOLF_H, WOLF_W } from './wolfArt';

/** 坐骑的种类：狼 wolf，马按毛色 horse0…horse3，南瓜 pumpkin（主角和其他玩家共用） */
export function mountKindOf(id: string | undefined) {
  if (id === HW_MOUNT) return 'pumpkin';
  const apt = aptOf(id);
  return apt ? horseKind(coatOf(apt)) : 'wolf';
}

/** 第一次用到某种坐骑时才画它的精灵表；动画名 mount:<种类>-<动作>-<层> */
export function ensureMountTex(scene: Phaser.Scene, kind: string) {
  const tex = `mount-${kind}`;
  if (scene.textures.exists(tex)) return;
  const horse = kind.startsWith('horse');
  const pk = kind === 'pumpkin';
  const sheet = pk ? paintPumpkinSheet() : horse ? paintHorseSheet(Number(kind.slice(5))) : paintWolfSheet();
  const t = scene.textures.addCanvas(tex, sheet.canvas)!;
  for (const f of sheet.frames) t.add(f.name, 0, f.x, f.y, WOLF_W, WOLF_H);
  const list = pk ? PK_ANIMS : horse ? HORSE_ANIMS : WOLF_ANIMS.map((a) => ({ ...a, key: a.key.slice(5) }));
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

/** 骑手坐在背上的位置（相对脚底，侧面按朝右算）；马背比狼背高 */
export function seatOf(kind: string, dir: 'side' | 'down' | 'up') {
  const up = kind === 'wolf' ? 0 : kind === 'pumpkin' ? PK_SEAT : 5;
  return dir === 'side' ? { x: -3, y: -16 - up } : dir === 'down' ? { x: 0, y: -19 - up } : { x: 0, y: -17 - up };
}

/** 跑动时背随着步子起伏：按坐骑前层当前帧算 */
export function saddleBob(frameName: string) {
  const m = /^([a-z]+\d?)-(.+)-(\d+)-f$/.exec(frameName);
  return !m ? 0 : m[1] === 'pumpkin' ? pumpkinSaddle(m[2], +m[3]) : m[1] === 'wolf' ? wolfSaddle(`wolf-${m[2]}`, +m[3]) : horseSaddle(m[2], +m[3]);
}

/** 坐骑在旁边等的时候离人多远（马比狼大） */
export const besideXOf = (kind: string) => (kind === 'wolf' ? -22 : -26);
/** 南瓜顶比狼背高多少 */
const PK_SEAT = 13;
