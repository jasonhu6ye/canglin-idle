import { useState } from 'react';
import { CROP_DEFS, cropsOfField, NODES, plotsOf, REGIONS, tierName, WATER_SPEEDUP } from '../core/data';
import { canPlantCrop, FERT_SPEEDUP, fertCount, fieldCounts, growMs, harvestAll, installSprinkler, nearField, pickSeed, plantAll, plotGrowth, plotPhase, seedCount, waterAll } from '../core/farm';
import { isRaining } from '../core/weather';
import { ITEMS } from '../core/data';
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
  const chosen = s.settings.farmSeed?.[nodeId] ?? pickSeed(s, nodeId);
  const n = fieldCounts(s, nodeId, now);
  const auto = !!s.settings.autoFarm?.[nodeId];
  const seeds = chosen ? seedCount(s, chosen) : 0;
  const farmLv = level(s, 'farming');
  const plots = plotsOf(nodeId);
  const cols = Math.ceil(plots.length / 4);
  const [pick, setPick] = useState<string | null>(null);
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
            <i key={p.id} className={`fp ${ph} ${plot?.water ? 'wet' : ''} ${pick === p.id ? 'sel' : ''}`} onClick={() => setPick(pick === p.id ? null : p.id)}
              title={plot ? `${CROP_DEFS[plot.crop]?.name} · ${ph === 'ripe' ? '可以收获' : `${Math.floor(g * 100)}%，约 ${dur(plot.ripe - now)}${plot.water ? ' · 浇过水' : ' · 没浇水'}`}` : '空地'}>
              {plot && <span className={`fp-ic ${ph === 'ripe' ? '' : g < 0.5 ? 'young' : 'half'}`}><Icon item={g < 0.5 && ph !== 'ripe' ? `seed_${plot.crop}` : plot.crop} size={20} /></span>}
              {plot && ph !== 'ripe' && <b style={{ width: `${Math.max(6, g * 100)}%` }} />}
              {plot?.fert && <em className={`fp-fert f${plot.fert}`} />}
            </i>
          );
        })}
      </div>
      {pick && <PlotDetail s={s} id={pick} now={now} />}
      <FieldCrops s={s} nodeId={nodeId} now={now} />
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
      <FarmGear s={s} nodeId={nodeId} near={near} />
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
                  种植 {c.level} 级 · 约 {dur(growMs(s, c.id, fertLv(s, nodeId)))}成熟（浇水快 {WATER_SPEEDUP * 100}%）· 收 2-3 个
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

/** 点了小图上的一格：种的什么、长到几成、还要多久熟、浇没浇水 */
function PlotDetail({ s, id, now }: { s: GameState; id: string; now: number }) {
  const p = s.farm?.[id];
  const no = Number(id.split(':')[1]) + 1;
  if (!p) return <p className="farm-detail">第 {no} 格 · 空地，在地图上点它就能播种</p>;
  const c = CROP_DEFS[p.crop];
  const ripe = plotPhase(p, now) === 'ripe';
  return (
    <p className="farm-detail">
      第 {no} 格 · <Icon item={p.crop} size={14} /> <b>{c?.name}</b> ·{' '}
      {ripe ? <b className="gold">熟了，可以收获</b> : <>长到 {Math.floor(plotGrowth(p, now) * 100)}% · 约 {dur(p.ripe - now)}后熟 · {p.water ? '已浇水' : <span className="warn">没浇水</span>}{p.fert && ` · 施了${p.fert === 2 ? '高级' : '普通'}肥料`}</>}
    </p>
  );
}

/** 这块田里种了哪些作物：每种几格、熟了几格、最快还要多久（用户 10-23 要求农田页显示种植物信息） */
function FieldCrops({ s, nodeId, now }: { s: GameState; nodeId: string; now: number }) {
  const by = new Map<string, { n: number; ripe: number; dry: number; next: number }>();
  for (const p of plotsOf(nodeId)) {
    const plot = s.farm?.[p.id];
    if (!plot) continue;
    const e = by.get(plot.crop) ?? { n: 0, ripe: 0, dry: 0, next: Infinity };
    e.n++;
    if (plotPhase(plot, now) === 'ripe') e.ripe++;
    else {
      e.next = Math.min(e.next, plot.ripe - now);
      if (!plot.water) e.dry++;
    }
    by.set(plot.crop, e);
  }
  if (!by.size) return null;
  return (
    <ul className="field-crops">
      {[...by].map(([id, e]) => (
        <li key={id}>
          <Icon item={id} size={24} />
          <span>
            <b>{CROP_DEFS[id]?.name}</b> <span className="muted">× {e.n} 格</span>
            <small>
              {e.ripe > 0 && <b className="gold">{e.ripe} 格可收获 </b>}
              {e.next < Infinity && <span className="muted">最快 {dur(e.next)}后熟</span>}
              {e.dry > 0 && <span className="warn"> · {e.dry} 格没浇水</span>}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 这块田种下时施哪种肥（不选就不施） */
const fertLv = (s: GameState, nodeId: string) => {
  const f = s.settings.farmFert?.[nodeId];
  return f === 'fert_rich' && fertCount(s, f) > 0 ? 2 : f === 'fert_basic' && fertCount(s, f) > 0 ? 1 : 0;
};

/** 施肥和洒水器（用户 10-23 要求增加农耕玩法） */
function FarmGear({ s, nodeId, near }: { s: GameState; nodeId: string; near: boolean }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const fert = s.settings.farmFert?.[nodeId] ?? '';
  const setFert = (id: string) => store.dispatch((g) => setSettings(g, { farmFert: { ...g.settings.farmFert, [nodeId]: id } }));
  const has = s.sprinklers?.includes(nodeId);
  const kits = fertCount(s, 'sprinkler');
  const rain = isRaining(node.region);
  return (
    <div className="farm-gear">
      {rain && <p className="rain-note">🌧 正在下雨，田里的作物自动算浇过水</p>}
      <div className="row-fert">
        <span>施肥</span>
        <button className={`pill ${!fert ? 'on' : ''}`} onClick={() => setFert('')}>不施</button>
        {(['fert_basic', 'fert_rich'] as const).map((id, i) => (
          <button key={id} className={`pill ${fert === id ? 'on' : ''}`} onClick={() => setFert(id)} title={ITEMS[id].desc}>
            <Icon item={id} size={14} /> {ITEMS[id].name} <small>×{fmtNum(fertCount(s, id))}</small> <small className="muted">快 {FERT_SPEEDUP[i + 1] * 100}%{i ? '、多收 1 个' : ''}</small>
          </button>
        ))}
      </div>
      {fert && !fertCount(s, fert) && <p className="warn small">{ITEMS[fert].name}用完了，种下的不会施肥。在工坊能做。</p>}
      <div className="row-fert">
        <span>洒水器</span>
        {has ? <b className="gold">已安装 · 新种的自动浇水</b> : (
          <>
            <button className="pill" disabled={!near || !kits} onClick={() => store.farm((g, t) => installSprinkler(g, nodeId, t))}>
              <Icon item="sprinkler" size={14} /> 安装 <small>有 {kits} 个</small>
            </button>
            {!kits && <small className="muted">在铁匠铺打造（锻造 20 级）</small>}
          </>
        )}
      </div>
    </div>
  );
}
