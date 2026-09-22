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

### Offline food database

The repo ships `public/data/usda-pack.json`: **8,122 USDA foods** (SR Legacy + Foundation Foods) with per-100 g values for 60+ nutrients including amino acids, plus household portions with gram weights (1 medium banana 118 g, ½ breast 86 g, 1 cup cooked rice 158 g…). It installs into the phone's IndexedDB on first launch (about 1.2 MB over the wire) so search, the nutrient finder and recipes work with no network at all.

Rebuild or extend it any time:

```bash
npm run usda              # SR Legacy + Foundation Foods
npm run usda -- --survey  # also FNDDS survey foods (~5,400 prepared dishes and restaurant-style items)
```

The script downloads the official FoodData Central releases, cleans portions, and writes the pack (and a pre-gzipped twin the server streams). Anything not in the pack is still one search away online, and packaged products come from Open Food Facts by barcode.

### Eat out: Berkeley campus + select SF, vegetarian only

Foods → **Eat out** (also a tab inside *Add food*) lists vegetarian orders from restaurants around UC Berkeley (Telegraph/Durant/Shattuck, Cal Dining halls, campus cafés) and select San Francisco spots, so a burrito bowl or a slice is one tap. Each item is labelled **published** (numbers from the restaurant's own nutrition info, with the source page in the item's note) or **estimated** (worked out from the menu description). Search also finds them by dish or restaurant ("chipotle sofritas", "cheese board").

The data lives in `data/restaurants/*.json` (one file per batch, plain JSON you can edit) and is merged by:

```bash
npm run restaurants   # validates vegetarian-ness and macro/calorie consistency, writes public/data/restaurants.json
```

The app installs the pack on launch and refreshes it whenever the file changes.

### Where the data lives

- **On each device:** IndexedDB (via Dexie). Photos are compressed JPEGs stored inline.
- **On your computer:** `server/data/store.json`, one JSON document, written atomically. Back it up like any file.
- **Backups:** You → Your data → *Download backup* gives you a full JSON snapshot; *Restore* merges it back (newer records win). *Export diary (CSV)* for spreadsheets.

### Free hosting on Netlify (with sync, no computer needed)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Dhruv123-123/cronofree)

1. Click the button (or in Netlify: *Add new site → Import an existing project → GitHub → cronofree*). The build settings come from `netlify.toml`; nothing to type.
2. In *Site configuration → Environment variables* add `CRONOFREE_TOKEN` = any long random string, then trigger a redeploy.
3. Open your `*.netlify.app` URL on your phone, add it to the Home Screen (it is HTTPS, so it works fully offline), and paste the token into **You → Sync** on every device. Leave the server URL blank.

Sync runs as a Netlify Function backed by Netlify Blobs, both on the free tier. Your data is one JSON blob in your own Netlify account; the recipe-from-URL importer works there too. You can still run `npm start` on your computer instead, or point the app at that server by URL.

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
| **Micronutrients** | Cronometer-style report: 60+ nutrients incl. 18 amino acids, copper, manganese, B5, omega-6, starch, fibre, sugars, added sugar, sat/mono/poly/trans fat, omega-3, cholesterol, sodium, potassium, calcium, iron, magnesium, phosphorus, zinc, selenium, vitamins A, C, D, E, K, B1, B2, B3, B6, B12, folate, choline, caffeine, alcohol, water. Targets are the adult DRIs for your sex and age; limit nutrients use the Dietary Guidelines. Missing data shows as missing, never as zero. |
| **Water** | One-tap glasses with a goal, in mL or fl oz. |
| **Fasting timer** | 12/14/16/18/20/24 h windows, runs in the background, history and average length. |
| **Exercise** | 80-activity MET database (Compendium of Physical Activities): pick an activity and minutes, calories from your body weight; or enter calories from a watch. Widens the day's budget. |
| **Nutrient finder** | Cronometer's "Oracle": rank every food on the device by any nutrient, per 100 kcal, per 100 g or per serving, filtered by category. |
| **Custom nutrient targets** | Override any DRI, and choose which nutrients appear as highlight tiles on Today. |
| **Multi-add** | Tick several recents or favourites and add them in one go. |
| **Per-meal targets** | Optional calorie split per meal, shown in each meal header. |
| **Day notes & Complete day** | Notes per day; "Complete day" shows MyFitnessPal's five-week projection from today's balance. |
| **Copy** | Copy a meal from any recent day, copy a meal to a future date, copy a whole day. |
| **Time stamps** | Every entry carries the time it was eaten; editable. |

### Goals and adaptive targets
- Onboarding estimates maintenance with **Mifflin-St Jeor** and builds macros (protein by body weight, fat ~27 %, carbs fill).
- **Adaptive expenditure** (the MacroFactor idea): from your logged intake and the smoothed weight trend over a rolling 21-day window it estimates your *real* TDEE, shrinks toward the formula when logging is patchy, and reports confidence.
- **Weekly check-in** on Trends → Weight: one tap applies the recommended calories, keeping protein fixed and letting carbs absorb the change.
- Goal type and rate, target weight with ETA, formula / adaptive / manual expenditure modes.
- Targets in grams or percentages, **different targets per weekday** (calorie cycling / training days), and per-day overrides.

### Body
- **Biometrics**: blood pressure, resting heart rate, HRV, sleep, steps, body fat, blood glucose, ketones, temperature, mood, energy, with charts.
- Daily weigh-ins with an exponentially smoothed **trend weight** (like Happy Scale / MacroFactor) and 2-week rate vs goal.
- Ten tape measurements with charts.
- Progress photos: first-vs-latest comparison and an evenly spaced timeline, attachable to workouts.

### Insights (Trends)
- Calories by day coloured by adherence, macro lines, 7/14/30/90-day averages, days within ±10 %.
- Any nutrient over time against its target; energy balance (intake vs expenditure) for 30 days.
- Calendar with logging streaks, adherence colouring and workout dots.
- Nutrient report averaged over logged days against your targets.

### Train (LiftLog, rebuilt)
Everything the original does, redesigned:
- **Programs** with days, templates (the original Chest/Back · Legs · Shoulders/Arms split, Beginner full-body, Upper/Lower, PPL), active program, drag-free reorder, rename, delete.
- **Exercise library** (33 built in) with muscle group, progression scheme (heavy / to failure / by feel), rep range, default sets, weight increment, notes; create your own.
- **Workout flow**: pick today's day, one exercise at a time with a stepper, sets with weight/reps/RPE, tap-to-fill **smart target** (LiftLog's rules: +1 rep until the top of the range, then add the increment), last session, PR badge, **plateau warning** (flat e1RM across 3 sessions over ≥14 days), copy previous set, add/remove sets, add exercises mid-workout, auto-complete on blur, **rest timer** with chime + vibration (longer rest for heavy lifts), elapsed time, session notes, photos, and an auto-saved draft that survives closing the app.
- **History** with search, per-exercise PR highlighting, delete.
- **Stats**: e1RM (Epley) / top weight / volume per exercise, weekly volume over 12 weeks, sets per muscle group this week, week streak.
- kg ↔ lb switch converts logged weights.

### Importing from the apps you're leaving
You → Your data → *Import*. Drop in MyFitnessPal's `Nutrition-Summary.csv` / `Measurement-Summary.csv` or Cronometer's `servings.csv` / `biometrics.csv` / `dailysummary.csv`; they become ordinary entries, weights and biometrics. Recipes can be imported from any recipe URL (schema.org data) with each ingredient matched to a food for you to confirm.

### Sync
- Every write lands in IndexedDB and an outbox; `POST /api/sync` pushes the outbox and pulls everything newer than the last server sequence. Conflicts resolve last-writer-wins; deletes are tombstones, so nothing resurrects.
- Single-file Node server (`server/index.mjs`, Express), bearer-token auth, serves the built app on the same origin. Change the port with `PORT`, the token with `CRONOFREE_TOKEN`, the data folder with `CRONOFREE_DATA_DIR`.

---

## Meta-review: what each app does best, and where it ended up here

| App | Best at | In Cronofree |
|---|---|---|
| **MyFitnessPal** | Enormous food database, barcode scanning, recipes, meals, copy yesterday, quick add, multi-add, exercise database, streaks, "complete diary" projection, per-meal goals, recipe importer | Offline USDA pack + Open Food Facts + live USDA search, barcode scanner, recipes (incl. from URL), saved meals, copy meal/day/to-date, quick add, multi-add, MET exercise database, calendar streaks, complete-day projection, per-meal calorie split. Per-weekday goals, net carbs and food time stamps are premium in MFP; free here. |
| **Cronometer** | Micronutrient depth (incl. amino acids) with DRI targets, custom targets, Oracle, verified USDA data, fasting timer, biometrics, nutrient trends, notes | 60+-nutrient report with DRI targets, custom targets and highlight tiles, nutrient finder, USDA whole foods offline, fasting timer, 11 biometric types with charts, nutrient-over-time charts, day notes, Cronometer CSV import. |
| **MacroFactor** | Adaptive expenditure from intake + weight trend, weekly check-in that updates targets, trend weight, fast logging | Same energy-balance approach with a rolling window and confidence shrinkage, weekly check-in with one-tap apply, EMA trend weight, keyboard-first food detail with big kcal and tap-to-add. |
| **Lose It!** | Simple budget framing, water, patterns | Calorie budget ring with "left/over", water glasses, adherence stats. |
| **Carbon / RP** | Coaching-style adjustments, refeeds, calorie cycling | Weekday targets for cycling, adaptive weekly adjustments. |
| **Yazio / Lifesum** | Fasting plans, pleasant UI | Fasting presets and history; the UI is designed, not templated. |
| **FatSecret** | Free forever, exports | Free, JSON + CSV export, self-hosted sync. |
| **LiftLog** | The lifting logic: smart targets, plateau detection, drafts, PRs | Ported function-for-function; UI rebuilt. |

### What was deliberately left out
- Social feeds and friends, community food entries (quality problems), AI photo-to-calories (accuracy too poor to be worth the plumbing), push-notification reminders (unreliable in installed web apps on iOS), automatic wearable sync (Apple Health, Garmin, Fitbit have no web APIs; import their CSVs or log biometrics by hand), kilojoule display, and any cloud account.

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
    exerciseDb.ts  MET activity database
    biometrics.ts  biometric kinds and formatting
    csv.ts / importers.ts   MyFitnessPal & Cronometer importers
    ingredientParse.ts / recipeImport.ts   recipe-from-URL
    usdaPack.ts    offline USDA pack installer
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
