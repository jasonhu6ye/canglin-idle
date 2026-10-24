import { skullUrl } from '../game/skullArt';
import { pumpkinPointUrl } from '../game/halloweenArt';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, DANGER, dangerLevel, MAP_H, MAP_W, MID_BOX, MONSTERS, NODES, OLD_BOX, REGIONS, SKILLS, standOf, travelMs, type MapNode } from '../core/data';
import { TOWNS } from '../core/towns';
import { combatLevel, moveSpeed } from '../core/sim';
import type { GameState, RegionId, SkillId } from '../core/types';
import { playerPos } from '../game/MapScene';
import { GROUND_COLOR } from '../game/tiles';
import { overviewGround } from '../game/world';
import { emitToGame } from './GameCanvas';
import { MonsterIcon } from './Bestiary';
import { store } from '../store';
import { FINE_POINTER } from './itemOpen';

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

/** 老地图的区域名字按老方框里的相对位置算 */
const inBox = (u: number, v: number): [number, number] => [(OLD_BOX.x + u * OLD_BOX.size) / MAP_W, (OLD_BOX.y + v * OLD_BOX.size) / MAP_H];
/** 8848 那一圈按 8848 方框里的相对位置算 */
const inMid = (u: number, v: number): [number, number] => [(MID_BOX.x + u * MID_BOX.size) / MAP_W, (MID_BOX.y + v * MID_BOX.size) / MAP_H];
/** 区域名字摆放的位置（0-1） */
const LABELS: Record<RegionId, [number, number]> = {
  town: inBox(0.47, 0.53), snow: inBox(0.46, 0.06), highland: inBox(0.8, 0.28), coast: inBox(0.8, 0.45), lava: inBox(0.74, 0.86),
  abyss: inBox(0.45, 0.86), swamp: inBox(0.13, 0.82), woodland: inBox(0.15, 0.42), giantwood: inBox(0.13, 0.2),
  savanna: inMid(0.08, 0.47), autumn: inMid(0.1, 0.12), jungle: inMid(0.1, 0.85), tropic: inMid(0.92, 0.55),
  canyon: inMid(0.9, 0.18), desert: inMid(0.9, 0.86), alpine: inMid(0.5, 0.05), crystal: inMid(0.52, 0.9),
  hills: [0.06, 0.36], vineisles: [0.08, 0.04], moonmire: [0.06, 0.74], archipelago: [0.95, 0.45],
  frostpeak: [0.5, 0.04], ashcape: [0.92, 0.92], thunder: [0.9, 0.03], starsea: [0.5, 0.97],
};
/** 城镇在世界地图上只标一个点（新城镇标在仓库上） */
const TOWN_MARK: Record<string, string> = { smithy: '苍岭城', market2: '落霞城', ...Object.fromEntries(TOWNS.map((t) => [`${t.id}_bank`, t.name])) };

const MAX_ZOOM = 8;

/** 世界地图筛选（用户 10-23）：按用途看地点 */
type Filter = 'all' | 'stone' | 'town' | 'boss' | 'world' | 'event' | 'cave' | SkillId;
const FILTERS: [Filter, string][] = [
  ['all', '全部'], ['stone', '传送石碑'], ['town', '城镇'], ['mining', '采矿'], ['woodcutting', '伐木'], ['fishing', '钓鱼'],
  ['gathering', '采集'], ['hunting', '狩猎'], ['thieving', '偷窃'], ['boss', '首领'], ['world', '世界首领'], ['event', '活动'], ['cave', '洞窟'],
];
const skillsOf = (n: MapNode) => new Set(n.actions.map((id) => ACTIONS[id]).flatMap((a) => (a.kind === 'skill' ? [a.skill] : [])));
function passes(n: MapNode, f: Filter) {
  if (f === 'all') return true;
  if (f === 'stone') return !!n.waystone;
  if (f === 'town') return !!TOWN_MARK[n.id];
  if (f === 'cave') return !!n.cave;
  if (f === 'world') return !!n.world;
  if (f === 'event') return !!n.event;
  if (f === 'boss') return n.sprite === 'boss' || !!n.world || n.actions.some((id) => { const a = ACTIONS[id]; return a.kind === 'combat' && MONSTERS[a.monster].rank === 'boss'; });
  return skillsOf(n).has(f);
}

export function WorldMap({ s, onClose, onOpenNode }: { s: GameState; onClose: () => void; onOpenNode: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    try { return (localStorage.getItem('canglin-wm-filter') as Filter) || 'all'; } catch { return 'all'; }
  });
  const pickFilter = (f: Filter) => {
    setFilter(f);
    try { localStorage.setItem('canglin-wm-filter', f); } catch { /* 存不了就算了 */ }
  };
  const scroller = useRef<HTMLDivElement>(null);
  const url = useMemo(overview, []);
  const cl = combatLevel(s);
  const me = { x: playerPos.x / MAP_W, y: playerPos.y / MAP_H };

  // 缩放后：滚轮缩放时让光标下的那一点不动，按钮缩放时以画面中心为准，第一次打开对准角色
  const anchor = useRef<{ u: number; v: number; mx: number; my: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const a = anchor.current ?? { u: me.x, v: me.y, mx: el.clientWidth / 2, my: el.clientHeight / 2 };
    anchor.current = null;
    el.scrollLeft = a.u * el.scrollWidth - a.mx;
    el.scrollTop = a.v * el.scrollHeight - a.my;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 以屏幕上 (mx,my) 这一点为中心缩放 */
  const zoomAt = (next: number, mx?: number, my?: number) => {
    const el = scroller.current;
    const z = Math.max(1, Math.min(MAX_ZOOM, next));
    if (!el || z === zoom) return;
    const x = mx ?? el.clientWidth / 2;
    const y = my ?? el.clientHeight / 2;
    anchor.current = { u: (el.scrollLeft + x) / el.scrollWidth, v: (el.scrollTop + y) / el.scrollHeight, mx: x, my: y };
    setZoom(z);
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  // 电脑端：滚轮自由缩放（用户 10-23 要求），按住左键拖动地图
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0012));
      zoomRef.current(zoomNow.current * k, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scroller.current!;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const el = scroller.current!;
    el.scrollLeft = d.sl - dx;
    el.scrollTop = d.st - dy;
  };
  const onPointerUp = () => {
    // 拖动过就不算点击地点
    const moved = drag.current?.moved;
    drag.current = null;
    if (moved) {
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    }
  };

  const node = sel ? NODES.find((n) => n.id === sel)! : null;
  return (
    <div className="worldmap">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>世界地图</h2>
        <span className="zoom-btns">
          <button onClick={() => zoomAt(zoom / 1.4)} disabled={zoom <= 1}>－</button>
          <button className="zoom-val" onClick={() => zoomAt(1)} title="还原">{zoom.toFixed(1)}×</button>
          <button onClick={() => zoomAt(zoom * 1.4)} disabled={zoom >= MAX_ZOOM}>＋</button>
        </span>
      </div>
      <div className="chips-row wm-filter">
        {FILTERS.map(([id, name]) => (
          <button key={id} className={`pill ${filter === id ? 'on' : ''}`} onClick={() => pickFilter(id)}>{name}</button>
        ))}
      </div>
      <div className={`wm-scroll ${FINE_POINTER ? 'grab' : ''}`} ref={scroller} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div className="wm-canvas" style={{ width: `${zoom * 100}%` }}>
          <img src={url} alt="" draggable={false} />
          {(Object.keys(LABELS) as RegionId[]).map((r) => (
            <span key={r} className="wm-region" style={{ left: `${LABELS[r][0] * 100}%`, top: `${LABELS[r][1] * 100}%` }}>{REGIONS[r].name}</span>
          ))}
          {NODES.filter((n) => (!n.town || n.pond || TOWN_MARK[n.id] || n.waystone) && passes(n, filter)).map((n) => {
            const d = n.town && !n.pond ? 0 : dangerLevel(n, cl);
            const lit = n.waystone && s.waystones?.includes(n.id);
            const name = n.waystone ? n.name.replace('传说石碑·', '石碑·') : TOWN_MARK[n.id] ?? n.name;
            const big = n.site || n.world || n.event || TOWN_MARK[n.id] || (n.waystone && filter === 'stone');
            return (
              <button key={n.id} className={`wm-node ${sel === n.id ? 'sel' : ''} ${n.cave ? 'cave' : ''} ${n.waystone ? `stone ${lit ? 'lit' : ''}` : ''}`} style={{ left: `${(n.x / MAP_W) * 100}%`, top: `${(n.y / MAP_H) * 100}%` }}
                onClick={() => setSel(n.id)}>
                {/* 世界首领：红色骷髅头（用户 10-24） */}
                {n.event ? <img className="wm-skull wm-pumpkin" src={pumpkinPointUrl()} alt="" draggable={false} /> : n.world ? <img className="wm-skull" src={skullUrl()} alt="" draggable={false} /> : <i style={n.waystone ? undefined : { background: n.cave ? '#2a2030' : DANGER[d].color }} />}
                {/* 特色地点和城镇一直标名字 */}
                {(zoom > 1 || big) && <span className={n.event ? 'site event' : n.world ? 'site world' : big ? 'site' : ''}>{n.world ? `☠ ${name}` : name}</span>}
              </button>
            );
          })}
          <span className="wm-me" style={{ left: `${me.x * 100}%`, top: `${me.y * 100}%` }} />
        </div>
      </div>
      <div className="wm-legend">
        {DANGER.map((d) => <span key={d.name}><i style={{ background: d.color }} />{d.name}</span>)}
        <span><i className="stone-mark" />石碑（已激活）</span>
        <span><i className="stone-mark off" />石碑（未激活）</span>
        <span><img className="wm-skull-mini" src={skullUrl()} alt="" />世界首领</span>
        <span><i className="me" />你</span>
        {FINE_POINTER && <span className="wm-hint">滚轮缩放 · 按住左键拖动</span>}
      </div>
      {node && (
        <NodeCard s={s} nodeId={node.id} cl={cl} onOpen={() => onOpenNode(node.id)}
          onWalk={() => { emitToGame('walkto', node.id); onClose(); }} />
      )}
    </div>
  );
}

function NodeCard({ s, nodeId, cl, onOpen, onWalk }: { s: GameState; nodeId: string; cl: number; onOpen: () => void; onWalk: () => void }) {
  const n = NODES.find((x) => x.id === nodeId)!;
  const d = DANGER[n.town && !n.pond ? 0 : dangerLevel(n, cl)];
  const monsters = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat').map((a) => a.kind === 'combat' ? MONSTERS[a.monster] : null);
  const skills = [...new Set(n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill').map((a) => (a.kind === 'skill' ? SKILLS[a.skill].name : '')))];
  return (
    <div className="wm-card frame">
      <div className="row1">
        <b>{TOWN_MARK[n.id] ?? n.name}</b>
        <span style={{ color: d.color }}>危险度：{d.name}</span>
      </div>
      <small className="muted">{REGIONS[n.region].name}{!n.town && !n.cave && ` · Lv${n.lv[0]}${n.lv[1] !== n.lv[0] ? `-${n.lv[1]}` : ''}`}</small>
      {n.cave && <span>大型洞窟 · 尚未开放，敬请期待</span>}
      {n.waystone && <span>{s.waystones?.includes(n.id) ? '已激活：站在任意一座激活过的石碑旁就能传送到这里' : '未激活：走到石碑旁边就会激活'}</span>}
      {skills.length > 0 && <span>可练：{skills.join('、')}</span>}
      {monsters.length > 0 && (
        <span className="wm-mons">
          <small className="muted">点怪物去追踪：Boss 和交过手的能找到准确位置，其他只到大概的刷新区域</small>
          {monsters.map((m) => (
            <button key={m!.id} className="pill" onClick={() => store.track(m!.id)}>
              <MonsterIcon m={m!} size={18} /> {m!.name} {m!.level}{m!.world ? ' 世界首领' : m!.rank === 'boss' ? ' Boss' : m!.rank === 'elite' ? ' 精英' : ''}
            </button>
          ))}
        </span>
      )}
      <div className="go">
        <button className="primary" onClick={onWalk}>寻路前往 · 约 {Math.ceil(travelMs(playerPos, standOf(n), moveSpeed(store.state)) / 1000)} 秒</button>
        {!TOWN_MARK[n.id] && (n.town || skills.length > 0 || n.waystone) && <button onClick={onOpen}>{n.waystone ? '打开石碑' : '查看任务'}</button>}
      </div>
    </div>
  );
}
