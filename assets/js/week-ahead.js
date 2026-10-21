/* Residences · The week ahead — renders data/week_ahead.json (built by update_week_ahead.py
   from the same weekly comparable hotel rates as the rest of the site, data/comps.json). */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
  const usd2 = (v) => (v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v) => Math.round(v * 100) + "%";
  const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(1) + "%";
  const fLong = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  function getJSON(url, globalName, mirror) {
    return fetch(url, { cache: "no-cache" }).then((r) => { if (!r.ok) throw 0; return r.json(); })
      .catch(() => new Promise((res, rej) => {
        if (window[globalName]) return res(window[globalName]);
        const s = document.createElement("script"); s.src = mirror;
        s.onload = () => res(window[globalName]); s.onerror = rej; document.body.appendChild(s);
      }));
  }

  function costBlock(u, est) {
    const f = u.monthly_revenue_flow, fx = u.fixed_owner_costs_monthly, b = u.base_scenario;
    const rowsFlow = [
      ["Gross room revenue", f.gross_room_revenue, 1], ["Marriott brand fee · 10%", f.marriott_brand_fee_10pct], ["Hotel operations · 40%", f.hotel_operations_40pct],
      ["Owner share · 50%", f.owner_share_50pct, 1], ["FF&amp;E reserve · 4%", f.ffe_reserve_4pct], ["OTA commissions · 2.5%", f.ota_commissions_2_5pct],
      ["Card processing · 2.41%", f.card_processing_2_41pct], ["Fixed owner costs", f.fixed_owner_costs]
    ];
    const fixed = [["HOA / condo", fx.hoa_condo], ["Property tax", fx.property_tax], ["Insurance (estimate)", fx.insurance_estimate], ["Utilities (estimate)", fx.utilities_estimate]];
    return `<details><summary>Costs &amp; owner economics</summary>
      <p class="c-h">Fixed owner costs</p>
      <table class="ctab"><thead><tr><th></th><th>Monthly</th><th>Annual</th></tr></thead><tbody>
      ${fixed.map(([k, v]) => `<tr><td>${k}</td><td>${usd2(v)}</td><td>${usd2(v * 12)}</td></tr>`).join("")}
      <tr class="tot"><td>Total fixed costs</td><td>${usd2(fx.total)}</td><td>${usd2(fx.total * 12)}</td></tr></tbody></table>
      <p class="c-note">Property tax basis ${usd2(u.property_tax_annual)} a year. ${u.note ? esc(u.note) : ""}</p>
      <p class="c-h">Document base scenario · ${usd(b.adr)} ADR · ${pct(b.occupancy)} occupancy · cash purchase</p>
      <div class="c-kpis"><div><span>Net / month</span><b>${usd(u.net_per_month)}</b></div><div><span>Net / year</span><b>${usd(u.net_per_year)}</b></div><div><span>Cap rate</span><b>${u.cap_rate_pct.toFixed(2)}%</b></div></div>
      <table class="ctab"><thead><tr><th>Monthly revenue flow</th><th></th></tr></thead><tbody>
      ${rowsFlow.map(([k, v, bold]) => `<tr${bold ? ' class="tot"' : ""}><td>${k}</td><td class="${v < 0 ? "neg" : ""}">${usd2(v)}</td></tr>`).join("")}
      <tr class="tot"><td>Owner net before financing</td><td>${usd2(f.owner_net_before_financing)}</td></tr></tbody></table>
      <p class="c-note">Reference list price ${usd(u.reference_list_price)} (per floor plan, not a quote for an individual residence). Cap rate = annual owner net ÷ reference price, before financing; no mortgage or closing costs. Insurance and utilities are estimates, not quotes. The 40% hotel operations allocation (Coury Hospitality) is included above, not an additional deduction.</p>
      <p class="c-note">The base scenario is the document’s annual illustration; it is not recalculated from this week’s estimate (this week is ${sgn(est.vs)} vs its ADR).</p>
      <p class="c-note">Source: AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026 (AMBAR Residence Cards, pp. ${u.doc_pages.join("–")}). Illustrative only; not financial advice.</p>
    </details>`;
  }

  function render(W, market) {
    const R = W.residences, A = W.assumptions, asOf = fLong(W.as_of);
    const byId = Object.fromEntries(W.units.map((u) => [u.id, u]));
    const hotel = W.mode === "hotel_median";
    const B = W.baseline;
    const live = W.data_status === "live";

    $("#rwSub").textContent = hotel
      ? `What each AMBAR floor plan looks like for the week of ${fLong(W.week_start)}, framed against the median of the comparable Orlando hotels tracked on this page. The comp-set median is treated as a Studio-equivalent nightly rate; every other plan is scaled from it with AMBAR’s floor-plan ratios.`
      : `What each AMBAR floor plan looks like for the week of ${fLong(W.week_start)}, estimated from comparable vacation-rental units by type.`;
    $("#rwBadges").innerHTML = (live ? "" : `<span class="wa-badge sample">Sample data · live feed not yet connected</span>`) +
      `<span class="wa-badge live">Current snapshot · Estimated · as of ${asOf}</span>` +
      (hotel ? `<span class="wa-badge">Comp median of ${B.comp_count} Orlando hotels</span>` : "");
    $("#rwDisclaimer").innerHTML = `<b>Estimates, not a promise of returns.</b> Every figure in this section is an estimate for illustration only, as of ${asOf}. ` +
      (hotel ? `The comparables are lowest public nightly rates at Orlando hotels (standard rooms, room types unspecified), not AMBAR residences, and only the Studio is benchmarked to them directly; all other plans are scaled. ` : "") +
      `Actual rates, occupancy, costs and owner income will differ. Nothing here is an offer, investment advice or a statement about any fund or tokenized structure; the wording is subject to review by securities counsel and should not be reused in broker or investor materials.`;

    // stale guard: the comparable rates moved on but the estimates have not been rebuilt yet
    if (hotel && market && market.weeks) {
      const latest = market.weeks.filter((w) => w.status === "collected").map((w) => w.week).sort().pop();
      if (latest && latest !== W.week_start)
        $("#rwBadges").insertAdjacentHTML("beforeend", `<span class="wa-badge sample">Comparable rates updated for week of ${fLong(latest)}; estimates refresh on the next build</span>`);
    }

    if (hotel) {
      const comps = W.comps.map((c) => `<tr><td>${esc(c.name)}${c.non_marriott ? " <small>non-Marriott</small>" : ""}</td><td class="num">${c.weekly_median != null ? usd(c.weekly_median) : "—"}</td><td>${c.priced_nights} of ${c.nights}</td><td>${c.status === "used" ? "Used" : esc(c.status)}</td></tr>`).join("");
      $("#rwSummary").innerHTML = `<div class="wa-base">
        <div class="wa-base-kpis">
          <div><span>Comp-set median · Studio-equivalent baseline</span><b>${usd(B.median)}</b><small>Estimated · as of ${asOf}</small></div>
          <div><span>Range (25th–75th percentile)</span><b>${usd(B.p25)}–${usd(B.p75)}</b><small>across the comp set</small></div>
          <div><span>Comparable hotels</span><b>${B.comp_count}</b><small>${B.trimmed_out ? `${B.trimmed_out} outlier(s) trimmed` : "no outliers trimmed"} · ${W.pipeline.hotels_in_landscape} tracked</small></div>
          <div><span>Mean (diagnostic)</span><b>${usd(B.diag_mean)}</b><small>${B.flagged ? `<span class="flag">Flagged: ${B.gap_pct.toFixed(1)}% from median</span>` : `${B.gap_pct.toFixed(1)}% from median · not flagged`}</small></div>
        </div>
        <details class="wa-comps"><summary>Comparable hotels used this week</summary>
          <div class="wa-scroll"><table class="wa-summary"><thead><tr><th>Hotel</th><th>Week median of priced nights</th><th>Priced nights</th><th>Status</th></tr></thead><tbody>${comps}</tbody></table></div>
          <p class="fineprint">Each hotel contributes one figure: the median of its lowest public nightly rates for the week (nights with no offer are excluded; hotels with fewer than ${A.hotel_median.min_priced_nights} priced nights are left out). Same data as the Week ahead grid above.</p>
        </details></div>`;
    } else {
      $("#rwSummary").innerHTML = "";
    }

    const seg = $("#rwFilter");
    const TYPES = ["studio", "1br", "2br", "3br"];
    seg.innerHTML = [["all", "All residences"], ...TYPES.map((k) => [k, A.unit_types[k].label])]
      .map(([k, l], i) => `<button type="button" class="seg-btn" data-t="${k}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      document.querySelectorAll(".rcard").forEach((c) => { c.hidden = b.dataset.t !== "all" && c.dataset.type !== b.dataset.t; });
    });

    $("#rwGrid").innerHTML = R.units.map((u) => {
      const e = byId[u.id];
      const vs = e.vs_doc_base_pct != null ? e.vs_doc_base_pct : (e.adr / u.base_scenario.adr - 1) * 100;
      const scaled = hotel ? e.basis === "scaled" : false;
      const spec = [u.bedrooms ? `${u.bedrooms} bed` : "Studio", `${u.bathrooms} bath`, `${u.sqft.toLocaleString("en-US")} sq ft`, u.terrace_sqft ? `${u.terrace_sqft} sq ft terrace` : null, `up to ${u.max_guests} guests`].filter(Boolean).join(" · ");
      const basis = hotel
        ? (scaled ? `<b>Scaled from the comp median</b> using AMBAR floor-plan ratios (×${e.ratio_to_s1.toFixed(2)} vs S1)` : `Based on <b>${e.comp_count} comparable Orlando hotels</b> (median)`)
        : `Based on ${e.comp_count} comparable units (${esc(e.method)})`;
      return `<article class="rcard" data-type="${u.unit_type}" id="res-${u.id}">
        <div class="r-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)" loading="lazy"></div>
        <div class="r-body">
          <div class="r-top"><div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h3>${esc(u.name)}</h3></div><span class="conf ${e.confidence}" title="${scaled ? "Confidence reduced one step because this plan is scaled, not benchmarked directly" : "Confidence reflects the number of comparables"}">${e.confidence}${scaled ? " · scaled" : ""}</span></div>
          <p class="r-spec">${esc(spec)}<br>${esc(u.details)}</p>
          <dl class="r-metrics">
            <div><dt>Estimated ADR / night</dt><dd>${usd(e.adr)}<small>range ${usd(e.adr_p25)}–${usd(e.adr_p75)}</small></dd></div>
            <div><dt>Estimated RevPAU / night</dt><dd>${usd(e.revpau)}<small>range ${usd(e.revpau_p25)}–${usd(e.revpau_p75)}</small></dd></div>
          </dl>
          <div class="r-vs ${vs >= 0 ? "up" : "down"}"><span>vs. document base scenario</span><b>${sgn(vs)}</b><small>est. ${usd(e.adr)} vs ${usd(u.base_scenario.adr)} base ADR</small></div>
          <p class="r-meta">Occupancy <b>${pct(e.occupancy)}</b>${e.occupancy_status === "confirmed" ? " (confirmed)" : ""} · Estimated · as of ${asOf}<br>${basis}</p>
          ${costBlock(u, { vs })}
        </div></article>`;
    }).join("");

    const ut = A.unit_types;
    $("#rwMethod").innerHTML = `<details><summary>How these estimates are calculated</summary>
      <ul>
        <li><b>Comparables.</b> The same weekly comparable hotel rates shown elsewhere on this page (lowest public nightly rates; standard rooms, room types unspecified). Each hotel contributes the median of its priced nights for the week. Records are de-duplicated, anything older than ${A.pipeline.stale_days} days is dropped, and outliers are trimmed with the interquartile-range rule (k = ${A.pipeline.iqr_k}).</li>
        <li><b>Baseline.</b> The comp-set <b>median</b> is the Studio-equivalent baseline (a trimmed mean if fewer than ${A.pipeline.median_min_n} hotels). The range is the 25th–75th percentile. The mean is kept as a diagnostic; the week is flagged when mean and median differ by more than ${A.pipeline.mean_median_flag_pct}%.</li>
        <li><b>Per plan.</b> <code>ADR = comp median × realization × position index × plan ratio to S1</code>, with the same factors applied to the range. Plan ratios are the document base ADRs divided by the S1 base ADR ($338). <code>RevPAU = ADR × occupancy</code>. No seasonality adjustment is added; the weekly rates already reflect demand.</li>
        <li><b>Confidence.</b> High = ${A.pipeline.high_confidence_min_n}+ comparables and not flagged; Medium = fewer comparables or a flagged week; Low = trimmed mean. Plans other than the Studio are scaled, not observed, so their confidence is one step lower.</li>
        <li><b>Vs. document base scenario</b> compares this week’s estimated ADR with the base-scenario ADR in the AMBAR Residence Cards. Because every plan is scaled with ratios from that same document, the percentage is the same for every plan at a given realization and position index.</li>
      </ul>
      <table><thead><tr><th>Plan</th><th>Base ADR</th><th>Ratio to S1</th><th>Occupancy</th><th>Realization</th><th>Position index</th></tr></thead><tbody>
      ${R.units.map((u) => { const e = byId[u.id], t = ut[u.unit_type]; return `<tr><td>${esc(u.layout)}</td><td>${usd(u.base_scenario.adr)}</td><td>${(e.ratio_to_s1 ?? 1).toFixed(3)}</td><td>${pct(e.occupancy)} ${e.occupancy_status === "confirmed" ? "(confirmed)" : ""}</td><td>${t.realization.toFixed(2)}${t.realization_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td><td>${t.position_index.toFixed(2)}${t.position_index_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td></tr>`; }).join("")}
      </tbody></table>
      <p class="fineprint">Regenerated automatically from data/comps.json each time the weekly comparable rates are updated.</p>
    </details>`;
  }

  Promise.all([
    getJSON("data/week_ahead.json", "WEEK_AHEAD_DATA", "data/week_ahead.js"),
    getJSON("data/comps.json", "COMPS_DATA", "data/comps.js").catch(() => null)
  ]).then(([W, M]) => render(W, M)).catch((e) => {
    console.error(e);
    const g = $("#rwGrid"); if (g) g.innerHTML = '<p class="fineprint">Week-ahead data could not be loaded (data/week_ahead.json).</p>';
  });
})();
