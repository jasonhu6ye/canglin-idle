import { useState, type ReactNode } from 'react';
import { ACTIONS, ITEMS, MONSTERS, nodeOfAction, NODES, SKILLS } from '../core/data';
import { QUESTS, questProgress, questText } from '../core/quests';
import { actionDuration, beltSlotOf, combatEstimate, combatLevel, dismissStop, enqueue, rainBonus, isBankId, level, maxHp, moveSpeed, removeTask, resumeWork, toggleMount, weaponStyle } from '../core/sim';
import { jumpTo, producerOf } from './ActionSheet';
import { openNodeSheet } from './itemOpen';
import { openCombatLog } from './CombatLog';
import type { GameState, SkillId, TaskEndReason } from '../core/types';
import { HERO_PAD, HERO_W, outfitOf, paintHeroSheet } from '../game/hero';
import { store } from '../store';
import { emitToGame } from './GameCanvas';
import { actionName, fmtNum, modeLabel } from './format';
import { mountIconUrl, SkillIcon, TplIcon } from './icons';
import { tl } from '../i18n';
import { MailButton } from './Mailbox';

/** 顶栏头像：取当前外观正面站立帧的上半身 */
const portraits = new Map<string, string>();
/**
 * 每小时击杀数（用户 10-25 要求替换总击杀）：按日志里最近一小时的击杀实测；
 * 刚开打击杀太少算不准时，正在打怪就用战前评估，不在打怪显示 0。
 */
function killsPerHour(s: GameState): string {
  const now = Date.now();
  const kills = store.combatLog.filter((e) => e.kind === 'kill' && now - e.t < 3_600_000);
  if (kills.length >= 3) {
    const span = Math.max(kills[kills.length - 1].t - kills[0].t, 1);
    // n 只之间有 n-1 段间隔
    return fmtNum(Math.round(((kills.length - 1) / span) * 3_600_000));
  }
  const a = s.queue[0] && ACTIONS[s.queue[0].action];
  if (a?.kind === 'combat') return tl`约 ${fmtNum(Math.round(combatEstimate(s, MONSTERS[a.monster]).perHour))}`;
  return '0';
}

export function portrait(skin?: string): string {
  const o = outfitOf(skin);
  let url = portraits.get(o.id);
  if (!url) {
    const sheet = paintHeroSheet(o);
    const f = sheet.frames.find((x) => x.name === 'idle-down-0')!;
    const c = document.createElement('canvas');
    c.width = c.height = HERO_W;
    c.getContext('2d')!.drawImage(sheet.canvas, f.x + HERO_PAD.l, f.y + HERO_PAD.t, HERO_W, HERO_W, 0, 0, HERO_W, HERO_W);
    url = c.toDataURL();
    portraits.set(o.id, url);
  }
  return url;
}

export function TopBar({ s }: { s: GameState }) {
  const total = (Object.keys(SKILLS) as SkillId[]).reduce((n, k) => n + level(s, k), 0);
  const hpPct = (s.hp / maxHp(s)) * 100;
  return (
    <header className="topbar">
      <span className="avatar"><img src={portrait(s.settings.skin)} alt="" /></span>
      <span className="stat" title={tl("战斗等级 / 总等级")}><SkillIcon skill="melee" size={16} /> {combatLevel(s)} <small className="muted">/ {total}</small></span>
      <span className="hp" title={tl("生命")}>
        <SkillIcon skill="hitpoints" size={16} /> <span className="bar"><i style={{ width: `${hpPct}%` }} /></span> {s.hp}
      </span>
      <span className="coins" title={tl("金币")}><TplIcon tpl="coins" tint="#f0c850" size={16} /> {fmtNum(s.bank.coins ?? 0)}</span>
      <MailButton s={s} />
    </header>
  );
}

/** 打首领时屏幕上方常驻的大血条，名字写在血条上面（用户 10-23 要求） */
export function BossBar({ s }: { s: GameState }) {
  const a = s.queue[0] ? ACTIONS[s.queue[0].action] : undefined;
  if (a?.kind !== 'combat' || !s.combat || s.travel || s.walk) return null;
  const m = MONSTERS[a.monster];
  if (m.rank !== 'boss') return null;
  const hp = s.combat.respawnMs > 0 ? 0 : Math.max(0, s.combat.monsterHp);
  const pct = (hp / m.hp) * 100;
  return (
    <div className="boss-bar">
      <div className="name"><small>{m.event ? tl('万圣节限定') : m.world ? tl('世界首领') : tl('首领')}</small>{m.name}<span>Lv{m.level}</span></div>
      <div className="track"><i className="trail" style={{ width: `${pct}%` }} /><i className="fill" style={{ width: `${pct}%` }} />
      <div className="num">{s.combat.respawnMs > 0 ? tl`重新出现中… ${Math.ceil(s.combat.respawnMs / 1000)} 秒` : `${Math.ceil(hp)} / ${m.hp}`}</div></div>
    </div>
  );
}

export function QueuePanel({ s }: { s: GameState }) {
  if (!s.queue.length) {
    return <div className="panel queue idle">{tl('空闲中——点地图上的地点选个任务')}</div>;
  }
  return (
    <div className="panel queue">
      {s.queue.map((t, i) => (
        <div key={i} className="queue-row">
          <span>
            {i > 0 && tl('然后 ')}
            {actionName(t.action)} {modeLabel(t.mode)}
            {t.mode.type === 'count' && i === 0 && <em> ({t.done}/{t.mode.count})</em>}
          </span>
          <button className="x" onClick={() => store.dispatch((g) => removeTask(g, i))} aria-label={tl("移除")}>✕</button>
        </div>
      ))}
    </div>
  );
}

/** 任务停下的原因，用一句玩家看得懂的话说（顶部提示条和离线总结共用） */
export function stopText(reason: TaskEndReason, action: string, item?: string): string {
  const a = ACTIONS[action];
  const name = actionName(action);
  switch (reason) {
    case 'noInput': return tl`${name}停了：材料不够${item && ITEMS[item] ? tl`，缺${ITEMS[item].name}` : ''}（背包和仓库都没有了）`;
    case 'level': return tl`${name}停了：${a?.kind === 'skill' ? tl`${SKILLS[a.skill].name}要 ${a.level} 级` : tl('等级不够')}`;
    case 'death': return tl`${name}停了：连续阵亡 3 次。换更好的装备、食物栏放上食物，或者换只弱一点的怪`;
    case 'noAmmo': return tl`${name}停了：弹药用完了，背包和仓库都没有`;
    case 'summon': return tl`${name}停了：南瓜王不在，要先去万圣节活动祭坛召唤`;
    default: return tl`${name}做完了，队列空了，角色在发呆`;
  }
}

/** 顶部提示条：任务为什么停了，附一个能直接补救的按钮（用户 10-23） */
function StopChip({ s }: { s: GameState }) {
  const st = s.lastStop;
  if (!st || !ACTIONS[st.action]) return null;
  const src = st.reason === 'noInput' && st.item ? producerOf(s, st.item) : undefined;
  const node = nodeOfAction(st.action, s.loc, s.waystones, moveSpeed(s));
  const again = () => store.dispatch((g) => enqueue(g, st.action, st.mode));
  return (
    <div className={`chip stop-chip ${st.reason === 'complete' ? '' : 'bad'}`}>
      <b>{st.reason === 'complete' ? tl('空闲') : tl('停了')}</b> · {stopText(st.reason, st.action, st.item)}
      {src && <button className="pill on" onClick={() => jumpTo(src.action, src.node)}>{tl`去做${ITEMS[st.item!].name} ›`}</button>}
      {(st.reason === 'complete' || st.reason === 'death') && <button className="pill on" onClick={again}>{st.reason === 'complete' ? tl('再来一轮') : tl('再试一次')}</button>}
      {node && st.reason !== 'noInput' && <button className="pill" onClick={() => openNodeSheet(node.id)}>{tl('换个任务')}</button>}
      <button className="pill" title={tl("关掉提示")} onClick={() => store.dispatch(dismissStop)}>×</button>
    </div>
  );
}

export function StatusChips({ s, extra, log, chat }: { s: GameState; extra?: ReactNode; log?: ReactNode; chat?: ReactNode }) {
  const task = s.queue[0];
  const a = task && ACTIONS[task.action];
  let body = null;
  if (task && s.paused) {
    body = (
      <>
        <b style={{ color: '#9aa0a8' }}>{tl('已暂停')}</b>{tl` · 你离开了${actionName(task.action)}的地点`}<button className="pill on" onClick={() => store.dispatch(resumeWork)}>{tl('继续工作')}</button>
      </>
    );
  } else if (s.travel) {
    const n = NODES.find((x) => x.id === s.travel!.to);
    const pct = (1 - s.travel.ms / s.travel.total) * 100;
    const t0 = s.queue[0];
    const supply = isBankId(s.travel.to) && t0 && ACTIONS[t0.action]?.kind === 'combat' && !t0.stocked;
    body = (
      <>
        <b style={{ color: '#e8b84a' }}>{supply ? tl('补给') : isBankId(s.travel.to) ? tl('背包满了') : tl('寻路中')}</b>{tl` · ${supply ? tl('回仓库拿食物') : isBankId(s.travel.to) ? tl('回仓库存东西') : tl`前往${n?.name}`} · 还要 ${Math.ceil(s.travel.ms / 1000)} 秒`}<span className="bar wide"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  } else if (a?.kind === 'skill') {
    const pct = (Math.max(0, s.progressMs) / actionDuration(s, a)) * 100;
    body = (
      <>
        <SkillIcon skill={a.skill} size={14} /> <b style={{ color: SKILLS[a.skill].color }}>{SKILLS[a.skill].name}</b> · {a.name}
        {rainBonus(s, a) > 0 && <em className="rain-buff" title={tl("钓点在下雨，鱼更容易上钩")}>{tl` 雨天钓鱼 +${Math.round(rainBonus(s, a) * 100)}%`}</em>}
        {s.progressMs < 0 && <em>{tl(' 晕眩中')}</em>}
        <span className="bar wide"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  } else if (a?.kind === 'combat') {
    const m = MONSTERS[a.monster];
    const hp = s.combat?.monsterHp ?? m.hp;
    const style = weaponStyle(s);
    const respawn = s.combat?.respawnMs ?? 0;
    const max = maxHp(s);
    const me = Math.max(0, s.hp) / max;
    // 背包和食物栏里还剩多少能吃的
    const food = Object.entries(s.bag).reduce((n, [id, q]) => n + (ITEMS[id]?.heals && beltSlotOf(id) === 'food' ? q : 0), 0) + (s.belt?.food?.qty ?? 0);
    const est = combatEstimate(s, m);
    body = (
      <>
        <SkillIcon skill={style} size={14} /> <b style={{ color: SKILLS[style].color }}>{SKILLS[style].name}</b> · {m.name}
        <span className="bar wide foe"><i style={{ width: `${respawn ? 0 : (Math.max(0, hp) / m.hp) * 100}%` }} /></span>
        {respawn ? <em>{tl`下一只 ${Math.ceil(respawn / 1000)} 秒后出现`}</em> : <em>{Math.max(0, hp)}/{m.hp}</em>}
        <span className="fight-me">
          <b>{tl('你')}</b>
          <span className={`bar me ${me < 0.3 ? 'low' : me < 0.6 ? 'mid' : ''}`}><i style={{ width: `${me * 100}%` }} /></span>
          <em>{Math.max(0, s.hp)}/{max}</em>
          <span className={food ? '' : 'warn'}>{tl`食物 ${fmtNum(food)}`}</span>
          <span className="muted">{tl`约 ${fmtNum(Math.round(est.perHour))} 只/时`}</span>
        </span>
        {!food && me < 0.4 && <em className="warn">{tl(' 没有食物了，血量偏低，小心阵亡')}</em>}
      </>
    );
  }
  return (
    <div className="chips">
      {extra}
      {(!task || s.lastStop?.reason !== 'complete') && <StopChip s={s} />}
      {body && <div className="chip">{body}</div>}
      {log || <button className="chip dim log-chip" title={tl("日志 (L)")} onClick={openCombatLog}>{tl`⚔ 每小时击杀 ${killsPerHour(s)} · 阵亡 ${s.stats.deaths} · `}<u>{tl('展开日志 ▸')}</u></button>}
      {chat}
    </div>
  );
}

export function MapButtons({ s, onWorldMap }: { s: GameState; onWorldMap: () => void }) {
  const mount = s.equipment.mount;
  return (
    <div className="map-buttons">
      {mount && (
        <button className={`mount-btn ${s.mounted ? 'on' : ''}`} title={s.mounted ? tl('下坐骑 (R)') : tl('骑乘 (R)')} onClick={() => store.dispatch((g) => toggleMount(g))}>
          <img src={mountIconUrl(mount)} width={30} height={30} alt="" draggable={false} />
          <small>{s.mounted ? tl('下骑') : tl('骑乘')}</small>
        </button>
      )}
      <button onClick={onWorldMap} title={tl("世界地图")}>▦</button>
      <button onClick={() => emitToGame('zoom', 0.5)}>{tl('＋')}</button>
      <button onClick={() => emitToGame('zoom', -0.5)}>{tl('－')}</button>
      <button onClick={() => emitToGame('recenter')} title={tl("回到角色")}>◎</button>
    </div>
  );
}


/** 新手任务卡片：当前目标、进度、去做；可以收起成一行（用户 10-23） */
export function QuestCard({ s, onGo }: { s: GameState; onGo: (nodeId: string) => void }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('canglin-quest-fold') !== '1'; } catch { return true; }
  });
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem('canglin-quest-fold', open ? '1' : '0'); } catch { /* 存不了就算了 */ }
  };
  const p = questProgress(s);
  if (!p) return null;
  const node = NODES.find((n) => n.id === p.q.hint) ?? nodeOfAction(p.q.hint, s.loc, s.waystones, moveSpeed(s));
  const idx = (s.quest?.i ?? 0) + 1;
  return (
    <div className={`chip quest ${open ? '' : 'folded'}`}>
      <button className="fold" title={open ? tl('收起') : tl('展开')} onClick={toggle}>{open ? '▾' : '▸'}</button>
      <b className="gold">{tl`新手任务 ${idx}/${QUESTS.length}`}</b> {questText(p.q)}
      {open && <span className="muted"> {tl`${p.have}/${p.q.goal.n} · 奖励 ${p.q.reward} 金币`}</span>}
      {!open && <span className="muted"> {p.have}/{p.q.goal.n}</span>}
      {node && <button className="pill" onClick={() => {
        // 提示是个动作就直接选中它，打开页面点「立即开始」就行
        if (ACTIONS[p.q.hint]) store.focusAction = p.q.hint;
        onGo(node.id);
      }}>{tl('去做')}</button>}
      {open && <div className="quest-tip">💡 {p.q.tip}</div>}
    </div>
  );
}
