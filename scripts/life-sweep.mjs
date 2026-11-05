// The Life UI sweep (run before calling Life work done): with the dev server on :5173,
//   node scripts/life-sweep.mjs <screenshot dir> [skin]
// A star's career with money in the bank, in all three skins at phone and fold widths: the hub nav (seven tabs on two
// rows), the Life tab's three sections, buying a house on a mortgage, a car, hiring an agent, and Finances. Fails on
// page errors, sideways scrolling, nav labels that don't fit, and buys that don't land.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SP = process.argv[2];
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
    await p.goto('http://localhost:5173/'); await wait(1500);
    await p.evaluate((s) => localStorage.setItem('rtr-skin', JSON.stringify(s)), skin);
    await p.waitForFunction(() => !!window.__rtrDev, null, { timeout: 15000 });
    await p.evaluate(async () => {
      const { world, career, data, life } = window.__rtrDev;
      world.setWorld(world.freshWorld(7));
      const c = career.startCareer({ player: 'buck_stratton', today: '2026-11-03', seed: 7 });
      world.activeWorld().career = c;
      c.money = 3_000_000;
      const L = life.state.life(c);
      L.months = { '2026-11': 1_300_000 };
      data.databaseChanged();
      await world.saveWorld();
    });
    await p.goto('http://localhost:5173/'); await wait(1500);
    await p.locator('#menu button').filter({ hasText: /^(The career|Career)/i }).first().click(); await wait(1500);
    const nav = p.locator('nav.c-tabs4');
    if (!(await nav.count())) { fails.push(`${tag}: no hub nav`); await ctx.close(); continue; }
    const navCheck = await p.evaluate(() => {
      const n = document.querySelector('nav.c-tabs4');
      const btns = [...n.querySelectorAll('button')];
      return { cls: n.className, n: btns.length, cut: btns.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent), sideways: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (navCheck.cut.length) fails.push(`${tag}: nav labels cut ${navCheck.cut.join(',')}`);
    if (navCheck.sideways) fails.push(`${tag}: hub scrolls sideways`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-hub.png` });
    await nav.getByRole('button', { name: /^life$/i }).click(); await wait(800);
    const sections = { home: false, about: false, money: false };
    sections.home = (await p.getByText(/you live in/i).count()) > 0;
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-home.png`, fullPage: true });
    // Buy a house on a mortgage.
    const house = p.locator('.c-ans').filter({ hasText: /^House/ }).filter({ has: p.getByRole('button', { name: /mortgage/i }) }).first();
    await house.getByRole('button', { name: /mortgage/i }).click(); await wait(500);
    const owned = await p.getByText(/what you own/i).count();
    if (!owned) fails.push(`${tag}: buying a house didn't land`);
    await p.getByRole('button', { name: /getting about/i }).click(); await wait(500);
    sections.about = (await p.getByText(/flying abroad/i).count()) > 0;
    await p.locator('.c-ans').filter({ hasText: /^Decent car/ }).first().getByRole('button', { name: /^cash$/i }).click(); await wait(500);
    if (!(await p.getByText(/your garage/i).count())) fails.push(`${tag}: buying a car didn't land`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-about.png`, fullPage: true });
    await p.getByRole('button', { name: /^money$/i }).click(); await wait(500);
    sections.money = (await p.getByText(/credit and borrowing/i).count()) > 0;
    const hire = p.locator('.c-ans').filter({ hasText: /Local agent/ }).first();
    if (await hire.count()) { await hire.click(); await wait(500); }
    if (!(await p.getByText(/of contract money/i).count())) fails.push(`${tag}: hiring an agent didn't land`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-money.png`, fullPage: true });
    for (const [k, v] of Object.entries(sections)) if (!v) fails.push(`${tag}: no ${k} section`);
    const lifeSide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (lifeSide) fails.push(`${tag}: Life scrolls sideways`);
    // Finances: the new rows.
    await p.getByRole('button', { name: /done/i }).last().click(); await wait(600);
    await p.locator('nav.c-tabs4 button').filter({ hasText: /^career$/i }).first().click().catch(() => {}); await wait(600);
    const fin = p.getByRole('button', { name: /finances/i }).first();
    if (await fin.count()) {
      await fin.click(); await wait(700);
      const rows = await p.evaluate(() => document.body.innerText);
      if (!/homes|getting about/i.test(rows)) fails.push(`${tag}: Finances has no Life rows`);
      await p.screenshot({ path: `${SP}/${skin}-${vn}-finances.png`, fullPage: true });
    } else fails.push(`${tag}: no Finances button`);
    if (errs.length) fails.push(`${tag}: page errors ${errs.slice(0, 2).join(' | ')}`);
    console.log(tag, JSON.stringify(navCheck), JSON.stringify(sections));
    await ctx.close();
  }
}
console.log('FAILS', fails.length, '\n' + fails.join('\n'));
await b.close();
