# Match of the Night

A wrestling match game for people who rate matches. Win the bout and steal the show: every match
gets a star rating out of five. It's built mobile-first and plays best on a phone.

Vite + React + TypeScript (strict), with Vitest for tests. No backend: the build is a folder of
static files, served from Cloudflare.

## Local development

You'll need Node 22 (see `.node-version`).

```sh
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests + headless simulation
npm run typecheck  # tsc, strict
npm run build      # static build into dist/
npm run preview    # serve dist/ locally
npm run sim -- 500 # print match-length / finish / star distributions from 500 AI-vs-AI matches
```

## Deploying to Cloudflare

The site deploys as a static-assets-only **Cloudflare Worker**, configured in `wrangler.jsonc`.
`npx wrangler deploy` runs `npm run build` itself, then uploads `dist/`.

In the dashboard (**Workers & Pages → your project → Settings → Build**):

- **Build command:** leave empty, because Wrangler runs the build.
- **Deploy command:** `npx wrangler deploy`
- **Node version:** 22, picked up from `.node-version`

Every push to `main` redeploys. To deploy by hand from your machine, run `npx wrangler deploy`.

## Installing as an app (PWA)

The site is an installable Progressive Web App and works offline after the first visit.

- **Android / Chrome:** open the site, then menu → **Install app** (or accept the install prompt).
- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.

Updates download quietly in the background and apply the next time you open the app. A match in
progress is never interrupted. Icons are generated from `public/favicon.svg` with
`node scripts/make-icons.mjs`.

## Layout

```
src/
  engine/   all match rules, pure TypeScript: no DOM, React or timers
  data/     roster, moves, promotions, commentary and rating copy (typed data)
  ui/       React components; timing bars, kickout and submission overlays
  storage/  localStorage wrapper (greatest hits)
legacy/     the original single-file game, kept untouched as the reference
```

The engine exposes state and actions. When it needs something from the player (a timing bar, a
kickout, a submission struggle, or just a pause for pacing), it sets `state.pending` and waits.
The UI renders that, runs the interaction and hands the result back. All randomness goes through
an injectable seeded RNG, so any match can be replayed exactly.

See `NOTES.md` for porting decisions, things in the original that look off, and simulation results.
