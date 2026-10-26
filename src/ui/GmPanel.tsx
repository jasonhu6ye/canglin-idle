import { useEffect, useState } from 'react';
import { GM_KINDS, GM_KIND_NAME, GM_PCT_MAX } from '../core/gm';
import type { GmKind } from '../core/types';
import { online, type GmInput, type GmRow } from '../net';
import { pullGm } from '../net/social';
import { tl } from '../i18n';

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
    <div className="page guild gm-panel">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('GM 面板')}</h2>
        <small className="muted">{tl('管理员专用')}</small>
      </div>

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
    </div>
  );
}
