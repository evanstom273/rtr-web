import { useState } from 'react';
import { findWrestler, TITLES } from '../../data/rtr';
import { applyBout, boutRules, C, matchPay, myBoutToday, person, runToday, showsOn, type Career } from '../../career';
import { daysBetween, fmtDay } from '../../career/dates';
import { runJobs } from '../../career/runner';
import { outOf, simOne } from '../../career/sim';
import { CREATIVE_T1_CHANGE, CREATIVE_T2_COOLDOWN_DAYS, FATIGUE_PER_MATCH, OFF_SCRIPT_TITLE_BAN_DAYS, REP_OFF_SCRIPT } from '../../career/tuning';
import { hashSeed } from '../../career/booker';
import { seededRng } from '../../engine/rng';
import { stipulation } from '../../engine';
import { commit, Head, money, Nm, Screen, stars, useToast, useWords } from './parts';

interface Props {
  c: Career;
  onBack: () => void;
  onPlay: (showId: string, index: number) => void;
}

/** Your night: the card, the booker's plan if it's a title match, and Play or Sim. */
export function ShowDay({ c, onBack, onPlay }: Props) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const [working, setWorking] = useState(false);
  const mine = myBoutToday(c);
  // After your match: the show you were on (now with results).
  const done = mine ? null : c.history[0]?.day === c.today ? c.history[0] : null;
  const show = mine?.show ?? (done ? c.shows[done.show] : showsOn(c, c.today)[0]);
  if (!show) return null;
  const card = show.card ?? [];
  const me = person(c, c.player);
  const bout = mine?.bout;
  const opp = bout ? findWrestler(bout.a === c.player ? bout.b : bout.a) : undefined;

  const sim = async () => {
    if (!mine || working) return;
    setWorking(true);
    const aIsYou = mine.bout.a === c.player;
    const you = c.player, them = aIsYou ? mine.bout.b : mine.bout.a;
    const { engine } = simOne({ key: 'mine', seed: hashSeed(c.seed, 'mine', show.id), you, them, rules: boutRules(c, show, mine.bout, you, them, false) });
    applyBout(c, show, mine.index, outOf('mine', engine), aIsYou);
    await runToday(c, runJobs);
    commit();
    setWorking(false);
  };

  // The booker's plan, and what your Creative Control lets you do about it.
  const creative = me.contract?.clauses[C.creative] ?? 0;
  const planned = bout?.planned ? findWrestler(bout.planned) : undefined;
  const plannedMe = bout?.planned === c.player;
  const titleName = bout?.title ? TITLES.find((t) => t.id === bout.title)?.name : undefined;
  const lastUse = me.creativeUsed ? daysBetween(me.creativeUsed, c.today) : 999;
  const canChange = !!bout?.planned && !plannedMe && !me.creativeAsked?.includes(show.id) && (creative >= 3 || (creative === 2 && lastUse >= CREATIVE_T2_COOLDOWN_DAYS) || creative === 1);
  const changeFinish = () => {
    if (!bout || !planned) return;
    (me.creativeAsked ??= []).push(show.id);
    const granted = creative >= 2 || seededRng(hashSeed(c.seed, 'creative', show.id))() < CREATIVE_T1_CHANGE;
    if (granted) {
      bout.planned = c.player;
      if (creative === 2) me.creativeUsed = c.today;
      say(creative >= 3 ? 'Vetoed. You’re booked to win.' : creative === 2 ? 'Refused. They’ve changed it: you win.' : 'They listened. You’re going over.');
    } else say('They heard you out. The finish stands.');
    commit();
  };
  const planText = !bout?.planned ? null
    : `${planned?.name} ${plannedMe ? 'wins' : bout.a === bout.planned ? 'retains' : 'wins the title'}. `
      + (plannedMe ? 'That’s you: go and win it.' : creative >= 3 ? 'Your Full Creative Control lets you veto it.'
        : creative === 2 ? 'Protected Booking lets you refuse a finish like this once every 90 days.'
          : creative === 1 ? 'Consultation: you can ask for the other finish; they may listen.'
            : `Your contract has no Creative Control, so winning anyway is going off-script: reputation ${REP_OFF_SCRIPT}, no fee, and no title matches for ${OFF_SCRIPT_TITLE_BAN_DAYS} days.`);

  const indie = show.promo === 'TIS';
  const deal = c.indie[show.id];
  const pay = !bout ? null : indie ? { win: deal?.fee ?? 0, lose: Math.round(((deal?.fee ?? 0) * 0.75) / 5) * 5 } : me.contract ? { win: matchPay(me.contract, show.kind, false).pay, lose: matchPay(me.contract, show.kind, true).pay } : null;
  const facts = bout ? [
    { l: w('Fee'), v: pay ? money(pay.win) : bout.tryout ? 'Tryout' : '—' },
    { l: w('If you lose'), v: pay ? money(pay.lose) : '—' },
    { l: w('Travel'), v: indie ? (deal?.travel ? money(deal.travel) : w('None')) : w(`${show.promo} pays`) },
    { l: w('Fatigue'), v: `${Math.round(me.fatigue)} → ${Math.min(100, Math.round(me.fatigue + FATIGUE_PER_MATCH))}` },
  ] : [];

  const result = done ?? (c.history[0]?.show === show.id ? c.history[0] : null);
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Tonight’s Bill' : 'SHOW DAY'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w(`${show.promo === 'TIS' ? 'The Indie Scene' : show.promo} · ${show.kind === 'indie' ? 'Indie show' : show.kind === 'weekly' ? 'Weekly TV' : show.kind}`)}</span>
          <b className="c-sbig">{show.name}</b>
          <span className="c-val">{show.city}, {show.country}</span>
        </div>
        <div className="c-rowsb"><span className="c-sec c-grow">{w('The card')}</span><span className="c-hint">{w(`${card.length} matches`)}</span></div>
        {card.map((b, i) => {
          const minehere = b.a === c.player || b.b === c.player;
          const tags = [
            b.title ? { t: TITLES.find((t) => t.id === b.title)?.name ?? '', c: 'c-eff gold' } : null,
            b.stip ? { t: stipulation(b.stip).name, c: 'c-eff' } : null,
            b.feud ? { t: 'Feud', c: 'c-eff' } : null,
            b.tryout ? { t: 'Tryout', c: 'c-eff gold' } : null,
            minehere ? { t: 'You', c: 'c-eff up' } : null,
          ].filter((x): x is { t: string; c: string } => !!x);
          const res = b.result ? `${b.result.winner ? `${findWrestler(b.result.winner)?.name} wins` : 'Draw'} · ${b.result.finish.toLowerCase().replace(/_/g, ' ')} · ${Math.floor(b.result.t / 60)}:${String(b.result.t % 60).padStart(2, '0')} · ${stars(b.result.stars)}` : null;
          return (
            <div key={i} className={minehere ? 'c-ans on' : 'c-ans'}>
              <div className="c-rowsb"><span className="c-lab">{w(i === card.length - 1 ? 'Main event' : i === 0 ? 'Opener' : `Match ${i + 1}`)}</span><span className="c-effs">{tags.map((t, k) => <span key={k} className={t.c}>{w(t.t)}</span>)}</span></div>
              <span className="c-vs"><Nm id={b.a} /><span className="c-vsx">{skin === 'paper' ? 'v.' : 'VS'}</span><Nm id={b.b} /></span>
              {res && <span className="c-ad">{res}</span>}
            </div>
          );
        })}
      </div>
      {bout && (
        <>
          {planText && (
            <div className="c-warn" style={{ marginTop: 8 }}>
              <b>{w('The booker’s plan:', 'Booker’s plan:')}</b> {titleName ? `${titleName}. ` : ''}{planText}
              {canChange && <button className="c-b3" style={{ width: '100%', marginTop: 8 }} onClick={changeFinish}>{w(creative >= 3 ? 'Veto it' : creative === 2 ? 'Refuse this finish' : 'Ask for the other finish')}</button>}
            </div>
          )}
          <div className="c-live">
            <span className="c-lab">{w('Your match')}{opp ? ` · vs ${opp.name}` : ''}</span>
            <div className="c-facts">{facts.map((f) => <span key={f.l} className="c-fact"><span className="c-lab">{f.l}</span><b>{f.v}</b></span>)}</div>
          </div>
          <div className="c-nav">
            <button className="c-b2" onClick={() => void sim()} disabled={working}>{working ? w('Simming…') : w('Sim it', 'Sim')}</button>
            <button className="c-b1" onClick={() => mine && onPlay(show.id, mine.index)} disabled={working}>{w('Play it', 'Play')}</button>
          </div>
        </>
      )}
      {!bout && result && (
        <>
          <div className="c-start" style={{ marginTop: 8 }}>
            <span className="c-lab">{w('Your result')}</span>
            <b className="c-sbig">{result.result === 'win' ? `You beat ${result.oppName}` : result.result === 'loss' ? `${result.oppName} beat you` : `A draw with ${result.oppName}`}</b>
            <span className="c-val">
              {stars(result.stars)}{result.move ? ` · ${result.move}` : ''} · {money(result.fee)}
              {result.planned === 'off-script' ? ' · you went off-script' : result.planned === 'kept' ? ' · you kept to the plan' : ''}
              {result.wonTitle ? ' · NEW CHAMPION' : ''}
            </span>
          </div>
          <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Back to the diary', 'Calendar ›')}</button></div>
        </>
      )}
      {!bout && !result && <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Calendar ›')}</button></div>}
      {toast}
    </Screen>
  );
}
