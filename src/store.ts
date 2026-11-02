import { useSyncExternalStore } from 'react';
import { nodeOfAction } from './core/data';
import { advance, LOG_CAP, mergeSummary, migrate, moveSpeed, newGame, walkPos } from './core/sim';
import { stepMail } from './core/mail';
import { gameNow, saveSig } from './core/clock';
import { applyCmd, type Cmd, type CmdArgs, type CmdName } from './core/commands';
import type { CombatLogEntry, GameState, Summary } from './core/types';

const SAVE_KEY = 'canglin-idle-save-v1';
/** 本机备份（10-27）：每 10 分钟另存一份，主存档读不出来时用它，不至于整个档没了 */
const BACKUP_KEY = 'canglin-idle-save-bak';
const BACKUP_EVERY_MS = 10 * 60_000;
/** 存档签名（11-01 防作弊）：存档被手动改过时对不上 */
const SIG_KEY = 'canglin-idle-save-sig';
const LOG_KEY = 'canglin-combat-log';
/** 还没送到服务器的指令和指令序号（11-02 服务器结算）：刷新页面也不丢 */
const PENDING_KEY = 'canglin-pending-cmds';
const SEQ_KEY = 'canglin-cmd-seq';
const readJson = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? d; } catch { return d; } };
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

/** 读档时发现本地存档被改过（登录后报给服务器） */
export let saveTampered = false;
function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = parse(raw);
    const sig = localStorage.getItem(SIG_KEY);
    if (s && raw && sig && sig !== saveSig(raw)) saveTampered = true;
    if (s) return s;
    // 读不出来的旧存档先另存一份，再用备份；备份也没有才开新档
    if (raw) localStorage.setItem(`${SAVE_KEY}-broken-${Date.now()}`, raw);
    const bak = parse(localStorage.getItem(BACKUP_KEY));
    if (bak) return bak;
  } catch {
    // 无法访问 localStorage（隐私模式等）时开新档
  }
  return newGame(gameNow());
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
      // 后台期间已经攒下的那部分也一起算进去，不丢
      const all = this.away ? mergeSummary(this.away, summary) : summary;
      this.offline = this.offline ? mergeSummary(this.offline, all) : all;
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

  /** 读档时的存档（还没结算离线收益），对过服务器时间后可能要重算 */
  private loaded: GameState | null = null;
  private loadedSkew = 0;
  /** 读档后玩家动过（点了按钮、种了田）就不再重算 */
  private touched = false;
  /** 切回前台结算前要做的事（联机时对时间），由 sync.ts 设置 */
  beforeResume: () => Promise<unknown> = async () => {};
  /** 记下了一条新指令（联机层用它尽快送去服务器） */
  onCmd: (n: CmdName) => void = () => {};
  /**
   * 登录后对过服务器时间：本机时间被调快过的话，读档时多算的离线收益不算，按正确的时间重新结算。
   * 只在进游戏前（玩家还没动过）做。
   */
  recalibrate() {
    if (!this.loaded || this.touched || this.inactive) return;
    const loaded = this.loaded;
    this.loaded = null;
    const now = gameNow();
    // 读档时用的时间和校准后的差不多：不用重算
    if (Math.abs(now - Date.now() - this.loadedSkew) < 60_000) return;
    const { state, summary } = advance(loaded, now);
    this.state = stepMail(state, now);
    this.offline = summary.elapsedMs >= OFFLINE_POPUP_MS ? summary : null;
    this.save();
    this.emit();
  }

  /** 游戏在另一个页面（tab）或另一台设备（device）上开着：这边停下，不再存档 */
  inactive = false;
  inactiveWhy: 'tab' | 'device' | 'banned' = 'tab';
  stop(why: 'tab' | 'device' | 'banned') {
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
    this.loaded = loaded;
    this.loadedSkew = gameNow() - Date.now();
    const { state, summary } = advance(loaded, gameNow());
    this.state = stepMail(state, gameNow());
    this.absorb(summary);
    if (summary.elapsedMs >= OFFLINE_POPUP_MS) this.offline = summary;
    setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      // 切回前台时可能隔了很久，也走离线弹窗
      // 先向服务器对一下时间（最多等 2.5 秒），免得改了系统时间回来白拿离线收益
      if (document.visibilityState === 'visible') void this.beforeResume().finally(() => this.tick(true));
      else { this.hiddenAt = Date.now(); this.save(); }
    });
    window.addEventListener('pagehide', () => this.save());
  }

  private tick(fromBackground = false) {
    if (this.inactive) return;
    const { state, summary } = advance(this.state, gameNow());
    this.state = stepMail(state, gameNow());
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

  /**
   * 只改本机、不发给服务器的变化（11-02）：服务器会自己从数据库算出同样的结果（GM 增益、公会等级、
   * 交易、邮件、公会仓库存取等），这里先改是为了马上显示。玩家自己的操作都要用 run 发指令
   */
  dispatch(fn: (s: GameState) => GameState) {
    if (this.inactive) return;
    const { state, summary } = advance(this.state, gameNow());
    this.absorb(summary);
    this.state = fn(state);
    this.save();
    this.emit();
  }

  /** 还没被服务器确认的指令（sync 发出去，服务器回复收到第几条后删掉） */
  pending: Cmd[] = readJson<Cmd[]>(PENDING_KEY, []);
  private seq = Number(readJson<number>(SEQ_KEY, 0)) || 0;

  /**
   * 换成服务器算好的存档（11-02）：服务器还没收到的指令在它上面重放一遍，再结算到现在。
   * 诚实玩家本机和服务器算的一样，画面不会跳；本机被加速过的进度在这里被服务器的结果盖掉
   */
  adoptServer(server: GameState, ack: number) {
    const next = migrate(server);
    if (!next || this.inactive) return;
    this.pending = this.pending.filter((c) => c.q > ack);
    let s = next;
    for (const c of this.pending) {
      s = advance(s, c.t).state;
      s = applyCmd(s, c.n, c.a, Math.max(c.t, s.lastTick)).state;
    }
    s = advance(s, gameNow()).state;
    this.state = s;
    this.save();
    this.emit();
  }
  /**
   * 玩家操作 = 指令：先结算到当前时刻再执行（不丢进度），记下来发给服务器（服务器按同样的顺序重算）。
   * 返回指令给界面的东西（开箱拿到了什么等）
   */
  run<N extends CmdName>(n: N, ...a: CmdArgs<N>): unknown {
    if (this.inactive) return undefined;
    this.touched = true;
    const now = gameNow();
    const { state, summary } = advance(this.state, now);
    this.absorb(summary, true);
    const r = applyCmd(state, n, a, now);
    this.state = r.state;
    if (r.state !== state) {
      this.pending.push({ n, a: JSON.parse(JSON.stringify(a ?? [])) as unknown[], t: now, q: ++this.seq });
      // 一直没登录（离线玩）就不会送出去，只留最近的
      if (this.pending.length > 5000) this.pending.splice(0, this.pending.length - 5000);
      this.onCmd(n);
    }
    if (r.summary) {
      this.absorb(r.summary);
      const g = r.summary;
      if (Object.keys(g.items).length || g.levelUps.length || g.quests?.length) this.gainListeners.forEach((l) => l(g));
    }
    this.save();
    this.emit();
    return r.out;
  }

  /** 点了配方里缺的材料：要打开的那个配方，制作页打开时直接选中它（到了地方也一样） */
  focusAction: string | null = null;

  /** 界面要求角色寻路去某个地点（地图场景来取） */
  pendingWalk: string | null = null;
  /** 正在追踪的怪物 id：地图上给它头顶加个箭头 */
  tracking: string | null = null;
  requestWalk(nodeId: string, track: string | null = null) {
    // 在家园岛屿上点了城里的地点：先出岛再走
    if (this.state.home?.inside) this.run('leaveHome');
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
    // 联机时服务器也要清掉（指令），离线时只清本机
    this.run('reset');
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
      localStorage.setItem(SIG_KEY, saveSig(raw));
      localStorage.setItem(PENDING_KEY, JSON.stringify(this.pending));
      localStorage.setItem(SEQ_KEY, String(this.seq));
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
