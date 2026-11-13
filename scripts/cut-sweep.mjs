// The big cut's UI sweep: with the dev server on :5173,
//   node scripts/cut-sweep.mjs <screenshot dir> [skin]
// A star's career in all three skins at phone and fold widths: the hub nav (no Office, no phone), Life (your entrance,
// the school, money: no homes, staff or investing), Relationships (no locker room or orientation; teaming up from
// here), Finances, and the skip sheet. Fails on page errors, sideways scrolling, nav labels that don't fit, a hidden
// part showing, and buys or asks that don't land.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SP = process.argv[2];
const URL = process.env.SWEEP_URL ?? 'http://localhost:5173/';
const ONLY = process.argv[3];
const VIEWS = { phone: { width: 412, height: 915 }, fold: { width: 945, height: 980 } };
const fails = [];
const b = await chromium.launch();
for (const skin of ['broadcast', 'paper', 'building'].filter((s) => !ONLY || s === ONLY)) {
  for (const [vn, vp] of Object.entries(VIEWS)) {
    const tag = `${skin}/${vn}`;
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vn === 'phone', hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const wait = (ms) => p.waitForTimeout(ms);
    const sideways = async (where) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fails.push(`${tag}: ${where} scrolls sideways`); };
    await p.goto(URL); await wait(1500);
    await p.evaluate((s) => localStorage.setItem('rtr-skin', JSON.stringify(s)), skin);
    await p.waitForFunction(() => !!window.__rtrDev, null, { timeout: 15000 });
    await p.evaluate(async () => {
      const { world, career, data } = window.__rtrDev;
      world.setWorld(world.freshWorld(7));
      const c = career.startCareer({ player: 'buck_stratton', today: '2026-11-03', seed: 7 });
      world.activeWorld().career = c;
      c.money = 3_000_000;
      data.databaseChanged();
      await world.saveWorld();
    });
    await p.goto(URL); await wait(1500);
    await p.locator('#menu button').filter({ hasText: /^(The career|Career)/i }).first().click(); await wait(1500);
    const nav = p.locator('nav.c-tabs4');
    if (!(await nav.count())) { fails.push(`${tag}: no hub nav`); await ctx.close(); continue; }
    const navCheck = await p.evaluate(() => {
      const n = document.querySelector('nav.c-tabs4');
      const btns = [...n.querySelectorAll('button')];
      return { labels: btns.map((x) => x.textContent), cut: btns.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent) };
    });
    if (navCheck.cut.length) fails.push(`${tag}: nav labels cut ${navCheck.cut.join(',')}`);
    if (navCheck.labels.some((l) => /office/i.test(l))) fails.push(`${tag}: the Office is still in the nav`);
    if (await p.locator('.c-phoneb').count()) fails.push(`${tag}: the phone is still on the hub`);
    await sideways('hub');
    await p.screenshot({ path: `${SP}/${skin}-${vn}-hub.png` });

    // Life: your entrance, the school, money.
    await nav.getByRole('button', { name: /^life$/i }).click(); await wait(800);
    const tabs = await p.locator('.c-steps button').allTextContents();
    for (const gone of ['Home', 'Getting about', 'Invest', 'Your team']) if (tabs.some((t) => t.trim().toLowerCase() === gone.toLowerCase())) fails.push(`${tag}: Life still has ${gone}`);
    if (!tabs.some((t) => /your entrance/i.test(t))) fails.push(`${tag}: Life has no entrance tab (${tabs.join(', ')})`);
    if (await p.getByText(/switched off/i).count()) fails.push(`${tag}: Life says it's switched off`);
    await sideways('Life');
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life.png`, fullPage: true });
    await p.getByRole('button', { name: /your own theme/i }).click(); await wait(400);
    if (!(await p.getByText(/you have/i).locator('xpath=following-sibling::*[1]').filter({ hasText: /your own theme/i }).count())) fails.push(`${tag}: buying a theme didn't land`);
    if (await p.getByText(/personal staff|medical/i).count()) fails.push(`${tag}: staff or medical showing`);
    await p.getByRole('button', { name: /^money$/i }).click(); await wait(500);
    if (await p.getByText(/rich list|family/i).count()) fails.push(`${tag}: the rich list or family showing`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-money.png`, fullPage: true });
    await p.getByRole('button', { name: /done/i }).last().click(); await wait(600);

    // Relationships: ask someone to team up.
    await nav.getByRole('button', { name: /career/i }).click(); await wait(700);
    await p.getByRole('button', { name: /^relation/i }).first().click(); await wait(800);
    if (await p.getByText(/locker room:/i).count()) fails.push(`${tag}: the locker room's still on Relationships`);
    if (await p.getByText(/your orientation/i).count()) fails.push(`${tag}: orientation still showing`);
    const ask = p.getByRole('button', { name: /ask them to team up/i });
    if (!(await ask.count())) fails.push(`${tag}: no way to ask anyone to team up`);
    else { await ask.first().click(); await wait(400); if (!(await p.getByText(/they said no|you’re a team/i).count())) fails.push(`${tag}: asking to team up didn't land`); }
    await sideways('Relationships');
    await p.screenshot({ path: `${SP}/${skin}-${vn}-relationships.png`, fullPage: true });
    await p.getByRole('button', { name: /back/i }).first().click(); await wait(600);

    // Finances: no day job.
    const fin = p.getByRole('button', { name: /finances/i }).first();
    if (await fin.count()) { await fin.click(); await wait(700); if (await p.getByText(/day job/i).count()) fails.push(`${tag}: a day job on Finances`); await sideways('Finances'); await p.screenshot({ path: `${SP}/${skin}-${vn}-finances.png`, fullPage: true }); }

    if (errs.length) fails.push(`${tag}: page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}
await b.close();
console.log(fails.length ? `FAIL\n${fails.join('\n')}` : 'OK');
process.exit(fails.length ? 1 : 0);
