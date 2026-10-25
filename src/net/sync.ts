import { useEffect, useState } from 'react';
import { store } from '../store';
import type { GameState } from '../core/types';
import { online, type Profile } from './index';

/** 登录状态和云存档：登录后每分钟把存档传一次，离开页面前也传；断网就等下次 */
const PUSH_EVERY_MS = 60_000;

type Fn = () => void;
const fns = new Set<Fn>();
const emit = () => fns.forEach((f) => f());
let status: 'loading' | 'ready' = 'loading';
let lastPush = 0;
/** 登录时发现云端存档比本地新：等玩家选 */
export let cloudNewer: GameState | null = null;

export async function pushNow() {
  if (!online.me() || store.inactive) return;
  lastPush = Date.now();
  try { await online.pushSave(store.state); } catch { /* 连不上就下次再传 */ }
}

/** 刚登录：云端更新就让玩家选用哪个，否则把本地传上去 */
async function afterLogin() {
  try {
    const cloud = await online.pullSave();
    if (cloud && cloud.lastTick > store.state.lastTick + 60_000) cloudNewer = cloud;
    else await pushNow();
  } catch { /* 连不上就先单机 */ }
  emit();
}

export function useOnline() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  return { me: online.me(), loading: status === 'loading', cloudNewer };
}

export async function signIn(email: string, pw: string) { await online.signIn(email, pw); await afterLogin(); }
export async function signUp(email: string, pw: string, name: string) { await online.signUp(email, pw, name); await afterLogin(); }
export async function signOut() { await pushNow(); await online.signOut(); cloudNewer = null; emit(); }
export function useCloud() { if (cloudNewer) store.replace(cloudNewer); }
export function keepLocal() { cloudNewer = null; void pushNow(); emit(); }
export const refresh = emit;

export function startSync() {
  void online.ready().then((p: Profile | null) => {
    status = 'ready';
    emit();
    if (p) void afterLogin();
  }).catch(() => { status = 'ready'; emit(); });
  setInterval(() => { if (!cloudNewer && Date.now() - lastPush > PUSH_EVERY_MS) void pushNow(); }, 10_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !cloudNewer) void pushNow(); });
}
