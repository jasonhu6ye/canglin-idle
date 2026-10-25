import { ITEMS } from '../core/data';
import { qid, qualityOdds, QUALITY_NAME, qClass, baseOf } from '../core/quality';
import { tl } from '../i18n';
import { gearStats } from './panels';
import { Icon } from './icons';

/*
 * 装备品质（用户 10-25）：制作页、物品详情里列出每个品质的出货率和属性。
 */
const pct = (p: number) => (p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(1) : p.toFixed(2)).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

/** 制作页：做这件装备每个品质的概率 */
export function QualityOdds({ item }: { item: string }) {
  const it = ITEMS[item];
  if (!it?.equip || it.equip.move) return null;
  const odds = qualityOdds(it.tier);
  return (
    <span className="q-odds">
      <small className="muted">{tl('品质概率：')}</small>
      {odds.map((p, q) => <small key={q} className={`q-chip ${qClass(q)}`}>{QUALITY_NAME[q]} {pct(p)}%</small>)}
    </span>
  );
}

/** 物品详情：每个品质的属性和出货率 */
export function QualityTable({ id }: { id: string }) {
  const base = baseOf(id);
  const it = ITEMS[base];
  if (!it?.equip) return null;
  const odds = qualityOdds(it.tier);
  return (
    <>
      <b className="sub">{tl('品质（制作时随机）')}</b>
      <table className="q-table">
        <tbody>
          {QUALITY_NAME.map((name, q) => {
            const v = qid(base, q);
            return (
              <tr key={q} className={v === id ? 'cur' : ''}>
                <td><span className="with-icon"><Icon item={v} size={18} info={false} /> <b className={qClass(q) || 'qn0'}>{name}</b></span></td>
                <td className="muted">{gearStats(v)}</td>
                <td className="muted">{pct(odds[q])}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
