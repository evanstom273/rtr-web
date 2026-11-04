import { useState } from 'react';
import { findWrestler, PROMOTIONS } from '../../data/rtr';
import { CHARACTER, dealsOf, FACTOR_NAME, FACTORS, gradeOf, knows, person, promoName, type Career, type Grade } from '../../career';
import { fmtDay } from '../../career/dates';
import { Head, Screen, useWords } from './parts';

const STEP: Record<string, [string, string]> = { pass: ['They’d pass', 'c-eff dn'], radar: ['On their radar', 'c-eff'], tryout: ['A tryout', 'c-eff gold'], offer: ['An offer', 'c-eff up'] };
const STAGE: Record<string, string> = { pass: 'Passed for now', radar: 'Watching your matches', tryout: 'Tryout offered', dev: 'Developmental deal offered', offer: 'Offer made' };

/**
 * Scouting reports (Lyra's redesign): how each major rates you. Your grade against their bars (their roster's
 * bottom quarter and median), what they value, your standouts, what's holding you back, and where you are with them.
 */
export function Scouting({ c, onBack }: { c: Career; onBack: () => void }) {
  const { w } = useWords();
  const me = findWrestler(c.player)!;
  const mine = dealsOf(person(c, c.player)).map((k) => k.promo);
  const majors = PROMOTIONS.filter((p) => !p.indie && !mine.includes(p.initials));
  const grades = majors.map((p) => gradeOf(c, me, p.initials));
  const [open, setOpen] = useState<string | null>(null);
  const g = grades.find((x) => x.promo === open);

  if (g) return <Report c={c} g={g} onBack={() => setOpen(null)} />;
  return (
    <Screen>
      <Head title={w('Scouting Reports', 'SCOUTING')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <span className="c-note">Each major grades you on twelve things against its own roster, weighted to its taste and its booker’s. Above their bottom quarter you’re worth a tryout; above their median, an offer. A standout (their top 10% at something) lifts you a step. They only look at you if they know who you are.</span>
        {grades.map((x) => {
          const f = c.scout?.[x.promo];
          const known = knows(c, x.promo);
          return (
            <button key={x.promo} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => setOpen(x.promo)}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{promoName(x.promo)}</b><span className={STEP[x.step]![1]}>{w(STEP[x.step]![0])}</span></span>
              <Bar g={x} />
              <span className="c-ad">{known ? (f?.stage ? `${STAGE[f.stage]}${f.how ? ` · they know you from ${f.how}` : ''}` : 'They know who you are') : 'They haven’t heard of you yet'}</span>
            </button>
          );
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}

/** Your grade on a 0–100 line, with their two bars marked. */
function Bar({ g }: { g: Grade }) {
  return (
    <span className="c-rowsb" style={{ gap: 8 }}>
      <span style={{ position: 'relative', flex: 1, height: 10, background: 'var(--c-line, rgba(127,127,127,.25))', display: 'block' }}>
        <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${g.grade}%`, background: g.step === 'offer' ? '#3fb37f' : g.step === 'tryout' ? '#ebb640' : '#6b7080', display: 'block' }} />
        <i title="Tryout bar" style={{ position: 'absolute', left: `${g.q1}%`, top: -3, bottom: -3, width: 2, background: '#ebb640', display: 'block' }} />
        <i title="Offer bar" style={{ position: 'absolute', left: `${g.median}%`, top: -3, bottom: -3, width: 2, background: '#3fb37f', display: 'block' }} />
      </span>
      <b style={{ minWidth: 28, textAlign: 'right' }}>{Math.round(g.grade)}</b>
    </span>
  );
}

function Report({ c, g, onBack }: { c: Career; g: Grade; onBack: () => void }) {
  const { w } = useWords();
  const f = c.scout?.[g.promo];
  const ch = CHARACTER[g.promo];
  const order = [...FACTORS].sort((a, b) => g.weights[b] - g.weights[a]);
  const top = Math.max(...FACTORS.map((x) => g.weights[x]));
  return (
    <Screen>
      <Head title={w(`Scouting: ${g.promo}`, `SCOUTING · ${g.promo}`)} meta={promoName(g.promo)} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w('Their grade of you')}</span>
          <b className="c-sbig" style={{ fontSize: 34 }}>{Math.round(g.grade)}</b>
          <Bar g={g} />
          <span className="c-val">Tryout bar {Math.round(g.q1)} · offer bar {Math.round(g.median)} · {STEP[g.step]![0].toLowerCase()}</span>
        </div>
        {ch && <span className="c-note"><b>{ch.style}.</b> {ch.blurb}</span>}
        {g.standouts.length > 0 && <span className="c-note"><b>Standout:</b> {g.standouts.map((x) => FACTOR_NAME[x]).join(', ')}. That lifts you a step with them.</span>}
        <span className="c-note"><b>Holding you back:</b> {g.weakest.map((x) => FACTOR_NAME[x]).join(', ')}.</span>
        <span className="c-sec">{w('What they look at', 'Factors')}</span>
        <span className="c-hint">Where you’d rank on their roster at each, most valued first.</span>
        <div className="c-kv">
          {order.map((x) => (
            <span key={x} style={{ display: 'contents' }}>
              <span className="c-lab">{FACTOR_NAME[x]}{g.weights[x] >= top * 0.75 ? ' ★' : ''}</span>
              <span className="c-val">
                <span style={{ display: 'inline-block', width: 90, height: 8, background: 'rgba(127,127,127,.25)', marginRight: 8, verticalAlign: 'middle', position: 'relative' }}>
                  <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${g.scores[x]}%`, background: g.scores[x] >= 90 ? '#3fb37f' : g.scores[x] >= 50 ? '#ebb640' : '#d8323f', display: 'block' }} />
                </span>
                {g.scores[x]}
              </span>
            </span>
          ))}
        </div>
        <span className="c-sec">{w('With them', 'Status')}</span>
        <span className="c-note">{!knows(c, g.promo) ? 'They haven’t heard of you yet. Scouts at indie shows (especially in their region and on big nights), news of your titles and great matches, word from friends on their roster, or getting in touch yourself will change that.'
          : f ? `${STAGE[f.stage]}.${f.how ? ` They know you from ${f.how}.` : ''}${f.watch ? ` Watched ${f.watch.stars.length} of your matches so far.` : ''}${f.intro ? ` ${findWrestler(f.intro.who)?.name ?? 'A friend'} introduced you.` : ''}` : 'They know who you are.'}</span>
        {f?.report && <span className="c-note"><b>Tryout report ({fmtDay(f.report.day, 'dm')}):</b> {f.report.score}/100, {f.report.stars}★. It stays on file and moves your grade with them.</span>}
        {f?.last !== undefined && f.stage === 'pass' && <span className="c-note">They passed at {Math.round(f.last)}. They’ll look again once you’re up to about {Math.round(f.last + 5)}.</span>}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('All reports')}</button></div>
    </Screen>
  );
}
