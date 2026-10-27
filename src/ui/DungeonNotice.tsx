import { useEffect, useState } from 'react';
import { KEY_SHOP } from '../core/data';
import { dgBannerUrl, dgBossUrl, dgChestsUrl, dgGateUrl, dgMapUrl, dgPartyUrl } from '../game/dungeonPoster';
import { store } from '../store';
import { tl } from '../i18n';
import { fmtNum } from './format';
import { guideShowing, onGuideClosed } from './Guide';
import { Icon } from './icons';
import { FINE_POINTER } from './itemOpen';
import { newsPending, onNewsClosed } from './News';

/**
 * 副本玩法公告（用户 10-25：进游戏弹出绿洞蓝洞公告，带配图）。
 * 第一次进游戏（看过新手指引、更新公告关掉以后）自动弹一次，攻略手册里也能再打开。
 */
const SEEN = 'canglin-dg-notice';
const listeners = new Set<() => void>();
export function openDungeonNotice() {
  listeners.forEach((f) => f());
}

export function DungeonNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const f = () => setOpen(true);
    listeners.add(f);
    const auto = () => {
      try {
        if (guideShowing() || localStorage.getItem(SEEN) || !localStorage.getItem('canglin-guide-seen')) return;
      } catch { return; }
      setOpen(true);
    };
    const off = onNewsClosed(auto);
    const off2 = onGuideClosed(auto);
    if (!newsPending()) auto();
    return () => { listeners.delete(f); off(); off2(); };
  }, []);
  if (!open) return null;
  const close = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* 存不了就算了 */ }
    setOpen(false);
  };
  const go = () => {
    close();
    store.requestWalk('shop_bank');
  };
  return (
    <div className="item-popup" onClick={close}>
      <div className="item-popup-body frame hw-notice dg-notice" onClick={(e) => e.stopPropagation()}>
        <div className="hw-hero">
          <img src={dgBannerUrl()} alt="" />
          <div className="hw-title dg-title"><small>{tl('大更新 · 新玩法')}</small>{tl('地下副本')}<br />{tl('绿洞 · 蓝洞')}</div>
        </div>
        <div className="news-body">
          <p className="hw-lead">{tl('地底深处的洞窟打开了！用')}<b>{tl('副本钥匙')}</b>{tl('在身边开一个限时洞口，钻进去一层层往下打，清光所有怪物后，最后一层')}<b>{tl('首领守着的战利品宝箱')}</b>{tl('就归你了。每一次的地形、路线和怪物都是随机生成的。')}</p>
          <div className="hw-cards">
            <figure>
              <img src={dgGateUrl()} alt="" />
              <figcaption><b>{tl('① 开洞口')}</b>{tl('在背包里使用钥匙，身边开出一个 30 分钟的洞口，会问你要不要自动寻路过去，地图上有光柱标记。')}</figcaption>
            </figure>
            <figure>
              <img src={dgMapUrl()} alt="" />
              <figcaption><b>{tl('② 随机地形')}</b>{tl('每层地形、路线、怪物都不一样。角色自动打怪、清完一层自己下楼，退出游戏也接着打。')}</figcaption>
            </figure>
            <figure>
              <img src={dgBossUrl()} alt="" />
              <figcaption><b>{tl('③ 首领守宝箱')}</b>{tl('宝箱是最后一层尽头的建筑，首领在旁边守着。清完整个副本所有怪才能打开。')}</figcaption>
            </figure>
            <figure>
              <img src={dgChestsUrl()} alt="" />
              <figcaption><b>{tl('④ 四色宝箱')}</b>{tl('绿、蓝、紫、金四种品质，层数越多越好。开出金币、材料、强化石、装备、药水、钥匙……运气差也可能很穷。')}</figcaption>
            </figure>
            <figure>
              <img src={dgPartyUrl()} alt="" />
              <figcaption><b>{tl('⑤ 组队蓝洞')}</b>{tl('蓝洞必须组队，怪更强、层数更多。全队同步进度，宝箱打开时归属已定，人人有保底。')}</figcaption>
            </figure>
            <figure className="dg-keys-card">
              <div className="dg-keys">
                {KEY_SHOP.map(([id, price]) => <span key={id}><Icon item={id} size={28} /><small>{fmtNum(price)}</small></span>)}
              </div>
              <figcaption><b>{tl('⑥ 副本商人')}</b>{tl('苍岭城和落霞城仓库旁有副本商人，用金币买 T4-T6 钥匙。更高阶的钥匙只能从宝箱里开。')}</figcaption>
            </figure>
          </div>
          <h3>{tl('绿洞和蓝洞')}</h3>
          <table className="hw-table">
            <thead><tr><th></th><th>{tl('人数')}</th><th>{tl('层数')}</th><th>{tl('怪物')}</th></tr></thead>
            <tbody>
              <tr><td><b className="dg-green-t">{tl('绿洞')}</b></td><td>{tl('单人或组队')}</td><td>1-4</td><td>{tl('正常')}</td></tr>
              <tr><td><b className="dg-blue-t">{tl('蓝洞')}</b></td><td>{tl('必须组队')}</td><td>2-7</td><td>{tl('更强')}</td></tr>
            </tbody>
          </table>
          <h3>{tl('怎么玩')}</h3>
          <ol className="hb-steps">
            <li>{tl('点下面的「寻路去副本商人」，用仓库里的金币买一把钥匙（T4 绿洞钥匙最便宜）。')}</li>
            <li>{tl`在背包里${FINE_POINTER ? tl('右键') : tl('点一下')}钥匙，选「使用」，身边就会开出洞口。`}</li>
            <li>{tl('走到洞口旁点它，点「进入副本」。组队的话队长可以点「召集队友」。')}</li>
            <li>{tl('进去以后自动打怪。带满食物和药水，打不过可以随时离开，或用回城卷轴传回城镇。')}</li>
            <li>{tl('清完所有怪，点最后一层的宝箱打开。强化石和碎片现在只有副本里才有。')}</li>
          </ol>
        </div>
        <div className="go">
          <button onClick={close}>{tl('知道了')}</button>
          <button className="primary" onClick={go}>{tl('寻路去副本商人')}</button>
        </div>
      </div>
    </div>
  );
}
