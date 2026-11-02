import { useEffect, useMemo, useState } from 'react';
import { GM_KINDS, GM_KIND_NAME, GM_PCT_MAX } from '../core/gm';
import type { GmKind } from '../core/types';
import { online, type AiPlayer, type CheatRow, type GmPlayer, type GmTrade, type Snapshot, type GmInput, type GmMailRow, type GmRow } from '../net';
import { aiPlayers, botDoing, botsMuted, setBotsMuted, botName, botOnline, botPresence, botProfile, habitOf, refreshBots, zoneOf } from '../net/bots';
import { actionName } from './format';
import { emitToGame } from './GameCanvas';
import { ITEMS } from '../core/data';
import type { ItemStack } from '../core/types';
import { fmtNum } from './format';
import { Icon } from './icons';
import { pullGm } from '../net/social';
import { baseOf, qid, qualityOf, QUALITY_COLOR, QUALITY_NAME } from '../core/quality';
import { LANG, tl } from '../i18n';

/**
 * GM 面板（用户 10-26）：只有管理员（gm_admins 表里的 UID）能打开。
 * 给全服或指定 UID 的玩家加增益：名字、标签、类型、数值、持续时间都能自定义，能改、延长、删除。
 * 玩家那边每分钟拉一次，增益栏只显示名字和标签。
 */
const UNITS = [
  { id: 'm', name: tl('分钟'), ms: 60_000 },
  { id: 'h', name: tl('小时'), ms: 3600_000 },
  { id: 'd', name: tl('天'), ms: 86_400_000 },
] as const;
type Unit = (typeof UNITS)[number]['id'];

interface Form {
  all: boolean;
  pid: string;
  name: string;
  tag: string;
  kind: GmKind;
  pct: string;
  len: string;
  unit: Unit;
}
const EMPTY: Form = { all: true, pid: '', name: '', tag: '', kind: 'xp', pct: '50', len: '2', unit: 'h' };

const left = (ms: number) => {
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return tl`${m} 分钟`;
  const h = Math.floor(m / 60);
  return h < 48 ? tl`${h} 小时 ${m % 60} 分` : tl`${Math.floor(h / 24)} 天 ${h % 24} 小时`;
};

export function GmPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'buff' | 'mail' | 'gear' | 'ai' | 'players' | 'ac' | 'trade' | 'snap'>('buff');
  return (
    <div className="page guild gm-panel">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('GM 面板')}</h2>
        <small className="muted">{tl('管理员专用')}</small>
      </div>
      <div className="gm-seg gm-tabs">
        <button className={`pill ${tab === 'buff' ? 'on' : ''}`} onClick={() => setTab('buff')}>{tl('增益')}</button>
        <button className={`pill ${tab === 'mail' ? 'on' : ''}`} onClick={() => setTab('mail')}>{tl('赠送物品')}</button>
        <button className={`pill ${tab === 'gear' ? 'on' : ''}`} onClick={() => setTab('gear')}>{tl('赠送装备')}</button>
        <button className={`pill ${tab === 'ai' ? 'on' : ''}`} onClick={() => setTab('ai')}>{tl('AI 玩家')}</button>
        <button className={`pill ${tab === 'players' ? 'on' : ''}`} onClick={() => setTab('players')}>{tl('玩家')}</button>
        <button className={`pill ${tab === 'ac' ? 'on' : ''}`} onClick={() => setTab('ac')}>{tl('防作弊')}</button>
        <button className={`pill ${tab === 'trade' ? 'on' : ''}`} onClick={() => setTab('trade')}>{tl('交易记录')}</button>
        <button className={`pill ${tab === 'snap' ? 'on' : ''}`} onClick={() => setTab('snap')}>{tl('服务器存档')}</button>
      </div>
      {tab === 'buff' ? <BuffTab /> : tab === 'ai' ? <AiTab onClose={onClose} /> : tab === 'ac' ? <AcTab /> : tab === 'players' ? <PlayersTab /> : tab === 'trade' ? <TradeTab /> : tab === 'snap' ? <SnapTab /> : <MailTab key={tab} gear={tab === 'gear'} />}
    </div>
  );
}

function BuffTab() {
  const [rows, setRows] = useState<GmRow[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const now = Date.now();

  const load = async () => {
    try {
      setRows(await online.gmList());
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
      setRows([]);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const set = (p: Partial<Form>) => { setForm({ ...form, ...p }); setMsg(null); };
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await f();
      setMsg({ text: ok, ok: true });
      await load();
      void pullGm();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
    setBusy(false);
  };

  const pct = Number(form.pct);
  const len = Number(form.len);
  const pid = Number(form.pid);
  const bad =
    !form.name.trim() ? tl('先起个名字') :
    !(pct > 0 && pct <= GM_PCT_MAX) ? tl`数值要在 1-${GM_PCT_MAX}% 之间` :
    !(len > 0) ? tl('持续时间要大于 0') :
    !form.all && !(Number.isInteger(pid) && pid > 0) ? tl('填玩家的数字 UID') : null;

  const submit = () => {
    if (bad) return;
    const unit = UNITS.find((u) => u.id === form.unit)!;
    const from = Date.now();
    const b: GmInput = {
      targetPid: form.all ? null : pid, name: form.name.trim(), tag: form.tag.trim(), kind: form.kind, pct,
      from, to: from + len * unit.ms,
    };
    if (editing) {
      const old = rows?.find((r) => r.id === editing);
      // 改的时候保留原来的开始时间，持续时间从开始算
      if (old) { b.from = old.from; b.to = old.from + len * unit.ms; }
      void run(() => online.gmUpdate(editing, b), tl('已保存修改'));
      setEditing(null);
    } else void run(() => online.gmAdd(b), form.all ? tl('已发放给全服') : tl`已发放给 UID ${pid}`);
    setForm({ ...EMPTY, kind: form.kind });
  };

  const edit = (r: GmRow) => {
    const total = r.to - r.from;
    const unit = total % 86_400_000 === 0 ? 'd' : total % 3600_000 === 0 ? 'h' : 'm';
    const ms = UNITS.find((u) => u.id === unit)!.ms;
    setForm({ all: r.targetPid == null, pid: r.targetPid ? String(r.targetPid) : '', name: r.name, tag: r.tag, kind: r.kind, pct: String(r.pct), len: String(Math.round(total / ms)), unit });
    setEditing(r.id);
    setMsg(null);
  };

  return (
    <>
      <h3>{editing ? tl('修改增益') : tl('发放增益')}</h3>
      <div className="gm-form frame">
        <label><span>{tl('对象')}</span>
          <span className="gm-seg">
            <button className={`pill ${form.all ? 'on' : ''}`} onClick={() => set({ all: true })}>{tl('全服玩家')}</button>
            <button className={`pill ${!form.all ? 'on' : ''}`} onClick={() => set({ all: false })}>{tl('指定玩家')}</button>
            {!form.all && <input inputMode="numeric" placeholder={tl('玩家 UID，如 10000002')} value={form.pid} onChange={(e) => set({ pid: e.target.value.replace(/\D/g, '') })} />}
          </span>
        </label>
        <label><span>{tl('名字')}</span><input maxLength={20} placeholder={tl('如：周末双倍经验')} value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label><span>{tl('标签')}</span><input maxLength={4} placeholder={tl('1-4 个字，如：双倍')} value={form.tag} onChange={(e) => set({ tag: e.target.value })} /></label>
        <label><span>{tl('类型')}</span>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value as GmKind })}>
            {GM_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </label>
        <small className="muted gm-hint">{GM_KINDS.find((k) => k.id === form.kind)?.desc}</small>
        <label><span>{tl('数值')}</span><span className="gm-seg"><input inputMode="decimal" value={form.pct} onChange={(e) => set({ pct: e.target.value.replace(/[^\d.]/g, '') })} /><b>%</b>
          {[25, 50, 100, 200].map((n) => <button key={n} className="pill" onClick={() => set({ pct: String(n) })}>+{n}%</button>)}
        </span></label>
        <label><span>{tl('持续')}</span><span className="gm-seg"><input inputMode="decimal" value={form.len} onChange={(e) => set({ len: e.target.value.replace(/[^\d.]/g, '') })} />
          {UNITS.map((u) => <button key={u.id} className={`pill ${form.unit === u.id ? 'on' : ''}`} onClick={() => set({ unit: u.id })}>{u.name}</button>)}
        </span></label>
        <div className="gm-actions">
          <button className="primary" disabled={!!bad || busy} onClick={submit}>{editing ? tl('保存修改') : tl('发放')}</button>
          {editing && <button className="pill" onClick={() => { setEditing(null); setForm(EMPTY); }}>{tl('取消修改')}</button>}
        </div>
        {(bad && form.name) || msg ? <p className={msg?.ok ? 'good' : 'warn'}>{msg?.text ?? bad}</p> : null}
      </div>

      <h3>{tl('已发放 ')}<small className="muted">{tl('玩家每分钟同步一次')}</small></h3>
      {rows === null && <p className="muted">{tl('读取中…')}</p>}
      {rows?.length === 0 && <p className="muted">{tl('还没有发放过增益')}</p>}
      <ul className="gm-list">
        {rows?.map((r) => {
          const state = now < r.from ? 'wait' : now < r.to ? 'on' : 'off';
          return (
            <li key={r.id} className={`frame ${state}`}>
              <div>
                <b>{r.name}</b>{r.tag && <em className="gm-tag">{r.tag}</em>}
                <span className="gm-val">{GM_KIND_NAME[r.kind]} +{r.pct}%</span>
              </div>
              <small className="muted">
                {r.targetPid == null ? tl('全服玩家') : tl`${r.targetName ?? tl('玩家')}（UID ${r.targetPid}）`}
                {' · '}
                {state === 'on' ? tl`生效中，还剩 ${left(r.to - now)}` : state === 'wait' ? tl`${left(r.from - now)}后开始` : tl('已结束')}
              </small>
              <div className="gm-row-tools">
                <button className="pill" disabled={busy} onClick={() => run(() => online.gmUpdate(r.id, { to: Math.max(r.to, Date.now()) + 3600_000 }), tl('已延长 1 小时'))}>{tl('延长 1 小时')}</button>
                {state !== 'off' && <button className="pill" disabled={busy} onClick={() => run(() => online.gmUpdate(r.id, { to: Date.now() }), tl('已提前结束'))}>{tl('立即结束')}</button>}
                <button className="pill" disabled={busy} onClick={() => edit(r)}>{tl('修改')}</button>
                <button className="pill warn" disabled={busy} onClick={() => run(() => online.gmDelete(r.id), tl('已删除'))}>{tl('删除')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 能送的东西：材料、食物、钥匙、宝箱之类，装备和工具除外；金币也能送 */
const GIFTABLE = Object.values(ITEMS).filter((it) => !it.equip && it.category !== 'gear' && it.category !== 'tool');
/** 能送的装备（10-27）：武器、护甲、饰品、工具、副手、背包、坐骑，只列原版，品质另选 */
const GEAR = Object.values(ITEMS).filter((it) => (it.equip || it.category === 'gear' || it.category === 'tool') && !it.quality);
const hasQuality = (base: string) => !!ITEMS[qid(base, 1)];
const MAX_ATTACH = 10;

/** 赠送物品（10-26）：给指定 UID 发一封带附件的邮件，标题正文自定义；gear = 赠送装备页，可选任意品质 */
function MailTab({ gear }: { gear: boolean }) {
  const [rows, setRows] = useState<GmMailRow[] | null>(null);
  const [pid, setPid] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<ItemStack[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quality, setQuality] = useState(0);

  const load = async () => {
    try {
      setRows(await online.gmMailList());
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
      setRows([]);
    }
  };
  useEffect(() => { void load(); }, []);
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await f();
      setMsg({ text: ok, ok: true });
      await load();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
    setBusy(false);
  };

  const found = useMemo(() => {
    const k = q.trim();
    if (!k) return [];
    return (gear ? GEAR : GIFTABLE).filter((it) => it.name.includes(k) || it.id.includes(k)).slice(0, 30);
  }, [q, gear]);
  const add = (base: string) => {
    const id = gear && hasQuality(base) ? qid(base, quality) : base;
    setMsg(null);
    if (items.some((i) => i.item === id)) return;
    if (items.length >= MAX_ATTACH) return setMsg({ text: tl`一封最多 ${MAX_ATTACH} 种物品`, ok: false });
    setItems([...items, { item: id, qty: 1 }]);
  };
  // 换品质：同一件装备换成另一档的 id；已经有那一档就合并数量
  const setQ1 = (id: string, q: number) => {
    const to = qid(baseOf(id), q);
    if (to === id) return;
    const old = items.find((i) => i.item === id)!;
    const has = items.find((i) => i.item === to);
    setItems(has ? items.filter((i) => i.item !== id).map((i) => (i.item === to ? { ...i, qty: i.qty + old.qty } : i)) : items.map((i) => (i.item === id ? { ...i, item: to } : i)));
  };
  const setQty = (id: string, v: string) => setItems(items.map((i) => (i.item === id ? { ...i, qty: Math.min(1e9, Math.floor(Number(v.replace(/\D/g, '')) || 0)) } : i)));

  const n = Number(pid);
  const bad =
    !(Number.isInteger(n) && n > 0) ? tl('填玩家的数字 UID') :
    !title.trim() ? tl('写个邮件标题') :
    !items.length ? tl('至少放一种物品') :
    items.some((i) => !(i.qty > 0)) ? tl('数量要大于 0') : null;

  const send = () => {
    if (bad) return;
    void run(async () => {
      await online.gmMailSend({ targetPid: n, title: title.trim(), body: body.trim(), items });
      setItems([]);
      setTitle('');
      setBody('');
    }, tl`已发送给 UID ${n}，对方上线一分钟内收到`);
  };

  return (
    <>
      {gear
        ? <h3>{tl('赠送装备')} <small className="muted">{tl('武器、护甲、饰品、工具都能送，品质任选，通过邮件发给指定玩家')}</small></h3>
        : <h3>{tl('赠送物品')} <small className="muted">{tl('通过邮件发给指定玩家，装备在「赠送装备」里送')}</small></h3>}
      <div className="gm-form frame">
        <label><span>{tl('玩家')}</span><input inputMode="numeric" placeholder={tl('玩家 UID，如 10000002')} value={pid} onChange={(e) => { setPid(e.target.value.replace(/\D/g, '')); setMsg(null); }} /></label>
        <label><span>{tl('标题')}</span><input maxLength={30} placeholder={tl('如：活动补偿')} value={title} onChange={(e) => { setTitle(e.target.value); setMsg(null); }} /></label>
        <label className="gm-body"><span>{tl('正文')}</span><textarea maxLength={500} rows={4} placeholder={tl('邮件内容（可不写）')} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        {gear && (
          <div className="gm-seg gm-quality">
            <span>{tl('品质')}</span>
            {QUALITY_NAME.map((nm, i) => (
              <button key={i} className={`pill ${quality === i ? 'on' : ''}`} style={{ color: QUALITY_COLOR[i] }} onClick={() => setQuality(i)}>{nm}</button>
            ))}
          </div>
        )}
        <label><span>{gear ? tl('装备') : tl('物品')}</span><input placeholder={gear ? tl('搜索装备名字，如：精金长剑、铁镐、项链') : tl('搜索物品名字，如：铁锭、强化石')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {found.length > 0 && (
          <ul className="trade-items pick gm-pick">
            {found.map((it) => (
              <li key={it.id} className={items.some((i) => baseOf(i.item) === it.id) ? 'on' : ''} onClick={() => add(it.id)}>
                <Icon item={it.id} size={24} info={false} />
                <span className="nm">{it.name}</span>
                <small className="muted">{gear && !hasQuality(it.id) ? tl('无品质 · 点击加入') : tl('点击加入')}</small>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <ul className="trade-items gm-attach">
            {items.map((i) => (
              <li key={i.item}>
                <Icon item={i.item} size={24} info={false} />
                <span className="nm" style={gear ? { color: QUALITY_COLOR[qualityOf(i.item)] } : undefined}>{ITEMS[i.item]?.name ?? i.item}</span>
                {gear && hasQuality(baseOf(i.item)) && (
                  <select value={qualityOf(i.item)} onChange={(e) => setQ1(i.item, Number(e.target.value))}>
                    {QUALITY_NAME.map((nm, k) => <option key={k} value={k}>{nm}</option>)}
                  </select>
                )}
                <input inputMode="numeric" value={i.qty || ''} onChange={(e) => setQty(i.item, e.target.value)} />
                <button className="small" onClick={() => setItems(items.filter((x) => x.item !== i.item))}>{tl('移除')}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="gm-actions">
          <button className="primary" disabled={!!bad || busy} onClick={send}>{tl('发送邮件')}</button>
        </div>
        {(bad && (pid || title || items.length)) || msg ? <p className={msg?.ok ? 'good' : 'warn'}>{msg?.text ?? bad}</p> : null}
      </div>

      <h3>{tl('已发送 ')}<small className="muted">{tl('对方上线后一分钟内收到')}</small></h3>
      {!!rows?.some((r) => r.claimedAt) && (
        <div className="gm-row-tools">
          <button className="pill" disabled={busy} onClick={() => run(async () => {
            // 只删对方已经收到的；还没收到的要单独撤回，免得误删
            for (const r of rows!.filter((x) => x.claimedAt)) await online.gmMailDelete(r.id);
          }, tl('已清空收到的记录'))}>{tl('清空已收到的记录')}</button>
        </div>
      )}
      {rows === null && <p className="muted">{tl('读取中…')}</p>}
      {rows?.length === 0 && <p className="muted">{tl('还没有发过')}</p>}
      <ul className="gm-list">
        {rows?.map((r) => (
          <li key={r.id} className={`frame ${r.claimedAt ? 'off' : 'on'}`}>
            <div><b>{r.title}</b></div>
            <small className="muted">
              {tl`${r.targetName ?? tl('玩家')}（UID ${r.targetPid}）`}{' · '}
              {r.claimedAt ? tl('已收到') : tl('还没收到')}
            </small>
            {r.body && <small className="gm-mail-body">{r.body}</small>}
            <small>{r.items.map((i) => `${ITEMS[i.item]?.name ?? i.item} ×${fmtNum(i.qty)}`).join(tl('、'))}</small>
            <div className="gm-row-tools">
              {r.claimedAt
                ? <button className="pill" disabled={busy} onClick={() => run(() => online.gmMailDelete(r.id), tl('已删除记录'))}>{tl('删除记录')}</button>
                : <button className="pill warn" disabled={busy} onClick={() => run(() => online.gmMailDelete(r.id), tl('已撤回'))}>{tl('撤回')}</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

const AI_MAX = 500;
/**
 * AI 玩家（用户 10-31）：加几个、删几个、改名。名字外观等级都随机，所有人看到的一样：
 * 在地图上干活走动、算进在线人数、上排行榜、偶尔在世界频道说英文。
 */
/** 玩家习惯（GM 名单里显示） */
const habitName = (h: string) => (h === 'hardcore' ? tl('天天肝') : h === 'regular' ? tl('常玩') : h === 'casual' ? tl('休闲') : tl('偶尔玩'));
function AiTab({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<AiPlayer[] | null>(null);
  const [n, setN] = useState('5');
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const load = async () => {
    try {
      await refreshBots(true);
      setRows([...aiPlayers()]);
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
      setRows([]);
    }
  };
  useEffect(() => { void load(); }, []);
  // 「正在干什么」每 5 秒刷新
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t); }, []);
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await f();
      setMsg({ text: ok, ok: true });
      await load();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    }
    setBusy(false);
  };
  const list = rows ?? [];
  const k = Math.floor(Number(n) || 0);
  const add = () => {
    if (!(k > 0)) return setMsg({ text: tl('填要加几个'), ok: false });
    if (list.length + k > AI_MAX) return setMsg({ text: tl`最多 ${AI_MAX} 个 AI 玩家`, ok: false });
    const taken = new Set(list.map((b) => b.name.toLowerCase()));
    const r = () => Math.random();
    const add = Array.from({ length: k }, () => ({ name: botName(r, taken), seed: Math.floor(Math.random() * 2 ** 31) }));
    void run(() => online.aiAdd(add), tl`加了 ${k} 个 AI 玩家`);
  };
  const del = (ids: string[], ok: string) => void run(() => online.aiDelete(ids), ok);
  const delNewest = () => {
    if (!(k > 0) || !list.length) return;
    const ids = list.slice(-k).map((b) => b.id);
    if (confirm(tl`删掉最新加的 ${ids.length} 个 AI 玩家？`)) del(ids, tl`删了 ${ids.length} 个 AI 玩家`);
  };
  const rename = () => {
    if (!edit) return;
    const name = edit.name.trim();
    if (!/^[\p{L}\p{N}_]{2,12}$/u.test(name)) return setMsg({ text: tl('名字 2-12 个字，只能用文字、数字和下划线'), ok: false });
    void run(async () => { await online.aiRename(edit.id, name); setEdit(null); }, tl`已改名为 ${name}`);
  };
  return (
    <>
      <h3>{tl('AI 玩家')} <small className="muted">{tl('所有人看到的一样：在地图上干活走动，算进在线人数和排行榜，偶尔在世界频道说英文')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('数量')}</span><input inputMode="numeric" value={n} onChange={(e) => { setN(e.target.value.replace(/\D/g, '').slice(0, 3)); setMsg(null); }} /></label>
        <div className="gm-actions">
          <button className="primary" disabled={busy} onClick={add}>{tl('增加')}</button>
          <button disabled={busy || !list.length} onClick={delNewest}>{tl('删除最新的')}</button>
          <button disabled={busy || !list.length} onClick={() => confirm(tl`删掉全部 ${list.length} 个 AI 玩家？`) && del(list.map((b) => b.id), tl('已删除全部 AI 玩家'))}>{tl('全部删除')}</button>
        </div>
        <div className="gm-mute">
          <span>{tl('世界频道发言')}</span>
          <button className={`pill ${botsMuted() ? '' : 'on'}`} disabled={busy} onClick={() => void run(() => setBotsMuted(false), tl('AI 玩家恢复在世界频道说话'))}>{tl('允许')}</button>
          <button className={`pill ${botsMuted() ? 'on' : ''}`} disabled={busy} onClick={() => void run(() => setBotsMuted(true), tl('AI 玩家已全部闭嘴，不在世界频道说话'))}>{tl('全部闭嘴')}</button>
          <small className="muted">{tl('全服生效，其他玩家 2 分钟内同步')}</small>
        </div>
        <p className="muted">{tl`现在有 ${list.length} 个 AI 玩家，${list.filter((b) => botOnline(b)).length} 个在线。名字、外观、等级随机，加进来后每天慢慢升级；每个 AI 有自己的时区和习惯：有的天天肝，有的隔几天才上来一次，三分之一基本不说话`}</p>
        {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
      </div>
      <h3>{tl('名单')}</h3>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('还没有 AI 玩家')}</p> : (
        <ul className="gm-list">
          {[...list].reverse().map((b) => {
            const p = botProfile(b);
            const now = botPresence(b);
            const idle = botDoing(p, b.seed)?.idle;
            return (
              <li key={b.id} className="frame">
                {edit?.id === b.id ? (
                  <div className="gm-seg">
                    <input maxLength={12} value={edit.name} onChange={(e) => setEdit({ id: b.id, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && rename()} autoFocus />
                    <button className="pill" disabled={busy} onClick={rename}>{tl('保存')}</button>
                    <button className="pill" onClick={() => setEdit(null)}>{tl('取消')}</button>
                  </div>
                ) : (
                  <div><b>{b.name}</b> <small className="muted">#{p.pid} · {tl`总等级 ${p.total} · 战斗 ${p.combat}`}</small></div>
                )}
                <small className="muted">{!botOnline(b) ? tl`离线（${LANG === 'en' ? zoneOf(b).en : zoneOf(b).zh}，${habitName(habitOf(b))}）` : now?.action ? tl`正在：${actionName(now.action)}` : idle ? tl('在城里挂机') : tl('正在赶路')}</small>
                <div className="gm-row-tools">
                  {now && <button className="pill" onClick={() => { emitToGame('walktile', Math.round(now.x), Math.round(now.y)); onClose(); }}>{tl('寻路过去')}</button>}
                  <button className="pill" onClick={() => setEdit({ id: b.id, name: b.name })}>{tl('改名')}</button>
                  <button className="pill" disabled={busy} onClick={() => confirm(tl`删除 AI 玩家 ${b.name}？`) && del([b.id], tl`已删除 ${b.name}`)}>{tl('删除')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/*
 * 防作弊（11-01）：服务器在上传存档 / 排行榜时检查，客户端发现改系统时间、改本地存档也会报上来。
 * 严重的自动移出排行榜，这里看记录、解除、封禁（封禁 = 不上排行榜、不能在世界频道说话）。
 */
const AC_KIND: Record<string, string> = {
  xp: tl('经验涨得太快'), coins: tl('金币涨得太快'), clock: tl('游戏时间比真实时间快（改系统时间）'), rank: tl('排行榜数据和存档对不上'),
  xp_drop: tl('经验变少了'), clock_local: tl('游戏中改了系统时间'), save_edit: tl('本地存档被改过'), speed: tl('游戏速度异常'),
  items: tl('物品总价值涨得太快'), bad_item: tl('存档里有不存在或数量不对的物品'), rollback: tl('存档时间倒退（回档）'),
  trade: tl('交易价值严重不对等'), trade_fake: tl('交易给出的东西比存档里还多'), spam: tl('世界频道刷屏'), multi: tl('同一台设备登录多个账号'),
  move: tl('报的位置对不上（瞬移，服务器已拒绝）'), walk_fast: tl('走路速度被改过'), fake_gate: tl('伪造副本洞口'),
  fake_hits: tl('伪造队友伤害'), bad_cmd: tl('发了不存在的操作'), backdate: tl('操作时间往前填（补领奖励）'), banned_play: tl('封禁后还在操作'),
  auto_rollback: tl('已自动回档'), auto_wipe: tl('已自动删档封号'),
};
const AC_DEFAULT = { xp_per_hour: 6000000, coins_per_hour: 50000000, value_per_hour: 50000000, trade_gap: 3000000, chat_per_min: 8, multi_accounts: 3, drift_min: 30, snap_keep_auto: 3, auto_hide: 1, auto_punish: 1, wipe_strikes: 3, trade_new_hours: 24, trade_day_value: 0, lock_hidden: 1, punish_trade_days: 7 };
const AC_FIELDS: [keyof typeof AC_DEFAULT, string][] = [
  ['xp_per_hour', tl('每小时经验上限')], ['coins_per_hour', tl('每小时金币上限')], ['value_per_hour', tl('每小时物品价值上限')],
  ['trade_gap', tl('交易价值差多少算不对等')], ['chat_per_min', tl('世界频道每分钟最多几句')], ['multi_accounts', tl('一台设备几个账号算多开')],
  ['drift_min', tl('游戏时间允许超前（分钟）')], ['snap_keep_auto', tl('每日自动存档保留几份')], ['auto_hide', tl('严重的自动移出排行榜（1 开 / 0 关）')],
  ['auto_punish', tl('明显作弊自动回档（1 开 / 0 关）')], ['wipe_strikes', tl('30 天内第几次自动删档封号')],
  ['trade_new_hours', tl('新账号几小时后才能交易（0 不限）')], ['trade_day_value', tl('每天交易最多收到多少价值（0 不限）')],
  ['lock_hidden', tl('移出排行榜的不能交易和用公会仓库（1 开 / 0 关）')], ['punish_trade_days', tl('自动回档后限制交易几天')],
];
function acDetail(d: Record<string, unknown>) {
  const n = (k: string) => fmtNum(Number(d[k] ?? 0));
  if ('gain' in d) return tl`${d.hours} 小时涨了 ${n('gain')}，上限 ${n('cap')}`;
  if ('ahead_min' in d) return tl`存档时间比服务器快 ${n('ahead_min')} 分钟`;
  if ('game_min' in d) return tl`真实 ${n('real_min')} 分钟，游戏走了 ${n('game_min')} 分钟`;
  if ('rank_xp' in d) return tl`排行榜经验 ${n('rank_xp')}，存档经验 ${n('save_xp')}`;
  if ('jump_min' in d) return tl`系统时间跳了 ${n('jump_min')} 分钟`;
  if ('ratio' in d) return tl`系统时间走得是正常的 ${d.ratio} 倍`;
  if ('back_min' in d) return d.traded ? tl`倒退 ${n('back_min')} 分钟，期间做过交易` : tl`倒退 ${n('back_min')} 分钟`;
  if ('got' in d) return tl`从 ${String(d.from)} 收到价值 ${n('got')}，只给出 ${n('gave')}`;
  if ('per_min' in d) return tl`一分钟 ${n('per_min')} 句`;
  if ('accounts' in d) return tl`这台设备登录过 ${n('accounts')} 个账号`;
  if (Array.isArray(d.items)) return (d.items as { id: string; n?: unknown; gave?: unknown; had?: unknown }[]).map((x) => 'gave' in x ? tl`${itemLabel(x.id)} 给出 ${fmtNum(Number(x.gave))}，存档里 ${fmtNum(Number(x.had))}` : `${itemLabel(x.id)} × ${String(x.n)}`).join(tl('；'));
  return Object.keys(d).length ? JSON.stringify(d) : '';
}
function AcTab() {
  const [rows, setRows] = useState<CheatRow[] | null>(null);
  const [conf, setConf] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [r, f] = await Promise.all([online.gmCheaters(), online.flags()]);
      setRows(r);
      const ac = { ...AC_DEFAULT, ...((f.ac as Record<string, number>) ?? {}) };
      setConf(Object.fromEntries(Object.entries(ac).map(([k, v]) => [k, String(v)])));
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
      setRows([]);
    }
  };
  useEffect(() => { void load(); }, []);
  const run = async (f: () => Promise<void | string>, ok: string) => {
    setBusy(true);
    try { const t = await f(); setMsg({ text: t || ok, ok: true }); await load(); } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    setBusy(false);
  };
  const saveConf = () => {
    const v: Record<string, number> = {};
    for (const [k] of AC_FIELDS) {
      const x = Number(conf[k]);
      if (!Number.isFinite(x) || x < 0) return setMsg({ text: tl('阈值要填不小于 0 的数字'), ok: false });
      v[k] = x;
    }
    void run(() => online.setFlag('ac', v), tl('阈值已保存'));
  };
  const act = (r: CheatRow, a: 'hide' | 'unhide' | 'ban' | 'unban' | 'clear', ok: string, ask?: string) => {
    if (ask && !confirm(ask)) return;
    void run(() => online.gmAcSet(r.playerId, a), ok);
  };
  const [lim, setLim] = useState({ pid: '', what: 'trade' as 'trade' | 'mute', hours: '168' });
  const limit = (pid: number, what: 'trade' | 'mute', hours: number) => {
    void run(async () => {
      const nm = await online.gmAcLimit(pid, what, hours);
      return hours <= 0 ? tl`已解除 ${nm} 的限制` : what === 'trade' ? tl`${nm} 限制交易 ${hours} 小时` : tl`${nm} 禁言 ${hours} 小时`;
    }, '');
  };
  const submitLim = () => {
    const pid = Number(lim.pid), h = Number(lim.hours);
    if (!/^\d{8}$/.test(lim.pid)) return setMsg({ text: tl('数字 ID 是 8 位数字'), ok: false });
    if (!Number.isFinite(h) || h < 0) return setMsg({ text: tl('时长要填不小于 0 的数字'), ok: false });
    limit(pid, lim.what, h);
  };
  const until = (t: number) => new Date(t).toLocaleString();
  const list = rows ?? [];
  return (
    <>
      <h3>{tl('防作弊')} <small className="muted">{tl('上传存档时服务器按真实时间检查经验、金币、游戏时间和排行榜数据；游戏里改系统时间、改本地存档也会记下来')}</small></h3>
      {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
      <h3>{tl('可疑玩家')} <small className="muted">{tl`${list.length} 人`}</small></h3>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('还没有可疑记录')}</p> : (
        <ul className="gm-list">
          {list.map((r) => (
            <li key={r.playerId} className="frame">
              <div>
                <b>{r.name}</b> <small className="muted">#{r.pid}</small>
                {r.banned ? <b className="warn"> {tl('已封禁')}</b> : r.hidden ? <b className="warn"> {tl('已移出排行榜')}</b> : null}
                {r.tradeUntil && <b className="warn"> {tl`限制交易到 ${until(r.tradeUntil)}`}</b>}
                {r.muteUntil && <b className="warn"> {tl`禁言到 ${until(r.muteUntil)}`}</b>}
              </div>
              <small className="muted">{tl`${r.n} 条记录（严重 ${r.severe}）`}{r.lastAt ? tl` · 最近 ${new Date(r.lastAt).toLocaleString()}` : ''}{r.note ? ` · ${r.note}` : ''}</small>
              {open === r.playerId && (
                <ul className="gm-ac-flags">
                  {r.flags.map((f, i) => (
                    <li key={i}><b className={f.severe ? 'warn' : ''}>{AC_KIND[f.kind] ?? f.kind}</b> <small className="muted">{new Date(f.at).toLocaleString()} · {acDetail(f.detail)}</small></li>
                  ))}
                </ul>
              )}
              <div className="gm-row-tools">
                <button className="pill" onClick={() => setOpen(open === r.playerId ? null : r.playerId)}>{open === r.playerId ? tl('收起') : tl('看记录')}</button>
                {r.hidden && !r.banned && <button className="pill" disabled={busy} onClick={() => act(r, 'unhide', tl`${r.name} 回到排行榜`)}>{tl('放回排行榜')}</button>}
                {!r.hidden && !r.banned && <button className="pill" disabled={busy} onClick={() => act(r, 'hide', tl`${r.name} 已移出排行榜`)}>{tl('移出排行榜')}</button>}
                {r.banned
                  ? <button className="pill" disabled={busy} onClick={() => act(r, 'unban', tl`已解封 ${r.name}`)}>{tl('解封')}</button>
                  : <button className="pill" disabled={busy} onClick={() => act(r, 'ban', tl`已封禁 ${r.name}`, tl`封禁 ${r.name}？不上排行榜、不能在世界频道说话`)}>{tl('封禁')}</button>}
                {r.tradeUntil
                  ? <button className="pill" disabled={busy} onClick={() => limit(r.pid, 'trade', 0)}>{tl('解除交易限制')}</button>
                  : <button className="pill" disabled={busy} onClick={() => limit(r.pid, 'trade', 168)}>{tl('限制交易 7 天')}</button>}
                {r.muteUntil
                  ? <button className="pill" disabled={busy} onClick={() => limit(r.pid, 'mute', 0)}>{tl('解除禁言')}</button>
                  : <button className="pill" disabled={busy} onClick={() => limit(r.pid, 'mute', 24)}>{tl('禁言 1 天')}</button>}
                <button className="pill" disabled={busy} onClick={() => act(r, 'clear', tl`已清除 ${r.name} 的记录`, tl`清除 ${r.name} 的全部记录（误判时用）？`)}>{tl('清除记录')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3>{tl('限制玩家')} <small className="muted">{tl('限制交易期间不能交易、不能存取公会仓库；禁言期间世界、公会、队伍频道不能说话。时长填 0 解除')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('数字 ID')}</span><input inputMode="numeric" value={lim.pid} onChange={(e) => setLim({ ...lim, pid: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
        <label><span>{tl('限制什么')}</span>
          <select value={lim.what} onChange={(e) => setLim({ ...lim, what: e.target.value as 'trade' | 'mute' })}>
            <option value="trade">{tl('交易和公会仓库')}</option>
            <option value="mute">{tl('禁言')}</option>
          </select>
        </label>
        <label><span>{tl('多少小时')}</span><input inputMode="numeric" value={lim.hours} onChange={(e) => setLim({ ...lim, hours: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <div className="gm-actions"><button className="primary" disabled={busy} onClick={submitLim}>{tl('确定')}</button></div>
      </div>
      <h3>{tl('检查阈值')}</h3>
      <div className="gm-form gm-ac-form frame">
        {AC_FIELDS.map(([k, name]) => (
          <label key={k}><span>{name}</span><input inputMode="numeric" value={conf[k] ?? ''} onChange={(e) => setConf({ ...conf, [k]: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        ))}
        <p className="muted">{tl('默认值按满级角色最快的经验和金币速度留了几倍余量；GM 经验增益期间自动按比例放宽，GM 邮件送的金币不算。超过上限 3 倍（金币 5 倍）算严重。')}</p>
        <div className="gm-actions"><button className="primary" disabled={busy} onClick={saveConf}>{tl('保存')}</button></div>
      </div>
    </>
  );
}

const itemLabel = (id: string) => (id === 'coins' ? tl('金币') : ITEMS[id]?.name ?? id);
const itemsText = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${itemLabel(k)} × ${fmtNum(v)}`).join(tl('、')) || tl('（没放东西）');
const TRADE_STATUS: Record<GmTrade['status'], string> = { open: tl('进行中'), done: tl('已成交'), cancelled: tl('已取消') };

/** 交易记录（11-01）：所有玩家之间的交易，可以按数字 ID 或名字搜 */
function TradeTab() {
  const [who, setWho] = useState('');
  const [rows, setRows] = useState<GmTrade[] | null>(null);
  const [err, setErr] = useState('');
  const load = async (q = who) => {
    setRows(null); setErr('');
    try { setRows(await online.gmTrades(q)); } catch (e) { setErr((e as Error).message); setRows([]); }
  };
  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = rows ?? [];
  return (
    <>
      <h3>{tl('交易记录')} <small className="muted">{tl('所有玩家之间的交易，最近的在前；价值按服务器上的物品价格算')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('玩家')}</span><input value={who} placeholder={tl('数字 ID 或名字，空着看全部')} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} /></label>
        <div className="gm-actions"><button className="primary" onClick={() => void load()}>{tl('搜索')}</button></div>
        {err && <p className="warn">{err}</p>}
      </div>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('没有交易记录')}</p> : (
        <ul className="gm-list">
          {list.map((t) => {
            const lop = t.status === 'done' && Math.max(t.a.value, t.b.value) > 5 * Math.min(t.a.value, t.b.value) && Math.abs(t.a.value - t.b.value) > 100000;
            return (
              <li key={t.id} className="frame">
                <div><b>{t.a.name}</b> <small className="muted">#{t.a.pid}</small> ⇄ <b>{t.b.name}</b> <small className="muted">#{t.b.pid}</small> <small className={t.status === 'done' ? 'good' : 'muted'}>{TRADE_STATUS[t.status]}</small>{lop && <b className="warn"> {tl('不对等')}</b>}</div>
                <small className="muted">{new Date(t.at).toLocaleString()}</small>
                <div className="gm-trade-side"><small>{tl`${t.a.name} 给出（价值 ${fmtNum(t.a.value)}）：`}{itemsText(t.a.items)}</small></div>
                <div className="gm-trade-side"><small>{tl`${t.b.name} 给出（价值 ${fmtNum(t.b.value)}）：`}{itemsText(t.b.items)}</small></div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * 服务器存档（11-01）：全服存档快照。每天自动存一份，也能手动存；
 * 出了大 bug / 大漏洞可以整个服务器回档，或者只回档某一个玩家。
 */
function SnapTab() {
  const [rows, setRows] = useState<Snapshot[] | null>(null);
  const [label, setLabel] = useState('');
  const [pid, setPid] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setRows(await online.gmSnapshots()); } catch (e) { setMsg({ text: (e as Error).message, ok: false }); setRows([]); }
  };
  useEffect(() => { void load(); }, []);
  const run = async (f: () => Promise<string>) => {
    setBusy(true);
    try { setMsg({ text: await f(), ok: true }); await load(); } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    setBusy(false);
  };
  const when = (x: Snapshot) => new Date(x.at).toLocaleString();
  const rollAll = (x: Snapshot) => {
    if (!confirm(tl`整个服务器回档到 ${when(x)}（${x.label}）？所有玩家这之后的进度都会没有。回档前会自动先存一份，回错了还能再回来。`)) return;
    if (!confirm(tl('再确认一次：真的要全服回档吗？'))) return;
    void run(async () => tl`已回档 ${await online.gmRollback(x.id)} 个玩家。在线的玩家一分钟内会自动读取回档后的存档`);
  };
  const rollOne = (x: Snapshot) => {
    const n = Number(pid);
    if (!(n > 0)) return setMsg({ text: tl('先在上面填要回档的玩家数字 ID'), ok: false });
    if (!confirm(tl`把玩家 #${n} 回档到 ${when(x)}（${x.label}）？`)) return;
    void run(async () => { await online.gmRollback(x.id, n); return tl`玩家 #${n} 已回档`; });
  };
  const list = rows ?? [];
  return (
    <>
      <h3>{tl('服务器存档')} <small className="muted">{tl('把所有玩家的角色存档和排行榜存一份。每天自动存一次；出了大 bug 或大漏洞可以整个服务器回档，也能只回档一个玩家。公会仓库、交易、邮件、聊天不回档')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('备注')}</span><input maxLength={40} value={label} placeholder={tl('比如：更新前')} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="gm-actions"><button className="primary" disabled={busy} onClick={() => void run(async () => { await online.gmSnapshotCreate(label); setLabel(''); return tl('已存档'); })}>{tl('现在存一份')}</button></div>
        <label><span>{tl('单个玩家')}</span><input inputMode="numeric" value={pid} placeholder={tl('只回档一个人时填数字 ID')} onChange={(e) => setPid(e.target.value.replace(/\D/g, '').slice(0, 9))} /></label>
        {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
      </div>
      <h3>{tl('存档列表')}</h3>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('还没有存档（有玩家上线后会自动存第一份）')}</p> : (
        <ul className="gm-list">
          {list.map((x) => (
            <li key={x.id} className="frame">
              <div><b>{x.label || tl('手动')}</b> {x.auto && <small className="muted">{tl('自动')}</small>}</div>
              <small className="muted">{tl`${when(x)} · ${x.players} 个玩家 · ${x.mb} MB`}</small>
              <div className="gm-row-tools">
                <button className="pill" disabled={busy} onClick={() => rollAll(x)}>{tl('全服回档到这里')}</button>
                <button className="pill" disabled={busy} onClick={() => rollOne(x)}>{tl('只回档这个玩家')}</button>
                <button className="pill" disabled={busy} onClick={() => confirm(tl`删除 ${when(x)} 的存档？`) && void run(async () => { await online.gmSnapshotDelete(x.id); return tl('已删除'); })}>{tl('删除')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 「多久以前」：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 */
function ago(t: number) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 2) return tl('刚刚');
  if (m < 60) return tl`${m} 分钟前`;
  if (m < 48 * 60) return tl`${Math.floor(m / 60)} 小时前`;
  return tl`${Math.floor(m / 1440)} 天前`;
}

/** 真人玩家（11-01）：新注册的在前，带注册时间、最后在线、等级、公会、防作弊状态 */
function PlayersTab() {
  const [who, setWho] = useState('');
  const [rows, setRows] = useState<GmPlayer[] | null>(null);
  const [count, setCount] = useState<{ total: number; today: number; week: number } | null>(null);
  const [err, setErr] = useState('');
  const load = async (q = who) => {
    setRows(null); setErr('');
    try {
      const [r, c] = await Promise.all([online.gmPlayers(q), online.gmPlayerCount()]);
      setRows(r); setCount(c);
    } catch (e) { setErr((e as Error).message); setRows([]); }
  };
  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = rows ?? [];
  return (
    <>
      <h3>{tl('玩家')} <small className="muted">{tl('真人玩家（不含 AI），新注册的在前')}</small></h3>
      {count && <p className="gm-count">{tl`共 ${count.total} 人 · 今天新注册 ${count.today} · 7 天内 ${count.week}`}</p>}
      <div className="gm-form frame">
        <label><span>{tl('玩家')}</span><input value={who} placeholder={tl('数字 ID 或名字，空着看全部')} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} /></label>
        <div className="gm-actions"><button className="primary" onClick={() => void load()}>{tl('搜索')}</button></div>
        {err && <p className="warn">{err}</p>}
      </div>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('没有玩家')}</p> : (
        <ul className="gm-list gm-players">
          {list.map((p) => (
            <li key={p.id} className="frame">
              <div>
                <b>{p.name}</b> <small className="muted">#{p.pid}</small>{p.guildTag && <small className="muted"> [{p.guildTag}]</small>}
                {p.banned ? <b className="warn"> {tl('已封禁')}</b> : p.hidden ? <b className="warn"> {tl('已移出排行榜')}</b> : p.flags > 0 ? <small className="warn"> {tl`${p.flags} 条可疑记录`}</small> : null}
              </div>
              <small className="muted">{tl`注册：${new Date(p.joined).toLocaleString()}（${ago(p.joined)}）`}</small>
              <small className="muted">{tl`最后在线：${ago(p.lastSeen)}`}{p.total != null ? tl` · 总等级 ${p.total} · 战斗 ${p.combat}` : tl(' · 还没上传过存档')}</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
