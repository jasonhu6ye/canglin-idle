import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameState } from '../core/types';
import { ITEMS, tierName } from '../core/data';
import { qClass } from '../core/quality';
import { sortItemIds } from '../core/sim';
import {
  EXCHANGE_DAY_MAX, GUILD_MAX_LV, GUILD_XP, VALUE_PER_CONTRIB, VAULT_COST, VAULT_SLOTS,
  dailyTasks, exchangeGain, guildMembersCap, guildPerks, guildSlots, setGuildLv, utcDay, utcWeek,
} from '../core/guild';
import { online, type Guild, type GuildBankLog, type GuildMember, type GuildRole, type GuildTask, type GuildVault } from '../net';
import { store } from '../store';
import { Icon } from './icons';
import { fmtNum } from './format';
import { useSticky } from './sticky';
import { tl } from '../i18n';

/**
 * 公会玩法（用户 10-26）：公会等级和加成、物品兑换贡献、每日任务、公会仓库和私人仓库。
 * 公会仓库不用回城，随时点开就能存取（用户要求）：存的东西从自己仓库扣、不够再扣背包，取出来的放进自己仓库。
 */

type Act = { busy: boolean; run: (f: () => Promise<unknown>) => Promise<void> };

const nameOf = (id: string) => {
  const it = ITEMS[id];
  if (!it) return id;
  return `${it.tier !== undefined && !/^T\d/.test(it.name) ? `${tierName(it.tier)} ` : ''}${it.name}`;
};
const own = (s: GameState, id: string) => (s.bank[id] ?? 0) + (s.bag[id] ?? 0);
/** 自己仓库加背包里能拿出来的东西（不含金币），按「整理」的顺序 */
const ownList = (s: GameState) => sortItemIds([...new Set([...Object.keys(s.bank), ...Object.keys(s.bag)])]
  .filter((id) => id !== 'coins' && ITEMS[id] && own(s, id) > 0));

/** 从自己仓库扣，不够的从背包扣（调用前先确认够） */
function take(id: string, n: number) {
  store.dispatch((g) => {
    const bank = { ...g.bank }, bag = { ...g.bag };
    const a = Math.min(n, bank[id] ?? 0);
    bank[id] = (bank[id] ?? 0) - a;
    bag[id] = Math.max(0, (bag[id] ?? 0) - (n - a));
    if (!bank[id]) delete bank[id];
    if (!bag[id]) delete bag[id];
    return { ...g, bank, bag };
  });
}
function give(id: string, n: number) {
  if (n <= 0 || !ITEMS[id]) return;
  store.dispatch((g) => ({ ...g, bank: { ...g.bank, [id]: (g.bank[id] ?? 0) + n }, seen: { ...g.seen, [id]: 1 } }));
}
/** 本地先扣、服务器收下多少算多少，剩下的退回；出错全退 */
async function hand(id: string, n: number, send: () => Promise<number>) {
  take(id, n);
  let got = 0;
  try { got = await send(); } finally { give(id, n - Math.max(0, Math.min(n, got))); }
  return got;
}
/** 问数量（只有 1 个就不问） */
function ask(max: number) {
  if (max <= 1) return max;
  const v = prompt(tl`数量（最多 ${max}）`, String(max));
  const n = Math.floor(Number(v));
  return v == null || !Number.isFinite(n) ? 0 : Math.max(0, Math.min(max, n));
}

export const weeklyOf = (m: GuildMember) => (m.week === utcWeek() ? m.weekly : 0);

interface Ctx { s: GameState; guild: Guild; members: GuildMember[]; me?: GuildMember; role: GuildRole; act: Act; reload: () => Promise<void> }

export function GuildPlay(p: Ctx) {
  const { guild, me } = p;
  const [tab, setTab] = useSticky<'info' | 'tasks' | 'bank'>('guild.tab', 'info');
  // 公会等级存进存档，加成离线也算
  useEffect(() => { store.dispatch((g) => setGuildLv(g, guild.level)); }, [guild.level]);
  const lv = guild.level;
  const next = GUILD_XP[lv] ?? null;
  const pct = next == null ? 100 : ((guild.xp - GUILD_XP[lv - 1]) / (next - GUILD_XP[lv - 1])) * 100;
  return (
    <>
      <div className="frame guild-lv">
        <div className="row-tools"><b>{tl`公会 Lv${lv}`}</b><small className="muted">{next == null ? tl('已满级') : tl`经验 ${fmtNum(guild.xp)} / ${fmtNum(next)}`}</small></div>
        <span className="bar wide"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
        <small className="muted">
          {tl`公会贡献值 ${fmtNum(guild.points)}`}
          {me && tl` · 我的贡献：累计 ${fmtNum(me.contrib)}，本周 ${fmtNum(weeklyOf(me))}`}
        </small>
      </div>
      <div className="chips-row">
        {([['info', tl('等级和兑换')], ['tasks', tl('公会任务')], ['bank', tl('公会仓库')]] as const).map(([id, label]) => (
          <button key={id} className={`pill ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'info' && <Info {...p} />}
      {tab === 'tasks' && <Tasks {...p} />}
      {tab === 'bank' && <Bank {...p} />}
    </>
  );
}

function perkText(lv: number) {
  const p = guildPerks(lv);
  return [tl`经验 +${Math.round(p.xp * 100)}%`, tl`金币 +${Math.round(p.coins * 100)}%`, tl`干活速度 +${Math.round(p.speed * 100)}%`].join(' · ');
}

function Info({ s, guild, me, act, reload }: Ctx) {
  const [q, setQ] = useState('');
  const today = me?.donatedDay === utcDay() ? me.donated ?? 0 : 0;
  const left = Math.max(0, EXCHANGE_DAY_MAX - today);
  const mine = useMemo(() => ownList(s), [s.bank, s.bag]);
  const trade = (id: string) => {
    const value = ITEMS[id].value;
    // 今天剩下的额度最多能换几个
    const cap = Math.min(own(s, id), Math.floor((left * VALUE_PER_CONTRIB) / Math.max(1, value)));
    const n = ask(cap);
    if (n > 0 && exchangeGain(value, n) > 0) void act.run(async () => { await hand(id, n, () => online.exchangeItems(id, n, value)); await reload(); });
  };
  const lv = guild.level;
  return (
    <>
      <h3>{tl('公会加成 ')}<small className="muted">{tl('所有成员都有，离线也算')}</small></h3>
      <div className="frame guild-perk-now">
        <b>{tl`当前 Lv${lv}`}</b> <small>{lv > 1 ? perkText(lv) : tl('2 级起开始有加成')}</small>
        <br /><small className="muted">{tl`人数上限 ${guildMembersCap(lv)} · 公共仓库 ${guildSlots(lv)} 种物品`}</small>
        {lv < GUILD_MAX_LV && <><br /><small className="muted">{tl`下一级：${perkText(lv + 1)} · 人数 ${guildMembersCap(lv + 1)} · 仓库 ${guildSlots(lv + 1)} 种`}</small></>}
      </div>
      <h3>{tl('物品兑换贡献 ')}<small className="muted">{tl`每 ${VALUE_PER_CONTRIB} 金币价值 = 1 贡献`}</small></h3>
      <p className="muted small-note">{tl`用自己仓库和背包里的东西换贡献，同时给公会同样多的经验和贡献值。今天还能换 ${fmtNum(left)} / ${EXCHANGE_DAY_MAX} 贡献（每天 0 点 UTC 重置）。`}</p>
      <input className="guild-search" placeholder={tl('搜索物品')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="guild-list guild-scroll">
        {!mine.length && <li className="ghost">{tl('仓库和背包里没有能兑换的东西')}</li>}
        {mine.filter((id) => !q || nameOf(id).toLowerCase().includes(q.toLowerCase())).slice(0, 80).map((id) => {
          const per = ITEMS[id].value / VALUE_PER_CONTRIB;
          return (
            <li key={id}>
              <span className="with-icon"><Icon item={id} size={28} /> <b className={qClass(ITEMS[id].quality)}>{nameOf(id)}</b> <small className="muted">×{fmtNum(own(s, id))}</small></span>
              <span className="row-tools">
                <small className="muted">{per >= 1 ? tl`每个 ${fmtNum(Math.floor(per * 10) / 10)} 贡献` : tl`${Math.ceil(1 / per)} 个 1 贡献`}</small>
                <button className="small" disabled={act.busy || left <= 0 || exchangeGain(ITEMS[id].value, own(s, id)) <= 0} onClick={() => trade(id)}>{tl('兑换')}</button>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Tasks({ s, guild, act, reload }: Ctx) {
  const [tasks, setTasks] = useState<GuildTask[] | null>(null);
  const load = useCallback(async () => {
    const day = utcDay();
    let list = await online.guildTasks();
    const end = Date.parse(day) + 86_400_000;
    if (!list.some((t) => t.endsAt === end)) {
      await online.ensureGuildTasks(dailyTasks(guild.id, day, guild.level));
      list = await online.guildTasks();
    }
    setTasks(list.filter((t) => t.endsAt > Date.now()));
  }, [guild.id, guild.level]);
  useEffect(() => { void act.run(load); }, [load]);
  const submit = (t: GuildTask) => {
    const n = Math.min(own(s, t.target), t.need - t.have);
    if (n <= 0) return;
    void act.run(async () => { await hand(t.target, n, () => online.contribute(t.id, n)); await load(); await reload(); });
  };
  const hours = Math.ceil((Date.parse(utcDay()) + 86_400_000 - Date.now()) / 3_600_000);
  return (
    <>
      <p className="muted small-note">{tl`每天三条，全公会一起交，${hours} 小时后换新。每交一个得到对应贡献（比兑换多 50%，也不占每天的兑换额度），交满后公会额外拿经验。`}</p>
      {!tasks && <p className="muted">{tl('读取中…')}</p>}
      <ul className="guild-list guild-tasks">
        {tasks?.map((t) => {
          const have = own(s, t.target), done = t.have >= t.need;
          return (
            <li key={t.id} className={done ? 'ghost' : ''}>
              <span className="with-icon"><Icon item={t.target} size={28} />
                <span className="task-text">
                  <b className={qClass(ITEMS[t.target]?.quality)}>{nameOf(t.target)}</b> <small className="muted">{t.have} / {t.need}</small>
                  <span className="bar wide"><i style={{ width: `${(t.have / t.need) * 100}%` }} /></span>
                  <small className="muted">{tl`每个 +${t.per} 贡献 · 交满公会 +${fmtNum(t.reward)} 经验`}</small>
                </span>
              </span>
              <span className="row-tools">
                {done ? <small>{tl('已完成')}</small> : (
                  <button className="small" disabled={act.busy || have <= 0} onClick={() => submit(t)}>{tl`上交 ${Math.min(have, t.need - t.have)}`}</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Bank({ s, guild, members, me, role, act, reload }: Ctx) {
  const [vaults, setVaults] = useState<GuildVault[]>([]);
  const [vault, setVault] = useSticky<number>('guild.vault', 0);
  const [items, setItems] = useState<[string, number][] | null>(null);
  const [log, setLog] = useState<GuildBankLog[]>([]);
  const [mode, setMode] = useSticky<'take' | 'put' | 'log' | 'perm'>('guild.bank', 'take');
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const myId = me?.playerId;
  const canEnter = (v: GuildVault) => role === 'leader' || (!!myId && v.allow.includes(myId)) || (v.officers && role === 'officer');
  const cur = vaults.find((v) => v.idx === vault);
  const inVault = vault === 0 || (!!cur && canEnter(cur));
  const load = useCallback(async () => {
    const vs = await online.guildVaults();
    setVaults(vs);
    const v = vs.find((x) => x.idx === vault);
    const ok = vault === 0 || (!!v && (role === 'leader' || (!!myId && v.allow.includes(myId)) || (v.officers && role === 'officer')));
    if (!ok) { setVault(0); return; }
    const [b, l] = await Promise.all([online.guildBank(vault), online.guildBankLog()]);
    setItems(b); setLog(l);
  }, [vault, role, myId]);
  useEffect(() => { setItems(null); void act.run(load); }, [load]);

  const manager = role !== 'member';
  const canTake = vault !== 0 || manager || (guild.takeMin >= 0 && (me?.contrib ?? 0) >= guild.takeMin);
  const canEdit = !!cur && (role === 'leader' || (role === 'officer' && canEnter(cur)));
  const slots = vault ? VAULT_SLOTS : guildSlots(guild.level);
  const used = items?.length ?? 0;
  const has = new Set(items?.map(([id]) => id));
  const match = (id: string) => !q || nameOf(id).toLowerCase().includes(q.toLowerCase());
  const mine = useMemo(() => ownList(s), [s.bank, s.bag]);
  const vaultName = (i: number) => (i === 0 ? tl('公共仓库') : vaults.find((v) => v.idx === i)?.name ?? tl('私人仓库'));

  const put = (id: string) => {
    const n = ask(own(s, id));
    if (n > 0) void act.run(async () => { await hand(id, n, async () => { await online.guildDeposit(id, n, vault); return n; }); await load(); });
  };
  const pull = (id: string, have: number) => {
    const n = ask(have);
    if (n > 0) void act.run(async () => { give(id, await online.guildWithdraw(id, n, vault)); await load(); });
  };
  const tidy = () => items && void act.run(async () => { await online.sortGuildBank(vault, sortItemIds(items.map(([id]) => id))); await load(); });
  const openNew = () => {
    const cost = VAULT_COST[vaults.length];
    const name = prompt(tl`私人仓库的名字（花 ${fmtNum(cost)} 公会贡献值，开好后只有你和会长能进，可以再加人）`, tl('私人仓库'));
    if (name != null) void act.run(async () => { const i = await online.openVault(name); setVault(i); setMode('perm'); await reload(); await load(); });
  };
  const rule = guild.takeMin < 0 ? tl('只有会长和副会长能取') : guild.takeMin === 0 ? tl('所有成员都能取') : tl`累计贡献 ${guild.takeMin} 以上的成员能取`;
  const nextCost = VAULT_COST[vaults.length];
  return (
    <>
      <div className="chips-row">
        <button className={`pill ${vault === 0 ? 'on' : ''}`} onClick={() => setVault(0)}>{tl('公共仓库')}</button>
        {vaults.map((v) => (
          <button key={v.idx} className={`pill ${vault === v.idx ? 'on' : ''}`} disabled={!canEnter(v)} title={canEnter(v) ? '' : tl('没有权限')} onClick={() => setVault(v.idx)}>
            {canEnter(v) ? '' : '🔒 '}{v.name}
          </button>
        ))}
        {manager && nextCost != null && (
          <button className="pill" disabled={act.busy || guild.points < nextCost} onClick={openNew}>{tl`＋ 私人仓库（${fmtNum(nextCost)} 贡献值）`}</button>
        )}
      </div>
      <p className="muted small-note">
        {tl`随时随地都能存取，不用回城。取出的东西放进自己的仓库。${used} / ${slots} 种 · `}
        {vault === 0 ? rule : tl`只有名单里的人${cur?.officers ? tl('、副会长') : ''}和会长能进`}
      </p>
      {inVault && (
        <div className="chips-row">
          {([['take', tl('仓库物品')], ['put', tl('存入')], ['log', tl('存取记录')], ...(canEdit ? [['perm', tl('权限')]] : []), ...(vault === 0 && role === 'leader' ? [['perm', tl('权限')]] : [])] as [typeof mode, string][]).map(([id, label]) => (
            <button key={id} className={`pill ${mode === id ? 'on' : ''}`} onClick={() => setMode(id)}>{label}</button>
          ))}
          {mode === 'take' && <button className="pill" disabled={act.busy || !items?.length} onClick={tidy}>{tl('整理')}</button>}
        </div>
      )}
      {inVault && (mode === 'take' || mode === 'put') && <input className="guild-search" placeholder={tl('搜索物品')} value={q} onChange={(e) => setQ(e.target.value)} />}
      {inVault && mode === 'take' && (
        <ul className="guild-list guild-scroll">
          {!items && <li className="ghost">{tl('读取中…')}</li>}
          {items && !used && <li className="ghost">{tl('仓库还是空的')}</li>}
          {items?.filter(([id]) => match(id)).map(([id, n]) => (
            <li key={id}>
              <span className="with-icon"><Icon item={id} size={28} /> <b className={qClass(ITEMS[id]?.quality)}>{nameOf(id)}</b> <small className="muted">×{fmtNum(n)}</small></span>
              <button className="small" disabled={act.busy || !canTake || !ITEMS[id]} onClick={() => pull(id, n)}>{tl('取出')}</button>
            </li>
          ))}
        </ul>
      )}
      {inVault && mode === 'put' && (
        <ul className="guild-list guild-scroll">
          {!mine.length && <li className="ghost">{tl('仓库和背包里没有能存的东西')}</li>}
          {mine.filter(match).slice(0, 120).map((id) => (
            <li key={id}>
              <span className="with-icon"><Icon item={id} size={28} /> <b className={qClass(ITEMS[id].quality)}>{nameOf(id)}</b> <small className="muted">×{fmtNum(own(s, id))}</small></span>
              <button className="small" disabled={act.busy || !items || (!has.has(id) && used >= slots)} onClick={() => put(id)}>{tl('存入')}</button>
            </li>
          ))}
        </ul>
      )}
      {inVault && mode === 'log' && (
        <>
          <select className="guild-search" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{tl('全部玩家')}</option>
            {[...new Set(log.map((l) => l.name))].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <ul className="guild-list guild-scroll">
            {!log.some((l) => l.vault === vault) && <li className="ghost">{tl('还没有存取记录')}</li>}
            {log.filter((l) => l.vault === vault && (!who || l.name === who)).map((l, i) => (
              <li key={i}>
                <span className="with-icon">
                  <Icon item={l.item} size={20} info={false} />
                  <span>{l.name} <small className={l.qty > 0 ? 'gain' : 'loss'}>{l.qty > 0 ? tl('存入') : tl('取走')}</small> {nameOf(l.item)} ×{fmtNum(Math.abs(l.qty))}</span>
                </span>
                <small className="muted">{new Date(l.at).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ))}
          </ul>
          <small className="muted">{tl`${vaultName(vault)}的记录保留 30 天`}</small>
        </>
      )}
      {inVault && mode === 'perm' && vault === 0 && role === 'leader' && (
        <div className="go">
          <button disabled={act.busy} onClick={() => {
            const v = prompt(tl('成员从公共仓库取东西要多少累计贡献？填 0 = 所有人都能取，-1 = 只有会长和副会长'), String(guild.takeMin));
            if (v != null && Number.isFinite(Number(v))) void act.run(async () => { await online.setTakeMin(Math.floor(Number(v))); await reload(); });
          }}>{tl`设置取物门槛（现在：${rule}）`}</button>
        </div>
      )}
      {inVault && mode === 'perm' && cur && canEdit && <VaultPerm v={cur} members={members} act={act} onSaved={load} />}
    </>
  );
}

/** 私人仓库权限：改名、勾选能进的成员、副会长是否都能进 */
function VaultPerm({ v, members, act, onSaved }: { v: GuildVault; members: GuildMember[]; act: Act; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(v.name);
  const [allow, setAllow] = useState(new Set(v.allow));
  const [officers, setOfficers] = useState(v.officers);
  useEffect(() => { setName(v.name); setAllow(new Set(v.allow)); setOfficers(v.officers); }, [v]);
  const flip = (id: string) => setAllow((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      <form className="search-row" onSubmit={(e) => e.preventDefault()}>
        <input maxLength={12} value={name} onChange={(e) => setName(e.target.value)} placeholder={tl('仓库名字')} />
      </form>
      <label className="guild-check"><input type="checkbox" checked={officers} onChange={(e) => setOfficers(e.target.checked)} /> {tl('所有副会长都能进')}</label>
      <p className="muted small-note">{tl('勾选能进这个仓库的成员（会长总能进）：')}</p>
      <ul className="guild-list guild-scroll">
        {members.filter((m) => m.role !== 'leader').map((m) => (
          <li key={m.playerId}>
            <label className="guild-check"><input type="checkbox" checked={allow.has(m.playerId)} onChange={() => flip(m.playerId)} /> {m.name}</label>
            <small className="muted">{m.role === 'officer' ? tl('副会长') : tl('成员')}</small>
          </li>
        ))}
      </ul>
      <div className="go">
        <button className="primary" disabled={act.busy} onClick={() => void act.run(async () => { await online.setVault(v.idx, name, [...allow], officers); await onSaved(); })}>{tl('保存权限')}</button>
      </div>
    </>
  );
}
