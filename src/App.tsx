import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ACTIONS, NODES, REGIONS, SKILLS } from './core/data';
import type { RegionId, Summary, TaskEndReason } from './core/types';
import { BOSS_BANNER, REGION_CHANGE } from './game/MapScene';
import { store, useGame, useOffline } from './store';
import { ActionSheet, MonsterSheet } from './ui/ActionSheet';
import { emitToGame, GameCanvas, onGameEvent } from './ui/GameCanvas';
import { openItem } from './ui/itemOpen';
import { actionName } from './ui/format';
import { BossBar, MapButtons, QuestCard, QueuePanel, StatusChips, TopBar } from './ui/hud';
import { QUESTS, questText } from './core/quests';
import { TplIcon } from './ui/icons';
import { ItemPopup, LootReveal } from './ui/ItemPopup';
import { Guide, openGuide } from './ui/Guide';
import { GuildPanel, onOpenGuild } from './ui/Guild';
import { BagPanel, BankPanel, CharacterPanel, MorePanel, NodeList, OfflineModal, SkillsPanel } from './ui/panels';
import { WorldMap } from './ui/WorldMap';

type Tab = 'game' | 'char' | 'bag' | 'bank' | 'skills' | 'more';
/** 电脑端快捷键说明（用户 10-23 要求优化电脑端操作） */
const SHORTCUTS: [string, string][] = [
  ['WASD / 方向键', '走路'], ['鼠标右键', '点地面走过去，按住一直朝光标走'], ['鼠标左键', '点地点、怪物查看信息或攻击；拖动移动镜头'], ['滚轮 / + -', '缩放地图'],
  ['空格', '镜头回到角色'], ['M', '世界地图'], ['G', '公会'], ['Tab', '打开 / 关闭背包'], ['左键物品图标', '查看物品详情'], ['右键物品', '背包里穿上或放进补给栏，身上的卸下，仓库的取到背包'], ['1 - 6', '打开右侧面板，再按一次同一个收起'], ['Esc', '关闭当前页面，再按一次收起右侧面板'], ['?', '显示 / 隐藏这份说明'],
];

const TABS: { id: Tab; icon: [string, string]; label: string }[] = [
  { id: 'game', icon: ['sword', '#c5cad2'], label: '游戏' },
  { id: 'char', icon: ['helm', '#c5cad2'], label: '角色' },
  { id: 'bag', icon: ['bag', '#a07a50'], label: '背包' },
  { id: 'bank', icon: ['coins', '#f0c850'], label: '仓库' },
  { id: 'skills', icon: ['gem', '#e8b84a'], label: '技能' },
  { id: 'more', icon: ['rune', '#9a9aa8'], label: '更多' },
];

const END_TEXT: Record<TaskEndReason, string> = {
  complete: '完成',
  noInput: '材料不足，已停止',
  death: '你阵亡了，战斗停止',
  level: '等级不够，已跳过',
  noAmmo: '弹药用完了，战斗停止',
};

type Toast = { id: number; text: string; gold: boolean };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    return store.onGain((s: Summary) => {
      const add: Toast[] = s.levelUps.map((l) => ({ id: ++id, text: `${SKILLS[l.skill].name} 升到 ${l.level} 级`, gold: true }));
      for (const i of s.quests ?? []) add.push({ id: ++id, text: `新手任务完成：${questText(QUESTS[i])} · +${QUESTS[i].reward} 金币`, gold: true });
      for (const e of s.taskEnds) add.push({ id: ++id, text: `${actionName(e.action)}：${END_TEXT[e.reason]}`, gold: false });
      if (!add.length) return;
      setToasts((t) => [...t, ...add].slice(-4));
      setTimeout(() => setToasts((t) => t.filter((x) => !add.includes(x))), 3500);
    });
  }, []);
  return toasts;
}

/** 走进新区域时在屏幕上方打出区域名 */
function useRegion() {
  const [region, setRegion] = useState<RegionId>('town');
  const [banner, setBanner] = useState<{ key: number; region: RegionId } | null>(null);
  useEffect(() => {
    let key = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return onGameEvent(REGION_CHANGE, (r: RegionId) => {
      setRegion(r);
      setBanner({ key: ++key, region: r });
      clearTimeout(timer);
      timer = setTimeout(() => setBanner(null), 2600);
    });
  }, []);
  return { region, banner };
}

/** 开打首领：屏幕中间压一条红色横幅 */
function useBossBanner() {
  const [boss, setBoss] = useState<{ key: number; name: string } | null>(null);
  useEffect(() => {
    let key = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onGameEvent(BOSS_BANNER, (name: string) => {
      setBoss({ key: ++key, name });
      clearTimeout(timer);
      timer = setTimeout(() => setBoss(null), 2800);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  return boss;
}

const WIDE_QUERY = '(min-width: 900px)';

/** 宽屏（电脑、平板横屏）时右侧常驻面板，手机上面板盖在地图上 */
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function App() {
  const s = useGame();
  const offline = useOffline();
  const wide = useWide();
  const [tab, setTab] = useState<Tab>('game');
  const [node, setNode] = useState<string | null>(null);
  const [worldMap, setWorldMap] = useState(false);
  const [monster, setMonster] = useState<string | null>(null);
  // 电脑端右侧面板默认收起，点标签、地点或按快捷键才展开（用户 10-23）
  const [panelOpen, setPanelOpen] = useState(false);
  const [guild, setGuild] = useState(false);
  useEffect(() => onOpenGuild(() => { setGuild(true); setPanelOpen(true); setWorldMap(false); }), []);
  const ui = useRef({ tab, node, monster, panelOpen, wide });
  ui.current = { tab, node, monster, panelOpen, wide };
  /** 点标签：电脑端再点一次同一个标签就收起 */
  const pickTab = useCallback((id: Tab) => {
    const u = ui.current;
    setNode(null); setMonster(null); setWorldMap(false); setGuild(false);
    if (u.wide && u.panelOpen && u.tab === id && !u.node && !u.monster) { setPanelOpen(false); return; }
    setTab(id); setPanelOpen(true);
  }, []);
  const toasts = useToasts();
  const { region, banner } = useRegion();
  const boss = useBossBanner();
  const openNode = useCallback((id: string) => {
    setWorldMap(false);
    setMonster(null);
    setPanelOpen(true);
    // 地图上点的是怪物
    if (ACTIONS[id]?.kind === 'combat') {
      setNode(null);
      setTab('game');
      setMonster(id);
      return;
    }
    if (NODES.find((n) => n.id === id)?.opens === 'bank') {
      setNode(null);
      setTab('bank');
      return;
    }
    setTab('game');
    setNode(id);
  }, []);

  const [help, setHelp] = useState(() => {
    // 电脑端第一次打开时自动弹一次快捷键说明
    try {
      // 第一次进游戏先看新手指引，快捷键说明等下一次再自动弹
      return window.matchMedia(WIDE_QUERY).matches && !localStorage.getItem('canglin-help-seen') && !!localStorage.getItem('canglin-guide-seen');
    } catch { return false; }
  });
  useEffect(() => {
    if (!help) return;
    try { localStorage.setItem('canglin-help-seen', '1'); } catch { /* 存不了就算了 */ }
  }, [help]);
  // 电脑端快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k >= '1' && k <= '6') pickTab(TABS[+k - 1].id);
      else if (k === 'm' || k === 'M') setWorldMap((v) => !v);
      else if (k === 'g' || k === 'G') { setGuild((v) => !v); setPanelOpen(true); setWorldMap(false); }
      else if (k === 'Tab') {
        e.preventDefault();
        const u = ui.current;
        if (u.wide) pickTab('bag');
        else { setTab((t) => (t === 'bag' ? 'game' : 'bag')); setNode(null); setMonster(null); setWorldMap(false); }
      }
      else if (k === 'Escape') {
        const u = ui.current;
        // 先关打开的地点/怪物页，没有的话收起面板
        if (!u.node && !u.monster) setPanelOpen(false);
        openItem(null); setHelp(false); setWorldMap(false); setMonster(null); setNode(null); setGuild(false);
      } else if (k === '+' || k === '=') emitToGame('zoom', 0.5);
      else if (k === '-' || k === '_') emitToGame('zoom', -0.5);
      else if (k === ' ') { e.preventDefault(); emitToGame('recenter'); }
      else if (k === '?' || k === '/') setHelp((v) => !v);
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 面板里点了「寻路去仓库」之类：回到游戏画面
  useEffect(() => store.subscribe(() => {
    if (store.pendingWalk) { setTab('game'); setNode(null); setMonster(null); setWorldMap(false); }
  }), []);

  let side: ReactNode = null;
  const showSide = !wide || panelOpen;
  if (worldMap) side = <WorldMap s={s} onClose={() => setWorldMap(false)} onOpenNode={openNode} />;
  else if (!showSide) side = null;
  else if (guild) side = <GuildPanel s={s} onClose={() => setGuild(false)} />;
  else if (tab === 'game' && monster) side = <MonsterSheet s={s} actionId={monster} onClose={() => setMonster(null)} />;
  else if (tab === 'game' && node) side = <ActionSheet s={s} nodeId={node} onClose={() => setNode(null)} />;
  else if (tab === 'game' && wide) side = <NodeList s={s} onPick={openNode} />;
  else if (tab === 'char') side = <CharacterPanel s={s} />;
  else if (tab === 'bag') side = <BagPanel s={s} />;
  else if (tab === 'bank') side = <BankPanel s={s} />;
  else if (tab === 'skills') side = <SkillsPanel s={s} onPick={openNode} />;
  else if (tab === 'more') side = <MorePanel s={s} />;

  return (
    <div className={`app ${wide && !panelOpen ? 'collapsed' : ''}`}>
      <TopBar s={s} />
      <main>
        <GameCanvas onNodeClick={openNode} />
        <div className={`region-tint ${region}`} />
        <div className="hud">
          <QueuePanel s={s} />
          <StatusChips s={s} extra={<QuestCard s={s} onGo={openNode} />} />
          <MapButtons onWorldMap={() => setWorldMap(true)} />
        </div>
        <BossBar s={s} />
        {banner && <div key={banner.key} className="region-banner">{REGIONS[banner.region].name}</div>}
        {boss && <div key={`b${boss.key}`} className="boss-banner"><small>首领</small>{boss.name}</div>}
        <div className="toasts">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.gold ? 'gold' : ''}`}>{t.text}</div>)}
        </div>
      </main>
      {side && <aside className={`side ${worldMap ? 'wide-map' : ''}`}>{side}</aside>}
      <nav className="tabbar">
        {TABS.map((t, i) => (
          <button key={t.id} className={tab === t.id && !worldMap && showSide ? 'on' : ''} title={`${t.label}（快捷键 ${i + 1}）`}
            onClick={() => pickTab(t.id)}>
            <TplIcon tpl={t.icon[0]} tint={t.icon[1]} size={22} />
            <span>{t.label}</span>
            {wide && <kbd>{i + 1}</kbd>}
          </button>
        ))}
        {wide && <button className="help-btn" title="快捷键说明（?）" onClick={() => setHelp((v) => !v)}>?</button>}
        {wide && (
          <button className="fold-btn" title={panelOpen ? '收起面板（Esc）' : '展开面板'} onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? '»' : '«'}
          </button>
        )}
      </nav>
      {help && (
        <div className="item-popup" onClick={() => setHelp(false)}>
          <div className="item-popup-body frame shortcuts" onClick={(e) => e.stopPropagation()}>
            <h2>电脑端操作</h2>
            <table><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody></table>
            <div className="go">
              <button onClick={() => { setHelp(false); openGuide(); }}>新手指引</button>
              <button className="primary" onClick={() => setHelp(false)}>知道了</button>
            </div>
          </div>
        </div>
      )}
      {offline && <OfflineModal sum={offline} />}
      <ItemPopup s={s} />
      <LootReveal />
      <Guide />
    </div>
  );
}
