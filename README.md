# Cronofree

A local-first food and training log that runs on your phone as an installable app and syncs with your own computer. No account, no subscription, no data leaving devices you control.

It takes the best of the big trackers (MyFitnessPal, Cronometer, MacroFactor, Lose It!, Carbon, Yazio, FatSecret) for **food**, and re-implements every feature of [LiftLog](https://liftlog-dhruv.netlify.app/) for **lifting**, in one interface designed for a phone at a kitchen counter or on a gym floor, with a proper desktop layout too.

---

## Quick start

```bash
npm install
npm start          # builds the app and starts the server on http://localhost:8787
```

The server prints something like:

```
  This computer:  http://localhost:8787
  Your phone:     http://192.168.1.20:8787
  Pairing token:  H62-rfYdA4FM
```

1. On your phone (same Wi-Fi) open the phone URL, then **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).
2. Go through the 3-step setup, or tap **"Already using Cronofree on another device? Pair this one"** and paste the token.
3. On every device, **You → Sync**: paste the token. Leave the server URL blank when the app was opened from the server's own address.

That's it. Log anywhere, offline or not. Changes merge whenever a device can reach the server (on launch, when you come back to the app, when you get back online, and every few minutes).

### Development

```bash
npm run dev        # Vite dev server on :5173 (proxies /api to :8787)
npm run serve      # just the sync server (no build)
npm test           # unit tests for the nutrition, energy, lifting and food-source maths
npm run typecheck
```

### Where the data lives

- **On each device:** IndexedDB (via Dexie). Photos are compressed JPEGs stored inline.
- **On your computer:** `server/data/store.json`, one JSON document, written atomically. Back it up like any file.
- **Backups:** You → Your data → *Download backup* gives you a full JSON snapshot; *Restore* merges it back (newer records win). *Export diary (CSV)* for spreadsheets.

### Reaching the server from outside your Wi-Fi

The server is plain HTTP, which is fine on your LAN. To use it from anywhere, put it behind anything that gives you HTTPS: [Tailscale](https://tailscale.com) (`tailscale serve 8787` gives you a `https://…ts.net` URL with a valid certificate), Cloudflare Tunnel, or a small VPS with Caddy. The app is a static build, so you can also host `dist/` on Netlify (config included) and point **You → Sync → Server URL** at your tunnel address.

> Note on offline installs: browsers only register the offline service worker on `https://` or `localhost`. Over plain LAN HTTP the app still installs to the Home Screen and stores everything locally, but needs the server reachable to launch. Use Tailscale Serve or a Netlify deploy for true offline launch on the phone.

---

## What it does

### Food
| | |
|---|---|
| **Diary** | Meals (rename or add your own), calorie ring with remaining budget, protein/carbs/fat bars, per-meal totals, fiber, net carbs, sodium at a glance, week strip and calendar jump. |
| **Search** | One box searches your saved foods, the 175-item starter library (USDA reference values), **USDA FoodData Central** (whole foods with full micronutrients, free key optional) and **Open Food Facts** (packaged products). Results you log are cached locally so they work offline and sync to your other devices. |
| **Barcode scanner** | Camera scanning with the native `BarcodeDetector` (Android/Chrome) or ZXing (iOS Safari). Unknown barcodes go straight into *New food* with the code pre-filled. |
| **Portions** | Real household servings from USDA (1 cup, 1 medium, 1 slice…), package and serving sizes from Open Food Facts, plus custom grams/mL. Quantity stepper with ½ steps. |
| **Custom foods** | Copy a nutrition label per serving; the app derives per-100 g. Full vitamin/mineral fields, multiple serving sizes, liquids in mL. |
| **Recipes** | Ingredients from any source, servings it makes, optional cooked weight. Logged by the serving, the whole recipe, or by grams. Editing a recipe updates its nutrition everywhere going forward. |
| **Saved meals** | Turn any meal into a one-tap bundle. |
| **Quick add** | Calories or macros without a food (calories are computed from macros if left blank). |
| **Copy** | Copy a meal from yesterday or any of the last 7 days; copy a whole day. |
| **Recents / Frequent / Favorites / My foods** | Every list the big apps have, without the paywall. |
| **Micronutrients** | Cronometer-style report: 36 nutrients incl. fibre, sugars, added sugar, sat/mono/poly/trans fat, omega-3, cholesterol, sodium, potassium, calcium, iron, magnesium, phosphorus, zinc, selenium, vitamins A, C, D, E, K, B1, B2, B3, B6, B12, folate, choline, caffeine, alcohol, water. Targets are the adult DRIs for your sex and age; limit nutrients use the Dietary Guidelines. Missing data shows as missing, never as zero. |
| **Water** | One-tap glasses with a goal, in mL or fl oz. |
| **Fasting timer** | 12/14/16/18/20/24 h windows, runs in the background, history and average length. |
| **Exercise calories** | Optional entries that widen the day's budget. |

### Goals and adaptive targets
- Onboarding estimates maintenance with **Mifflin-St Jeor** and builds macros (protein by body weight, fat ~27 %, carbs fill).
- **Adaptive expenditure** (the MacroFactor idea): from your logged intake and the smoothed weight trend over a rolling 21-day window it estimates your *real* TDEE, shrinks toward the formula when logging is patchy, and reports confidence.
- **Weekly check-in** on Trends → Weight: one tap applies the recommended calories, keeping protein fixed and letting carbs absorb the change.
- Goal type and rate, target weight with ETA, formula / adaptive / manual expenditure modes.
- Targets in grams or percentages, **different targets per weekday** (calorie cycling / training days), and per-day overrides.

### Body
- Daily weigh-ins with an exponentially smoothed **trend weight** (like Happy Scale / MacroFactor) and 2-week rate vs goal.
- Ten tape measurements with charts.
- Progress photos: first-vs-latest comparison and an evenly spaced timeline, attachable to workouts.

### Insights (Trends)
- Calories by day coloured by adherence, macro lines, 7/14/30/90-day averages, days within ±10 %.
- Nutrient report averaged over logged days against your targets.

### Train (LiftLog, rebuilt)
Everything the original does, redesigned:
- **Programs** with days, templates (the original Chest/Back · Legs · Shoulders/Arms split, Beginner full-body, Upper/Lower, PPL), active program, drag-free reorder, rename, delete.
- **Exercise library** (33 built in) with muscle group, progression scheme (heavy / to failure / by feel), rep range, default sets, weight increment, notes; create your own.
- **Workout flow**: pick today's day, one exercise at a time with a stepper, sets with weight/reps/RPE, tap-to-fill **smart target** (LiftLog's rules: +1 rep until the top of the range, then add the increment), last session, PR badge, **plateau warning** (flat e1RM across 3 sessions over ≥14 days), copy previous set, add/remove sets, add exercises mid-workout, auto-complete on blur, **rest timer** with chime + vibration (longer rest for heavy lifts), elapsed time, session notes, photos, and an auto-saved draft that survives closing the app.
- **History** with search, per-exercise PR highlighting, delete.
- **Stats**: e1RM (Epley) / top weight / volume per exercise, weekly volume over 12 weeks, sets per muscle group this week, week streak.
- kg ↔ lb switch converts logged weights.

### Sync
- Every write lands in IndexedDB and an outbox; `POST /api/sync` pushes the outbox and pulls everything newer than the last server sequence. Conflicts resolve last-writer-wins; deletes are tombstones, so nothing resurrects.
- Single-file Node server (`server/index.mjs`, Express), bearer-token auth, serves the built app on the same origin. Change the port with `PORT`, the token with `CRONOFREE_TOKEN`, the data folder with `CRONOFREE_DATA_DIR`.

---

## Meta-review: what each app does best, and where it ended up here

| App | Best at | In Cronofree |
|---|---|---|
| **MyFitnessPal** | Enormous food database, barcode scanning, recipes, meals, copy yesterday, quick add, streak-friendly diary | Open Food Facts + USDA search, barcode scanner, recipes, saved meals, copy meal/day, quick add. Per-weekday goals and net carbs are premium in MFP; free here. |
| **Cronometer** | Micronutrient depth with DRI targets, verified USDA data, fasting timer, biometrics, nutrient report | 36-nutrient report with DRI targets on every day and averaged over any range, USDA whole foods as a first-class source, fasting timer, weight/measurements. |
| **MacroFactor** | Adaptive expenditure from intake + weight trend, weekly check-in that updates targets, trend weight, fast logging | Same energy-balance approach with a rolling window and confidence shrinkage, weekly check-in with one-tap apply, EMA trend weight, keyboard-first food detail with big kcal and tap-to-add. |
| **Lose It!** | Simple budget framing, water, patterns | Calorie budget ring with "left/over", water glasses, adherence stats. |
| **Carbon / RP** | Coaching-style adjustments, refeeds, calorie cycling | Weekday targets for cycling, adaptive weekly adjustments. |
| **Yazio / Lifesum** | Fasting plans, pleasant UI | Fasting presets and history; the UI is designed, not templated. |
| **FatSecret** | Free forever, exports | Free, JSON + CSV export, self-hosted sync. |
| **LiftLog** | The lifting logic: smart targets, plateau detection, drafts, PRs | Ported function-for-function; UI rebuilt. |

### What was deliberately left out
- Social feeds, community food entries (quality problems), streak gamification, AI photo-to-calories (accuracy too poor to be worth the plumbing), and any cloud account.

---

## Architecture

```
src/
  db/            Dexie schema, typed rows, write helpers (stamp + outbox)
  lib/
    nutrients.ts   nutrient model, DRI reference targets
    seedFoods.ts   starter library (USDA reference values)
    foodSources.ts Open Food Facts + USDA adapters → per-100 g Food rows
    foodRepo.ts    search ranking, logging, custom foods, recipes, saved meals
    energy.ts      Mifflin-St Jeor, targets, EMA weight trend, adaptive expenditure
    checkin.ts     weekly check-in model
    lifting.ts     e1RM, history, smart targets, plateau, PRs
    sync.ts        outbox sync engine, export/import
  features/      diary · foods · train · trends · you · onboarding
  components/    UI kit (sheets, rings, bars, charts, toasts)
server/index.mjs  sync API + static hosting
tests/            node:test suites for the maths
```

Stack: React 19, TypeScript, Vite 7, Tailwind 4, Dexie 4, Recharts, ZXing, vite-plugin-pwa, Express 5. Fonts: Bricolage Grotesque (display) and Instrument Sans (UI), self-hosted.

### Data notes
- Starter foods use USDA SR Legacy / Foundation values per 100 g, and typical label values for generic packaged items (chips, protein bar, energy drink…). Treat generic items as estimates; scan the real product for exact numbers.
- Vitamin D from USDA IU is converted to µg (÷40). Open Food Facts sodium falls back to salt × 0.4 when sodium is missing.
- Reference targets: NIH DRIs (RDA/AI) for adults, fibre at 14 g per 1,000 kcal, added sugar and saturated fat at 10 % of energy, sodium 2,300 mg.
