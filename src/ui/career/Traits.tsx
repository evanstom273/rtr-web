import { useState } from 'react';
import { TRAITS, canAdd, conflictOf, findWrestler, traitDef, traitName, type TraitId } from '../../data/rtr';
import { buyBlock, buyTrait, traitPrice, type Career } from '../../career';
import { commit, money, useWords } from './parts';

/** Someone's traits as chips: in-ring plain, backstage in gold. Tap-and-hold (title) explains each. */
export function TraitChips({ traits, empty }: { traits?: readonly TraitId[]; empty?: string }) {
  if (!traits?.length) return empty ? <div className="c-effs"><span className="c-eff">{empty}</span></div> : null;
  return (
    <div className="c-effs c-traits">
      {traits.map((t) => <span key={t} className={traitDef(t).cat === 'ring' ? 'c-eff' : 'c-eff gold'} title={traitDef(t).blurb}>{traitName(t)}</span>)}
    </div>
  );
}

/**
 * Training › traits: pick one, see what it does and what it costs, and (with three already) which one
 * you'd give up. Nothing changes until you confirm. Shut on booked days, like the gym.
 */
export function TraitShop({ c, booked, onClose }: { c: Career; booked: boolean; onClose: () => void }) {
  const { w } = useWords();
  const me = findWrestler(c.player)!;
  const held = me.traits ?? [];
  const [pick, setPick] = useState<TraitId | null>(null);
  const [give, setGive] = useState<TraitId | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const full = held.length >= 3;
  const clash = pick ? conflictOf(pick) : undefined;
  // The one to give up: the clashing trait if there is one, otherwise your choice when you hold three.
  const replacing = pick && clash && held.includes(clash) ? clash : full ? give ?? undefined : undefined;
  const block = pick ? (booked ? 'You’re booked today: come back on a free day.' : buyBlock(c, pick, replacing)) : null;
  const price = pick ? traitPrice(pick) : 0;
  const choose = (t: TraitId) => { setPick(t); setGive(null); setDone(null); };
  const confirm = () => {
    if (!pick || block) return;
    setDone(buyTrait(c, pick, replacing));
    setPick(null);
    setGive(null);
    commit();
  };

  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div>
        <div className="c-sh">
          <div><span>{w('Training')} · {money(c.money)}</span><b>{w('Traits')}</b></div>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="c-rows" style={{ gap: 6 }}>
          <span className="c-lab">{w('Yours')} · {held.length} of 3</span>
          <TraitChips traits={held} empty="None yet" />
          {done && <div className="c-start"><span className="c-lab">{w('Done')}</span><span className="c-val">{done}</span></div>}
          {pick ? (
            <div className="c-start">
              <div className="c-rowsb"><b className="c-at" style={{ fontSize: 17 }}>{traitName(pick)}</b><span className="c-hint">{money(price)}</span></div>
              <span className="c-ad">{traitDef(pick).blurb}</span>
              {full && !(clash && held.includes(clash)) && (
                <>
                  <span className="c-lab">{w('Give up one')}</span>
                  {held.map((t) => (
                    <button key={t} className={t === give ? 'c-ans on' : 'c-ans'} disabled={canAdd(held, pick, t) !== 'ok'} onClick={() => setGive(t)}>
                      <b className="c-at">{traitName(t)}</b><span className="c-ad">{traitDef(t).blurb}</span>
                    </button>
                  ))}
                </>
              )}
              {clash && held.includes(clash) && <span className="c-ad c-why">It clashes with {traitName(clash)}: that one goes.</span>}
              {block && <span className="c-ad c-why">{block}</span>}
              <div className="c-kv">
                <span className="c-lab">{w('Bank after')}</span><span className="c-val">{money(c.money - price)}</span>
                <span className="c-lab">{w('You’ll have')}</span><span className="c-val">{[...held.filter((t) => t !== replacing), pick].map(traitName).join(', ')}</span>
              </div>
            </div>
          ) : (
            <>
              {(['ring', 'backstage'] as const).map((cat) => (
                <div key={cat} style={{ display: 'contents' }}>
                  <span className="c-sec">{w(cat === 'ring' ? 'In the ring' : 'Backstage')}</span>
                  {TRAITS.filter((t) => t.cat === cat).map((t) => {
                    const have = held.includes(t.id);
                    const x = conflictOf(t.id);
                    return (
                      <button key={t.id} className="c-ans" disabled={have} onClick={() => choose(t.id)} style={{ padding: '6px 10px' }}>
                        <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{t.name}</b><span className="c-hint">{have ? w('Yours') : money(traitPrice(t.id))}</span></span>
                        <span className="c-ad">{t.blurb}{x && held.includes(x) ? ` Clashes with your ${traitName(x)}.` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="c-nav">
          <button className="c-b2" onClick={() => (pick ? setPick(null) : onClose())}>{pick ? w('‹ Back') : w('Close')}</button>
          <button className="c-b1" disabled={!pick || !!block || (full && !replacing)} onClick={confirm}>{pick ? w(`Confirm · ${money(price)}`) : w('Pick a trait')}</button>
        </div>
      </div>
    </div>
  );
}
