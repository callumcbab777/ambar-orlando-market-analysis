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
1. Each hotel contributes **one** figure: the median of its priced nights for the selected week. Hotels with fewer than `min_priced_nights` (2) priced nights are excluded.
2. These are de-duplicated, stale records are dropped, and outliers are trimmed by IQR (k = 1.5).
3. The **comp-set median** (or a trimmed mean below 5 hotels) is the **Studio-equivalent baseline**. The P25–P75 range comes from the same set. The mean is a diagnostic, and the week is flagged when mean and median differ by more than 10%.
4. Each plan's ADR is `baseline × realization(type) × position_index(type) × ratio_to_S1(plan)`. The ratio is the document base ADR ÷ the S1 base ADR (338, 409, 449, 504, 510, 589, 552, 552, 658), and the same factor applies to the range.
5. **Occupancy:**
   - **Historical base occupancy:** 73% for every plan (`assumptions.json > base_occupancy`). This is Callum's historical figure and replaces the document's per-plan 79–84% as the base.
   - **This week's occupancy:** a size-based step-down anchored on the Studio, `Occ(plan) = occ_studio × (1 − d) ^ size_units` with `size_units = bedrooms + den_weight × has_den`. `occ_studio` is a **separate setting** (currently 0.73, equal to the base), so the two can be decoupled later. `d` 0.04 and `den_weight` 0.5 are **proposed, adjustable**. That gives S1 73.0%, A1 70.1%, A2–A4 68.7%, B2/B3 67.3%, B1 65.9% and C1 64.6%.
   - `RevPAU = ADR × occupancy`.
6. **Base scenario per plan:** base ADR = the document base ADR, base occupancy = 73%, base RevPAU = base ADR × 73%. Each card shows **ADR vs base** and **RevPAU vs base** for the selected week. ADR vs base is the same % for every plan, because the ratios come from the same document. RevPAU vs base differs because of the step-down.
7. **Document figures:** the document's own cost breakdown, net and cap rate are shown unchanged and labelled as the document's. They were modeled at the document's original per-plan occupancy.
8. **Labels:** only S1 says "based on N comparable Orlando hotels". Every other plan says "scaled from the comp median using AMBAR floor-plan ratios", and its confidence is one step lower (High → Medium → Low).

`realization` and `position_index` stay at **1.00** and are marked NEEDS_INPUT. There is no seasonality adjustment.

### Week selection and automatic updates
- **Computed live in the browser.** The cards are computed in the browser by `assets/js/week-ahead-engine.js`, a line-for-line port of `week_ahead/engine.py`, straight from `data/comps.json` for the selected week. Nothing shown is precomputed, so a new weekly rate update (`update_data.py`) flows into the residence cards automatically, with no extra step.
- **Week selector.** The section has its own week selector listing every week in `comps.json`, defaulting to the latest. Weeks that weren't collected are shown disabled. It is also linked to the site's existing Week ahead tabs, so picking a week in either place updates the grid and every plan: ADR, range, occupancy, RevPAU, comp count, confidence, "as of" and both "vs base" figures.
- **Reference outputs.** `update_week_ahead.py` (run automatically at the end of `update_data.py`) writes `data/week_ahead.json`/`.js`. These hold the assumptions and floor-plan data the browser engine loads, plus the Python engine's **reference outputs for every collected week**. Those are used only for the parity test and auditing.
- **Parity test.** `tests/test_week_ahead.py > JsParity` runs the JS engine in Node and requires identical output to the Python engine for every collected week, including 2026-10-12 and 2026-10-19. It also requires the committed reference outputs to match. Both engines round half-up, so the outputs match exactly. **Any change to the calc chain must be made in both files.**
- **GitHub Action.** `.github/workflows/week-ahead.yml` runs the tests (Python and Node) on PRs and checks the generated file is current. On `main` it regenerates and commits the reference outputs when `comps.json` changes.

Manual: `python3 update_week_ahead.py` (rebuild), `--week YYYY-MM-DD` (print a week), `--check`. Tests: `python3 -m unittest discover -s tests -t . -v` (needs `node` for the parity test).

### Files
- `week_ahead/engine.py`: the calc chain (`run_hotel_median` / `run_all_weeks` for the live mode; `run` for a future per-unit-type feed). `assets/js/week-ahead-engine.js` is its browser port.
- `data/week_ahead/assumptions.json`: every tunable input.
- `data/week_ahead/units.json`: floor-plan specs and owner economics transcribed from *AMBAR Residence Cards — Complete Collection* (AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026). The tests reconcile them with the document's own maths.
- `assets/residences/*.jpg`: renderings from the same document.
- `update_week_ahead.py`, `assets/js/week-ahead.js`, `assets/css/week-ahead.css`.

### Optional upgrade: a per-unit-type STR feed (mode `unit_type_feed`)
Hotel standard rooms are a proxy. For a true like-for-like feed, drop per-unit-type vacation-rental comps into a CSV and run `python3 update_week_ahead.py --feed data/week_ahead/comps_feed.csv --as-of YYYY-MM-DD --live`, which writes `data/week_ahead_feed.json`. That output is not rendered yet; wiring it into the page would need a JS port of `run`. The format is shown in `data/week_ahead/comps_feed.sample.csv`, which is synthetic and is a format example only:
```
date,property,unit_type,bedrooms,sqft,rate,min_stay,is_booked
```
`unit_type` is studio, 1br, 2br or 3br. `is_booked=true` marks a realized ADR, and realization applies to listed rates only. In this mode types are segmented, and types with fewer than 4 comps are gap-filled from the best-supported type and labelled Derived. Possible sources: AirDNA, KeyData (booked data, best for calibrating realization), PriceLabs, Transparent or Lighthouse, or a manual weekly pull of about 8–10 comps per type.

Securities counsel should review the section wording before any of it goes into broker or investor materials, since AMBAR may involve a fund or tokenized structure and live revenue estimates can be forward-looking statements.
