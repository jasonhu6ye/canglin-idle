import { useEffect, useMemo, useState } from 'react';
import { GM_KINDS, GM_KIND_NAME, GM_PCT_MAX } from '../core/gm';
import type { GmKind } from '../core/types';
import { online, type AiPlayer, type GmInput, type GmMailRow, type GmRow } from '../net';
import { aiPlayers, botDoing, botName, botOnline, botPresence, botProfile, refreshBots, zoneOf } from '../net/bots';
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
  const [tab, setTab] = useState<'buff' | 'mail' | 'gear' | 'ai'>('buff');
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
      </div>
      {tab === 'buff' ? <BuffTab /> : tab === 'ai' ? <AiTab onClose={onClose} /> : <MailTab key={tab} gear={tab === 'gear'} />}
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

const AI_MAX = 200;
/**
 * AI 玩家（用户 10-31）：加几个、删几个、改名。名字外观等级都随机，所有人看到的一样：
 * 在地图上干活走动、算进在线人数、上排行榜、偶尔在世界频道说英文。
 */
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
        <p className="muted">{tl`现在有 ${list.length} 个 AI 玩家，${list.filter((b) => botOnline(b)).length} 个在线。名字、外观、等级随机，加进来后每天慢慢升级；每个 AI 有自己的时区，当地夜里会下线睡觉`}</p>
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
                <small className="muted">{!botOnline(b) ? tl`离线（${LANG === 'en' ? zoneOf(b).en : zoneOf(b).zh}，当地夜里在睡觉）` : now?.action ? tl`正在：${actionName(now.action)}` : idle ? tl('在城里挂机') : tl('正在赶路')}</small>
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
