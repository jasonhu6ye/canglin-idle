import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, SkillId } from '../core/types';
import { SKILLS } from '../core/data';
import { store } from '../store';
import { online, GUILD_COST, NAME_RE, TAG_RE, type Board, type ChatMsg, type Guild, type GuildMember, type GuildRole, type RankRow } from '../net';
import { keepLocal, signIn, signOut, signUp, useCloud, useOnline } from '../net/sync';

/** 联机页（10-25 接 Supabase）：账号、排行榜、公会、聊天。G 键打开 */
type Fn = () => void;
const fns = new Set<Fn>();
export const openGuild = () => fns.forEach((f) => f());
export const onOpenGuild = (f: Fn) => {
  fns.add(f);
  return () => { fns.delete(f); };
};

type Tab = 'guild' | 'rank' | 'chat' | 'account';
const TABS: [Tab, string][] = [['guild', '公会'], ['rank', '排行榜'], ['chat', '聊天'], ['account', '账号']];
const ROLE: Record<GuildRole, string> = { leader: '会长', officer: '副会长', member: '成员' };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  const { me, loading, cloudNewer } = useOnline();
  const [tab, setTab] = useState<Tab>('guild');
  const shown = !me && tab !== 'rank' ? 'account' : tab;
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>联机</h2>
        <small className="muted">{loading ? '连接中…' : me ? `已登录：${me.name}` : '未登录，单机游玩中'}</small>
      </div>
      <div className="tabs-row">
        {TABS.map(([id, label]) => (
          <button key={id} className={`pill ${shown === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {cloudNewer && <CloudPrompt cloud={cloudNewer} s={s} />}
      {shown === 'account' && <Account />}
      {shown === 'rank' && <Ranks />}
      {shown === 'guild' && me && <GuildTab s={s} />}
      {shown === 'chat' && me && <Chat />}
    </div>
  );
}

function CloudPrompt({ cloud, s }: { cloud: GameState; s: GameState }) {
  const t = (x: number) => new Date(x).toLocaleString();
  return (
    <div className="frame guild-card cloud-prompt">
      <div>
        <b>云端有更新的存档</b>
        <p className="muted">云端：{t(cloud.lastTick)}<br />本机：{t(s.lastTick)}</p>
        <div className="go">
          <button className="primary" onClick={useCloud}>用云端存档</button>
          <button onClick={keepLocal}>保留本机（覆盖云端）</button>
        </div>
      </div>
    </div>
  );
}

function Account() {
  const { me } = useOnline();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const { busy, err, run, setErr } = useAct();
  if (me) {
    return (
      <div className="frame guild-card">
        <div>
          <b>{me.name}</b>
          <p className="muted">存档每分钟自动传到云端，换手机或电脑登录同一个账号就能接着玩。</p>
          <div className="go"><button disabled={busy} onClick={() => run(signOut)}>退出登录</button></div>
          {err && <p className="err">{err}</p>}
        </div>
      </div>
    );
  }
  const submit = () => {
    if (mode === 'up' && !NAME_RE.test(name)) { setErr('名字 2-12 个字，只能用文字、数字和下划线'); return; }
    if (pw.length < 6) { setErr('密码至少 6 位'); return; }
    void run(() => (mode === 'in' ? signIn(email.trim(), pw) : signUp(email.trim(), pw, name)));
  };
  return (
    <form className="frame account-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="muted">登录后可以云存档、上排行榜、加入公会、和其他玩家聊天。不登录也能照常单机玩。</p>
      <div className="tabs-row">
        <button type="button" className={`pill ${mode === 'in' ? 'on' : ''}`} onClick={() => setMode('in')}>登录</button>
        <button type="button" className={`pill ${mode === 'up' ? 'on' : ''}`} onClick={() => setMode('up')}>注册</button>
      </div>
      <input type="email" placeholder="邮箱" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="密码（至少 6 位）" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} required />
      {mode === 'up' && <input placeholder="角色名（别的玩家看到的）" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} required />}
      <button className="primary" disabled={busy}>{busy ? '请稍候…' : mode === 'in' ? '登录' : '注册并登录'}</button>
      {err && <p className="err">{err}</p>}
    </form>
  );
}

const BOARDS: [Board, string][] = [['total', '总等级'], ['combat', '战斗等级'], ...(Object.keys(SKILLS) as SkillId[]).map((k): [Board, string] => [k, SKILLS[k].name])];

function Ranks() {
  const { me } = useOnline();
  const [board, setBoard] = useState<Board>('total');
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
      {mine && <p className="muted">我的排名：第 {mine.rank} 名 · {mine.value} 级</p>}
      {err && <p className="err">{err}</p>}
      {!rows && !err && <p className="muted">读取中…</p>}
      {rows && !rows.length && <p className="muted">还没有人上榜，登录后就会出现。</p>}
      <ol className="guild-list rank-list">
        {rows?.map((r) => (
          <li key={r.playerId} className={r.playerId === me?.id ? 'me' : ''}>
            <span><b className={`rank-no r${r.rank}`}>{r.rank}</b>{r.guildTag && <small className="muted">[{r.guildTag}] </small>}{r.name}</span>
            <small>{r.value} 级</small>
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
  if (guild === undefined) return <p className="muted">读取中…{act.err && <span className="err"> {act.err}</span>}</p>;
  if (!guild) return <NoGuild s={s} onJoined={load} />;
  const myRole = members.find((m) => m.playerId === me?.id)?.role ?? 'member';
  const isLead = myRole === 'leader';
  const canManage = myRole !== 'member';
  return (
    <>
      <div className="guild-card frame">
        <div className="guild-emblem on">{guild.tag}</div>
        <div>
          <b>{guild.name}</b> <small className="muted">Lv{guild.level} · {guild.members}/{guild.maxMembers} 人</small>
          <p className="muted">{guild.notice || '会长还没写公告'}</p>
        </div>
      </div>
      {canManage && (
        <div className="go">
          <button disabled={act.busy} onClick={() => {
            const t = prompt('公会公告（200 字以内）', guild.notice);
            if (t != null) void act.run(async () => { await online.setNotice(t); await load(); });
          }}>改公告</button>
        </div>
      )}
      <h3>成员 <small className="muted">{members.length} / {guild.maxMembers}</small></h3>
      <ul className="guild-list">
        {members.sort((a, b) => order(a.role) - order(b.role) || b.totalLevel - a.totalLevel).map((m) => (
          <li key={m.playerId}>
            <span>{m.name} <small className="muted">{ROLE[m.role]}</small></span>
            <span className="row-tools">
              <small className="muted">总等级 {m.totalLevel}</small>
              {m.playerId !== me?.id && isLead && (
                <select value={m.role} disabled={act.busy} onChange={(e) => {
                  const r = e.target.value as GuildRole;
                  if (r === 'leader' && !confirm(`把会长转给 ${m.name}？`)) return;
                  void act.run(async () => { await online.setRole(m.playerId, r); await load(); });
                }}>
                  {(['member', 'officer', 'leader'] as GuildRole[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                </select>
              )}
              {m.playerId !== me?.id && (isLead || (canManage && m.role === 'member')) && (
                <button className="small" disabled={act.busy} onClick={() => confirm(`把 ${m.name} 移出公会？`) && void act.run(async () => { await online.kick(m.playerId); await load(); })}>踢出</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {act.err && <p className="err">{act.err}</p>}
      <div className="go">
        <button disabled={act.busy} onClick={() => confirm(isLead && members.length > 1 ? '你是会长，退出后会长自动传给副会长或最早入会的成员。确定退出？' : '确定退出公会？')
          && void act.run(async () => { await online.leaveGuild(); await load(); })}>退出公会</button>
      </div>
      <p className="muted small-note">公会任务、公会仓库和公会加成下一步开放。</p>
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
    if (!NAME_RE.test(name)) { act.setErr('公会名 2-12 个字'); return; }
    if (!TAG_RE.test(tag)) { act.setErr('会标 2-4 个字'); return; }
    if (coins < GUILD_COST) { act.setErr(`仓库里金币不够 ${GUILD_COST}`); return; }
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
          <b>尚未加入公会</b>
          <p className="muted">加入一个公会，和其他玩家一起聊天、做公会任务、冲排行榜。</p>
        </div>
      </div>
      <h3>加入公会</h3>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); void online.searchGuilds(q.trim()).then(setList); }}>
        <input placeholder="搜索公会名或会标" value={q} onChange={(e) => setQ(e.target.value)} />
        <button>搜索</button>
      </form>
      <ul className="guild-list">
        {list === null && <li className="ghost">读取中…</li>}
        {list?.length === 0 && <li className="ghost">还没有公会，来创建第一个吧</li>}
        {list?.map((g) => (
          <li key={g.id}>
            <span><small className="muted">[{g.tag}]</small> {g.name} <small className="muted">Lv{g.level}</small></span>
            <span className="row-tools">
              <small className="muted">{g.members}/{g.maxMembers}</small>
              <button className="small" disabled={act.busy || g.members >= g.maxMembers || !g.open} onClick={() => act.run(async () => { await online.joinGuild(g.id); await onJoined(); })}>加入</button>
            </span>
          </li>
        ))}
      </ul>
      <h3>创建公会 <small className="muted">需要 {GUILD_COST} 金币（仓库有 {coins}）</small></h3>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input placeholder="公会名" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="tag-input" placeholder="会标" maxLength={4} value={tag} onChange={(e) => setTag(e.target.value)} />
        <button className="primary" disabled={act.busy || coins < GUILD_COST}>创建</button>
      </form>
      {act.err && <p className="err">{act.err}</p>}
    </>
  );
}

function Chat() {
  const { me } = useOnline();
  const [ch, setCh] = useState<ChatMsg['channel']>('world');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const act = useAct();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => online.onChat((m) => setMsgs((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m].slice(-200)))), []);
  const shown = msgs.filter((m) => m.channel === ch);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [shown.length]);
  return (
    <>
      <div className="tabs-row">
        <button className={`pill ${ch === 'world' ? 'on' : ''}`} onClick={() => setCh('world')}>世界</button>
        <button className={`pill ${ch === 'guild' ? 'on' : ''}`} disabled={!me?.guildId} onClick={() => setCh('guild')}>公会</button>
      </div>
      <div className="chat-box frame" ref={box}>
        {!shown.length && <p className="muted">还没有消息</p>}
        {shown.map((m) => (
          <p key={m.id} className={m.playerId === me?.id ? 'me' : ''}>
            <small className="muted">{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small> <b>{m.name}</b>：{m.text}
          </p>
        ))}
      </div>
      <form className="search-row" onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (t) void act.run(async () => { await online.sendChat(ch, t); setText(''); });
      }}>
        <input placeholder="说点什么（200 字以内）" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={act.busy}>发送</button>
      </form>
      {act.err && <p className="err">{act.err}</p>}
    </>
  );
}
