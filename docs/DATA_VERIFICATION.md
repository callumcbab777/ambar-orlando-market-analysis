# Weekly data verification checklist (Market Landscape)

Run every Monday after the weekly brief is merged, and before any new figure goes on the site.
Automatic part: `python3 scripts/verify_data.py` (also runs every Monday in GitHub Actions, workflow **data-verify**;
a failed run means a figure no longer matches its source). Checks and source URLs live in `data/verification.json`.

Last full verification: **Nov 24, 2026** (shown on the site as “Last verified” in 05 · Demand context).

## Rules
- Every figure on the page needs a named source and, where possible, a link to the primary page.
- If a figure cannot be confirmed on a primary source, set `"verified": false` with a `verify_note` in
  `data/comps.json` (the site then shows it as **Unverified**), or remove it. Never round, extrapolate or fill gaps.
- No AMBAR rate or return claims, no “$350 benchmark” language, and never show a $0 rate (use “Not collected”).
- After editing `data/comps.json`, regenerate `data/comps.js` (run `python3 update_data.py`, or the snippet in the README).

## 1. Market strip (metro Orlando occupancy, ADR, pacing)
| Figure | Source | How to re-check |
|---|---|---|
| Weekly occupancy / ADR (Sep 26, Oct 3, Oct 10, Oct 17, Oct 24, Nov 14) | Visit Orlando corporate blog, “Data & Trends → Weekly Metrics” (each post linked in `data/verification.json`) | Script checks the value, YoY change and ADR strings. To add a new week: open the newest post at visitorlando.org/about/corporate-blog, copy occupancy, YoY and ADR exactly, add a `market` row with `url`, `verified: true`, `verified_on`, and add a check to `data/verification.json`. |
| Sep to Dec 2026 demand pacing, 6% ahead | Visit Orlando, “Visit Orlando Launches New Culinary Campaign” (August travel performance) | Script checks “pacing 6% ahead of last year” and “Sept. - Dec.”. Note: earlier versions of the site said Oct to Dec; the source says Sep to Dec. |
| August 2026 occupancy 62.4%, ADR $174.95 | **Unverified.** Only secondary write-ups found | Look for Visit Orlando’s monthly “Orlando Travel Performance” or the CoStar monthly release. If it matches, add the URL and set `verified: true`; if not, correct or delete. |

## 2. Demand notes (current and next week) and Looking ahead
| Item | Source | How to re-check |
|---|---|---|
| Thanksgiving: AAA 81.5M travelers, Orlando No. 1 domestic | newsroom.aaa.com Thanksgiving forecast | Script checks “81.5 million”. |
| APS Division of Fluid Dynamics, Nov 22 to 24, OCCC | aps.org DFD 2026 page (blocks bots) | Open the page; confirm dates and venue. |
| I/ITSEC Nov 30 to Dec 3; move-in Nov 25, 27 to 29 | iitsec2026.smallworldlabs.com exhibitor services / expoportal dates | Open the exhibitor services page; confirm show and move-in dates. |
| Mickey’s Very Merry Christmas Party nights, sold out | Disney / wdwmagic sold-out reports | Confirm each listed night is on Disney’s party calendar. |
| ICE! at Gaylord Palms Nov 13 to Jan 3 | christmasatgaylordpalms.com, news.marriott.com Nov 12, 2026 | Confirm the run dates. |
| IAAPA Expo 2026 (1,350+ exhibitors, 630,000 sq ft) | Visit Orlando “Give the Gift of Orlando Memories” | Script checks both numbers. |
| Orlando Magic vs Pistons, Nov 24 | kiacenter.com event page / NBA.com | Confirm date and venue. |
| Earlier weeks (Sep 21 to Nov 16) | Historical, as published in each Monday brief | Not re-verified weekly; correct only if an error is reported. |

## 3. Plan your visit page
| Figure | Source | How to re-check |
|---|---|---|
| Top 10 domestic MCO markets and passenger counts | U.S. DOT BTS T-100 (transtats.bts.gov), as tabulated on Wikipedia; cross-check DWU Consulting MCO dashboard | Script checks all ten counts. When BTS publishes a newer 12-month window, update the list, counts, carriers and the period in `visit/index.html` and `assets/js/flights.js`. |
| Brightline guide times (about 2h to West Palm Beach, 3h30 to Miami; 16 daily round trips) | gobrightline.com Orlando station page (blocks bots) | Open the page; confirm the sentence under “Schedule”. |
| Brightline station-to-station ranges | Brightline published timetable (sampled via trainoclock.com mirror) | Sample 3 or 4 departures each way; update ranges in `visit/index.html` (table) and `tools/build_florida_map.js` (map labels, then `node tools/build_florida_map.js`) if any moved by more than 5 minutes. |
| International routes and seasons | MCO / SFB / MLB airport sites (see `assets/js/flights.js` per-route `src`) | Check the airport’s nonstop destinations page for adds and drops. |

## 4. What is not re-verifiable
Nightly hotel rates are point-in-time snapshots taken on the brief date (trivago and the sources named per week).
They are not re-checked later because public prices change; the snapshot date is shown with every figure.
