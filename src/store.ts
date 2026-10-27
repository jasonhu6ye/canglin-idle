import { leaveHome } from './core/home';
import { useSyncExternalStore } from 'react';
import { nodeOfAction } from './core/data';
import { advance, LOG_CAP, mergeSummary, migrate, moveSpeed, newGame, walkPos } from './core/sim';
import { stepMail } from './core/mail';
import type { CombatLogEntry, GameState, Summary } from './core/types';

const SAVE_KEY = 'canglin-idle-save-v1';
/** 本机备份（10-27）：每 10 分钟另存一份，主存档读不出来时用它，不至于整个档没了 */
const BACKUP_KEY = 'canglin-idle-save-bak';
const BACKUP_EVERY_MS = 10 * 60_000;
const LOG_KEY = 'canglin-combat-log';
const TICK_MS = 200;
const SAVE_EVERY_MS = 5000;
/** 离开超过这么久才弹「离线收获」 */
const OFFLINE_POPUP_MS = 60_000;
/** 同时开了两个页面时，只有最后打开的那个能存档（不然两边互相覆盖，进度会倒退） */
const OWNER_KEY = 'canglin-active-tab';
const TAB_ID = Math.random().toString(36).slice(2);

type Listener = () => void;
type GainListener = (summary: Summary) => void;

function parse(raw: string | null): GameState | null {
  try {
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = parse(raw);
    if (s) return s;
    // 读不出来的旧存档先另存一份，再用备份；备份也没有才开新档
    if (raw) localStorage.setItem(`${SAVE_KEY}-broken-${Date.now()}`, raw);
    const bak = parse(localStorage.getItem(BACKUP_KEY));
    if (bak) return bak;
  } catch {
    // 无法访问 localStorage（隐私模式等）时开新档
  }
  return newGame(Date.now());
}

class Store {
  state: GameState;
  offline: Summary | null = null;
  private listeners = new Set<Listener>();
  private gainListeners = new Set<GainListener>();
  private lastSave = 0;
  private lastBackup = Date.now();
  /**
   * 离线收获（10-27 修）：切到后台、锁屏期间分几次结算的收获合在一起，回来时弹一个窗。
   * 以前手机切回来时，定时器可能比「切回前台」事件先跑，整段离线收益被当成普通结算吞掉，不弹窗，看起来像离线没收益
   */
  private away: Summary | null = null;
  private hiddenAt = 0;
  /** 战斗日志：最近的击杀和阵亡，存在本地，不进存档 */
  combatLog: CombatLogEntry[] = (() => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as CombatLogEntry[]; } catch { return []; }
  })();

  private absorb(summary: Summary, byUser = false) {
    // 点按钮时顺带结算了很久（刚切回来先点了东西）：一样弹离线收获
    if (byUser && summary.elapsedMs >= OFFLINE_POPUP_MS) {
      this.offline = this.offline ? mergeSummary(this.offline, summary) : summary;
      this.away = null;
    }
    if (!summary.log?.length) return;
    this.combatLog = [...this.combatLog, ...summary.log].slice(-LOG_CAP);
    this.logDirty = true;
  }
  private logDirty = false;

  clearLog() {
    this.combatLog = [];
    this.logDirty = true;
    this.save();
    this.emit();
  }

  /** 游戏在另一个页面（tab）或另一台设备（device）上开着：这边停下，不再存档 */
  inactive = false;
  inactiveWhy: 'tab' | 'device' = 'tab';
  stop(why: 'tab' | 'device') {
    if (this.inactive) return;
    this.inactive = true;
    this.inactiveWhy = why;
    this.emit();
  }

  constructor() {
    try { localStorage.setItem(OWNER_KEY, TAB_ID); } catch { /* 存不了就不管多开 */ }
    window.addEventListener('storage', (e) => {
      if (e.key !== OWNER_KEY || !e.newValue || e.newValue === TAB_ID) return;
      this.stop('tab');
    });
    const loaded = load();
    // 刚读档：备份一份能读的（读档时备份最可靠）
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(loaded)); } catch { /* 存不了就算了 */ }
    const { state, summary } = advance(loaded, Date.now());
    this.state = stepMail(state, Date.now());
    this.absorb(summary);
    if (summary.elapsedMs >= OFFLINE_POPUP_MS) this.offline = summary;
    setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      // 切回前台时可能隔了很久，也走离线弹窗
      if (document.visibilityState === 'visible') this.tick(true);
      else { this.hiddenAt = Date.now(); this.save(); }
    });
    window.addEventListener('pagehide', () => this.save());
  }

  private tick(fromBackground = false) {
    if (this.inactive) return;
    const { state, summary } = advance(this.state, Date.now());
    this.state = stepMail(state, Date.now());
    this.absorb(summary);
    const hidden = document.visibilityState === 'hidden';
    // 在后台、或者一下子结算了很久（锁屏回来定时器先跑了）：都记进离开期间的收获
    if (hidden || fromBackground || summary.elapsedMs >= OFFLINE_POPUP_MS || this.away) {
      this.away = this.away ? mergeSummary(this.away, summary) : summary;
    }
    if (!hidden && this.away) {
      const away = this.away;
      this.away = null;
      const gone = this.hiddenAt ? Date.now() - this.hiddenAt : away.elapsedMs;
      this.hiddenAt = 0;
      if (gone >= OFFLINE_POPUP_MS || away.elapsedMs >= OFFLINE_POPUP_MS) {
        // 上一个离线弹窗还没关：合在一起
        this.offline = this.offline ? mergeSummary(this.offline, away) : away;
        if (Date.now() - this.lastSave > SAVE_EVERY_MS) this.save();
        this.emit();
        return;
      }
      if (away !== summary) {
        if (Object.keys(away.items).length || away.levelUps.length) this.gainListeners.forEach((l) => l(away));
        if (Date.now() - this.lastSave > SAVE_EVERY_MS) this.save();
        this.emit();
        return;
      }
    }
    if (Object.keys(summary.items).length || summary.levelUps.length || summary.taskEnds.length || summary.deaths || summary.waystones?.length) {
      this.gainListeners.forEach((l) => l(summary));
    }
    if (Date.now() - this.lastSave > SAVE_EVERY_MS) this.save();
    this.emit();
  }

  /** 玩家操作：先结算到当前时刻再应用，避免丢进度 */
  dispatch(fn: (s: GameState) => GameState) {
    if (this.inactive) return;
    const { state, summary } = advance(this.state, Date.now());
    this.absorb(summary, true);
    this.state = fn(state);
    this.save();
    this.emit();
  }

  /** 种田操作：先结算到现在，再种 / 浇 / 收，收获的东西也记进日志、弹提示 */
  farm(fn: (s: GameState, now: number) => { state: GameState; summary: Summary }) {
    const now = Date.now();
    const { state, summary } = advance(this.state, now);
    this.absorb(summary, true);
    const r = fn(state, now);
    this.state = r.state;
    this.absorb(r.summary);
    if (Object.keys(r.summary.items).length || r.summary.levelUps.length || r.summary.quests?.length) this.gainListeners.forEach((l) => l(r.summary));
    this.save();
    this.emit();
    return r;
  }

  /** 点了配方里缺的材料：要打开的那个配方，制作页打开时直接选中它（到了地方也一样） */
  focusAction: string | null = null;

  /** 界面要求角色寻路去某个地点（地图场景来取） */
  pendingWalk: string | null = null;
  /** 正在追踪的怪物 id：地图上给它头顶加个箭头 */
  tracking: string | null = null;
  requestWalk(nodeId: string, track: string | null = null) {
    // 在家园岛屿上点了城里的地点：先出岛再走
    if (this.state.home?.inside) this.dispatch(leaveHome);
    this.pendingWalk = nodeId;
    this.tracking = track;
    this.emit();
  }
  /** 寻路去找某只怪 */
  track(monsterId: string) {
    const s = this.state;
    const n = nodeOfAction(`fight_${monsterId}`, walkPos(s), s.waystones, moveSpeed(s));
    if (n) this.requestWalk(n.id, monsterId);
  }

  dismissOffline() {
    this.offline = null;
    this.emit();
  }

  /** 导入存档：存下来后刷新页面，地图场景按新存档重建 */
  replace(next: GameState) {
    this.state = next;
    this.offline = null;
    this.save();
    location.reload();
  }

  reset() {
    this.state = newGame(Date.now());
    this.combatLog = [];
    this.logDirty = true;
    this.offline = null;
    this.save();
    this.emit();
  }

  save() {
    if (this.inactive) return;
    this.lastSave = Date.now();
    try {
      const raw = JSON.stringify(this.state);
      localStorage.setItem(SAVE_KEY, raw);
      if (Date.now() - this.lastBackup > BACKUP_EVERY_MS) {
        this.lastBackup = Date.now();
        localStorage.setItem(BACKUP_KEY, raw);
      }
      if (this.logDirty) {
        localStorage.setItem(LOG_KEY, JSON.stringify(this.combatLog));
        this.logDirty = false;
      }
    } catch {
      // 隐私模式等情况下无法保存，游戏照常运行
    }
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  onGain(l: GainListener) {
    this.gainListeners.add(l);
    return () => {
      this.gainListeners.delete(l);
    };
  }

  emit() {
    this.listeners.forEach((l) => l());
  }
}

export const store = new Store();

export function useGame(): GameState {
  return useSyncExternalStore(store.subscribe, () => store.state);
}

export function useInactive(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.inactive);
}

export function useOffline(): Summary | null {
  return useSyncExternalStore(store.subscribe, () => store.offline);
}
