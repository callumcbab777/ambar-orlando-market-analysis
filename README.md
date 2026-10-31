# AMBAR Orlando Market Landscape

Static, single-folder site. Open `index.html` directly (works offline, except map tiles) or host the folder anywhere.

Marriott brands are the main focus (AMBAR is part of the Marriott family); key non-Marriott upper-upscale and luxury hotels are included for a fuller picture. The Marriott Brand Matrix section stays Marriott-only.

## Structure
- `index.html`: page shell (hotel / ADR / market data)
- `events/index.html`: Orlando events page (this week’s picks, date buckets, My list + Share, My preferences, Plan your visit)
- `assistant-proxy/`: optional serverless proxy for the AI assistant (deploy separately; see its README)
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

**Daily view (Oct 22, 2026).** `data/comps.json` stores one lowest public rate per hotel per **night** (`rates[].date`, captured on the weekly snapshot `rates[].source_date`), so the section now estimates **one night at a time**. It opens on **today in Orlando** (computed in the browser in `America/New_York`); if today has no comparable rates it opens on the nearest night that does and says so. A week selector plus Mon–Sun night chips pick any other night (`?night=YYYY-MM-DD` deep-links one). For the selected night each hotel contributes its rate for that night; the same rules apply as for the week: de-duplicate, drop a rate whose snapshot is more than `stale_days` (14) before the night, IQR-trim, then the median with 5+ hotels, the trimmed mean with 4, and no estimate below 4 (that night's chip is disabled). Captions name the night and show "N of 11" when fewer hotels had a rate, e.g. "Based on the median rate of the 11 hotels in our Orlando comparable set (Thu Oct 22)". ADR vs base and RevPAR vs base (base = base ADR × 73% step-down occupancy) are computed for the selected night. An **ADR / RevPAR switch** (ADR by default) above the cards sets the one figure each card shows (value for the night + % vs base); RevPAR = revenue per available night = ADR × estimated occupancy (`revpau` in the JSON). The expanded view shows both, plus its own week and night selectors. Python: `run_hotel_night` / `run_all_nights`; JS: `runHotelNight` / `runAllNights`; reference outputs for every night are in `data/week_ahead_nights.json` (parity test only; the page never loads it). `python3 update_week_ahead.py --night 2026-10-22` prints one night.

For each AMBAR floor plan (S1 Studio, A1–A4 1 Bedroom, B1–B3 2 Bedroom, C1 3 Bedroom), this section shows an **estimated** ADR and RevPAU for the current comp week, with the range, the comp count, a confidence label, an "as of" date, ADR vs base and RevPAU vs base comparisons, and a rendering taken from the AMBAR Residence Cards.

**Expanded view.** Each residence card is clickable (or Enter/Space when focused) and opens a full-detail view (`<dialog id="rwModal">`): large rendering, plan facts (type, size, beds/baths, guests, terrace), the selected week's estimated ADR, occupancy and RevPAU with ranges, the historical base figures, ADR/RevPAU vs base, comp count and confidence, the median caption, the full cost breakdown and the Example of Owner Economics (net, cap rate, list price, fee structure), the 'Estimated · as of' date and a short disclaimer. It has its own comp-week buttons and re-renders whenever the week changes (in the modal or the section). It closes on ×, Esc or a backdrop click and becomes a full-screen sheet below 760px. The cost breakdown lives only in this view; the cards stay compact.

### Data source and mapping (mode `hotel_median`, live)
The comparables are the site's own weekly comparable hotel rates in `data/comps.json`, the same data as the Week ahead grid. Those are lowest public standard-room rates with unspecified room types, so:
1. Each hotel contributes **one** figure: the median of its priced nights for the selected week. Hotels with fewer than `min_priced_nights` (2) priced nights are excluded.
2. These are de-duplicated, stale records are dropped, and outliers are trimmed by IQR (k = 1.5).
3. The **comp-set median** (or a trimmed mean below 5 hotels) is the **Studio-equivalent baseline**. The P25–P75 range comes from the same set. The mean is a diagnostic, and the week is flagged when mean and median differ by more than 10%.
4. Each plan's ADR is `baseline × realization(type) × position_index(type) × ratio_to_S1(plan)`. The ratio is the plan's base ADR ÷ the S1 base ADR (338, 409, 449, 504, 510, 589, 552, 552, 658), and the same factor applies to the range.
5. **Estimated occupancy: 83% with size step-down.** `Occ(plan) = occupancy_model.occ_studio × (1 − d) ^ size_units` with `size_units = bedrooms + den_weight × has_den`. `occ_studio` is 0.83. `d` 0.04 and `den_weight` 0.5 are **proposed, adjustable**. That gives S1 83.0%, A1 79.7%, A2–A4 78.1%, B2/B3 76.5%, B1 74.9% and C1 73.4%. `RevPAU = ADR × Occ`.
6. **Historical base: 73% with size step-down.** Base occupancy(plan) = `base_occupancy.anchor` (0.73, Callum's historical figure) × (1 − d) ^ size_units, using the same step and den weight but **its own anchor** (decoupled). That gives S1 73.0%, A1 70.1%, A2–A4 68.7%, B2/B3 67.3%, B1 65.9% and C1 64.6%. Base ADR = each plan's base ADR, and base RevPAU = base ADR × base occupancy(plan).
   - **ADR vs base** reflects rates only.
   - **RevPAU vs base** = (1 + ADR vs base) × (83 / 73) − 1, so it also reflects the higher estimated-occupancy anchor. For the week of Oct 19 that's +13.3% ADR and +28.8% RevPAU, for every plan.
   - Both are shown side by side on each card.
7. **Example of Owner Economics:** computed by the engine (`owner_economics()` in `week_ahead/engine.py`, `ownerEconomics()` in the JS engine, kept in parity) from `assumptions.json > owner_economics` and each plan's fixed costs: gross = base ADR × estimated size step-down occupancy (`occupancy_model`) × 365 ÷ 12; Marriott brand fee 10%, hotel operations 40%, owner share 50%; FF&E 4%, OTA 2.5%, card processing 2.41% of gross deducted from the owner share; minus HOA, property tax, insurance and utilities; net/month, net/year (net × 12) and cap rate (net/year ÷ reference list price). A test confirms that at the original per-plan occupancies (79–84%) it reproduces the AMBAR cost breakdown's lines, net and cap rate exactly. Shown as an example at base ADR; it does not change with the selected week and is not a forecast.
8. **Median sourcing is explicit:** the section header states that ADR and RevPAU come from the median pricing of the comparable hotel set, lists all hotels in the set (crossed out if they had no usable rates that week) and links to the per-hotel panel. Every card has a caption such as "Based on the median rate of the 11 hotels in our Orlando comparable set (week of Oct 19)", or, in thinner weeks, "Based on the median rate of 6 of the 11 hotels … (7 had rates that week; 1 outlier trimmed)". **Labels:** only S1 says "based on N comparable Orlando hotels". Every other plan says "scaled from the comp median using AMBAR floor-plan ratios", and its confidence is one step lower (High → Medium → Low).

`realization` and `position_index` stay at **1.00** and are marked NEEDS_INPUT. There is no seasonality adjustment.

### Week selection and automatic updates
- **Computed live in the browser.** The cards are computed in the browser by `assets/js/week-ahead-engine.js`, a line-for-line port of `week_ahead/engine.py`, straight from `data/comps.json` for the selected week. Nothing shown is precomputed, so a new weekly rate update (`update_data.py`) flows into the residence cards automatically, with no extra step.
- **Week selector.** The section has its own week selector listing every week in `comps.json`, defaulting to the latest. The section heading changes to "Week of <date>: …" when a past week is selected. Weeks that weren't collected are shown disabled. It is also linked to the site's existing Week ahead tabs, so picking a week in either place updates the grid and every plan: ADR, range, occupancy, RevPAU, comp count, confidence, "as of" and both "vs base" figures.
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

## Orlando events page (`events/index.html`)

The Visit Orlando calendar lives on its own page, **`events/index.html`**, so the main page stays focused on hotel, ADR and market data. The two pages cross-link in the header nav (main: “Events →”; events: “← Market landscape”). At 1180px and below the header links fold into a **Menu** button (`assets/js/nav.js`), and the Demand section links to it.

- **Data:** `data/visitorlando_events.json`, loaded through its mirror `data/visitorlando_events.js` (so `file://` works). Refresh with:
  ```bash
  python3 scripts/fetch_visitorlando_events.py --start YYYY-MM-DD --end YYYY-MM-DD
  ```
  Visit Orlando’s Simpleview REST API is often blocked by Akamai for non-browser clients. The script tries REST first, then falls back to the public sitemap + event page JSON-LD (warm a session on `/` and `/events/all/` first). Do not invent events; attribute Visit Orlando and link out to the calendar.
- **Landing:** an editorial hero (inline SVG, AMBAR palette, no photos), **This week’s picks** (up to 6 short-run events in the next 7 days, max 2 per category; 4 on phones) and **Browse by date** tiles. Imagery is drawn, not photographed: the Visit Orlando data has no image URLs we can reuse, and we do not hotlink event photos. Licensed AMBAR lifestyle photography would be a good follow-up.
- **Date buckets** (`assets/js/events-core.js`, unit-tested in `tests/js/events_core_test.js`): *Today*, *This weekend* (Fri–Sun, from today), *Next week* (the Mon–Sun after this weekend), *Later this month* (to month end; rolls to the next month near month end) and *All*. Computed from the visitor’s **local** date. Empty buckets say so and point to the next ones.
- **Browse** (`assets/js/events.js`, `assets/css/events.css`): bucket buttons, search, and *More filters* (category, area, from/to, sort). Every card shows a **“Source: Visit Orlando listing”** link (only `https://www.visitorlando.com/` URLs are linked). Deep links: `events/index.html?when=weekend`, `?q=jazz&area=Winter%20Park&from=2026-11-01&to=2026-11-08&cat=Free%20Events`, `#saved`, `#preferences`, `#getting-here`, `#best-time`, `#visit-ambar`.
- **Share my list** (on *My list*): **Download PDF** builds a branded Letter PDF in the browser (vendored `assets/vendor/jspdf.umd.min.js`, MIT, plus `assets/vendor/pdf-fonts.js`: DM Sans and Cormorant Garamond subset from the site’s own OFL fonts; both lazy-loaded only when the button is pressed). Each entry has name, dates, place and a clickable Visit Orlando link; the PDF also links back to the list online. **Copy share link** puts `events/index.html?shared=ID.ID.ID` on the clipboard (with a confirmation); on phones a **Share…** button opens the system share sheet. Recipients get a read-only *Shared with you* view with **Save all to my list**; incoming IDs are sanitised (digits only, max 60) and unknown IDs are ignored and counted.
- **Plan your visit** (`assets/js/plan.js`): tabs for *Getting here* (MCO and SFB nonstop routes from the UK and key markets, from flymco.com and flysfb.com, dated “as of”; seasonal routes marked; free-flow drive estimates from OpenStreetMap/OSRM; Google Flights links; **no fares on the page**), *Best time to visit* (NOAA NCEI 1991–2020 monthly normals for Orlando Intl, station USW00012815; qualitative crowd levels from the Theme Park Direct crowd calendar) and *Visit AMBAR* (Callum’s Calendly “Introduction to AMBAR” link and the sales center address with a Google Maps directions link). Re-check routes each season.
- **Saved:** a Save toggle on each card; the **My list** tab lists them. Stored in `localStorage` (`ambar.events.saved.v1`) with a small snapshot (title, dates, URL) so events that later drop out of the data still show as “No longer listed” with their original link and a Remove button. No login.
- **My preferences:** interests (categories), areas, dates, budget (any / free only — listings have no prices, so this uses Visit Orlando’s *Free Events* tag), who’s going, keywords and accessibility. Stored in `localStorage` (`ambar.events.prefs.v1`). Once saved, **“Recommended for you”** with the tagline **“Powered by Isla AI - ABI Group”** appears at the top of *All events*: up to 6 events ranked in the browser by a transparent score (+3 per matching interest, +2 area, +2 per keyword up to +4, +2 family wording when “Family with kids”, +2 accessibility wording, +1 runs of 7 days or fewer; outside the dates or non-free when “Free only” are excluded). The rules are shown on the page under “How this is ranked”. Edit or Clear at any time.

## Site assistant (chat widget)

`assets/js/assistant.js` + `assets/css/assistant.css`, on both pages (bottom-right button).

- **Offline site guide (default):** with `proxyUrl` empty in `assets/js/assistant-config.js`, the widget is labelled “Offline site guide · keyword search, not AI”. It parses dates (“today”, “this weekend”, “Nov 7”), “free”, areas and keywords, searches the site’s sections and the Visit Orlando data locally, and answers with links only.
- **AI mode (Isla):** set `proxyUrl` to a deployed `assistant-proxy/` endpoint. The widget sends the conversation plus the site’s section list and the events its local search matched; the proxy adds the key and a grounded system prompt. If the proxy fails, it falls back to the offline guide. **No API key is ever in the client or this repo.** Setup: `assistant-proxy/README.md`.
