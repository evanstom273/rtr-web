# Match of the Night

A wrestling match game for people who rate matches. Win the bout and steal the show: every match
gets a star rating out of five. It's built mobile-first and plays best on a phone.

Vite + React + TypeScript (strict), with Vitest for tests. No backend: the build is a folder of
static files.

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

## Deploying to Cloudflare Pages

1. Push the repo to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Use these build settings:
   - **Framework preset:** None (or Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** picked up from `.node-version` (22). If your build image ignores it, add the
     environment variable `NODE_VERSION=22`.
4. Save and deploy. Every push to the production branch redeploys, and other branches get preview URLs.

It's a single page with no client-side routes, so no redirects or `_routes.json` are needed.

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
