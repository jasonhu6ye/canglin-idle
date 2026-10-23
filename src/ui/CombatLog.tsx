import { useState, type ReactNode } from 'react';
import { ACTIONS, CROP_DEFS, ITEMS, MONSTERS, SKILLS } from '../core/data';
import type { CombatLogEntry, SkillId } from '../core/types';
import { store, useGame } from '../store';
import { MonsterIcon } from './Bestiary';
import { fmtNum } from './format';
import { Icon, SkillIcon } from './icons';

/**
 * 日志（用户 10-23 要求）：固定在左下角的小窗，可以展开、收起；高度不变，翻页看。
 * 记录战斗每只怪的掉落和经验、阵亡，采集制作每一次的产出和经验；另有「统计」页汇总。
 * 点击击杀统计或按 L 展开。
 */
type Fn = () => void;
const fns = new Set<Fn>();
export const openCombatLog = () => fns.forEach((f) => f());
export const onOpenCombatLog = (f: Fn) => {
  fns.add(f);
  return () => { fns.delete(f); };
};

const PAGE = 6;

const clock = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

type View = 'all' | 'fight' | 'work' | 'stats';
const VIEWS: [View, string][] = [['all', '全部'], ['fight', '战斗'], ['work', '采集制作'], ['stats', '统计']];
type StatTab = 'xp' | 'items' | 'kills' | 'work';
const STAT_TABS: [StatTab, string][] = [['xp', '经验'], ['items', '物品'], ['kills', '击杀'], ['work', '采集制作']];
const isFight = (e: CombatLogEntry) => e.kind === 'kill' || e.kind === 'death';

/** 翻页条 */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  return (
    <div className="log-pager">
      <button disabled={page <= 0} onClick={() => onPage(0)} title="最新一页">«</button>
      <button disabled={page <= 0} onClick={() => onPage(page - 1)}>‹ 上一页</button>
      <span>{page + 1} / {pages}</span>
      <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>下一页 ›</button>
      <button disabled={page >= pages - 1} onClick={() => onPage(pages - 1)} title="最早一页">»</button>
    </div>
  );
}

export function CombatLog({ onClose }: { onClose: () => void }) {
  useGame();
  const [view, setView] = useState<View>('all');
  const [stat, setStat] = useState<StatTab>('xp');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const all = store.combatLog;

  let body: ReactNode;
  let pages: number;
  if (view === 'stats') {
    const rows = statRows(all, stat);
    pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const p = Math.min(page, pages - 1);
    const span = all.length > 1 ? all[all.length - 1].t - all[0].t : 0;
    body = (
      <>
        <div className="log-subtabs">
          {STAT_TABS.map(([id, name]) => <button key={id} className={stat === id ? 'on' : ''} onClick={() => { setStat(id); setPage(0); }}>{name}</button>)}
        </div>
        <ul className="log-list stats">
          {rows.length === 0 && <li className="muted">还没有记录</li>}
          {rows.slice(p * PAGE, p * PAGE + PAGE).map((r) => (
            <li key={r.key}>
              <span className="with-icon log-what">{r.icon} {r.name}</span>
              <b>{r.value}</b>
              {span > 60_000 && <small className="muted">约 {fmtNum(Math.round(r.rate / (span / 3_600_000)))}/小时</small>}
            </li>
          ))}
        </ul>
        <p className="log-foot muted">统计最近 {all.length} 条记录{span > 0 ? `（${clock(all[0].t)} 起）` : ''}</p>
      </>
    );
  } else {
    const list = all.filter((e) => view === 'all' || (view === 'fight' ? isFight(e) : !isFight(e))).slice().reverse();
    pages = Math.max(1, Math.ceil(list.length / PAGE));
    const p = Math.min(page, pages - 1);
    body = (
      <>
        <ul className="log-list">
          {list.length === 0 && <li className="muted">还没有记录。去打怪或者采集吧！</li>}
          {list.slice(p * PAGE, p * PAGE + PAGE).map((e, i) => <Entry key={`${e.t}-${i}`} e={e} />)}
        </ul>
        <p className="log-foot">
          {all.length > 0 && (confirm
            ? <><button className="danger" onClick={() => { store.clearLog(); setConfirm(false); }}>确定清空</button> <button onClick={() => setConfirm(false)}>取消</button></>
            : <button className="link" onClick={() => setConfirm(true)}>清空日志</button>)}
        </p>
      </>
    );
  }
  return (
    <div className="log-dock frame">
      <div className="log-head">
        <b className="gold">日志</b>
        <span className="log-tabs">
          {VIEWS.map(([id, name]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => { setView(id); setPage(0); }}>{name}</button>)}
        </span>
        <button className="fold" onClick={onClose} title="收起 (L)">收起 ▾</button>
      </div>
      <div className="log-body">{body}</div>
      <Pager page={Math.min(page, pages - 1)} pages={pages} onPage={setPage} />
    </div>
  );
}

interface StatRow { key: string; icon: ReactNode; name: string; value: string; rate: number; sort: number }

/** 统计页的行：按数量从多到少 */
function statRows(all: CombatLogEntry[], tab: StatTab): StatRow[] {
  const rows: StatRow[] = [];
  if (tab === 'xp') {
    const xp: Partial<Record<SkillId, number>> = {};
    for (const e of all) for (const [k, v] of Object.entries(e.xp) as [SkillId, number][]) xp[k] = (xp[k] ?? 0) + v;
    for (const [k, v] of Object.entries(xp) as [SkillId, number][]) {
      rows.push({ key: k, icon: <SkillIcon skill={k} size={16} />, name: SKILLS[k].name, value: `+${fmtNum(v)} 经验`, rate: v, sort: v });
    }
  } else if (tab === 'items') {
    const items: Record<string, number> = {};
    for (const e of all) for (const [k, v] of Object.entries(e.items)) items[k] = (items[k] ?? 0) + v;
    for (const [id, q] of Object.entries(items)) {
      if (!ITEMS[id] || q <= 0) continue;
      rows.push({ key: id, icon: <Icon item={id} size={16} />, name: ITEMS[id].name, value: `×${fmtNum(q)}`, rate: q, sort: q });
    }
  } else if (tab === 'kills') {
    const n: Record<string, { k: number; d: number }> = {};
    for (const e of all) {
      if (!isFight(e) || !e.monster) continue;
      const r = (n[e.monster] ??= { k: 0, d: 0 });
      if (e.kind === 'kill') r.k++;
      else r.d++;
    }
    for (const [id, r] of Object.entries(n)) {
      const m = MONSTERS[id];
      if (!m) continue;
      rows.push({ key: id, icon: <MonsterIcon m={m} size={16} />, name: m.name, value: `击败 ${r.k}${r.d ? ` · 阵亡 ${r.d}` : ''}`, rate: r.k, sort: r.k + r.d });
    }
  } else {
    const n: Record<string, { ok: number; fail: number }> = {};
    for (const e of all) {
      const key = e.crop ? `crop:${e.crop}` : e.action;
      if (isFight(e) || !key) continue;
      const r = (n[key] ??= { ok: 0, fail: 0 });
      if (e.kind === 'fail') r.fail++;
      else r.ok += e.n ?? 1;
    }
    for (const [id, r] of Object.entries(n)) {
      const crop = id.startsWith('crop:') ? CROP_DEFS[id.slice(5)] : undefined;
      if (crop) {
        rows.push({ key: id, icon: <SkillIcon skill="farming" size={16} />, name: `收获${crop.name}`, value: `${r.ok} 格`, rate: r.ok, sort: r.ok });
        continue;
      }
      const a = ACTIONS[id];
      if (!a || a.kind !== 'skill') continue;
      rows.push({ key: id, icon: <SkillIcon skill={a.skill} size={16} />, name: a.name, value: `${r.ok} 次${r.fail ? ` · 失手 ${r.fail}` : ''}`, rate: r.ok, sort: r.ok + r.fail });
    }
  }
  return rows.sort((a, b) => b.sort - a.sort);
}

/** 一条记录的收获：经验写字，物品用小图标 */
function Gains({ e }: { e: CombatLogEntry }) {
  const xp = Object.entries(e.xp) as [SkillId, number][];
  const items = Object.entries(e.items).filter(([id]) => ITEMS[id]);
  return (
    <span className="log-gain">
      {xp.map(([k, v]) => <span key={k} style={{ color: SKILLS[k].color }}>{SKILLS[k].name}+{fmtNum(v)}</span>)}
      {items.map(([id, q]) => <span key={id} className="log-item" title={ITEMS[id].name}><Icon item={id} size={14} />{q > 1 ? `×${q}` : ''}</span>)}
    </span>
  );
}

function Entry({ e }: { e: CombatLogEntry }) {
  if (e.crop) {
    const c = CROP_DEFS[e.crop];
    if (!c) return null;
    return (
      <li className="work">
        <time>{clock(e.t)}</time>
        <span className="with-icon log-what"><SkillIcon skill="farming" size={14} /> 收获{c.name}{(e.n ?? 1) > 1 && ` ${e.n} 格`}{e.auto && <em className="muted"> 自动</em>}</span>
        <Gains e={e} />
      </li>
    );
  }
  if (e.kind === 'skill' || e.kind === 'fail') {
    const a = ACTIONS[e.action ?? ''];
    if (!a || a.kind !== 'skill') return null;
    return (
      <li className={e.kind === 'fail' ? 'fail' : 'work'}>
        <time>{clock(e.t)}</time>
        <span className="with-icon log-what"><SkillIcon skill={a.skill} size={14} /> {a.name}{e.kind === 'fail' && <em className="warn"> 失手</em>}</span>
        <Gains e={e} />
      </li>
    );
  }
  const m = MONSTERS[e.monster ?? ''];
  if (!m) return null;
  const rank = m.rank === 'boss' ? '首领 ' : m.rank === 'elite' ? '精英 ' : '';
  if (e.kind === 'death') {
    return (
      <li className="death">
        <time>{clock(e.t)}</time>
        <span className="with-icon log-what"><MonsterIcon m={m} size={14} /> 被 {rank}{m.name} 击败，回城复活</span>
      </li>
    );
  }
  return (
    <li>
      <time>{clock(e.t)}</time>
      <span className="with-icon log-what"><MonsterIcon m={m} size={14} /> 击败 <b className={m.rank !== 'normal' ? 'gold' : ''}>{rank}{m.name}</b></span>
      <Gains e={e} />
    </li>
  );
}
