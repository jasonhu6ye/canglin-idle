import { useMemo, useState } from 'react';
import { ITEMS, MONSTERS, nodesOfAction, REGIONS, TIERS, tierName } from '../core/data';
import { FAMILY_NAME, TRAITS, WORLD_SKILL, type Family, type TraitId } from '../core/bestiary';
import type { GameState, MonsterDef } from '../core/types';
import { MONSTER_DAMAGE_SCALE, WORLD_MOVE } from '../core/sim';
import { monsterIconUrl } from '../game/monsterArt';
import { Icon } from './icons';
import { fmtNum } from './format';
import { store } from '../store';
import { tl } from '../i18n';
import { etaText, nearestNode } from './eta';

export const RANK_NAME = { normal: tl('普通'), elite: tl('精英'), boss: tl('首领') };

export function MonsterIcon({ m, size = 32, unknown = false }: { m: MonsterDef; size?: number; unknown?: boolean }) {
  return <img className={`mon-icon ${unknown ? 'unknown' : ''}`} src={monsterIconUrl(m)} width={size} height={size} alt={m.name} draggable={false} />;
}

export function TraitChips({ m }: { m: MonsterDef }) {
  if (!m.traits.length) return null;
  return (
    <span className="traits">
      {m.traits.map((t) => {
        const d = TRAITS[t as TraitId];
        return <span key={t} className={`trait ${t.split('_')[0]}`} title={d.desc}>{d.name}</span>;
      })}
    </span>
  );
}

const pct = (c?: number) => (c === undefined ? tl('必掉') : `${Math.round(c * 1000) / 10}%`);

/** 怪物图鉴：没打过的只显示剪影、名字和出没地点，击败一次后显示全部属性和掉落 */
export function Bestiary({ s }: { s: GameState }) {
  const all = useMemo(() => Object.values(MONSTERS).filter((m) => m.id !== 'dummy').sort((a, b) => a.tier - b.tier || a.level - b.level), []);
  const [tier, setTier] = useState<number | 'all'>('all');
  const [kind, setKind] = useState<string>('all');
  const [sel, setSel] = useState<string | null>(null);
  const kills = s.bestiary ?? {};
  const families = [...new Set(all.map((m) => m.family))] as Family[];
  const shown = all.filter((m) => (tier === 'all' || m.tier === tier) && (kind === 'all'
    || (kind === 'creature' || kind === 'monster' ? m.kind === kind : kind === 'world' ? !!m.world : kind === 'elite' || kind === 'boss' ? m.rank === kind : m.family === kind)));
  const got = all.filter((m) => kills[m.id]).length;
  return (
    <>
      <p className="muted">{tl`已击败 ${got}/${all.length} 种 · 当前筛选 ${shown.filter((m) => kills[m.id]).length}/${shown.length}`}</p>
      <div className="chips-row">
        <button className={`pill ${tier === 'all' ? 'on' : ''}`} onClick={() => setTier('all')}>{tl('全部阶级')}</button>
        {TIERS.map((t, i) => (
          <button key={t.id} className={`pill ${tier === i ? 'on' : ''}`} onClick={() => setTier(i)}>{tierName(i)}</button>
        ))}
      </div>
      <div className="chips-row">
        {[['all', tl('全部')], ['creature', tl('生物')], ['monster', tl('怪物')], ['elite', tl('精英')], ['boss', tl('首领')], ['world', tl('世界首领')], ...families.map((f) => [f, FAMILY_NAME[f]])].map(([k, name]) => (
          <button key={k} className={`pill ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{name}</button>
        ))}
      </div>
      <div className="grid mon-grid">
        {shown.map((m) => (
          <button key={m.id} className={`cell ${kills[m.id] ? '' : 'unknown'} ${sel === m.id ? 'sel' : ''} rank-${m.rank}`} onClick={() => setSel(m.id)}>
            <MonsterIcon m={m} size={40} unknown={!kills[m.id]} />
            <span className="nm">{m.name}</span>
            <span className="lv">{tierName(m.tier)} · {m.level}</span>
          </button>
        ))}
      </div>
      {sel && <MonsterDetail m={MONSTERS[sel]} kills={kills[sel] ?? 0} />}
    </>
  );
}

/** reveal：地图上点怪物时直接给全部信息（图鉴里要先打败一次） */
export function MonsterDetail({ m, kills, reveal = false }: { m: MonsterDef; kills: number; reveal?: boolean }) {
  const near = nearestNode(store.state, nodesOfAction(`fight_${m.id}`).filter((n) => !n.closed));
  const node = near?.node;
  const where = node ? tl`${node.name}（${REGIONS[node.region].name}）` : REGIONS[m.region].name;
  return (
    <div className="item-detail frame mon-detail">
      <div className="row1">
        <span className="with-icon"><MonsterIcon m={m} size={64} unknown={!kills && !reveal} /> <b>{m.name}</b></span>
        <span className="muted">{tl`${tierName(m.tier)} · ${m.level} 级 · ${m.world ? tl('世界首领') : RANK_NAME[m.rank]}`}</span>
      </div>
      {m.world && WORLD_SKILL[m.id] && (
        <span className="world-skill">
          <b>{tl('☠ 世界首领')}</b>{tl` 专属大招「${WORLD_SKILL[m.id].name}」：${WORLD_SKILL[m.id].desc}。每 ${WORLD_MOVE.every} 下出手放一次，伤害 ×${WORLD_MOVE.mult}。击败后 ${Math.round(m.respawnMs / 60000)} 分钟才会再出现，必掉宝库。`}</span>
      )}
      <span className="muted">{tl`${m.kind === 'creature' ? tl('生物') : tl('怪物')} · ${FAMILY_NAME[m.family as Family]} · 出没：${where}`}</span>
      {!reveal && node && <button className="primary" onClick={() => store.track(m.id)}>{tl('在地图上追踪')} <small>{etaText(near!.route)}</small></button>}
      {!kills && !reveal ? (
        <span className="muted">{tl('尚未击败。打败一次后可查看属性、特性和掉落。')}</span>
      ) : (
        <>
          <span>{tl`已击败 ${fmtNum(kills)} 只`}</span>
          <span className="stat-row">
            <span>{tl('生命 ')}<b>{fmtNum(m.hp)}</b></span>
            <span>{tl('攻击 ')}<b>{m.attack}</b></span>
            <span>{tl('防御 ')}<b>{m.defence}</b></span>
            <span>{tl('最高伤害 ')}<b>{m.maxHit * MONSTER_DAMAGE_SCALE}</b></span>
            <span>{tl('攻速 ')}<b>{tl`${(m.attackMs / 1000).toFixed(1)} 秒`}</b></span>
            <span>{tl('刷新 ')}<b>{tl`${(m.respawnMs / 1000).toFixed(1)} 秒`}</b></span>
          </span>
          {m.traits.length > 0 && <b className="sub">{tl('特性')}</b>}
          {m.traits.map((t) => (
            <span key={t} className="muted"><span className={`trait ${t.split('_')[0]}`}>{TRAITS[t as TraitId].name}</span> {TRAITS[t as TraitId].desc}</span>
          ))}
          <b className="sub">{tl('掉落')}</b>
          <div className="drop-list">
            {m.drops.map((d) => (
              <span key={d.item} className="drop">
                <Icon item={d.item} size={20} /> {ITEMS[d.item].name} ×{d.qty} <small className="muted">{pct(d.chance)}</small>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
