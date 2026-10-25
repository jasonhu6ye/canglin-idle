import { GUILD_COST } from '../net/api';
import { useMemo, useState, type ReactNode } from 'react';
import { MONSTERS, NODES, REGIONS, SKILLS, nodesOfAction } from '../core/data';
import { SPECIES, TRAITS, WORLD_SKILL } from '../core/bestiary';
import { FACILITY_NAME, TOWNS } from '../core/towns';
import { BAG_SLOTS, BELT_CAP, POTION_AT, WORLD_MOVE } from '../core/sim';
import type { RegionId, SkillId } from '../core/types';
import { FINE_POINTER } from './itemOpen';
import { HW_TIERS } from '../core/halloween';

/*
 * 攻略手册（用户 10-24：所有系统都要有教程和攻略文章，新人要看得懂）。
 * 固定文章写玩法，城镇、群系、首领三篇从数据里现算，改了数据也不会过时。
 */

interface Article { id: string; cat: string; title: string; body: () => ReactNode }

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;
const Steps = ({ items }: { items: ReactNode[] }) => <ol className="hb-steps">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
const Tip = ({ children }: { children: ReactNode }) => <p className="hb-tip">提示：{children}</p>;

const click = FINE_POINTER ? '左键点' : '点';
const walk = FINE_POINTER ? '右键点地面' : '点地面';

/** 野外点位的等级范围（不算城镇、洞窟、海岛） */
function regionRanges() {
  const out = new Map<RegionId, [number, number, number]>();
  for (const n of NODES) {
    if (n.town || n.cave || n.sea || n.waystone || !n.actions.length) continue;
    const r = out.get(n.region) ?? [Infinity, 0, 0];
    out.set(n.region, [Math.min(r[0], n.lv[0]), Math.max(r[1], n.lv[1]), r[2] + 1]);
  }
  return [...out].sort((a, b) => a[1][0] - b[1][0]);
}

/** 首领住在哪：能打的点位，或者它的家（海岛上的） */
function bossWhere(id: string) {
  const at = nodesOfAction(`fight_${id}`)[0];
  if (at) return at.name;
  const sp = SPECIES.find((s) => s.id === id);
  const home = sp?.home && NODES.find((n) => n.id === sp.home);
  return home ? `${home.name}（海岛，待航行开放）` : '未知';
}

const ARTICLES: Article[] = [
  {
    id: 'start', cat: '新手入门', title: '第一个小时怎么玩',
    body: () => <>
      <P>苍岭是放置游戏：你给角色安排任务，它会一直自己干，关掉网页也会继续（离线最多结算 24 小时）。前期跟着左下角的「新手任务」走就不会迷路。</P>
      <Steps items={[
        <>在苍岭城附近砍原木、挖铜矿和锡矿。{click}地图上的树或矿点，选「立即开始」，角色会自己走过去。</>,
        '去熔炉把铜矿和锡矿炼成青铜锭，再去铁匠铺打一把铜镐、一把铜斧。工具会让采集变快。',
        '去湖边钓几条鱼，到灶台做成烤鱼。烤鱼放进角色页的「食物栏」，打架时会自己吃。',
        '打一把木剑或青铜剑，到城外打兔子、野鸡这些低级生物，练近战、防御和生命。',
        '技能到 10 级左右，去落霞城或凤麦镇附近的新区域，点亮那里的传说石碑。',
      ]} />
      <Tip>等级越高动作越快。前 50 级升得很快，后面会慢下来，这时候靠更好的工具和装备提速。</Tip>
    </>,
  },
  {
    id: 'controls', cat: '新手入门', title: '操作说明',
    body: () => <>
      {FINE_POINTER ? <>
        <P>右键点地面走过去，按住右键一直朝鼠标方向走；WASD 或方向键也能走。左键点地点、生物、镇民查看信息并开始干活，左键拖动地图、滚轮缩放。</P>
        <P>快捷键：Tab 背包，M 世界地图，L 日志，R 上下坐骑，1-6 切换右侧面板，Esc 收起面板，? 查看全部快捷键。</P>
        <P>物品：左键看详情，右键直接使用（穿上、放进补给栏、打开宝箱）。</P>
      </> : <>
        <P>点地面角色就走过去，按住不放会一直朝手指方向走；双指缩放地图。点地点、生物、镇民查看信息并开始干活。</P>
        <P>底部栏切换面板：游戏、角色、背包、仓库、技能、公会、更多。右下角的按钮打开世界地图、上下坐骑。</P>
      </>}
      <P>{walk}只是走路，不会打断已经排好的任务；要换任务就在地点里重新选「立即开始」。</P>
    </>,
  },
  {
    id: 'queue', cat: '新手入门', title: '任务和队列',
    body: () => <>
      <P>每个地点里有若干动作。「立即开始」会清掉当前任务、马上走过去开干；「加入队列」排在后面，前一个做完自动开始下一个，最多排好几项。</P>
      <P>数量可以选次数、时长或一直做。装备和工具默认只做 1 件，避免一不小心做出一堆。</P>
      <P>任务停下时屏幕上会有提示条，写清楚为什么停：材料不够、等级不够、连续阵亡、弹药用完、队列做完。提示条里的按钮能直接去补材料或再来一轮。</P>
      <Tip>排在队列里的任务会自己走路过去，所以可以一次排好「挖矿 → 炼锭 → 打造」整条链，然后去睡觉。</Tip>
    </>,
  },
  {
    id: 'bag', cat: '新手入门', title: '背包、仓库和补给栏',
    body: () => <>
      <P>背包有 {BAG_SLOTS} 格，每格最多叠 100 个材料，装备一件占一格。采集的东西先进背包，满了角色会自动走回最近的仓库存好，再回来接着干。</P>
      <P>所有城镇的仓库是同一份，存在哪个都一样。手动存取要站在仓库旁边；制作时可以直接用仓库里的材料，不用先取出来。</P>
      <P>角色页有「食物栏」和「药水栏」，各放一种，最多 {BELT_CAP} 个，不占背包。战斗时先吃食物，血量低于 {Math.round(POTION_AT * 100)}% 先喝药水。回仓库补给时会把两栏补满。</P>
      <P>卖东西、买种子要去集市。</P>
    </>,
  },
  {
    id: 'online', cat: '新手入门', title: '联机：账号、聊天、好友、公会和排行榜',
    body: () => <>
      <P>进游戏要先登录。新玩家用邮箱注册，再创建角色：起一个别的玩家能看到的名字，选一套基础外观。改名、退出登录在「更多 → 设置」里。</P>
      <P>云存档：存档每分钟自动上传一次，关页面时也会传。换设备登录同一个账号，会自动用最新的那份。游戏进度都在你自己的设备上结算，断网也能继续挂机，连不上服务器时可以先离线玩，连上后再补传。</P>
      <P>排行榜：在「更多 → 排行榜」，可以按总等级、战斗等级或任意一个技能看排名，同级再比经验。</P>
      <P>公会：按 G 或点底部「公会」。创建要 {GUILD_COST} 金币（从仓库扣），最多 30 人。会长能任命副会长、转让会长；会长和副会长能改公告、踢人（副会长只能踢普通成员）。会长退出时自动传给副会长或最早入会的成员。</P>
      <P>聊天：底部「聊天」页有世界、公会、队伍、私聊四个频道，按回车键也能打开。地图左下角会显示最新一条消息。</P>
      <P>好友和队伍：每个玩家有一串 8 位数字 ID，在底部「好友」页顶上。输入对方的 ID 发申请，对方同意后点好友能看到他在不在线、等级和公会，可以私聊、邀请组队（最多 5 人），队伍有自己的聊天频道。</P>
      <P>交易：在好友详情里点「发起交易」，双方各自「从仓库放东西」（物品和金币都行），两边都点「确认交易」才成交，收到的东西直接进仓库。任何一方改了东西，双方都要重新确认，随时可以取消。</P>
      <P>地图上能看到附近在线的玩家，头顶有名字和会标。「更多」页顶上显示全服在线人数、延迟和帧率。</P>
      <Tip>公会任务、公会仓库和公会加成会在后续更新里开放。</Tip>
    </>,
  },
  {
    id: 'gear', cat: '装备与战斗', title: '装备和快速换装',
    body: () => <>
      <P>装备分 T1 到 T8 八阶：木制、青铜、铁、钢、钛、符文、陨铁、精金。每阶要求对应的技能等级（比如武器看近战、远程或魔法等级，护甲看防御等级）。</P>
      <P>换装最快的方法：打开角色页，{click}任意一个装备栏或工具栏，会弹出背包里所有能放进这一栏的装备，按等级从高到低排好，点「装备」直接换上，点「卸下」放回背包。站在仓库旁边时，仓库里的装备也会一起列出来。</P>
      <P>工具（斧头、镐子、镰刀、刮皮刀、鱼竿、锄头、锻造锤、缝纫针）让对应技能变快，高阶工具差别很明显，记得及时换。</P>
      <Tip>等级不够的装备会变灰并写明差几级，先去练级再来换。</Tip>
    </>,
  },
  {
    id: 'combat', cat: '装备与战斗', title: '战斗详解',
    body: () => <>
      <P>武器决定战斗方式：剑、长枪、匕首是近战；短弓、长弓、弩是远程，要带箭；法杖是魔法，要带符文。打怪会给当前战斗方式、防御和生命三项经验。</P>
      <P>怪物的「再生」每次出手回血：普通怪 3%、精英 1.5%、首领 0.6%、世界首领 0.3%；战前评估已经算上了再生和吸血，显示「打不动」就先去提升等级和装备。</P>
      <P>每次出手有 5% 几率暴击，伤害 ×1.5。护甲成套有额外效果：板甲每件减伤 3%；皮甲基础 3% 闪避，每件再加 2%；布甲每件暴击率加 2%。</P>
      <P>精英每 6 下打出一次重击；首领每 5 下放一次毁灭一击，血量低于 30% 会狂怒。开打前怪物页会给出评估：难度、每只要打几秒、大概掉多少血、每小时能打几只。</P>
      <P>连续阵亡 3 次任务会停下，这时候该换装备、带更好的食物，或者先去打低一点的怪。</P>
      <P>怪物特性：{Object.values(TRAITS).map((t) => `${t.name}（${t.desc}）`).join('、')}。</P>
    </>,
  },
  {
    id: 'loot', cat: '装备与战斗', title: '掉落和战利品',
    body: () => <>
      <P>打怪必掉金币，野兽类掉兽皮、肉和骨头，人形和魔像掉锭和布，元素和魔眼掉符文，鱼类和甲壳掉鱼。这些都能拿去加工，所以打怪也是材料来源。</P>
      <P>最外圈新区域的生物还会掉本地特产：飞鸟和飞蛾掉羽毛，植物和虫掉树脂，魔像、元素和海兽掉晶石，其余掉香料。拿去珍材坊加工。</P>
      <P>精英会掉福袋、宝箱和少量本阶装备；首领有 30% 掉首领宝藏、35% 掉专属战利品、3% 掉专属战旗（战旗能摆在家园里），还会掉宝石、强化石和本阶装备。</P>
      <P>福袋、宝箱、首领宝藏在背包里{FINE_POINTER ? '右键' : '点一下'}就能打开。</P>
    </>,
  },
  {
    id: 'craft', cat: '生产', title: '制作链：从矿石到装备',
    body: () => <>
      <Steps items={[
        '挖矿得到矿石 → 熔炉炼成锭 → 铁匠铺打造剑、长枪、匕首、板甲、工具和箭头。',
        '伐木得到原木 → 制弓台做木板、弓、弩、鱼竿和箭杆。',
        '狩猎得到兽皮、采集得到棉花 → 工坊鞣皮、织布，做皮甲、布甲、法杖、符文和首饰。',
        '钓鱼、种田 → 灶台做料理（回血，部分料理有限时增益）。采草药 → 药剂铺做药水。',
        '晶石、香料、树脂、羽毛四条新材料线 → 落霞城和外圈城镇的珍材坊加工。',
      ]} />
      <P>配方里缺的材料会标红，点它会跳到能得到这样东西的地方。</P>
    </>,
  },
  {
    id: 'farm', cat: '生产', title: '种田',
    body: () => <>
      <P>苍岭城周围有四块田，越远的田能种越高阶的作物。站在田里点空地种下种子，浇过水长得快 25%，熟了点一下收获，会收回种子。</P>
      <P>田地面板可以一键种满、浇水、收获；打开「自动补种」后，熟了自动收进仓库再种，离线也照样长。种子在集市买，打怪和采集也会掉。</P>
    </>,
  },
  {
    id: 'travel', cat: '地图与出行', title: '传说石碑、自动寻路和坐骑',
    body: () => <>
      <P>每座城镇、每个野外区域、每处有首领的特色地点都有一座传说石碑。第一次要走到旁边点亮，之后站在任意一座点亮的石碑旁，就能传送到其它点亮的石碑。</P>
      <P>在世界地图上选一个地点就会自动寻路过去，退出游戏也会继续走。如果走到石碑传送更快，寻路会自己顺路传送，所以石碑点得越多跑图越快。</P>
      <P>坐骑放进角色页的坐骑栏后，{FINE_POINTER ? '按 R 或' : '点'}地图右下角的按钮上下坐骑，骑着移动速度大幅提升。</P>
    </>,
  },
  {
    id: 'sea', cat: '地图与出行', title: '海岛和以后的航行系统',
    body: () => <>
      <P>12080 大地图的最外圈有大片海洋和群岛。目前水路还没开放，不能跨海，海岛上的地点会显示「未开放」，上面的生物和首领暂时打不到。</P>
      <P>以后会加入航行系统，从珊瑚港这些港口出海。现在已经能在陆地上找到所有技能需要的资源。</P>
      <P>暂未开放的海岛：{NODES.filter((n) => n.sea).map((n) => n.name).join('、')}。</P>
    </>,
  },
  {
    id: 'home', cat: '地图与出行', title: '家园岛屿',
    body: () => <>
      <P>苍岭城、落霞城和几座外圈城镇有家园传送门，走进去就到自己的家园岛屿。岛屿可以扩建，能自由摆放 6 种制作台和储物箱。</P>
      <P>家园里有对应的制作台时，排队的制作任务会就地开工，不用跑去城里。首领战旗、装饰品也可以摆在家园里。</P>
    </>,
  },
  {
    id: 'offline', cat: '地图与出行', title: '离线收益和存档',
    body: () => <>
      <P>离开超过一分钟再回来，会弹出总结：得了哪些经验和物品、阵亡几次、哪个任务为什么停了。离线最多结算 24 小时。</P>
      <P>存档只保存在这个浏览器里。在「更多」页能导出存档码或下载存档文件，换设备时再导入。同时只能开一个游戏页面，多开的页面会自动暂停。</P>
      <Tip>把系统时间往回调不会多结算收益。</Tip>
    </>,
  },
  {
    id: 'towns', cat: '城镇和区域', title: '城镇一览',
    body: () => <>
      <P><b>苍岭城</b>（地图正中）：主城，所有生产设施、四块田、集市、仓库、家园传送门都在这里。</P>
      <P><b>落霞城</b>（金穗草原）：第二主城，全套生产设施，还有只加工新材料的珍材坊。</P>
      {TOWNS.map((t) => {
        const facs = [...new Set(t.buildings.map((b) => b.fac).filter(Boolean))].map((f) => FACILITY_NAME[f!]);
        return <P key={t.id}><b>{t.name}</b>（{REGIONS[t.region].name}）：{t.intro} 设施：{facs.join('、')}{t.portal ? '、家园传送门' : ''}{t.fish ? '、钓鱼栈桥' : ''}。</P>;
      })}
    </>,
  },
  {
    id: 'regions', cat: '城镇和区域', title: '群系和练级路线',
    body: () => <>
      <P>下面是每个区域野外点位的等级范围，按从低到高排。等级接近时，先去离自己近、有石碑的区域。</P>
      <ul className="hb-list">
        {regionRanges().map(([r, [lo, hi, n]]) => <li key={r}><b>{REGIONS[r].name}</b> Lv{lo}-{hi} · {n} 处地点</li>)}
      </ul>
      <Tip>路线建议：苍岭城周边 → 落霞城和青岚丘陵 → 秋林、雨林、峡谷 → 腐月湿地、雪山 → 灰烬海角、寒星山脉 → 晶簇荒原、雷鸣断层、星陨晶海。</Tip>
    </>,
  },
  {
    id: 'bosses', cat: '城镇和区域', title: '首领攻略',
    body: () => {
      const bosses = Object.values(MONSTERS).filter((m) => m.rank === 'boss' && !m.world).sort((a, b) => a.level - b.level);
      return <>
        <P>首领血量大约是同级普通怪的 10 倍，每 5 下放一次毁灭一击，低于 30% 血会狂怒。建议战斗等级不低于首领等级，带满食物栏和药水栏，穿同阶的整套护甲。</P>
        <ul className="hb-list">
          {bosses.map((m) => <li key={m.id}><b>{m.name}</b> Lv{m.level} · {bossWhere(m.id)}{m.traits.length ? ` · ${m.traits.map((t) => TRAITS[t as keyof typeof TRAITS]?.name).join('、')}` : ''}</li>)}
        </ul>
      </>;
    },
  },
  {
    id: 'worldboss', cat: '城镇和区域', title: '世界首领攻略',
    body: () => {
      const bosses = Object.values(MONSTERS).filter((m) => m.world).sort((a, b) => a.level - b.level);
      return <>
        <P>地图上头顶飘着红色骷髅头的地方住着世界首领，世界地图里选「世界首领」筛选就能看到全部五个。它们比普通首领强得多：血量是同级首领的 4 倍，攻防再高 15%，每 4 下放一次专属大招（伤害 ×{WORLD_MOVE.mult}），被打倒后要 2 分钟才会重新出现。</P>
        <P>打赢必掉一个「宝库」，打开能拿到一大堆锭、宝石、强化石、珍材和首领宝藏；专属战利品 60%、首领宝藏 60%、战旗 6%，都比普通首领好拿。</P>
        <ul className="hb-list">
          {bosses.map((m) => <li key={m.id}><b>{m.name}</b> Lv{m.level} · {bossWhere(m.id)} · 大招「{WORLD_SKILL[m.id]?.name}」：{WORLD_SKILL[m.id]?.desc}</li>)}
        </ul>
        <Tip>战斗等级最好比世界首领高 10 级以上，带满食物和药水，穿整套同阶护甲（板甲减伤最稳）。开打前看一眼战前评估，掉血太快就先回去练。</Tip>
      </>;
    },
  },
  {
    id: 'halloween', cat: '装备与战斗', title: '万圣节活动：南瓜王',
    body: () => <>
      <P>活动到 11 月 1 日结束。苍岭城东门外有一座万圣节活动祭坛，点它选难度召唤南瓜王，每小时能召唤一次。召唤后角色会自己走到祭坛开打，打赢一次南瓜王就离开。</P>
      <ul className="hb-list">{HW_TIERS.map((h) => <li key={h.lv}><b>{h.name}</b>：Lv{h.lv}，打赢给 {h.boxes} 个南瓜礼盒</li>)}</ul>
      <P>南瓜礼盒在背包里打开，得 8-15 南瓜积分和一些金币，积分直接存进仓库。积分在活动结束前用来兑换限定物品（兑换商店后续开放）。</P>
      <Tip>选难度时看一眼每档的评估。没打赢也不用重新召唤，回祭坛点「前往挑战」接着打。</Tip>
    </>,
  },
  {
    id: 'horse', cat: '生产', title: '坐骑马与养殖',
    body: () => <>
      <P>野外有三种野马：金穗野马（Lv12，金穗原野）、青岚野马（Lv32，风岭松坡）、雪鬃野马（精英 Lv72，云巅雪坡）。打它们有几率掉「小马崽」，精英和首领掉得更多。</P>
      <P>苍岭城里的畜牧站有 3 个马栏。把小马崽放进去，1 小时后长大（养殖每升 1 级少 0.6%，最多少 60%，离线也照常长）。长大后点「牵走马匹」，这时才揭晓速度资质，每匹得 600 养殖经验。</P>
      <ul className="hb-list">
        <li><b>栗色骏马</b>：移速 +50% ~ +99%</li>
        <li><b>乌骓马</b>：移速 +100% ~ +149%</li>
        <li><b>银白骏马</b>：移速 +150% ~ +189%</li>
        <li><b>金鬃神驹</b>：移速 +190% ~ +200%</li>
      </ul>
      <Tip>马在「角色」页的坐骑栏装备，R 键或地图右下按钮上下马。资质不好的马可以多养几匹再挑。</Tip>
    </>,
  },
  {
    id: 'skills', cat: '生产', title: '全部技能',
    body: () => <ul className="hb-list">
      {(Object.keys(SKILLS) as SkillId[]).map((k) => <li key={k}><b>{SKILLS[k].name}</b>：{SKILLS[k].desc}{SKILLS[k].soon ? '（即将开放）' : ''}</li>)}
    </ul>,
  },
  {
    id: 'faq', cat: '常见问题', title: '常见问题',
    body: () => <>
      <P><b>角色站着不动？</b>看屏幕上的提示条，一般是材料不够、等级不够或者队列做完了。也可能是另一个页面开着游戏，这个页面被暂停了。</P>
      <P><b>一直在仓库和野外来回跑？</b>背包快满了。卖掉或存掉不用的东西，或者少带点补给。</P>
      <P><b>打不过怪？</b>看怪物页的战前评估，掉血太多就换高一阶的护甲、带食物，或者先去打等级低一点的。</P>
      <P><b>走不到某个地方？</b>标「未开放」的是洞窟或海岛，要等以后更新。</P>
      <P><b>手机上看不到游戏？</b>用 Safari 或 Chrome 打开游戏网址，第一次生成地图要几秒钟。</P>
    </>,
  },
];

const CATS = [...new Set(ARTICLES.map((a) => a.cat))];

export function Handbook({ onClose }: { onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const art = useMemo(() => ARTICLES.find((a) => a.id === sel), [sel]);
  if (art) {
    return (
      <div className="page handbook">
        <div className="sheet-head">
          <button className="back" onClick={() => setSel(null)}>‹ 目录</button>
          <h2>{art.title}</h2>
        </div>
        <div className="hb-body">{art.body()}</div>
      </div>
    );
  }
  return (
    <div className="page handbook">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>攻略手册</h2>
        <small className="muted">{ARTICLES.length} 篇</small>
      </div>
      {CATS.map((c) => (
        <div key={c}>
          <h3 className="hb-cat">{c}</h3>
          <div className="hb-index">
            {ARTICLES.filter((a) => a.cat === c).map((a) => <button key={a.id} onClick={() => setSel(a.id)}>{a.title}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}
