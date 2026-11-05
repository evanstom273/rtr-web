import { useState } from 'react';
import { findWrestler, TITLES } from '../../data/rtr';
import { C, dealWith, matchPay, noShow, refuseStip, skipTour, tierOf, myBoutToday, person, roundName, runToday, showsOn, type Career } from '../../career';
import { fmtDay } from '../../career/dates';
import { runJobs } from '../../career/runner';
import { FATIGUE_PER_MATCH, OFF_SCRIPT_TITLE_BAN_DAYS, REP_OFF_SCRIPT } from '../../career/tuning';
import { stipulation } from '../../engine';
import { simMyMatch } from './simMine';
import { boutKind, boutLabel, boutPeople, boutWinners } from '../../career/bouts';
import { STAKE_LABEL } from '../../career/stakes';
import { Fragment } from 'react';
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
  const [noShowAsk, setNoShowAsk] = useState(false);
  const [, bump] = useState(0);
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
  const nameOf = (id: string) => findWrestler(id)?.name ?? id;
  const vsx = skin === 'paper' ? 'v.' : 'VS';
  const yourMatch = bout?.sides ? ` · ${boutKind(bout) ?? ''}: ${boutLabel(bout, nameOf)}` : opp ? ` · vs ${opp.name}` : '';

  const sim = async () => {
    if (!mine || working) return;
    setWorking(true);
    // A simmed match leans towards the booker's plan, as AI matches do; going the other way is an upset, not off-script.
    simMyMatch(c);
    await runToday(c, runJobs);
    commit();
    setWorking(false);
  };

  // The booker's plan, and what your Creative Control lets you do about it.
  const k = dealWith(me, show.promo) ?? me.contract;
  const creative = k?.clauses[C.creative] ?? 0;
  const planned = bout?.planned ? findWrestler(bout.planned) : undefined;
  const plannedMe = bout?.planned === c.player;
  const titleName = bout?.title ? TITLES.find((t) => t.id === bout.title)?.name : undefined;
  const planText = !bout?.planned ? null
    : `${planned?.name} ${plannedMe || !bout.title ? 'wins' : bout.a === bout.planned ? 'retains' : 'wins the title'}. `
      + (plannedMe ? 'That’s you: go and win it.' : creative >= 3 ? 'Your Full Creative Control lets you change it: Requests › Creative Control.'
        : creative === 2 ? 'Protected Booking lets you veto a finish like this about once a month: Requests › Creative Control.'
          : creative === 1 ? 'Consultation: you can ask for the other finish in Requests › Creative Control; they may listen.'
            : `Your contract has no Creative Control, so winning anyway is going off-script: reputation ${REP_OFF_SCRIPT}, no fee, and no title matches for ${OFF_SCRIPT_TITLE_BAN_DAYS} days.`);

  const indie = show.promo === 'TIS';
  const deal = c.indie[show.id];
  const pay = !bout ? null : indie ? { win: deal?.fee ?? 0, lose: Math.round(((deal?.fee ?? 0) * 0.75) / 5) * 5 } : k ? { win: matchPay(k, show.kind, false).pay, lose: matchPay(k, show.kind, true).pay } : null;
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
            boutKind(b) ? { t: boutKind(b)!, c: 'c-eff' } : null,
            b.stip ? { t: stipulation(b.stip).name, c: 'c-eff' } : null,
            b.stakes ? { t: STAKE_LABEL[b.stakes.kind], c: 'c-eff gold' } : null,
            b.cashIn ? { t: 'Cash-in', c: 'c-eff gold' } : null,
            b.feud ? { t: 'Feud', c: 'c-eff' } : null,
            b.tryout ? { t: 'Tryout', c: 'c-eff gold' } : null,
            b.tourney ? { t: `Cup ${roundName(b.tourney.round).toLowerCase()}`, c: 'c-eff gold' } : null,
            b.farewell ? { t: 'Farewell match', c: 'c-eff gold' } : null,
            minehere ? { t: 'You', c: 'c-eff up' } : null,
          ].filter((x): x is { t: string; c: string } => !!x);
          const won = boutWinners(b, nameOf);
          const res = b.result ? `${won ? `${won} ${b.result.winners && b.result.winners.length > 1 ? 'win' : 'wins'}` : 'Draw'} · ${b.result.finish.toLowerCase().replace(/_/g, ' ')} · ${Math.floor(b.result.t / 60)}:${String(b.result.t % 60).padStart(2, '0')} · ${stars(b.result.stars)}` : null;
          return (
            <div key={i} className={minehere ? 'c-ans on' : 'c-ans'}>
              <div className="c-rowsb"><span className="c-lab">{w(i === card.length - 1 ? 'Main event' : i === 0 ? 'Opener' : `Match ${i + 1}`)}</span><span className="c-effs">{tags.map((t, k) => <span key={k} className={t.c}>{w(t.t)}</span>)}</span></div>
              {!b.sides ? <span className="c-vs"><Nm id={b.a} /><span className="c-vsx">{vsx}</span><Nm id={b.b} /></span>
                : boutPeople(b).length > 8 ? <span className="c-vs">{boutLabel(b, nameOf)}</span>
                  : <span className="c-vs">{b.sides.map((side, j) => (
                    <Fragment key={j}>{j > 0 && <span className="c-vsx">{vsx}</span>}{side.map((id, n) => <Fragment key={id}>{n > 0 && ' & '}<Nm id={id} /></Fragment>)}</Fragment>
                  ))}</span>}
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
            </div>
          )}
          <div className="c-live">
            <span className="c-lab">{w('Your match')}{yourMatch}</span>
            <div className="c-facts">{facts.map((f) => <span key={f.l} className="c-fact"><span className="c-lab">{f.l}</span><b>{f.v}</b></span>)}</div>
          </div>
          <div className="c-effs" style={{ marginTop: 6 }}>
            {bout.stip && tierOf(k, 'conditions') >= 2 && !indie && <button className="c-eff gold" onClick={() => { say(refuseStip(c, show.id)); commit(); bump((n) => n + 1); }}>{w('Turn down the stipulation')}</button>}
            {show.kind === 'tour' && tierOf(k, 'touring') >= 1 && <button className="c-eff" onClick={() => { say(skipTour(c, show.id)); commit(); onBack(); }}>{w('Skip this tour date')}</button>}
            <button className="c-eff dn" onClick={() => setNoShowAsk(true)}>{w('Don’t turn up')}</button>
          </div>
          {noShowAsk && (
            <div className="c-warn" style={{ marginTop: 6 }}>
              <b>{w('Not turning up?')}</b> Reputation and the booker’s patience take a hit{!indie && k ? `, and ${show.promo} fine you by your Conduct & Discipline` : ''}. Three in 90 days is a suspension.
              <span className="c-effs" style={{ marginTop: 6 }}><button className="c-eff dn" onClick={() => { say(noShow(c, show.id)); commit(); setNoShowAsk(false); onBack(); }}>{w('Stay home')}</button><button className="c-eff" onClick={() => setNoShowAsk(false)}>{w('I’ll be there')}</button></span>
            </div>
          )}
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
              {result.planned === 'off-script' ? ' · you went off-script' : result.planned === 'kept' ? ' · you kept to the plan' : result.planned === 'botched' ? ' · you didn’t deliver the planned finish' : result.planned === 'upset' ? ' · an upset: not the planned finish' : ''}
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
