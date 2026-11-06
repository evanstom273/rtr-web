import { useState } from 'react';
import { SEG_LABEL } from '../../career/card';
import { fmtDay } from '../../career/dates';
import {
  callBlowoff, CALL_STAKES, CALL_STIPS, feudHeat, feudWord, liveFeuds, myFeud, mySegments, nameOf, nextFeudShow, oldFeud, record, rivalOf, rivalsFor, runIn, STAGE_HINT, STAGE_LABEL,
  STAGES, stageOf, START_HINT, START_LABEL, startFeud, titleAtStake, titleName, type StartHow,
} from '../../career/feuds';
import { STAKE_LABEL, type StakeKind } from '../../career/stakes';
import type { Career, Feud } from '../../career/types';
import { fmtFans, fansTotal, findWrestler, TITLES } from '../../data/rtr';
import { stipulation } from '../../engine';
import type { StipulationId } from '../../engine/types';
import { FeudAsk } from './FeudAsk';
import { commit, Head, Screen, useToast, useWords } from './parts';

const HOW: Record<NonNullable<Feud['how']>, string> = { player: 'You started it', booker: 'The office’s idea', organic: 'It grew out of nothing', rival: 'They came for you', reignited: 'It’s back' };

function HeatBar({ f }: { f: Feud }) {
  const h = feudHeat(f);
  return (
    <div className="c-meter" style={{ display: 'block', width: '100%', margin: '6px 0' }}>
      <span className="c-lab" style={{ display: 'block' }}>Heat · {feudWord(h)} ({h})</span>
      <div className="c-mbar heat" style={{ display: 'block', width: '100%', height: 8, marginTop: 3 }}><span style={{ display: 'block', height: '100%', width: `${Math.max(3, h)}%` }} /></div>
    </div>
  );
}

/** Career → Feuds: yours (where it's at, the story so far, everything you can do), starting one, and everyone else's. */
export function Feuds({ c, onBack, onPlay }: { c: Career; onBack: () => void; onPlay: (showId: string, i: number) => void }) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const [, bump] = useState(0);
  const done = (s: string) => { say(s); commit(); bump((n) => n + 1); };
  const f = myFeud(c);
  const [pick, setPick] = useState('');
  const [stakes, setStakes] = useState<StakeKind | ''>('');
  const [stip, setStip] = useState<StipulationId | ''>('');
  const others = liveFeuds(c).filter((x) => x !== f && x.promo === (f?.promo ?? c.people[c.player]?.contract?.promo));
  const pool = f ? [] : rivalsFor(c).slice(0, 30);
  const sel = pick || pool[0]?.id || '';
  const myPromo = c.people[c.player]?.contract?.promo ?? '';
  // A feud with a champion is for the title (Lyra's call): which one, for each possible rival.
  const stakeOf = (id: string) => { const t = titleAtStake(c, { id: '', a: c.player, b: id, promo: myPromo }); return t ? TITLES.find((x) => x.id === t)?.name : undefined; };
  const selTitle = sel ? stakeOf(sel) : undefined;

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Feuds' : 'FEUDS'} meta={f ? STAGE_LABEL[stageOf(f)] : 'No feud'} onBack={onBack} />
      <div className="c-body">
        {f ? (() => {
          const rival = rivalOf(c, f), st = stageOf(f);
          const pay = f.payoff ? c.shows[f.payoff] : undefined;
          const next = nextFeudShow(c, f);
          const segs = next ? mySegments(c, next) : [];
          return (
            <>
              <div className="c-start">
                <span className="c-lab">{w('You and')} · {HOW[f.how ?? 'booker']}</span>
                <b className="c-sbig" style={{ fontSize: 26 }}>{nameOf(rival)}</b>
                <span className="c-val">{record(f)}{f.stips?.length ? ` · so far: ${f.stips.map((s) => stipulation(s as StipulationId).name).join(', ')}` : ''}</span>
                {f.title && <span className="c-val"><b>For the {titleName(f)}</b> · on the line at the blow-off</span>}
                <HeatBar f={f} />
              </div>
              <div className="c-steps cols4" style={{ marginTop: 8 }}>
                {STAGES.map((s) => <span key={s} className={s === st ? 'c-st on' : 'c-st'} style={{ textAlign: 'center' }}>{w(STAGE_LABEL[s])}</span>)}
              </div>
              <span className="c-note">{STAGE_HINT[st]}</span>
              <div className="c-kv">
                <span className="c-lab">{w('The blow-off')}</span>
                <span className="c-val">{pay ? `${pay.name}, ${fmtDay(pay.date, 'dm')}${f.title ? ` · for the ${titleName(f)}` : ''}${f.called?.stip ? ` · ${stipulation(f.called.stip).name}` : ''}${f.called?.stakes ? ` · ${STAKE_LABEL[f.called.stakes]}` : ''}` : st === 'spark' || st === 'building' ? 'Not set yet: it gets a date when it turns personal (or call it)' : 'As soon as there’s a big show far enough off'}</span>
                {f.edge && <><span className="c-lab">{w('The crowd')}</span><span className="c-val">{f.edge === c.player ? 'With you, going into your next match with them' : `With ${nameOf(f.edge)}, going into your next match`}</span></>}
                {next && <><span className="c-lab">{w('Next')}</span><span className="c-val">{next.name}, {fmtDay(next.date, 'dm')}{segs.length ? ` · your ${segs.map(([, g]) => SEG_LABEL[g.kind].toLowerCase()).join(', ')}` : ''}</span></>}
              </div>
              {next && segs.filter(([, g]) => g.score === undefined && next.date === c.today).map(([i, g]) => (
                <button key={i} className="c-b1" style={{ marginTop: 6, width: '100%' }} onClick={() => onPlay(next.id, i)}>{w(`Play your ${SEG_LABEL[g.kind].toLowerCase()}`)}</button>
              ))}
              {next && !segs.length && <FeudAsk c={c} show={next} say={done} title={false} />}

              {st !== 'spark' && !f.called && (
                <>
                  <span className="c-sec">{w('Call the blow-off')}</span>
                  <span className="c-note">Think it’s peaked? Ask for the end: the next big show at least two weeks off, how you want it settled, and what’s riding on it.</span>
                  <span className="c-chips">{CALL_STIPS.map((s) => <button key={s} className={`c-chip${stip === s ? ' on' : ''}`} onClick={() => setStip(stip === s ? '' : s)}>{stipulation(s).name}</button>)}</span>
                  <span className="c-chips" style={{ marginTop: 4 }}>{CALL_STAKES.filter((s) => !(f.title && s === 'contendership')).map((s) => <button key={s} className={`c-chip${stakes === s ? ' on' : ''}`} onClick={() => setStakes(stakes === s ? '' : s)}>{STAKE_LABEL[s]}</button>)}</span>
                  <button className="c-b2" style={{ marginTop: 6, width: '100%' }} onClick={() => done(callBlowoff(c, stakes || undefined, stip || undefined))}>{w('Call it')}</button>
                </>
              )}

              <span className="c-sec">{w('The story so far')}</span>
              {(f.beats ?? []).map((b, i) => <span key={i} className="c-ad">{fmtDay(b.day, 'dm')} · {b.t}{b.d ? ` (${b.d > 0 ? '+' : ''}${b.d})` : ''}</span>)}
            </>
          );
        })() : (
          <>
            <span className="c-note">You’re not in a feud. Start one, or wait: the office hands them out, they grow out of bad losses and beefs, and some people will come looking for you.</span>
            <span className="c-sec">{w('Start one')}</span>
            {pool.length ? (
              <>
                <select className="c-fld" value={sel} onChange={(e) => setPick(e.target.value)} aria-label="Who with">
                  {pool.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.disposition === 'HEEL' ? 'heel' : 'face'} · {fmtFans(fansTotal(x))} fans{oldFeud(c, x.id) ? ' · an old rival' : ''}{stakeOf(x.id) ? ` · for the ${stakeOf(x.id)}` : ''}</option>)}
                </select>
                {selTitle && <span className="c-note">The {selTitle} is on the line at the blow-off. The matches before it aren’t for the title.</span>}
                {(['callout', 'attack', 'promo'] as StartHow[]).map((h) => (
                  <button key={h} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => done(startFeud(c, sel, h))}>
                    <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{w(START_LABEL[h])}</b></span>
                    <span className="c-ad">{START_HINT[h]}</span>
                  </button>
                ))}
              </>
            ) : <span className="c-note">Nobody free to feud with right now (you need a promotion, and everyone’s tied up).</span>}
          </>
        )}

        <span className="c-sec">{w('Everyone else’s')}</span>
        {!others.length && <span className="c-note">No other storylines running.</span>}
        {others.map((x) => {
          const pay = x.payoff ? c.shows[x.payoff] : undefined;
          // Get involved: their match on a show you're on, not played yet.
          const shot = Object.values(c.shows).filter((s) => !s.done && s.date >= c.today && s.card?.some((b) => b.a === c.player || b.b === c.player))
            .map((s) => ({ s, i: s.card!.findIndex((b) => b.feud === x.id && !b.result) })).find((y) => y.i >= 0);
          const b = shot ? shot.s.card![shot.i]! : undefined;
          return (
            <div key={x.id} className="c-ans" style={{ padding: '8px 10px' }}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{nameOf(x.a)} vs {nameOf(x.b)}</b><span className="c-eff">{feudWord(feudHeat(x))} · {STAGE_LABEL[stageOf(x)]}</span></span>
              <span className="c-ad">{record(x)}{pay ? ` · blow-off: ${pay.name}` : ''}{x.title ? ` · for the ${titleName(x)}` : ''}</span>
              {b && !b.runIn && (
                <span className="c-chips" style={{ marginTop: 4 }}>
                  {[x.a, x.b].map((id) => <button key={id} className="c-chip" onClick={() => done(runIn(c, shot!.s.id, shot!.i, id))}>Run in for {nameOf(id).split(' ').slice(-1)[0]} ({shot!.s.name})</button>)}
                </span>
              )}
              {b?.runIn === c.player && <span className="c-ad">You’re running in on it at {shot!.s.name}.</span>}
            </div>
          );
        })}
      </div>
      <div className="c-nav"><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      {toast}
    </Screen>
  );
}
void findWrestler;
