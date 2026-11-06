// The feuds UI sweep: with the dev server up (SWEEP_URL, default :5173),
//   node scripts/feud-sweep.mjs <screenshot dir>
// A star in a feud, in all three skins at phone and fold widths: the feud strip on the hub (heat, beats), and on show
// day the feud's segment with its choices (and asking for a promo slot). Fails on page errors, sideways scrolling, and
// choices that don't land.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SP = process.argv[2];
const URL = process.env.SWEEP_URL ?? 'http://localhost:5173/';
const VIEWS = { phone: { width: 412, height: 915 }, fold: { width: 945, height: 980 } };
const fails = [];
const b = await chromium.launch();
for (const skin of ['broadcast', 'paper', 'building']) {
  for (const [vn, vp] of Object.entries(VIEWS)) {
    const tag = `${skin}/${vn}`;
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vn === 'phone', hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const wait = (ms) => p.waitForTimeout(ms);
    await p.goto(URL); await wait(1500);
    await p.evaluate((s) => localStorage.setItem('rtr-skin', JSON.stringify(s)), skin);
    await p.waitForFunction(() => !!window.__rtrDev, null, { timeout: 15000 });
    const setup = await p.evaluate(async () => {
      const { world, career, data } = window.__rtrDev;
      world.setWorld(world.freshWorld(7));
      const c = career.startCareer({ player: 'buck_stratton', today: '2026-11-03', seed: 7 });
      world.activeWorld().career = c;
      const promo = c.people[c.player].contract.promo;
      const roster = data.WRESTLERS.filter((w) => w.id !== c.player && w.promotion === promo);
      const rival = roster[0];
      // Tonight: a show of theirs with you on it, and a segment with your rival.
      const show = Object.values(c.shows).filter((s) => s.promo === promo && s.date >= c.today).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
      show.date = c.today;
      show.card = [{ a: c.player, b: roster[1].id }];
      show.segments = [{ kind: 'promo', who: [c.player, rival.id], after: -1, feud: 'fsweep' }];
      c.feuds.push({ id: 'fsweep', promo, a: c.player, b: rival.id, start: c.today, payoff: null, matches: 1, done: false, heat: 62, beats: [{ day: c.today, t: 'A beat-down on TV', d: 9 }] });
      data.databaseChanged();
      await world.saveWorld();
      return { rival: rival.name };
    });
    await p.goto(URL); await wait(1500);
    await p.locator('#menu button').filter({ hasText: /^(The career|Career)/i }).first().click(); await wait(1500);
    const strip = p.locator('.c-feud').first();
    if (!(await strip.count())) fails.push(`${tag}: no feud strip on the hub`);
    else {
      await strip.click(); await wait(300);
      if (!(await p.getByText(/A beat-down on TV/).count())) fails.push(`${tag}: the feud's beats don't open`);
    }
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fails.push(`${tag}: hub scrolls sideways`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-hub-feud.png` });
    // The morning first (travelling), then the show.
    for (let k = 0; k < 2 && !(await p.getByRole('button', { name: /to the show/i }).count()); k++) { await p.locator('.c-adv').first().click(); await wait(1500); }
    await p.getByRole('button', { name: /to the show/i }).first().click(); await wait(800);
    const chip = p.getByRole('button', { name: /^get personal$/i });
    if (!(await chip.count())) fails.push(`${tag}: no segment choices on show day`);
    else {
      await chip.click(); await wait(300);
      if (!(await p.getByText(/real-life stuff/i).count())) fails.push(`${tag}: choosing a style didn't land`);
    }
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fails.push(`${tag}: show day scrolls sideways`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-showday-feud.png`, fullPage: true });
    if (errs.length) fails.push(`${tag}: page errors ${errs.slice(0, 2).join(' | ')}`);
    console.log(tag, setup.rival);
    await ctx.close();
  }
}
console.log('FAILS', fails.length, '\n' + fails.join('\n'));
await b.close();
