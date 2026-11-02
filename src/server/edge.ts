/*
 * 服务器结算程序入口（Supabase Edge Function「game」，11-02）。
 * GitHub Actions 用 esbuild 把这个文件连同 src/core 打包成 supabase/functions/game/index.js 再部署，
 * 所以服务器上跑的结算代码永远和游戏同一版本。
 *
 * 流程：认出是谁（用玩家登录的令牌问 Supabase）→ 读服务器上的存档、GM 增益、公会、GM 邮件 →
 * runSync 按服务器时间算 → server_commit 一次写进存档和排行榜（版本号对不上 = 同时有别的写入，重来）。
 * 服务器用 service_role 写存档，玩家自己不能再写存档（见 schema.sql「服务器结算」）。
 */
import { rankOf, runSync, type SyncExtras } from './sync';
import type { DungeonGate, GmBuff, ItemStack } from '../core/types';
import type { MateRun } from '../core/guard';
import { onlinePartySize, PARTY_ONLINE_MS } from '../core/party';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function rest(path: string, init: RequestInit = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function whoAmI(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return typeof u?.id === 'string' ? u.id : null;
}

async function extras(uid: string, now: number): Promise<SyncExtras & { found: boolean }> {
  const [p] = (await rest(`profiles?id=eq.${uid}&select=pid,outfit,guild_id,save_epoch,banned`)) as Row[];
  if (!p) return { found: false, gmBuffs: [], guildLv: 0, mails: [] };
  const pid = Number(p.pid) || 0;
  const since = new Date(now - 3600_000).toISOString();
  const [buffs, guild, mails, party] = await Promise.all([
    rest(`gm_buffs?select=id,target_pid,name,tag,kind,pct,starts_at,ends_at&ends_at=gt.${since}&or=(target_pid.is.null,target_pid.eq.${pid})&limit=50`) as Promise<Row[]>,
    p.guild_id ? rest(`guilds?id=eq.${p.guild_id}&select=level,tech`) as Promise<Row[]> : Promise.resolve([] as Row[]),
    pid ? rest(`gm_mail?select=id,title,body,items&target_pid=eq.${pid}&claimed_at=is.null&limit=20`) as Promise<Row[]> : Promise.resolve([] as Row[]),
    rest(`party_members?player_id=eq.${uid}&select=party_id`) as Promise<Row[]>,
  ]);
  const members = party[0] ? ((await rest(`party_members?party_id=eq.${party[0].party_id}&select=player_id`)) as Row[]).map((r) => String(r.player_id)) : [];
  // 队友存档里的洞口和副本进度：跟队友进洞口、按队友进度拉进度时核对（不信客户端报的）
  const mates = members.filter((id) => id !== uid && /^[0-9a-f-]{36}$/.test(id));
  // 组队经验只算在线的队员（11-02）：离线的队友不算人数
  const seen = mates.length ? (await rest(`profiles?id=in.(${mates.join(',')})&select=id,last_seen`)) as Row[] : [];
  const onlineIds = new Set(seen.filter((r) => now - Date.parse(r.last_seen) < PARTY_ONLINE_MS).map((r) => String(r.id)));
  const partySize = onlinePartySize(members, uid, (id) => onlineIds.has(id));
  const mateSaves = mates.length
    ? (await rest(`saves?player_id=in.(${mates.join(',')})&select=gates:data->gates,dungeon:data->dungeon,resume:data->dgResume,used:data->gatesUsed`)) as Row[]
    : [];
  const mateGates: DungeonGate[] = [];
  const mateRuns: MateRun[] = [];
  for (const m of mateSaves) {
    for (const g of Array.isArray(m.gates) ? m.gates : []) if (g && typeof g.id === 'string') mateGates.push(g);
    for (const r of [m.dungeon, ...(Array.isArray(m.resume) ? m.resume : [])]) {
      if (r?.gate && typeof r.gate.id === 'string') mateRuns.push({ gate: r.gate.id, floor: Number(r.floor) || 0, idx: Number(r.idx) || 0, phase: String(r.phase ?? '') });
    }
    for (const id of Array.isArray(m.used) ? m.used : []) if (typeof id === 'string') mateRuns.push({ gate: id, floor: 0, idx: 0, phase: 'open' });
  }
  return {
    found: true,
    salt: KEY,
    gmBuffs: buffs.map((r): GmBuff => ({ id: r.id, name: r.name, tag: r.tag ?? '', kind: r.kind, pct: Number(r.pct), from: Date.parse(r.starts_at), to: Date.parse(r.ends_at), all: r.target_pid == null })),
    guildLv: guild[0] ? Number(guild[0].level) || 1 : 0,
    guildTech: guild[0]?.tech,
    mails: mails.map((m) => ({
      id: m.id, title: m.title ?? '', body: m.body ?? '',
      items: (Array.isArray(m.items) ? m.items : []).filter((i: Row) => typeof i?.item === 'string' && Number(i.qty) > 0).map((i: Row): ItemStack => ({ item: i.item, qty: Math.floor(Number(i.qty)) })),
    })),
    outfit: p.outfit ?? undefined,
    epoch: Number(p.save_epoch) || 0,
    partySize,
    me: uid,
    frozen: p.banned === true,
    party: members.length ? members : [uid],
    mateGates,
    mateRuns,
  };
}

/** 网络代号（11-02 多开检测）：IP 不存原文，只存加密后的前 16 位；IPv6 按前 4 段（同一个家庭 / 手机的网段） */
async function netKey(req: Request) {
  const raw = (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? '').split(',')[0].trim();
  if (!raw) return '';
  const ip = raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`canglin-net:${ip}`));
  return Array.from(new Uint8Array(h).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
const SEEN_MS = 30 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const uid = await whoAmI(req);
    if (!uid) return json({ error: 'auth' }, 401);
    const body = await req.json().catch(() => ({})) as { cmds?: unknown; device?: unknown };
    const device = typeof body.device === 'string' ? body.device.slice(0, 32) : undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const now = Date.now();
      const [rows, ex] = await Promise.all([
        rest(`saves?player_id=eq.${uid}&select=data,rev`) as Promise<Row[]>,
        extras(uid, now),
      ]);
      if (!ex.found) return json({ error: 'profile' }, 404);
      const row = rows[0];
      const { state, applied, mailIds, ack, flags, results } = runSync(row?.data ?? null, body.cmds, now, ex, device ?? '');
      const data: Row = device ? { ...state, _device: device } : { ...state };
      // 记下用过的设备和网络（变了或者半小时一次），给多开检测用
      const net = await netKey(req).catch(() => '');
      const old = (row?.data ?? {}) as Row;
      const seen = (net || device) && (old._net !== net || old._device !== device || !(now - Number(old._netAt ?? 0) < SEEN_MS));
      data._net = net; data._netAt = seen ? now : old._netAt ?? now;
      const rev = await rest('rpc/server_commit', {
        method: 'POST',
        body: JSON.stringify({
          p_player: uid, p_rev: row ? Number(row.rev) : -1, p_data: data, p_tick: state.lastTick,
          p_mail: mailIds, p_rank: rankOf(state),
        }),
      }) as number;
      if (rev > 0) {
        // 可疑操作记进防作弊记录（GM 面板看得到；严重的自动移出排行榜）。记不上不影响同步
        await Promise.all((flags ?? []).slice(0, 6).map((f) => rest('rpc/ac_flag', {
          method: 'POST', body: JSON.stringify({ p: uid, p_kind: f.kind, p_severe: f.severe, p_detail: f.detail }),
        }).catch(() => {})));
        if (seen) await rest('rpc/ac_seen', { method: 'POST', body: JSON.stringify({ p: uid, p_ip: net, p_dev: device ?? '' }) }).catch(() => {});
        return json({ state: data, rev, now, applied, ack, results });
      }
    }
    return json({ error: 'busy' }, 409);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
