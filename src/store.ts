import { useSyncExternalStore } from 'react';
import { nodeOfAction } from './core/data';
import { advance, LOG_CAP, migrate, newGame } from './core/sim';
import type { CombatLogEntry, GameState, Summary } from './core/types';

const SAVE_KEY = 'canglin-idle-save-v1';
const LOG_KEY = 'canglin-combat-log';
const TICK_MS = 200;
const SAVE_EVERY_MS = 5000;
/** 离开超过这么久才弹「离线收获」 */
const OFFLINE_POPUP_MS = 60_000;

type Listener = () => void;
type GainListener = (summary: Summary) => void;

function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    let s: GameState | null = null;
    try {
      s = raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      s = null;
    }
    if (s) return s;
    // 读不出来的旧存档先另存一份再开新档，不直接覆盖掉
    if (raw) localStorage.setItem(`${SAVE_KEY}-broken-${Date.now()}`, raw);
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
  /** 战斗日志：最近的击杀和阵亡，存在本地，不进存档 */
  combatLog: CombatLogEntry[] = (() => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as CombatLogEntry[]; } catch { return []; }
  })();

  private absorb(summary: Summary) {
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

  constructor() {
    const loaded = load();
    const { state, summary } = advance(loaded, Date.now());
    this.state = state;
    this.absorb(summary);
    if (summary.elapsedMs >= OFFLINE_POPUP_MS) this.offline = summary;
    setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      // 切回前台时可能隔了很久，也走离线弹窗
      if (document.visibilityState === 'visible') this.tick(true);
      else this.save();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  private tick(fromBackground = false) {
    const { state, summary } = advance(this.state, Date.now());
    this.state = state;
    this.absorb(summary);
    if (fromBackground && summary.elapsedMs >= OFFLINE_POPUP_MS) this.offline = summary;
    else if (Object.keys(summary.items).length || summary.levelUps.length || summary.taskEnds.length || summary.deaths) {
      this.gainListeners.forEach((l) => l(summary));
    }
    if (Date.now() - this.lastSave > SAVE_EVERY_MS) this.save();
    this.emit();
  }

  /** 玩家操作：先结算到当前时刻再应用，避免丢进度 */
  dispatch(fn: (s: GameState) => GameState) {
    const { state, summary } = advance(this.state, Date.now());
    this.absorb(summary);
    this.state = fn(state);
    this.save();
    this.emit();
  }

  /** 种田操作：先结算到现在，再种 / 浇 / 收，收获的东西也记进日志、弹提示 */
  farm(fn: (s: GameState, now: number) => { state: GameState; summary: Summary }) {
    const now = Date.now();
    const { state, summary } = advance(this.state, now);
    this.absorb(summary);
    const r = fn(state, now);
    this.state = r.state;
    this.absorb(r.summary);
    if (Object.keys(r.summary.items).length || r.summary.levelUps.length || r.summary.quests?.length) this.gainListeners.forEach((l) => l(r.summary));
    this.save();
    this.emit();
    return r;
  }

  /** 界面要求角色寻路去某个地点（地图场景来取） */
  pendingWalk: string | null = null;
  /** 正在追踪的怪物 id：地图上给它头顶加个箭头 */
  tracking: string | null = null;
  requestWalk(nodeId: string, track: string | null = null) {
    this.pendingWalk = nodeId;
    this.tracking = track;
    this.emit();
  }
  /** 寻路去找某只怪 */
  track(monsterId: string) {
    const n = nodeOfAction(`fight_${monsterId}`);
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
    this.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
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

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const store = new Store();

export function useGame(): GameState {
  return useSyncExternalStore(store.subscribe, () => store.state);
}

export function useOffline(): Summary | null {
  return useSyncExternalStore(store.subscribe, () => store.offline);
}
