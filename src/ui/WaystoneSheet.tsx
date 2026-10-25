import { NODES, REGIONS, WAYSTONES } from '../core/data';
import { atWaystone } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { emitToGame } from './GameCanvas';
import { tl } from '../i18n';
import { useSticky } from './sticky';
import type { MapNode } from '../core/data';

/** 石碑分类（用户 10-25：城镇的单独一类，不用翻来翻去） */
type StoneCat = 'all' | 'town' | 'wild' | 'site' | 'lit';
const catOf = (n: MapNode): StoneCat => (n.town ? 'town' : n.id.startsWith('stone_site_') ? 'site' : 'wild');
const CATS: [StoneCat, string][] = [['town', tl('城镇')], ['wild', tl('野外区域')], ['site', tl('特色地点')], ['lit', tl('已激活')], ['all', tl('全部')]];

/**
 * 传说石碑面板（用户 10-23）：第一次要走到石碑旁边激活；
 * 站在任意一座激活过的石碑旁，就能传送到别的激活过的石碑。正在做的工作会暂停。
 */
export function WaystoneSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const on = s.waystones ?? [];
  const here = atWaystone(s);
  const lit = on.includes(nodeId);
  const go = () => { store.requestWalk(nodeId); onClose(); };
  const [cat, setCat] = useSticky<StoneCat>('stones.cat', 'town');
  const count = (c: StoneCat) => WAYSTONES.filter((n) => c === 'all' || (c === 'lit' ? on.includes(n.id) : catOf(n) === c));
  // 已激活的排前面
  const list = count(cat).slice().sort((a, b) => +on.includes(b.id) - +on.includes(a.id));
  return (
    <div className="sheet stone-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{tl`${REGIONS[node.region].name} · 已激活 ${on.length}/${WAYSTONES.length} 座`}</small>
      </div>
      {!lit && (
        <div className="go far-bank">
          <span className="muted">{tl('这座石碑还没激活。走到它旁边就会自动激活，以后就能传送过来。')}</span>
          <button onClick={go}>{tl`寻路去${node.name.replace(tl('传说石碑·'), '')}`}</button>
        </div>
      )}
      {lit && !here && (
        <div className="go far-bank">
          <span className="muted">{tl('要站在任意一座激活过的石碑旁边才能传送。')}</span>
          <button onClick={go}>{tl('寻路去这座石碑')}</button>
        </div>
      )}
      {here && <p className="pad">{tl('你正站在')}<b className="gold">{here.name}</b>{tl('旁边，选一座要去的石碑。传送后正在做的工作会暂停。')}</p>}
      <div className="chips-row">
        {CATS.map(([c, name]) => {
          const all = count(c);
          const lit = all.filter((n) => on.includes(n.id)).length;
          return <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{name} {c === 'lit' ? lit : `${lit}/${all.length}`}</button>;
        })}
      </div>
      <ul className="action-list stone-list">
        {list.map((n) => {
          const ok = on.includes(n.id);
          const cur = here?.id === n.id;
          return (
            <li key={n.id} className={`${ok ? '' : 'locked'} ${cur ? 'sel' : ''}`}>
              <span className={`stone-dot ${ok ? 'on' : ''}`} />
              <span className="act-body">
                <span className="row1"><b>{n.name.replace(tl('传说石碑·'), '')}</b></span>
                <span className="row2">{REGIONS[n.region].name}{ok ? '' : tl(' · 未激活')}{cur ? tl(' · 你在这里') : ''}</span>
              </span>
              {ok && !cur && (
                <button className="primary" disabled={!here} onClick={() => { emitToGame('waystone', n.id); onClose(); }}>{tl('传送')}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
