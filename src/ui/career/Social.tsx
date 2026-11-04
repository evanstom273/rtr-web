import { useState } from 'react';
import { fansTotal, findWrestler, fmtFans, TITLES, WRESTLERS } from '../../data/rtr';
import { nextMatch, socialAct, socialPreview, socialWeekCap, type Career, type SocialKind } from '../../career';
import { fmtDay } from '../../career/dates';
import { SOCIAL_BACKLASH } from '../../career/tuning';
import { commit, Head, Nm, Screen, useToast, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

const KINDS: { k: SocialKind; t: string; d: string; target?: boolean }[] = [
  { k: 'post', t: 'Post', d: 'Training, travel, thank-yous. Keeps you in people’s feeds.' },
  { k: 'promote', t: 'Promote your next match', d: 'More fans from that show if you deliver.' },
  { k: 'reply', t: 'Reply to someone', d: 'Warms things up between you.', target: true },
  { k: 'callout', t: 'Call someone out', d: 'Easier to ask for a match with them. Can backfire.', target: true },
  { k: 'beef', t: 'Start a beef', d: 'Makes a rival. Gets attention. Can backfire badly.', target: true },
];

/** Social media (Lyra's brief): one post a day, a few fans, and what it does to the people around you. */
export function Social({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const [kind, setKind] = useState<SocialKind>('post');
  const me = findWrestler(c.player)!;
  const promo = c.people[c.player]?.contract?.promo ?? me.promotion;
  // Who you can talk about: your own roster (or the indie scene), champions, sorted by fans.
  const people = WRESTLERS.filter((x) => x.id !== c.player && !c.people[x.id]?.retired && (x.promotion === promo || TITLES.some((t) => t.holder === x.id)))
    .sort((a, b) => fansTotal(b) - fansTotal(a)).slice(0, 60);
  const [target, setTarget] = useState(people[0]?.id ?? '');
  const def = KINDS.find((x) => x.k === kind)!;
  const pv = socialPreview(c, kind, def.target ? target : undefined);
  const s = c.social;
  const capLeft = Math.max(0, Math.round(socialWeekCap(me) - (s?.weekFans ?? 0)));
  const posted = s?.last === c.today;
  const show = nextMatch(c);
  const post = () => {
    const r = socialAct(c, kind, def.target ? target : undefined);
    commit();
    say(r.backfired ? `It backfired: ${r.fans} fans.` : `+${r.fans} fans.`);
  };

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Online' : 'SOCIAL'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('Fans')}</span><b>{fmtFans(fansTotal(me))}</b></span>
            <span className="c-fact"><span className="c-lab">{w('This week')}</span><b>+{fmtFans(Math.round(s?.weekFans ?? 0))} <span className="c-hint">of {fmtFans(Math.round(socialWeekCap(me)))}</span></b></span>
            <span className="c-fact"><span className="c-lab">{w('Today')}</span><b>{posted ? w('Posted') : w('One post')}</b></span>
          </div>
          <span className="c-val">{posted ? 'You’ve posted today. Back tomorrow.' : show ? `Next match: ${show.name}, ${fmtDay(show.date, 'dm')}.` : 'No match booked to promote.'} Wrestling wins far more fans than posting ever will.</span>
        </div>
        <span className="c-sec">{w('Today’s post', 'Post')}</span>
        {KINDS.map((x) => {
          const p = socialPreview(c, x.k, x.target ? target : undefined);
          const off = !!p.blocked && p.blocked !== 'Pick someone.' && p.blocked !== 'You’ve already posted today.';
          return (
            <button key={x.k} className={`c-ans${kind === x.k ? ' on' : ''}${off ? ' dis' : ''}`} disabled={off} onClick={() => setKind(x.k)} style={{ padding: '7px 10px' }}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{x.t}</b><span className={SOCIAL_BACKLASH[x.k] > 0 ? 'c-eff bad' : 'c-eff up'}>{p.fans ? `+${p.fans.toLocaleString('en-GB')} fans` : capLeft ? '—' : 'Cap reached'}</span></span>
              <span className="c-ad">{x.d}</span>
            </button>
          );
        })}
        {def.target && (
          <div className="c-start">
            <span className="c-lab">{w('About')}</span>
            <select className="c-fld" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Who">
              {people.map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtFans(fansTotal(x))} fans</option>)}
            </select>
          </div>
        )}
        <span className="c-sec">{w('The feed', 'Feed')}</span>
        {!s?.feed.length && <span className="c-note">Quiet. The roster posts a few times a week.</span>}
        {s?.feed.slice(0, 8).map((f) => (
          <div key={f.id} className="c-led" style={{ gridTemplateColumns: '46px minmax(0, 1fr)' }}>
            <span className="c-hint">{fmtDay(f.day, 'dm')}</span>
            <span className="c-val"><b><Nm id={f.who} /></b>{f.target ? <> → <Nm id={f.target} /></> : null}: {f.text}</span>
          </div>
        ))}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onBack}>{w('‹ Back')}</button>
        <button className="c-b1" onClick={post} disabled={!!pv.blocked}>{pv.blocked ? w(posted ? 'Posted today' : pv.blocked.replace(/\.$/, '')) : w(`Post · +${pv.fans.toLocaleString('en-GB')} fans`)}</button>
      </div>
      {toast}
    </Screen>
  );
}
