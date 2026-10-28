import { useEffect, useRef, useState } from 'react';
import { ITEMS, MONSTERS, NODES } from '../core/data';
import { HW_ALTAR, HW_BOX, HW_COOLDOWN, HW_END, HW_MOUNT, HW_MOUNT_COST, HW_POINT, HW_TIERS, hwBossId, hwFight, hwOpen, hwShopOpen, hwWait } from '../core/halloween';
import { buyPumpkinMount, combatEstimate, combatLevel, startNow, summonPumpkin } from '../core/sim';
import { pumpkinMountIconUrl } from '../game/pumpkinArt';
import type { GameState } from '../core/types';
import type { MapNode } from '../core/data';
import { kingFrames, posterAltarUrl, posterBannerUrl, posterRewardUrl, pumpkinBoxUrl, pumpkinPointUrl } from '../game/halloweenArt';
import { store } from '../store';
import { fmtNum } from './format';
import { FINE_POINTER, openNodeSheet } from './itemOpen';
import { newsPending, onNewsClosed } from './News';
import { guideShowing, onGuideClosed } from './Guide';
import { tl } from '../i18n';

/*
 * 万圣节活动界面（用户 10-24）：祭坛召唤面板、活动公告（带贴图）、地图上的活动提示条。
 */

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
/** 离活动结束还有多久：x 天 x 小时 */
export const hwLeft = (now: number) => {
  const ms = Math.max(0, HW_END - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d ? tl`${d} 天 ${h} 小时` : tl`${h} 小时 ${Math.floor((ms % 3_600_000) / 60_000)} 分`;
};
const have = (s: GameState, id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0);

/** 南瓜王待机动画（12 帧循环） */
function KingAnim({ d, size = 96 }: { d: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frames = kingFrames(d);
    let i = 0;
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, 96, 96);
      ctx.drawImage(frames[i++ % frames.length], 0, 0);
    };
    draw();
    const t = setInterval(draw, 125);
    return () => clearInterval(t);
  }, [d]);
  return <canvas ref={ref} width={96} height={96} className="hw-king" style={{ width: size, height: size }} />;
}

/** 南瓜积分兑换（10-27）：南瓜坐骑，10 月 31 日以前不显示 */
function PumpkinShop({ s, now }: { s: GameState; now: number }) {
  if (!hwShopOpen(now)) return null;
  const pts = s.bank[HW_POINT] ?? 0;
  const got = !!s.halloween?.mount;
  const it = ITEMS[HW_MOUNT];
  return (
    <div className="hw-shop">
      <img className="hw-shop-icon" src={pumpkinMountIconUrl()} alt="" />
      <div>
        <b>{it.name}</b> <span className="good">{tl('移动速度 +200%')}</span>
        <div className="muted small">{it.desc}</div>
        <div className="hw-shop-row">
          <span><img src={pumpkinPointUrl()} alt="" className="inline-icon" />{tl` ${fmtNum(HW_MOUNT_COST)} 南瓜积分`}</span>
          {got ? <span className="good">{tl('已兑换，在仓库里')}</span>
            : <button className="primary" disabled={pts < HW_MOUNT_COST} onClick={() => store.dispatch((g) => buyPumpkinMount(g, Date.now()))}>
              {pts < HW_MOUNT_COST ? tl`还差 ${fmtNum(HW_MOUNT_COST - pts)} 积分` : tl('兑换')}
            </button>}
        </div>
      </div>
    </div>
  );
}

/** 祭坛面板：选难度召唤南瓜王 */
export function AltarSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const now = useNow();
  const open = hwOpen(now);
  const wait = hwWait(s.halloween?.last, now);
  const summoned = s.halloween?.summoned;
  const [pick, setPick] = useState(() => {
    const cl = combatLevel(s);
    // 默认选一档打得过的：战斗等级够得着的最高一档
    let d = 0;
    HW_TIERS.forEach((h, k) => { if (cl >= h.lv - 5) d = k; });
    return d;
  });
  const fighting = s.queue[0]?.action === (summoned !== undefined ? hwFight(summoned) : '');
  const summon = () => {
    store.dispatch((g) => summonPumpkin(g, pick, Date.now()));
    onClose();
  };
  const resume = () => {
    if (summoned === undefined) return;
    store.dispatch((g) => startNow(g, hwFight(summoned), { type: 'count', count: 1 }));
    onClose();
  };
  return (
    <div className="sheet hw-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{open ? tl`活动剩余 ${hwLeft(now)} · 11 月 1 日关闭` : tl('活动已结束')}</small>
      </div>
      <img className="hw-poster" src={posterBannerUrl()} alt="" />
      <div className="hw-stats">
        <span><img src={pumpkinPointUrl()} alt="" />{tl(' 南瓜积分 ')}<b>{fmtNum(s.bank[HW_POINT] ?? 0)}</b></span>
        <span><img src={pumpkinBoxUrl()} alt="" />{tl(' 未开礼盒 ')}<b>{fmtNum(have(s, HW_BOX))}</b></span>
        <button className="link" onClick={openHalloween}>{tl('活动说明 ›')}</button>
      </div>
      <PumpkinShop s={s} now={now} />
      {!open ? (
        <p className="pad muted">{tl('万圣节活动已经在 11 月 1 日结束，南瓜王回去了。手里的南瓜积分还可以在上面兑换。')}</p>
      ) : summoned !== undefined ? (
        <div className="hw-summoned">
          <KingAnim d={summoned} size={72} />
          <div>
            <b>{MONSTERS[hwBossId(summoned)].name}</b>{tl` Lv${HW_TIERS[summoned].lv} 已被召唤，正在祭坛等你。`}<div className="muted">{tl`打赢一次就会离开，掉 ${HW_TIERS[summoned].boxes} 个南瓜礼盒。没打赢可以回来接着打。`}</div>
            {!fighting && <button className="primary" onClick={resume}>{tl('前往挑战')}</button>}
            {fighting && <div className="good">{tl('正在挑战中…')}</div>}
          </div>
        </div>
      ) : (
        <>
          <p className="pad">{tl('选一档难度，召唤万圣节限定首领「南瓜王」。每小时只能召唤一次，召唤后角色会自己走到祭坛开打。')}</p>
          <ul className="action-list hw-tiers">
            {HW_TIERS.map((h, d) => {
              const m = MONSTERS[hwBossId(d)];
              const e = combatEstimate(s, m);
              const cls = e.rating === tl('轻松') ? 'good' : e.rating === tl('适中') ? '' : 'warn';
              return (
                <li key={d} className={pick === d ? 'sel' : ''} onClick={() => setPick(d)}>
                  <span className="hw-tier-num">{d + 1}</span>
                  <span className="act-body">
                    <span className="row1"><b>{h.name}</b> <span className="muted">{tl`Lv${h.lv} · 生命 ${fmtNum(m.hp)}`}</span></span>
                    <span className="row2">{tl('奖励 ')}<img src={pumpkinBoxUrl()} alt="" className="inline-icon" />{tl` 南瓜礼盒 ×${h.boxes}`}
                      <span className={cls}>{tl` · 评估：${e.killMs === Infinity ? tl('打不动（回血比你的输出快）') : tl`${e.rating}（约 ${Math.max(1, Math.round(e.killMs / 1000))} 秒，掉血约 ${Math.round(e.taken)}）`}`}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="go">
            {wait > 0 && <span className="muted">{tl`召唤冷却中，${clock(wait)} 后可以再召唤`}</span>}
            <button className="primary" disabled={wait > 0} onClick={summon}>{tl`召唤南瓜王 · ${HW_TIERS[pick].name}`}</button>
          </div>
        </>
      )}
      <p className="pad muted small">{hwShopOpen(now) ? tl`冷却 ${HW_COOLDOWN / 3_600_000} 小时从召唤那一刻开始算。` : tl`南瓜积分在活动结束前可以兑换限定物品，兑换商店即将开放。冷却 ${HW_COOLDOWN / 3_600_000} 小时从召唤那一刻开始算。`}</p>
    </div>
  );
}

const listeners = new Set<() => void>();
export function openHalloween() {
  listeners.forEach((f) => f());
}
const SEEN = 'canglin-hw-notice';

/** 万圣节活动公告：带贴图的说明、五档难度、指引和寻路按钮 */
export function HalloweenNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const f = () => setOpen(true);
    listeners.add(f);
    // 第一次进游戏（看过新手指引以后）自动弹一次；有更新公告的话等它关掉再弹
    const auto = () => {
      try {
        if (guideShowing() || !hwOpen(Date.now()) || localStorage.getItem(SEEN) || !localStorage.getItem('canglin-guide-seen')) return;
      } catch { return; }
      setOpen(true);
    };
    const off = onNewsClosed(auto);
    const off2 = onGuideClosed(auto);
    if (!newsPending()) auto();
    return () => { listeners.delete(f); off(); off2(); };
  }, []);
  const now = useNow(30_000);
  if (!open) return null;
  const close = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* 存不了就算了 */ }
    setOpen(false);
  };
  const go = () => {
    close();
    store.requestWalk(HW_ALTAR);
  };
  const altar = NODES.find((n) => n.id === HW_ALTAR)!;
  return (
    <div className="item-popup" onClick={close}>
      <div className="item-popup-body frame hw-notice" onClick={(e) => e.stopPropagation()}>
        <div className="hw-hero">
          <img src={posterBannerUrl()} alt="" />
          <div className="hw-title">
            <small>{tl('限时活动 · 11 月 1 日结束')}</small>{tl('万圣节 · 南瓜王降临')}</div>
        </div>
        <div className="news-body">
          <p className="hw-lead">{tl('南瓜王从月夜里醒来了！苍岭城东门外立起了一座')}<b>{tl('万圣节活动祭坛')}</b>{tl('，在祭坛召唤南瓜王，打败它拿')}<b>{tl('南瓜礼盒')}</b>{tl('，开出')}<b>{tl('南瓜积分')}</b>{tl('，活动结束前兑换限定奖励。')}{hwOpen(now) ? <>{tl(' 活动还剩 ')}<b className="gold">{hwLeft(now)}</b>{tl('。')}</> : tl(' 活动已经结束。')}
          </p>
          <div className="hw-cards">
            <figure>
              <img src={posterAltarUrl()} alt="" />
              <figcaption><b>{tl('① 活动祭坛')}</b>{tl('在苍岭城东门外，和城镇连在一起。点祭坛选难度召唤，')}<b>{tl('每小时一次')}</b>{tl('。')}</figcaption>
            </figure>
            <figure>
              <div className="hw-king-box"><KingAnim d={4} size={90} /></div>
              <figcaption><b>{tl('② 南瓜王')}</b>{tl('头戴王冠、手持南瓜灯权杖，每 4 下放一次大招「南瓜炸弹」，伤害 ×2.6。')}</figcaption>
            </figure>
            <figure>
              <img src={posterRewardUrl()} alt="" />
              <figcaption><b>{tl('③ 南瓜礼盒')}</b>{tl('打开得 8-15 南瓜积分和金币，积分直接存进仓库。')}</figcaption>
            </figure>
          </div>
          <h3>{tl('五档难度')}</h3>
          <table className="hw-table">
            <thead><tr><th>{tl('难度')}</th><th>{tl('南瓜王等级')}</th><th>{tl('礼盒')}</th></tr></thead>
            <tbody>
              {HW_TIERS.map((h, d) => (
                <tr key={d}><td>{h.name}</td><td>Lv{h.lv}</td><td><img src={pumpkinBoxUrl()} alt="" className="inline-icon" /> ×{h.boxes}</td></tr>
              ))}
            </tbody>
          </table>
          <h3>{tl('活动指引')}</h3>
          <ol className="hb-steps">
            <li>{tl`点下面的「寻路去祭坛」，角色会自己走到苍岭城东门外的${altar.name}（世界地图里选「活动」也能找到）。`}</li>
            <li>{tl('点祭坛，选一档难度后点「召唤南瓜王」，角色会自动开打。战斗前记得在食物栏放好食物。')}</li>
            <li>{tl`打赢后礼盒进背包，在背包里${FINE_POINTER ? tl('右键') : tl('点一下')}礼盒就能打开，积分自动存进仓库。`}</li>
            <li>{tl('没打赢也没关系，召唤出来的南瓜王会一直在祭坛等你，回来点「前往挑战」接着打。')}</li>
            <li>{hwShopOpen(now) ? tl('11 月 1 日活动关闭，南瓜王离开。南瓜积分在祭坛面板里兑换限定奖励，活动结束后也能换。') : tl('11 月 1 日活动关闭，南瓜王离开。南瓜积分在兑换商店开放后使用。')}</li>
          </ol>
        </div>
        <div className="go">
          <button onClick={close}>{tl('知道了')}</button>
          {hwOpen(now) && <button className="primary" onClick={go}>{tl('寻路去祭坛')}</button>}
        </div>
      </div>
    </div>
  );
}

/** 地图上的活动提示条：南瓜王能不能召唤、冷却还剩多久，点一下打开祭坛，旁边一个寻路按钮 */
export function HalloweenChip({ s }: { s: GameState }) {
  const now = useNow();
  if (!hwOpen(now)) return null;
  const wait = hwWait(s.halloween?.last, now);
  const summoned = s.halloween?.summoned;
  const text = summoned !== undefined ? tl`南瓜王在祭坛等你 · ${HW_TIERS[summoned].name}` : wait > 0 ? tl`南瓜王冷却 ${clock(wait)}` : tl('南瓜王可以召唤了！');
  return (
    <div className={`chip hw-chip ${summoned !== undefined || wait <= 0 ? 'ready' : ''}`}>
      <button className="hw-chip-main" onClick={() => openNodeSheet(HW_ALTAR)}>
        <img src={pumpkinPointUrl()} alt="" /> <b>{tl('万圣节')}</b> {text}
      </button>
      <button className="hw-chip-go" onClick={() => store.requestWalk(HW_ALTAR)}>{tl('寻路')}</button>
      <button className="hw-chip-go" onClick={openHalloween}>{tl('说明')}</button>
    </div>
  );
}
