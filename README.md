# AMBAR Orlando Market Landscape

Static, single-folder site. Open `index.html` directly (works offline, except map tiles) or host the folder anywhere.

Marriott brands are the main focus (AMBAR is part of the Marriott family); key non-Marriott upper-upscale and luxury hotels are included for a fuller picture. The Marriott Brand Matrix section stays Marriott-only.

## Structure
- `index.html`: page shell
- `assets/css/styles.css`, `assets/js/app.js`: design and rendering. All content comes from `data/comps.json`
- `assets/ambar-logo.png`: AMBAR logo cropped from Callum's brand graphic
- `assets/fonts/`: self-hosted Cormorant Garamond + DM Sans (SIL OFL)
- `assets/vendor/`: Chart.js 4.4.4 and Leaflet 1.9.4, bundled so the page needs no CDN
- `data/comps.json`: the single source of truth. `data/comps.js` is an auto-generated mirror so that `file://` opening works

## Adding a new week
1. Drop the new brief into `../briefs/` as `marriott-orlando-brief-week-of-YYYY-MM-DD.md` (same format as the existing ones).
2. Run `python3 update_data.py` (or `python3 update_data.py path/to/brief.md`).
3. The script replaces that week's rates and news, keeps the curated sections (hotels, brands, demand context, market), and records any missing Monday as a gap.
4. Optional: add that week's events under `context["YYYY-MM-DD"]` in `comps.json` and update `looking_ahead`/`market`, then re-run the script so `comps.js` is regenerated.

Status values: `OK` (rate shown), `UNAVAILABLE` (no offer for a one-night search), `NOT_COLLECTED` (calendar returned no prices / hotel not yet in the landscape).

## Residences · The week ahead (estimates engine)

For each AMBAR floor plan (S1 Studio, A1–A4 1 Bedroom, B1–B3 2 Bedroom, C1 3 Bedroom), this section shows an **estimated** ADR and RevPAU for the current comp week, with the range, the comp count, a confidence label, an "as of" date, a **vs. document base scenario** comparison, and an expandable cost breakdown and rendering taken from the AMBAR Residence Cards.

### Data source and mapping (mode `hotel_median`, live)
The comparables are the site's own weekly comparable hotel rates in `data/comps.json`, the same data as the Week ahead grid. Those are lowest public standard-room rates with unspecified room types, so:
1. Each hotel contributes **one** figure: the median of its priced nights for the latest collected week. Hotels with fewer than `min_priced_nights` (2) priced nights are excluded.
2. These are de-duplicated, stale records are dropped, and outliers are trimmed by IQR (k = 1.5).
3. The **comp-set median** (or a trimmed mean below 5 hotels) is the **Studio-equivalent baseline**. The P25–P75 range comes from the same set. The mean is a diagnostic, and the week is flagged when mean and median differ by more than 10%.
4. Each plan's ADR is `baseline × realization(type) × position_index(type) × ratio_to_S1(plan)`. The ratio is the document base ADR ÷ the S1 base ADR (338, 409, 449, 504, 510, 589, 552, 552, 658), and the same factor applies to the range.
5. `RevPAU = ADR × occupancy(plan)`, using a **size-based step-down anchored on the Studio**: `Occ(plan) = occ_studio × (1 − d) ^ size_units` with `size_units = bedrooms + den_weight × has_den` (Studio 0, 1 Bed 1, 1 Bed + Den 1.5, 2 Bed 2, 2 Bed + Den 2.5, 3 Bed 3). Defaults in `assumptions.json > occupancy_model`: `occ_studio` 0.79 (the document's S1 figure), `d` 0.04 and `den_weight` 0.5, with the last two **proposed, adjustable**. That gives S1 79.0%, A1 75.8%, A2–A4 74.3%, B2/B3 72.8%, B1 71.3% and C1 69.9%. Each card shows the document's own occupancy next to it as "document base". The document's net and cap-rate figures in the cost breakdown are its base scenario and are not recomputed.
6. Labels: only S1 says "based on N comparable Orlando hotels (median)". Every other plan says "scaled from the comp median using AMBAR floor-plan ratios", and its confidence is one step lower than the baseline's (High → Medium → Low). No plan is ever presented as directly observed.
7. "Vs. document base scenario" is the estimated ADR ÷ the document base ADR − 1. Because the plan ratios come from the same document, the percentage is the same for every plan while realization and position index are equal across types.

`realization` and `position_index` stay at **1.00** and are marked NEEDS_INPUT in `data/week_ahead/assumptions.json`. There is no seasonality adjustment, because the weekly rates already carry demand.

### Automatic weekly update
The estimates are regenerated from the same comp data in three ways:
- **`update_data.py`** (the normal weekly rate update) calls `update_week_ahead.py` at the end, so one run updates `data/comps.json`, `data/comps.js`, `data/week_ahead.json` and `data/week_ahead.js` together. Commit all four.
- **GitHub Action** `.github/workflows/week-ahead.yml`: on any push to `main` that changes `data/comps.json` (or the engine or assumptions), it runs the tests, regenerates the week-ahead files and commits them if they changed. This catches hand edits to `comps.json`. On pull requests it runs the tests plus `update_week_ahead.py --check`.
- **Browser guard:** the section also loads `data/comps.json`. If its latest collected week is newer than the week the estimates were built from, it shows "Comparable rates updated for week of …; estimates refresh on the next build" instead of silently showing an old week.

Manual run: `python3 update_week_ahead.py` (latest week), `--week YYYY-MM-DD` (a specific week), or `--check` (exits 1 if the files are stale). Tests: `python3 -m unittest discover -s tests -t . -v`.

### Files
- `week_ahead/engine.py`: the calc chain (`run_hotel_median` for the live mode; `run` for a future per-unit-type feed).
- `data/week_ahead/assumptions.json`: every tunable input.
- `data/week_ahead/units.json`: floor-plan specs and owner economics transcribed from *AMBAR Residence Cards — Complete Collection* (AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026). The tests reconcile them with the document's own maths.
- `assets/residences/*.jpg`: renderings from the same document.
- `update_week_ahead.py`, `assets/js/week-ahead.js`, `assets/css/week-ahead.css`.

### Optional upgrade: a per-unit-type STR feed (mode `unit_type_feed`)
Hotel standard rooms are a proxy. For a true like-for-like feed, drop per-unit-type vacation-rental comps into a CSV and run `python3 update_week_ahead.py --feed data/week_ahead/comps_feed.csv --as-of YYYY-MM-DD --live`. The format is shown in `data/week_ahead/comps_feed.sample.csv`, which is synthetic and is a format example only:
```
date,property,unit_type,bedrooms,sqft,rate,min_stay,is_booked
```
`unit_type` is studio, 1br, 2br or 3br. `is_booked=true` marks a realized ADR, and realization applies to listed rates only. In this mode types are segmented, and types with fewer than 4 comps are gap-filled from the best-supported type and labelled Derived. Possible sources: AirDNA, KeyData (booked data, best for calibrating realization), PriceLabs, Transparent or Lighthouse, or a manual weekly pull of about 8–10 comps per type.

Securities counsel should review the section wording before any of it goes into broker or investor materials, since AMBAR may involve a fund or tokenized structure and live revenue estimates can be forward-looking statements.
