import { useEffect, useState } from 'react';
import { saveTampered, store } from '../store';
import { calibrate } from '../core/clock';
import type { GameState } from '../core/types';
import { online } from './index';
import { syncSocial } from './social';

/**
 * 账号和云存档（10-25 用户要求：进游戏要先登录 → 建角色 → 存档放云端）。
 *
 * 本机存档记着属于哪个账号（OWNER_KEY），还记着上次和云端对上时云端存档的时间（SYNCED_KEY）。
 * 登录时：云端被别的设备更新过就用云端的，否则把本机的传上去。
 * 游戏结算都在本机，断网照样挂机，连上后再传。
 */
const OWNER_KEY = 'canglin-save-owner';
const SYNCED_KEY = 'canglin-save-synced';
/** 服务器回档版本（11-01）：上传时带上，比服务器旧就会被拒，读回档后的存档 */
const EPOCH_KEY = 'canglin-save-epoch';
const PUSH_EVERY_MS = 60_000;
/** 传失败了多久后重试 */
const RETRY_MS = 15_000;
/** 别的设备这么久没再传存档，就当它已经不玩了：这边直接读它的存档接着玩（不用手动点） */
const OTHER_IDLE_MS = 3 * 60_000;

export type Phase =
  | 'loading'
  /** 没登录 */
  | 'login'
  /** 登录了，还没建角色 */
  | 'create'
  /** 本机有登录前的进度、云端没有：问要不要带进这个账号 */
  | 'adopt'
  /** 连不上服务器 */
  | 'error'
  | 'play'
  /** 连不上时选了先离线玩 */
  | 'offline';

let phase: Phase = 'loading';
let lastPush = 0;
type Fn = () => void;
const fns = new Set<Fn>();
const set = (p: Phase) => { phase = p; syncSocial(); fns.forEach((f) => f()); };

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } },
};
/** 这台设备（这个浏览器）的 id，跟存档一起传上去 */
const DEVICE_KEY = 'canglin-device';
function deviceId() {
  let id = ls.get(DEVICE_KEY);
  if (!id) { id = Math.random().toString(36).slice(2, 12); ls.set(DEVICE_KEY, id); }
  return id;
}

export function useOnline() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  return { me: online.me(), phase };
}

/**
 * 和服务器同步（11-02 改服务器结算）：把还没送到的指令交给服务器，服务器按自己的时钟算好存档发回来，
 * 本机换成服务器的结果（还没送到的指令在上面重放）。本机只负责马上显示，最后算数的是服务器。
 */
let syncing: Promise<boolean> | null = null;
export function pushNow(): Promise<boolean> {
  if (!syncing) syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}
async function doSync(): Promise<boolean> {
  const me = online.me();
  if (!me || phase !== 'play' || store.inactive || ls.get(OWNER_KEY) !== me.id) return false;
  lastPush = Date.now();
  try {
    // 别的设备（或别的浏览器）在这之后同步过：这边停下，免得两边同时操作（用户 10-25）
    const cloud = await online.cloudHead();
    if (cloud && cloud.device && cloud.device !== deviceId() && cloud.tick > Number(ls.get(SYNCED_KEY) ?? 0) + 1000) {
      // 10-27：别的设备已经停了一阵就直接接着玩（服务器上就是它最后的进度）
      if (Date.now() - cloud.tick > OTHER_IDLE_MS && document.visibilityState === 'visible') {
        store.pending = [];
      } else {
        store.stop('device');
        return false;
      }
    }
    const sentAt = Date.now();
    const r = await online.gameSync(store.pending.slice(0, 3000), deviceId());
    calibrate(r.now, sentAt, Date.now());
    ls.set(SYNCED_KEY, String(r.state.lastTick));
    store.adoptServer(r.state, r.ack);
    return true;
  } catch {
    // 连不上：过一会儿就重试，不用等满一分钟（指令留着，下次一起发）
    lastPush = Date.now() - PUSH_EVERY_MS + RETRY_MS;
    return false;
  }
}

/** 换成这份存档（会刷新页面） */
function adoptSave(s: GameState, ownerId: string) {
  ls.set(OWNER_KEY, ownerId);
  const ep = Number((s as GameState & { _epoch?: number })._epoch);
  if (ep > 0) ls.set(EPOCH_KEY, String(ep));
  ls.set(SYNCED_KEY, String(s.lastTick));
  store.replace(s);
}

/**
 * 登录并有角色后：存档以服务器为准（11-02）。本机存档是这个账号的就先接着显示、马上和服务器同步；
 * 不是（换了账号、新设备）就读服务器的（还没有就让服务器开新档）。登录前在本机玩的进度不能带进账号了
 */
async function resolveSave() {
  const me = online.me()!;
  if (ls.get(OWNER_KEY) === me.id) { set('play'); void pushNow(); return; }
  store.pending = [];
  const cloud = await online.pullSave();
  if (cloud) { adoptSave(cloud, me.id); return; }
  await startFresh();
}

/** 让服务器开新档（建角色时选的外观由服务器从资料里读） */
async function startFresh() {
  const me = online.me()!;
  store.pending = [];
  const r = await online.gameSync([], deviceId());
  adoptSave(r.state, me.id);
}

async function afterAuth() {
  if (!online.signedIn()) return set('login');
  if (!online.me()) return set('create');
  // 防作弊（11-01）：进游戏前先对时间，本机时间被调过就按服务器时间重算离线收益
  await syncClock();
  store.recalibrate();
  if (saveTampered && !tamperSent) { tamperSent = true; void online.reportCheat('save_edit', {}).catch(() => {}); }
  void refreshAc();
  await resolveSave();
}

/** 向服务器对时间；本机时钟这段时间里被拨过（差值变了 2 分钟以上）就报上去 */
let tamperSent = false;
export async function syncClock(timeoutMs = 2500) {
  if (!online.signedIn()) return;
  const sentAt = Date.now();
  const server = await Promise.race([
    online.serverNow().catch(() => 0),
    new Promise<number>((r) => setTimeout(() => r(0), timeoutMs)),
  ]);
  if (!server) return;
  const jump = calibrate(server, sentAt, Date.now());
  if (Math.abs(jump) > 2 * 60_000) void online.reportCheat('clock_local', { jump_min: Math.round(jump / 60_000) }).catch(() => {});
}

/** 自己有没有被移出排行榜 / 封禁（聊天页、排行榜提示用） */
let ac = { hidden: false, banned: false };
export const myAcStatus = () => ac;
async function refreshAc() {
  try { ac = await online.myAc(); fns.forEach((f) => f()); } catch { /* 拿不到就当正常 */ }
  // 被封禁：服务器不再结算，这边也停下并说明
  if (ac.banned && phase === 'play') store.stop('banned');
}

const wrap = async (f: () => Promise<unknown>) => {
  try { await f(); } catch (e) { if (/fetch|network|load failed/i.test(String(e))) set('error'); throw e; }
};
export const signIn = (email: string, pw: string) => wrap(async () => { await online.signIn(email, pw); await afterAuth(); });
export const signUp = (email: string, pw: string) => wrap(async () => { await online.signUp(email, pw); await afterAuth(); });
export const createCharacter = (name: string, outfit: string) => wrap(async () => { await online.createProfile(name, outfit); await afterAuth(); });
/** 本机登录前的进度：带进这个账号，或者从头开始 */
export function adoptLocal(_keep: boolean) {
  void startFresh();
}
export async function signOut() {
  await pushNow();
  await online.signOut();
  set('login');
}
export const playOffline = () => set('offline');
export async function retry() {
  set('loading');
  try { await online.ready(); await afterAuth(); } catch { set('error'); }
}

/**
 * 游戏加速检测（11-01）：系统时间（Date.now）走得比浏览器内部计时（performance.now）快，
 * 连续 3 次（每 10 秒量一次）都快三成以上才算（电脑睡眠只会跳一次，不算）
 */
function watchSpeed() {
  let w = Date.now(), p = performance.now(), streak = 0, sent = false;
  setInterval(() => {
    const w2 = Date.now(), p2 = performance.now();
    const dw = w2 - w, dp = p2 - p;
    w = w2; p = p2;
    if (document.visibilityState !== 'visible' || dp < 5000) { streak = 0; return; }
    const r = dw / dp;
    streak = r > 1.3 && r < 50 ? streak + 1 : 0;
    if (streak >= 3 && !sent && phase === 'play') {
      sent = true;
      void online.reportCheat('speed', { ratio: Math.round(r * 100) / 100 }).catch(() => {});
    }
  }, 10_000);
}

/** 点了操作之后几秒内就送去服务器（服务器只认最近半小时内的操作时间，别攒太久） */
let soon: ReturnType<typeof setTimeout> | undefined;
export function startSync() {
  store.beforeResume = () => syncClock();
  store.onCmd = (n) => {
    if (n === 'coop' || soon) return;
    soon = setTimeout(() => { soon = undefined; void pushNow(); }, 3000);
  };
  watchSpeed();
  // 每 5 分钟对一次时间，顺便看看自己的状态
  setInterval(() => { if (phase === 'play') { void syncClock(); void refreshAc(); } }, 5 * 60_000);
  void retry();
  setInterval(() => { if (Date.now() - lastPush > PUSH_EVERY_MS) void pushNow(); }, 10_000);
  // 切回来时马上对一次云端：这段时间可能在别的设备上玩过
  document.addEventListener('visibilitychange', () => void pushNow());
}
