import { useState, type ReactNode } from 'react';
import { CLAUSES, GROUPS, type ClauseGroup } from '../../career/clauses';
import type { ClauseDef } from '../../career/clauses';
import { useWords } from './parts';

/**
 * The 25 clauses in their five sections (Lyra's call: grouped, so they stay readable on a phone). Each section
 * folds; its header says how much of it is in the deal. `row` draws one clause.
 */
export function ClauseGroups({ tiers, row, summary, open: start }: {
  tiers: number[];
  row: (cl: ClauseDef, i: number) => ReactNode;
  summary?: (g: ClauseGroup) => string | null;
  open?: ClauseGroup[];
}) {
  const { w } = useWords();
  const [open, setOpen] = useState<Set<ClauseGroup>>(() => new Set(start ?? []));
  const toggle = (g: ClauseGroup) => setOpen((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  return (
    <>
      {GROUPS.map((g) => {
        const idx = CLAUSES.map((cl, i) => [cl, i] as const).filter(([cl]) => cl.group === g.id);
        const inDeal = idx.filter(([, i]) => (tiers[i] ?? 0) > 0).length;
        const isOpen = open.has(g.id);
        const listed = idx.filter(([, i]) => (tiers[i] ?? 0) > 0).map(([cl, i]) => `${cl.name} T${tiers[i]}`).join(' · ');
        return (
          <div key={g.id} style={{ display: 'contents' }}>
            <button className={isOpen ? 'c-ans on' : 'c-ans'} style={{ padding: '8px 10px' }} onClick={() => toggle(g.id)} aria-expanded={isOpen}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{w(g.name)}</b><span className="c-eff">{isOpen ? '▾' : '▸'} {inDeal} of {idx.length}</span></span>
              <span className="c-ad">{summary?.(g.id) ?? (listed || 'Nothing in this section.')}</span>
            </button>
            {isOpen && idx.map(([cl, i]) => <div key={cl.id} style={{ display: 'contents' }}>{row(cl, i)}</div>)}
          </div>
        );
      })}
    </>
  );
}

/** A tier as pips (with locks where a rule rules it out). */
export function Pips({ t, lock }: { t: number; lock?: (n: number) => boolean }) {
  return <span className="c-pips">{[1, 2, 3].map((n) => <i key={n} className={n <= t ? 'c-pip on' : lock?.(n) ? 'c-pip lock' : 'c-pip'} />)}</span>;
}
