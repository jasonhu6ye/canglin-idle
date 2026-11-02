import { useEffect, useMemo, useState } from 'react';
import { GM_GROUPS, GM_KINDS, GM_KIND_NAME, GM_PCT_MAX, gmGroupOf } from '../core/gm';
import type { GmKind } from '../core/types';
import { online, type GearEvRow, type GearProvRow, type AiPlayer, type CheatRow, type AltRow, type RedeemCodeRow, type EconRow, type GmPlayer, type GmTrade, type Snapshot, type GmInput, type GmMailRow, type GmRow } from '../net';
import { aiPlayers, botDoing, botsMuted, setBotsMuted, botName, botOnline, botPresence, botProfile, habitOf, refreshBots, zoneOf } from '../net/bots';
import { actionName, fmtDuration } from './format';
import { PROV_EV_Q, type Prov, type ProvEv } from '../core/prov';
import { emitToGame } from './GameCanvas';
import { ACTIONS, ITEMS, MONSTERS, SKILLS } from '../core/data';
import { levelForXp, XP_TABLE } from '../core/xp';
import type { SkillId } from '../core/types';
import { SkillIcon } from './icons';
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
  /** 新发放时可以一次选好几种，每种各发一条（11-02） */
  kinds: GmKind[];
  pct: string;
  len: string;
  unit: Unit;
  /** 开始时间：空 = 现在；否则 datetime-local 的值 */
  start: string;
}
const EMPTY: Form = { all: true, pid: '', name: '', tag: '', kind: 'xp', kinds: ['xp'], pct: '50', len: '2', unit: 'h', start: '' };
/** 一键模板（11-02） */
const PRESETS: { name: string; tag: string; kinds: GmKind[]; pct: number; len: number; unit: Unit }[] = [
  { name: tl('周末双倍经验'), tag: tl('双倍'), kinds: ['xp'], pct: 100, len: 2, unit: 'd' },
  { name: tl('新手福利'), tag: tl('新手'), kinds: ['xp', 'drop', 'speed'], pct: 50, len: 7, unit: 'd' },
  { name: tl('战斗狂欢'), tag: tl('狂欢'), kinds: ['atk', 'str', 'def', 'crit', 'haste'], pct: 30, len: 6, unit: 'h' },
  { name: tl('采集节'), tag: tl('丰收'), kinds: ['xp_gather', 'yield', 'speed'], pct: 50, len: 1, unit: 'd' },
  { name: tl('工匠日'), tag: tl('工匠'), kinds: ['xp_produce', 'quality', 'speed'], pct: 50, len: 1, unit: 'd' },
  { name: tl('寻宝时刻'), tag: tl('寻宝'), kinds: ['drop', 'coins'], pct: 100, len: 3, unit: 'h' },
  { name: tl('补偿礼包'), tag: tl('补偿'), kinds: ['xp', 'drop', 'coins', 'speed'], pct: 100, len: 1, unit: 'd' },
];
const LEN_PRESETS: [number, Unit][] = [[30, 'm'], [1, 'h'], [2, 'h'], [6, 'h'], [12, 'h'], [1, 'd'], [3, 'd'], [7, 'd']];
/** datetime-local 要的格式（本地时间） */
const localInput = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };

const left = (ms: number) => {
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return tl`${m} 分钟`;
  const h = Math.floor(m / 60);
  return h < 48 ? tl`${h} 小时 ${m % 60} 分` : tl`${Math.floor(h / 24)} 天 ${h % 24} 小时`;
};

export function GmPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'buff' | 'mail' | 'gear' | 'code' | 'econ' | 'ai' | 'players' | 'ac' | 'trade' | 'snap' | 'src' | 'skills'>('buff');
  return (
    <div className="page guild gm-panel">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('GM 面板')}</h2>
        <small className="muted">{tl('管理员专用')}</small>
      </div>
      <div className="gm-seg gm-tabs">
        <button className={`pill ${tab === 'buff' ? 'on' : ''}`} onClick={() => setTab('buff')}>{tl('增益')}</button>
        <button className={`pill ${tab === 'skills' ? 'on' : ''}`} onClick={() => setTab('skills')}>{tl('技能等级')}</button>
        <button className={`pill ${tab === 'mail' ? 'on' : ''}`} onClick={() => setTab('mail')}>{tl('赠送物品')}</button>
        <button className={`pill ${tab === 'gear' ? 'on' : ''}`} onClick={() => setTab('gear')}>{tl('赠送装备')}</button>
        <button className={`pill ${tab === 'code' ? 'on' : ''}`} onClick={() => setTab('code')}>{tl('兑换码')}</button>
        <button className={`pill ${tab === 'ai' ? 'on' : ''}`} onClick={() => setTab('ai')}>{tl('AI 玩家')}</button>
        <button className={`pill ${tab === 'players' ? 'on' : ''}`} onClick={() => setTab('players')}>{tl('玩家')}</button>
        <button className={`pill ${tab === 'ac' ? 'on' : ''}`} onClick={() => setTab('ac')}>{tl('防作弊')}</button>
        <button className={`pill ${tab === 'econ' ? 'on' : ''}`} onClick={() => setTab('econ')}>{tl('经济')}</button>
        <button className={`pill ${tab === 'trade' ? 'on' : ''}`} onClick={() => setTab('trade')}>{tl('交易记录')}</button>
        <button className={`pill ${tab === 'snap' ? 'on' : ''}`} onClick={() => setTab('snap')}>{tl('服务器存档')}</button>
        <button className={`pill ${tab === 'src' ? 'on' : ''}`} onClick={() => setTab('src')}>{tl('装备来源')}</button>
      </div>
      {tab === 'buff' ? <BuffTab /> : tab === 'ai' ? <AiTab onClose={onClose} /> : tab === 'ac' ? <AcTab /> : tab === 'players' ? <PlayersTab /> : tab === 'trade' ? <TradeTab /> : tab === 'econ' ? <EconTab /> : tab === 'snap' ? <SnapTab /> : tab === 'src' ? <GearSrcTab /> : tab === 'skills' ? <SkillTab /> : <MailTab key={tab} gear={tab === 'gear'} code={tab === 'code'} />}
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
  const startAt = form.start ? new Date(form.start).getTime() : NaN;
  const bad =
    !form.name.trim() ? tl('先起个名字') :
    !editing && !form.kinds.length ? tl('至少选一种类型') :
    form.start && !(startAt > 0) ? tl('开始时间不对') :
    !(pct > 0 && pct <= GM_PCT_MAX) ? tl`数值要在 1-${GM_PCT_MAX}% 之间` :
    !(len > 0) ? tl('持续时间要大于 0') :
    !form.all && !(Number.isInteger(pid) && pid > 0) ? tl('填玩家的数字 UID') : null;

  const submit = () => {
    if (bad) return;
    const unit = UNITS.find((u) => u.id === form.unit)!;
    const from = form.start && startAt > Date.now() ? startAt : Date.now();
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
    } else {
      const kinds = form.kinds;
      const who = form.all ? tl('全服') : tl`UID ${pid}`;
      void run(async () => { for (const kind of kinds) await online.gmAdd({ ...b, kind }); },
        kinds.length > 1 ? tl`已给${who}发放 ${kinds.length} 种增益` : form.all ? tl('已发放给全服') : tl`已发放给 UID ${pid}`);
    }
    setForm({ ...EMPTY, kind: form.kind, kinds: form.kinds });
  };

  const edit = (r: GmRow) => {
    const total = r.to - r.from;
    const unit = total % 86_400_000 === 0 ? 'd' : total % 3600_000 === 0 ? 'h' : 'm';
    const ms = UNITS.find((u) => u.id === unit)!.ms;
    setForm({ all: r.targetPid == null, pid: r.targetPid ? String(r.targetPid) : '', name: r.name, tag: r.tag, kind: r.kind, kinds: [r.kind], pct: String(r.pct), len: String(Math.round(total / ms)), unit, start: r.from > Date.now() ? localInput(r.from) : '' });
    setEditing(r.id);
    setMsg(null);
  };

  return (
    <>
      <h3>{editing ? tl('修改增益') : tl('发放增益')}</h3>
      <div className="gm-form frame">
        {!editing && (
          <label><span>{tl('模板')}</span>
            <span className="gm-seg">
              {PRESETS.map((p) => <button key={p.name} className="pill" title={p.kinds.map((k) => GM_KIND_NAME[k]).join(tl('、'))} onClick={() => set({ name: p.name, tag: p.tag, kinds: p.kinds, kind: p.kinds[0], pct: String(p.pct), len: String(p.len), unit: p.unit })}>{p.name}</button>)}
            </span>
          </label>
        )}
        <label><span>{tl('对象')}</span>
          <span className="gm-seg">
            <button className={`pill ${form.all ? 'on' : ''}`} onClick={() => set({ all: true })}>{tl('全服玩家')}</button>
            <button className={`pill ${!form.all ? 'on' : ''}`} onClick={() => set({ all: false })}>{tl('指定玩家')}</button>
            {!form.all && <input inputMode="numeric" placeholder={tl('玩家 UID，如 10000002')} value={form.pid} onChange={(e) => set({ pid: e.target.value.replace(/\D/g, '') })} />}
          </span>
        </label>
        <label><span>{tl('名字')}</span><input maxLength={20} placeholder={tl('如：周末双倍经验')} value={form.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label><span>{tl('标签')}</span><input maxLength={4} placeholder={tl('1-4 个字，如：双倍')} value={form.tag} onChange={(e) => set({ tag: e.target.value })} /></label>
        {editing ? (
          <label><span>{tl('类型')}</span>
            <select value={form.kind} onChange={(e) => set({ kind: e.target.value as GmKind, kinds: [e.target.value as GmKind] })}>
              {GM_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="gm-kinds">
            <span>{tl('类型')}<small className="muted">{tl('可多选')}</small></span>
            <div>
              {GM_GROUPS.map((g) => (
                <div key={g.id} className="gm-kind-row">
                  <small className="muted">{g.name}</small>
                  {GM_KINDS.filter((k) => gmGroupOf(k.id) === g.id).map((k) => {
                    const on = form.kinds.includes(k.id);
                    return <button key={k.id} title={k.desc} className={`pill ${on ? 'on' : ''}`} onClick={() => {
                      const kinds = on ? form.kinds.filter((x) => x !== k.id) : [...form.kinds, k.id];
                      set({ kinds, kind: on ? kinds[0] ?? form.kind : k.id });
                    }}>{k.name}</button>;
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <small className="muted gm-hint">{GM_KINDS.find((k) => k.id === form.kind)?.desc}</small>
        <label><span>{tl('数值')}</span><span className="gm-seg"><input inputMode="decimal" value={form.pct} onChange={(e) => set({ pct: e.target.value.replace(/[^\d.]/g, '') })} /><b>%</b>
          {[10, 25, 50, 100, 200, 300, 500, 1000].map((n) => <button key={n} className={`pill ${pct === n ? 'on' : ''}`} onClick={() => set({ pct: String(n) })}>+{n}%</button>)}
        </span></label>
        <label><span>{tl('持续')}</span><span className="gm-seg"><input inputMode="decimal" value={form.len} onChange={(e) => set({ len: e.target.value.replace(/[^\d.]/g, '') })} />
          {UNITS.map((u) => <button key={u.id} className={`pill ${form.unit === u.id ? 'on' : ''}`} onClick={() => set({ unit: u.id })}>{u.name}</button>)}
        </span></label>
        <label><span /><span className="gm-seg">
          {LEN_PRESETS.map(([n, u]) => <button key={n + u} className={`pill ${len === n && form.unit === u ? 'on' : ''}`} onClick={() => set({ len: String(n), unit: u })}>{n}{UNITS.find((x) => x.id === u)!.name}</button>)}
        </span></label>
        <label><span>{tl('开始')}</span><span className="gm-seg">
          <button className={`pill ${!form.start ? 'on' : ''}`} onClick={() => set({ start: '' })}>{tl('立即')}</button>
          <input type="datetime-local" style={{ width: 'auto' }} value={form.start} min={localInput(Date.now())} onChange={(e) => set({ start: e.target.value })} />
          {[1, 6, 24].map((h) => <button key={h} className="pill" onClick={() => set({ start: localInput(Date.now() + h * 3600_000) })}>{tl`${h} 小时后`}</button>)}
        </span></label>
        <div className="gm-actions">
          <button className="primary" disabled={!!bad || busy} onClick={submit}>{editing ? tl('保存修改') : form.kinds.length > 1 ? tl`发放 ${form.kinds.length} 种` : tl('发放')}</button>
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
function MailTab({ gear, code }: { gear: boolean; code?: boolean }) {
  const [rows, setRows] = useState<GmMailRow[] | null>(null);
  const [codes, setCodes] = useState<RedeemCodeRow[] | null>(null);
  const [codeText, setCodeText] = useState('');
  const [days, setDays] = useState('0');
  const [maxUses, setMaxUses] = useState('0');
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
      if (code) setCodes(await online.gmCodeList());
      else setRows(await online.gmMailList());
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
    code ? (!codeText.trim() ? tl('填兑换码') : !title.trim() ? tl('写个邮件标题') : !items.length ? tl('至少放一种物品') : items.some((i) => !(i.qty > 0)) ? tl('数量要大于 0') : null) :
    !(Number.isInteger(n) && n > 0) ? tl('填玩家的数字 UID') :
    !title.trim() ? tl('写个邮件标题') :
    !items.length ? tl('至少放一种物品') :
    items.some((i) => !(i.qty > 0)) ? tl('数量要大于 0') : null;

  const send = () => {
    if (bad) return;
    if (code) {
      const d = Number(days) || 0;
      return void run(async () => {
        await online.gmCodeSave({ code: codeText.trim(), title: title.trim(), body: body.trim(), items, maxUses: Math.floor(Number(maxUses) || 0), uses: 0, expiresAt: d > 0 ? Date.now() + d * 86400000 : null });
        setItems([]); setTitle(''); setBody(''); setCodeText('');
      }, tl('兑换码已保存'));
    }
    void run(async () => {
      await online.gmMailSend({ targetPid: n, title: title.trim(), body: body.trim(), items });
      setItems([]);
      setTitle('');
      setBody('');
    }, tl`已发送给 UID ${n}，对方上线一分钟内收到`);
  };

  return (
    <>
      {code
        ? <h3>{tl('兑换码')} <small className="muted">{tl('玩家在「更多」页输入兑换码，奖励发到邮箱。每个账号每个码只能领一次；兑换码只存在服务器上，网页代码里看不到')}</small></h3>
        : gear
        ? <h3>{tl('赠送装备')} <small className="muted">{tl('武器、护甲、饰品、工具都能送，品质任选，通过邮件发给指定玩家')}</small></h3>
        : <h3>{tl('赠送物品')} <small className="muted">{tl('通过邮件发给指定玩家，装备在「赠送装备」里送')}</small></h3>}
      <div className="gm-form frame">
        {code ? (
          <>
            <label><span>{tl('兑换码')}</span><input maxLength={32} placeholder={tl('如：周年快乐2026')} value={codeText} onChange={(e) => { setCodeText(e.target.value); setMsg(null); }} /></label>
            <label><span>{tl('有效天数')}</span><input inputMode="numeric" placeholder={tl('0 = 永久')} value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d.]/g, ''))} /></label>
            <label><span>{tl('总次数')}</span><input inputMode="numeric" placeholder={tl('0 = 不限')} value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} /></label>
          </>
        ) : <label><span>{tl('玩家')}</span><input inputMode="numeric" placeholder={tl('玩家 UID，如 10000002')} value={pid} onChange={(e) => { setPid(e.target.value.replace(/\D/g, '')); setMsg(null); }} /></label>}
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
          <button className="primary" disabled={!!bad || busy} onClick={send}>{code ? tl('保存兑换码') : tl('发送邮件')}</button>
        </div>
        {(bad && (pid || codeText || title || items.length)) || msg ? <p className={msg?.ok ? 'good' : 'warn'}>{msg?.text ?? bad}</p> : null}
      </div>

      {code ? (
        <>
          <h3>{tl('已有的兑换码')}</h3>
          {codes === null && <p className="muted">{tl('读取中…')}</p>}
          {codes?.length === 0 && <p className="muted">{tl('还没有建过')}</p>}
          <ul className="gm-list">
            {codes?.map((c) => {
              const over = (c.expiresAt != null && c.expiresAt < Date.now()) || (c.maxUses > 0 && c.uses >= c.maxUses);
              return (
                <li key={c.code} className={`frame ${over ? 'off' : 'on'}`}>
                  <div><b>{c.code}</b> <small className="muted">{c.title}</small></div>
                  <small className="muted">
                    {c.maxUses > 0 ? tl`已领 ${c.uses} / ${c.maxUses} 次` : tl`已领 ${c.uses} 次`}{' · '}
                    {c.expiresAt ? tl`${new Date(c.expiresAt).toLocaleString()} 过期` : tl('永久有效')}
                  </small>
                  <small>{c.items.map((i) => `${ITEMS[i.item]?.name ?? i.item} ×${fmtNum(i.qty)}`).join(tl('、'))}</small>
                  <div className="gm-row-tools">
                    <button className="pill warn" disabled={busy} onClick={() => confirm(tl`删除兑换码 ${c.code}？删除后没领的人就领不到了`) && run(() => online.gmCodeDelete(c.code), tl('已删除'))}>{tl('删除')}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : <>
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
      </>}
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
  fake_hits: tl('伪造队友伤害'), bad_cmd: tl('发了不存在的操作'), backdate: tl('操作时间往前填（补领奖励）'), banned_play: tl('封禁后还在操作'), alt_trade: tl('和关联账号交易'), alt_bank: tl('从公会仓库取关联账号存的东西'), multi_new: tl('同一个网络一天内注册了好几个新号'), chat_word: tl('聊天里有敏感词（已替换成 *）'), rank_jump: tl('一天经验涨得远超其他人'),
  auto_rollback: tl('已自动回档'), auto_wipe: tl('已自动删档封号'),
};
const AC_DEFAULT = { xp_per_hour: 6000000, coins_per_hour: 50000000, value_per_hour: 50000000, trade_gap: 3000000, chat_per_min: 8, multi_accounts: 3, drift_min: 30, snap_keep_auto: 3, auto_hide: 1, auto_punish: 1, wipe_strikes: 3, trade_new_hours: 24, trade_day_value: 0, lock_hidden: 1, punish_trade_days: 7, same_dev_trade: 1, same_ip_trade: 0, link_days: 30, new_per_net: 4, rank_jump: 3, rank_jump_min: 20000000 };
const AC_FIELDS: [keyof typeof AC_DEFAULT, string][] = [
  ['xp_per_hour', tl('每小时经验上限')], ['coins_per_hour', tl('每小时金币上限')], ['value_per_hour', tl('每小时物品价值上限')],
  ['trade_gap', tl('交易价值差多少算不对等')], ['chat_per_min', tl('世界频道每分钟最多几句')], ['multi_accounts', tl('一台设备几个账号算多开')],
  ['drift_min', tl('游戏时间允许超前（分钟）')], ['snap_keep_auto', tl('每日自动存档保留几份')], ['auto_hide', tl('严重的自动移出排行榜（1 开 / 0 关）')],
  ['auto_punish', tl('明显作弊自动回档（1 开 / 0 关）')], ['wipe_strikes', tl('30 天内第几次自动删档封号')],
  ['trade_new_hours', tl('新账号几小时后才能交易（0 不限）')], ['trade_day_value', tl('每天交易最多收到多少价值（0 不限）')],
  ['lock_hidden', tl('移出排行榜的不能交易和用公会仓库（1 开 / 0 关）')], ['punish_trade_days', tl('自动回档后限制交易几天')],
  ['same_dev_trade', tl('同设备的账号不能互相交易（1 开 / 0 关）')], ['same_ip_trade', tl('同网络的账号不能互相交易（1 开 / 0 只记录）')], ['link_days', tl('多少天内用过同设备 / 网络算关联')], ['new_per_net', tl('同网络一天几个新号算批量注册')],
  ['rank_jump', tl('一天经验比第二名多几倍算异常')], ['rank_jump_min', tl('一天至少涨多少经验才算异常')],
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
  if ('with' in d) return d.by === 'dev' ? tl`对方 ${String(d.with)}（#${String(d.with_pid)}），同一台设备` : tl`对方 ${String(d.with)}（#${String(d.with_pid)}），同一个网络`;
  if ('got' in d) return tl`从 ${String(d.from)} 收到价值 ${n('got')}，只给出 ${n('gave')}`;
  if ('per_min' in d) return tl`一分钟 ${n('per_min')} 句`;
  if ('day_xp' in d) return tl`一天涨了 ${n('day_xp')} 经验，第二名 ${n('second_xp')}`;
  if (typeof d.text === 'string') return tl`原话：${d.text}`;
  if ('new_accounts' in d) return tl`这个网络一天内有 ${n('new_accounts')} 个新号`;
  if ('accounts' in d) return tl`这台设备登录过 ${n('accounts')} 个账号`;
  if (Array.isArray(d.items)) return (d.items as { id: string; n?: unknown; gave?: unknown; had?: unknown }[]).map((x) => 'gave' in x ? tl`${itemLabel(x.id)} 给出 ${fmtNum(Number(x.gave))}，存档里 ${fmtNum(Number(x.had))}` : `${itemLabel(x.id)} × ${String(x.n)}`).join(tl('；'));
  return Object.keys(d).length ? JSON.stringify(d) : '';
}
function AcTab() {
  const [rows, setRows] = useState<CheatRow[] | null>(null);
  const [conf, setConf] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [alts, setAlts] = useState<AltRow[] | null>(null);
  useEffect(() => {
    setAlts(null);
    if (open) online.gmLinks(open).then(setAlts, () => setAlts([]));
  }, [open]);
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
  const [lim, setLim] = useState({ pid: '', what: 'trade' as 'trade' | 'mute' | 'exempt', hours: '168' });
  const limit = (pid: number, what: 'trade' | 'mute', hours: number) => {
    void run(async () => {
      const nm = await online.gmAcLimit(pid, what, hours);
      return hours <= 0 ? tl`已解除 ${nm} 的限制` : what === 'trade' ? tl`${nm} 限制交易 ${hours} 小时` : tl`${nm} 禁言 ${hours} 小时`;
    }, '');
  };
  const exempt = (pid: number, on: boolean) => {
    void run(async () => {
      const nm = await online.gmAcExempt(pid, on);
      return on ? tl`${nm} 已加入白名单` : tl`${nm} 已移出白名单`;
    }, '');
  };
  const submitLim = () => {
    const pid = Number(lim.pid), h = Number(lim.hours);
    if (!/^\d{8}$/.test(lim.pid)) return setMsg({ text: tl('数字 ID 是 8 位数字'), ok: false });
    if (lim.what === 'exempt') return exempt(pid, h > 0);
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
                {r.exempt && <b className="good"> {tl('白名单')}</b>}
              </div>
              <small className="muted">{tl`${r.n} 条记录（严重 ${r.severe}）`}{r.lastAt ? tl` · 最近 ${new Date(r.lastAt).toLocaleString()}` : ''}{r.note ? ` · ${r.note}` : ''}</small>
              {open === r.playerId && (
                <ul className="gm-ac-flags">
                  {r.flags.map((f, i) => (
                    <li key={i}><b className={f.severe ? 'warn' : ''}>{AC_KIND[f.kind] ?? f.kind}</b> <small className="muted">{new Date(f.at).toLocaleString()} · {acDetail(f.detail)}</small></li>
                  ))}
                  <li><b>{tl('关联账号')}</b> <small className="muted">{alts == null ? tl('读取中…') : !alts.length ? tl('没有') : alts.map((a) => `${a.name} #${a.pid}（${a.kind === 'dev' ? tl('同设备') : tl('同网络')}${a.banned ? tl('，已封禁') : ''}）`).join(tl('、'))}</small></li>
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
                <button className="pill" disabled={busy} onClick={() => exempt(r.pid, !r.exempt)}>{r.exempt ? tl('移出白名单') : tl('加入白名单')}</button>
                <button className="pill" disabled={busy} onClick={() => act(r, 'clear', tl`已清除 ${r.name} 的记录`, tl`清除 ${r.name} 的全部记录（误判时用）？`)}>{tl('清除记录')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3>{tl('限制玩家')} <small className="muted">{tl('限制交易期间不能交易、不能存取公会仓库；禁言期间世界、公会、队伍频道不能说话。时长填 0 解除。白名单里的人照样记录可疑操作，但不会被自动移出排行榜、自动回档、自动锁交易')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('数字 ID')}</span><input inputMode="numeric" value={lim.pid} onChange={(e) => setLim({ ...lim, pid: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
        <label><span>{tl('限制什么')}</span>
          <select value={lim.what} onChange={(e) => setLim({ ...lim, what: e.target.value as 'trade' | 'mute' | 'exempt' })}>
            <option value="trade">{tl('交易和公会仓库')}</option>
            <option value="mute">{tl('禁言')}</option>
            <option value="exempt">{tl('白名单（填 1 加入，填 0 移出）')}</option>
          </select>
        </label>
        <label><span>{tl('多少小时')}</span><input inputMode="numeric" value={lim.hours} onChange={(e) => setLim({ ...lim, hours: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <div className="gm-actions"><button className="primary" disabled={busy} onClick={submitLim}>{tl('确定')}</button></div>
      </div>
      <ChatWords />
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

/** 每日经济报表（11-02）：全服金币、物品价值、经验每天的变化，GM 发了多少、交易了多少，一天涨得最多的人 */
function EconTab() {
  const [r, setR] = useState<{ now: EconRow; days: EconRow[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { online.gmEconomy().then(setR, (e) => setErr((e as Error).message)); }, []);
  if (err) return <p className="warn">{err}</p>;
  if (!r) return <p className="muted">{tl('读取中…')}</p>;
  const rows = [{ ...r.now, day: tl('现在') }, ...r.days];
  const diff = (i: number, k: 'coins' | 'item_value' | 'xp') => {
    const a = Number(rows[i][k]), b = rows[i + 1] ? Number(rows[i + 1][k]) : NaN;
    if (!Number.isFinite(b)) return '';
    const d = a - b;
    return ` (${d >= 0 ? '+' : ''}${fmtNum(Math.round(d))})`;
  };
  return (
    <>
      <h3>{tl('每日经济')} <small className="muted">{tl('每天第一次有人上线时记一行；括号里是比前一天多了多少。哪天突然多出一大笔，就去看那天涨得最多的人')}</small></h3>
      <ul className="gm-list">
        {rows.map((x, i) => (
          <li key={x.day ?? i} className="frame">
            <div><b>{x.day}</b> <small className="muted">{tl`${x.players} 个存档 · 新玩家 ${x.new_players}`}</small></div>
            <small>{tl`全服金币 ${fmtNum(Math.round(Number(x.coins)))}${diff(i, 'coins')}`}</small>
            <small>{tl`物品总价值 ${fmtNum(Math.round(Number(x.item_value)))}${diff(i, 'item_value')}`}</small>
            <small>{tl`总经验 ${fmtNum(Math.round(Number(x.xp)))}${diff(i, 'xp')}`}</small>
            <small className="muted">{tl`GM 发金币 ${fmtNum(Math.round(Number(x.gm_coins)))} · 成交 ${x.trades} 笔（价值 ${fmtNum(Math.round(Number(x.trade_value)))}）· 兑换码 ${x.redeems} 次`}</small>
            {!!x.top?.length && (
              <small className="muted">{tl('涨得最多：')}{x.top.slice(0, 5).map((t) => tl`${t.name} #${t.pid} 经验 +${fmtNum(t.xp)} 金币 ${t.coins >= 0 ? '+' : ''}${fmtNum(t.coins)}`).join(tl('；'))}</small>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** 聊天敏感词（11-02）：一行一个，保存后马上生效；空着保存就恢复默认词表 */
function ChatWords() {
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => { online.chatWords().then((w) => setText(w.join('\n')), () => setText('')); }, []);
  const save = async () => {
    const words = (text ?? '').split(/[\n,，、]/).map((w) => w.trim()).filter(Boolean).slice(0, 500);
    try { await online.setFlag('chat_words', words.length ? words : false); setMsg({ text: tl('敏感词已保存'), ok: true }); if (!words.length) setText((await online.chatWords()).join('\n')); }
    catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };
  return (
    <>
      <h3>{tl('聊天敏感词')} <small className="muted">{tl('一行一个，所有频道都会换成 *；中间夹空格、点的也算。世界频道里的长串数字（QQ、手机号）和网址也会换掉')}</small></h3>
      <div className="gm-form frame">
        <textarea rows={6} value={text ?? ''} onChange={(e) => setText(e.target.value)} placeholder={tl('读取中…')} />
        <div className="gm-actions"><button className="primary" disabled={text == null} onClick={() => void save()}>{tl('保存')}</button></div>
        {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
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
/** 最后同步在这之内算在线（游戏每分钟同步一次） */
const ONLINE_MS = 3 * 60_000;
const DAY_MS = 86_400_000;
type PlayerFilter = 'all' | 'online' | 'today' | 'new' | 'flag' | 'banned';
const PLAYER_FILTERS: { id: PlayerFilter; name: string; test: (p: GmPlayer, now: number) => boolean }[] = [
  { id: 'all', name: tl('全部'), test: () => true },
  { id: 'online', name: tl('在线'), test: (p, now) => now - p.lastSeen < ONLINE_MS },
  { id: 'today', name: tl('今天来过'), test: (p, now) => now - p.lastSeen < DAY_MS },
  { id: 'new', name: tl('今天新注册'), test: (p, now) => now - p.joined < DAY_MS },
  { id: 'flag', name: tl('有可疑记录'), test: (p) => p.flags > 0 },
  { id: 'banned', name: tl('封禁 / 移出排行'), test: (p) => p.banned || p.hidden },
];
/** 复制文字：先用剪贴板接口，不行就用老办法 */
async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* 下面再试 */ }
  try {
    const el = document.createElement('textarea');
    el.value = t; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch { return false; }
}

function PlayersTab() {
  const [who, setWho] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [copied, setCopied] = useState<number | null>(null);
  const [rows, setRows] = useState<GmPlayer[] | null>(null);
  const [count, setCount] = useState<{ total: number; today: number; week: number } | null>(null);
  const [err, setErr] = useState('');
  const load = async (q = who) => {
    setRows(null); setErr('');
    try {
      const [r, c] = await Promise.all([online.gmPlayers(q, 500), online.gmPlayerCount()]);
      setRows(r); setCount(c);
    } catch (e) { setErr((e as Error).message); setRows([]); }
  };
  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const all = rows ?? [];
  const f = PLAYER_FILTERS.find((x) => x.id === filter)!;
  const list = all.filter((p) => f.test(p, now));
  const copy = async (pid: number) => {
    if (await copyText(String(pid))) { setCopied(pid); setTimeout(() => setCopied((c) => (c === pid ? null : c)), 1500); }
    else setErr(tl('复制失败，请手动选中复制'));
  };
  return (
    <>
      <h3>{tl('玩家')} <small className="muted">{tl('真人玩家（不含 AI），新注册的在前')}</small></h3>
      {count && <p className="gm-count">{tl`共 ${count.total} 人 · 今天新注册 ${count.today} · 7 天内 ${count.week}`}</p>}
      <div className="gm-form frame">
        <label><span>{tl('玩家')}</span><input value={who} placeholder={tl('数字 ID 或名字，空着看全部')} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void load()} /></label>
        <div className="gm-actions"><button className="primary" onClick={() => void load()}>{tl('搜索')}</button></div>
        <label><span>{tl('筛选')}</span>
          <span className="gm-seg">
            {PLAYER_FILTERS.map((x) => {
              const n = all.filter((p) => x.test(p, now)).length;
              return <button key={x.id} className={`pill ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)}>{x.name}{rows ? ` ${n}` : ''}</button>;
            })}
            <button className="pill" onClick={() => void load()}>{tl('刷新')}</button>
          </span>
        </label>
        {count && rows && count.total > rows.length && !who.trim() && <small className="muted">{tl`只读了最新注册的 ${rows.length} 人，筛选只在这些人里找；找老玩家请搜名字或 ID`}</small>}
        {err && <p className="warn">{err}</p>}
      </div>
      {rows == null ? <p className="muted">{tl('读取中…')}</p> : !list.length ? <p className="muted">{tl('没有玩家')}</p> : (
        <ul className="gm-list gm-players">
          {list.map((p) => (
            <li key={p.id} className="frame">
              <div>
                {now - p.lastSeen < ONLINE_MS && <i className="gm-online" title={tl('在线')} />}
                <b>{p.name}</b> <small className="muted">#{p.pid}</small>{p.guildTag && <small className="muted"> [{p.guildTag}]</small>}
                <button className="pill gm-copy" onClick={() => void copy(p.pid)}>{copied === p.pid ? tl('已复制') : tl('复制 UID')}</button>
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

/*
 * 装备来源（11-02）：服务器结算时记下的装备来历（core/prov.ts）。
 * 全服最近得到的传说、神话装备；查某个玩家：每件怎么来的（做了几次、干了多久、花了哪些材料、材料从哪来、概率），
 * 身上的传说以上装备和记录对不上的标「来源不明」。
 */
const CMD_SRC: Record<string, string> = {
  buyGoods: tl('商人购买'), buyKey: tl('商人购买'), buySeed: tl('商人购买'), claimMail: tl('领邮件'), openContainer: tl('开箱子 / 福袋'),
  realmChestDone: tl('冰原宝箱'), realmChest: tl('冰原宝箱'), harvestAll: tl('收菜'), tendPlot: tl('收菜'), collectHome: tl('家园收取'),
  deliverOrder: tl('家园订单'), repReward: tl('家园声望奖励'), salvage: tl('分解'), redeem: tl('兑换码'), combineShards: tl('合成碎片'),
  collectHorse: tl('畜牧'), unequip: tl('卸下装备'), hwSummon: tl('万圣节'), hwSkin: tl('万圣节'), hwMount: tl('万圣节'),
};
const CHEST_Q = [tl('绿'), tl('蓝'), tl('紫'), tl('金')];
function srcName(src: string): string {
  const [k, a = '', b = '', c = '0'] = src.split(':');
  if (k === 'craft' || k === 'skill') return actionName(a);
  if (k === 'drop') return tl`打${MONSTERS[a]?.name ?? a}`;
  if (k === 'outside') return tl('交易 / 公会仓库 / GM 改档');
  if (k === 'auto') return tl('离线结算中自动得到');
  if (k === 'cmd' && a === 'dungeonChest' && b) {
    const kind = b.startsWith('blue') ? tl('蓝洞') : tl('绿洞');
    return tl`副本宝箱（${kind} T${b.replace(/\D/g, '')}，${CHEST_Q[Number(c)] ?? ''}箱）`;
  }
  if (k === 'cmd') return CMD_SRC[a] ?? a;
  return src;
}
const pctText = (p: number) => `${p * 100 >= 10 ? (p * 100).toFixed(1) : p * 100 >= 1 ? (p * 100).toFixed(2) : (p * 100).toPrecision(2)}%`;
const qName = (id: string) => <b style={{ color: QUALITY_COLOR[qualityOf(id)] }}>{ITEMS[id]?.name ?? id}</b>;

/** 某种材料的来源占比（最多 4 个），depth 层内对「做出来的材料」再展开它用的材料 */
function MatSrc({ prov, item, depth }: { prov: Prov; item: string; depth: number }) {
  const r = prov.mats[item];
  const all = r ? Object.values(r).reduce((a, b) => a + b, 0) : 0;
  if (!r || !all) return <small className="warn"> {tl('（没有获得记录，可能是记录开始前就有的）')}</small>;
  const top = Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <ul className="gm-src">
      {top.map(([src, n]) => {
        const act = src.startsWith('skill:') ? ACTIONS[src.slice(6)] : undefined;
        const sub = depth > 0 && act && 'inputs' in act && act.inputs?.length ? act.inputs : null;
        return (
          <li key={src}>
            <small className={src === 'outside' ? 'warn' : ''}>{tl`${srcName(src)} ${pctText(n / all)}（${fmtNum(n)}）`}</small>
            {sub && sub.map((i) => <div key={i.item} className="gm-src-sub"><small className="muted">{tl`↳ ${itemLabel(i.item)}：`}</small><MatSrc prov={prov} item={i.item} depth={depth - 1} /></div>)}
          </li>
        );
      })}
    </ul>
  );
}

/** 一件传说以上装备的来历 */
function EvLine({ ev, prov }: { ev: ProvEv; prov?: Prov }) {
  const kind = ev.src.split(':')[0];
  const lucky = ev.p && ev.n ? 1 - Math.pow(1 - ev.p, ev.n) : undefined;
  return (
    <>
      <div>{qName(ev.id)} <small className="muted">{new Date(ev.t).toLocaleString()}</small></div>
      <small className={kind === 'outside' ? 'warn' : ''}>
        {kind === 'craft' ? tl('制作：') : kind === 'drop' ? tl('掉落：') : tl('来源：')}{srcName(ev.src)}
        {kind === 'outside' && tl('（不是自己做的或打的，去「交易记录」核对）')}
      </small>
      {kind === 'craft' && ev.n !== undefined && (
        <small>{tl`距上一件传说以上做了 ${fmtNum(ev.n)} 次，纯制作 ${fmtDuration(ev.ms ?? 0)}`}{ev.p !== undefined && tl`，这个品质每次 ${pctText(ev.p)}`}</small>
      )}
      {kind === 'drop' && ev.n !== undefined && (
        <small>{tl`距上一件传说以上打了 ${fmtNum(ev.n)} 只，战斗约 ${fmtDuration(ev.ms ?? 0)}`}{ev.p !== undefined && tl`，掉落概率每只 ${pctText(ev.p)}`}</small>
      )}
      {lucky !== undefined && <small className={lucky < 0.005 ? 'warn' : 'muted'}>{tl`这么多次内出一件的概率 ${pctText(lucky)}`}{lucky < 0.005 && tl('（运气极好，留意）')}</small>}
      {ev.cost && Object.keys(ev.cost).length > 0 && (
        <div className="gm-cost">
          <small>{tl('用掉的材料：')}</small>
          {Object.entries(ev.cost).map(([id, n]) => (
            <div key={id}><small><b>{itemLabel(id)} × {fmtNum(n)}</b>{prov ? tl('，来源：') : ''}</small>{prov && <MatSrc prov={prov} item={id} depth={1} />}</div>
          ))}
        </div>
      )}
    </>
  );
}

const qCount = (out: Record<string, number>) => {
  const q = [0, 0, 0, 0, 0, 0];
  for (const [id, n] of Object.entries(out)) q[qualityOf(id)] += n;
  return q.map((n, i) => (n && i >= 2 ? <span key={i} style={{ color: QUALITY_COLOR[i] }}> {QUALITY_NAME[i]} {fmtNum(n)}</span> : null));
};

function GearPlayer({ r }: { r: GearProvRow }) {
  const p = r.prov;
  const hi = Object.entries(r.held).filter(([id]) => qualityOf(id) >= PROV_EV_Q);
  if (!p) return (
    <li className="frame"><div><b>{r.name}</b> <small className="muted">#{r.pid}</small></div><small className="muted">{tl('还没有来源记录（这个玩家上线后由服务器开始记）')}</small></li>
  );
  const got = (id: string) => (p.base[id] ?? 0) + Object.values(p.craft).reduce((a, c) => a + (c.out[id] ?? 0), 0)
    + Object.values(p.drop).reduce((a, d) => a + (d.out[id] ?? 0), 0) + Object.values(p.other).reduce((a, o) => a + (o[id] ?? 0), 0);
  const crafts = Object.entries(p.craft).filter(([, c]) => Object.keys(c.out).length).sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  const drops = Object.entries(p.drop).filter(([, d]) => Object.keys(d.out).length).sort((a, b) => b[1].k - a[1].k).slice(0, 15);
  return (
    <li className="frame">
      <div><b>{r.name}</b> <small className="muted">#{r.pid} · {tl`从 ${new Date(p.since).toLocaleString()} 开始记录`}</small></div>
      <b>{tl('身上的传说以上装备')}</b>
      {!hi.length ? <small className="muted">{tl('没有')}</small> : hi.map(([id, n]) => {
        const lost = n - got(id);
        return (
          <small key={id}>{qName(id)} × {n}
            {(p.base[id] ?? 0) > 0 && <span className="muted"> {tl`（记录开始前就有 ${p.base[id]}）`}</span>}
            {lost > 0 && <b className="warn"> {tl`来源不明 ${lost} 件`}</b>}
          </small>
        );
      })}
      <b>{tl('传说以上装备的来历')} <small className="muted">{tl('最近的在前')}</small></b>
      {!p.ev.length ? <small className="muted">{tl('还没有')}</small> : (
        <ul className="gm-list">{[...p.ev].reverse().map((e, i) => <li key={i} className="frame"><EvLine ev={e} prov={p} /></li>)}</ul>
      )}
      <details>
        <summary>{tl('制作统计')}</summary>
        {crafts.map(([a, c]) => (
          <div key={a} className="gm-stat">
            <small><b>{actionName(a)}</b> {tl`做了 ${fmtNum(c.n)} 次`}{c.fail ? tl`（失败 ${c.fail}）` : ''} · {fmtDuration(c.ms ?? 0)}{qCount(c.out)}</small>
            <small className="muted">{tl('用掉：')}{Object.entries(c.in).map(([id, n]) => `${itemLabel(id)} × ${fmtNum(n)}`).join(tl('、')) || '—'}</small>
          </div>
        ))}
      </details>
      <details>
        <summary>{tl('掉落统计')}</summary>
        {drops.map(([m, d]) => (
          <div key={m} className="gm-stat"><small><b>{MONSTERS[m]?.name ?? m}</b> {tl`打了 ${fmtNum(d.k)} 只`} · {fmtDuration(d.ms ?? 0)}{qCount(d.out)}</small></div>
        ))}
      </details>
      {Object.keys(p.other).length > 0 && (
        <details>
          <summary>{tl('其他来源的装备')}</summary>
          {Object.entries(p.other).map(([src, o]) => <div key={src}><small className={src === 'outside' ? 'warn' : ''}><b>{srcName(src)}</b>{tl`：${itemsText(o)}`}</small></div>)}
        </details>
      )}
    </li>
  );
}

function GearSrcTab() {
  const [who, setWho] = useState('');
  const [recent, setRecent] = useState<GearEvRow[] | null>(null);
  const [rows, setRows] = useState<GearProvRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    online.gmGearRecent().then(setRecent).catch((e) => { setErr((e as Error).message); setRecent([]); });
  }, []);
  const search = async () => {
    if (!who.trim()) return setRows(null);
    setRows([]); setErr('');
    try { setRows(await online.gmGear(who)); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <>
      <h3>{tl('装备来源')} <small className="muted">{tl('服务器结算时记下的：传说、神话装备逐件记来历')}</small></h3>
      <div className="gm-form frame">
        <label><span>{tl('玩家')}</span><input value={who} placeholder={tl('数字 ID 或名字')} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} /></label>
        <div className="gm-actions"><button className="primary" onClick={() => void search()}>{tl('查询')}</button>{rows && <button onClick={() => { setRows(null); setWho(''); }}>{tl('返回全服')}</button>}</div>
        {err && <p className="warn">{err}</p>}
      </div>
      {rows ? (!rows.length ? <p className="muted">{tl('没找到这个玩家')}</p> : <ul className="gm-list">{rows.map((r) => <GearPlayer key={r.playerId} r={r} />)}</ul>) : (
        <>
          <h4>{tl('全服最近得到的传说、神话装备')}</h4>
          {recent == null ? <p className="muted">{tl('读取中…')}</p> : !recent.length ? <p className="muted">{tl('还没有')}</p> : (
            <ul className="gm-list">
              {recent.map((r, i) => (
                <li key={i} className="frame">
                  <div><b className="link" onClick={() => { setWho(String(r.pid)); void online.gmGear(String(r.pid)).then(setRows); }}>{r.name}</b> <small className="muted">#{r.pid}</small></div>
                  <EvLine ev={r.ev} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** GM 改技能等级（用户 11-02）：填 UID 读出各技能等级，改完一起保存，服务器直接改存档里的经验 */
const GM_LV_MAX = 200;
function SkillTab() {
  const [pid, setPid] = useState('');
  const [who, setWho] = useState<{ pid: number; name: string; xp: Record<string, number> } | null>(null);
  const [lv, setLv] = useState<Record<string, string>>({});
  const [all, setAll] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = (Object.keys(SKILLS) as SkillId[]).filter((k) => !SKILLS[k].soon);
  const cur = (k: string) => levelForXp(who?.xp[k] ?? 0);

  const load = async (n = Number(pid)) => {
    if (!(Number.isInteger(n) && n > 0)) return setMsg({ text: tl('填玩家的数字 UID'), ok: false });
    setBusy(true);
    try {
      const r = await online.gmGetSkills(n);
      setWho({ pid: n, ...r });
      setLv(Object.fromEntries(ids.map((k) => [k, String(levelForXp(r.xp[k] ?? 0))])));
      setMsg(null);
    } catch (e) { setWho(null); setMsg({ text: (e as Error).message, ok: false }); }
    setBusy(false);
  };

  const want = (k: string) => Math.floor(Number(lv[k]));
  const okLv = (n: number) => Number.isInteger(n) && n >= 1 && n <= GM_LV_MAX;
  const changed = who ? ids.filter((k) => okLv(want(k)) && want(k) !== cur(k)) : [];
  const badLv = who ? ids.some((k) => !okLv(want(k))) : false;

  const save = async () => {
    if (!who || !changed.length) return;
    const list = changed.map((k) => tl`${SKILLS[k].name} ${cur(k)} → ${want(k)}`).join('\n');
    if (!confirm(tl`修改 ${who.name}（UID ${who.pid}）的技能等级？\n${list}`)) return;
    setBusy(true);
    try {
      const n = await online.gmSetSkills(who.pid, Object.fromEntries(changed.map((k) => [k, XP_TABLE[want(k)]])));
      await load(who.pid);
      setMsg({ text: tl`已修改 ${n} 个技能。玩家在线的话一分钟内同步到，排行榜在玩家下次同步后更新`, ok: true });
    } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
    setBusy(false);
  };

  return (
    <>
      <h3>{tl('技能等级')} <small className="muted">{tl('直接改玩家存档里的技能经验，改成某一级的起点经验')}</small></h3>
      <div className="gm-form frame">
        <label><span>UID</span>
          <span className="gm-seg">
            <input inputMode="numeric" placeholder={tl('玩家 UID，如 10000002')} value={pid} onChange={(e) => setPid(e.target.value.replace(/\D/g, '').slice(0, 9))} onKeyDown={(e) => e.key === 'Enter' && void load()} />
            <button className="pill" disabled={busy} onClick={() => void load()}>{tl('读取')}</button>
          </span>
        </label>
        {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
      </div>
      {who && (
        <>
          <h3>{tl`${who.name}（UID ${who.pid}）`}</h3>
          <div className="gm-form frame">
            <label><span>{tl('全部')}</span>
              <span className="gm-seg">
                <input inputMode="numeric" placeholder={tl('把所有技能设成同一级')} value={all} onChange={(e) => setAll(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                <button className="pill" disabled={!okLv(Number(all))} onClick={() => setLv(Object.fromEntries(ids.map((k) => [k, all])))}>{tl('填入')}</button>
                {[1, 10, 50, 99].map((n) => <button key={n} className="pill" onClick={() => setLv(Object.fromEntries(ids.map((k) => [k, String(n)])))}>{tl`${n} 级`}</button>)}
                <button className="pill" onClick={() => setLv(Object.fromEntries(ids.map((k) => [k, String(cur(k))])))}>{tl('还原')}</button>
              </span>
            </label>
            <ul className="gm-skills">
              {ids.map((k) => {
                const n = want(k), diff = okLv(n) && n !== cur(k);
                return (
                  <li key={k} className={diff ? 'on' : ''}>
                    <SkillIcon skill={k} size={18} />
                    <span>{SKILLS[k].name}</span>
                    <small className="muted">{tl`现在 ${cur(k)} 级`}</small>
                    <button className="pill" onClick={() => setLv({ ...lv, [k]: String(Math.max(1, (okLv(n) ? n : cur(k)) - 1)) })}>−</button>
                    <input inputMode="numeric" className={okLv(n) ? '' : 'bad'} value={lv[k] ?? ''} onChange={(e) => setLv({ ...lv, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    <button className="pill" onClick={() => setLv({ ...lv, [k]: String(Math.min(GM_LV_MAX, (okLv(n) ? n : cur(k)) + 1)) })}>+</button>
                  </li>
                );
              })}
            </ul>
            {badLv && <p className="warn">{tl`等级要在 1-${GM_LV_MAX} 之间`}</p>}
            <div className="gm-actions">
              <button className="primary" disabled={busy || badLv || !changed.length} onClick={() => void save()}>{changed.length ? tl`保存 ${changed.length} 个技能` : tl('没有改动')}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
