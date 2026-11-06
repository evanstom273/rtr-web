// The match UI sweep (run before calling match UI work done): with the dev server on :5173,
//   node scripts/ui-sweep.mjs <screenshot dir> [skin]
// The sweep: every builder kind × phone and fold × three skins. Random match must fill every team and leave the
// bell on screen; then tag, triple, Rumble and singles go through the tape into the match, and the log and dock
// have to be properly visible. Failures are listed; screenshots go in qa/.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const SP = process.argv[2];
const URL = process.env.SWEEP_URL ?? 'http://localhost:5173/';
const ONLY = process.argv[3]; // optional skin
const VIEWS = { phone: { width: 412, height: 915 }, fold: { width: 945, height: 980 } };
const KINDS = ['Singles', 'Tag team', 'Tornado tag', 'Handicap', 'Elimination tag', 'Triple threat', 'Fatal four-way', 'Multi-man', 'Battle royal', 'Rumble', 'Gauntlet'];
const PLAY = new Set(['Singles', 'Tag team', 'Triple threat', 'Rumble']);
const fails = [];
const b = await chromium.launch();
for (const skin of ['broadcast', 'paper', 'building'].filter((s) => !ONLY || s === ONLY)) {
  for (const [vn, vp] of Object.entries(VIEWS)) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vn === 'phone', hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const wait = (ms) => p.waitForTimeout(ms);
    await p.goto(URL); await wait(1500);
    await p.evaluate((s) => localStorage.setItem('rtr-skin', JSON.stringify(s)), skin);
    for (const kind of KINDS) {
      const tag = `${skin}/${vn}/${kind}`;
      await p.goto(URL); await wait(1500);
      await p.getByRole('button', { name: /play a match|make a match/i }).first().click(); await wait(900);
      if (!(await p.locator('select').filter({ has: p.locator('option', { hasText: 'Rumble' }) }).count())) { await p.locator('.bd-sum').first().click(); await wait(300); }
      const type = p.locator('select').filter({ has: p.locator('option', { hasText: 'Rumble' }) }).first();
      if (!(await type.count())) { fails.push(`${tag}: no Type select`); continue; }
      await type.selectOption({ label: kind }); await wait(300);
      await p.getByRole('button', { name: /^random match$/i }).first().click(); await wait(500);
      const st = await p.evaluate(() => {
        const start = document.querySelector('.bd-start');
        const r = start?.getBoundingClientRect();
        const teams = [...document.querySelectorAll('.bd-team')].map((t) => t.querySelectorAll('.bd-member').length);
        const spill = [...document.querySelectorAll('.bd-rules, .bd-rules .bd-row')].filter((e) => e.scrollWidth > e.clientWidth + 2).map((e) => e.className);
        const ro = document.querySelector('.bd-roster')?.getBoundingClientRect(), ft = document.querySelector('.bd-foot')?.getBoundingClientRect();
        const lastTool = [...document.querySelectorAll('.bd-roster > *')].map((e) => e.getBoundingClientRect().bottom).reduce((a, b) => Math.max(a, b), 0);
        const overlap = !!ft && !!ro && (Math.min(ro.bottom, lastTool) > ft.top + 1) && window.innerWidth < 700;
        return { spill, overlap, ok: document.querySelector('.bd-status')?.className.includes('ok'), status: document.querySelector('.bd-status')?.textContent, disabled: start?.disabled,
          inView: !!r && r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.height > 20, bottom: r?.bottom, vh: window.innerHeight, teams };
      });
      if (!st.ok) fails.push(`${tag}: random didn't make a ready match — "${st.status}" teams ${JSON.stringify(st.teams)}`);
      if (!st.inView) fails.push(`${tag}: bell off screen (bottom ${Math.round(st.bottom)} of ${st.vh})`);
      if (st.spill.length) fails.push(`${tag}: rules spill sideways (${st.spill.join(', ')})`);
      if (st.overlap) fails.push(`${tag}: the roster's search and filters draw over the buttons`);
      if (kind === 'Rumble' || kind === 'Tag team') await p.screenshot({ path: `${SP}/builder-${skin}-${vn}-${kind.replace(/ /g, '')}.png` });
      if (!PLAY.has(kind) || !st.ok || !st.inView) continue;
      await p.locator('.bd-start').click(); await wait(900);
      let picked = '';
      if (kind === 'Tag team') {
        const picks = await p.locator('.tp-corner.you .tp-pick').count();
        if (picks !== 2) fails.push(`${tag}: tape shows ${picks} of your team to pick from`);
        else {
          picked = ((await p.locator('.tp-corner.you .tp-pick').nth(1).textContent()) ?? '').replace(/^\(c\)\s*/, '').replace(/\s*\((f|h)\).*$/, '').replace(/starts$/, '').trim();
          await p.locator('.tp-corner.you .tp-pick').nth(1).click(); await wait(300);
        }
        await p.screenshot({ path: `${SP}/tape-${skin}-${vn}.png` });
      }
      const go = p.locator('.tape-go');
      void picked;
      const gr = await go.boundingBox();
      if (!gr || gr.y + gr.height > vp.height + 1) fails.push(`${tag}: tape bell off screen`);
      await go.click(); await wait(3000);
      const m = await p.evaluate(() => {
        const log = document.querySelector('#log')?.getBoundingClientRect(), dock = document.querySelector('#dock')?.getBoundingClientRect();
        const S = window.__rtr?.state;
        const wideM = document.querySelector('#match');
        return { sideways: wideM ? wideM.scrollWidth > wideM.clientWidth + 2 : false, log: log ? Math.round(log.height) : 0, logTop: log ? Math.round(log.top) : 0, dockBottom: dock ? Math.round(dock.bottom) : 0, vh: window.innerHeight,
          starter: S ? S.sides[S.player ?? 'you']?.w.name : null, legal: S ? S.order.filter((k) => S.sides[k].legal).map((k) => S.sides[k].w.name) : [] };
      });
      if (picked && m.starter !== picked) fails.push(`${tag}: picked ${picked} to start, but ${m.starter} started`);
      const minLog = vn === 'phone' ? 140 : 120;
      if (m.log < minLog) fails.push(`${tag}: log only ${m.log}px tall`);
      if (m.dockBottom > m.vh + 1) fails.push(`${tag}: controls off screen (dock bottom ${m.dockBottom} of ${m.vh})`);
      if (m.sideways) fails.push(`${tag}: match screen wider than the screen`);
      await p.screenshot({ path: `${SP}/match-${skin}-${vn}-${kind.replace(/ /g, '')}.png` });
      console.log(tag, JSON.stringify(m));
    }
    if (errs.length) fails.push(`${skin}/${vn}: page errors ${JSON.stringify(errs.slice(0, 3))}`);
    await ctx.close();
  }
}
console.log('FAILS', fails.length); for (const f of fails) console.log(' -', f);
await b.close();
