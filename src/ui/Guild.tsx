import type { GameState } from '../core/types';
import { combatLevel } from '../core/sim';

/** 公会（用户 10-23：先做界面占位，等多人功能上线再接数据） */
type Fn = () => void;
const fns = new Set<Fn>();
export const openGuild = () => fns.forEach((f) => f());
export const onOpenGuild = (f: Fn) => {
  fns.add(f);
  return () => { fns.delete(f); };
};

const PERKS = [
  ['采集加成', '公会成员采集速度 +5%'], ['经验加成', '所有技能经验 +3%'], ['公会仓库', '成员共享的仓库格子'], ['公会首领', '全会一起挑战的周首领'],
];

export function GuildPanel({ s, onClose }: { s: GameState; onClose: () => void }) {
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>公会</h2>
        <small className="muted">多人功能开发中</small>
      </div>
      <div className="guild-card frame">
        <div className="guild-emblem">?</div>
        <div>
          <b>尚未加入公会</b>
          <p className="muted">公会是玩家组成的团体：一起做公会任务、共享仓库、挑战公会首领，并获得全会加成。多人功能上线后开放。</p>
        </div>
      </div>
      <div className="go">
        <button className="primary" disabled>创建公会（需要 10000 金币）</button>
        <button disabled>搜索公会</button>
      </div>

      <h3>成员 <small className="muted">0 / 30</small></h3>
      <ul className="guild-list">
        <li><span className="muted">[苍岭] 你</span><small className="muted">战斗等级 {combatLevel(s)} · 尚未加入</small></li>
        {['会长', '副会长', '成员'].map((r) => (
          <li key={r} className="ghost"><span>— 空位 —</span><small className="muted">{r}</small></li>
        ))}
      </ul>

      <h3>公会任务</h3>
      <ul className="guild-list">
        {['上交 500 个原木', '击败 100 只精英怪', '制作 50 件装备'].map((t) => (
          <li key={t} className="ghost"><span>{t}</span><small className="muted">未开放</small></li>
        ))}
      </ul>

      <h3>公会加成</h3>
      <div className="guild-perks">
        {PERKS.map(([n, d]) => (
          <div key={n} className="frame ghost"><b>{n}</b><small className="muted">{d}</small></div>
        ))}
      </div>
    </div>
  );
}
