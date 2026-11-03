import { useMemo, useState } from 'react';
import { WRESTLERS, getMove, type MoveType, type Wrestler, type WrestlerClass } from '../../data/rtr';
import { seededRng } from '../../engine/rng';
import {
  ATTR_KEYS, ATTR_LONG, ATTR_SHORT, BASE, CLASS_MODS, CLASS_NAME, CLASS_ORDER, QUESTIONS, classMods, historyMods, startingAttributes, templateMoveset,
} from '../../career/create';
import { REGION_OF } from '../../career/places';
import { MovesetEditor, type Kit } from './MovesetEditor';
import { Screen, useWords } from './parts';
import { needsWorldChoice, WorldChoice } from './WorldChoice';

interface Props {
  hasCareer: boolean;
  onBack: () => void;
  onDone: (w: Wrestler, fresh: boolean) => void;
}

const COUNTRIES = [...new Set(WRESTLERS.map((w) => w.country))].filter((c) => c && c !== 'Other').sort();
const REGION_NAME: Record<string, [string, string]> = {
  northAmerica: ['NORTH_AMERICA', 'North America'], southAmerica: ['SOUTH_AMERICA', 'South America'], europe: ['EUROPE', 'Europe'],
  asia: ['ASIA', 'Asia'], africa: ['AFRICA', 'Africa'], oceania: ['OCEANIA', 'Oceania'],
};
const TYPE_LABEL: [MoveType, string][] = [['GRAPPLE', 'Grapples'], ['STRIKE', 'Strikes'], ['SUBMISSION', 'Submissions'], ['RUNNING', 'Running'], ['PINNING_MOVE', 'Pins'], ['AERIAL', 'Aerial'], ['SPRINGBOARD', 'Springboard']];
const sgn = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
const effs = (mods: number[]) => mods.map((v, i) => (v ? { t: `${sgn(v)} ${ATTR_SHORT[i]}`, c: v > 0 ? 'c-eff up' : 'c-eff dn' } : null)).filter((x): x is { t: string; c: string } => !!x);
const EMPTY: Kit = { moves: Array(40).fill(null), signatures: [null, null], finishers: [null, null, null] };

/** Create a wrestler: identity, classes, a life story that shapes the attributes, a moveset, review. */
export function Create({ hasCareer, onBack, onDone }: Props) {
  const { skin, w } = useWords();
  const [step, setStep] = useState(0);
  const [q, setQ] = useState(0);
  const [name, setName] = useState('');
  const [gimmick, setGimmick] = useState('');
  const [desc, setDesc] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [align, setAlign] = useState<'FACE' | 'HEEL'>('FACE');
  const [ci, setCi] = useState(Math.max(0, COUNTRIES.indexOf('UK')));
  const [age, setAge] = useState(24);
  const [h, setH] = useState(71);
  const [wt, setWt] = useState(210);
  const [cls, setCls] = useState<WrestlerClass[]>(['TECHNICIAN']);
  const [ans, setAns] = useState<(number | null)[]>([null, null, null, null, null]);
  const [mode, setMode] = useState(0);
  const [copyQ, setCopyQ] = useState('');
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [custom, setCustom] = useState<Kit | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const country = COUNTRIES[ci]!;
  const region = REGION_OF[country] ?? 'europe';
  const stats = startingAttributes(cls, ans);
  const vals = ATTR_KEYS.map((k) => stats[k]);
  const best = Math.max(...vals);
  const cm = classMods(cls), hm = historyMods(ans);
  const ft = `${Math.floor(h / 12)}′ ${h % 12}″`;
  const template = useMemo(() => templateMoveset(cls, stats, seededRng(cls.join('').length * 977 + vals.reduce((a, b) => a + b, 0))), [cls.join(','), vals.join(',')]);
  const copied = copyFrom ? WRESTLERS.find((x) => x.id === copyFrom) : undefined;
  const base: Kit = mode === 0 ? template : mode === 2 && copied ? { moves: copied.moves, signatures: copied.signatures, finishers: copied.finishers } : EMPTY;
  const kit = custom ?? base;
  const filled = [...kit.moves, ...kit.signatures, ...kit.finishers].filter(Boolean).length;
  const ready = name.trim().length > 1 && filled === 45 && cls.length > 0 && ans.every((a) => a !== null);
  const steps = skin === 'paper' ? ['Profile', 'Style', 'Life story', 'Arsenal', 'Proof'] : ['IDENTITY', 'CLASS', 'HISTORY', 'MOVESET', 'REVIEW'];
  const display = name.trim() || 'Your Name';
  const ini = display.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  if (editing) {
    return <MovesetEditor who={display} classes={cls} kit={kit} onCancel={() => setEditing(false)} onSave={(k) => { setCustom(k); setEditing(false); }} />;
  }

  const build = (): Wrestler => {
    const [regionKey, regionLabel] = REGION_NAME[region] ?? ['EUROPE', 'Europe'];
    const pop = { global: 10, northAmerica: 5, southAmerica: 5, europe: 5, asia: 5, africa: 5, oceania: 5, [region]: 20 };
    return {
      id: `custom_${Date.now().toString(36)}`, wrestlerId: 0, name: name.trim(), gimmick: gimmick.trim() || 'The Newcomer', gimmickDescription: desc.trim(),
      classes: cls, gender, disposition: align, age, height: `${Math.floor(h / 12)}'${h % 12}`, weight: wt, region: regionKey, regionLabel, country,
      promotion: 'TIS', division: gender === 'MALE' ? 'MENS' : 'WOMENS', stats, popularity: pop as Wrestler['popularity'],
      moves: kit.moves as string[], signatures: kit.signatures as string[], finishers: kit.finishers as string[],
    };
  };
  const next = () => {
    if (step === 2 && q < 4) return setQ(q + 1);
    if (step === 4) return needsWorldChoice(hasCareer) ? setConfirm(true) : onDone(build(), false);
    setStep(step + 1);
  };
  const back = () => {
    if (step === 2 && q > 0) return setQ(q - 1);
    if (step === 0) return onBack();
    setStep(step - 1);
  };

  return (
    <Screen>
      <div className="c-top">
        <button className="c-back" onClick={back} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button>
        <div className="c-ttl">{skin === 'paper' ? 'Write Your Own' : 'CREATE A WRESTLER'}</div>
        <span className="c-meta">{skin === 'paper' ? 'Page' : 'STEP'} {step + 1}/5</span>
      </div>
      <div className="c-mast">Write Your Own</div>
      <div className="c-steps">
        {steps.map((s, i) => <button key={s} className={i === step ? 'c-st on' : i < step ? 'c-st done' : 'c-st'} style={{ border: 0 }} onClick={() => setStep(i)}>{s}</button>)}
      </div>
      <div className="c-who">
        <div className="c-ini" style={{ background: skin === 'paper' ? undefined : align === 'HEEL' ? 'var(--cr-bad)' : undefined }}>{ini}</div>
        <div className="c-whot">
          <span className="c-tag">{cls.map((k) => CLASS_NAME[k]).join(' · ') || 'No class yet'}</span>
          <span className={`c-nm ${align === 'HEEL' ? 'heel' : 'face'}`}><span className="c-pre">({align === 'HEEL' ? 'h' : 'f'}) </span>{display}</span>
          <span className="c-sub"><i>{gimmick || 'No gimmick yet'}</i> · {age} · {ft} · {wt} lb · {country}</span>
          <span className="c-status">{w('Free agent · The Indie Scene', 'Free agent · The Indie Scene')}</span>
        </div>
      </div>

      {step === 0 && (
        <div className="c-body">
          <span className="c-sec">{w('The name', 'Who they are')}</span>
          <span className="c-lab">{w('Ring name')}</span>
          <input className="c-fld" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dale Hargreaves" maxLength={32} />
          <span className="c-lab">{w('Gimmick')}</span>
          <input className="c-fld" value={gimmick} onChange={(e) => setGimmick(e.target.value)} placeholder="The Yorkshire Grappler" maxLength={40} />
          <span className="c-lab">{w('Gimmick description')}</span>
          <textarea className="c-fld tall" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={160} placeholder="Farm lad turned mat technician." />
          <div className="c-two">
            <div className="c-col">
              <span className="c-lab">{w('Gender')}</span>
              <div className="c-pair">{(['MALE', 'FEMALE'] as const).map((g) => <button key={g} className={gender === g ? 'c-chip on' : 'c-chip'} onClick={() => setGender(g)}>{w(g === 'MALE' ? 'Male' : 'Female')}</button>)}</div>
              <span className="c-hint">{gender === 'MALE' ? 'Men’s division' : 'Women’s division'}</span>
            </div>
            <div className="c-col">
              <span className="c-lab">{w('Alignment')}</span>
              <div className="c-pair">{(['FACE', 'HEEL'] as const).map((a) => <button key={a} className={align === a ? `c-chip on ${a === 'FACE' ? 'face' : 'heel'}` : 'c-chip'} onClick={() => setAlign(a)}>{w(a === 'FACE' ? 'Face' : 'Heel')}</button>)}</div>
              <span className="c-hint">Red heel, blue face</span>
            </div>
          </div>
          <span className="c-sec">{w('Nationality')}</span>
          <div className="c-cyc">
            <button className="c-stepb" onClick={() => setCi((ci + COUNTRIES.length - 1) % COUNTRIES.length)} aria-label="Previous country">‹</button>
            <div className="c-fld mid"><span>{country}</span><span className="c-hint">Region · {REGION_NAME[region]?.[1]}</span></div>
            <button className="c-stepb" onClick={() => setCi((ci + 1) % COUNTRIES.length)} aria-label="Next country">›</button>
          </div>
          <span className="c-sec">{w('Build')}</span>
          {[
            { l: 'Age', v: String(age), dn: () => setAge(Math.max(18, age - 1)), up: () => setAge(Math.min(55, age + 1)) },
            { l: 'Height', v: ft, dn: () => setH(Math.max(60, h - 1)), up: () => setH(Math.min(84, h + 1)) },
            { l: 'Weight', v: `${wt} lb`, dn: () => setWt(Math.max(110, wt - 5)), up: () => setWt(Math.min(420, wt + 5)) },
          ].map((b) => (
            <div key={b.l} className="c-stp"><span className="c-lab">{w(b.l)}</span><b className="c-big">{b.v}</b><button className="c-stepb" onClick={b.dn}>−</button><button className="c-stepb" onClick={b.up}>+</button></div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="c-body">
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Pick one or two classes')}</span><span className="c-hint">{cls.length === 2 ? '2 picked · multiclass' : cls.length === 1 ? '1 picked' : 'none picked'}</span></div>
          {CLASS_ORDER.map((k) => {
            const on = cls.includes(k);
            return (
              <button key={k} className={on ? 'c-ccard on' : 'c-ccard'} onClick={() => setCls(on ? cls.filter((x) => x !== k) : [...cls, k].slice(-2))}>
                <span className="c-crow"><b className="c-cname">{CLASS_NAME[k]}</b><span className="c-tick">{on ? w('✓ Picked', '✓ PICKED') : ''}</span></span>
                <span className="c-effs">{effs(CLASS_MODS[k]).map((e, i) => <span key={i} className={e.c}>{e.t}</span>)}</span>
              </button>
            );
          })}
          <span className="c-note">Two classes average their modifiers rather than stacking them, so a multiclass wrestler sits between both styles.</span>
          <span className="c-sec">{w('Your foundation')}</span>
          {ATTR_KEYS.map((_, i) => {
            const v = BASE[i]! + cm[i]!;
            return (
              <div key={i} className="c-frow"><span className="c-lab">{ATTR_LONG[i]}</span><span className="c-num">{BASE[i]}</span><span className={cm[i]! > 0 ? 'c-eff up' : cm[i]! < 0 ? 'c-eff dn' : 'c-eff'}>{sgn(cm[i]!)}</span><span className="c-bar"><i className="c-fill" style={{ width: `${v}%` }} /></span><b className="c-big">{v}</b></div>
            );
          })}
          <span className="c-note">Base plus class. Your life story adds to this next.</span>
        </div>
      )}

      {step === 2 && (
        <>
          <div className="c-body">
            <div className="c-rowsb">
              <span className="c-qch">{skin === 'paper' ? `Chapter ${['I', 'II', 'III', 'IV', 'V'][q]}: ${QUESTIONS[q]!.ch}` : `Question ${q + 1} · ${QUESTIONS[q]!.ch}`}</span>
              <span className="c-dots">{QUESTIONS.map((_, i) => <i key={i} className={i === q ? 'c-dot on' : ans[i] !== null ? 'c-dot done' : 'c-dot'} />)}</span>
            </div>
            <span className="c-qtext">{QUESTIONS[q]!.q}</span>
            {QUESTIONS[q]!.a.map((a, i) => (
              <button key={i} className={ans[q] === i ? 'c-ans on' : 'c-ans'} onClick={() => setAns(ans.map((x, k) => (k === q ? i : x)))}>
                <b className="c-at">{a.t}</b>
                <span className="c-ad">{a.d}</span>
                <span className="c-effs">{effs(a.mods).map((e, k) => <span key={k} className={e.c}>{e.t}</span>)}</span>
              </button>
            ))}
          </div>
          <div className="c-live">
            <span className="c-lab">{w('Your attributes so far · this answer')}</span>
            <div className="c-lgrid">
              {ATTR_KEYS.map((_, i) => {
                const d = ans[q] === null ? 0 : QUESTIONS[q]!.a[ans[q]!]!.mods[i]!;
                return <span key={i} className="c-lcell"><span className="c-lab">{ATTR_SHORT[i]}</span><b className="c-big">{vals[i]}</b><span className={d > 0 ? 'c-eff up' : 'c-eff dn'}>{d ? sgn(d) : ''}</span></span>;
              })}
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <div className="c-body">
          <div className="c-modes">
            {[['From a template', 'From your classes and attributes'], ['Start blank', 'Pick every move'], ['Copy a wrestler', 'Take theirs, then tweak']].map(([t, d], i) => (
              <button key={t} className={mode === i ? 'c-mode on' : 'c-mode'} onClick={() => { setMode(i); setCustom(null); }}><b>{w(t!)}</b><span>{d}</span></button>
            ))}
          </div>
          <span className="c-note">{mode === 0 ? `Built from ${cls.map((k) => CLASS_NAME[k]).join(' + ') || 'no class'} and your attributes.` : mode === 1 ? 'Every slot is empty. Fill all 40 moves, 2 signatures and 3 finishers yourself.' : 'Copies their whole moveset.'} Everything stays editable.</span>
          {mode === 2 && (
            <>
              <input className="c-fld" value={copyQ} onChange={(e) => setCopyQ(e.target.value)} placeholder="Search the database…" />
              <div className="c-wrap">
                {WRESTLERS.filter((x) => !copyQ || x.name.toLowerCase().includes(copyQ.toLowerCase())).slice(0, 12).map((x) => (
                  <button key={x.id} className={copyFrom === x.id ? 'c-chip on' : 'c-chip'} style={{ minHeight: 36, fontSize: 14 }} onClick={() => { setCopyFrom(x.id); setCustom(null); }}>{x.name} <small>{x.promotion}</small></button>
                ))}
              </div>
            </>
          )}
          <span className="c-sec">{w('Finishers')}</span>
          <div className="c-wrap">{kit.finishers.map((id, i) => <span key={i} className={id ? 'c-mv fin' : 'c-mv empty'}>{id ? getMove(id).name : 'Empty slot'}</span>)}</div>
          <span className="c-sec">{w('Signatures')}</span>
          <div className="c-wrap">{kit.signatures.map((id, i) => <span key={i} className={id ? 'c-mv sig' : 'c-mv empty'}>{id ? getMove(id).name : 'Empty slot'}</span>)}</div>
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Moves')}</span><span className="c-hint">{kit.moves.filter(Boolean).length} / 40</span></div>
          <div className="c-cells">
            {TYPE_LABEL.flatMap(([t], ti) => kit.moves.filter((id) => id && getMove(id).type === t).map((_, k) => <i key={`${t}${k}`} className={`c-cell c-t${ti}`} />))}
            {kit.moves.filter((x) => !x).map((_, k) => <i key={`e${k}`} className="c-cell empty" />)}
          </div>
          <div className="c-keys">{TYPE_LABEL.map(([t, l], ti) => <span key={t} className="c-kk"><i className={`c-key c-t${ti}`} />{l} <b>{kit.moves.filter((id) => id && getMove(id).type === t).length}</b></span>)}</div>
          <button className="c-b3" onClick={() => setEditing(true)}>{w('Edit the moveset ›', 'Edit moveset ›')}</button>
        </div>
      )}

      {step === 4 && (
        <div className="c-body">
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Identity')}</span><button className="c-chg" style={{ background: 'none', border: 0 }} onClick={() => setStep(0)}>{w('Change ›')}</button></div>
          <div className="c-kv">
            {[['Ring name', name || '—'], ['Gimmick', gimmick || '—'], ['Gender', `${gender === 'MALE' ? 'Male · Men’s' : 'Female · Women’s'} division`], ['Alignment', align === 'FACE' ? 'Face' : 'Heel'], ['Nationality', `${country} · ${REGION_NAME[region]?.[1]}`], ['Build', `${age} · ${ft} · ${wt} lb`]].map(([l, v]) => (
              <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(l!)}</span><span className="c-val">{v}</span></span>
            ))}
          </div>
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Classes')}</span><button className="c-chg" style={{ background: 'none', border: 0 }} onClick={() => setStep(1)}>{w('Change ›')}</button></div>
          <span className="c-val">{cls.map((k) => CLASS_NAME[k]).join(' · ')}</span>
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Life story', 'Background')}</span><button className="c-chg" style={{ background: 'none', border: 0 }} onClick={() => { setStep(2); setQ(0); }}>{w('Change ›')}</button></div>
          {QUESTIONS.map((qq, i) => {
            const a = ans[i] === null ? null : qq.a[ans[i]!];
            return <div key={i} className="c-bgr"><span className="c-lab">{qq.ch}</span><span className="c-val">{a?.t ?? '— not answered —'}</span><span className="c-effs">{a ? effs(a.mods).map((e, k) => <span key={k} className={e.c}>{e.t}</span>) : null}</span></div>;
          })}
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Starting attributes')}</span><span className="c-hint">Overall {Math.round(vals.reduce((a, b) => a + b, 0) / 6)}</span></div>
          <div className="c-brk head"><span /><span className="c-lab">Base</span><span className="c-lab">Class</span><span className="c-lab">{skin === 'paper' ? 'Life' : 'Hist'}</span><span /><span className="c-lab">=</span></div>
          {ATTR_KEYS.map((_, i) => (
            <div key={i} className="c-brk"><span className="c-lab">{ATTR_LONG[i]}</span><span className="c-num">{BASE[i]}</span><span className="c-num">{sgn(cm[i]!)}</span><span className="c-num">{sgn(hm[i]!)}</span><span className="c-bar"><i className={vals[i] === best ? 'c-fill best' : 'c-fill'} style={{ width: `${vals[i]}%` }} /></span><b className="c-big">{vals[i]}</b></div>
          ))}
          <div className="c-rowsb"><span className="c-sec c-grow">{w('Moveset')}</span><button className="c-chg" style={{ background: 'none', border: 0 }} onClick={() => setStep(3)}>{w('Change ›')}</button></div>
          <div className="c-kv">
            <span className="c-lab">{w('Finishers')}</span><span className="c-val">{kit.finishers.map((id) => (id ? getMove(id).name : '—')).join(', ')}</span>
            <span className="c-lab">{w('Signatures')}</span><span className="c-val">{kit.signatures.map((id) => (id ? getMove(id).name : '—')).join(', ')}</span>
            <span className="c-lab">{w('Moves')}</span><span className="c-val">{kit.moves.filter(Boolean).length} of 40 filled</span>
          </div>
          <div className="c-start">
            <span className="c-lab">{w('Where they start')}</span>
            <b className="c-sbig">{w('The Indie Scene, free agent', 'The Indie Scene · free agent')}</b>
            <span className="c-val">Unsigned, no contract. Added to the shared database, so they’re in exhibition too.</span>
          </div>
          {hasCareer && <div className="c-warn">Starting this career replaces your current one.</div>}
          {!ready && <div className="c-warn">{!name.trim() ? 'Give them a ring name. ' : ''}{ans.some((a) => a === null) ? 'Answer every life-story question. ' : ''}{filled < 45 ? 'Fill the moveset. ' : ''}{!cls.length ? 'Pick a class.' : ''}</div>}
        </div>
      )}

      <div className="c-nav">
        <button className="c-b2" onClick={back}>{step === 0 ? w('Tear it up', 'Cancel') : step === 2 && q > 0 ? w('‹ Last question', '‹ Previous') : w('‹ Previous page', '‹ Back')}</button>
        <button className="c-b1" onClick={next} disabled={step === 4 && !ready}>{step === 4 ? w('Go to press', 'Start career') : step === 2 && q < 4 ? w('Next question ›') : w('Turn the page ›', 'Next ›')}</button>
      </div>
      {confirm && <WorldChoice hasCareer={hasCareer} onCancel={() => setConfirm(false)} onGo={(fresh) => onDone(build(), fresh)} />}
    </Screen>
  );
}
