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
/** 当前组队经验加成（0 = 没组队） */
export const partyXpPct = () => size * PARTY_XP_PER;
