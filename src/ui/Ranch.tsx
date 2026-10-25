import { useEffect, useRef, useState } from 'react';
import type { MapNode } from '../core/data';
import { COAT_NAME, coatOf, FOAL, growMs, RANCH, RANCH_PENS } from '../core/ranch';
import { atRanch, collectHorse, level, penLeft, placeFoal } from '../core/sim';
import type { GameState } from '../core/types';
import { foalIconUrl, horseIconUrl, paintFoal } from '../game/horseArt';
import { store } from '../store';

/*
 * 城镇畜牧站面板（用户 10-24）：三个马栏，放小马崽进去养 1 小时（养殖等级越高越快），
 * 长大了牵走才揭晓速度资质 50%-200%。
 */

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/** 小马崽待机动画：甩尾、抬头 */
function FoalAnim({ size = 64 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frames = Array.from({ length: 24 }, (_, i) => paintFoal(i, 0, 32));
    let i = 0;
    const draw = () => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(frames[i++ % 24], 0, 0);
    };
    draw();
    const t = setInterval(draw, 110);
    return () => clearInterval(t);
  }, []);
  return <canvas ref={ref} width={32} height={32} className="ranch-foal" style={{ width: size, height: size }} />;
}

export function RanchSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  const now = useNow();
  const [reveal, setReveal] = useState<number | null>(null);
  const near = atRanch(s);
  const lv = level(s, 'husbandry');
  const foals = (s.bag[FOAL] ?? 0) + (s.bank[FOAL] ?? 0);
  const pens = Array.from({ length: RANCH_PENS }, (_, i) => s.ranch?.pens[i] ?? null);
  const place = (i: number) => store.dispatch((g) => placeFoal(g, i, Date.now()));
  const collect = (i: number) => {
    let apt = 0;
    store.dispatch((g) => {
      const [next, a] = collectHorse(g, i, Date.now());
      apt = a;
      return next;
    });
    if (apt) setReveal(apt);
  };
  return (
    <div className="sheet ranch-sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
        <small className="muted">养殖 Lv{lv} · 小马崽长大要 {Math.round(growMs(lv) / 60000)} 分钟</small>
      </div>
      <div className="ranch-stats">
        <span><img src={foalIconUrl()} alt="" /> 小马崽 <b>{foals}</b> 匹（背包 + 仓库）</span>
        {!near && <button className="primary" onClick={() => { store.requestWalk(RANCH); onClose(); }}>寻路到畜牧站</button>}
      </div>
      {reveal !== null && (
        <div className={`ranch-reveal rare${coatOf(reveal)}`} onClick={() => setReveal(null)}>
          <img src={horseIconUrl(coatOf(reveal))} alt="" />
          <div>
            <div className="muted">小马长大了！速度资质揭晓：</div>
            <b>{COAT_NAME[coatOf(reveal)]} · 移速 +{reveal}%</b>
            <div>获得养殖经验 600</div>
            <div className="muted small">已放进背包（背包满了就进仓库），在「角色」页的坐骑栏装备，R 键或地图右下的马按钮上下马。</div>
          </div>
        </div>
      )}
      <ul className="ranch-pens">
        {pens.map((p, i) => {
          const left = p ? penLeft(p, now) : 0;
          const pct = p ? Math.min(100, ((now - p.start) / p.ms) * 100) : 0;
          return (
            <li key={i} className={p ? (left ? 'growing' : 'ready') : 'empty'}>
              <span className="ranch-pen-no">{i + 1} 号栏</span>
              {p ? <FoalAnim size={left ? 56 : 68} /> : <span className="ranch-empty">空</span>}
              {p ? (
                <>
                  <div className="ranch-bar"><i style={{ width: `${pct}%` }} /></div>
                  <span className="small">{left ? `还要 ${clock(left)}` : '已经成年'}</span>
                  <span className="muted small">资质：{left ? '成年后揭晓' : '牵走时揭晓'}</span>
                  <button className="primary" disabled={!!left || !near} onClick={() => collect(i)}>{left ? '成长中…' : '牵走马匹'}</button>
                </>
              ) : (
                <button disabled={!foals || !near} onClick={() => place(i)}>{foals ? '放入小马崽' : '没有小马崽'}</button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="pad muted small">
        野外的野马（金穗野马 Lv12、青岚野马 Lv32、雪鬃野马 Lv72）有几率掉小马崽，精英和首领掉得更多。
        小马崽在这里养 1 小时长大（养殖每升 1 级少 0.6%，最多少 60%），长大后牵走才揭晓速度资质：移速 +50% 到 +200%。
        资质 100% 以上是乌骓马，150% 以上银白骏马，190% 以上金鬃神驹。马栏离线也会照常长大。
      </p>
    </div>
  );
}
