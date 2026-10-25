import { scrollMemo } from './ui/sticky';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ACTIONS, NODES, REGIONS, SKILLS } from './core/data';
import type { RegionId, Summary, TaskEndReason } from './core/types';
import { BOSS_BANNER, REGION_CHANGE } from './game/MapScene';
import { store, useGame, useInactive, useOffline } from './store';
import { toggleMount } from './core/sim';
import { ActionSheet, MonsterSheet } from './ui/ActionSheet';
import { emitToGame, GameCanvas, onGameEvent } from './ui/GameCanvas';
import { onOpenNodeSheet, openItem } from './ui/itemOpen';
import { actionName } from './ui/format';
import { BossBar, MapButtons, QuestCard, QueuePanel, StatusChips, TopBar } from './ui/hud';
import { QUESTS, questText } from './core/quests';
import { TplIcon } from './ui/icons';
import { ItemPopup, LootReveal } from './ui/ItemPopup';
import { Mailbox } from './ui/Mailbox';
import { DungeonHud, DungeonPopups } from './ui/Dungeon';
import { DungeonNotice } from './ui/DungeonNotice';
import { Guide, openGuide } from './ui/Guide';
import { News } from './ui/News';
import { HalloweenChip, HalloweenNotice } from './ui/Halloween';
import { BuffBar } from './ui/BuffBar';
import { GuildPanel, onOpenGuild } from './ui/Guild';
import { LoginGate } from './ui/Login';
import { useOnline } from './net/sync';
import { FriendsPage } from './ui/FriendsPage';
import { PartyFrames } from './ui/PartyFrames';
import { PlayerPopup } from './ui/PlayerPopup';
import { PartyInvitePopup, TradePopup } from './ui/SocialPopups';
import { PLAYER_CLICK } from './game/MapScene';
import { useSocial } from './net/social';
import { ChatChip, ChatPage, onOpenChatPage, openChatPage } from './ui/ChatDock';
import { CombatLog, onOpenCombatLog } from './ui/CombatLog';
import { UpdateBanner } from './ui/UpdateBanner';
import { DayClock } from './ui/DayClock';
import { BagPanel, BankPanel, CharacterPanel, MorePanel, NodeList, OfflineModal, SkillsPanel } from './ui/panels';
import { WorldMap } from './ui/WorldMap';
import { HomeHud } from './ui/HomeUI';
import { homeNode } from './core/home';
import { tl } from './i18n';

type Tab = 'game' | 'char' | 'bag' | 'bank' | 'skills' | 'guild' | 'friends' | 'chat' | 'more';
/** 电脑端快捷键说明（用户 10-23 要求优化电脑端操作） */
const SHORTCUTS: [string, string][] = [
  [tl('WASD / 方向键'), tl('走路')], [tl('鼠标右键'), tl('点地面走过去，按住一直朝光标走')], [tl('鼠标左键'), tl('点地点、怪物查看信息或攻击；拖动移动镜头')], [tl('滚轮 / + -'), tl('缩放地图')],
  [tl('空格'), tl('镜头回到角色')], ['M', tl('世界地图')], ['G', tl('公会')], ['R', tl('骑上 / 下坐骑（坐骑栏有坐骑时）')], ['L', tl('日志（战斗掉落、采集制作产出和经验）')], ['Tab', tl('打开 / 关闭背包')], [tl('左键物品图标'), tl('查看物品详情')], [tl('右键物品'), tl('背包里穿上或放进补给栏，身上的卸下，仓库的取到背包')], ['1 - 9', tl('打开右侧面板，再按一次同一个收起')], ['Enter', tl('聊天')], ['Esc', tl('关闭当前页面，再按一次收起右侧面板')], ['?', tl('显示 / 隐藏这份说明')],
];

const TABS: { id: Tab; icon: [string, string]; label: string }[] = [
  { id: 'game', icon: ['sword', '#c5cad2'], label: tl('游戏') },
  { id: 'char', icon: ['helm', '#c5cad2'], label: tl('角色') },
  { id: 'bag', icon: ['bag', '#a07a50'], label: tl('背包') },
  { id: 'bank', icon: ['coins', '#f0c850'], label: tl('仓库') },
  { id: 'skills', icon: ['gem', '#e8b84a'], label: tl('技能') },
  { id: 'guild', icon: ['shield', '#7a8ab8'], label: tl('公会') },
  { id: 'friends', icon: ['friends', '#e88ad0'], label: tl('好友') },
  { id: 'chat', icon: ['chat', '#6ac0f0'], label: tl('聊天') },
  { id: 'more', icon: ['rune', '#9a9aa8'], label: tl('更多') },
];

const END_TEXT: Record<TaskEndReason, string> = {
  complete: tl('完成'),
  noInput: tl('材料不足，已停止'),
  death: tl('你阵亡了，战斗停止'),
  level: tl('等级不够，已跳过'),
  noAmmo: tl('弹药用完了，战斗停止'),
  summon: tl('南瓜王已经离开（要先在活动祭坛召唤）'),
};

type Toast = { id: number; text: string; gold: boolean };

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    return store.onGain((s: Summary) => {
      const add: Toast[] = s.levelUps.map((l) => ({ id: ++id, text: tl`${SKILLS[l.skill].name} 升到 ${l.level} 级`, gold: true }));
      for (const i of s.quests ?? []) add.push({ id: ++id, text: tl`新手任务完成：${questText(QUESTS[i])} · ${QUESTS[i].reward} 金币奖励已发到邮箱`, gold: true });
      for (const e of s.taskEnds) add.push({ id: ++id, text: tl`${actionName(e.action)}：${END_TEXT[e.reason]}`, gold: false });
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
  const [boss, setBoss] = useState<{ key: number; name: string; world?: boolean | 'event' } | null>(null);
  useEffect(() => {
    let key = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onGameEvent(BOSS_BANNER, (name: string, world?: boolean | 'event') => {
      setBoss({ key: ++key, name, world });
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
  const { phase } = useOnline();
  // 进游戏要先登录、建角色（10-25 用户要求）；连不上服务器时可以先离线玩
  if (phase !== 'play' && phase !== 'offline') return <LoginGate />;
  return <Game />;
}

function Game() {
  const social = useSocial();
  // 底部标签上的红点：聊天未读、好友申请 / 组队邀请 / 对方已确认的交易
  const badges: Partial<Record<Tab, number>> = {
    chat: Object.values(social.unread).reduce((a, b) => a + b, 0),
    friends: social.friends.filter((f) => !f.accepted && f.incoming).length + social.invites.length
      + social.trades.filter((t) => t.status === 'open' && t.theirOk && !t.myOk).length,
  };
  const s = useGame();
  const offline = useOffline();
  const inactive = useInactive();
  const wide = useWide();
  const [tab, setTab] = useState<Tab>('game');
  const [node, setNode] = useState<string | null>(null);
  // 每次打开地点页面都重新挂载，从配方跳过来时能重新选中
  const [nodeSeq, setNodeSeq] = useState(0);
  const [worldMap, setWorldMap] = useState(false);
  const [monster, setMonster] = useState<string | null>(null);
  // 电脑端右侧面板默认收起，点标签、地点或按快捷键才展开（用户 10-23）
  const [panelOpen, setPanelOpen] = useState(false);

  const ui = useRef({ tab, node, monster, panelOpen, wide });
  ui.current = { tab, node, monster, panelOpen, wide };
  /** 点标签：电脑端再点一次同一个标签就收起 */
  const pickTab = useCallback((id: Tab) => {
    const u = ui.current;
    setNode(null); setMonster(null); setWorldMap(false);
    if (u.wide && u.panelOpen && u.tab === id && !u.node && !u.monster) { setPanelOpen(false); return; }
    setTab(id); setPanelOpen(true);
  }, []);
  useEffect(() => onOpenGuild(() => pickTab('guild')), [pickTab]);
  const [playerPop, setPlayerPop] = useState<string | null>(null);
  useEffect(() => onGameEvent(PLAYER_CLICK, (id: string) => setPlayerPop(id)), []);
  useEffect(() => onOpenChatPage(() => { if (ui.current.tab !== 'chat' || !ui.current.panelOpen) pickTab('chat'); }), [pickTab]);
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
    if ((NODES.find((n) => n.id === id) ?? homeNode(id))?.opens === 'bank') {
      setNode(null);
      setTab('bank');
      return;
    }
    setTab('game');
    setNode(id);
    setNodeSeq((n) => n + 1);
  }, []);

  useEffect(() => onOpenNodeSheet(openNode), [openNode]);

  // 日志小窗：展开 / 收起记在本地（用户 10-23）
  const [combatLog, setCombatLogRaw] = useState(() => {
    try { return localStorage.getItem('canglin-log-open') === '1'; } catch { return false; }
  });
  const setCombatLog = useCallback((v: boolean | ((x: boolean) => boolean)) => {
    setCombatLogRaw((x) => {
      const next = typeof v === 'function' ? v(x) : v;
      try { localStorage.setItem('canglin-log-open', next ? '1' : '0'); } catch { /* 存不了就算了 */ }
      return next;
    });
  }, []);
  useEffect(() => onOpenCombatLog(() => { setCombatLog(true); if (!ui.current.wide) setTab('game'); }), []);
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
      if (k >= '1' && k <= '9') pickTab(TABS[+k - 1].id);
      else if (k === 'm' || k === 'M') setWorldMap((v) => !v);
      else if (k === 'g' || k === 'G') pickTab('guild');
      else if (k === 'r' || k === 'R') store.dispatch((g) => toggleMount(g));
      else if (k === 'l' || k === 'L') setCombatLog((v) => !v);
      else if (k === 'Enter') openChatPage();
      else if (k === 'Tab') {
        e.preventDefault();
        const u = ui.current;
        if (u.wide) pickTab('bag');
        else { setTab((t) => (t === 'bag' ? 'game' : 'bag')); setNode(null); setMonster(null); setWorldMap(false); }
      }
      else if (k === 'Escape') {
        // 有弹窗（公告、指引、宝箱结果等）先关最上面那个
        const pops = document.querySelectorAll<HTMLElement>('.item-popup');
        if (pops.length) { pops[pops.length - 1].click(); return; }
        const u = ui.current;
        // 先关打开的地点/怪物页，没有的话收起面板
        if (!u.node && !u.monster) setPanelOpen(false);
        openItem(null); setHelp(false); setWorldMap(false); setMonster(null); setNode(null);
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

  // 每个页面记住滚动位置，切走再回来停在原处（用户 10-25）
  const asideRef = useRef<HTMLElement>(null);
  const viewKey = worldMap ? 'map' : tab === 'game' ? (monster ? `m:${monster}` : node ? `n:${node}` : 'nodes') : tab;
  const viewRef = useRef(viewKey);
  viewRef.current = viewKey;
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLElement && el.contains(t)) scrollMemo.set(viewRef.current, t.scrollTop);
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  });
  useLayoutEffect(() => {
    const top = scrollMemo.get(viewKey);
    const el = asideRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !top) return;
    // 滚动的可能是页面本身，也可能是里面的配方列表
    const box = el.scrollHeight > el.clientHeight ? el : (el.querySelector('.action-list') as HTMLElement | null) ?? el;
    box.scrollTop = top;
  }, [viewKey, nodeSeq]);

  let side: ReactNode = null;
  const showSide = !wide || panelOpen;
  if (worldMap) side = <WorldMap s={s} onClose={() => setWorldMap(false)} onOpenNode={openNode} />;
  else if (!showSide) side = null;
  else if (tab === 'game' && monster) side = <MonsterSheet s={s} actionId={monster} onClose={() => setMonster(null)} />;
  else if (tab === 'game' && node) side = <ActionSheet key={nodeSeq} s={s} nodeId={node} onClose={() => setNode(null)} />;
  else if (tab === 'game' && wide) side = <NodeList s={s} onPick={openNode} />;
  else if (tab === 'char') side = <CharacterPanel s={s} />;
  else if (tab === 'bag') side = <BagPanel s={s} />;
  else if (tab === 'bank') side = <BankPanel s={s} />;
  else if (tab === 'skills') side = <SkillsPanel s={s} onPick={openNode} />;
  else if (tab === 'guild') side = <GuildPanel s={s} onClose={() => pickTab('game')} />;
  else if (tab === 'chat') side = <ChatPage onClose={() => pickTab('game')} />;
  else if (tab === 'friends') side = <FriendsPage s={s} onClose={() => pickTab('game')} />;
  else if (tab === 'more') side = <MorePanel s={s} />;

  return (
    <div className={`app ${wide && !panelOpen ? 'collapsed' : ''}`}>
      <TopBar s={s} />
      <main>
        <GameCanvas onNodeClick={openNode} />
        <div className={`region-tint ${region}`} />
        <div className="hud">
          <div className="top-left">
            <HomeHud s={s} />
            <DungeonHud s={s} />
            <PartyFrames onPick={setPlayerPop} />
            {!s.dungeon && <QueuePanel s={s} />}
            <BuffBar s={s} region={region} />
              </div>
          <StatusChips s={s} extra={<><HalloweenChip s={s} /><QuestCard s={s} onGo={openNode} /></>} log={combatLog ? <CombatLog onClose={() => setCombatLog(false)} /> : null} chat={<ChatChip />} />
          <MapButtons s={s} onWorldMap={() => setWorldMap(true)} />
        </div>
        <BossBar s={s} />
        {banner && <div key={banner.key} className="region-banner">{REGIONS[banner.region].name}</div>}
        {boss && <div key={`b${boss.key}`} className={`boss-banner ${boss.world === 'event' ? 'world event' : boss.world ? 'world' : ''}`}><small>{boss.world === 'event' ? tl('🎃 万圣节限定首领 🎃') : boss.world ? tl('☠ 世界首领 ☠') : tl('首领')}</small>{boss.name}</div>}
        <DayClock region={region} />
        <div className="toasts">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.gold ? 'gold' : ''}`}>{t.text}</div>)}
        </div>
      </main>
      {side && <aside ref={asideRef} className={`side ${worldMap ? 'wide-map' : ''}`}>{side}</aside>}
      <nav className="tabbar">
        {TABS.map((t, i) => (
          <button key={t.id} className={tab === t.id && !worldMap && showSide ? 'on' : ''} title={tl`${t.label}（快捷键 ${i + 1}）`}
            onClick={() => pickTab(t.id)}>
            <TplIcon tpl={t.icon[0]} tint={t.icon[1]} size={22} />
            <span>{t.label}</span>
            {badges[t.id] ? <b className="badge tab-badge">{badges[t.id]! > 99 ? '99+' : badges[t.id]}</b> : null}
            {wide && <kbd>{i + 1}</kbd>}
          </button>
        ))}
        {wide && <button className="help-btn" title={tl("快捷键说明（?）")} onClick={() => setHelp((v) => !v)}>?</button>}
        {wide && (
          <button className="fold-btn" title={panelOpen ? tl('收起面板（Esc）') : tl('展开面板')} onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? '»' : '«'}
          </button>
        )}
      </nav>
      {help && (
        <div className="item-popup" onClick={() => setHelp(false)}>
          <div className="item-popup-body frame shortcuts" onClick={(e) => e.stopPropagation()}>
            <h2>{tl('电脑端操作')}</h2>
            <table><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody></table>
            <div className="go">
              <button onClick={() => { setHelp(false); openGuide(); }}>{tl('新手指引')}</button>
              <button className="primary" onClick={() => setHelp(false)}>{tl('知道了')}</button>
            </div>
          </div>
        </div>
      )}
      {offline && <OfflineModal sum={offline} />}
      {playerPop && <PlayerPopup playerId={playerPop} onClose={() => setPlayerPop(null)} />}
      <TradePopup s={s} />
      <PartyInvitePopup />
      <ItemPopup s={s} />
      <Mailbox s={s} />
      <DungeonPopups s={s} />
      <LootReveal />
      <Guide />
      {!offline && <News />}
      <HalloweenNotice />
      <DungeonNotice />
      <UpdateBanner />
      {inactive && (
        <div className="modal-bg tab-lock">
          <div className="modal frame">
            {store.inactiveWhy === 'device' ? (
              <>
                <h2>{tl('这个账号在别的设备上玩过了')}</h2>
                <p>{tl('别的设备或浏览器在这之后上传了更新的存档。为了不拿这边的旧进度盖掉它，这里已经暂停。点下面的按钮会读取云端最新的存档，并结算离开期间的收获。')}</p>
              </>
            ) : (
              <>
                <h2>{tl('游戏在另一个页面打开了')}</h2>
                <p>{tl('为了不让两边的进度互相覆盖，这个页面已经暂停，不会再保存。')}</p>
              </>
            )}
            <div className="go"><button className="primary" onClick={() => location.reload()}>{store.inactiveWhy === 'device' ? tl('读取最新存档，在这里继续') : tl('在这个页面继续玩')}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
