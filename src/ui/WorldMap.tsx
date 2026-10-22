import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, DANGER, dangerLevel, MAP_H, MAP_W, MONSTERS, NODES, REGIONS, SKILLS, standOf, travelMs } from '../core/data';
import { combatLevel } from '../core/sim';
import type { GameState, RegionId } from '../core/types';
import { playerPos } from '../game/MapScene';
import { GROUND_COLOR } from '../game/tiles';
import { overviewGround } from '../game/world';
import { emitToGame } from './GameCanvas';
import { MonsterIcon } from './Bestiary';
import { store } from '../store';

/** 缩略图每像素代表几格 */
const STEP = Math.max(3, Math.round(MAP_W / 500));
let overviewUrl: string | null = null;

function overview(): string {
  if (overviewUrl) return overviewUrl;
  const w = Math.ceil(MAP_W / STEP);
  const h = Math.ceil(MAP_H / STEP);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rgb = Object.fromEntries(Object.entries(GROUND_COLOR).map(([k, v]) => [k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = overviewGround(Math.min(MAP_W - 1, x * STEP + 1), Math.min(MAP_H - 1, y * STEP + 1));
      const [r, gg, b] = g === 'road' ? [200, 160, 100] : rgb[g];
      const o = (y * w + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  overviewUrl = c.toDataURL();
  return overviewUrl;
}

/** 区域名字摆放的位置（0-1） */
const LABELS: Record<RegionId, [number, number]> = {
  town: [0.47, 0.53], snow: [0.46, 0.06], highland: [0.8, 0.28], coast: [0.8, 0.45], lava: [0.74, 0.86],
  abyss: [0.45, 0.86], swamp: [0.13, 0.82], woodland: [0.15, 0.42], giantwood: [0.13, 0.2],
};

export function WorldMap({ s, onClose, onOpenNode }: { s: GameState; onClose: () => void; onOpenNode: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const url = useMemo(overview, []);
  const cl = combatLevel(s);
  const me = { x: playerPos.x / MAP_W, y: playerPos.y / MAP_H };

  // 放大后滚到角色位置
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = me.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = me.y * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const node = sel ? NODES.find((n) => n.id === sel)! : null;
  return (
    <div className="worldmap">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>世界地图</h2>
        <span className="zoom-btns">
          {[1, 2, 3].map((z) => <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z}×</button>)}
        </span>
      </div>
      <div className="wm-scroll" ref={scroller}>
        <div className="wm-canvas" style={{ width: `${zoom * 100}%` }}>
          <img src={url} alt="" draggable={false} />
          {(Object.keys(LABELS) as RegionId[]).map((r) => (
            <span key={r} className="wm-region" style={{ left: `${LABELS[r][0] * 100}%`, top: `${LABELS[r][1] * 100}%` }}>{REGIONS[r].name}</span>
          ))}
          {NODES.filter((n) => !n.town || n.pond || n.id === 'smithy').map((n) => {
            const d = n.town && !n.pond ? 0 : dangerLevel(n, cl);
            const name = n.id === 'smithy' ? '城镇' : n.name;
            return (
              <button key={n.id} className={`wm-node ${sel === n.id ? 'sel' : ''}`} style={{ left: `${(n.x / MAP_W) * 100}%`, top: `${(n.y / MAP_H) * 100}%` }}
                onClick={() => setSel(n.id)}>
                <i style={{ background: DANGER[d].color }} />
                {zoom > 1 && <span>{name}</span>}
              </button>
            );
          })}
          <span className="wm-me" style={{ left: `${me.x * 100}%`, top: `${me.y * 100}%` }} />
        </div>
      </div>
      <div className="wm-legend">
        {DANGER.map((d) => <span key={d.name}><i style={{ background: d.color }} />{d.name}</span>)}
        <span><i className="me" />你</span>
      </div>
      {node && (
        <NodeCard nodeId={node.id} cl={cl} onOpen={() => onOpenNode(node.id)}
          onWalk={() => { emitToGame('walkto', node.id); onClose(); }} />
      )}
    </div>
  );
}

function NodeCard({ nodeId, cl, onOpen, onWalk }: { nodeId: string; cl: number; onOpen: () => void; onWalk: () => void }) {
  const n = NODES.find((x) => x.id === nodeId)!;
  const d = DANGER[n.town && !n.pond ? 0 : dangerLevel(n, cl)];
  const monsters = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat').map((a) => a.kind === 'combat' ? MONSTERS[a.monster] : null);
  const skills = [...new Set(n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill').map((a) => (a.kind === 'skill' ? SKILLS[a.skill].name : '')))];
  return (
    <div className="wm-card frame">
      <div className="row1">
        <b>{n.id === 'smithy' ? '城镇' : n.name}</b>
        <span style={{ color: d.color }}>危险度：{d.name}</span>
      </div>
      <small className="muted">{REGIONS[n.region].name}{!n.town && ` · Lv${n.lv[0]}${n.lv[1] !== n.lv[0] ? `-${n.lv[1]}` : ''}`}</small>
      {skills.length > 0 && <span>可练：{skills.join('、')}</span>}
      {monsters.length > 0 && (
        <span className="wm-mons">
          <small className="muted">点怪物去追踪：Boss 和交过手的能找到准确位置，其他只到大概的刷新区域</small>
          {monsters.map((m) => (
            <button key={m!.id} className="pill" onClick={() => store.track(m!.id)}>
              <MonsterIcon m={m!} size={18} /> {m!.name} {m!.level}{m!.rank === 'boss' ? ' Boss' : m!.rank === 'elite' ? ' 精英' : ''}
            </button>
          ))}
        </span>
      )}
      <div className="go">
        <button className="primary" onClick={onWalk}>寻路前往 · 约 {Math.ceil(travelMs(playerPos, standOf(n)) / 1000)} 秒</button>
        {n.id !== 'smithy' && (n.town || skills.length > 0) && <button onClick={onOpen}>查看任务</button>}
      </div>
    </div>
  );
}
