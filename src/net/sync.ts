import { useEffect, useState } from 'react';
import { store } from '../store';
import { newGame, setSettings } from '../core/sim';
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
const PUSH_EVERY_MS = 60_000;

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
const xpSum = (s: GameState) => Object.values(s.xp).reduce((a, b) => a + b, 0);
/** 比新开的档多了经验才算有进度（新档生命值本来就有经验） */
const hasProgress = (s: GameState) => xpSum(s) > xpSum(newGame(0, 1));

export function useOnline() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  return { me: online.me(), phase };
}

export async function pushNow() {
  const me = online.me();
  if (!me || phase !== 'play' || store.inactive || ls.get(OWNER_KEY) !== me.id) return;
  lastPush = Date.now();
  try {
    // 别的设备（或别的浏览器）在这之后传过存档：这边停下，别拿旧进度盖掉它（用户 10-25 离线收益丢了）
    const cloud = await online.cloudHead();
    if (cloud && cloud.device && cloud.device !== deviceId() && cloud.tick > Number(ls.get(SYNCED_KEY) ?? 0) + 1000) {
      store.stop('device');
      return;
    }
    const s = store.state;
    await online.pushSave(s, deviceId());
    ls.set(SYNCED_KEY, String(s.lastTick));
  } catch { /* 连不上就下次再传 */ }
}

/** 换成这份存档（会刷新页面） */
function adoptSave(s: GameState, ownerId: string) {
  ls.set(OWNER_KEY, ownerId);
  ls.set(SYNCED_KEY, String(s.lastTick));
  store.replace(s);
}

/** 登录并有角色后：决定用本机还是云端的存档 */
async function resolveSave() {
  const me = online.me()!;
  const owner = ls.get(OWNER_KEY);
  const cloud = await online.pullSave();
  if (cloud) {
    const synced = Number(ls.get(SYNCED_KEY) ?? 0);
    // 本机存档是这个账号的，且云端没被别的设备动过：继续用本机的
    if (owner === me.id && cloud.lastTick <= synced + 1000) { set('play'); void pushNow(); return; }
    adoptSave(cloud, me.id);
    return;
  }
  if (owner === me.id) { set('play'); void pushNow(); return; }
  if (!owner && hasProgress(store.state)) { set('adopt'); return; }
  startFresh(me.outfit);
}

function startFresh(outfit?: string) {
  const me = online.me()!;
  let s = newGame(Date.now());
  if (outfit) s = setSettings(s, { skin: outfit });
  adoptSave(s, me.id);
}

async function afterAuth() {
  if (!online.signedIn()) return set('login');
  if (!online.me()) return set('create');
  await resolveSave();
}

const wrap = async (f: () => Promise<unknown>) => {
  try { await f(); } catch (e) { if (/fetch|network|load failed/i.test(String(e))) set('error'); throw e; }
};
export const signIn = (email: string, pw: string) => wrap(async () => { await online.signIn(email, pw); await afterAuth(); });
export const signUp = (email: string, pw: string) => wrap(async () => { await online.signUp(email, pw); await afterAuth(); });
export const createCharacter = (name: string, outfit: string) => wrap(async () => { await online.createProfile(name, outfit); await afterAuth(); });
/** 本机登录前的进度：带进这个账号，或者从头开始 */
export function adoptLocal(keep: boolean) {
  const me = online.me()!;
  if (keep) { ls.set(OWNER_KEY, me.id); set('play'); void pushNow(); }
  else startFresh(me.outfit);
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

export function startSync() {
  void retry();
  setInterval(() => { if (Date.now() - lastPush > PUSH_EVERY_MS) void pushNow(); }, 10_000);
  // 切回来时马上对一次云端：这段时间可能在别的设备上玩过
  document.addEventListener('visibilitychange', () => void pushNow());
}
