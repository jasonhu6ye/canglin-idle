import { useCallback, useEffect, useState } from 'react';
import { SKILLS } from './core/data';
import type { Summary, TaskEndReason } from './core/types';
import { store, useGame, useOffline } from './store';
import { ActionSheet } from './ui/ActionSheet';
import { GameCanvas } from './ui/GameCanvas';
import { actionName } from './ui/format';
import { MapButtons, QueuePanel, StatusChips, TopBar } from './ui/hud';
import { BagPanel, MorePanel, OfflineModal, SkillsPanel } from './ui/panels';

type Tab = 'game' | 'bag' | 'skills' | 'more';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'game', icon: '▶', label: '游戏' },
  { id: 'bag', icon: '▣', label: '背包' },
  { id: 'skills', icon: '★', label: '技能' },
  { id: 'more', icon: '…', label: '更多' },
];

const END_TEXT: Record<TaskEndReason, string> = {
  complete: '完成',
  noInput: '材料不足，已停止',
  death: '你阵亡了，战斗停止',
  level: '等级不够，已跳过',
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

export function App() {
  const s = useGame();
  const offline = useOffline();
  const [tab, setTab] = useState<Tab>('game');
  const [node, setNode] = useState<string | null>(null);
  const toasts = useToasts();
  const openNode = useCallback((id: string) => {
    setTab('game');
    setNode(id);
  }, []);

  return (
    <div className="app">
      <TopBar s={s} />
      <main>
        <GameCanvas onNodeClick={openNode} />
        <div className="hud">
          <QueuePanel s={s} />
          <StatusChips s={s} />
          <MapButtons />
        </div>
        <div className="toasts">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.gold ? 'gold' : ''}`}>{t.text}</div>)}
        </div>
        {tab === 'game' && node && <ActionSheet s={s} nodeId={node} onClose={() => setNode(null)} />}
        {tab === 'bag' && <BagPanel s={s} />}
        {tab === 'skills' && <SkillsPanel s={s} />}
        {tab === 'more' && <MorePanel />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setNode(null); }}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {offline && <OfflineModal sum={offline} />}
    </div>
  );
}
