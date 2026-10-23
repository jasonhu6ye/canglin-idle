import { useEffect, useState } from 'react';
import type { MapNode } from '../core/data';
import {
  affordable, atPortal, BUILD_CATS, BUILDS, buildDef, enterHome, HOME_SIZES, HOME_UPGRADES, homeLevel, homeSize, isTrophy, leaveHome, upgradeHome,
  type BuildCat, type BuildDef,
} from '../core/home';
import type { GameState } from '../core/types';
import { HOME_MSG, HOME_TOOL, homeIcons, type HomeTool } from '../game/IslandScene';
import { paintFloor, paintThing, paintWall } from '../game/homeArt';
import { store } from '../store';
import { fmtNum } from './format';
import { emitToGame, onGameEvent } from './GameCanvas';
import { Icon, itemImageUrl } from './icons';

homeIcons.url = itemImageUrl;

/** 城里的家园传送门：说明 + 进岛按钮 */
export function PortalSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const here = atPortal(s) === node.id;
  const things = s.home?.things.length ?? 0;
  return (
    <div className="sheet portal-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
        <small className="muted">通往你自己的家园岛屿</small>
      </div>
      <div className="pad">
        <p>穿过传送门就到了你的家园岛屿：一座 {homeSize(s)}×{homeSize(s)} 格的海岛，可以自己盖墙、铺地板、摆家具，造一座自己的房子。</p>
        <ul className="portal-tips">
          <li>岛上能放灶台、熔炉、铁砧、工作台、制弓台、药剂台，站在岛上就能直接干活。</li>
          <li>放一个储物箱，岛上就能存取仓库，干活背包满了也直接存进去。</li>
          <li>首领的战旗和战利品可以摆出来当装饰。</li>
          <li>岛上做不了的任务（采集、打怪），点「继续工作」会自己从传送门出来去做。</li>
        </ul>
        {things > 0 && <p className="muted">岛上已经摆了 {things} 件东西。</p>}
        <div className="go">
          {here
            ? <button className="primary" onClick={() => { store.dispatch(enterHome); onClose(); }}>进入家园岛屿</button>
            : <button className="primary" onClick={() => { store.requestWalk(node.id); onClose(); }}>寻路去{node.name}</button>}
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
  const setTool = (t: HomeTool) => { setToolRaw(t); emitToGame(HOME_TOOL, t); };
  // 场景里右键退出建造时同步按钮状态
  useEffect(() => onGameEvent(HOME_TOOL, (t: HomeTool) => setToolRaw(t)), []);
  useEffect(() => onGameEvent(HOME_MSG, (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1600); }), []);
  if (!s.home?.inside) return null;
  const lv = homeLevel(s);
  const up = HOME_UPGRADES[lv];
  const list: BuildDef[] = cat === 'trophy'
    ? [...new Set([...Object.keys(s.bank), ...Object.keys(s.bag)])].filter(isTrophy).map((id) => buildDef(`deco:${id}`)!).filter(Boolean)
    : BUILDS.filter((d) => d.cat === cat);
  const close = () => { setOpen(false); setTool(null); };
  return (
    <>
      <div className="home-bar">
        <b>家园岛屿</b> <small className="muted">{homeSize(s)}×{homeSize(s)}</small>
        <button className={`pill ${open ? 'on' : ''}`} onClick={() => (open ? close() : setOpen(true))}>{open ? '收起建造' : '建造'}</button>
        <button className="pill" onClick={() => { close(); store.dispatch(leaveHome); }}>回城</button>
      </div>
      {msg && <div className="home-msg">{msg}</div>}
      {open && (
        <div className="home-build frame">
          <div className="chips-row">
            {BUILD_CATS.map((c) => <button key={c.id} className={`pill ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
            <button className={`pill danger ${tool?.kind === 'demolish' ? 'on' : ''}`} onClick={() => setTool(tool?.kind === 'demolish' ? null : { kind: 'demolish' })}>拆除</button>
          </div>
          <p className="muted small">
            {tool?.kind === 'demolish' ? '点（或拖过）要拆的东西，材料全部退回仓库。'
              : tool ? `点地面放置${buildDef(tool.id)?.name ?? ''}${buildDef(tool.id)?.wall || buildDef(tool.id)?.cat === 'floor' ? '，按住拖动能连续铺' : ''}。${'ontouchstart' in window ? '两指拖动移动镜头' : '右键取消'}。`
                : '选一件东西，再点岛上的空地放下。材料先用仓库、再用背包。'}
          </p>
          <ul className="build-list">
            {list.map((d) => {
              const ok = affordable(s, d.cost);
              const on = tool?.kind === 'build' && tool.id === d.id;
              return (
                <li key={d.id} className={`${on ? 'sel' : ''} ${ok ? '' : 'short'}`} onClick={() => setTool(on ? null : { kind: 'build', id: d.id })} title={d.desc}>
                  <span className="bl-pic"><img src={preview(d)} alt="" draggable={false} /></span>
                  <span className="bl-body">
                    <b>{d.name}</b> <small className="muted">{d.w}×{d.h}</small>
                    <span className="bl-cost">
                      {d.cost.map((c) => (
                        <span key={c.item} className={have(s, c.item) >= c.qty ? '' : 'warn'}><Icon item={c.item} size={14} info={false} />{c.qty}<small>/{fmtNum(have(s, c.item))}</small></span>
                      ))}
                    </span>
                  </span>
                </li>
              );
            })}
            {!list.length && <li className="muted">仓库和背包里还没有首领战旗或战利品。</li>}
          </ul>
          {up && cat === 'struct' && (
            <div className="home-up">
              <b>扩建岛屿</b> {HOME_SIZES[lv]}×{HOME_SIZES[lv]} → {HOME_SIZES[lv + 1]}×{HOME_SIZES[lv + 1]}
              <span className="bl-cost">
                <span className={(s.bank.coins ?? 0) >= up.coins ? '' : 'warn'}><Icon item="coins" size={14} info={false} />{fmtNum(up.coins)}</span>
                {up.items.map((c) => <span key={c.item} className={have(s, c.item) >= c.qty ? '' : 'warn'}><Icon item={c.item} size={14} info={false} />{c.qty}<small>/{fmtNum(have(s, c.item))}</small></span>)}
              </span>
              <button className="pill on" disabled={(s.bank.coins ?? 0) < up.coins || !affordable(s, up.items)} onClick={() => store.dispatch(upgradeHome)}>扩建</button>
            </div>
          )}
          <div className="go"><button onClick={close}>完成</button></div>
        </div>
      )}
    </>
  );
}
