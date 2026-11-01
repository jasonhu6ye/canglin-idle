import { useEffect, useState } from 'react';
import { ITEMS, type MapNode } from '../core/data';
import { CHEST_OPEN_MS, chestTier, nextWindow, timedWindow } from '../core/realm';
import { cancelRealmChest, finishRealmChest, REALM_CHEST_LOOT, realmChestState, startRealmChest } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { tl } from '../i18n';

const TIER_NAME = { green: tl('绿色宝箱'), blue: tl('蓝色宝箱'), gold: tl('金色宝箱') };
const TIER_COLOR = { green: '#8ee08a', blue: '#7ab8ff', gold: '#ffd86a' };
const mmss = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** 永冬冰原的限时宝箱（用户 11-01）：站在旁边开 10 秒，每人每轮一次，奖励进仓库 */
export function RealmChestSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const win = timedWindow(node, now);
  const tier = chestTier(node.id, win?.round ?? 0);
  const state = realmChestState(s, node.id, now);
  const op = s.realmChest?.opening?.id === node.id ? s.realmChest.opening : undefined;
  const pct = op ? Math.min(1, (now - op.at) / CHEST_OPEN_MS) : 0;
  // 开满 10 秒自动领；走开了就作废
  useEffect(() => {
    if (!op) return;
    if (state !== 'ok') { store.dispatch(cancelRealmChest); return; }
    if (pct >= 1) {
      store.dispatch((g) => finishRealmChest(g, Date.now()));
      setDone(true);
    }
  }, [op, pct, state]);
  // 关掉页面也算放弃
  useEffect(() => () => store.dispatch(cancelRealmChest), []);
  const loot = REALM_CHEST_LOOT[tier];
  const nx = !win ? nextWindow(node, now) : null;
  return (
    <div className="sheet portal-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{win ? tl`限时宝箱 · 还剩 ${mmss(win.end - now)} 消失` : tl('限时宝箱')}</small>
      </div>
      <div className="pad">
        {win ? (
          <>
            <p><b style={{ color: TIER_COLOR[tier] }}>{TIER_NAME[tier]}</b>{tl('：站在旁边开 10 秒，每人每轮能开一次，东西直接进仓库。')}</p>
            <p className="muted">{tl`里面有：${loot.coins} 金币、${loot.items.map(([id, q]) => `${ITEMS[id]?.name ?? id}×${q}`).join(tl('、'))}`}</p>
          </>
        ) : (
          <p>{nx ? tl`宝箱已经消失了，${mmss(nx.start - now)} 后这里会再刷一个。` : tl('宝箱已经消失了。')}</p>
        )}
        {op && <div className="bar rc-open"><i style={{ width: `${pct * 100}%`, background: TIER_COLOR[tier] }} /></div>}
        <div className="go">
          {done || state === 'got' ? <span className="muted">{tl('这一轮已经开过了，奖励在仓库里。')}</span>
            : state === 'far' ? <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>{tl`寻路去${node.name}`}</button>
            : state === 'ok' ? <button className="primary" disabled={!!op} onClick={() => store.dispatch((g) => startRealmChest(g, node.id, Date.now()))}>{op ? tl`开箱中… ${mmss(CHEST_OPEN_MS - (now - op.at))}` : tl('开箱')}</button>
            : null}
        </div>
      </div>
    </div>
  );
}
