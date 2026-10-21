/* Residences · The week ahead — renders data/week_ahead.json (built by update_week_ahead.py
   from the same weekly comparable hotel rates as the rest of the site, data/comps.json). */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
  const usd2 = (v) => (v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v) => Math.round(v * 100) + "%";
  const pct1 = (v) => (v * 100).toFixed(1) + "%";
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

  function costBlock(u) {
    const f = u.monthly_revenue_flow, fx = u.fixed_owner_costs_monthly, b = u.base_scenario;
    const rowsFlow = [
      ["Gross room revenue", f.gross_room_revenue, 1], ["Marriott brand fee · 10%", f.marriott_brand_fee_10pct], ["Hotel operations · 40%", f.hotel_operations_40pct],
      ["Owner share · 50%", f.owner_share_50pct, 1], ["FF&amp;E reserve · 4%", f.ffe_reserve_4pct], ["OTA commissions · 2.5%", f.ota_commissions_2_5pct],
      ["Card processing · 2.41%", f.card_processing_2_41pct], ["Fixed owner costs", f.fixed_owner_costs]
    ];
    const fixed = [["HOA / condo", fx.hoa_condo], ["Property tax", fx.property_tax], ["Insurance (estimate)", fx.insurance_estimate], ["Utilities (estimate)", fx.utilities_estimate]];
    return `<p class="c-h">Fixed owner costs</p>
      <table class="ctab"><thead><tr><th></th><th>Monthly</th><th>Annual</th></tr></thead><tbody>
      ${fixed.map(([k, v]) => `<tr><td>${k}</td><td>${usd2(v)}</td><td>${usd2(v * 12)}</td></tr>`).join("")}
      <tr class="tot"><td>Total fixed costs</td><td>${usd2(fx.total)}</td><td>${usd2(fx.total * 12)}</td></tr></tbody></table>
      <p class="c-note">Property tax basis ${usd2(u.property_tax_annual)} a year. ${u.note ? esc(u.note) : ""}</p>
      <p class="c-h">Document’s figures · base scenario · ${usd(b.adr)} ADR · ${pct(b.occupancy)} occupancy · cash purchase</p>
      <div class="c-kpis"><div><span>Net / month</span><b>${usd(u.net_per_month)}</b></div><div><span>Net / year</span><b>${usd(u.net_per_year)}</b></div><div><span>Cap rate</span><b>${u.cap_rate_pct.toFixed(2)}%</b></div></div>
      <table class="ctab"><thead><tr><th>Monthly revenue flow</th><th></th></tr></thead><tbody>
      ${rowsFlow.map(([k, v, bold]) => `<tr${bold ? ' class="tot"' : ""}><td>${k}</td><td class="${v < 0 ? "neg" : ""}">${usd2(v)}</td></tr>`).join("")}
      <tr class="tot"><td>Owner net before financing</td><td>${usd2(f.owner_net_before_financing)}</td></tr></tbody></table>
      <p class="c-note">Reference list price ${usd(u.reference_list_price)} (per floor plan, not a quote for an individual residence). Cap rate = annual owner net ÷ reference price, before financing; no mortgage or closing costs. Insurance and utilities are estimates, not quotes. The 40% hotel operations allocation (Coury Hospitality) is included above, not an additional deduction.</p>
      <p class="c-note"><b>Note:</b> these net, cap-rate and revenue-flow figures are the document’s own, modeled at the document’s original ${pct(b.occupancy)} occupancy. They are shown unchanged and are not recalculated at the historical base occupancy (73% with size step-down) or this week’s estimate.</p>
      <p class="c-note">Source: AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026 (AMBAR Residence Cards, pp. ${u.doc_pages.join("–")}). Illustrative only; not financial advice.</p>`;
  }


  const fMD = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let STATE = null;
  const statWord = (B) => (B.method === "median" ? "median rate" : "trimmed-mean rate");
  function compCaption(W) {
    const B = W.baseline, T = W.pipeline.hotels_in_landscape, N = B.comp_count, R = B.raw_count, wk = fMD(W.week_start);
    if (N === T) return `Based on the ${statWord(B)} of the ${T} hotels in our Orlando comparable set (week of ${wk})`;
    const why = [R < T ? `${R} had rates that week` : null, B.trimmed_out ? `${B.trimmed_out} outlier trimmed` : null].filter(Boolean).join("; ");
    return `Based on the ${statWord(B)} of ${N} of the ${T} hotels in our Orlando comparable set${why ? ` (${why})` : ""} (week of ${wk})`;
  }

  function header(A, sel, M) {
    const W = sel.out;
    const asOf = fLong(W.as_of), B = W.baseline;
    $("#rwSub").textContent = `What each AMBAR floor plan ${W.week_start === STATE.latest ? "looks" : "looked"} like for the week of ${fLong(W.week_start)}, framed against the median of the comparable Orlando hotels tracked on this page. The comp-set median is treated as a Studio-equivalent nightly rate; every other plan is scaled from it with AMBAR’s floor-plan ratios.`;
    const isLatest = W.week_start === STATE.latest;
    $("#rwTitle").textContent = isLatest ? "What each AMBAR residence looks like this week" : `Week of ${fLong(W.week_start)}: what each AMBAR residence looked like`;
    const names = W.comps.map((c) => `<span class="${c.status === "used" ? "in" : "out"}" title="${esc(c.status === "used" ? "Used this week" : c.status)}">${esc(c.name)}</span>`).join("");
    $("#rwMedianLine").innerHTML = `<b>Estimated nightly rate (ADR) and RevPAU come from the median pricing of our comparable hotel set.</b> ${esc(compCaption(W))}.
      <span class="wa-names" aria-label="Hotels in the comparable set">${names}</span>
      <a href="#rwSummary" class="wa-complink" id="rwCompLink">See each hotel’s rate for this week ↓</a>`;
    $("#rwCompLink").addEventListener("click", () => { const d = $("#rwSummary .wa-comps"); if (d) d.open = true; });
    $("#rwBadges").innerHTML = `<span class="wa-badge live">${isLatest ? "Current snapshot" : "Past week"} · Estimated · as of ${asOf}</span><span class="wa-badge">Comp median of ${B.comp_count} Orlando hotels</span><span class="wa-badge">${esc(A.base_occupancy.label)}</span>`;
    $("#rwDisclaimer").innerHTML = `<b>Estimates, not a promise of returns.</b> Every figure in this section is an estimate for illustration only, as of ${asOf}. The comparables are lowest public nightly rates at Orlando hotels (standard rooms, room types unspecified), not AMBAR residences, and only the Studio is benchmarked to them directly; all other plans are scaled. Actual rates, occupancy, costs and owner income will differ. Nothing here is an offer, investment advice or a statement about any fund or tokenized structure; the wording is subject to review by securities counsel and should not be reused in broker or investor materials.`;
    const wasOpen = $("#rwSummary .wa-comps")?.open;
    const comps = W.comps.map((c) => `<tr><td>${esc(c.name)}${c.non_marriott ? " <small>non-Marriott</small>" : ""}</td><td class="num">${c.weekly_median != null ? usd(c.weekly_median) : "—"}</td><td>${c.priced_nights} of ${c.nights}</td><td>${c.status === "used" ? "Used" : esc(c.status[0].toUpperCase() + c.status.slice(1))}</td></tr>`).join("");
    $("#rwSummary").innerHTML = `<div class="wa-base">
        <div class="wa-base-kpis">
          <div><span>Comp-set ${B.method === "median" ? "median" : "trimmed mean"} · Studio-equivalent baseline</span><b>${usd(B.median)}</b><small>Estimated · as of ${asOf}</small></div>
          <div><span>Range (25th–75th percentile)</span><b>${usd(B.p25)}–${usd(B.p75)}</b><small>across the comp set</small></div>
          <div><span>Comparable hotels</span><b>${B.comp_count}</b><small>${B.trimmed_out ? `${B.trimmed_out} outlier trimmed` : "no outliers trimmed"} · ${W.pipeline.hotels_in_landscape} tracked · confidence ${B.confidence}</small></div>
          <div><span>Mean (diagnostic)</span><b>${usd(B.diag_mean)}</b><small>${B.flagged ? `<span class="flag">Flagged: ${B.gap_pct.toFixed(1)}% from median</span>` : `${B.gap_pct.toFixed(1)}% from median · not flagged`}</small></div>
        </div>
        <details class="wa-comps"${wasOpen ? " open" : ""}><summary>Comparable hotels used for the week of ${fMD(W.week_start)}</summary>
          <div class="wa-scroll"><table class="wa-summary"><thead><tr><th>Hotel</th><th>Week median of priced nights</th><th>Priced nights</th><th>Status</th></tr></thead><tbody>${comps}</tbody></table></div>
          <p class="fineprint">Each hotel contributes one figure: the median of its lowest public nightly rates for the week (nights with no offer are excluded; hotels with fewer than ${A.hotel_median.min_priced_nights} priced nights are left out). Same data as the Week ahead grid above.</p>
        </details></div>`;
  }

  function cards(A, R, W) {
    const byId = Object.fromEntries(W.units.map((u) => [u.id, u]));
    const asOf = fLong(W.as_of);
    $("#rwGrid").innerHTML = R.units.map((u) => {
      const e = byId[u.id], scaled = e.basis === "scaled";
      const spec = [u.bedrooms ? `${u.bedrooms} bed` : "Studio", `${u.bathrooms} bath`, `${u.sqft.toLocaleString("en-US")} sq ft`, u.terrace_sqft ? `${u.terrace_sqft} sq ft terrace` : null, `up to ${u.max_guests} guests`].filter(Boolean).join(" · ");
      const basis = scaled ? `<b>Scaled from the comp median</b> using AMBAR floor-plan ratios (×${e.ratio_to_s1.toFixed(2)} vs S1)` : `Based on <b>${e.comp_count} comparable Orlando hotels</b> (${e.method === "median" ? "median" : "trimmed mean"})`;
      return `<article class="rcard is-clickable" data-type="${u.unit_type}" data-id="${u.id}" id="res-${u.id}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${esc(u.layout)} ${esc(u.name)}: open full details, costs and estimates">
        <div class="r-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)" loading="lazy"></div>
        <div class="r-body">
          <div class="r-top"><div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h3>${esc(u.name)}</h3></div><span class="conf ${e.confidence}" title="${scaled ? "Confidence reduced one step because this plan is scaled, not benchmarked directly" : "Confidence reflects the number of comparables"}">${e.confidence}${scaled ? " · scaled" : ""}</span></div>
          <p class="r-spec">${esc(spec)}<br>${esc(u.details)}</p>
          <dl class="r-metrics">
            <div><dt>Estimated ADR / night</dt><dd>${usd(e.adr)}<small>range ${usd(e.adr_p25)}–${usd(e.adr_p75)}</small></dd></div>
            <div><dt>Estimated RevPAU / night</dt><dd>${usd(e.revpau)}<small>range ${usd(e.revpau_p25)}–${usd(e.revpau_p75)}</small></dd></div>
          </dl>
          <p class="r-cap">${esc(compCaption(W))}.</p>
          <div class="r-vs2">
            <div class="${e.vs_base_adr_pct >= 0 ? "up" : "down"}"><span>ADR vs base</span><b>${sgn(e.vs_base_adr_pct)}</b><small>${usd(e.adr)} vs ${usd(e.base_adr)}</small></div>
            <div class="${e.vs_base_revpau_pct >= 0 ? "up" : "down"}"><span>RevPAU vs base</span><b>${sgn(e.vs_base_revpau_pct)}</b><small>${usd(e.revpau)} vs ${usd(e.base_revpau)} at ${pct1(e.base_occupancy)}</small></div>
          </div>
          <p class="r-meta">${esc(A.occupancy_model.label)} = <b>${pct1(e.occupancy)}</b><br>${esc(A.base_occupancy.label)} = <b>${pct1(e.base_occupancy)}</b><br>Estimated · as of ${asOf} · ${basis}</p>
          <p class="r-open" aria-hidden="true">View full details &amp; costs <span>→</span></p>
        </div></article>`;
    }).join("");
    applyFilter();
  }

  /* ---------- expanded view (modal / full-screen sheet on mobile) ---------- */
  let MODAL_ID = null, LAST_FOCUS = null;
  function modalHTML(u, e, W, A) {
    const asOf = fLong(W.as_of), scaled = e.basis === "scaled";
    const b = u.base_scenario;
    const facts = [["Type", A.unit_types[u.unit_type].label], ["Interior", `${u.sqft.toLocaleString("en-US")} sq ft / ${u.sqm} sq m`],
      ["Bedrooms", u.bedrooms ? u.bedrooms : "Studio"], ["Bathrooms", u.bathrooms], ["Guests", `Up to ${u.max_guests}`],
      ["Terrace", u.terrace_sqft ? `${u.terrace_sqft} sq ft` : "Not listed"]];
    const weeks = STATE.market.weeks.slice().sort((a, c) => (a.week < c.week ? -1 : 1)).map((w) =>
      `<button type="button" class="seg-btn" data-week="${w.week}" aria-pressed="${w.week === W.week_start}"${w.status !== "collected" ? " disabled" : ""}>${fMD(w.week)}${w.status !== "collected" ? " · n/c" : ""}</button>`).join("");
    const f = (k, v, sm) => `<div><dt>${k}</dt><dd>${v}${sm ? `<small>${sm}</small>` : ""}</dd></div>`;
    return `<div class="m-head">
        <div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h2 id="rwModalTitle">${esc(u.name)}</h2>
        <p class="m-asof">Estimated · as of ${asOf}</p></div>
        <button type="button" class="m-close" data-close aria-label="Close">×</button>
      </div>
      <div class="m-scroll">
      <div class="m-grid">
        <figure class="m-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)"><figcaption>Artist’s impression · furniture and finishes are illustrative.</figcaption></figure>
        <div class="m-side">
          <dl class="m-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <p class="r-spec">${esc(u.details)}</p>
          <div class="m-weekbar"><span>Comp week</span><div class="seg" role="group" aria-label="Choose the comp week">${weeks}</div></div>
          <span class="conf ${e.confidence}">${e.confidence}${scaled ? " · scaled" : ""}</span>
          <span class="m-comps">${e.comp_count} comparable hotels${e.method === "median" ? " · median" : " · trimmed mean"}</span>
        </div>
      </div>
      <section class="m-sec" aria-label="This week’s estimates">
        <h3>Estimates for the week of ${fLong(W.week_start)}</h3>
        <dl class="m-kpis">
          ${f("Estimated ADR / night", usd(e.adr), `range ${usd(e.adr_p25)}–${usd(e.adr_p75)}`)}
          ${f("Estimated occupancy", pct1(e.occupancy), esc(A.occupancy_model.label))}
          ${f("Estimated RevPAU / night", usd(e.revpau), `range ${usd(e.revpau_p25)}–${usd(e.revpau_p75)}`)}
        </dl>
        <p class="r-cap">${esc(compCaption(W))}.</p>
        <h4>Historical base</h4>
        <dl class="m-kpis m-kpis-base">
          ${f("Base ADR", usd(e.base_adr), "document base ADR")}
          ${f("Base occupancy", pct1(e.base_occupancy), esc(A.base_occupancy.label))}
          ${f("Base RevPAU", usd2(e.base_revpau), "base ADR × base occupancy")}
        </dl>
        <div class="r-vs2 m-vs">
          <div class="${e.vs_base_adr_pct >= 0 ? "up" : "down"}"><span>ADR vs base</span><b>${sgn(e.vs_base_adr_pct)}</b><small>${usd(e.adr)} vs ${usd(e.base_adr)}</small></div>
          <div class="${e.vs_base_revpau_pct >= 0 ? "up" : "down"}"><span>RevPAU vs base</span><b>${sgn(e.vs_base_revpau_pct)}</b><small>${usd(e.revpau)} vs ${usd(e.base_revpau)} at ${pct1(e.base_occupancy)}</small></div>
        </div>
        <p class="c-note">ADR vs base reflects rates only; RevPAU vs base also reflects the estimated occupancy (${pct(A.occupancy_model.occ_studio)} anchor) vs the historical base (${pct(A.base_occupancy.anchor)} anchor). ${scaled ? `This plan is scaled from the comp median using AMBAR floor-plan ratios (×${e.ratio_to_s1.toFixed(2)} vs S1).` : ""}</p>
      </section>
      <section class="m-sec m-costs" aria-label="Costs and owner economics">
        <h3>Costs &amp; owner economics</h3>
        <dl class="m-kpis m-kpis-doc">
          ${f("Net / year (document)", usd(u.net_per_year), `${usd(u.net_per_month)} / month`)}
          ${f("Cap rate (document)", u.cap_rate_pct.toFixed(2) + "%", "before financing")}
          ${f("Reference list price", usd(u.reference_list_price), "per floor plan")}
        </dl>
        <p class="c-h">Fee structure</p>
        <p class="c-note">Marriott brand fee 10% · Hotel operations 40% (Coury Hospitality) · Owner share 50% · FF&amp;E reserve 4% · OTA commissions 2.5% · Card processing 2.41% (all % of gross room revenue).</p>
        ${costBlock(u)}
      </section>
      <p class="m-disc"><b>Estimates, not a promise of returns.</b> Illustration only, as of ${asOf}; comparables are Orlando hotel rates, not AMBAR residences. Actual rates, occupancy, costs and owner income will differ. Not an offer or investment advice; subject to review by securities counsel.</p>
      </div>`;
  }
  function renderModal() {
    const dlg = $("#rwModal"); if (!dlg || !MODAL_ID || !STATE.out) return;
    const u = STATE.R.units.find((x) => x.id === MODAL_ID), e = STATE.out.units.find((x) => x.id === MODAL_ID);
    const sc = dlg.querySelector(".m-scroll"), top = sc ? sc.scrollTop : 0;
    dlg.querySelector(".m-body").innerHTML = modalHTML(u, e, STATE.out, STATE.A);
    const ns = dlg.querySelector(".m-scroll"); if (ns) ns.scrollTop = top;
  }
  function openModal(id, opener) {
    const dlg = $("#rwModal"); MODAL_ID = id; LAST_FOCUS = opener || document.activeElement;
    renderModal();
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    document.documentElement.classList.add("wa-modal-open");
    dlg.querySelector(".m-close").focus();
  }
  function closeModal() {
    const dlg = $("#rwModal"); if (!dlg.open && !dlg.hasAttribute("open")) return;
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  function initModal() {
    const dlg = $("#rwModal");
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg || ev.target.closest("[data-close]")) { closeModal(); return; }   // backdrop or X
      const wb = ev.target.closest(".m-weekbar [data-week]");
      if (wb && !wb.disabled) selectWeek(wb.dataset.week);
    });
    dlg.addEventListener("close", () => {
      MODAL_ID = null; document.documentElement.classList.remove("wa-modal-open");
      if (LAST_FOCUS && document.contains(LAST_FOCUS)) LAST_FOCUS.focus();
      else { const c = LAST_FOCUS && LAST_FOCUS.dataset && document.querySelector(`#res-${LAST_FOCUS.dataset.id}`); if (c) c.focus(); }
    });
    dlg.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !dlg.showModal) closeModal(); });
    const grid = $("#rwGrid");
    grid.addEventListener("click", (ev) => { const c = ev.target.closest(".rcard"); if (c) openModal(c.dataset.id, c); });
    grid.addEventListener("keydown", (ev) => {
      const c = ev.target.closest(".rcard");
      if (c && ev.target === c && (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar")) { ev.preventDefault(); openModal(c.dataset.id, c); }
    });
  }

  function applyFilter() {
    const b = $("#rwFilter [aria-pressed=true]"), t = b ? b.dataset.t : "all";
    document.querySelectorAll(".rcard").forEach((c) => { c.hidden = t !== "all" && c.dataset.type !== t; });
  }

  function method(A, R, W) {
    const ut = A.unit_types, OM = A.occupancy_model, BO = A.base_occupancy;
    const byId = Object.fromEntries(W.units.map((u) => [u.id, u]));
    const wasOpen = $("#rwMethod details")?.open;
    $("#rwMethod").innerHTML = `<details${wasOpen ? " open" : ""}><summary>How these estimates are calculated</summary>
      <ul>
        <li><b>Comparables.</b> The same weekly comparable hotel rates shown elsewhere on this page (lowest public nightly rates; standard rooms, room types unspecified), for the week selected above. Each hotel contributes the median of its priced nights for the week. Records are de-duplicated, anything older than ${A.pipeline.stale_days} days is dropped, and outliers are trimmed with the interquartile-range rule (k = ${A.pipeline.iqr_k}).</li>
        <li><b>Baseline.</b> The comp-set <b>median</b> is the Studio-equivalent baseline (a trimmed mean if fewer than ${A.pipeline.median_min_n} hotels). The range is the 25th–75th percentile. The mean is kept as a diagnostic; the week is flagged when mean and median differ by more than ${A.pipeline.mean_median_flag_pct}%.</li>
        <li><b>Per plan.</b> <code>ADR = comp median × realization × position index × plan ratio to S1</code>, with the same factors applied to the range. Plan ratios are the document base ADRs divided by the S1 base ADR ($338). <code>RevPAU = ADR × occupancy</code>. No seasonality adjustment is added; the weekly rates already reflect demand.</li>
        <li><b>Occupancy.</b> ${esc(OM.label)}: occupancy starts from the Studio at ${pct1(OM.occ_studio)} (the document’s original occupancy) and steps down ${pct1(OM.d)} for each bedroom, with a den counting as ${OM.den_weight} of a bedroom (<code>Occ = ${pct1(OM.occ_studio)} × (1 − ${OM.d}) ^ size</code>). ${esc(BO.label)}: the same step and den weight from a ${pct1(BO.anchor)} Studio anchor (Callum’s historical figure). The two anchors are separate settings; the step and den weight are proposed and adjustable and apply to both.</li>
        <li><b>Vs. base.</b> Each plan’s base is the document’s base ADR at its historical base occupancy (base RevPAU = base ADR × base occupancy). ADR vs base reflects rates only. RevPAU vs base also reflects the higher estimated occupancy anchor (${pct(OM.occ_studio)} vs ${pct(BO.anchor)}); because both step down by the same factor, that occupancy effect is the same for every plan. Because plans are scaled with ratios from the same document, both percentages are the same for every plan in a given week.</li>
        <li><b>Confidence.</b> High = ${A.pipeline.high_confidence_min_n}+ comparables and not flagged; Medium = fewer comparables or a flagged week; Low = trimmed mean. Plans other than the Studio are scaled, not observed, so their confidence is one step lower.</li>
      </ul>
      <table><thead><tr><th>Plan</th><th>Base ADR</th><th>Ratio to S1</th><th>Size units</th><th>Est. occupancy</th><th>Historical base occ.</th><th>Base RevPAU</th><th>Realization</th><th>Position index</th></tr></thead><tbody>
      ${R.units.map((u) => { const e = byId[u.id], t = ut[u.unit_type]; return `<tr><td>${esc(u.layout)}</td><td>${usd(u.base_scenario.adr)}</td><td>${e.ratio_to_s1.toFixed(3)}</td><td>${e.size_units}</td><td>${pct1(e.occupancy)}</td><td>${pct1(e.base_occupancy)}</td><td>${usd2(e.base_revpau)}</td><td>${t.realization.toFixed(2)}${t.realization_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td><td>${t.position_index.toFixed(2)}${t.position_index_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td></tr>`; }).join("")}
      </tbody></table>
      <p class="fineprint">Settings live in data/week_ahead/assumptions.json: estimated-occupancy anchor ${pct1(OM.occ_studio)}; historical base anchor ${pct1(BO.anchor)}; step d = ${pct1(OM.d)} and den weight = ${OM.den_weight} (proposed, adjustable). The document’s own net and cap-rate figures in each cost breakdown were modeled at its original per-plan occupancy and are not recomputed. Every figure is computed in your browser from data/comps.json for the selected week, so a new weekly rate update flows straight into the cards.</p>
    </details>`;
  }

  function selectWeek(wk, fromTabs) {
    const S = STATE;
    const w = S.market.weeks.find((x) => x.week === wk);
    const note = $("#rwWeekNote");
    if (!w || w.status !== "collected") {
      note.textContent = w ? `The week of ${fLong(w.week)} was not collected, so there are no estimates for it; still showing the week of ${fLong(S.week)}.` : "";
      return;
    }
    let out;
    try { out = S.E.runHotelMedian(S.market, S.A, S.R.units, wk); }
    catch (e) { note.textContent = `Not enough comparable hotels in the week of ${fLong(wk)} to estimate (${e.message}).`; return; }
    note.textContent = "";
    S.week = wk;
    document.querySelectorAll("#rwWeeks button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.week === wk)));
    S.out = out;
    header(S.A, { out }, S.market); cards(S.A, S.R, out); method(S.A, S.R, out);
    if (MODAL_ID) { renderModal(); const wb = $(`#rwModal .m-weekbar [data-week="${wk}"]`); if (wb) wb.focus(); }
    if (!fromTabs) { const t = document.querySelector(`#weekTabs [data-week="${wk}"]`); if (t && t.getAttribute("aria-selected") !== "true") t.click(); }
  }

  function boot(cfgData, market, E) {
    const A = cfgData.assumptions, R = cfgData.residences;
    const collected = E.collectedWeeks(market);
    STATE = { A, R, market, E, latest: collected[collected.length - 1], week: null };
    $("#rwWeeks").innerHTML = market.weeks.slice().sort((a, b) => (a.week < b.week ? -1 : 1)).map((w) =>
      `<button type="button" class="seg-btn" data-week="${w.week}" aria-pressed="false"${w.status !== "collected" ? " disabled title=\"Not collected\"" : ""}>${fMD(w.week)}${w.week === STATE.latest ? " · latest" : ""}${w.status !== "collected" ? " · not collected" : ""}</button>`).join("");
    $("#rwWeeks").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.disabled) selectWeek(b.dataset.week); });
    // follow the site's existing week selector (Week ahead grid) too
    const tabs = $("#weekTabs");
    if (tabs) tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-week]"); if (b) selectWeek(b.dataset.week, true); });
    const seg = $("#rwFilter");
    const TYPES = ["studio", "1br", "2br", "3br"];
    seg.innerHTML = [["all", "All residences"], ...TYPES.map((k) => [k, A.unit_types[k].label])]
      .map(([k, l], i) => `<button type="button" class="seg-btn" data-t="${k}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); applyFilter();
    });
    initModal();
    selectWeek(STATE.latest, true);
  }

  function loadEngine() {
    if (window.WeekAheadEngine) return Promise.resolve(window.WeekAheadEngine);
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "assets/js/week-ahead-engine.js"; s.onload = () => res(window.WeekAheadEngine); s.onerror = rej; document.body.appendChild(s); });
  }

  Promise.all([
    getJSON("data/week_ahead.json", "WEEK_AHEAD_DATA", "data/week_ahead.js"),
    getJSON("data/comps.json", "COMPS_DATA", "data/comps.js"),
    loadEngine()
  ]).then(([W, M, E]) => boot(W, M, E)).catch((e) => {
    console.error(e);
    const g = $("#rwGrid"); if (g) g.innerHTML = '<p class="fineprint">Week-ahead data could not be loaded (data/comps.json, data/week_ahead.json).</p>';
  });
})();
