import { useEffect, useState } from 'react';
import { FINE_POINTER } from './itemOpen';
import { tl } from '../i18n';
import { ITEMS } from '../core/data';
import { QUESTS } from '../core/quests';
import { Icon } from './icons';

/**
 * 新手指引（用户 10-23；10-27 重写）：第一次进游戏弹出几页图文说明，之后在「?」和「更多」里能再打开。
 * 每页顶上一排物品图标当配图；说的东西要跟着游戏改（云存档、新手点位、联机都写进来了）。
 */
const PAGES: { title: string; icons: string[]; lines: string[] }[] = [
  {
    title: tl('欢迎来到苍岭'),
    icons: ['plain_log', 'copper_ore', 'copper_bar', 'copper_sword'],
    lines: [
      tl('这是一款放置游戏：给角色安排任务，它会一直自动干活。关掉网页也照样干，回来时结算离线收益（最多 24 小时）。'),
      tl('主线是：采集资源 → 加工成材料 → 打造装备和工具 → 去打更强的怪、去更远的地方。'),
      tl('存档跟着账号走，每分钟自动传到云端，换手机或电脑登录同一个账号就能接着玩。'),
    ],
  },
  {
    title: tl('第一步：跟着新手任务走'),
    icons: ['stone', 'raw_minnow', 'minnow', 'coins'],
    lines: [
      tl`左下角的「新手任务」一共 ${QUESTS.length} 步，带你把采集、加工、打造、战斗都走一遍。`,
      tl('点「去做」会打开离你最近的地点，要做的动作已经选好，再点「立即开始」角色就会自己走过去开干。'),
      tl('前几步都在城门口：城西小树林砍树、打野兔，城东碎石坡挖石头和铜矿，城北小水塘钓鱼，出城二十秒就到。'),
      tl('完成任务的金币奖励会发到邮箱，点顶栏右上角的信封领取。'),
    ],
  },
  {
    title: tl('走路和地图'),
    icons: [],
    lines: FINE_POINTER
      ? [tl('右键点地面走过去，按住右键角色会一直朝鼠标方向走；也可以用 WASD 或方向键。'),
        tl('左键点地点、生物查看信息、开始采集或攻击；左键拖动移动镜头，滚轮缩放。'),
        tl('按 M 打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。按 ? 随时查看全部快捷键。')]
      : [tl('点地面角色就走过去，按住不放会一直朝手指方向走；双指可以缩放地图。'),
        tl('点地点、生物可以查看信息、开始采集或攻击。'),
        tl('右下角的格子按钮打开世界地图，选一个地点就能自动寻路过去，退出游戏也会继续走。')],
  },
  {
    title: tl('任务和队列'),
    icons: [],
    lines: [
      tl('在地点里选一个动作，「立即开始」就走过去开干；「加入队列」排在后面，做完一个自动做下一个。'),
      tl('数量可以选次数、时长或一直做，也能自己输入次数。装备和工具默认只做 1 件。'),
      tl('任务停下时（材料不够、等级不够、连续阵亡、队列做完），屏幕上会出现提示条，点里面的按钮能直接去补材料或再来一轮。'),
      tl('技能没有等级上限，等级越高动作越快，还会解锁 T2 到 T8 更高阶的资源和装备。'),
    ],
  },
  {
    title: tl('背包、仓库和装备'),
    icons: ['pack_1', 'copper_pickaxe', 'copper_sword'],
    lines: [
      tl('背包有 24 格，采集的东西先进背包，满了角色会自动走回最近的仓库存好，再回来接着干。角色页的背包栏装上背包还能多几格。'),
      tl('所有城镇的仓库是同一份。制作直接用仓库里的材料；手动存取东西要站在仓库旁边。'),
      tl('做出来的装备有六档品质，从普通（白）到神话（红），品质越高属性越好。不要的装备拿去仓库旁的分解台换金币。'),
      FINE_POINTER ? tl('左键点物品图标看详情，右键直接装备、放进补给栏或打开宝箱。配方里缺的材料标红，点它会跳到能做的地方。') : tl('点物品图标看详情，在背包里点物品可以装备、吃掉或打开。配方里缺的材料标红，点它会跳到能做的地方。'),
    ],
  },
  {
    title: tl('战斗'),
    icons: ['copper_sword', 'minnow', 'hide_1'],
    lines: [
      tl('武器决定战斗方式：剑和长枪是近战，弓弩是远程，法杖是魔法，都不用带箭或符文。'),
      tl('角色页的食物栏放上食物，血少了会自己吃；开战前食物不够会先回仓库拿。连续阵亡 3 次会停下来。'),
      tl('点怪物会先给出战前评估：难度、每只要打几秒、会掉多少血。地点页的「怪物」分页能按等级找怪、一键寻路。'),
      FINE_POINTER ? tl('按 L 打开日志，能看到每次击杀、阵亡和采集的记录。') : tl('点下方的「每小时击杀」那一条可以打开日志，看每次击杀、阵亡和采集的记录。'),
    ],
  },
  {
    title: tl('出行：石碑、寻路和坐骑'),
    icons: ['mount_danmark'],
    lines: [
      tl('野外每个区域都有一座传说石碑，走近就会点亮。站在点亮的石碑旁，可以传送到别的点亮石碑。'),
      tl('自动寻路会自己比较走路和顺路传送哪个更快。所有寻路列表都会标出「最近」的地点和大概要多久走到。'),
      FINE_POINTER ? tl('坐骑放进角色页的坐骑栏后，按 R 或地图右下角的按钮上下坐骑，骑着走得更快。野马掉的小马崽可以在畜牧站养大。') : tl('坐骑放进角色页的坐骑栏后，点地图右下角的按钮上下坐骑，骑着走得更快。野马掉的小马崽可以在畜牧站养大。'),
    ],
  },
  {
    title: tl('一起玩：好友、组队和公会'),
    icons: ['dkey_g4'],
    lines: [
      tl('每个玩家有一个数字 UID，在「好友」页顶上。互加好友后可以私聊、组队、交易；地图上点别的玩家也能直接加好友。'),
      tl('组队打同一种怪大家一起出伤害，每多一个队友全队经验 +5%（最多 +25%）。队员可以打开「跟随队长」，自动跟着队长打怪、进副本。'),
      tl('战斗等级高了以后，用副本钥匙在野外开绿洞（单人或组队）和蓝洞（必须组队），通关开宝箱拿好东西。'),
      tl('加入公会有经验和金币加成，还有随处能存取的公会仓库。聊天页有世界、公会、队伍和私聊频道。'),
    ],
  },
  {
    title: tl('最后几个小贴士'),
    icons: [],
    lines: [
      tl('离开超过一分钟再回来，会弹出总结：得了哪些经验和物品、阵亡几次、哪个任务为什么停了。'),
      tl('用手机浏览器玩觉得界面挤，到「更多 → 设置 → 界面」把界面缩放调到 80%～90%。'),
      tl('「更多」页有攻略手册，每个系统、每座城镇、每个首领都有详细说明；新手任务一览也在里面。'),
      tl('每次更新会弹出更新公告。这份指引在「更多」页和 ? 按钮里都能再打开。'),
    ],
  },
];

type Fn = (open: boolean) => void;
const fns = new Set<Fn>();
export const openGuide = () => fns.forEach((f) => f(true));
// 新手指引开着的时候别的弹窗（活动公告）先等着，关掉以后再弹，免得叠在一起
let showing = false;
const closed = new Set<() => void>();
export const guideShowing = () => showing;
export function onGuideClosed(f: () => void) {
  closed.add(f);
  return () => { closed.delete(f); };
}

export function Guide() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem('canglin-guide-seen'); } catch { return false; }
  });
  if (open) showing = true;
  useEffect(() => {
    if (!open) {
      if (showing) { showing = false; closed.forEach((f) => f()); }
      return;
    }
    try {
      // 第一次进游戏只看新手指引：副本（T4 起）和万圣节（30 级起）的大公告对新号没用，不再接着连弹
      if (!localStorage.getItem('canglin-guide-seen')) {
        localStorage.setItem('canglin-dg-notice', '1');
        localStorage.setItem('canglin-hw-notice', '1');
      }
      localStorage.setItem('canglin-guide-seen', '1');
    } catch { /* 无痕模式存不了就算了 */ }
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
        {p.icons.some((id) => ITEMS[id]) && <div className="guide-art">{p.icons.filter((id) => ITEMS[id]).map((id) => <Icon key={id} item={id} size={36} info={false} />)}</div>}
        <h2>{p.title} <small className="muted">{page + 1}/{PAGES.length}</small></h2>
        <ul>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="go">
          {page > 0 && <button onClick={() => setPage(page - 1)}>{tl('上一页')}</button>}
          <button className="primary" onClick={() => (last ? setOpen(false) : setPage(page + 1))}>{last ? tl('开始游戏') : tl('下一页')}</button>
          {!last && <button onClick={() => setOpen(false)}>{tl('跳过')}</button>}
        </div>
      </div>
    </div>
  );
}
