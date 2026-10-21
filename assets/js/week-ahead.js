/* Residences · week ahead — renders data/week_ahead.json (built by update_week_ahead.py) */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
  const usd2 = (v) => (v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v) => Math.round(v * 100) + "%";
  const fLong = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const TYPE_ORDER = ["studio", "1br", "2br", "3br"];

  function load() {
    return fetch("data/week_ahead.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw 0; return r.json(); })
      .catch(() => new Promise((res, rej) => {
        if (window.WEEK_AHEAD_DATA) return res(window.WEEK_AHEAD_DATA);
        const s = document.createElement("script"); s.src = "data/week_ahead.js";
        s.onload = () => res(window.WEEK_AHEAD_DATA); s.onerror = rej; document.body.appendChild(s);
      }));
  }

  function basisLine(t, A) {
    const lbl = A.unit_types[t.unit_type];
    if (t.method === "derived")
      return `<b>Derived</b> from ${esc(A.unit_types[t.derived_from].plural)} (×${t.derived_factor.toFixed(2)} size ratio): only ${t.comp_count} comparable ${esc(lbl.plural)} this week`;
    const how = t.method === "median" ? "median" : "trimmed mean (high and low dropped)";
    return `Based on <b>${t.comp_count} comparable ${esc(lbl.plural)}</b> · ${how}` + (t.trimmed_out ? ` · ${t.trimmed_out} outlier${t.trimmed_out > 1 ? "s" : ""} removed` : "");
  }

  function costBlock(u, R, est) {
    const f = u.monthly_revenue_flow, fx = u.fixed_owner_costs_monthly, b = u.base_scenario;
    const rowsFlow = [
      ["Gross room revenue", f.gross_room_revenue, 1], ["Marriott brand fee · 10%", f.marriott_brand_fee_10pct], ["Hotel operations · 40%", f.hotel_operations_40pct],
      ["Owner share · 50%", f.owner_share_50pct, 1], ["FF&amp;E reserve · 4%", f.ffe_reserve_4pct], ["OTA commissions · 2.5%", f.ota_commissions_2_5pct],
      ["Card processing · 2.41%", f.card_processing_2_41pct], ["Fixed owner costs", f.fixed_owner_costs]
    ];
    const fixed = [["HOA / condo", fx.hoa_condo], ["Property tax", fx.property_tax], ["Insurance (estimate)", fx.insurance_estimate], ["Utilities (estimate)", fx.utilities_estimate]];
    const vsBase = (est.adr / b.adr - 1) * 100;
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
      <p class="c-note">This week’s estimated ADR is ${vsBase >= 0 ? "+" : ""}${vsBase.toFixed(1)}% vs the base-scenario ADR. The base scenario is the document’s annual illustration and is not recalculated from one week’s estimate.</p>
      <p class="c-note">Source: AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026 (AMBAR Residence Cards, pp. ${u.doc_pages.join("–")}). Illustrative only; not financial advice.</p>
    </details>`;
  }

  function render(W) {
    const R = W.residences, A = W.assumptions, asOf = fLong(W.as_of);
    const types = W.types, byId = Object.fromEntries(W.units.map((u) => [u.id, u]));
    const sample = W.data_status !== "live";
    $("#rwSub").textContent = `What each AMBAR residence type looks like for the week of ${fLong(W.week_start)}: an estimated nightly rate (ADR) and revenue per available unit-night (RevPAU) built from comparable vacation-rental units of the same size, with the costs behind each floor plan.`;
    $("#rwBadges").innerHTML = (sample ? `<span class="wa-badge sample" title="The engine is running on a synthetic sample feed">Sample data · live feed not yet connected</span>` : `<span class="wa-badge live">Live comp feed</span>`) +
      `<span class="wa-badge">Estimated · as of ${asOf}</span><span class="wa-badge">${esc(W.pipeline.after_stale)} comps used of ${esc(W.pipeline.records_in)} received</span>`;
    $("#rwDisclaimer").innerHTML = `<b>Estimates, not a promise of returns.</b> Every figure in this section is an estimate for illustration only, as of ${asOf}${sample ? ", and is currently calculated from a <b>sample dataset</b>, not live market data" : ""}. Actual rates, occupancy, costs and owner income will differ. Nothing here is an offer, investment advice or a statement about any fund or tokenized structure; the wording is subject to review by securities counsel and should not be reused in broker or investor materials.`;

    const rows = TYPE_ORDER.map((k) => types[k]).map((t) => `<tr>
      <td><b>${esc(t.label)}</b></td>
      <td class="num">Est. ${usd(t.adr)}<small>range ${usd(t.adr_p25)}–${usd(t.adr_p75)}</small></td>
      <td>${t.method === "derived" ? `Derived from ${esc(A.unit_types[t.derived_from].plural)}` : `${t.comp_count} comparable ${esc(A.unit_types[t.unit_type].plural)}`}<small>${t.method.replace("_", " ")}${t.trimmed_out ? ` · ${t.trimmed_out} outlier removed` : ""}</small></td>
      <td><span class="conf ${t.confidence}">${t.confidence}</span></td>
      <td>${t.diag_mean != null ? `mean ${usd(t.diag_mean)} / median ${usd(t.diag_median)}` : "—"}<small>${t.flagged ? `<span class="flag">Flagged: ${t.gap_pct.toFixed(1)}% gap</span>` : t.gap_pct != null ? `${t.gap_pct.toFixed(1)}% gap` : ""}</small></td>
      <td>Estimated<small>as of ${asOf}</small></td></tr>`).join("");
    $("#rwSummary").innerHTML = `<div class="wa-scroll"><table class="wa-summary"><thead><tr><th>Type</th><th>Est. ADR / night (P25–P75)</th><th>Comp basis</th><th>Confidence</th><th>Diagnostic</th><th>As of</th></tr></thead><tbody>${rows}</tbody></table></div>`;

    const seg = $("#rwFilter");
    seg.innerHTML = [["all", "All residences"], ...TYPE_ORDER.map((k) => [k, A.unit_types[k].label])]
      .map(([k, l], i) => `<button type="button" class="seg-btn" data-t="${k}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      document.querySelectorAll(".rcard").forEach((c) => { c.hidden = b.dataset.t !== "all" && c.dataset.type !== b.dataset.t; });
    });

    $("#rwGrid").innerHTML = R.units.map((u) => {
      const e = byId[u.id], t = types[u.unit_type];
      const spec = [u.bedrooms ? `${u.bedrooms} bed` : "Studio", `${u.bathrooms} bath`, `${u.sqft.toLocaleString("en-US")} sq ft`, u.terrace_sqft ? `${u.terrace_sqft} sq ft terrace` : null, `up to ${u.max_guests} guests`].filter(Boolean).join(" · ");
      return `<article class="rcard" data-type="${u.unit_type}" id="res-${u.id}">
        <div class="r-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)" loading="lazy"></div>
        <div class="r-body">
          <div class="r-top"><div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h3>${esc(u.name)}</h3></div><span class="conf ${e.confidence}">${e.confidence}</span></div>
          <p class="r-spec">${esc(spec)}<br>${esc(u.details)}</p>
          <dl class="r-metrics">
            <div><dt>Estimated ADR / night</dt><dd>${usd(e.adr)}<small>range ${usd(e.adr_p25)}–${usd(e.adr_p75)}</small></dd></div>
            <div><dt>Estimated RevPAU / night</dt><dd>${usd(e.revpau)}<small>range ${usd(e.revpau_p25)}–${usd(e.revpau_p75)}</small></dd></div>
          </dl>
          <p class="r-meta">Occupancy assumption <b>${pct(e.occupancy)}</b> · as of ${asOf}<br>${basisLine(t, A)}${t.flagged ? ` · <span class="flag">flagged week</span>` : ""}${e.layout_index !== 1 ? `<br>Layout premium ×${e.layout_index.toFixed(2)} over ${esc(A.unit_types[u.unit_type].label)} reference layout` : ""}</p>
          ${costBlock(u, R, e)}
        </div></article>`;
    }).join("");

    const ut = A.unit_types;
    $("#rwMethod").innerHTML = `<details><summary>How these estimates are calculated</summary>
      <ul>
        <li>Each week, comparable vacation-rental records (date, property, unit type, bedrooms, sq ft, rate, min stay, listed vs booked) are de-duplicated, records older than ${A.pipeline.stale_days} days are dropped, and outliers are trimmed with the interquartile-range rule (k = ${A.pipeline.iqr_k}).</li>
        <li>Comps are segmented by unit type: studio comps only feed the studio figure, and so on. The point estimate is the <b>median</b>; with ${A.pipeline.gap_fill_min_n}–${A.pipeline.median_min_n - 1} comps it is a trimmed mean. The mean is kept as a diagnostic and the week is flagged when mean and median differ by more than ${A.pipeline.mean_median_flag_pct}%. The range shown is the 25th–75th percentile.</li>
        <li><code>ADR = Median(comp ADR) × Realization × Position index</code>, then <code>RevPAU = ADR × occupancy</code>. Occupancy is set per residence type. No seasonality adjustment is added because the weekly feed already reflects demand.</li>
        <li>With fewer than ${A.pipeline.gap_fill_min_n} clean comps a type is <b>derived</b> from the best-supported type using a ${esc(A.gap_fill.method)} method, and labelled Derived.</li>
        <li>Confidence: High = ${A.pipeline.high_confidence_min_n}+ comps and not flagged; Medium = median on fewer comps or a flagged week; Low = trimmed mean; Derived = gap-filled.</li>
      </ul>
      <table><thead><tr><th>Type</th><th>Realization</th><th>Position index</th><th>Size ratio vs studio</th></tr></thead><tbody>
      ${TYPE_ORDER.map((k) => `<tr><td>${esc(ut[k].label)}</td><td>${ut[k].realization.toFixed(2)}</td><td>${ut[k].position_index.toFixed(2)}</td><td>${(A.gap_fill.ratios_to_studio[k] || 0).toFixed(2)}</td></tr>`).join("")}
      </tbody></table>
      <p class="fineprint">Occupancy by layout: ${R.units.map((u) => `${u.layout} ${pct(A.layouts[u.id].occupancy)}`).join(" · ")}. Defaults are taken from the AMBAR Residence Cards base scenarios and are assumptions to be confirmed. Feed file: ${esc(W.feed_file)}.</p>
    </details>`;
  }

  load().then(render).catch((e) => {
    console.error(e);
    const g = $("#rwGrid"); if (g) g.innerHTML = '<p class="fineprint">Week-ahead data could not be loaded (data/week_ahead.json).</p>';
  });
})();
