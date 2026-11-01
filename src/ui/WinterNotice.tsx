import { useEffect, useState } from 'react';
import { wtBannerUrl, wtFoesUrl, wtIconUrl, wtLootUrl, wtRewardUrl, wtSpawnUrl, wtTeamUrl } from '../game/winterPoster';
import { tl } from '../i18n';
import { NOTICE_CLOSED } from './AvalonNotice';
import { guideShowing, onGuideClosed } from './Guide';
import { newsPending, onNewsClosed } from './News';
import { fastest, GATE_CAMP, MAIN_GATES } from '../core/data';
import { inRealm } from '../core/realm';
import { moveSpeed } from '../core/sim';
import { store } from '../store';

/**
 * 「永冬之裔」活动预告（用户 11-01：像万圣节一样的限时活动，这次是地图上随机刷新活动生物；
 * 每次登录都弹出来，主界面也有入口）。11-02 用户：改成已开启，玩法就是永冬冰原，能直接寻路去传送门。
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
          <div className="hw-title wt-title"><small>{tl('限时活动 · 已开启')}</small>{tl('永冬之裔')}</div>
        </div>
        <div className="news-body">
          <p className="hw-lead">{tl('北方的')}<b>{tl('永冬冰原')}</b>{tl('已经开放。从苍岭城、落霞城城外的')}<b>{tl('永冬传送门')}</b>{tl('进去，冰原上会')}<b>{tl('限时刷出永冬生物、首领和宝箱')}</b>{tl('，打倒它们、打开宝箱拿奖励。')}</p>
          <div className="hw-cards">
            <figure>
              <img src={wtSpawnUrl()} alt="" />
              <figcaption><b>{tl('① 限时降临')}</b>{tl('冰原上每隔一段时间刷出怪物、精英、首领和宝箱，每个存在 30 分钟，时间到了就消失。世界地图选「限时」能看到雪花和倒计时。')}</figcaption>
            </figure>
            <figure>
              <img src={wtFoesUrl()} alt="" />
              <figcaption><b>{tl('② 冰原生物')}</b>{tl('25 种永冬生物，等级 95-135，越往北越强，每个区域都有精英巢。')}</figcaption>
            </figure>
            <figure>
              <img src={wtLootUrl()} alt="" />
              <figcaption><b>{tl('③ 限时宝箱')}</b>{tl('绿、蓝、金三种，站在旁边开 10 秒，每人每轮能开一次，东西直接进仓库。')}</figcaption>
            </figure>
            <figure>
              <img src={wtRewardUrl()} alt="" />
              <figcaption><b>{tl('④ 冰原首领')}</b>{tl('永霜巨人、雪堡男爵两个 125 级首领轮流出现，每小时一个，打赢必掉宝库。')}</figcaption>
            </figure>
            <figure>
              <img src={wtTeamUrl()} alt="" />
              <figcaption><b>{tl('⑤ 一起讨伐')}</b>{tl('冰原的精英和首领不用组队，附近的人能一起打同一只，伤害互相算上。')}</figcaption>
            </figure>
            <figure className="av-risk">
              <div className="av-risk-box wt-risk-box">❄</div>
              <figcaption><b>{tl('⑥ 永冬营地')}</b>{tl('冰原南边的营地有仓库、石碑和回程门，回程门能回苍岭城或落霞城。')}</figcaption>
            </figure>
          </div>
          <h3>{tl('冰原区域')}</h3>
          <table className="hw-table">
            <thead><tr><th></th><th>{tl('等级')}</th></tr></thead>
            <tbody>
              <tr><td><b className="wt-t1">{tl('冻土荒原')}</b></td><td>95-105</td></tr>
              <tr><td><b className="wt-t1">{tl('霜松冻林 / 冰湖群')}</b></td><td>100-110</td></tr>
              <tr><td><b className="wt-t2">{tl('冰裂峡谷')}</b></td><td>105-115</td></tr>
              <tr><td><b className="wt-t2">{tl('冰川山脉 / 冰封废墟')}</b></td><td>110-122</td></tr>
              <tr><td><b className="wt-t3">{tl('极光高地')}</b></td><td>118-128</td></tr>
              <tr><td><b className="wt-t3">{tl('永冬裂隙')}</b></td><td>125-135</td></tr>
            </tbody>
          </table>
          <p className="muted small">{tl('永冬冰晶兑换限定外观「永霜领主」等奖励之后开放。')}</p>
        </div>
        <div className="go">
          {!inRealm(store.state.loc) && <button className="primary" onClick={() => { close(); goGate(); }}>{tl('寻路去永冬传送门')}</button>}
          <button onClick={close}>{tl('关闭')}</button>
        </div>
      </div>
    </div>
  );
}

/** 寻路去最近的永冬传送门（人已经在冰原里就去营地的回程门） */
function goGate() {
  const st = store.state;
  const list = inRealm(st.loc) ? [GATE_CAMP] : MAIN_GATES;
  const to = fastest(list, st.loc, st.waystones, moveSpeed(st))?.node ?? list[0];
  store.requestWalk(to.id);
}

/** 主界面的活动入口：一直挂着，点开看活动说明，「寻路」直接去传送门（用户 11-02：活动已开启） */
export function WinterChip() {
  return (
    <div className="chip hw-chip wt-chip">
      <button className="hw-chip-main" onClick={openWinterNotice}>
        <img src={wtIconUrl()} alt="" /> <b>{tl('永冬之裔')}</b> {tl('限时活动进行中')}
      </button>
      <button className="hw-chip-go" onClick={goGate}>{tl('寻路')}</button>
    </div>
  );
}
