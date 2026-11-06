// The Life UI sweep (run before calling Life work done): with the dev server on :5173,
//   node scripts/life-sweep.mjs <screenshot dir> [skin]
// A star's career with money in the bank, in all three skins at phone and fold widths: the hub nav (seven tabs on two
// rows), the Life tab's three sections, buying a house on a mortgage, a car, hiring an agent, and Finances. Fails on
// page errors, sideways scrolling, nav labels that don't fit, and buys that don't land.
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
    await p.goto(URL); await wait(1500);
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
    await p.goto(URL); await wait(1500);
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
    const sections = { home: false, about: false, team: false, invest: false, school: false, money: false };
    sections.home = (await p.getByText(/you live in/i).count()) > 0;
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-home.png`, fullPage: true });
    // Buy a house on a mortgage.
    const house = p.locator('.c-ans').filter({ hasText: /^House/ }).filter({ has: p.getByRole('button', { name: /mortgage/i }) }).first();
    await house.getByRole('button', { name: /mortgage/i }).click(); await wait(500);
    const owned = await p.getByText(/what you own/i).count();
    if (!owned) fails.push(`${tag}: buying a house didn't land`);
    // Show it off: a party.
    await p.getByRole('button', { name: /^throw a party$/i }).click(); await wait(400);
    if (!(await p.getByText(/you showed off/i).count())) fails.push(`${tag}: showing off didn't land`);
    await p.getByRole('button', { name: /getting about/i }).click(); await wait(500);
    sections.about = (await p.getByText(/flying abroad/i).count()) > 0;
    await p.locator('.c-ans').filter({ hasText: /^Decent car/ }).first().getByRole('button', { name: /^cash$/i }).click(); await wait(500);
    if (!(await p.getByText(/your garage/i).count())) fails.push(`${tag}: buying a car didn't land`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-about.png`, fullPage: true });
    await p.getByRole('button', { name: /^your team$/i }).click(); await wait(500);
    sections.team = (await p.getByText(/personal staff/i).count()) > 0;
    await p.locator('.c-ans').filter({ hasText: /^Physio/ }).first().getByRole('button', { name: /^hire$/i }).click(); await wait(400);
    if (!(await p.locator('.c-ans').filter({ hasText: /^Physio ·/ }).count())) fails.push(`${tag}: hiring a physio didn't land`);
    await p.getByRole('button', { name: /your own theme/i }).click(); await wait(400);
    if (!(await p.getByText(/your own theme/i).count())) fails.push(`${tag}: buying a theme didn't land`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-team.png`, fullPage: true });
    // Invest: a gym for cash, money into the safe fund.
    await p.getByRole('button', { name: /^invest$/i }).click(); await wait(500);
    sections.invest = (await p.getByText(/stakes in promotions/i).count()) > 0;
    await p.locator('.c-ans').filter({ hasText: /^Gym in/i }).first().getByRole('button', { name: /^cash$/i }).click(); await wait(400);
    if (!(await p.getByRole('button', { name: /a second site/i }).count())) fails.push(`${tag}: buying a gym didn't land`);
    await p.locator('.c-kv').filter({ hasText: /safe fund/i }).first().getByRole('button', { name: /^put in/i }).click(); await wait(400);
    if (!(await p.getByText(/you put in/i).count())) fails.push(`${tag}: putting money in a fund didn't land`);
    const tabsCut = await p.evaluate(() => [...document.querySelectorAll('.c-steps .c-st')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent));
    if (tabsCut.length) fails.push(`${tag}: Life tabs cut ${tabsCut.join(',')}`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-invest.png`, fullPage: true });
    // School: open one, take an applicant.
    await p.getByRole('button', { name: /^school$/i }).click(); await wait(500);
    sections.school = (await p.getByText(/your own school/i).count()) > 0;
    await p.locator('.c-ans').filter({ hasText: /^Open one in/i }).first().click(); await wait(500);
    await p.getByRole('button', { name: /^applicants/i }).click(); await wait(300);
    await p.getByRole('button', { name: /^take them/i }).first().click(); await wait(300);
    await p.getByRole('button', { name: /^students$/i }).click(); await wait(300);
    if (!(await p.getByRole('button', { name: /^graduate$/i }).count())) fails.push(`${tag}: taking a student didn't land`);
    await p.screenshot({ path: `${SP}/${skin}-${vn}-life-school.png`, fullPage: true });
    await p.getByRole('button', { name: /^money$/i }).click(); await wait(500);
    if (!(await p.getByText(/the rich list/i).count())) fails.push(`${tag}: no rich list`);
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
    // Retire, see the Epilogue once, carry on into Life (stage 8).
    await p.evaluate(async () => {
      const { world } = window.__rtrDev;
      const c = world.activeWorld().career;
      c.people[c.player].retired = true; c.people[c.player].retiredOn = c.today; c.over = c.today;
      await world.saveWorld();
    });
    await p.goto(URL); await wait(1500);
    await p.locator('#menu button').filter({ hasText: /^(The career|Career)/i }).first().click(); await wait(1200);
    const carry = p.getByRole('button', { name: /carry on/i });
    if (!(await carry.count())) fails.push(`${tag}: no Carry on in the Epilogue`);
    else {
      await p.screenshot({ path: `${SP}/${skin}-${vn}-epilogue.png`, fullPage: true });
      await carry.click(); await wait(800);
      if (!(await p.getByRole('button', { name: /one night only/i }).count())) fails.push(`${tag}: carrying on didn't land in Life`);
      await p.screenshot({ path: `${SP}/${skin}-${vn}-retired.png`, fullPage: true });
    }
    if (errs.length) fails.push(`${tag}: page errors ${errs.slice(0, 2).join(' | ')}`);
    console.log(tag, JSON.stringify(navCheck), JSON.stringify(sections));
    await ctx.close();
  }
}
console.log('FAILS', fails.length, '\n' + fails.join('\n'));
await b.close();
