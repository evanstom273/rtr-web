import { monthlySalary, perDateOf, splitDeal } from '../../career/economy';
import type { PayType } from '../../career/types';
import { useWords } from './parts';

/** The money in a deal, however it pays. */
export interface PayDeal { fee: number; pay?: PayType; salaryMult?: number; dateMult?: number; dates?: number }

/** The ± buttons move an amount by about 5% (in £50s). */
const step = (v: number): number => Math.max(50, Math.round((v * 0.05) / 50) * 50);

/**
 * The money boxes (Lyra's call): PPA a fee an appearance, Monthly a salary, Both one box for each, set separately.
 * Changing either one reprices the deal (its unit and the split) through `splitDeal`.
 */
export function PayBoxes({ promo, deal, onChange }: { promo: string; deal: PayDeal; onChange: (d: { fee: number; salaryMult?: number; dateMult?: number }) => void }) {
  const { w } = useWords();
  const pay = deal.pay ?? 'ppa';
  const k = { ...deal, pay, promo };
  const salary = monthlySalary(k), perDate = perDateOf(k);
  const set = (s: number, x: number) => onChange(splitDeal(promo, pay, s, x, deal.dates));
  const box = (label: string, aria: string, v: number, put: (n: number) => void) => (
    <>
      <span className="c-sec">{w(label)}</span>
      <div className="c-cyc">
        <button className="c-stepb" onClick={() => put(Math.max(0, v - step(v)))} aria-label={`${aria}: less`}>−</button>
        <input className="c-fld mid" type="number" inputMode="numeric" min={0} step={50} value={v} onChange={(e) => put(Math.max(0, Math.round(Number(e.target.value) || 0)))} aria-label={aria} style={{ textAlign: 'center', fontSize: 20 }} />
        <button className="c-stepb" onClick={() => put(v + step(v))} aria-label={`${aria}: more`}>+</button>
      </div>
    </>
  );
  return (
    <>
      {pay !== 'ppa' && box('Salary a month', 'Salary a month', salary, (v) => set(v, perDate))}
      {pay !== 'monthly' && box(pay === 'both' ? 'Plus a fee an appearance' : 'Fee an appearance', 'Fee an appearance', perDate, (v) => set(salary, v))}
    </>
  );
}
