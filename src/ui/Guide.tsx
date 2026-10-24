import { useEffect, useState } from 'react';
import { FINE_POINTER } from './itemOpen';

/** 新手指引（用户 10-23）：第一次进游戏弹出几页图文说明，之后在「?」和「更多」里能再打开 */
const PAGES: { title: string; lines: string[] }[] = [
  {
    title: '欢迎来到苍岭',
    lines: [
      '这是一款放置游戏：给角色安排任务，它会一直自动干活，关掉网页也会继续，回来时结算离线收益（最多 24 小时）。',
      '主线是：采集资源 → 加工成材料 → 打造装备和工具 → 去打更强的怪、去更远的地方。',
      '左下角的「新手任务」会一步步带你走一遍，点「去做」角色会自己走过去，完成就有金币奖励。',
    ],
  },
  {
    title: '走路和地图',
    lines: FINE_POINTER
      ? ['右键点地面走过去，按住右键角色会一直朝鼠标方向走；也可以用 WASD 或方向键。',
        '左键点地点、生物查看信息、开始采集或攻击；左键拖动移动镜头，滚轮缩放。',
        '按 M 打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。按 ? 随时查看全部快捷键。']
      : ['点地面角色就走过去，按住不放会一直朝手指方向走；双指可以缩放地图。',
        '点地点、生物可以查看信息、开始采集或攻击。',
        '右下角的格子按钮打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。'],
  },
  {
    title: '任务和队列',
    lines: [
      '在地点里选一个动作，「立即开始」就走过去开干；「加入队列」排在后面，做完一个自动做下一个。',
      '数量可以选次数、时长或一直做，也能自己输入次数。装备和工具默认只做 1 件。',
      '任务停下时（材料不够、等级不够、连续阵亡、队列做完），屏幕上会出现提示条，点里面的按钮能直接去补材料或再来一轮。',
    ],
  },
  {
    title: '城镇',
    lines: [
      '主城「苍岭城」在地图中央，西边草原上还有第二座城「落霞城」，两边的仓库是同一份，回最近的那个就行。',
      '熔炉把矿石炼成锭，铁匠铺用锭打造武器、护甲和工具；工坊鞣皮织布、做布甲皮甲，制弓台做木板、弓和箭；灶台做饭，药剂铺做药水。',
      '设施要站在旁边才能用，排队的任务会自己走过去。卖东西、买种子要去集市。',
      '技能没有等级上限，等级越高动作越快，还会解锁 T2 到 T8 更高阶的资源和装备。',
    ],
  },
  {
    title: '背包和仓库',
    lines: [
      '背包有 24 格，采集的东西先进背包；满了角色会自动走回仓库存好，再回来接着干。',
      '制作可以直接用仓库里的材料；但手动存取东西要站在仓库旁边。',
      FINE_POINTER ? '左键点物品图标看详情，右键可以直接装备、放进补给栏或打开宝箱。Tab 打开背包。' : '点物品图标可以看详情，在背包里点物品可以装备、吃掉或打开。',
      '配方里缺的材料会标红，点它会跳到能做这样东西的地方。',
    ],
  },
  {
    title: '种田',
    lines: [
      '城镇周围有四块田，越远的田能种越高阶的作物。站在田里点空地种下种子，浇水长得更快，熟了再点一下收获。',
      '田地面板可以一键种满、浇水、收获；打开「自动补种」后熟了自动收进仓库再种，离线也照样长。',
      '种子在集市买、收获时收回，打怪、采集也会掉，偶尔还会变异出下一种作物的种子。',
    ],
  },
  {
    title: '战斗',
    lines: [
      '武器决定战斗方式：剑和长枪是近战，弓弩是远程（要带箭），法杖是魔法（要带符文）。',
      '食物栏放上食物，血少了会自己吃；开战前背包食物不够会先回仓库拿。连续阵亡 3 次会停下来，记得换更好的装备。',
      '精英和首领会掉福袋、宝箱和首领宝藏，首领还有专属战利品和极少掉落的专属战旗。',
      FINE_POINTER ? '按 L 打开日志，能看到每次击杀、阵亡和采集的记录。' : '点下方的「击杀 · 阵亡」可以打开日志，看每次击杀、阵亡和采集的记录。',
    ],
  },
  {
    title: '传送石碑和坐骑',
    lines: [
      '野外每个区域都有一座传说石碑，走近就会点亮。站在点亮的石碑旁，可以传送到别的点亮石碑。',
      '自动寻路走远路时，如果走到石碑传过去更快，会自动顺路传送，所以石碑点得越多，跑图越快。',
      FINE_POINTER ? '坐骑放进角色面板的坐骑栏后，按 R 或地图右下角的按钮上下坐骑，骑着走得更快。' : '坐骑放进角色面板的坐骑栏后，点地图右下角的按钮上下坐骑，骑着走得更快。',
    ],
  },
  {
    title: '离线和存档',
    lines: [
      '离开超过一分钟再回来，会弹出总结：得了哪些经验和物品、阵亡几次、哪个任务为什么停了、现在在做什么。',
      '存档只保存在这个浏览器里。在「更多」页可以导出存档码或下载存档文件，换设备时再导入。',
      '导入前会把两边存档的等级、经验并排对比，要导入的进度更少会提醒你，避免拿旧档盖掉新档。',
      '每次更新会弹出更新公告；这份指引在「更多」页和 ? 按钮里都能再打开。',
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
        <h2>{p.title} <small className="muted">{page + 1}/{PAGES.length}</small></h2>
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
