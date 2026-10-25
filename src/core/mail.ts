import { ITEMS } from './data';
import { HW_BOX, HW_END, hwOpen } from './halloween';
import type { GameState, ItemStack, Mail, MailKind } from './types';

/*
 * 邮箱（用户 10-25）：游戏送给玩家的奖励（新手任务、兑换码、活动登录礼物）都发到邮箱，
 * 玩家打开邮箱领取后才进背包（背包放不下进仓库）。
 * 万圣节活动期间每天第一次上线送 3 个南瓜礼盒；活动结束后所有南瓜礼盒（背包、仓库、邮件里）自动销毁。
 */

export const MAIL_CAP = 100;
export const HW_DAILY_BOXES = 3;

/** 本地日期，当作每日礼物的去重键 */
export const dayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** 往存档里塞一封邮件（直接改 s） */
export function sendMail(s: GameState, kind: MailKind, items: ItemStack[], at: number, extra: Partial<Pick<Mail, 'arg' | 'expires'>> = {}) {
  s.mailSeq = (s.mailSeq ?? 0) + 1;
  s.mail = [{ id: s.mailSeq, kind, at, items: items.filter((i) => i.qty > 0), ...extra }, ...(s.mail ?? [])];
  // 太多了先删最旧的已领取邮件，再删最旧的
  while (s.mail.length > MAIL_CAP) {
    const i = s.mail.map((m) => !!m.claimed || !m.items.length).lastIndexOf(true);
    s.mail.splice(i >= 0 ? i : s.mail.length - 1, 1);
  }
}

const has = (rec: Record<string, number>, id: string) => (rec[id] ?? 0) > 0;

/** 活动结束：销毁所有南瓜礼盒。返回有没有改动 */
function purgeHalloween(s: GameState, now: number): boolean {
  let changed = false;
  if (has(s.bag, HW_BOX) || has(s.bank, HW_BOX)) {
    delete s.bag[HW_BOX];
    delete s.bank[HW_BOX];
    changed = true;
  }
  if (s.mail?.some((m) => (m.expires !== undefined && m.expires <= now) || m.items.some((i) => i.item === HW_BOX))) {
    s.mail = s.mail.filter((m) => m.expires === undefined || m.expires > now);
    for (const m of s.mail) if (m.items.some((i) => i.item === HW_BOX)) m.items = m.items.filter((i) => i.item !== HW_BOX);
    changed = true;
  }
  if (changed && !s.mailKeys?.includes('hw-expired')) {
    s.mailKeys = [...(s.mailKeys ?? []), 'hw-expired'];
    sendMail(s, 'hw_expired', [], now);
  }
  return changed;
}

/**
 * 上线时、每分钟检查一次：发每日礼物、清过期邮件。没变化就返回原对象。
 * 不放进 advance 里：登录礼物按「上线」算，离线补算不该补发。
 */
export function stepMail(prev: GameState, now: number): GameState {
  const key = `hw-${dayKey(now)}`;
  const daily = hwOpen(now) && !prev.mailKeys?.includes(key);
  const stale = !hwOpen(now) && (has(prev.bag, HW_BOX) || has(prev.bank, HW_BOX) || !!prev.mail?.some((m) => m.items.some((i) => i.item === HW_BOX)));
  const expired = !!prev.mail?.some((m) => m.expires !== undefined && m.expires <= now);
  if (!daily && !stale && !expired) return prev;
  const s: GameState = JSON.parse(JSON.stringify(prev));
  if (daily) {
    s.mailKeys = [...(s.mailKeys ?? []).filter((k) => !k.startsWith('hw-2')).slice(-30), key];
    sendMail(s, 'hw_daily', [{ item: HW_BOX, qty: HW_DAILY_BOXES }], now, { expires: HW_END });
  }
  if (stale || expired) purgeHalloween(s, now);
  return s;
}

/** 背包还能放多少（避免 import sim 造成循环，按背包格子规则简单算） */
type RoomFn = (bag: Record<string, number>, item: string) => number;

/** 领取一封（id）或全部（'all'）邮件的附件：先进背包，放不下进仓库，金币进仓库。返回新存档和领到的东西 */
export function claimMail(prev: GameState, id: number | 'all', room: RoomFn): [GameState, Record<string, number>] {
  const got: Record<string, number> = {};
  const targets = (prev.mail ?? []).filter((m) => (id === 'all' || m.id === id) && !m.claimed && m.items.length);
  if (!targets.length) return [prev, got];
  const s: GameState = JSON.parse(JSON.stringify(prev));
  for (const m of s.mail!) {
    if (!targets.some((t) => t.id === m.id)) continue;
    for (const { item, qty } of m.items) {
      if (!ITEMS[item] || qty <= 0) continue;
      got[item] = (got[item] ?? 0) + qty;
      if (item === 'coins') { s.bank.coins = (s.bank.coins ?? 0) + qty; continue; }
      const n = Math.min(qty, room(s.bag, item));
      if (n > 0) s.bag[item] = (s.bag[item] ?? 0) + n;
      if (qty > n) s.bank[item] = (s.bank[item] ?? 0) + qty - n;
      s.seen[item] = 1;
    }
    m.claimed = true;
    m.read = true;
  }
  return [s, got];
}

export function readMail(prev: GameState, id: number): GameState {
  const m = prev.mail?.find((x) => x.id === id);
  if (!m || m.read) return prev;
  return { ...prev, mail: prev.mail!.map((x) => (x.id === id ? { ...x, read: true } : x)) };
}

/** 删掉已领取（或没有附件且已读）的邮件 */
export function clearMail(prev: GameState): GameState {
  const keep = (prev.mail ?? []).filter((m) => !(m.claimed || (!m.items.length && m.read)));
  return keep.length === (prev.mail ?? []).length ? prev : { ...prev, mail: keep };
}

export const unreadMail = (s: GameState) => (s.mail ?? []).filter((m) => !m.read || (!m.claimed && m.items.length > 0)).length;

/** 读档：只留格式对的邮件、认识的物品 */
export function migrateMail(raw: unknown): Mail[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is Mail => !!m && typeof m === 'object' && Number.isFinite(m.id) && typeof m.kind === 'string' && Number.isFinite(m.at) && Array.isArray(m.items))
    .map((m) => ({ ...m, items: m.items.filter((i) => i && ITEMS[i.item] && Number.isFinite(i.qty) && i.qty > 0).map((i) => ({ item: i.item, qty: Math.floor(i.qty) })) }))
    .slice(0, MAIL_CAP);
}
