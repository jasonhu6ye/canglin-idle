import { skullUrl } from '../game/skullArt';
import { pumpkinPointUrl } from '../game/halloweenArt';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, DANGER, dangerLevel, MAIN_SIZE, MAP_H, MAP_W, MID_BOX, MONSTERS, NODES, OLD_BOX, REGIONS, SKILLS, planRoute, standOf, type MapNode } from '../core/data';
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
import { hwGone } from '../core/halloween';
import { inRealm, isRealmRegion, MYSTERY_BOX, mmss, nextWindow, REALM_BOX, REALM_SEEDS, timedWindow } from '../core/realm';
import { isEn, tl } from '../i18n';

/**
 * 世界地图分两张（11-01 加了永冬冰原）：主大陆 12080 和东边的冰原，冰原隔着深海、只能走传送门，
 * 所以不画在一张图上，顶上切换。打开时显示角色所在的那张。
 */
type ViewId = 'main' | 'realm';
const PAD = 160;
const VIEWS: Record<ViewId, { x: number; y: number; w: number; h: number }> = {
  main: { x: 0, y: 0, w: MAIN_SIZE, h: MAIN_SIZE },
  // 北边接着 1444 的神秘区域（暂未开放，画成一片黑雾）
  realm: { x: REALM_BOX.x - PAD, y: MYSTERY_BOX.y - PAD, w: REALM_BOX.size + PAD * 2, h: REALM_BOX.y + REALM_BOX.size - MYSTERY_BOX.y + PAD * 2 },
};
const inView = (v: ViewId, p: { x: number; y: number }) => (v === 'realm') === inRealm(p);
const overviewUrl: Partial<Record<ViewId, string>> = {};

function overview(view: ViewId): string {
  const have = overviewUrl[view];
  if (have) return have;
  const V = VIEWS[view];
  /** 缩略图每像素代表几格 */
  const STEP = Math.max(3, Math.round(V.w / 500));
  const w = Math.ceil(V.w / STEP);
  const h = Math.ceil(V.h / STEP);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rgb = Object.fromEntries(Object.entries(GROUND_COLOR).map(([k, v]) => [k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = Math.min(MAP_W - 1, V.x + x * STEP + 1), wy = Math.min(MAP_H - 1, V.y + y * STEP + 1);
      const g = overviewGround(wx, wy);
      let [r, gg, b] = g === 'road' ? [200, 160, 100] : rgb[g];
      // 神秘区域：黑雾盖住，边上淡出一点
      const fog = view === 'realm' ? mysteryFog(wx, wy) : 0;
      if (fog > 0) {
        const swirl = 10 + 14 * Math.sin(wx * 0.011 + Math.sin(wy * 0.007) * 3) * Math.sin(wy * 0.009 + wx * 0.002);
        const k = Math.min(1, fog);
        r = r * (1 - k) + (14 + swirl * 0.6) * k;
        gg = gg * (1 - k) + (12 + swirl * 0.5) * k;
        b = b * (1 - k) + (24 + swirl) * k;
      }
      const o = (y * w + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return (overviewUrl[view] = c.toDataURL());
}

/** 神秘区域的黑雾浓度：里面全黑，外面 120 格淡出 */
function mysteryFog(x: number, y: number) {
  const M = MYSTERY_BOX;
  const dx = Math.max(M.x - x, x - (M.x + M.size - 1), 0);
  const dy = Math.max(M.y - y, y - (M.y + M.size - 1), 0);
  const d = Math.hypot(dx, dy);
  return d === 0 ? 1 : Math.max(0, 1 - d / 120) * 0.85;
}
/** 神秘区域在冰原那张图上的位置（0-1） */
const MYST_VIEW = {
  left: (MYSTERY_BOX.x - VIEWS.realm.x) / VIEWS.realm.w, top: (MYSTERY_BOX.y - VIEWS.realm.y) / VIEWS.realm.h,
  w: MYSTERY_BOX.size / VIEWS.realm.w, h: MYSTERY_BOX.size / VIEWS.realm.h,
};

/** 老地图的区域名字按老方框里的相对位置算 */
const inBox = (u: number, v: number): [number, number] => [(OLD_BOX.x + u * OLD_BOX.size) / MAIN_SIZE, (OLD_BOX.y + v * OLD_BOX.size) / MAIN_SIZE];
/** 8848 那一圈按 8848 方框里的相对位置算 */
const inMid = (u: number, v: number): [number, number] => [(MID_BOX.x + u * MID_BOX.size) / MAIN_SIZE, (MID_BOX.y + v * MID_BOX.size) / MAIN_SIZE];
/** 冰原的区域名：摆在各区形状点的中间 */
const inRealmView = (u: number, v: number): [number, number] => [(REALM_BOX.x - VIEWS.realm.x + u * REALM_BOX.size) / VIEWS.realm.w, (REALM_BOX.y - VIEWS.realm.y + v * REALM_BOX.size) / VIEWS.realm.h];
const realmLabel = (r: RegionId): [number, number] => {
  const pts = REALM_SEEDS.filter((q) => q[2] === r);
  return inRealmView(pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length);
};
/** 区域名字摆放的位置（0-1） */
const LABELS: Record<RegionId, [number, number]> = {
  town: inBox(0.47, 0.53), snow: inBox(0.46, 0.06), highland: inBox(0.8, 0.28), coast: inBox(0.8, 0.45), lava: inBox(0.74, 0.86),
  abyss: inBox(0.45, 0.86), swamp: inBox(0.13, 0.82), woodland: inBox(0.15, 0.42), giantwood: inBox(0.13, 0.2),
  savanna: inMid(0.08, 0.47), autumn: inMid(0.1, 0.12), jungle: inMid(0.1, 0.85), tropic: inMid(0.92, 0.55),
  canyon: inMid(0.9, 0.18), desert: inMid(0.9, 0.86), alpine: inMid(0.5, 0.05), crystal: inMid(0.52, 0.9),
  hills: [0.06, 0.36], vineisles: [0.08, 0.04], moonmire: [0.06, 0.74], archipelago: [0.95, 0.45],
  frostpeak: [0.5, 0.04], ashcape: [0.92, 0.92], thunder: [0.9, 0.03], starsea: [0.5, 0.97],
  tundra: realmLabel('tundra'), frostpine: realmLabel('frostpine'), icelakes: realmLabel('icelakes'), icerift: inRealmView(0.5, 0.455),
  glacier: realmLabel('glacier'), frozenruins: realmLabel('frozenruins'), aurorahigh: realmLabel('aurorahigh'), everrift: realmLabel('everrift'),
};
/** 城镇在世界地图上只标一个点（新城镇标在仓库上） */
const TOWN_MARK: Record<string, string> = { smithy: tl('苍岭城'), market2: tl('落霞城'), ...Object.fromEntries(TOWNS.map((t) => [`${t.id}_bank`, t.name])) };

const MAX_ZOOM = 8;

/** 世界地图筛选（用户 10-23）：按用途看地点 */
type Filter = 'all' | 'stone' | 'town' | 'boss' | 'world' | 'event' | 'cave' | 'timed' | SkillId;
const FILTERS: [Filter, string][] = [
  ['all', tl('全部')], ['stone', tl('传送石碑')], ['town', tl('城镇')], ['mining', tl('采矿')], ['woodcutting', tl('伐木')], ['fishing', tl('钓鱼')],
  ['gathering', tl('采集')], ['hunting', tl('狩猎')], ['thieving', tl('偷窃')], ['boss', tl('首领')], ['world', tl('世界首领')], ['event', tl('活动')], ['timed', tl('限时')], ['cave', tl('洞窟')],
];
const skillsOf = (n: MapNode) => new Set(n.actions.map((id) => ACTIONS[id]).flatMap((a) => (a.kind === 'skill' ? [a.skill] : [])));
function passes(n: MapNode, f: Filter) {
  if (f === 'all') return true;
  if (f === 'stone') return !!n.waystone;
  if (f === 'town') return !!TOWN_MARK[n.id] || !!n.realmGate;
  if (f === 'timed') return !!n.timed;
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
  const [view, setView] = useState<ViewId>(() => (inRealm(playerPos) ? 'realm' : 'main'));
  const V = VIEWS[view];
  const url = useMemo(() => overview(view), [view]);
  const cl = combatLevel(s);
  // 限时点每 15 秒刷新一次明暗
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const here = inView(view, playerPos);
  const me = here ? { x: (playerPos.x - V.x) / V.w, y: (playerPos.y - V.y) / V.h } : { x: 0.5, y: 0.5 };

  // 缩放后：滚轮缩放时让光标下的那一点不动，按钮缩放时以画面中心为准，第一次打开对准角色
  const anchor = useRef<{ u: number; v: number; mx: number; my: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const a = anchor.current ?? { u: me.x, v: me.y, mx: el.clientWidth / 2, my: el.clientHeight / 2 };
    anchor.current = null;
    el.scrollLeft = a.u * el.scrollWidth - a.mx;
    el.scrollTop = a.v * el.scrollHeight - a.my;
  }, [zoom, view]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 标签互相压住时只留重要的：选中的 > 城镇 > 世界首领/活动 > 区域名(远看) > 特色地点 > 石碑 > 普通地点；放大后空间够了自然都会显示出来
  const canvasRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const f = () => setVw(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-pri]')];
    els.forEach((e) => { e.style.visibility = ''; });
    const items = els.map((e) => ({ e, p: Number(e.dataset.pri), r: e.getBoundingClientRect() })).sort((a, b) => a.p - b.p);
    const kept: DOMRect[] = [];
    // 地点图标本身也不让普通标签压住（城镇、首领这些重要的除外）
    const marks = [...root.querySelectorAll<HTMLElement>('.wm-node > i, .wm-node > img')].map((e) => e.getBoundingClientRect());
    const over = (r: DOMRect, k: DOMRect, g: number) => r.left < k.right + g && r.right > k.left - g && r.top < k.bottom + g && r.bottom > k.top - g;
    for (const it of items) {
      const r = it.r;
      const hit = kept.some((k) => over(r, k, 2)) || (it.p > 2 && marks.some((k) => over(r, k, -1)));
      if (hit) it.e.style.visibility = 'hidden';
      else kept.push(r);
    }
  }, [zoom, filter, sel, vw, s.waystones?.length, view]);

  const node = sel ? NODES.find((n) => n.id === sel)! : null;
  return (
    <div className="worldmap">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('世界地图')}</h2>
        <span className="zoom-btns">
          <button onClick={() => zoomAt(zoom / 1.4)} disabled={zoom <= 1}>{tl('－')}</button>
          <button className="zoom-val" onClick={() => zoomAt(1)} title={tl("还原")}>{zoom.toFixed(1)}×</button>
          <button onClick={() => zoomAt(zoom * 1.4)} disabled={zoom >= MAX_ZOOM}>{tl('＋')}</button>
        </span>
      </div>
      <div className="chips-row wm-view">
        {(['main', 'realm'] as ViewId[]).map((v) => (
          <button key={v} className={`pill ${view === v ? 'on' : ''}`} onClick={() => { setSel(null); setView(v); }}>{v === 'main' ? tl('主大陆') : tl('❄ 永冬冰原')}</button>
        ))}
      </div>
      <div className="chips-row wm-filter">
        {FILTERS.map(([id, name]) => (
          <button key={id} className={`pill ${filter === id ? 'on' : ''}`} onClick={() => pickFilter(id)}>{name}</button>
        ))}
      </div>
      <div className={`wm-scroll ${FINE_POINTER ? 'grab' : ''}`} ref={scroller} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div className="wm-canvas" ref={canvasRef} style={{ width: `${zoom * 100}%`, aspectRatio: `${V.w} / ${V.h}` }}>
          <img src={url} alt="" draggable={false} />
          {view === 'realm' && (
            <div className="wm-mystery" style={{ left: `${MYST_VIEW.left * 100}%`, top: `${MYST_VIEW.top * 100}%`, width: `${MYST_VIEW.w * 100}%`, height: `${MYST_VIEW.h * 100}%` }}>
              <b>{tl('？？？')}</b>
              <span>{tl('神秘区域 · 暂未开放')}</span>
            </div>
          )}
          {(Object.keys(LABELS) as RegionId[]).filter((r) => isRealmRegion(r) === (view === 'realm')).map((r) => (
            <span key={r} className="wm-region" data-pri={zoom < 2 ? 3 : 7} style={{ left: `${LABELS[r][0] * 100}%`, top: `${LABELS[r][1] * 100}%` }}>{REGIONS[r].name}</span>
          ))}
          {NODES.filter((n) => inView(view, n) && !(n.event && hwGone(now)) && (!n.town || n.pond || TOWN_MARK[n.id] || n.waystone || n.portal || n.realmGate) && passes(n, filter)).map((n) => {
            const d = n.town && !n.pond ? 0 : dangerLevel(n, cl);
            const lit = n.waystone && s.waystones?.includes(n.id);
            // 英文石碑名都带「Waystone: 」，图标已经能看出是石碑，标签上省掉，少占一半地方（用户 11-01 嫌英文满屏乱）
            const name = n.waystone ? (isEn ? n.name.replace(/^(Legendary )?Waystone:\s*/, '') : n.name.replace(tl('传说石碑·'), tl('石碑·'))) : TOWN_MARK[n.id] ?? n.name;
            const pri = sel === n.id ? 0 : TOWN_MARK[n.id] ? 1 : n.world || n.event ? 2 : n.site ? 4 : n.waystone ? 5 : 6;
            const big = n.site || n.world || n.event || TOWN_MARK[n.id] || n.realmGate || (n.waystone && filter === 'stone');
            // 限时点（11-01）：没刷出来的画暗
            const off = !!n.timed && !timedWindow(n, now);
            return (
              <button key={n.id} className={`wm-node ${sel === n.id ? 'sel' : ''} ${n.cave ? 'cave' : ''} ${n.waystone ? `stone ${lit ? 'lit' : ''}` : ''} ${off ? 'off' : ''}`} style={{ left: `${((n.x - V.x) / V.w) * 100}%`, top: `${((n.y - V.y) / V.h) * 100}%`, zIndex: pri <= 2 ? 3 : undefined }}
                onClick={() => setSel(n.id)}>
                {/* 世界首领：红色骷髅头（用户 10-24） */}
                {n.realmGate ? <b className="wm-gate">❄</b> : n.event ? <img className="wm-skull wm-pumpkin" src={pumpkinPointUrl()} alt="" draggable={false} /> : n.world ? <img className="wm-skull" src={skullUrl()} alt="" draggable={false} /> : <i style={n.waystone ? undefined : { background: n.cave ? '#2a2030' : DANGER[d].color }} />}
                {/* 特色地点和城镇一直标名字 */}
                {(zoom > 1 || big) && <span data-pri={pri} className={n.event ? 'site event' : n.world ? 'site world' : big ? 'site' : ''}>{n.world ? `☠ ${name}` : name}</span>}
              </button>
            );
          })}
          {here && <span className="wm-me" style={{ left: `${me.x * 100}%`, top: `${me.y * 100}%` }} />}
        </div>
      </div>
      <div className="wm-legend">
        {DANGER.map((d) => <span key={d.name}><i style={{ background: d.color }} />{d.name}</span>)}
        <span><i className="stone-mark" />{tl('石碑（已激活）')}</span>
        <span><i className="stone-mark off" />{tl('石碑（未激活）')}</span>
        <span><img className="wm-skull-mini" src={skullUrl()} alt="" />{tl('世界首领')}</span>
        {view === 'realm' ? <span><i className="off-mark" />{tl('限时点（未刷出）')}</span> : <span><b className="wm-gate mini">❄</b>{tl('永冬传送门')}</span>}
        <span><i className="me" />{tl('你')}</span>
        {FINE_POINTER && <span className="wm-hint">{tl('滚轮缩放 · 按住左键拖动')}</span>}
      </div>
      {node && (
        <NodeCard s={s} nodeId={node.id} cl={cl} onOpen={() => onOpenNode(node.id)}
          onWalk={() => { emitToGame('walkto', node.id); onClose(); }} />
      )}
    </div>
  );
}

/** 限时点的倒计时（11-01）：刷出来的显示还剩多久，没刷出来的显示下次什么时候 */
function TimedLine({ n }: { n: MapNode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const cur = timedWindow(n, now);
  if (cur) return <span className="good">{tl`限时刷新中 · 还剩 ${mmss(cur.end - now)} 消失`}</span>;
  const nx = nextWindow(n, now);
  return <span className="muted">{nx ? tl`现在没有 · ${mmss(nx.start - now)} 后刷新` : tl('现在没有')}</span>;
}

function NodeCard({ s, nodeId, cl, onOpen, onWalk }: { s: GameState; nodeId: string; cl: number; onOpen: () => void; onWalk: () => void }) {
  const n = NODES.find((x) => x.id === nodeId)!;
  const d = DANGER[n.town && !n.pond ? 0 : dangerLevel(n, cl)];
  const monsters = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat').map((a) => a.kind === 'combat' ? MONSTERS[a.monster] : null);
  const skills = [...new Set(n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill').map((a) => (a.kind === 'skill' ? SKILLS[a.skill].name : '')))];
  const route = planRoute(s.waystones, playerPos, standOf(n), moveSpeed(s));
  return (
    <div className="wm-card frame">
      <div className="row1">
        <b>{TOWN_MARK[n.id] ?? n.name}</b>
        <span style={{ color: d.color }}>{tl`危险度：${d.name}`}</span>
      </div>
      <small className="muted">{REGIONS[n.region].name}{!n.town && !n.cave && ` · Lv${n.lv[0]}${n.lv[1] !== n.lv[0] ? `-${n.lv[1]}` : ''}`}</small>
      {n.cave && <span>{tl('大型洞窟 · 尚未开放，敬请期待')}</span>}
      {n.realmGate && <span>{n.realmGate === 'camp' ? tl('回程门：回苍岭城或落霞城') : tl('通往永冬冰原（推荐 95 级以上）')}</span>}
      {n.timed && <TimedLine n={n} />}
      {n.waystone && <span>{s.waystones?.includes(n.id) ? tl('已激活：站在任意一座激活过的石碑旁就能传送到这里') : tl('未激活：走到石碑旁边就会激活')}</span>}
      {skills.length > 0 && <span>{tl`可练：${skills.join(tl('、'))}`}</span>}
      {monsters.length > 0 && (
        <span className="wm-mons">
          <small className="muted">{tl('点怪物去追踪：Boss 和交过手的能找到准确位置，其他只到大概的刷新区域')}</small>
          {monsters.map((m) => (
            <button key={m!.id} className="pill" onClick={() => store.track(m!.id)}>
              <MonsterIcon m={m!} size={18} /> {m!.name} {m!.level}{m!.world ? tl(' 世界首领') : m!.rank === 'boss' ? ' Boss' : m!.rank === 'elite' ? tl(' 精英') : ''}
            </button>
          ))}
        </span>
      )}
      <div className="go">
        <button className="primary" onClick={onWalk}>{route.via ? tl`寻路前往 · 经石碑约 ${Math.ceil(route.ms / 1000)} 秒` : tl`寻路前往 · 约 ${Math.ceil(route.ms / 1000)} 秒`}</button>
        {!TOWN_MARK[n.id] && (n.town || skills.length > 0 || n.waystone) && <button onClick={onOpen}>{n.waystone ? tl('打开石碑') : tl('查看任务')}</button>}
      </div>
    </div>
  );
}
