import { useEffect, useState } from 'react';
import { FINE_POINTER } from './itemOpen';

/** 新手指引（用户 10-23）：第一次进游戏弹出几页图文说明，之后在「?」和「更多」里能再打开 */
const PAGES: { title: string; lines: string[] }[] = [
  {
    title: '欢迎来到苍岭',
    lines: [
      '这是一款放置游戏：给角色安排任务，它会一直自动干活，关掉网页也会继续，回来时结算离线收益。',
      '采集资源 → 加工成材料 → 打造装备 → 去打更强的怪，是游戏的主线。',
      '左下角的「新手任务」会一步步带你走一遍，跟着做就能拿金币奖励。',
    ],
  },
  {
    title: '走路和地图',
    lines: FINE_POINTER
      ? ['右键点地面走过去，按住右键角色会一直朝鼠标方向走；也可以用 WASD 或方向键。',
        '左键点地点、生物可以查看信息、开始采集或攻击；左键拖动移动镜头，滚轮缩放。',
        '按 M 打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。']
      : ['点地面角色就走过去，按住不放会一直朝手指方向走；双指可以缩放地图。',
        '点地点、生物可以查看信息、开始采集或攻击。',
        '右下角的格子按钮打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。'],
  },
  {
    title: '任务和队列',
    lines: [
      '在地点里选一个动作，「立即开始」就走过去开干；「加入队列」会排在后面，做完一个自动做下一个。',
      '技能没有等级上限，等级越高动作越快，还会解锁 T2 到 T8 更高阶的资源和装备。',
      '城镇里的灶台、熔炉、铁匠铺等设施，要站在旁边才能使用，排队的任务会自己走过去。',
    ],
  },
  {
    title: '背包和仓库',
    lines: [
      '背包有 20 格，采集的东西先进背包；满了角色会自动走回仓库存好，再回来接着干。',
      '制作可以直接用仓库里的材料；但存取东西、卖东西要分别站在仓库和集市旁边。',
      FINE_POINTER ? '左键点物品图标看详情，右键可以直接装备、放进补给栏或打开宝箱。Tab 打开背包。' : '点物品图标可以看详情，在背包里点物品可以装备、吃掉或打开。',
    ],
  },
  {
    title: '战斗',
    lines: [
      '武器决定战斗方式：剑和长枪是近战，弓弩是远程（要带箭），法杖是魔法（要带符文）。',
      '开战前会从仓库带上食物，血少了自己吃；连续阵亡 3 次会停下来，记得换更好的装备。',
      '精英和首领会掉福袋、宝箱和首领宝藏，首领还有专属战利品和极少掉落的专属战旗。',
    ],
  },
];

type Fn = (open: boolean) => void;
const fns = new Set<Fn>();
export const openGuide = () => fns.forEach((f) => f(true));

export function Guide() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem('canglin-guide-seen'); } catch { return false; }
  });
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem('canglin-guide-seen', '1'); } catch { /* 无痕模式存不了就算了 */ }
  }, [open]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const f: Fn = (o) => { setOpen(o); setPage(0); };
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  if (!open) return null;
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  return (
    <div className="item-popup" onClick={() => setOpen(false)}>
      <div className="item-popup-body frame guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide-dots">{PAGES.map((_, i) => <i key={i} className={i === page ? 'on' : ''} onClick={() => setPage(i)} />)}</div>
        <h2>{p.title}</h2>
        <ul>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="go">
          {page > 0 && <button onClick={() => setPage(page - 1)}>上一页</button>}
          <button className="primary" onClick={() => (last ? setOpen(false) : setPage(page + 1))}>{last ? '开始游戏' : '下一页'}</button>
          {!last && <button onClick={() => setOpen(false)}>跳过</button>}
        </div>
      </div>
    </div>
  );
}
