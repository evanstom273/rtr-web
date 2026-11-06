// The feuds UI sweep: with the dev server up (SWEEP_URL, default :5173),
//   node scripts/feud-sweep.mjs <screenshot dir>
// In all three skins at phone and fold widths: the hub's feud button, the Feuds screen (start a feud, the stage
// track, the story, calling the blow-off, everyone else's), and on show day a promo played beat by beat on the timing
// bar, then a brawl. Fails on page errors, sideways scrolling, and steps that don't land.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SP = process.argv[2];
const URL = process.env.SWEEP_URL ?? 'http://localhost:5173/';
const VIEWS = { phone: { width: 412, height: 915 }, fold: { width: 945, height: 980 } };
const fails = [];
const b = await chromium.launch();
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
for (const skin of (process.env.SKINS ?? 'broadcast,paper,building').split(',')) {
  for (const [vn, vp] of Object.entries(VIEWS).filter(([k]) => !process.env.VIEW || k === process.env.VIEW)) {
    const tag = `${skin}/${vn}`;
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vn === 'phone', hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const wait = (ms) => p.waitForTimeout(ms);
    const toCareer = async () => { await p.goto(URL); await wait(1500); await p.locator('#menu button').filter({ hasText: /^(The career|Career)/i }).first().click(); await wait(1500); };
    await p.goto(URL); await wait(1500);
    await p.evaluate((s) => localStorage.setItem('rtr-skin', JSON.stringify(s)), skin);
    await p.waitForFunction(() => !!window.__rtrDev, null, { timeout: 15000 });
    await p.evaluate(async () => {
      const { world, career, data } = window.__rtrDev;
      world.setWorld(world.freshWorld(7));
      const c = career.startCareer({ player: 'buck_stratton', today: '2026-11-03', seed: 7 });
      world.activeWorld().career = c;
      c.feuds = c.feuds.filter((f) => f.a !== c.player && f.b !== c.player);
      data.databaseChanged();
      await world.saveWorld();
    });
    await toCareer();
    // The hub: no feud yet; open the Feuds screen and start one.
    const fb = p.locator('button.c-feud').first();
    if (!(await fb.count())) { fails.push(`${tag}: no feud button on the hub`); await ctx.close(); continue; }
    await fb.click(); await wait(600);
    const start = p.locator('.c-ans').filter({ hasText: /call them out/i }).first();
    if (!(await start.count())) fails.push(`${tag}: no way to start a feud`);
    else { await start.click(); await wait(500); if (!(await p.getByText(/it’s on/i).count())) fails.push(`${tag}: starting a feud didn't land`); }
    await p.screenshot({ path: `${SP}/${skin}-${vn}-feuds-started.png`, fullPage: true });
    // Move it on, and put a promo and a beat-down tonight (you're on the show).
    await p.evaluate(async () => {
      const { world, data } = window.__rtrDev;
      const c = world.activeWorld().career;
      const f = c.feuds.find((x) => !x.done && (x.a === c.player || x.b === c.player));
      f.stage = 'building'; f.heat = 55; f.beats = [{ day: c.today, t: 'You called them out', d: 5 }, ...(f.beats ?? [])];
      const promo = c.people[c.player].contract.promo;
      const show = Object.values(c.shows).filter((s) => s.promo === promo && s.date >= c.today).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
      show.date = c.today;
      const other = data.WRESTLERS.find((w) => w.id !== c.player && w.id !== f.b && w.promotion === promo);
      show.card = [{ a: c.player, b: other.id }];
      show.segments = [{ kind: 'promo', who: [c.player, f.b], after: -1, feud: f.id }, { kind: 'beatdown', who: [c.player, f.b], after: 0, feud: f.id }];
      await world.saveWorld();
    });
    await toCareer();
    await p.locator('button.c-feud').first().click(); await wait(600);
    if (!(await p.getByText(/the story so far/i).count())) fails.push(`${tag}: no story on the Feuds screen`);
    if (!(await p.locator('.c-steps .c-st.on').count())) fails.push(`${tag}: no stage track`);
    const stip = p.getByRole('button', { name: /^steel cage$/i }).first();
    if (await stip.count()) { await stip.click(); await wait(200); await p.getByRole('button', { name: /^call it$/i }).click(); await wait(400); if (!(await p.getByText(/done:|no show far enough/i).count())) fails.push(`${tag}: calling the blow-off didn't land`); }
    else fails.push(`${tag}: no way to call the blow-off`);
    if (await sideways(p)) fails.push(`${tag}: Feuds screen scrolls sideways`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-feuds-screen.png`, fullPage: true });
    // Show day: play the promo, beat by beat.
    await p.getByRole('button', { name: /^done$/i }).last().click(); await wait(500);
    for (let k = 0; k < 2 && !(await p.getByRole('button', { name: /to the show/i }).count()); k++) { await p.locator('.c-adv').first().click(); await wait(1500); }
    await p.getByRole('button', { name: /to the show/i }).first().click(); await wait(800);
    const play = p.getByRole('button', { name: /^play it$/i }).first();
    if (!(await play.count())) { fails.push(`${tag}: no Play it for the segment on show day`); }
    else {
      await play.click(); await wait(600);
      let beats = 0;
      for (let k = 0; k < 6; k++) {
        const opt = p.locator('.c-ans').first();
        if (!(await opt.count())) break;
        await opt.click(); await wait(300);
        if (k === 0) await p.screenshot({ path: `${SP}/${skin}-${vn}-promo-deliver.png`, fullPage: true });
        await wait(250 + k * 90);
        const del = p.getByRole('button', { name: /^deliver/i });
        if (!(await del.count())) { await p.screenshot({ path: `${SP}/${skin}-${vn}-promo-stuck-${k}.png`, fullPage: true }); break; }
        await del.click(); await wait(700);
        beats++;
      }
      if (beats < 4) fails.push(`${tag}: the promo stopped after ${beats} beats`);
      if (!(await p.getByText(/how it went/i).count())) fails.push(`${tag}: the promo didn't finish`);
      await p.screenshot({ path: `${SP}/${skin}-${vn}-promo-done.png`, fullPage: true });
      await p.getByRole('button', { name: /^done$/i }).last().click(); await wait(500);
      // The beat-down: a brawl.
      const play2 = p.getByRole('button', { name: /^play it$/i }).first();
      if (await play2.count()) {
        await play2.click(); await wait(500);
        for (let k = 0; k < 6 && !(await p.getByText(/how it went/i).count()); k++) { await p.getByRole('button', { name: /^strike$/i }).click(); await wait(300); }
        if (!(await p.getByText(/how it went/i).count())) fails.push(`${tag}: the brawl didn't finish`);
        await p.screenshot({ path: `${SP}/${skin}-${vn}-brawl-done.png`, fullPage: true });
        if (await sideways(p)) fails.push(`${tag}: the segment screen scrolls sideways`);
      } else fails.push(`${tag}: no Play it for the beat-down`);
    }
    if (errs.length) fails.push(`${tag}: page errors ${errs.slice(0, 2).join(' | ')}`);
    console.log(tag);
    await ctx.close();
  }
}
console.log('FAILS', fails.length, '\n' + fails.join('\n'));
await b.close();
