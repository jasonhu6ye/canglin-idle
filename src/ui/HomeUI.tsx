import { useEffect, useState } from 'react';
import { ITEMS, type MapNode } from '../core/data';
import {
  affordable, atPortal, BUILD_CATS, BUILDS, buildDef, comfortLevel, comfortOf, COMFORT_SPEED, COMFORT_STEPS, COMFORT_XP, enterHome, HOME_PLOT_MAX, HOME_SIZES,
  HOME_UPGRADES, collectHome, homeComfort, homeFieldId, homeProduce, homeLevel, homePlots, homeSize, isTrophy, leaveHome, upgradeHome,
  canPet, deliverOrder, homeHasBoard, homeOrders, homePets, ORDER_ALL_BONUS, PET_REP, PETS, REP_COIN_BONUS, REP_STEPS, repLevel, VISITORS,
  type BuildCat, type BuildDef,
} from '../core/home';
import type { GameState } from '../core/types';
import { HOME_CLICK, HOME_MSG, HOME_ORDERS, HOME_TOOL, homeIcons, type HomeTool } from '../game/IslandScene';
import { fieldCounts } from '../core/farm';
import { paintFloor, paintThing, paintWall } from '../game/homeArt';
import { store } from '../store';
import { fmtNum } from './format';
import { emitToGame, onGameEvent } from './GameCanvas';
import { Icon, itemImageUrl } from './icons';
import { tl } from '../i18n';

homeIcons.url = itemImageUrl;

/** 城里的家园传送门：说明 + 进岛按钮 */
export function PortalSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const here = atPortal(s) === node.id;
  const things = s.home?.things.length ?? 0;
  return (
    <div className="sheet portal-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{tl('通往你自己的家园岛屿')}</small>
      </div>
      <div className="pad">
        <p>{tl`穿过传送门就到了你的家园岛屿：一座 ${homeSize(s)}×${homeSize(s)} 格的海岛，可以自己盖墙、铺地板、摆家具，造一座自己的房子。`}</p>
        <ul className="portal-tips">
          <li>{tl('岛上能放灶台、熔炉、铁砧、工作台、制弓台、药剂台，站在岛上就能直接干活。')}</li>
          <li>{tl('放一个储物箱，岛上就能存取仓库，干活背包满了也直接存进去。')}</li>
          <li>{tl('首领的战旗和战利品可以摆出来当装饰。')}</li>
          <li>{tl`能自己摆家园农田（最多 ${HOME_PLOT_MAX} 块），所有已解锁的作物都能种。`}</li>
          <li>{tl('鸡舍下蛋、蜂箱产蜜、苹果树结果、堆肥箱出肥料，人不在也照样攒，回岛点一下就收进仓库。')}</li>
          <li>{tl('摆一块订单告示板，每天有访客来下订单：交上家园产出的东西换金币和岛屿声望，声望升级解锁鱼塘、羊圈、灯塔等新建筑。')}</li>
          <li>{tl('有猫窝、狗屋，岛上就会来一只猫、一只狗，每天摸一摸也加声望。')}</li>
          <li>{tl('摆家具和饰品能提高舒适度，舒适度越高，所有技能的经验和干活速度加成越多（人不在岛上也算）。')}</li>
          <li>{tl('岛上做不了的任务（采集、打怪），点「继续工作」会自己从传送门出来去做。')}</li>
        </ul>
        {things > 0 && <p className="muted">{tl`岛上已经摆了 ${things} 件东西。`}</p>}
        <div className="go">
          {here
            ? <button className="primary" onClick={() => { store.dispatch(enterHome); onClose(); }}>{tl('进入家园岛屿')}</button>
            : <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>{tl`寻路去${node.name}`}</button>}
        </div>
      </div>
    </div>
  );
}

/** 建造面板的预览图（和岛上画的是同一张） */
const previews = new Map<string, string>();
function preview(d: BuildDef): string | undefined {
  if (d.id.startsWith('deco:')) return itemImageUrl(d.id.slice(5));
  let url = previews.get(d.id);
  if (!url) {
    const c = d.wall ? paintWall(d.id, 10) : d.cat === 'floor' ? paintFloor(d.id, 0, 0) : paintThing(d.id, d.w, d.h);
    url = c.toDataURL();
    previews.set(d.id, url);
  }
  return url;
}

const have = (s: GameState, id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0);

/** 岛上的操作条：建造、回城；建造面板 */
export function HomeHud({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<BuildCat>('struct');
  const [tool, setToolRaw] = useState<HomeTool>(null);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState<'comfort' | 'farm' | 'rep' | null>(null);
  const [full, setFull] = useState(false);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const setTool = (t: HomeTool) => { setToolRaw(t); setFull(false); emitToGame(HOME_TOOL, t); };
  // 场景里右键退出建造时同步按钮状态
  useEffect(() => onGameEvent(HOME_TOOL, (t: HomeTool) => setToolRaw(t)), []);
  useEffect(() => onGameEvent(HOME_MSG, (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1600); }), []);
  // 点了岛上的告示板：打开订单
  useEffect(() => onGameEvent(HOME_ORDERS, () => { setInfo('rep'); setOpen(false); setTool(null); }), []);
  if (!s.home?.inside) return null;
  const lv = homeLevel(s);
  const up = HOME_UPGRADES[lv];
  const list: BuildDef[] = cat === 'trophy'
    ? [...new Set([...Object.keys(s.bank), ...Object.keys(s.bag)])].filter(isTrophy).map((id) => buildDef(`deco:${id}`)!).filter(Boolean)
    : BUILDS.filter((d) => d.cat === cat);
  const close = () => { setOpen(false); setTool(null); };
  const score = homeComfort(s.home);
  const clv = comfortLevel(score);
  const plots = homePlots(s);
  const ready = homeProduce(s.home, Date.now());
  const readyN = Object.values(ready).reduce((a, b) => a + b, 0);
  const collectAll = () => {
    let got: Record<string, number> = {};
    store.dispatch((g) => { const r = collectHome(g, Date.now()); got = r.got; return r.state; });
    const text = Object.entries(got).map(([id, n]) => tl`${ITEMS[id]?.name ?? id} ×${n}`).join(tl('、'));
    if (text) { setMsg(tl`收进仓库：${text}`); setTimeout(() => setMsg(''), 2000); }
  };
  const toggle = (k: 'comfort' | 'farm' | 'rep') => { setInfo(info === k ? null : k); close(); };
  const rlv = repLevel(s.home.rep ?? 0);
  const todo = homeHasBoard(s) ? homeOrders(s, Date.now()).filter((o) => !o.done).length : 0;
  return (
    <>
      <div className="home-bar">
        <b>{tl('家园岛屿')}</b> <small className="muted">{homeSize(s)}×{homeSize(s)}</small>
        <button className={`pill ${info === 'comfort' ? 'on' : ''}`} onClick={() => toggle('comfort')} title={tl('舒适度')}>{tl`舒适 ${clv} 级`}</button>
        <button className={`pill ${info === 'rep' ? 'on' : ''}`} onClick={() => toggle('rep')} title={tl('岛屿声望和访客订单')}>{tl`声望 ${rlv} 级`}{todo > 0 && <i className="dot-badge">{todo}</i>}</button>
        {readyN > 0 && <button className="pill on" onClick={collectAll} title={Object.entries(ready).map(([id, n]) => `${ITEMS[id]?.name} ×${n}`).join(tl('、'))}>{tl`收取 ${readyN}`}</button>}
        {plots.length > 0 && <button className={`pill ${info === 'farm' ? 'on' : ''}`} onClick={() => toggle('farm')}>{tl`农田 ${plots.length}/${HOME_PLOT_MAX}`}</button>}
        <button className={`pill ${open ? 'on' : ''}`} onClick={() => { setInfo(null); if (open) close(); else setOpen(true); }}>{open ? tl('收起建造') : tl('建造')}</button>
        <button className="pill" onClick={() => { close(); store.dispatch(leaveHome); }}>{tl('回城')}</button>
      </div>
      {msg && <div className="home-msg">{msg}</div>}
      {info === 'comfort' && <ComfortCard s={s} score={score} lv={clv} onClose={() => setInfo(null)} />}
      {info === 'rep' && <RepCard s={s} onClose={() => setInfo(null)} onMsg={(m) => { setMsg(m); setTimeout(() => setMsg(''), 2000); }} />}
      {info === 'farm' && (
        <div className="home-build frame">
          <b>{tl('家园农田')}</b> <small className="muted">{tl`${plots.length}/${HOME_PLOT_MAX} 块 · 点地块种 / 浇水 / 收获，点这里打开整块田`}</small>
          <ul className="home-fields">
            {plots.map((t) => {
              const id = homeFieldId(t.n!);
              const n = fieldCounts(s, id, Date.now());
              return (
                <li key={id} onClick={() => { setInfo(null); emitToGame(HOME_CLICK, id); }}>
                  <b>{tl`家园农田 ${t.n}`}</b>
                  <small className="muted">{tl`空地 ${n.empty} · 生长中 ${n.growing} · 可收获 `}<b className={n.ripe ? 'gold' : ''}>{n.ripe}</b>{s.settings.autoFarm?.[id] ? tl(' · 自动补种') : ''}</small>
                </li>
              );
            })}
          </ul>
          <div className="go"><button onClick={() => setInfo(null)}>{tl('关闭')}</button></div>
        </div>
      )}
      {open && tool && narrow && !full && (
        // 手机上选好要放的东西后，面板缩成一条，不挡住岛（10-27 全面检查：面板盖住下半屏，放东西要先拖镜头）
        <div className="home-build home-build-mini frame">
          {tool.kind === 'demolish' ? <span className="hb-mini-name">{tl('拆除：点要拆的东西，材料退回仓库')}</span> : (() => {
            const d = buildDef(tool.id);
            return d && (
              <span className="hb-mini-name">
                <img src={preview(d)} alt="" draggable={false} />
                <b>{d.name}</b>
                <span className="bl-cost">{d.cost.map((c) => <span key={c.item} className={have(s, c.item) >= c.qty ? '' : 'warn'}><Icon item={c.item} size={14} info={false} />{c.qty}<small>/{fmtNum(have(s, c.item))}</small></span>)}</span>
              </span>
            );
          })()}
          <span className="hb-mini-btns">
            <button className="pill" onClick={() => setFull(true)}>{tl('换一件')}</button>
            <button className="pill on" onClick={close}>{tl('完成')}</button>
          </span>
        </div>
      )}
      {open && (!tool || !narrow || full) && (
        <div className="home-build frame">
          <div className="chips-row">
            {BUILD_CATS.map((c) => <button key={c.id} className={`pill ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
            <button className={`pill danger ${tool?.kind === 'demolish' ? 'on' : ''}`} onClick={() => setTool(tool?.kind === 'demolish' ? null : { kind: 'demolish' })}>{tl('拆除')}</button>
          </div>
          <p className="muted small">
            {tool?.kind === 'demolish' ? tl('点（或拖过）要拆的东西，材料全部退回仓库。')
              : tool ? tl`点地面放置${buildDef(tool.id)?.name ?? ''}${buildDef(tool.id)?.wall || buildDef(tool.id)?.cat === 'floor' ? tl('，按住拖动能连续铺') : ''}。${'ontouchstart' in window ? tl('两指拖动移动镜头') : tl('右键取消')}。`
                : tl('选一件东西，再点岛上的空地放下。材料先用仓库、再用背包。')}
          </p>
          <ul className="build-list">
            {list.map((d) => {
              const locked = !!d.rep && rlv < d.rep;
              const ok = !locked && affordable(s, d.cost);
              const on = tool?.kind === 'build' && tool.id === d.id;
              return (
                <li key={d.id} className={`${on ? 'sel' : ''} ${ok ? '' : 'short'}`} onClick={() => setTool(on ? null : { kind: 'build', id: d.id })} title={d.desc}>
                  <span className="bl-pic"><img src={preview(d)} alt="" draggable={false} /></span>
                  <span className="bl-body">
                    <b>{d.name}</b> <small className="muted">{d.w}×{d.h}</small>{locked && <small className="warn">{tl` 声望 ${d.rep} 级解锁`}</small>}
                    <span className="bl-cost">
                      {d.cost.map((c) => (
                        <span key={c.item} className={have(s, c.item) >= c.qty ? '' : 'warn'}><Icon item={c.item} size={14} info={false} />{c.qty}<small>/{fmtNum(have(s, c.item))}</small></span>
                      ))}
                    </span>
                  </span>
                </li>
              );
            })}
            {!list.length && <li className="muted">{tl('仓库和背包里还没有首领战旗或战利品。')}</li>}
          </ul>
          {up && cat === 'struct' && (
            <div className="home-up">
              <b>{tl('扩建岛屿')}</b> {HOME_SIZES[lv]}×{HOME_SIZES[lv]} → {HOME_SIZES[lv + 1]}×{HOME_SIZES[lv + 1]}
              <span className="bl-cost">
                <span className={(s.bank.coins ?? 0) >= up.coins ? '' : 'warn'}><Icon item="coins" size={14} info={false} />{fmtNum(up.coins)}</span>
                {up.items.map((c) => <span key={c.item} className={have(s, c.item) >= c.qty ? '' : 'warn'}><Icon item={c.item} size={14} info={false} />{c.qty}<small>/{fmtNum(have(s, c.item))}</small></span>)}
              </span>
              <button className="pill on" disabled={(s.bank.coins ?? 0) < up.coins || !affordable(s, up.items)} onClick={() => store.dispatch(upgradeHome)}>{tl('扩建')}</button>
            </div>
          )}
          <div className="go"><button onClick={close}>{tl('完成')}</button></div>
        </div>
      )}
    </>
  );
}

/** 舒适度：分数、等级、下一级还差多少、现在的加成，以及最舒服的几件东西 */
function ComfortCard({ s, score, lv, onClose }: { s: GameState; score: number; lv: number; onClose: () => void }) {
  const next = COMFORT_STEPS[lv];
  const prev = lv ? COMFORT_STEPS[lv - 1] : 0;
  const pct = next ? Math.min(100, ((score - prev) / (next - prev)) * 100) : 100;
  const top = [...new Map((s.home?.things ?? []).map((t) => [t.id, buildDef(t.id)])).values()]
    .filter((d): d is BuildDef => !!d && comfortOf(d) > 0).sort((a, b) => comfortOf(b) - comfortOf(a)).slice(0, 6);
  return (
    <div className="home-build frame comfort-card">
      <b>{tl`舒适度 ${Math.floor(score)}`}</b> <small className="muted">{tl`${lv}/${COMFORT_STEPS.length} 级`}</small>
      <div className="comfort-bar"><i style={{ width: `${pct}%` }} /></div>
      <p className="small">{next ? tl`再攒 ${Math.ceil(next - score)} 点升到 ${lv + 1} 级` : tl('已经满级了')}
        {' · '}{tl`现在：所有技能经验 +${Math.round(lv * COMFORT_XP * 100)}%、干活速度 +${(lv * COMFORT_SPEED * 100).toFixed(1)}%`}</p>
      <p className="muted small">{tl('摆家具、饰品、户外摆件和战利品都能加舒适度，饰品和战利品加得最多；同一种东西摆得越多，后面的加得越少（最多算 6 件）。铺地板也加一点。人不在岛上、离线也照样有加成。')}</p>
      {top.length > 0 && <p className="small">{tl('最舒服的：')}{top.map((d) => tl`${d.name} +${comfortOf(d)}`).join(tl('、'))}</p>}
      <div className="go"><button onClick={onClose}>{tl('关闭')}</button></div>
    </div>
  );
}

/** 岛屿声望和访客订单（10-29）：声望进度、下一级解锁什么、今天的 3 张订单、宠物摸了没 */
function RepCard({ s, onClose, onMsg }: { s: GameState; onClose: () => void; onMsg: (m: string) => void }) {
  const now = Date.now();
  const rep = s.home?.rep ?? 0;
  const lv = repLevel(rep);
  const next = REP_STEPS[lv];
  const prev = lv ? REP_STEPS[lv - 1] : 0;
  const pct = next ? Math.min(100, ((rep - prev) / (next - prev)) * 100) : 100;
  const unlock = BUILDS.filter((d) => d.rep === lv + 1).map((d) => d.name);
  const board = homeHasBoard(s);
  const orders = homeOrders(s, now);
  const pets = homePets(s.home);
  const give = (i: number) => {
    const o = orders[i];
    const next = deliverOrder(store.state, i, Date.now());
    if (next === store.state) return;
    store.dispatch(() => next);
    const all = next.home?.orders?.list.every((x) => x.done);
    onMsg(tl`交给${VISITORS[o.who]}：金币 +${fmtNum(o.coins)}、声望 +${o.rep + (all ? ORDER_ALL_BONUS : 0)}`);
  };
  return (
    <div className="home-build frame comfort-card rep-card">
      <b>{tl`岛屿声望 ${rep}`}</b> <small className="muted">{tl`${lv}/${REP_STEPS.length} 级`}</small>
      <div className="comfort-bar rep-bar"><i style={{ width: `${pct}%` }} /></div>
      <p className="small">{next ? tl`再攒 ${next - rep} 点升到 ${lv + 1} 级` : tl('已经满级了')}
        {unlock.length > 0 && <>{' · '}{tl`下一级解锁：${unlock.join(tl('、'))}`}</>}
        {lv > 0 && <>{' · '}{tl`订单金币 +${Math.round(lv * REP_COIN_BONUS * 100)}%`}</>}</p>
      {!board ? <p className="muted small">{tl('在「户外」里盖一块订单告示板，每天就会有 3 位访客来下订单。')}</p> : (
        <>
          <p className="small"><b>{tl('今天的订单')}</b> <span className="muted">{tl`全部交完再给声望 +${ORDER_ALL_BONUS}，每天 0 点换新`}</span></p>
          <ul className="home-orders">
            {orders.map((o, i) => {
              const n = have(s, o.item);
              return (
                <li key={i} className={o.done ? 'done' : ''}>
                  <Icon item={o.item} size={24} />
                  <span className="ho-body">
                    <small className="muted">{VISITORS[o.who]}</small>
                    <b>{ITEMS[o.item]?.name} ×{o.qty}</b> <small className={n >= o.qty || o.done ? 'muted' : 'warn'}>{tl`有 ${fmtNum(n)}`}</small>
                    <span className="bl-cost"><span><Icon item="coins" size={14} info={false} />{fmtNum(o.coins)}</span><span>{tl`声望 +${o.rep}`}</span></span>
                  </span>
                  {o.done ? <span className="muted small">{tl('已交')}</span>
                    : <button className="pill on" disabled={n < o.qty} onClick={() => give(i)}>{tl('交付')}</button>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="muted small">
        {pets.length ? pets.map((k) => canPet(s, k, now) ? tl`${PETS[k].name}在等你摸摸（声望 +${PET_REP}）` : tl`今天摸过${PETS[k].name}了`).join(tl('；'))
          : tl('摆一个猫窝或狗屋，岛上会来一只猫或狗，每天摸一次加声望。')}
      </p>
      <div className="go"><button onClick={onClose}>{tl('关闭')}</button></div>
    </div>
  );
}
