import { fmtNum } from './format';
import { useSticky } from './sticky';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, SkillId } from '../core/types';
import { SKILLS } from '../core/data';
import { store } from '../store';
import { online, GUILD_COST, NAME_RE, TAG_RE, type Board, type Guild, type GuildMember, type GuildRole, type RankRow } from '../net';
import { retry, signOut, useOnline } from '../net/sync';
import { errText as baseErr } from './Login';
import { openChatPage } from './ChatDock';
import { tl } from '../i18n';
import { GuildPlay, weeklyOf } from './GuildPlay';
import { setGuildLv } from '../core/guild';

/** 公会页（G 键）。排行榜、账号设置也在这个文件里，分别从「更多」打开；好友在聊天页 */
type Fn = () => void;
const fns = new Set<Fn>();
export const openGuild = () => fns.forEach((f) => f());
export const onOpenGuild = (f: Fn) => {
  fns.add(f);
  return () => { fns.delete(f); };
};

const ROLE: Record<GuildRole, string> = { leader: tl('会长'), officer: tl('副会长'), member: tl('成员') };
const errText = (e: unknown) => {
  const m = baseErr(e);
  return /guilds_name_key/.test(m) ? tl('这个公会名已经有人用了') : /guilds_tag_key/.test(m) ? tl('这个会标已经有人用了') : m;
};

/** 异步按钮：转圈、出错显示 */
function useAct() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = useCallback(async (f: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await f(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }, []);
  return { busy, err, run, setErr };
}

export function GuildPanel({ s, onClose }: { s: GameState; onClose: () => void }) {
  const { me } = useOnline();
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('公会')}</h2>
        {me?.guildTag && <small className="muted">[{me.guildTag}]</small>}
      </div>
      {me ? <GuildTab s={s} /> : <AccountSettings />}
    </div>
  );
}

/** 排行榜页（10-25 从联机页移到「更多」） */
export function LeaderboardPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('排行榜')}</h2>
      </div>
      <Ranks />
    </div>
  );
}

/** 账号设置（放在「更多 → 设置」里） */
export function AccountSettings() {
  const { me } = useOnline();
  const { busy, err, run } = useAct();
  if (!me) {
    return (
      <div className="frame guild-card">
        <div>
          <b>{tl('离线游玩中')}</b>
          <p className="muted">{tl('刚才连不上服务器。连上后登录，进度会自动传到云端。')}</p>
          <div className="go"><button className="primary" disabled={busy} onClick={() => run(retry)}>{tl('重新连接')}</button></div>
          {err && <p className="err">{err}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="frame guild-card">
      <div>
        <b>{me.name}</b>{me.guildTag && <small className="muted"> [{me.guildTag}]</small>} <small className="muted">ID {me.pid}</small>
        <p className="muted">{tl('存档每分钟自动传到云端，换手机或电脑登录同一个账号就能接着玩。')}</p>
        <div className="go">
          <button disabled={busy} onClick={() => {
            const n = prompt(tl('新的角色名（2-12 个字）'), me.name);
            if (n && n !== me.name) {
              if (!NAME_RE.test(n)) { alert(tl('名字 2-12 个字，只能用文字、数字和下划线')); return; }
              void run(() => online.rename(n));
            }
          }}>{tl('改名')}</button>
          <button disabled={busy} onClick={() => confirm(tl('退出登录？进度已经存在云端。')) && void run(signOut)}>{tl('退出登录')}</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}

const BOARDS: [Board, string][] = [['total', tl('总等级')], ['combat', tl('战斗等级')], ...(Object.keys(SKILLS) as SkillId[]).map((k): [Board, string] => [k, SKILLS[k].name])];

function Ranks() {
  const { me } = useOnline();
  const [board, setBoard] = useSticky<Board>('rank.board', 'total');
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [mine, setMine] = useState<RankRow | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setRows(null); setErr('');
    online.leaderboard(board, 100).then((r) => live && setRows(r)).catch((e) => live && setErr(errText(e)));
    if (me) online.myRank(board).then((r) => live && setMine(r)).catch(() => {});
    return () => { live = false; };
  }, [board, me]);
  return (
    <>
      <div className="chips-row">
        {BOARDS.map(([id, label]) => (
          <button key={id} className={`pill ${board === id ? 'on' : ''}`} onClick={() => setBoard(id)}>{label}</button>
        ))}
      </div>
      {mine && <p className="muted">{tl`我的排名：第 ${mine.rank} 名 · ${mine.value} 级`}</p>}
      {err && <p className="err">{err}</p>}
      {!rows && !err && <p className="muted">{tl('读取中…')}</p>}
      {rows && !rows.length && <p className="muted">{tl('还没有人上榜，登录后就会出现。')}</p>}
      <ol className="guild-list rank-list">
        {rows?.map((r) => (
          <li key={r.playerId} className={r.playerId === me?.id ? 'me' : ''}>
            <span><b className={`rank-no r${r.rank}`}>{r.rank}</b>{r.guildTag && <small className="muted">[{r.guildTag}] </small>}{r.name}</span>
            <small>{tl`${r.value} 级`}</small>
          </li>
        ))}
      </ol>
    </>
  );
}

function GuildTab({ s }: { s: GameState }) {
  const { me } = useOnline();
  const [guild, setGuild] = useState<Guild | null | undefined>(undefined);
  const [members, setMembers] = useState<GuildMember[]>([]);
  const act = useAct();
  const load = useCallback(async () => {
    const g = await online.guild();
    setGuild(g);
    setMembers(g ? await online.guildMembers(g.id) : []);
  }, []);
  useEffect(() => { void load().catch((e) => act.setErr(errText(e))); }, [load, me?.guildId]);
  // 不在公会了：公会加成也去掉
  useEffect(() => { if (guild === null) store.dispatch((g) => setGuildLv(g, 0)); }, [guild]);
  if (guild === undefined) return <p className="muted">{tl('读取中…')}{act.err && <span className="err"> {act.err}</span>}</p>;
  if (!guild) return <NoGuild s={s} onJoined={load} />;
  const mine = members.find((m) => m.playerId === me?.id);
  const myRole = mine?.role ?? 'member';
  const isLead = myRole === 'leader';
  const canManage = myRole !== 'member';
  return (
    <>
      <div className="guild-card frame">
        <div className="guild-emblem on">{guild.tag}</div>
        <div>
          <b>{guild.name}</b> <small className="muted">{tl`Lv${guild.level} · ${guild.members}/${guild.maxMembers} 人`}</small>
          <p className="muted">{guild.notice || tl('会长还没写公告')}</p>
        </div>
      </div>
      {canManage && (
        <div className="go">
          <button disabled={act.busy} onClick={() => {
            const t = prompt(tl('公会公告（200 字以内）'), guild.notice);
            if (t != null) void act.run(async () => { await online.setNotice(t); await load(); });
          }}>{tl('改公告')}</button>
        </div>
      )}
      <GuildPlay s={s} guild={guild} members={members} me={mine} role={myRole} act={act} reload={load} />
      <h3>{tl('成员 ')}<small className="muted">{members.length} / {guild.maxMembers}</small></h3>
      <ul className="guild-list">
        {members.sort((a, b) => order(a.role) - order(b.role) || weeklyOf(b) - weeklyOf(a) || b.contrib - a.contrib).map((m) => (
          <li key={m.playerId}>
            <span>{m.name} <small className="muted">{ROLE[m.role]}</small></span>
            <span className="row-tools">
              <small className="muted">{tl`总等级 ${m.totalLevel} · 贡献 ${fmtNum(m.contrib)}（本周 ${fmtNum(weeklyOf(m))}）`}</small>
              {m.playerId !== me?.id && isLead && (
                <select value={m.role} disabled={act.busy} onChange={(e) => {
                  const r = e.target.value as GuildRole;
                  if (r === 'leader' && !confirm(tl`把会长转给 ${m.name}？`)) return;
                  void act.run(async () => { await online.setRole(m.playerId, r); await load(); });
                }}>
                  {(['member', 'officer', 'leader'] as GuildRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                </select>
              )}
              {m.playerId !== me?.id && (isLead || (canManage && m.role === 'member')) && (
                <button className="small" disabled={act.busy} onClick={() => confirm(tl`把 ${m.name} 移出公会？`) && void act.run(async () => { await online.kick(m.playerId); await load(); })}>{tl('踢出')}</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {act.err && <p className="err">{act.err}</p>}
      <div className="go">
        <button onClick={() => openChatPage('guild')}>{tl('公会聊天')}</button>
        <button disabled={act.busy} onClick={() => confirm(isLead && members.length > 1 ? tl('你是会长，退出后会长自动传给副会长或最早入会的成员。确定退出？') : tl('确定退出公会？'))
          && void act.run(async () => { await online.leaveGuild(); store.dispatch((g) => setGuildLv(g, 0)); await load(); })}>{tl('退出公会')}</button>
      </div>
    </>
  );
}
const order = (r: GuildRole) => (r === 'leader' ? 0 : r === 'officer' ? 1 : 2);

function NoGuild({ s, onJoined }: { s: GameState; onJoined: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Guild[] | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const act = useAct();
  const coins = s.bank.coins ?? 0;
  useEffect(() => { void online.searchGuilds('').then(setList).catch(() => setList([])); }, []);
  const create = () => {
    if (!NAME_RE.test(name)) { act.setErr(tl('公会名 2-12 个字')); return; }
    if (!TAG_RE.test(tag)) { act.setErr(tl('会标 2-4 个字')); return; }
    if (coins < GUILD_COST) { act.setErr(tl`仓库里金币不够 ${GUILD_COST}`); return; }
    void act.run(async () => {
      await online.createGuild(name, tag);
      // 服务器建好了才扣钱
      store.dispatch((g) => ({ ...g, bank: { ...g.bank, coins: (g.bank.coins ?? 0) - GUILD_COST } }));
      await onJoined();
    });
  };
  return (
    <>
      <div className="guild-card frame">
        <div className="guild-emblem">?</div>
        <div>
          <b>{tl('尚未加入公会')}</b>
          <p className="muted">{tl('加入一个公会，和其他玩家一起聊天、做公会任务、冲排行榜。')}</p>
        </div>
      </div>
      <h3>{tl('加入公会')}</h3>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); void online.searchGuilds(q.trim()).then(setList); }}>
        <input placeholder={tl("搜索公会名或会标")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button>{tl('搜索')}</button>
      </form>
      <ul className="guild-list">
        {list === null && <li className="ghost">{tl('读取中…')}</li>}
        {list?.length === 0 && <li className="ghost">{tl('还没有公会，来创建第一个吧')}</li>}
        {list?.map((g) => (
          <li key={g.id}>
            <span><small className="muted">[{g.tag}]</small> {g.name} <small className="muted">Lv{g.level}</small></span>
            <span className="row-tools">
              <small className="muted">{g.members}/{g.maxMembers}</small>
              <button className="small" disabled={act.busy || g.members >= g.maxMembers || !g.open} onClick={() => act.run(async () => { await online.joinGuild(g.id); await onJoined(); })}>{tl('加入')}</button>
            </span>
          </li>
        ))}
      </ul>
      <h3>{tl('创建公会 ')}<small className="muted">{tl`需要 ${GUILD_COST} 金币（仓库有 ${fmtNum(coins)}）`}</small></h3>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input placeholder={tl("公会名")} maxLength={12} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="tag-input" placeholder={tl("会标")} maxLength={4} value={tag} onChange={(e) => setTag(e.target.value)} />
        <button className="primary" disabled={act.busy || coins < GUILD_COST}>{tl('创建')}</button>
      </form>
      {act.err && <p className="err">{act.err}</p>}
    </>
  );
}

