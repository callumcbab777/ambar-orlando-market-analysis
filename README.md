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

A section that shows, for each AMBAR floor plan (S1 Studio, A1–A4 1 Bedroom, B1–B3 2 Bedroom, C1 3 Bedroom), an **estimated** ADR and RevPAU for the current week, with the P25–P75 range, the comp count, a confidence label and the "as of" date, plus an expandable cost breakdown and rendering from the AMBAR Residence Cards.

> **Status: SAMPLE DATA.** No per-unit-type vacation-rental comp feed is connected yet. The hotel rates in `data/comps.json` are lowest public hotel-room rates with unspecified room types, so they are not used here. The section runs on `data/week_ahead/comps_feed.sample.csv` (synthetic, property names `SAMPLE Comp …`) and shows a "Sample data · live feed not yet connected" badge until a real feed is built with `--live`.

### Files
- `week_ahead/engine.py`: the calc chain (dedupe → stale filter → IQR trim → segment by type → median / trimmed mean → realization × position index → layout index → occupancy → RevPAU; gap-fill for thin types).
- `data/week_ahead/assumptions.json`: **every tunable input** (realization and position index per type, occupancy and layout index per floor plan, gap-fill ratios, pipeline thresholds). Values marked NEEDS_INPUT are defaults to confirm.
- `data/week_ahead/units.json`: floor-plan specs and owner-economics figures transcribed from *AMBAR Residence Cards — Complete Collection* (source: AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026). `tests/` checks these reconcile with the document's own math.
- `assets/residences/*.jpg`: the overhead renderings from that document, one per floor plan.
- `update_week_ahead.py`: builds `data/week_ahead.json` and the `data/week_ahead.js` mirror (for `file://`). Don't edit those by hand.
- `assets/js/week-ahead.js`, `assets/css/week-ahead.css`: section rendering.

### Formula
`ADR(type, week) = Median(comp ADR) × Realization(type) × PositionIndex(type)`, then `× LayoutIndex(floor plan)`, and `RevPAU = ADR × Occupancy(floor plan)`. No seasonality adjustment (the weekly feed already carries the demand pattern). Realization is applied only to **listed** records (`is_booked=false`). Booked or realized rates are used as-is.

Rules: median when a type has 5 or more clean comps; trimmed mean (drop high and low) for 4; derived from the best-supported type for fewer than 4 (ratio method, or a power curve on sq ft if `power_beta` is set), labelled **Derived**. The mean is kept as a diagnostic, and the week is flagged when |mean − median| / median > 10%, measured before the IQR trim. Confidence: High = 8+ comps and not flagged; Medium = median on fewer comps or a flagged week; Low = trimmed mean; Derived = gap-filled.

### Feed format (CSV or JSON)
CSV header, one row per comp observation:
```
date,property,unit_type,bedrooms,sqft,rate,min_stay,is_booked
2026-10-26,Example Resort Condo 1204,studio,0,510,329,2,false
```
- `date`: observation date (YYYY-MM-DD). Records more than `stale_days` (14) before `--as-of` are dropped.
- `unit_type`: `studio` | `1br` | `2br` | `3br` (may be blank if `bedrooms` is given).
- `rate`: nightly rate in USD, before taxes and fees. `is_booked`: `true` for realized (booked) ADR, `false` for listed or asking rates.
- JSON: either a list of objects with these keys or `{"comps": [...]}`.
- Duplicates (same date, property, unit_type, sqft, is_booked) keep the last row.

### Updating each week
1. Export or pull the week's comps into `data/week_ahead/comps_feed.csv` in the format above.
2. Run `python3 update_week_ahead.py --feed data/week_ahead/comps_feed.csv --as-of YYYY-MM-DD --live`. Leave off `--live` to keep the SAMPLE badge while testing.
3. Check the printed summary (comp counts, flags, derived types), then run `python3 -m unittest discover -s tests -t . -v`.
4. Commit `data/week_ahead.json`, `data/week_ahead.js` and the feed file.

### What a real feed needs
- A source of per-unit-type short-term-rental comps near AMBAR, i.e. condo-hotel and branded-residence units within the Disney / Bonnet Creek / I-4 corridor, segmented by bedrooms with sq ft. Options: **AirDNA** (MarketMinder or API: listed and booked ADR and occupancy by bedroom count), **KeyData** (property-manager-reported booked data, the best fit for realization calibration), **PriceLabs** (Market Dashboard: listed future rates by bedroom count), **Transparent** or **Lighthouse**, or a manual weekly pull of about 8–10 hand-picked comps per type from Airbnb and VRBO (listed rates only, so `is_booked=false`).
- An agreed comp set (property list) per type, so the median doesn't drift with listing churn.
- Calibration of `realization` against booked data, Callum's view on `position_index` and occupancy per type, and a decision on the gap-fill method and ratios.
- Securities-counsel review of the section wording before it goes in any broker or investor materials. AMBAR may involve a fund or tokenized structure, and live revenue estimates can count as forward-looking statements.
