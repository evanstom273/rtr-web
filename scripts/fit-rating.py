"""Fit the match-rating curve (RATING_CURVE in src/career/tuning.ts) to Lyra's targets.

Mirrors ratingDims/ratingComposite in src/engine/rating.ts (keep them in step). Make a corpus first:
  for s in 21 22 23 24; do npx vite-node scripts/rating-corpus.ts 12500 $s d$s.jsonl & done; wait
  python3 scripts/fit-rating.py d2*.jsonl
Then copy the printed knots into RATING_CURVE.at."""
import os
# Live values (SWING and BD are experiments left at 0; see docs/career-world.md, Match ratings).
SWING = float(os.environ.get('SWING', '0')); SWING_CAP = float(os.environ.get('SWING_CAP', '0'))
REV_CAP = float(os.environ.get('REV_CAP', '0.45')); BIG = float(os.environ.get('BIG', '0.06'))
BD = float(os.environ.get('BD', '0')); BD_CAP = float(os.environ.get('BD_CAP', '0'))
import json, math, sys, glob
from collections import defaultdict

rows = []
for f in sys.argv[1:]:
    for line in open(f):
        if line.strip():
            rows.append(json.loads(line))
print('matches', len(rows))

sat = lambda x, k: 1 - math.exp(-max(0, x) / k)
clamp = lambda v, a, b: max(a, min(b, v))

def dims(f):
    crowd_raw = clamp((f['avg'] - 25) / 35, 0, 1.2) + (0.35 if f['peak'] >= 95 else 0.25 if f['peak'] >= 85 else 0.1 if f['peak'] >= 75 else 0)
    crowd = clamp(crowd_raw / 1.55, 0, 1)
    story = clamp(((0.3 if f['heatSeg'] else 0) + (0.5 if f['comeback'] else 0) + (0.25 if f['limbN'] >= 5 else 0) + (0.35 if f['payoff'] else 0) + min(SWING_CAP, f['counters'] * SWING)) / (1.4 + SWING_CAP), 0, 1)
    drama_raw = (min(0.7, f['nf'] * 0.15) + min(0.7, f['fk'] * 0.35) + min(0.5, f['finRev'] * 0.25) + min(REV_CAP, f['reversals'] * 0.05)
                 + min(0.3, f['counters'] * 0.08) + min(BD_CAP, f.get('bigHits', 0) * BD) + min(0.4, f['ropeBreaks'] * 0.2) + min(0.6, f['stip']))
    drama = sat(drama_raw, 1.1)
    m = f['mins']
    craft = 0.5
    if f['byFin'] and m >= 10: craft += 0.25
    if f['byFin'] and f['afterFk']: craft += 0.15
    if f['byFlash'] and m >= 12: craft += 0.1
    if f['how'] == 'sub' and f['payoff']: craft += 0.1
    if f['how'] == 'stip' and m >= 10: craft += 0.15
    if f['how'] == 'sub' and m >= 10 and not f['byFin']: craft += 0.1
    craft += -0.4 if m < 6 else -0.15 if m < 10 else 0.15 if m <= 28 else 0 if m <= 35 else -0.1
    craft -= min(0.4, f['repeats'] * 0.08) + max(0, f['rest'] - 3) * 0.06
    if f['how'] == 'countout': craft -= 0.25
    if f['how'] == 'dq': craft -= 0.3
    craft = clamp(craft, 0, 1)
    hard = min(0.6, (f['tableBreaks'] * 2 + f['weaponHits'] + f['bleeds'] * 1.5) * 0.08)
    spect = sat(min(0.3, f['high'] * 0.06) + min(0.3, f.get('bigHits', 0) * BIG) + (0.1 if f['spots'] > 0 else 0) + hard, 0.45)
    return {'crowd': crowd, 'story': story, 'drama': drama, 'craft': craft, 'spectacle': spect}

W = {'crowd': 1.2, 'story': 1.0, 'drama': 1.1, 'craft': 0.9, 'spectacle': 0.8}

def composite(d):
    best = sorted(d.items(), key=lambda kv: kv[1] * W[kv[0]], reverse=True)[:4]
    return sum(v * W[k] for k, v in best) / sum(W[k] for k, _ in best)

def style(r):
    cls = set(r['ca']) | set(r['cb'])
    if r['stip'] in ('no_dq', 'falls_count_anywhere', 'tables', 'ladder', 'steel_cage', 'last_man_standing', 'i_quit'): return 'hardcore/stip'
    if 'HIGH_FLYER' in r['ca'] and 'HIGH_FLYER' in r['cb']: return 'high-flyer'
    if 'TECHNICIAN' in r['ca'] and 'TECHNICIAN' in r['cb'] and 'HIGH_FLYER' not in cls: return 'technical'
    if 'POWERHOUSE' in r['ca'] and 'POWERHOUSE' in r['cb']: return 'powerhouse'
    if 'STRIKER' in r['ca'] and 'STRIKER' in r['cb']: return 'striker'
    if 'HARDCORE' in cls: return 'brawler'
    return 'mixed'

for r in rows:
    r['d'] = dims(r['f'])
    r['c'] = composite(r['d'])

cs = sorted(r['c'] for r in rows)
def q(p): return cs[min(len(cs) - 1, int(p * (len(cs) - 1)))]
KQ = [0.0, 0.001, 0.02, 0.10, 0.30, 0.50, 0.75, 0.88, 0.98, 0.999, 1.0]
KS = [0.25, 0.5, 1.25, 2.0, 2.5, 3.0, 3.5, 3.875, 4.375, 4.875, 5.25]
knots = [round(q(p), 4) for p in KQ]
print('knots (composite → stars):', list(zip(knots, KS)))

def curve(c):
    if c <= knots[0]: return KS[0]
    for i in range(1, len(knots)):
        if c <= knots[i]:
            a, b = knots[i - 1], knots[i]
            t = 0 if b == a else (c - a) / (b - a)
            return KS[i - 1] + t * (KS[i] - KS[i - 1])
    return KS[-1]

def stars(r):
    s = curve(r['c']) + (0.05 if r['f']['title'] else 0) + (0.1 if r['f']['big'] else 0)
    return clamp(round(s * 4) / 4, 0.25, 5)

for r in rows: r['s'] = stars(r)
ss = sorted(r['s'] for r in rows)
n = len(ss)
pct = lambda k: 100 * k / n
print(f"new: median {ss[n // 2]} · 4★+ {pct(sum(1 for s in ss if s >= 4)):.1f}% · 4.5★+ {pct(sum(1 for s in ss if s >= 4.5)):.2f}% · 5★ {pct(sum(1 for s in ss if s >= 5)):.3f}% ({sum(1 for s in ss if s >= 5)} of {n})")
old = sorted(r['stars'] for r in rows)
print(f"old: median {old[n // 2]} · 4★+ {pct(sum(1 for s in old if s >= 4)):.1f}% · 4.5★+ {pct(sum(1 for s in old if s >= 4.5)):.2f}% · 5★ {pct(sum(1 for s in old if s >= 5)):.3f}%")
hist = defaultdict(int)
for s in ss: hist[s] += 1
print('histogram:', ' '.join(f"{k}:{pct(v):.1f}" for k, v in sorted(hist.items())))

by = defaultdict(list)
for r in rows: by[style(r)].append(r)
print('\nstyle            n     median  4★+    4.5★+   5★   best-4 drops (crowd/story/drama/craft/spect)')
for k, rs in sorted(by.items(), key=lambda kv: -len(kv[1])):
    s = sorted(x['s'] for x in rs)
    m = len(s)
    drops = defaultdict(int)
    for x in rs:
        worst = min(x['d'].items(), key=lambda kv: kv[1] * W[kv[0]])[0]
        drops[worst] += 1
    print(f"{k:15s} {m:6d}  {s[m // 2]:5}  {100 * sum(1 for v in s if v >= 4) / m:5.1f}%  {100 * sum(1 for v in s if v >= 4.5) / m:5.2f}%  {sum(1 for v in s if v >= 5):3d}   " + '/'.join(str(round(100 * drops[d] / m)) for d in ['crowd', 'story', 'drama', 'craft', 'spectacle']))
for k in ['played', 'indie']:
    for val in (True, False):
        s = sorted(r['s'] for r in rows if r[k] == val)
        if s: print(f"{k}={val}: n {len(s)} median {s[len(s)//2]} 4★+ {100*sum(1 for v in s if v>=4)/len(s):.1f}% 4.5★+ {100*sum(1 for v in s if v>=4.5)/len(s):.2f}%")
bands = defaultdict(list)
for r in rows: bands[(r['ov'] // 5) * 5].append(r['s'])
print('by ability (avg attribute):', ' '.join(f"{b}:{sorted(v)[len(v)//2]}/{100*sum(1 for x in v if x>=4)/len(v):.0f}%" for b, v in sorted(bands.items()) if len(v) > 50))
