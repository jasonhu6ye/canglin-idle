import { useEffect, useState } from 'react';
import { wtBannerUrl, wtFoesUrl, wtIconUrl, wtLootUrl, wtRewardUrl, wtSpawnUrl, wtTeamUrl } from '../game/winterPoster';
import { tl } from '../i18n';
import { NOTICE_CLOSED } from './AvalonNotice';
import { guideShowing, onGuideClosed } from './Guide';
import { newsPending, onNewsClosed } from './News';

/**
 * 「永冬之裔」活动预告（用户 11-01：像万圣节一样的限时活动，这次是地图上随机刷新活动生物；
 * 每次登录都弹出来，主界面也有入口）。玩法还没做，这里只是预告。
 * 每次打开游戏（刷新页面）弹一次：等新手指引、更新公告关掉以后再弹，排在其它预告前面。
 */
const listeners = new Set<() => void>();
export function openWinterNotice() {
  listeners.forEach((f) => f());
}
/** 这次打开游戏是否已经弹过（异域之路预告等它弹过、关掉再弹） */
let shown = false;
let done = false;
export const winterDone = () => done;

export function WinterNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const f = () => setOpen(true);
    listeners.add(f);
    const auto = () => {
      if (shown) return;
      try {
        if (guideShowing() || newsPending() || !localStorage.getItem('canglin-guide-seen')) return;
      } catch { return; }
      shown = true;
      setOpen(true);
    };
    const off = onNewsClosed(auto);
    const off2 = onGuideClosed(auto);
    auto();
    return () => { listeners.delete(f); off(); off2(); };
  }, []);
  if (!open) return null;
  const close = () => {
    done = true;
    setOpen(false);
    window.dispatchEvent(new Event(NOTICE_CLOSED));
  };
  return (
    <div className="item-popup" onClick={close}>
      <div className="item-popup-body frame hw-notice wt-notice" onClick={(e) => e.stopPropagation()}>
        <div className="hw-hero">
          <img src={wtBannerUrl()} alt="" />
          <div className="hw-title wt-title"><small>{tl('限时活动预告 · 即将开放')}</small>{tl('永冬之裔')}</div>
        </div>
        <div className="news-body">
          <p className="hw-lead">{tl('北方冰原深处的')}<b>{tl('永冬裂隙')}</b>{tl('裂开了。冰霜的后裔趁着风雪南下，活动期间大陆各处的野外会')}<b>{tl('随机刷出永冬生物')}</b>{tl('。追上它们、打倒它们，收集')}<b>{tl('永冬冰晶')}</b>{tl('，换取限定奖励。')}</p>
          <div className="hw-cards">
            <figure>
              <img src={wtSpawnUrl()} alt="" />
              <figcaption><b>{tl('① 随机降临')}</b>{tl('每隔一段时间，野外随机几个地点会刮起暴风雪，刷出永冬生物。地图上会标出雪花和倒计时，时间到了没打完它们就会消失。')}</figcaption>
            </figure>
            <figure>
              <img src={wtFoesUrl()} alt="" />
              <figcaption><b>{tl('② 三种永冬生物')}</b>{tl('成群出没的霜裔、头戴冰冠的精英，还有很少出现的永冬领主。等级跟着所在区域走，新手和老玩家都有得打。')}</figcaption>
            </figure>
            <figure>
              <img src={wtLootUrl()} alt="" />
              <figcaption><b>{tl('③ 永冬冰晶')}</b>{tl('打倒永冬生物会掉永冬冰晶（活动积分），精英和领主还会掉霜雪礼盒，打开有冰晶、材料和金币。')}</figcaption>
            </figure>
            <figure>
              <img src={wtRewardUrl()} alt="" />
              <figcaption><b>{tl('④ 限定奖励')}</b>{tl('在苍岭城的永冬冰柱用冰晶兑换限定外观、坐骑和家园冰雕，活动结束后就再也拿不到了。')}</figcaption>
            </figure>
            <figure>
              <img src={wtTeamUrl()} alt="" />
              <figcaption><b>{tl('⑤ 讨伐永冬领主')}</b>{tl('永冬领主出现时全服都会收到消息。它血厚伤害高，适合组队或叫上公会一起打，参与的人都能分到奖励。')}</figcaption>
            </figure>
            <figure className="av-risk">
              <div className="av-risk-box wt-risk-box">❄</div>
              <figcaption><b>{tl('⑥ 每天都有')}</b>{tl('活动期间每天都会刷，挂机时角色也能顺路打附近的永冬生物。不用守着屏幕，上线看看地图上的雪花就行。')}</figcaption>
            </figure>
          </div>
          <h3>{tl('永冬生物')}</h3>
          <table className="hw-table">
            <thead><tr><th></th><th>{tl('出现')}</th><th>{tl('掉落')}</th></tr></thead>
            <tbody>
              <tr><td><b className="wt-t1">{tl('霜裔')}</b></td><td>{tl('最常见，成群出现')}</td><td>{tl('冰晶')}</td></tr>
              <tr><td><b className="wt-t2">{tl('冰冠精英')}</b></td><td>{tl('少见，单独出现')}</td><td>{tl('冰晶、霜雪礼盒')}</td></tr>
              <tr><td><b className="wt-t3">{tl('永冬领主')}</b></td><td>{tl('稀有，全服公告')}</td><td>{tl('大量冰晶、霜雪礼盒')}</td></tr>
            </tbody>
          </table>
          <p className="muted small">{tl('活动还在制作中，开放时间、奖励和具体数值以正式更新公告为准。')}</p>
        </div>
        <div className="go">
          <button className="primary" onClick={close}>{tl('敬请期待')}</button>
        </div>
      </div>
    </div>
  );
}

/** 主界面的活动入口：一直挂着，点开看预告 */
export function WinterChip() {
  return (
    <div className="chip hw-chip wt-chip">
      <button className="hw-chip-main" onClick={openWinterNotice}>
        <img src={wtIconUrl()} alt="" /> <b>{tl('永冬之裔')}</b> {tl('限时活动即将开放')}
      </button>
      <button className="hw-chip-go" onClick={openWinterNotice}>{tl('预告')}</button>
    </div>
  );
}
