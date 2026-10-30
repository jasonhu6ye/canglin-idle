import { useEffect, useState } from 'react';
import { hwOpen } from '../core/halloween';
import { avBannerUrl, avCampUrl, avChestsUrl, avGatesUrl, avMapUrl, avResUrl } from '../game/avalonPoster';
import { tl } from '../i18n';
import { guideShowing, onGuideClosed } from './Guide';
import { newsPending, onNewsClosed } from './News';

/**
 * 「异域之路」预告（用户 10-30：弹出即将更新的异域公告，带贴图和玩法介绍，参考 Albion 的阿瓦隆之路）。
 * 玩法还没做，这里只是预告：其它公告（更新公告、新手指引、万圣节、副本）都关掉以后自动弹一次，手册里能再打开。
 */
export const NOTICE_CLOSED = 'canglin-notice-closed';
const SEEN = 'canglin-avalon-notice';
const listeners = new Set<() => void>();
export function openAvalonNotice() {
  listeners.forEach((f) => f());
}

export function AvalonNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const f = () => setOpen(true);
    listeners.add(f);
    const auto = () => {
      try {
        if (guideShowing() || newsPending() || localStorage.getItem(SEEN) || !localStorage.getItem('canglin-guide-seen')) return;
        // 排在副本公告、万圣节公告后面，一次只弹一个
        if (!localStorage.getItem('canglin-dg-notice')) return;
        if (hwOpen(Date.now()) && !localStorage.getItem('canglin-hw-notice')) return;
      } catch { return; }
      setOpen(true);
    };
    const off = onNewsClosed(auto);
    const off2 = onGuideClosed(auto);
    window.addEventListener(NOTICE_CLOSED, auto);
    auto();
    return () => { listeners.delete(f); off(); off2(); window.removeEventListener(NOTICE_CLOSED, auto); };
  }, []);
  if (!open) return null;
  const close = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* 存不了就算了 */ }
    setOpen(false);
  };
  return (
    <div className="item-popup" onClick={close}>
      <div className="item-popup-body frame hw-notice av-notice" onClick={(e) => e.stopPropagation()}>
        <div className="hw-hero">
          <img src={avBannerUrl()} alt="" />
          <div className="hw-title av-title"><small>{tl('即将开放 · 新玩法预告')}</small>{tl('异域之路')}</div>
        </div>
        <div className="news-body">
          <p className="hw-lead">{tl('远古的异域人在苍岭大陆之外修了一张古道网，如今')}<b>{tl('异域传送门')}</b>{tl('又一座座亮了起来。穿过传送门，就踏上了连接远方的白石古道：路上有')}<b>{tl('高阶资源')}</b>{tl('、')}<b>{tl('异域守卫')}</b>{tl('看守的宝箱，还有通往大陆另一头的出口。可道路几个小时后就会消失，要抓紧时间。')}</p>
          <div className="hw-cards">
            <figure>
              <img src={avGatesUrl()} alt="" />
              <figcaption><b>{tl('① 随机传送门')}</b>{tl('野外会随机亮起异域传送门，有倒计时。小门一次只能过 2 人，中门 7 人，大门 20 人，过满了要等它重新充能。')}</figcaption>
            </figure>
            <figure>
              <img src={avMapUrl()} alt="" />
              <figcaption><b>{tl('② 古道网络')}</b>{tl('每张道路网都是随机拼出来的几片区域，用古道连在一起。出口通往大陆另一头的野外或城镇，赶远路能当捷径。')}</figcaption>
            </figure>
            <figure>
              <img src={avResUrl()} alt="" />
              <figcaption><b>{tl('③ 高阶资源')}</b>{tl('古道两旁长着 T6-T8 的矿石、木头和棉花，由元素和异域守卫守着。比野外人少、产量高，挖到的东西要平安带回城才算数。')}</figcaption>
            </figure>
            <figure>
              <img src={avChestsUrl()} alt="" />
              <figcaption><b>{tl('④ 三色宝箱')}</b>{tl('异域营地里放着宝箱：绿箱一个人就能拿，蓝箱适合小队，金箱守卫最多、奖励最好，要公会一起打。会开出金币、稀有材料和装备。')}</figcaption>
            </figure>
            <figure>
              <img src={avCampUrl()} alt="" />
              <figcaption><b>{tl('⑤ 公会营地')}</b>{tl('公会可以在古道上扎营，插上公会旗，存放补给，当作往返的落脚点。')}</figcaption>
            </figure>
            <figure className="av-risk">
              <div className="av-risk-box">⏳</div>
              <figcaption><b>{tl('⑥ 道路会消失')}</b>{tl('每条路只存在几个小时。时间到了还没走出来，会被甩回最近的城镇；在里面倒下，会丢掉一部分这一趟拿到的东西。')}</figcaption>
            </figure>
          </div>
          <h3>{tl('三种传送门')}</h3>
          <table className="hw-table">
            <thead><tr><th></th><th>{tl('一次能过')}</th><th>{tl('适合')}</th></tr></thead>
            <tbody>
              <tr><td><b className="av-t1">{tl('小门')}</b></td><td>{tl('2 人')}</td><td>{tl('单人、双人')}</td></tr>
              <tr><td><b className="av-t2">{tl('中门')}</b></td><td>{tl('7 人')}</td><td>{tl('小队')}</td></tr>
              <tr><td><b className="av-t3">{tl('大门')}</b></td><td>{tl('20 人')}</td><td>{tl('公会')}</td></tr>
            </tbody>
          </table>
          <p className="muted small">{tl('玩法还在制作中，开放时间和具体数值以正式更新公告为准。现在可以先把 T6 以上的装备、食物和药水准备好。')}</p>
        </div>
        <div className="go">
          <button className="primary" onClick={close}>{tl('敬请期待')}</button>
        </div>
      </div>
    </div>
  );
}
