import { useEffect, useState } from 'react';

/**
 * 更新公告（用户 10-23 要求）：有新版本时进游戏自动弹一次，「更多」页也能再打开。
 * 新玩家第一次进游戏先看新手指引，不弹公告。
 */
interface Note { id: string; date: string; title: string; lines: string[] }
export const NEWS: Note[] = [
  {
    id: '2026-10-23-e', date: '10 月 23 日', title: '传说石碑、人物属性与一大波优化',
    lines: [
      '坐骑「Chinese can fly」骑乘移速加成从 +100% 提高到 +160%。',
      '新技能「养殖」占位：技能页已经能看到（羊的图标），玩法还在做，标着「即将开放」。',
      '游戏画面左上角（任务条下面）新增增益栏：料理增益、雨天钓鱼、骑乘，图标下面写剩余时间，点一下看说明。',
      '手机端角色页的属性默认收起，点标题展开。',
      '世界地图上的传送石碑改成高对比颜色：已激活亮青色、未激活橙色。',
      '新增「传说石碑」传送点：主城、落霞城和每个野外区域各一座。走到石碑旁边就会激活，之后站在任意一座激活过的石碑旁，就能传送到别的石碑。',
      '雨天钓鱼增益：钓点下雨时钓鱼快 25%（右上角时钟会显示下雨，干活条上也会提示）。',
      '人物页新增「属性」：生命、攻击、力量、最高伤害、攻击间隔、防御、移动速度，逐项写出来自等级、装备、弹药还是料理；另列每个技能的干活加速。',
      '城镇制作更快捷：配方里点缺的材料会直接跳到它的制作或采集地点，并选中那个配方；寻路走到建筑、资源点或石碑旁边会自动打开页面。',
      '种田：地块头顶显示种的作物、长到几成、还要多久熟、有没有浇水；空地、已播种、浇过水三种土的样子不同。田地面板的小图可以点开看每一格。',
      '世界地图：你的位置改成醒目的粉红色并带扩散光圈；新增筛选（传送石碑、城镇、采矿、伐木、钓鱼、采集、狩猎、偷窃、首领、洞窟）。',
      '钓鱼时角色朝向水面：水在上方或下方时背对或面朝镜头举竿，鱼线垂进水里。',
      '修复：同一种鱼好几处都能钓时，钓几条后角色会跑去别的钓点、工作中断。',
    ],
  },
  {
    id: '2026-10-23-b', date: '10 月 23 日', title: '星露谷式种田',
    lines: [
      '四块田改成一格一格的地块：点空地播种、点作物浇水（快 25%）、点熟了的收获。',
      '田地面板可以选种子、一键种满 / 浇水 / 收获，打开「自动补种」后熟了自动收进仓库再种回去，离线也照样长。',
    ],
  },
  {
    id: '2026-10-23-a', date: '10 月 23 日', title: '坐骑、日志与昼夜时钟',
    lines: [
      '坐骑「Chinese can fly」：在「更多」页输入兑换码领取，骑乘移动速度 +100%，R 键上下坐骑。',
      '左下角日志：战斗掉落和经验、采集制作的产出，可翻页，带统计页。',
      '右上角像素风昼夜时钟；电脑端世界地图可以滚轮缩放、拖动。',
    ],
  },
];

const KEY = 'canglin-news-seen';
type Fn = () => void;
const fns = new Set<Fn>();
export const openNews = () => fns.forEach((f) => f());

export function News() {
  const [open, setOpen] = useState(() => {
    try {
      const seen = localStorage.getItem(KEY);
      // 新玩家（还没看过新手指引）不弹，直接记成已看
      if (!localStorage.getItem('canglin-guide-seen')) {
        localStorage.setItem(KEY, NEWS[0].id);
        return false;
      }
      return seen !== NEWS[0].id;
    } catch {
      return false;
    }
  });
  const [more, setMore] = useState(false);
  useEffect(() => {
    const f = () => { setOpen(true); setMore(false); };
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  if (!open) return null;
  const close = () => {
    try { localStorage.setItem(KEY, NEWS[0].id); } catch { /* 存不了就算了 */ }
    setOpen(false);
  };
  const shown = more ? NEWS : NEWS.slice(0, 1);
  return (
    <div className="item-popup" onClick={close}>
      <div className="item-popup-body frame news" onClick={(e) => e.stopPropagation()}>
        <h2 className="gold">更新公告</h2>
        <div className="news-body">
          {shown.map((n) => (
            <section key={n.id}>
              <h3>{n.title} <small className="muted">{n.date}</small></h3>
              <ul>{n.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            </section>
          ))}
        </div>
        <div className="go">
          {!more && NEWS.length > 1 && <button onClick={() => setMore(true)}>往期公告</button>}
          <button className="primary" onClick={close}>知道了</button>
        </div>
      </div>
    </div>
  );
}
