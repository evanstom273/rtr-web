import { useEffect, useRef, useState } from 'react';
import { SEG_LABEL } from '../../career/card';
import {
  ANGLE_LABEL, BEAT_LABEL, BRAWL_HINT, BRAWL_LABEL, deliver, exchange, finishSegment, hitOf, newBrawl, newPromo, planFor, promoOptions, promoScore,
  SIGNING_LABEL, simSegment, sweetSpot, type Beat, type Brawl, type BrawlMove, type Line, type Promo, type SigningChoice,
} from '../../career/segments';
import type { Career } from '../../career/types';
import { findWrestler } from '../../data/rtr';
import { commit, Head, Screen, useWords } from './parts';

/** The timing bar: a marker sweeps across; stop it in the gold (charisma widened it, risky lines narrowed it). */
function TimingBar({ zone, onStop }: { zone: { from: number; width: number }; onStop: (at: number) => void }) {
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState<number | null>(null);
  const pos = useRef(0), dir = useRef(1), raf = useRef(0), last = useRef(0);
  useEffect(() => {
    const frame = (now: number) => {
      const dt = last.current ? (now - last.current) / 1000 : 0;
      last.current = now;
      pos.current += dir.current * dt * 0.9;
      if (pos.current >= 1) { pos.current = 1; dir.current = -1; } else if (pos.current <= 0) { pos.current = 0; dir.current = 1; }
      setAt(pos.current);
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const stop = () => {
    if (stopped !== null) return;
    cancelAnimationFrame(raf.current);
    setStopped(pos.current);
    window.setTimeout(() => onStop(pos.current), 450);
  };
  const shown = stopped ?? at;
  const hit = stopped === null ? null : hitOf(stopped, zone);
  return (
    <div className="c-timing">
      <div className="c-tbar" role="presentation">
        <span className="c-tzone" style={{ left: `${zone.from * 100}%`, width: `${zone.width * 100}%` }} />
        <span className={`c-tmark${hit === 1 ? ' hit' : hit === 0 ? ' miss' : ''}`} style={{ left: `${shown * 100}%` }} />
      </div>
      <button className="c-b1" style={{ marginTop: 8, width: '100%' }} onClick={stop} disabled={stopped !== null} aria-label="Deliver the line">
        {stopped === null ? 'Deliver it' : hit === 1 ? 'Nailed it' : hit === 0.5 ? 'Close enough' : 'Fluffed it'}
      </button>
    </div>
  );
}

/** A meter (the crowd during a promo; the upper hand in a brawl). */
function Meter({ label, v, hint }: { label: string; v: number; hint?: string }) {
  return (
    <div className="c-meter" style={{ display: 'block', width: '100%', margin: '6px 0' }}>
      <span className="c-lab" style={{ display: 'block' }}>{label}{hint ? ` · ${hint}` : ''}</span>
      <div className="c-mbar" style={{ display: 'block', width: '100%', height: 8, marginTop: 3 }}><span style={{ display: 'block', height: '100%', width: `${Math.max(2, Math.min(100, v))}%` }} /></div>
    </div>
  );
}

type Step = { k: 'beat'; beat: Beat } | { k: 'deliver'; beat: Beat; line: Line } | { k: 'choice' } | { k: 'signing' } | { k: 'brawl' } | { k: 'done'; lines: string[]; score: number };

/** Play one of your segments: the promo beat by beat, then (maybe) a brawl or the signing. */
export function SegmentPlay({ c, showId, index, onBack }: { c: Career; showId: string; index: number; onBack: () => void }) {
  const { skin, w } = useWords();
  const show = c.shows[showId];
  const g = show?.segments?.[index];
  const plan = g ? planFor(c, g) : undefined;
  const [promo] = useState<Promo>(newPromo);
  const [brawl, setBrawl] = useState<Brawl | null>(() => (plan && !plan.beats.length && !plan.signing && plan.brawl === 'always' ? newBrawl(plan.start) : null));
  const [signing, setSigning] = useState<SigningChoice | undefined>();
  const [, bump] = useState(0);
  const firstStep = (): Step => (!plan ? { k: 'done', lines: [], score: 0 } : plan.beats.length ? { k: 'beat', beat: plan.beats[0]! } : plan.signing ? { k: 'signing' } : { k: 'brawl' });
  const [step, setStep] = useState<Step>(firstStep);
  const [lastBeat, setLastBeat] = useState<string | null>(null);
  if (!show || !g || !plan) return null;
  if (g.score !== undefined && step.k !== 'done') {
    return (
      <Screen>
        <Head title={w('The segment', 'SEGMENT')} meta={show.name} onBack={onBack} />
        <div className="c-body"><span className="c-note">That’s done: {g.score}★ · {g.note}</span></div>
        <div className="c-nav"><button className="c-b1" onClick={onBack}>{w('Back')}</button></div>
      </Screen>
    );
  }
  const rival = g.who.find((x) => x !== c.player);
  const rivalName = rival ? findWrestler(rival)?.name ?? rival : '';
  const finish = (o: { brawl?: Brawl | null; signing?: SigningChoice }) => {
    const r = finishSegment(c, show, index, { ...(plan.beats.length ? { promo } : {}), ...(o.brawl ? { brawl: o.brawl } : {}), ...(o.signing ? { signing: o.signing } : {}) });
    commit();
    setStep({ k: 'done', lines: r.lines, score: r.score });
  };
  const nextAfterBeats = () => {
    if (plan.signing) return setStep({ k: 'signing' });
    if (plan.brawl === 'choice') return setStep({ k: 'choice' });
    if (plan.brawl === 'always') return startBrawl();
    finish({});
  };
  function startBrawl(start?: number) { const b = newBrawl(start ?? plan!.start); setBrawl(b); setStep({ k: 'brawl' }); }

  return (
    <Screen>
      <Head title={skin === 'paper' ? SEG_LABEL[g.kind] : SEG_LABEL[g.kind].toUpperCase()} meta={`${show.name}${rival ? ` · with ${rivalName}` : ''}`} onBack={onBack} />
      <div className="c-body">
        {plan.beats.length > 0 && <Meter label={w('The crowd')} v={promo.meter} hint={`${promoScore(promo).toFixed(1)}★ so far`} />}
        {brawl && <Meter label={w('The upper hand')} v={brawl.meter} hint={brawl.meter >= 50 ? 'yours' : rivalName} />}
        {lastBeat && step.k !== 'done' && <span className="c-ad">{lastBeat}</span>}

        {step.k === 'beat' && (() => {
          const used = promo.beats.map((b) => b.line.angle);
          const opts = promoOptions(c, show, g, step.beat, used);
          return (
            <>
              <span className="c-sec">{w(BEAT_LABEL[step.beat])} · {plan.beats.indexOf(step.beat) + 1} of {plan.beats.length}</span>
              {opts.map((l) => (
                <button key={l.angle} className="c-ans" style={{ padding: '8px 10px', textAlign: 'left' }} onClick={() => setStep({ k: 'deliver', beat: step.beat, line: l })}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 14 }}>{w(ANGLE_LABEL[l.angle])}</b><span className="c-eff">{l.risk >= 0.4 ? 'risky' : l.risk >= 0.25 ? 'bold' : 'safe'}</span></span>
                  <span className="c-ad">“{l.text}”</span>
                </button>
              ))}
            </>
          );
        })()}

        {step.k === 'deliver' && (
          <>
            <span className="c-sec">{w(BEAT_LABEL[step.beat])}</span>
            <span className="c-val">“{step.line.text}”</span>
            <span className="c-note">Stop the marker in the gold to land it.</span>
            <TimingBar key={`${step.beat}-${step.line.angle}`} zone={sweetSpot(c, show, g, step.beat, step.line)} onStop={(at) => {
              const pb = deliver(c, show, g, promo, step.beat, step.line, hitOf(at, sweetSpot(c, show, g, step.beat, step.line)));
              setLastBeat(`${pb.hit === 1 ? 'Nailed it' : pb.hit === 0.5 ? 'It landed, just' : 'Fluffed it'} (${pb.d >= 0 ? '+' : ''}${pb.d}).${pb.rival ? ` ${pb.rival} (${pb.rd})` : ''}`);
              const i = plan.beats.indexOf(step.beat);
              if (i + 1 < plan.beats.length) setStep({ k: 'beat', beat: plan.beats[i + 1]! });
              else nextAfterBeats();
            }} />
          </>
        )}

        {step.k === 'choice' && (
          <>
            <span className="c-sec">{w('What now?')}</span>
            <span className="c-chips">
              <button className="c-chip" onClick={() => startBrawl()}>{w('Go for them')}</button>
              <button className="c-chip" onClick={() => finish({})}>{w('Walk away')}</button>
            </span>
          </>
        )}

        {step.k === 'signing' && (
          <>
            <span className="c-sec">{w('The contract')}</span>
            <span className="c-note">The table, two chairs, the contract. {rivalName} has signed.</span>
            <span className="c-chips">
              {(Object.keys(SIGNING_LABEL) as SigningChoice[]).map((k) => (
                <button key={k} className="c-chip" onClick={() => { setSigning(k); if (k === 'sign') finish({ signing: k }); else startBrawl(k === 'flip' ? 55 : 62); }}>{w(SIGNING_LABEL[k])}</button>
              ))}
            </span>
          </>
        )}

        {step.k === 'brawl' && brawl && (() => {
          const b = brawl;
          return (
            <>
              <span className="c-sec">{w('The brawl')} · {b.rounds.length + 1}</span>
              {b.rounds.map((x, i) => <span key={i} className="c-ad">{x.text}{x.rolls[0] ? ` (${x.rolls[0]} v ${x.rolls[1]})` : ''}</span>)}
              {!b.over ? (
                <span className="c-chips">
                  {(Object.keys(BRAWL_LABEL) as BrawlMove[]).map((m) => (
                    <button key={m} className="c-chip" title={BRAWL_HINT[m]} onClick={() => { exchange(c, show, g, b, m); bump((n) => n + 1); if (b.over) finish({ brawl: b, ...(signing ? { signing } : {}) }); }}>{w(BRAWL_LABEL[m])}</button>
                  ))}
                </span>
              ) : null}
              <span className="c-note">Strike beats a grapple, a grapple beats a weapon, a weapon beats a strike.</span>
            </>
          );
        })()}

        {step.k === 'done' && (
          <div className="c-start">
            <span className="c-lab">{w('How it went')}</span>
            <b className="c-sbig">{step.score}★</b>
            {step.lines.map((l, i) => <span key={i} className="c-val">{l}</span>)}
          </div>
        )}
      </div>
      <div className="c-nav">
        {step.k !== 'done' && <button className="c-b2" onClick={() => { const r = simSegment(c, show, index); commit(); setStep({ k: 'done', lines: r.lines, score: r.score }); }}>{w('Sim it instead', 'Sim')}</button>}
        <button className="c-b1" onClick={onBack} disabled={step.k !== 'done'}>{w('Done')}</button>
      </div>
    </Screen>
  );
}
