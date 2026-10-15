# Rise to Relevance (web)

Rise to Relevance, on the web. It started as a port of the Godot game, which has since been
retired, so this is now the game. Right now it's the exhibition match: the full RtR roster (400
wrestlers, 11 promotions), the RtR match engine (positions, setups, six-part bodies, stamina and
exhaustion, the AI), contested d20 rolls for every move and setup with hands-on kickouts,
submissions and covers, a top-down ring view, and the Match of the Night crowd and star rating
on top. Built mobile-first; plays best
on a phone, and on a foldable's inner screen the ring view stays on screen.

The original design doc is `RISE_TO_RELEVANCE_GDD_TAD.md`; `NOTES.md` records where the web version
has gone its own way.

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
npm run sim        # match-length / finish / star distributions from AI-vs-AI matches

# regenerate src/data/rtr/*.json from the Godot project's .tres files
node scripts/import-godot.mjs /path/to/rtr-final-version
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

It follows the device orientation, so it works on foldables (cover and inner screen) and in
landscape. Updates download quietly in the background and apply the next time you open the app. A match in
progress is never interrupted. Icons are generated from `public/favicon.svg` with
`node scripts/make-icons.mjs`.

## Layout

```
src/
  engine/   all match rules, pure TypeScript: no DOM, React or timers
  data/rtr/ moves, wrestlers, promotions, titles — generated from the Godot project
  data/     commentary, labels and rating copy
  ui/       React: ring view, move wheel, cards, dice, overlays (cover, kickout, tug)
  storage/  localStorage wrapper (greatest hits, last picks)
legacy/     the original Match of the Night single-file game, kept as a reference
```

The engine exposes state and actions. When it needs something from the player (a contested roll,
a cover, a kickout, a submission struggle, or just a pause for pacing), it sets `state.pending` and waits.
The UI renders that, runs the interaction and hands the result back. All randomness goes through
an injectable seeded RNG, so any match can be replayed exactly.

See `NOTES.md` for porting decisions, things in the original that look off, and simulation results.
