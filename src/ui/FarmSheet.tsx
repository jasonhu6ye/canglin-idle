import { CROP_DEFS, cropsOfField, NODES, plotsOf, REGIONS, tierName, WATER_SPEEDUP } from '../core/data';
import { canPlantCrop, fieldCounts, growMs, harvestAll, nearField, pickSeed, plantAll, plotGrowth, plotPhase, seedCount, waterAll } from '../core/farm';
import { level, setSettings } from '../core/sim';
import type { GameState } from '../core/types';
import { store } from '../store';
import { fmtNum } from './format';
import { Icon } from './icons';

/**
 * 田地面板（地块制种田，用户 10-23 要求像星露谷那样，也能快捷种）：
 * 选种子，一键种满 / 浇水 / 收获，自动补种开关；上面一张小图看每格地长到哪了。
 */
const dur = (ms: number) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
};

export function FarmSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const now = Date.now();
  const near = nearField(s, nodeId);
  const crops = cropsOfField(nodeId);
  const pick = pickSeed(s, nodeId);
  const chosen = s.settings.farmSeed?.[nodeId] ?? pick;
  const n = fieldCounts(s, nodeId, now);
  const auto = !!s.settings.autoFarm?.[nodeId];
  const seeds = chosen ? seedCount(s, chosen) : 0;
  const farmLv = level(s, 'farming');
  const plots = plotsOf(nodeId);
  const cols = Math.ceil(plots.length / 4);
  const choose = (id: string) => store.dispatch((g) => setSettings(g, { farmSeed: { ...g.settings.farmSeed, [nodeId]: id } }));

  return (
    <div className="sheet farm-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
        <small className="muted">{REGIONS[node.region].name} · {node.farm!.map(tierName).join('、')} 作物 · {plots.length} 格地</small>
      </div>

      <div className="farm-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {plots.map((p) => {
          const plot = s.farm?.[p.id];
          const ph = plotPhase(plot, now);
          const g = plot ? plotGrowth(plot, now) : 0;
          return (
            <i key={p.id} className={`fp ${ph} ${plot?.water ? 'wet' : ''}`}
              title={plot ? `${CROP_DEFS[plot.crop]?.name} · ${ph === 'ripe' ? '可以收获' : `${Math.floor(g * 100)}%，约 ${dur(plot.ripe - now)}${plot.water ? ' · 浇过水' : ' · 没浇水'}`}` : '空地'}>
              {plot && <b style={{ height: `${Math.max(15, g * 100)}%` }} />}
            </i>
          );
        })}
      </div>
      <p className="farm-stat">
        空地 <b>{n.empty}</b> · 生长中 <b>{n.growing}</b>{n.dry > 0 && <span className="muted">（{n.dry} 格没浇水）</span>} · 可收获 <b className={n.ripe ? 'gold' : ''}>{n.ripe}</b>
        {n.next < Infinity && <span className="muted"> · 下一格约 {dur(n.next)}后熟</span>}
      </p>

      {!near && (
        <div className="go far-bank">
          <span className="muted">要站在田里才能种地（作物不在旁边也照样长）</span>
          <button onClick={() => { store.requestWalk(nodeId); onClose(); }}>寻路去{node.name}</button>
        </div>
      )}

      <div className="farm-btns">
        <button className="primary" disabled={!near || !chosen || !seeds || !n.empty} onClick={() => chosen && store.farm((g, t) => plantAll(g, nodeId, chosen, t))}>
          种满 <small>{chosen ? `${CROP_DEFS[chosen].name} ×${Math.min(seeds, n.empty)}` : '没有种子'}</small>
        </button>
        <button disabled={!near || !n.dry} onClick={() => store.farm((g, t) => waterAll(g, nodeId, t))}>浇水 <small>{n.dry} 格</small></button>
        <button disabled={!near || !n.ripe} onClick={() => store.farm((g, t) => harvestAll(g, nodeId, t))}>收获 <small>{n.ripe} 格</small></button>
      </div>
      <label className="farm-auto">
        <input type="checkbox" checked={auto} onChange={(e) => store.dispatch((g) => setSettings(g, { autoFarm: { ...g.settings.autoFarm, [nodeId]: e.target.checked } }))} />
        <span><b>自动补种</b> <small className="muted">熟了自动收进仓库，再种同一种（种子先用背包、再用仓库），离线也照样</small></span>
      </label>

      <h3 className="farm-h">选种子</h3>
      <ul className="action-list">
        {crops.map((c) => {
          const lock = farmLv < c.level;
          const have = seedCount(s, c.id);
          return (
            <li key={c.id} className={`${chosen === c.id ? 'sel' : ''} ${lock ? 'locked' : ''}`} onClick={() => !lock && canPlantCrop(s, nodeId, c.id) && choose(c.id)}>
              <span className="act-icon"><Icon item={c.id} size={30} /></span>
              <span className="act-body">
                <span className="row1">
                  <b>{c.name}</b>
                  <span className="xph">每格 {fmtNum(c.xp)} 经验</span>
                </span>
                <span className="row2">
                  种植 {c.level} 级 · 约 {dur(growMs(s, c.id))}成熟（浇水快 {WATER_SPEEDUP * 100}%）· 收 2-3 个
                  {' · '}<span className={have ? '' : 'warn'}><Icon item={`seed_${c.id}`} size={14} /> 种子 {fmtNum(have)}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted pad small">
        也可以直接点地图上的地块：空地种下、长着的浇水、熟了收获。收获时 80% 收回种子，偶尔变异出下一种作物的种子。
        种子不够可以去集市的种子摊买。
      </p>
    </div>
  );
}
