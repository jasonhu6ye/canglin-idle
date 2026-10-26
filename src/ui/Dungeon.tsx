import { useEffect, useState } from 'react';
import { ITEMS, KEY_SHOP, MONSTERS, NODES, type MapNode } from '../core/data';
import { CHEST_COLOR, chestOdds, mobBuff, coopMates, COOP_DEF, COOP_DMG, dungeonFloor, GATE_REACH, totalMobs } from '../core/dungeon';
import { allGates, setSharedGates } from '../core/gateShare';
import { partySize } from '../core/party';
import { markContrib, syncDungeon, atShop, buyKey, enterDungeon, gateBlock, leaveDungeon, openDungeonChest, TOWN_BANKS, useTownScroll, walkPos } from '../core/sim';
import type { DungeonGate, GameState } from '../core/types';
import { DG_CHEST, DG_MATE_HIT } from '../game/DungeonScene';
import { dgCrew, pushMateHit, stopKey } from '../core/aggro';
import { GATE_CLICK, GATE_OPENED } from '../game/MapScene';
import { online, type Presence } from '../net';
import { sendRally, useSocial } from '../net/social';
import { store } from '../store';
import { tl } from '../i18n';
import { fmtNum } from './format';
import { emitToGame, onGameEvent } from './GameCanvas';
import { Icon } from './icons';
import { showLoot } from './itemOpen';

/*
 * 副本界面（用户 10-25）：洞口面板、开门后的寻路提示、副本里的进度条和宝箱、商人、回城卷轴选城镇。
 */

export const dgName = (k: 'green' | 'blue') => (k === 'green' ? tl('绿洞') : tl('蓝洞'));
export const CHEST_NAMES = () => [tl('绿色宝箱'), tl('蓝色宝箱'), tl('紫色宝箱'), tl('金色宝箱')];
const left = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 每秒刷新一次（倒计时） */
function useTick(ms = 1000) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/**
 * 别人开的洞口：只有队友和同公会的人看得见，陌生人看不见（用户 10-25：人多时满地洞窟会卡）。
 * 从他们的在线状态里拿，地图上也画出来。
 */
export function useSharedGates() {
  const st = useSocial();
  const [all, setAll] = useState<Presence[]>([]);
  useEffect(() => online.onPresence(setAll), []);
  const me = online.me();
  const mates = new Set(st.party?.members.map((m) => m.playerId) ?? []);
  const list: DungeonGate[] = all
    .filter((p) => p.playerId !== me?.id && p.gates?.length && (mates.has(p.playerId) || (!!me?.guildTag && p.guildTag === me.guildTag)))
    .flatMap((p) => p.gates!.map((g) => ({ ...g, owner: p.name })));
  const key = list.map((g) => g.id).sort().join();
  useEffect(() => { setSharedGates(list); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * 副本组队同步（用户 10-25）：同一个洞口里的队友打得比自己靠前，就把自己的进度拉上去
 * （队友清掉的怪这边也算清掉）。队友的位置和动作在副本场景里画。
 */
function useDungeonSync() {
  useEffect(() => {
    /** 每个队友上次报的「对哪只怪累计打了多少」，新报的减去它就是这段时间新打的伤害 */
    const seen = new Map<string, { key: string; dmg: number }>();
    return online.onPresence((all) => {
      const run = store.state.dungeon;
      if (!run?.members) return;
      for (const p of all) {
        const d = p.dg;
        if (!d || d.gate !== run.gate.id || !run.members.some((m) => m.id === p.playerId)) continue;
        // 队友打的伤害（10-26）：记到自己这边同一只怪上，画面上用队友的颜色飘字，并记进宝箱分配名单
        const key = stopKey(d.gate, d.floor, d.idx);
        const last = seen.get(p.playerId);
        const dmg = d.phase === 'fight' ? d.dmg ?? 0 : 0;
        const delta = last && last.key === key ? dmg - last.dmg : dmg;
        seen.set(p.playerId, { key, dmg: Math.max(dmg, last && last.key === key ? last.dmg : 0) });
        if (delta > 0) {
          pushMateHit(key, delta);
          if (!run.contrib?.includes(p.playerId)) store.dispatch((g) => markContrib(g, p.playerId));
          emitToGame(DG_MATE_HIT, p.playerId, d.floor, d.idx, delta, !!d.crit);
        }
        if (syncDungeon(store.state, d) !== store.state) store.dispatch((g) => syncDungeon(g, d));
      }
    });
  }, []);
}

/** 地图上点了洞口、刚开了洞口 */
export function DungeonPopups({ s }: { s: GameState }) {
  useSharedGates();
  useDungeonSync();
  const [gateId, setGateId] = useState<string | null>(null);
  const [opened, setOpened] = useState<DungeonGate | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  useEffect(() => onGameEvent(GATE_CLICK, (id: string) => setGateId(id)), []);
  const [outside, setOutside] = useState(false);
  const [why, setWhy] = useState('');
  useEffect(() => onGameEvent(GATE_OPENED, (g: DungeonGate | null, fromTown?: boolean, reason?: string) => { setOpened(g); setOutside(!!fromTown); setWhy(reason ?? ''); }), []);
  useEffect(() => onGameEvent(DG_CHEST, () => {
    const run = store.state.dungeon;
    if (!run) return;
    if (run.phase === 'chest') return openChest();
    if (run.phase === 'open') return showLoot({ from: CHEST_NAMES()[run.chest ?? 0], got: run.loot ?? {} });
    const rest = totalMobs(run.gate) - run.kills;
    setMsg(tl`还有 ${rest} 只怪没清完，清完所有怪才能打开宝箱`);
  }), []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 3500); return () => clearTimeout(t); }, [msg]);
  const gate = gateId ? allGates(s).find((g) => g.id === gateId) : undefined;
  return (
    <>
      {gate && <GateSheet s={s} gate={gate} onClose={() => setGateId(null)} />}
      {opened !== undefined && (
        <div className="center-pop-back" onClick={() => setOpened(undefined)}>
          <div className="center-pop frame dg-opened" onClick={(e) => e.stopPropagation()}>
            {opened ? (
              <>
                <h2 className={`dg-${opened.kind}`}>{tl`${dgName(opened.kind)}洞口已开启`}</h2>
                <p>{tl`T${opened.tier + 1} ${dgName(opened.kind)}，${left(opened.expires - Date.now())} 后洞口消失。地图上已经用光柱标出位置。层数进去后才知道。`}</p>
                {outside && <p className="gold">{tl('城里不能开洞口，洞口开在了离你最近的城外空地。')}</p>}
                {opened.kind === 'blue' && <p className="warn">{tl('蓝洞必须组队才能进。可以先召集队友过来。')}</p>}
                <div className="go">
                  <button className="primary" onClick={() => { emitToGame('walktile', opened.x, opened.y); setOpened(undefined); }}>{tl('自动寻路前往')}</button>
                  <button onClick={() => setOpened(undefined)}>{tl('稍后再去')}</button>
                </div>
              </>
            ) : (
              <>
                <h2>{tl('这里开不了洞口')}</h2>
                <p>{why || tl('身边没有能开洞口的空地，换个开阔的地方再试试（在城里用会开到城外）。')}</p>
                <button className="primary" onClick={() => setOpened(undefined)}>{tl('知道了')}</button>
              </>
            )}
          </div>
        </div>
      )}
      {msg && <div className="chip dg-msg">{msg}</div>}
    </>
  );
}

function openChest() {
  let got: Record<string, number> = {};
  let q = 0;
  store.dispatch((g) => {
    const [next, r] = openDungeonChest(g);
    got = r;
    q = next.dungeon?.chest ?? 0;
    return next;
  });
  if (Object.keys(got).length) showLoot({ from: CHEST_NAMES()[q], got });
}

/** 洞口面板：剩余时间、能不能进、进去、召集队友、寻路过去 */
function GateSheet({ s, gate, onClose }: { s: GameState; gate: DungeonGate; onClose: () => void }) {
  useTick();
  const st = useSocial();
  const me = online.me();
  const party = Math.max(1, st.party?.members.length ?? partySize());
  const why = gateBlock(s, gate, party);
  const p = walkPos(s);
  const far = Math.hypot(p.x - gate.x, p.y - gate.y) > GATE_REACH + 0.5;
  const lead = st.party && st.party.leader === me?.id;
  // 组队进：记下队员名单，最后宝箱全队掷点分
  const team = st.party && me && st.party.members.length > 1
    ? { members: st.party.members.map((m) => ({ id: m.playerId, name: m.name })), me: me.id } : undefined;
  const odds = chestOdds(gate.kind, gate.kind === 'green' ? 2.5 : 4.5);
  return (
    <div className="center-pop-back" onClick={onClose}>
      <div className="center-pop frame dg-gate" onClick={(e) => e.stopPropagation()}>
        <h2 className={`dg-${gate.kind}`}>{gate.owner ? tl`${gate.owner} 的` : ''}{tl`T${gate.tier + 1} ${dgName(gate.kind)}`}</h2>
        <p>{gate.kind === 'green'
          ? tl('绿洞（单人地下副本）：1-4 层随机，一个人或组队都能进。')
          : tl('蓝洞（多人地下副本）：2-7 层随机，怪更强，必须组队才能进。队伍里每多一个人，你在蓝洞里伤害更高、受到的伤害更少。')}</p>
        <p>{tl`洞口还有 ${left(gate.expires - Date.now())} 消失（已经在里面的人不受影响）。通关（开了宝箱）后不能再进；没通关的话，阵亡或离开后可以再进来接着打。`}</p>
        <p className="muted">{tl('清完所有层的所有怪，最后一层首领守着的宝箱才能打开。层数越多宝箱品质越好。')}</p>
        <div className="dg-odds">
          {CHEST_NAMES().map((n, i) => <span key={i} style={{ color: CHEST_COLOR[i] }}>{n} {Math.round(odds[i])}%</span>)}
          <small className="muted">{tl('（按平均层数估算）')}</small>
        </div>
        {why && <p className="warn">{why}</p>}
        <div className="go">
          {far && !s.dungeon && <button onClick={() => { emitToGame('walktile', gate.x, gate.y); onClose(); }}>{tl('寻路前往')}</button>}
          {lead && <button onClick={() => { sendRally(); onClose(); }}>{tl('召集队友')}</button>}
          <button className="primary" disabled={!!why} onClick={() => { store.dispatch((g) => enterDungeon(g, gate, party, Date.now(), team)); onClose(); }}>{tl('进入副本')}</button>
        </div>
        <button className="pill" onClick={onClose}>{tl('关闭')}</button>
      </div>
    </div>
  );
}

/** 副本里左上角的进度：第几层、清了多少只、离开、开宝箱 */
export function DungeonHud({ s }: { s: GameState }) {
  const run = s.dungeon;
  const [confirm, setConfirm] = useState(false);
  if (!run) return null;
  const total = totalMobs(run.gate);
  const F = dungeonFloor(run.gate, run.floor);
  const stop = F.stops[run.idx];
  const m = stop?.monster ? MONSTERS[stop.monster] : undefined;
  const mates = run.gate.kind === 'blue' ? coopMates(run.party) : 0;
  const status = run.phase === 'walk'
    ? (stop?.kind === 'stairs' ? tl('前往楼梯') : stop?.kind === 'chest' ? tl('前往宝箱') : tl('寻找下一只怪'))
    : run.phase === 'fight' ? tl`正在打 ${m?.name ?? ''}${m?.rank === 'boss' ? tl('（首领）') : m?.rank === 'elite' ? tl('（精英）') : ''}`
      : run.phase === 'chest' ? tl('所有怪都清完了！点宝箱打开') : tl('宝箱已打开');
  const leave = () => {
    if (run.phase !== 'open' && !confirm) return setConfirm(true);
    store.dispatch(leaveDungeon);
    setConfirm(false);
  };
  return (
    <div className={`chip dg-hud dg-${run.gate.kind}`}>
      <b>{tl`T${run.gate.tier + 1} ${dgName(run.gate.kind)} · 第 ${run.floor + 1}/${run.gate.floors} 层`}</b>
      <span className="bar wide"><i style={{ width: `${(run.kills / Math.max(1, total)) * 100}%` }} /></span>
      <small>{tl`已清 ${run.kills}/${total} 只`} · {status}</small>
      {(run.phase === 'walk' || run.phase === 'fight') && <small className="muted">{tl('自动打怪中：会自己清完每层、下楼，退出游戏也接着打')}</small>}
      {dgCrew() > 0 && <small className="warn">{tl`同洞队友 ${dgCrew()} 人：怪物全属性 +${Math.round(mobBuff(1 + dgCrew()) * 100)}%、血量 +${dgCrew() * 75}%，大家的伤害打在同一只怪上`}</small>}
      {mates > 0 && <small className="gold">{tl`队友协战 ${mates} 人：伤害 +${Math.round(COOP_DMG * mates * 100)}%，受伤 -${Math.round(COOP_DEF * mates * 100)}%`}</small>}
      {run.phase === 'chest' && <button className="pill primary" onClick={openChest}>{tl('打开宝箱')}</button>}
      {run.phase === 'open' && run.loot && (
        <div className="dg-loot">
          <b style={{ color: CHEST_COLOR[run.chest ?? 0] }}>{CHEST_NAMES()[run.chest ?? 0]}</b>
          {Object.entries(run.loot).map(([id, n]) => <span key={id} className="with-icon"><Icon item={id} size={18} /> {id === 'coins' ? fmtNum(n) : `×${n}`}</span>)}
        </div>
      )}
      {run.phase === 'open' && run.split && run.members && <TeamSplit run={run} />}
      {confirm && <small className="warn">{tl('宝箱还没开。洞口消失前可以再进来接着打（打死的怪不会复活）。再点一次确认离开。')}</small>}
      <button className={run.phase === 'open' ? 'pill primary' : 'pill'} onClick={leave}>{confirm ? tl('确认离开') : tl('离开副本')}</button>
    </div>
  );
}

/** 组队宝箱：开箱时全部归属已经定好，列出宝箱里全部东西和各归谁 */
function TeamSplit({ run }: { run: NonNullable<GameState['dungeon']> }) {
  const ms = run.members!;
  return (
    <div className="dg-rolls">
      <small className="muted">{tl('宝箱里的全部战利品（打开时已定好归属）：')}</small>
      {run.split!.map((share, i) => !Object.keys(share).length ? null : (
        <div key={i} className={`dg-roll ${ms[i]?.id === run.me ? 'me' : ''}`}>
          <b className={ms[i]?.id === run.me ? 'gold' : ''}>{ms[i]?.id === run.me ? tl('你') : ms[i]?.name}</b>
          {Object.entries(share).map(([id, n]) => <span key={id} className="with-icon"><Icon item={id} size={16} /> {id === 'coins' ? fmtNum(n) : `×${n}`}</span>)}
        </div>
      ))}
      <small className="muted">{tl('只有这一趟打出过伤害的队友参与分配。金币和材料平分，装备、钥匙、强化石按运气归属；什么好东西都没分到的人有保底碎片。')}</small>
    </div>
  );
}

/** 城镇商人：用仓库里的金币买副本钥匙 */
export function ShopSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const near = atShop(s);
  return (
    <div className="sheet dg-shop">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
      </div>
      <p className="muted pad">{tl('用仓库里的金币买副本钥匙。更高阶的钥匙只能从副本宝箱里开出来。')}</p>
      <div className="ranch-stats">
        <span>{tl('仓库金币 ')}<b>{fmtNum(s.bank.coins ?? 0)}</b></span>
        {!near && <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>{tl('寻路到商人')}</button>}
      </div>
      <div className="salv-list">
        {KEY_SHOP.map(([id, price]) => {
          const it = ITEMS[id];
          const can = near && (s.bank.coins ?? 0) >= price;
          return (
            <div key={id} className="salv-row">
              <Icon item={id} size={32} />
              <div className="salv-info">
                <b>{it.name}</b>
                <small className="muted">{it.desc}</small>
                <small>{tl`${fmtNum(price)} 金币 · 背包 ${s.bag[id] ?? 0} · 仓库 ${s.bank[id] ?? 0}`}</small>
              </div>
              <div className="salv-qty">
                <button className="primary" disabled={!can} onClick={() => store.dispatch((g) => buyKey(g, id, 1))}>{tl('买 1 把')}</button>
              </div>
            </div>
          );
        })}
      </div>
      {!near && <p className="muted pad">{tl('要站在商人旁边才能买。')}</p>}
    </div>
  );
}

/** 回城卷轴：选一座城镇传过去（用户 10-25） */
export function TownScrollPicker({ onClose }: { onClose: () => void }) {
  const towns = TOWN_BANKS.map((b) => ({ b, name: townName(b) }));
  const go = (id: string) => {
    store.dispatch((g) => useTownScroll(g, id));
    // 在大地图上：直接把角色挪过去；在副本里离开后大地图醒来会自己站到位置上
    emitToGame('teleport', id);
    onClose();
  };
  return (
    <div className="center-pop-back" onClick={onClose}>
      <div className="center-pop frame" onClick={(e) => e.stopPropagation()}>
        <h2>{tl('回城卷轴：传送到哪座城镇？')}</h2>
        {store.state.dungeon && <p className="warn">{tl('你在副本里，用了会直接离开副本；洞口消失前还能回来接着打。')}</p>}
        <div className="dg-towns">
          {towns.map(({ b, name }) => <button key={b.id} onClick={() => go(b.id)}>{name}</button>)}
        </div>
        <button className="pill" onClick={onClose}>{tl('取消')}</button>
      </div>
    </div>
  );
}

/** 仓库节点名 → 城镇名（「仓库」是苍岭城，「落霞城·仓库」取前缀） */
function townName(b: MapNode) {
  if (b.id === 'bank') return tl('苍岭城');
  const n = NODES.find((x) => x.id === b.id)?.name ?? b.name;
  return n.replace(/[·・].*$/, '').replace(/\s*Bank$/i, '') || n;
}
