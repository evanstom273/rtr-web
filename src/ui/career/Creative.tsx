import { useState } from 'react';
import { findWrestler, rosterOf, WRESTLERS } from '../../data/rtr';
import {
  CREATIVE_LABEL, creativeAsk, creativeBlock, creativeBouts, creativeOdds, creativeTier, dealsOf, opponentsFor, person, promoName, vetoNext,
  type Career, type CreativeKind, type CreativeReq,
} from '../../career';
import { CLAUSES, C } from '../../career/clauses';
import { fmtDay } from '../../career/dates';
import { commit, Head, Nm, Screen, useToast, useWords } from './parts';

/**
 * Creative Control (Lyra's design): your matches on drawn cards (win or lose, a different opponent, the main event),
 * and your storylines (pitch a feud, end one, turn). Ask at Tier 1, veto about once a month at Tier 2, decide at Tier 3.
 */
export function Creative({ c, onBack }: { c: Career; onBack: () => void }) {
  const { w } = useWords();
  const [toast, say] = useToast();
  const [, bump] = useState(0);
  const [pick, setPick] = useState<{ kind: 'opponent' | 'feud'; show?: string; promo: string } | null>(null);
  const deals = dealsOf(person(c, c.player)).filter((k) => creativeTier(c, k.promo) > 0);
  const bouts = creativeBouts(c);
  const me = findWrestler(c.player)!;

  const go = (r: CreativeReq, veto = false) => {
    const a = creativeAsk(c, r, veto);
    commit();
    setPick(null);
    bump((n) => n + 1);
    say(a.answer === 'yes' ? a.said : `No: ${a.said}`);
  };
  /** Ask, veto or decide: the buttons a request gets at your tier. */
  const asks = (r: CreativeReq) => {
    const tier = creativeTier(c, r.promo);
    const block = creativeBlock(c, r);
    const odds = Math.round(creativeOdds(c, r.promo) * 100);
    const next = tier === 2 ? vetoNext(c, r.promo) : null;
    if (block && !(r.kind === 'opponent' || r.kind === 'feud') ) return <span className="c-eff">{w(block)}</span>;
    return (
      <span className="c-effs">
        {tier >= 3 ? <button className="c-eff up" onClick={() => go(r)}>{w('Decide')}</button> : <button className="c-eff" onClick={() => go(r)}>{w(`Ask · ${odds}%`)}</button>}
        {tier === 2 && (next ? <span className="c-eff dn">{w(`Veto from ${fmtDay(next, 'dm')}`)}</span> : <button className="c-eff gold" onClick={() => go(r, true)}>{w('Use your veto')}</button>)}
      </span>
    );
  };

  if (pick) {
    const show = pick.show ? c.shows[pick.show] : undefined;
    const pool = pick.kind === 'opponent' && show ? opponentsFor(c, show, WRESTLERS) : rosterOf(pick.promo).filter((x) => x.id !== c.player && !c.people[x.id]?.retired);
    return (
      <Screen>
        <Head title={w(pick.kind === 'opponent' ? 'Pick an Opponent' : 'Pick a Rival', pick.kind === 'opponent' ? 'OPPONENT' : 'RIVAL')} meta={show ? `${show.name} · ${fmtDay(show.date, 'dm')}` : promoName(pick.promo)} onBack={() => setPick(null)} />
        <div className="c-body">
          {pool.length === 0 && <span className="c-note">Nobody’s free.</span>}
          {pool.slice(0, 40).map((x) => (
            <div key={x.id} className="c-ans" style={{ padding: '7px 10px' }}>
              <span className="c-rowsb"><Nm id={x.id} />{asks({ kind: pick.kind, promo: pick.promo, show: pick.show, opp: x.id })}</span>
            </div>
          ))}
        </div>
        {toast}
      </Screen>
    );
  }

  return (
    <Screen>
      <Head title={w('Creative Control', 'CREATIVE')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        {deals.length === 0 && <span className="c-note">None of your deals has Creative Control. It’s a clause you can negotiate when you next sign.</span>}
        {deals.map((k) => {
          const t = creativeTier(c, k.promo);
          const next = t === 2 ? vetoNext(c, k.promo) : null;
          return (
            <div key={k.promo} className="c-start">
              <span className="c-lab">{promoName(k.promo)}</span>
              <b className="c-at">{CLAUSES[C.creative]!.short[t - 1]}</b>
              <span className="c-ad">{CLAUSES[C.creative]!.tiers[t - 1]}</span>
              <span className="c-hint">{t >= 3 ? 'Every call is yours.' : t === 2 ? (next ? `Veto used: the next one’s from ${fmtDay(next, 'dm')}.` : 'Your veto’s ready.') : `Your asks come off about ${Math.round(creativeOdds(c, k.promo) * 100)}% of the time (their booker’s patience).`} It costs nothing to use.</span>
            </div>
          );
        })}
        {deals.length > 0 && <span className="c-sec">{w('Your matches')}</span>}
        {deals.length > 0 && bouts.length === 0 && <span className="c-note">You’re not on any card that’s been drawn yet (cards are drawn a week ahead).</span>}
        {bouts.map(({ show, bout }) => {
          const opp = bout.a === c.player ? bout.b : bout.a;
          const plan = bout.planned === c.player ? 'Booked to win' : bout.planned ? 'Booked to lose' : 'No planned finish';
          const promo = (show.promos ?? [show.promo]).find((p) => creativeTier(c, p) > 0) ?? show.promo;
          const row = (kind: CreativeKind) => (
            <span className="c-rowsb" key={kind}><span className="c-ad">{w(CREATIVE_LABEL[kind])}</span>{kind === 'opponent' ? <button className="c-eff" onClick={() => setPick({ kind: 'opponent', show: show.id, promo })}>{w('Pick ›')}</button> : asks({ kind, promo, show: show.id })}</span>
          );
          return (
            <div key={show.id} className="c-ans" style={{ padding: '8px 10px' }}>
              <span className="c-rowsb"><span className="c-lab">{fmtDay(show.date, 'dm')} · {show.name}</span><span className={bout.planned === c.player ? 'c-eff up' : bout.planned ? 'c-eff dn' : 'c-eff'}>{w(plan)}</span></span>
              <span className="c-vs"><Nm id={c.player} /><span className="c-vsx">VS</span><Nm id={opp} /></span>
              {(['win', 'lose', 'opponent', 'position'] as CreativeKind[]).map(row)}
            </div>
          );
        })}
        {deals.length > 0 && <span className="c-sec">{w('Your storylines')}</span>}
        {deals.map((k) => {
          const feud = c.feuds.find((f) => !f.done && f.promo === k.promo && (f.a === c.player || f.b === c.player));
          return (
            <div key={k.promo} className="c-ans" style={{ padding: '8px 10px' }}>
              <span className="c-lab">{promoName(k.promo)}</span>
              {feud ? <span className="c-rowsb"><span className="c-ad">Feuding with <Nm id={feud.a === c.player ? feud.b : feud.a} /></span>{asks({ kind: 'endFeud', promo: k.promo })}</span>
                : <span className="c-rowsb"><span className="c-ad">{w('Pitch a feud')}</span><button className="c-eff" onClick={() => setPick({ kind: 'feud', promo: k.promo })}>{w('Pick ›')}</button></span>}
              <span className="c-rowsb"><span className="c-ad">{w(me.disposition === 'HEEL' ? 'Turn face' : 'Turn heel')}</span>{asks({ kind: 'turn', promo: k.promo })}</span>
            </div>
          );
        })}
      </div>
      {toast}
    </Screen>
  );
}
