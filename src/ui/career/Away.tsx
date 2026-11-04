import { ordersOf, type Career } from '../../career';
import type { AwayOrders } from '../../career/types';
import { commit, money, useWords } from './parts';

/** My week › Away: standing orders for answering mail while you skip (Lyra's call). */
export function Away({ c }: { c: Career }) {
  const { w } = useWords();
  const o = ordersOf(c);
  const set = (f: (x: AwayOrders) => void) => { f(o); commit(); };
  const chip = (on: boolean, label: string, f: () => void) => <button key={label} className={`c-chip${on ? ' on' : ''}`} onClick={() => set(f)}>{w(label)}</button>;
  return (
    <>
      <span className="c-note">While you skip, your character answers mail by these orders, and you get a summary at the end. Anything they don’t cover waits for you.</span>
      <div className="c-chips">{chip(o.on, 'Answer mail for me', () => { o.on = true; })}{chip(!o.on, 'Leave it all for me', () => { o.on = false; })}</div>

      <span className="c-sec">{w('Indie dates')}</span>
      <div className="c-chips">{chip(o.indie.on, 'Take them', () => { o.indie.on = true; })}{chip(!o.indie.on, 'Ask me', () => { o.indie.on = false; })}</div>
      {o.indie.on && (
        <div className="c-kv">
          <span className="c-lab">{w('Paying at least')}</span>
          <div className="c-chips">{[0, 100, 250, 500, 1000].map((n) => chip(o.indie.minFee === n, n ? money(n) : 'Anything', () => { o.indie.minFee = n; }))}</div>
          <span className="c-lab">{w('As far as')}</span>
          <div className="c-chips">{chip(o.indie.reach === 'country', 'My country', () => { o.indie.reach = 'country'; })}{chip(o.indie.reach === 'region', 'My region', () => { o.indie.reach = 'region'; })}{chip(o.indie.reach === 'anywhere', 'Anywhere', () => { o.indie.reach = 'anywhere'; })}</div>
          <span className="c-lab">{w('Not if tired over')}</span>
          <div className="c-chips">{[50, 60, 70, 80, 100].map((n) => chip(o.indie.maxFatigue === n, n === 100 ? 'Never mind' : String(n), () => { o.indie.maxFatigue = n; }))}</div>
        </div>
      )}

      <span className="c-sec">{w('Career events')}</span>
      <div className="c-chips">{chip(o.events === 'yes', 'Say yes', () => { o.events = 'yes'; })}{chip(o.events === 'no', 'Say no', () => { o.events = 'no'; })}{chip(o.events === 'leave', 'Ask me', () => { o.events = 'leave'; })}</div>

      <span className="c-sec">{w('People and press')}</span>
      <div className="c-chips">{chip(o.people === 'gracious', 'Gracious', () => { o.people = 'gracious'; })}{chip(o.people === 'cocky', 'Cocky', () => { o.people = 'cocky'; })}{chip(o.people === 'fiery', 'Fiery', () => { o.people = 'fiery'; })}{chip(o.people === 'leave', 'Ask me', () => { o.people = 'leave'; })}</div>

      <span className="c-sec">{w('Invitations')}</span>
      <div className="c-chips">{chip((o.invites ?? 'close') === 'close', 'Yes to people I’m close to', () => { o.invites = 'close'; })}{chip(o.invites === 'no', 'Say no', () => { o.invites = 'no'; })}{chip(o.invites === 'leave', 'Ask me', () => { o.invites = 'leave'; })}</div>

      <span className="c-sec">{w('Contract offers')}</span>
      <div className="c-chips">{chip(!o.contracts.on, 'Ask me', () => { o.contracts.on = false; })}{chip(o.contracts.on && o.contracts.same, 'Re-sign only', () => { o.contracts.on = true; o.contracts.same = true; })}{chip(o.contracts.on && !o.contracts.same, 'Any promotion', () => { o.contracts.on = true; o.contracts.same = false; })}</div>
      {o.contracts.on && (
        <div className="c-kv">
          <span className="c-lab">{w('Paying at least')}</span>
          <div className="c-chips">{[0, 2500, 5000, 10000].map((n) => chip(o.contracts.minFee === n, n ? `${money(n)} a match` : 'Anything', () => { o.contracts.minFee = n; }))}</div>
        </div>
      )}
      <span className="c-note">Contract offers are signed as they’re offered, with no negotiating: only set this if you trust the market.</span>
    </>
  );
}
