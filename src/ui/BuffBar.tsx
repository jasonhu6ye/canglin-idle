import { useEffect, useRef, useState } from 'react';
import { ACTIONS, BUFF_NAME, ITEMS } from '../core/data';
import { rainBonus } from '../core/sim';
import { PARTY_MAX, PARTY_XP_PER, partySize, partyXpPct } from '../core/party';
import { aptOf } from '../core/ranch';
import type { BuffKind, GameState, GmKind, RegionId } from '../core/types';
import { activeGm, GM_KIND_NAME } from '../core/gm';
import { isRaining, RAIN_FISH } from '../core/weather';
import { tl } from '../i18n';

/**
 * 增益栏（用户 10-23）：时钟左边一排像素小图标，料理增益、雨天钓鱼、骑乘；
 * 下面写剩余时间，点一下（电脑端悬停）看说明。
 */
type IconKey = BuffKind | GmKind | 'rain' | 'mount' | 'horse' | 'party';
const PAL: Record<string, string> = {
  k: '#1a0f08', w: '#ffffff', g: '#e8b84a', G: '#a07020', r: '#e0503a', R: '#8a2a1e', b: '#6ac0ff', B: '#2a6ab0',
  s: '#c8ccd4', S: '#7a808a', n: '#8a5a30', N: '#5a3a1e', y: '#fff07a', p: '#c070ff', P: '#7030b0', e: '#7ad860', E: '#3a8a30',
};
// 9×9 像素画
const ART: Record<IconKey, string[]> = {
  atk: ['.......sw', '......ssk', '.....ssk.', '....ssk..', '.n.ssk...', '..nsk....', '..Nn.....', '.N..n....', 'N........'],
  str: ['...rrr...', '..rrRrr..', '.rryrRrr.', '.ryyyrRr.', 'rryyyyrRr', 'rryyyyrrr', '.rryyyrr.', '..rrrrr..', '...RRR...'],
  def: ['.sssssss.', 'sswwbbbSs', 'swwbbbbBs', 'swbbbbbBs', 'sbbbbbbBs', '.sbbbbBs.', '.sbbbBBs.', '..sbBBs..', '...sss...'],
  speed: ['...gggg..', '..gyyyyg.', '.g.....g.', '..gyyyg..', '...gyg...', '..g.y.g..', '.g.yyy.g.', '..gyyyyg.', '...gggg..'],
  xp: ['....y....', '...yyy...', 'yyyywyyyy', '.yywwwyy.', '..yywyy..', '..yyyyy..', '.yyy.yyy.', '.yy...yy.', 'y.......y'],
  rain: ['....b....', '...bbb...', '..bbwbb..', '..bwbbb..', '...bbb...', '.........', '.B.eeE...', 'BBeeeeEk.', '.B.eeE...'],
  party: ['...yyy...', '...yyy...', '.b..y..b.', 'bbb...bbb', 'bbbyyybbb', '.b.yyy.b.', 'bbbyyybbb', 'bbbyyybbb', 'bbbyyybbb'],
  horse: ['....NN...', '...NnnN..', '..NnnknN.', '.NnnnnnNN', 'NnnnnNnN.', 'NnwnN.NnN', '.NNN..NnN', '......NnN', '.....NnnN'],
  drop: ['....p....', '...pwp...', '..ppwpp..', '.pppppPp.', 'ppppppPPp', '.pppppPp.', '..pppPp..', '...pPp...', '....p....'],
  coins: ['..gggg...', '.gyyyyg..', 'gyyGGyyg.', 'gyGyyyyg.', 'gyyGGyyg.', 'gyyyyGyg.', 'gyGGGyyg.', '.gyyyyg..', '..gggg...'],
  yield: ['.ee......', 'eEEe.....', 'eEEe.y...', '.ee..y...', '...yyyyy.', '.....y...', '.....y.ee', '.....eEEe', '......ee.'],
  hp: ['.rr...rr.', 'rwrr.rrRr', 'rwrrrrrRr', 'rrrrrrrRr', '.rrrrrRr.', '..rrrRr..', '...rRr...', '....r....', '.........'],
  mount: ['.S.....S.', 'SsS...SsS', 'SssSSSssS', 'SskssskS.', 'SsssssssS', '.SsrwrsS.', '..SsssS..', '...SSS...', '.........'],
};
const urls: Partial<Record<IconKey, string>> = {};
function iconUrl(k: IconKey) {
  if (urls[k]) return urls[k]!;
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 9;
  const ctx = c.getContext('2d')!;
  ART[k].forEach((row, y) => [...row].forEach((ch, x) => {
    if (!PAL[ch]) return;
    ctx.fillStyle = PAL[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return (urls[k] = c.toDataURL());
}

const BORDER: Record<IconKey, string> = { drop: '#c070ff', coins: '#e8b84a', yield: '#7ad860', hp: '#e0503a', atk: '#c5cad2', str: '#e0503a', def: '#6ac0ff', speed: '#e8b84a', xp: '#fff07a', rain: '#6ac0ff', mount: '#c070ff', horse: '#c070ff', party: '#7ad860' };

interface Buff { key: string; icon: IconKey; name: string; value: string; time?: string; desc: string; dim?: boolean }

function buffsOf(s: GameState, region: RegionId, now: number): Buff[] {
  const out: Buff[] = [];
  for (const [k, b] of Object.entries(s.buffs ?? {}) as [BuffKind, { pct: number; ms: number }][]) {
    const m = Math.ceil(b.ms / 60000);
    out.push({ key: k, icon: k, name: BUFF_NAME[k], value: `+${Math.round(b.pct * 100)}%`, time: m >= 60 ? tl`${Math.floor(m / 60)}时` : tl`${m}分`, desc: tl`料理增益：${BUFF_NAME[k]} +${Math.round(b.pct * 100)}%，还剩 ${m} 分钟` });
  }
  // 管理员发的增益（用户 10-26）：只显示名字和标签，不写「GM」
  for (const b of activeGm(s, now)) {
    const m = Math.ceil((b.to - now) / 60000);
    const t = m >= 60 ? tl`${Math.floor(m / 60)}时` : tl`${m}分`;
    out.push({ key: `gm-${b.id}`, icon: b.kind, name: b.name, value: `+${b.pct}%`, time: b.tag || t, desc: tl`${GM_KIND_NAME[b.kind]} +${b.pct}%，还剩 ${m >= 60 ? tl`${Math.floor(m / 60)} 小时 ${m % 60} 分` : tl`${m} 分钟`}` });
  }
  if (isRaining(region, now)) {
    const a = ACTIONS[s.queue[0]?.action ?? ''];
    const on = !s.paused && a?.kind === 'skill' && rainBonus(s, a, now) > 0;
    out.push({ key: 'rain', icon: 'rain', name: tl('雨天钓鱼'), value: `+${Math.round(RAIN_FISH * 100)}%`, time: tl('下雨'), desc: tl`正在下雨：在下雨的钓点钓鱼快 ${Math.round(RAIN_FISH * 100)}%，雨停就没了${on ? tl('（正在生效）') : ''}`, dim: !on });
  }
  if (partySize() > 0) {
    const n = partySize();
    out.push({ key: 'party', icon: 'party', name: tl('组队经验'), value: `+${Math.round(partyXpPct() * 100)}%`, desc: tl`组队中（${n} 人）：所有技能经验 +${Math.round(partyXpPct() * 100)}%。每个队员 +${PARTY_XP_PER * 100}%，5 人满队 +${PARTY_MAX * PARTY_XP_PER * 100}%` });
  }
  if (s.mounted && s.equipment.mount) {
    const mv = ITEMS[s.equipment.mount]?.equip?.move ?? 0;
    out.push({ key: 'mount', icon: aptOf(s.equipment.mount) ? 'horse' : 'mount', name: tl('骑乘'), value: `+${Math.round(mv * 100)}%`, desc: tl`骑着${ITEMS[s.equipment.mount].name}：移动速度 +${Math.round(mv * 100)}%` });
  }
  return out;
}

export function BuffBar({ s, region }: { s: GameState; region: RegionId }) {
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);
  const list = buffsOf(s, region, now);
  if (!list.length) return null;
  const cur = list.find((b) => b.key === open);
  return (
    <div className="buff-bar" ref={ref}>
      {list.map((b) => (
        <button key={b.key} className={`buff-ico ${b.dim ? 'dim' : ''} ${open === b.key ? 'on' : ''}`} title={b.desc} style={{ borderColor: BORDER[b.icon] }}
          onClick={() => setOpen(open === b.key ? null : b.key)}>
          <img src={iconUrl(b.icon)} alt={b.name} />
          <small>{b.time ?? b.value}</small>
        </button>
      ))}
      {cur && <div className="buff-tip frame"><b>{cur.name} {cur.value}</b><span>{cur.desc}</span></div>}
    </div>
  );
}
