import { MAIN_GATES, type MapNode } from '../core/data';
import { atGate, combatLevel } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { emitToGame } from './GameCanvas';
import { tl } from '../i18n';

/** 冰原推荐的战斗等级（营地 95+） */
const REALM_MIN_LV = 95;

/**
 * 永冬传送门（用户 11-01）：苍岭城、落霞城城外各一座，冰原营地一座回程门。
 * 站在门旁边才能传；进冰原时先播一段入场动画。
 */
export function RealmGateSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const here = atGate(s)?.id === node.id;
  const camp = node.realmGate === 'camp';
  const cl = combatLevel(s);
  const jump = (to: string) => { emitToGame('realmgate', to); onClose(); };
  return (
    <div className="sheet portal-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{camp ? tl('回到主大陆') : tl('通往永冬冰原')}</small>
      </div>
      <div className="pad">
        {camp ? (
          <p>{tl('穿过回程门回到主大陆，可以选回苍岭城或落霞城城外。')}</p>
        ) : (
          <>
            <p>{tl('门的另一边是永冬冰原：主大陆东边隔着深海的一片冰原，只有这道门能过去。')}</p>
            <ul className="portal-tips">
              <li>{tl('冰原上没有采集资源，只会限时刷出怪物、精英、首领和宝箱，每个存在 30 分钟，到时间就消失。')}</li>
              <li>{tl('永霜巨人、雪堡男爵两个 125 级首领轮流出现，每小时有一个。')}</li>
              <li>{tl('等级 95-135，越往北越难。营地有仓库、石碑和回程门。')}</li>
            </ul>
            {cl < REALM_MIN_LV && <p className="warn">{tl`推荐战斗等级 ${REALM_MIN_LV} 以上（你现在 ${cl} 级）。`}</p>}
          </>
        )}
        <div className="go">
          {!here && <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>{tl`寻路去${node.name}`}</button>}
          {here && !camp && <button className="primary" onClick={() => jump('realm_gate_camp')}>{tl('进入永冬冰原')}</button>}
          {here && camp && MAIN_GATES.map((g) => (
            <button key={g.id} className="primary" onClick={() => jump(g.id)}>{g.realmGate === 'duskhaven' ? tl('回落霞城') : tl('回苍岭城')}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
