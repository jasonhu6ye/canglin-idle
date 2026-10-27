import { useEffect, useState } from 'react';
import { ITEMS } from '../core/data';
import { HW_DAILY_BOXES, claimMail, clearMail, readMail, unreadMail } from '../core/mail';
import { QUESTS, questText } from '../core/quests';
import { bagRoomFor, bagSlots } from '../core/sim';
import type { GameState, Mail } from '../core/types';
import { store } from '../store';
import { tl, tlc } from '../i18n';
import { fmtNum } from './format';
import { Icon, TplIcon } from './icons';
import { showLoot } from './itemOpen';

/*
 * 邮箱（用户 10-25）：系统奖励都发到这里。顶栏的信封按钮打开，红点是没读或没领的邮件数。
 */

type Fn = () => void;
const fns = new Set<Fn>();
export const openMailbox = () => fns.forEach((f) => f());

function mailText(m: Mail): { title: string; body: string } {
  switch (m.kind) {
    case 'hw_daily':
      return {
        title: tl('万圣节每日礼物'),
        body: tl`万圣节活动期间，每天上线都送 ${HW_DAILY_BOXES} 个南瓜礼盒，在背包里打开能得到南瓜积分。苍岭城东门外的祭坛还能召唤南瓜王拿更多礼盒。注意：活动结束（11 月 1 日 0 点）后，没打开的南瓜礼盒会自动销毁，记得及时领取和打开。`,
      };
    case 'quest': {
      const q = QUESTS[Number(m.arg)];
      return { title: tl('新手任务奖励'), body: q ? tl`完成新手任务「${questText(q)}」的奖励。` : tl('完成新手任务的奖励。') };
    }
    case 'redeem':
      return { title: tl('兑换码奖励'), body: tl`兑换码「${m.arg ?? ''}」的奖励。` };
    case 'gift':
      return m.arg === 'dg-launch'
        ? { title: tl('副本大更新礼物'), body: tl('地下副本（绿洞、蓝洞）上线啦！送你 5 把 T4 绿洞钥匙，在背包里使用就能在身边开一个洞口。玩法说明在攻略手册的「副本：绿洞和蓝洞」里。') }
        : { title: tl('系统赠礼'), body: tl('送给全体玩家的礼物。') };
    case 'custom':
      return { title: m.title || tl('系统邮件'), body: m.body ?? '' };
    case 'hw_expired':
      return { title: tl('万圣节活动已结束'), body: tl('感谢参加万圣节活动！没有打开的南瓜礼盒已经自动回收。') };
    default:
      return { title: tl('系统邮件'), body: '' };
  }
}

const when = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function claim(id: number | 'all', from: string) {
  let got: Record<string, number> = {};
  store.dispatch((g) => {
    const [next, r] = claimMail(g, id, (bag, item) => bagRoomFor(bag, item, bagSlots(g)));
    got = r;
    return next;
  });
  if (Object.keys(got).length) showLoot({ from, got });
}

/** 顶栏的信封按钮 */
export function MailButton({ s }: { s: GameState }) {
  const n = unreadMail(s);
  return (
    <button className="mail-btn" title={tlc('mail', '邮箱')} onClick={openMailbox}>
      <TplIcon tpl="mail" tint="#e8d8b0" size={18} />
      {n > 0 && <i className="mail-dot">{n > 99 ? '99+' : n}</i>}
    </button>
  );
}

export function Mailbox({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    const f = () => setOpen(true);
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  if (!open) return null;
  const mail = s.mail ?? [];
  const claimable = mail.filter((m) => !m.claimed && m.items.length);
  const pick = (m: Mail) => {
    setSel(sel === m.id ? null : m.id);
    if (!m.read) store.dispatch((g) => readMail(g, m.id));
  };
  return (
    <div className="item-popup" onClick={() => setOpen(false)}>
      <div className="item-popup-body frame mailbox" onClick={(e) => e.stopPropagation()}>
        <h2 className="gold">{tlc('mail', '邮箱')} <small className="muted">{tl`${mail.length} 封`}</small></h2>
        <div className="mail-actions">
          <button className="primary" disabled={!claimable.length} onClick={() => claim('all', tlc('mail', '邮箱'))}>{tl`一键领取（${claimable.length}）`}</button>
          <button className="pill" disabled={!mail.some((m) => m.claimed || (!m.items.length && m.read))} onClick={() => store.dispatch(clearMail)}>{tl('删除已领取')}</button>
        </div>
        {!mail.length && <p className="muted">{tl('邮箱是空的。游戏送的奖励（新手任务、兑换码、活动礼物）都会发到这里。')}</p>}
        <div className="mail-list">
          {mail.map((m) => {
            const t = mailText(m);
            const on = sel === m.id;
            return (
              <div key={m.id} className={`mail-row ${m.read ? '' : 'unread'} ${m.claimed ? 'done' : ''}`}>
                <button className="mail-head" onClick={() => pick(m)}>
                  {!m.read && <i className="mail-new" />}
                  <b>{t.title}</b>
                  <span className="mail-att">{m.items.slice(0, 3).map((i) => <Icon key={i.item} item={i.item} size={18} info={false} />)}</span>
                  <small className="muted">{when(m.at)}</small>
                </button>
                {on && (
                  <div className="mail-body">
                    {t.body && <p>{t.body}</p>}
                    {m.expires !== undefined && !m.claimed && <small className="muted">{tl`${when(m.expires)} 过期`}</small>}
                    {m.items.length > 0 && (
                      <div className="mail-items">
                        {m.items.map((i) => (
                          <span key={i.item} className="with-icon"><Icon item={i.item} size={24} /> {ITEMS[i.item]?.name} ×{fmtNum(i.qty)}</span>
                        ))}
                      </div>
                    )}
                    {m.items.length > 0 && (m.claimed
                      ? <small className="muted">{tl('已领取')}</small>
                      : <button className="primary" onClick={() => claim(m.id, t.title)}>{tl('领取')}</button>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="primary mail-close" onClick={() => setOpen(false)}>{tl("关闭")}</button>
      </div>
    </div>
  );
}
