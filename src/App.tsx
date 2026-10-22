import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NODES, REGIONS, SKILLS } from './core/data';
import type { RegionId, Summary, TaskEndReason } from './core/types';
import { REGION_CHANGE } from './game/MapScene';
import { store, useGame, useOffline } from './store';
import { ActionSheet } from './ui/ActionSheet';
import { GameCanvas, onGameEvent } from './ui/GameCanvas';
import { actionName } from './ui/format';
import { MapButtons, QueuePanel, StatusChips, TopBar } from './ui/hud';
import { TplIcon } from './ui/icons';
import { BagPanel, BankPanel, CharacterPanel, MorePanel, NodeList, OfflineModal, SkillsPanel } from './ui/panels';
import { WorldMap } from './ui/WorldMap';

type Tab = 'game' | 'char' | 'bag' | 'bank' | 'skills' | 'more';
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
  const toasts = useToasts();
  const { region, banner } = useRegion();
  const openNode = useCallback((id: string) => {
    setWorldMap(false);
    if (NODES.find((n) => n.id === id)?.opens === 'bank') {
      setNode(null);
      setTab('bank');
      return;
    }
    setTab('game');
    setNode(id);
  }, []);

  // 面板里点了「寻路去仓库」之类：回到游戏画面
  useEffect(() => store.subscribe(() => {
    if (store.pendingWalk) { setTab('game'); setNode(null); setWorldMap(false); }
  }), []);

  let side: ReactNode = null;
  if (worldMap) side = <WorldMap s={s} onClose={() => setWorldMap(false)} onOpenNode={openNode} />;
  else if (tab === 'game' && node) side = <ActionSheet s={s} nodeId={node} onClose={() => setNode(null)} />;
  else if (tab === 'game' && wide) side = <NodeList onPick={openNode} />;
  else if (tab === 'char') side = <CharacterPanel s={s} />;
  else if (tab === 'bag') side = <BagPanel s={s} />;
  else if (tab === 'bank') side = <BankPanel s={s} />;
  else if (tab === 'skills') side = <SkillsPanel s={s} onPick={openNode} />;
  else if (tab === 'more') side = <MorePanel s={s} />;

  return (
    <div className="app">
      <TopBar s={s} />
      <main>
        <GameCanvas onNodeClick={openNode} />
        <div className={`region-tint ${region}`} />
        <div className="hud">
          <QueuePanel s={s} />
          <StatusChips s={s} />
          <MapButtons onWorldMap={() => setWorldMap(true)} />
        </div>
        {banner && <div key={banner.key} className="region-banner">{REGIONS[banner.region].name}</div>}
        <div className="toasts">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.gold ? 'gold' : ''}`}>{t.text}</div>)}
        </div>
      </main>
      {side && <aside className={`side ${worldMap ? 'wide-map' : ''}`}>{side}</aside>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id && !worldMap ? 'on' : ''} onClick={() => { setTab(t.id); setNode(null); setWorldMap(false); }}>
            <TplIcon tpl={t.icon[0]} tint={t.icon[1]} size={22} />
            {t.label}
          </button>
        ))}
      </nav>
      {offline && <OfflineModal sum={offline} />}
    </div>
  );
}
