/*
 * 组队经验加成（用户 10-25）：队伍里每个人 +5%，5 人满队 +25%。
 * 队伍在联机层（net/social），这里只记当前人数，供 sim 结算经验时读；离线补算时没有队伍，不加成。
 */
export const PARTY_XP_PER = 0.05;
export const PARTY_MAX = 5;

let size = 0;
export function setPartySize(n: number) {
  size = Math.max(0, Math.min(PARTY_MAX, Math.floor(n)));
}
export const partySize = () => size;
/**
 * 组队经验算几个人（11-02）：只算在线的队员（包括自己）；只有自己在线 = 0（不加成）。
 * isOnline 判断别的队员在不在线。
 */
export function onlinePartySize(members: string[], me: string, isOnline: (id: string) => boolean): number {
  const n = 1 + members.filter((id) => id !== me && isOnline(id)).length;
  return n >= 2 ? Math.min(PARTY_MAX, n) : 0;
}
/** 队员最后同步在这之内算在线（游戏每分钟同步一次） */
export const PARTY_ONLINE_MS = 3 * 60_000;
/** 一段结算超过这么久就是下线后的补算，不吃组队加成 */
export const PARTY_LIVE_MS = 3 * 60_000;
/** 助攻经验：怪死时，自己打过它的话，队友在这只怪上打的伤害按这个比例也给你经验 */
export const ASSIST_XP = 0.25;
/** 当前组队经验加成（0 = 没组队） */
export const partyXpPct = () => size * PARTY_XP_PER;
