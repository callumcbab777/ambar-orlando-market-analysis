/* Residences · The week ahead — computes every figure live in the browser (assets/js/week-ahead-engine.js)
   from the comparable hotels' NIGHTLY rates in data/comps.json, for the selected night (default: today in
   America/New_York). data/week_ahead.json supplies the assumptions and floor-plan data. */
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

  function costBlock(u, oe, A) {
    const f = oe.monthly_revenue_flow, fx = oe.fixed_owner_costs_monthly, OE = A.owner_economics;
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
      <p class="c-h">${esc(OE.label)} · ${usd(oe.adr)} base ADR · ${pct1(oe.occupancy)} occupancy · cash purchase</p>
      <div class="c-kpis"><div><span>Net / month</span><b>${usd(oe.net_per_month)}</b></div><div><span>Net / year</span><b>${usd(oe.net_per_year)}</b></div><div><span>Cap rate</span><b>${oe.cap_rate_pct.toFixed(2)}%</b></div></div>
      <table class="ctab"><thead><tr><th>Monthly revenue flow</th><th></th></tr></thead><tbody>
      ${rowsFlow.map(([k, v, bold]) => `<tr${bold ? ' class="tot"' : ""}><td>${k}</td><td class="${v < 0 ? "neg" : ""}">${usd2(v)}</td></tr>`).join("")}
      <tr class="tot"><td>Owner net before financing</td><td>${usd2(f.owner_net_before_financing)}</td></tr></tbody></table>
      <p class="c-note">Reference list price ${usd(u.reference_list_price)} (per floor plan, not a quote for an individual residence). Cap rate = annual owner net ÷ reference price, before financing; no mortgage or closing costs. Insurance and utilities are estimates, not quotes. The 40% hotel operations allocation (Coury Hospitality) is included above, not an additional deduction.</p>
      <p class="c-note"><b>${esc(OE.note)}</b> Gross = base ADR × ${esc(A.occupancy_model.label.toLowerCase())} (${pct1(oe.occupancy)} for this plan) × ${OE.days_per_year} ÷ 12, then the revenue flow above. These figures stay at base ADR and do not change with the selected night or week.</p>
      <p class="c-note">Source: AMBAR Rental Program Cost Breakdown — Owner Economics, Oct 12, 2026; Building 1 HOA budget updated Oct 9, 2026 (AMBAR Residence Cards, pp. ${u.doc_pages.join("–")}). Illustrative only; not financial advice.</p>`;
  }


  const fMD = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fNight = (iso) => { const d = new Date(iso + "T12:00:00"); return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`; }; // "Thu Oct 22"
  const fDow = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
  const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5);
  /* today's date in Orlando (America/New_York), whatever the visitor's own time zone */
  function orlandoToday() {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day}`;
    } catch (e) { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  }
  const METRICS = {
    adr: { key: "adr", vs: "vs_base_adr_pct", base: "base_adr", short: "ADR", btn: "ADR · nightly rate", label: "Estimated ADR · average nightly rate",
      hint: "ADR (average daily rate) = the estimated rate per occupied night." },
    revpar: { key: "revpau", vs: "vs_base_revpau_pct", base: "base_revpau", short: "RevPAR", btn: "RevPAR · revenue per night", label: "Estimated RevPAR · revenue per night",
      hint: "RevPAR (revenue per available night) = estimated ADR × estimated occupancy." }
  };
  let STATE = null;
  const statWord = (B) => (B.method === "median" ? "median rate" : "trimmed-mean rate");
  /* card caption: names the night and shows 'N of 11' when fewer hotels count */
  function compCaption(W) {
    const B = W.baseline, T = W.pipeline.hotels_in_landscape, N = B.comp_count;
    return N === T ? `Based on the ${statWord(B)} of the ${T} hotels in our Orlando comparable set (${fNight(W.night)})`
      : `Based on the ${statWord(B)} of ${N} of the ${T} hotels in our Orlando comparable set (${fNight(W.night)})`;
  }
  function whyFewer(W) {
    const B = W.baseline, T = W.pipeline.hotels_in_landscape, P = W.pipeline.hotels_priced;
    return [P < T ? `${T - P} had no rate that night` : null, W.pipeline.stale_removed ? `${W.pipeline.stale_removed} stale` : null,
      B.trimmed_out ? `${B.trimmed_out} outlier${B.trimmed_out > 1 ? "s" : ""} trimmed` : null].filter(Boolean).join("; ");
  }
  const tense = (W) => (W.night < STATE.today ? "looked" : "looks");
  function nightTitle(W) {
    if (W.night === STATE.today) return `What each AMBAR residence looks like tonight · ${fNight(W.night)}`;
    return `What each AMBAR residence ${tense(W)} like on ${fNight(W.night)}`;
  }

  function header(A, W) {
    const asOf = fLong(W.as_of), B = W.baseline, isToday = W.night === STATE.today;
    $("#rwTitle").textContent = nightTitle(W);
    $("#rwSub").textContent = `What each AMBAR floor plan ${tense(W)} like for the night of ${fLong(W.night)}, framed against the ${B.method === "median" ? "median" : "trimmed mean"} of that night’s rates at the comparable Orlando hotels tracked on this page. The comp-set figure is treated as a Studio-equivalent nightly rate; every other plan is scaled from it with AMBAR’s floor-plan ratios. Pick another night or week below.`;
    const names = W.comps.map((c) => `<span class="${c.status === "used" ? "in" : "out"}" title="${esc(c.status === "used" ? `Used: ${usd(c.rate)} on ${fNight(W.night)}` : c.status)}">${esc(c.name)}</span>`).join("");
    const why = whyFewer(W);
    $("#rwMedianLine").innerHTML = `<b>Estimated nightly rate (ADR) and revenue per night (RevPAR) come from the median pricing of our comparable hotel set.</b> ${esc(compCaption(W))}${why ? ` (${esc(why)})` : ""}.
      <span class="wa-names" aria-label="Hotels in the comparable set">${names}</span>
      <a href="#rwSummary" class="wa-complink" id="rwCompLink">See each hotel’s rate for ${esc(fNight(W.night))} ↓</a>`;
    $("#rwCompLink").addEventListener("click", () => { const d = $("#rwSummary .wa-comps"); if (d) d.open = true; });
    const tag = isToday ? "Tonight" : W.night < STATE.today ? "Past night" : "Upcoming night";
    $("#rwBadges").innerHTML = `<span class="wa-badge live">${tag} · Estimated · as of ${asOf}</span><span class="wa-badge">Comp ${B.method === "median" ? "median" : "trimmed mean"} of ${B.comp_count} of ${W.pipeline.hotels_in_landscape} Orlando hotels</span><span class="wa-badge">${esc(A.base_occupancy.label)}</span>`;
    $("#rwDisclaimer").innerHTML = `<b>Estimates, not a promise of returns.</b> Every figure in this section is an estimate for illustration only, for the night of ${asOf}. The comparables are lowest public nightly rates at Orlando hotels (standard rooms, room types unspecified), captured on the weekly snapshot date, not AMBAR residences, and only the Studio is benchmarked to them directly; all other plans are scaled. Actual rates, occupancy, costs and owner income will differ. Nothing here is an offer, investment advice or a statement about any fund or tokenized structure; the wording is subject to review by securities counsel and should not be reused in broker or investor materials.`;
    const wasOpen = $("#rwSummary .wa-comps")?.open;
    const comps = W.comps.map((c) => `<tr><td>${esc(c.name)}${c.non_marriott ? " <small>non-Marriott</small>" : ""}</td><td class="num">${c.rate != null ? usd(c.rate) : "—"}</td><td>${c.snapshot ? fMD(c.snapshot) : "—"}</td><td>${c.status === "used" ? "Used" : esc(c.status[0].toUpperCase() + c.status.slice(1))}</td></tr>`).join("");
    $("#rwSummary").innerHTML = `<div class="wa-base">
        <div class="wa-base-kpis">
          <div><span>Comp-set ${B.method === "median" ? "median" : "trimmed mean"} · ${esc(fNight(W.night))}</span><b>${usd(B.median)}</b><small>Studio-equivalent baseline · estimated</small></div>
          <div><span>Range (25th–75th percentile)</span><b>${usd(B.p25)}–${usd(B.p75)}</b><small>across the comp set that night</small></div>
          <div><span>Comparable hotels</span><b>${B.comp_count} <small style="display:inline;font-size:.9rem">of ${W.pipeline.hotels_in_landscape}</small></b><small>${why ? esc(why) : "all priced, no outliers trimmed"} · confidence ${B.confidence}</small></div>
          <div><span>Mean (diagnostic)</span><b>${usd(B.diag_mean)}</b><small>${B.flagged ? `<span class="flag">Flagged: ${B.gap_pct.toFixed(1)}% from median</span>` : `${B.gap_pct.toFixed(1)}% from median · not flagged`}</small></div>
        </div>
        <details class="wa-comps"${wasOpen ? " open" : ""}><summary>Comparable hotel rates for ${esc(fNight(W.night))}</summary>
          <div class="wa-scroll"><table class="wa-summary"><thead><tr><th>Hotel</th><th>Lowest public rate, ${esc(fNight(W.night))}</th><th>Snapshot</th><th>Status</th></tr></thead><tbody>${comps}</tbody></table></div>
          <p class="fineprint">Each hotel contributes one figure: its lowest public nightly rate for this night, from the weekly snapshot (nights with no offer are left out). Same data as the Week ahead grid above.</p>
        </details></div>`;
  }

  /* controls: week, night chips (Mon–Sun of the selected week), metric */
  function weekButtons(cur, cls) {
    return STATE.market.weeks.slice().sort((a, b) => (a.week < b.week ? -1 : 1)).map((w) =>
      `<button type="button" class="seg-btn" data-week="${w.week}" aria-pressed="${w.week === cur}"${w.status !== "collected" ? ' disabled title="Not collected"' : ""}>${fMD(w.week)}${cls === "main" && w.week === STATE.latest ? " · latest" : ""}${w.status !== "collected" ? (cls === "main" ? " · not collected" : " · n/c") : ""}</button>`).join("");
  }
  function nightChips(W) {
    const wk = STATE.market.weeks.find((w) => w.week === W.week_start), end = wk.week_end || addDays(wk.week, 6), out = [];
    for (let d = wk.week; d <= end; d = addDays(d, 1)) {
      const r = STATE.nights[d], ok = r && !r.error, today = d === STATE.today;
      out.push(`<button type="button" class="seg-btn wa-day${today ? " is-today" : ""}" data-night="${d}" aria-pressed="${d === W.night}"${ok ? "" : ` disabled title="${esc(r ? r.error : "No rates collected for this night")}"`} aria-label="${esc(fLong(d))}${today ? " (today)" : ""}"><span>${fDow(d)}</span><b>${new Date(d + "T12:00:00").getDate()}</b>${today ? "<i>Today</i>" : ""}</button>`);
    }
    return out.join("");
  }
  function controls(W) {
    $("#rwWeeks").innerHTML = weekButtons(W.week_start, "main");
    $("#rwDays").innerHTML = nightChips(W);
    ["#rwWeeks", "#rwDays"].forEach((id) => {   // keep the selected week / night visible when the bar scrolls (mobile)
      const box = $(id), sel = box.querySelector("[aria-pressed=true]");
      if (sel && box.scrollWidth > box.clientWidth) { const a = sel.getBoundingClientRect(), c = box.getBoundingClientRect(); box.scrollLeft += a.left - c.left - (box.clientWidth - a.width) / 2; }
    });
    $("#rwMetric").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === STATE.metric)));
    $("#rwMetricHint").textContent = METRICS[STATE.metric].hint;
  }

  function cards(A, R, W) {
    const byId = Object.fromEntries(W.units.map((u) => [u.id, u]));
    const M = METRICS[STATE.metric], cap = esc(compCaption(W)) + ".";
    $("#rwGrid").innerHTML = R.units.map((u) => {
      const e = byId[u.id], scaled = e.basis === "scaled", v = e[M.key], vs = e[M.vs];
      const spec = [u.bedrooms ? `${u.bedrooms} bed` : "Studio", `${u.bathrooms} bath`, `${u.sqft.toLocaleString("en-US")} sq ft`, u.terrace_sqft ? `${u.terrace_sqft} sq ft terrace` : null, `up to ${u.max_guests} guests`].filter(Boolean).join(" · ");
      return `<article class="rcard is-clickable" data-type="${u.unit_type}" data-id="${u.id}" id="res-${u.id}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${esc(u.layout)} ${esc(u.name)}: ${M.short} ${usd(v)} for ${esc(fNight(W.night))}, ${sgn(vs)} vs base. Open full details, costs and estimates">
        <div class="r-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)" loading="lazy"></div>
        <div class="r-body">
          <div class="r-top"><div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h3>${esc(u.name)}</h3></div><span class="conf ${e.confidence}" title="${scaled ? "Confidence reduced one step because this plan is scaled, not benchmarked directly" : "Confidence reflects the number of comparables"}">${e.confidence}</span></div>
          <p class="r-spec">${esc(spec)}<br>${esc(u.details)}</p>
          <div class="r-one">
            <p class="r-one-l">${M.label}</p>
            <p class="r-one-v">${usd(v)}<span class="r-one-n">${esc(fNight(W.night))}</span></p>
            <p class="r-one-vs ${vs >= 0 ? "up" : "down"}" title="${M.short} ${usd(v)} vs base ${M.short} ${M.key === "adr" ? usd(e[M.base]) : usd2(e[M.base])}"><b>${sgn(vs)}</b> vs base ${M.short}</p>
          </div>
          <p class="r-cap">${cap}</p>
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
    const weeks = weekButtons(W.week_start, "modal"), days = nightChips(W);
    const f = (k, v, sm) => `<div><dt>${k}</dt><dd>${v}${sm ? `<small>${sm}</small>` : ""}</dd></div>`;
    return `<div class="m-head">
        <div><p class="r-code">${esc(u.layout)} · ${esc(A.unit_types[u.unit_type].label)}</p><h2 id="rwModalTitle">${esc(u.name)}</h2>
        <p class="m-asof">Estimated · ${esc(fNight(W.night))}${W.night === STATE.today ? " (tonight)" : ""}</p></div>
        <button type="button" class="m-close" data-close aria-label="Close">×</button>
      </div>
      <div class="m-scroll">
      <div class="m-grid">
        <figure class="m-img"><img src="${esc(u.image)}" alt="Overhead rendering of the ${esc(u.layout)} ${esc(u.name)} (artist’s impression)"><figcaption>Artist’s impression · furniture and finishes are illustrative.</figcaption></figure>
        <div class="m-side">
          <dl class="m-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <p class="r-spec">${esc(u.details)}</p>
          <div class="m-weekbar"><span>Comp week</span><div class="seg" role="group" aria-label="Choose the comp week">${weeks}</div></div>
          <div class="m-weekbar m-daybar"><span>Night</span><div class="seg wa-days" role="group" aria-label="Choose the night">${days}</div></div>
          <span class="conf ${e.confidence}">${e.confidence}${scaled ? " · scaled" : ""}</span>
          <span class="m-comps">${e.comp_count} of ${W.pipeline.hotels_in_landscape} comparable hotels${e.method === "median" ? " · median" : " · trimmed mean"} · ${esc(fNight(W.night))}</span>
        </div>
      </div>
      <section class="m-sec" aria-label="Estimates for the selected night">
        <h3>Estimates for ${esc(fNight(W.night))}${W.night === STATE.today ? " (tonight)" : ""}</h3>
        <dl class="m-kpis">
          ${f("Estimated ADR / night", usd(e.adr), `range ${usd(e.adr_p25)}–${usd(e.adr_p75)}`)}
          ${f("Estimated occupancy", pct1(e.occupancy), esc(A.occupancy_model.label))}
          ${f("Estimated RevPAR · revenue per night", usd(e.revpau), `range ${usd(e.revpau_p25)}–${usd(e.revpau_p75)}`)}
        </dl>
        <p class="r-cap">${esc(compCaption(W))}.</p>
        <h4>Historical base</h4>
        <dl class="m-kpis m-kpis-base">
          ${f("Base ADR", usd(e.base_adr), "base ADR")}
          ${f("Base occupancy", pct1(e.base_occupancy), esc(A.base_occupancy.label))}
          ${f("Base RevPAR", usd2(e.base_revpau), "base ADR × base occupancy")}
        </dl>
        <div class="r-vs2 m-vs">
          <div class="${e.vs_base_adr_pct >= 0 ? "up" : "down"}"><span>ADR vs base</span><b>${sgn(e.vs_base_adr_pct)}</b><small>${usd(e.adr)} vs ${usd(e.base_adr)}</small></div>
          <div class="${e.vs_base_revpau_pct >= 0 ? "up" : "down"}"><span>RevPAR vs base</span><b>${sgn(e.vs_base_revpau_pct)}</b><small>${usd(e.revpau)} vs ${usd(e.base_revpau)} at ${pct1(e.base_occupancy)}</small></div>
        </div>
        <p class="c-note">ADR vs base reflects rates only; RevPAR (revenue per available night = ADR × occupancy) vs base also reflects the estimated occupancy (${pct(A.occupancy_model.occ_studio)} anchor) vs the historical base (${pct(A.base_occupancy.anchor)} anchor). ${scaled ? `This plan is scaled from the comp median using AMBAR floor-plan ratios (×${e.ratio_to_s1.toFixed(2)} vs S1).` : ""}</p>
      </section>
      <section class="m-sec m-costs" aria-label="Costs and owner economics">
        <h3>Costs &amp; owner economics</h3>
        <p class="c-h">${esc(A.owner_economics.label)}</p>
        <dl class="m-kpis m-kpis-doc">
          ${f("Net / year", usd(e.owner_economics.net_per_year), `${usd(e.owner_economics.net_per_month)} / month`)}
          ${f("Cap rate", e.owner_economics.cap_rate_pct.toFixed(2) + "%", "before financing")}
          ${f("Reference list price", usd(u.reference_list_price), "per floor plan")}
        </dl>
        <p class="c-note m-oe-note">${esc(A.owner_economics.note)}</p>
        <p class="c-h">Fee structure</p>
        <p class="c-note">Marriott brand fee 10% · Hotel operations 40% (Coury Hospitality) · Owner share 50% · FF&amp;E reserve 4% · OTA commissions 2.5% · Card processing 2.41% (all % of gross room revenue).</p>
        ${costBlock(u, e.owner_economics, A)}
      </section>
      <p class="m-disc"><b>Estimates, not a promise of returns.</b> Illustration only, for the night of ${asOf}; comparables are Orlando hotel rates, not AMBAR residences. Actual rates, occupancy, costs and owner income will differ. Not an offer or investment advice; subject to review by securities counsel.</p>
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
      if (wb && !wb.disabled) { selectWeek(wb.dataset.week); return; }
      const nb = ev.target.closest(".m-weekbar [data-night]");
      if (nb && !nb.disabled) selectNight(nb.dataset.night);
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
        <li><b>Comparables.</b> The same comparable hotel rates shown in the Week ahead grid on this page (lowest public nightly rates; standard rooms, room types unspecified), for the <b>night</b> selected above (today in Orlando by default). Each hotel contributes its rate for that one night; hotels with no offer that night are left out (shown as “N of ${W.pipeline.hotels_in_landscape}”). Records are de-duplicated, a rate whose snapshot was captured more than ${A.pipeline.stale_days} days before the night is dropped as stale, and outliers are trimmed with the interquartile-range rule (k = ${A.pipeline.iqr_k}).</li>
        <li><b>Baseline.</b> The comp-set <b>median</b> is the Studio-equivalent baseline (a trimmed mean with ${A.pipeline.gap_fill_min_n}–${A.pipeline.median_min_n - 1} hotels; below ${A.pipeline.gap_fill_min_n} hotels the night is not estimated and its chip is disabled). The range is the 25th–75th percentile. The mean is kept as a diagnostic; the night is flagged when mean and median differ by more than ${A.pipeline.mean_median_flag_pct}%.</li>
        <li><b>Per plan.</b> <code>ADR = comp median × realization × position index × plan ratio to S1</code>, with the same factors applied to the range. Plan ratios are each plan’s base ADR divided by the S1 base ADR ($338). <code>RevPAR = ADR × occupancy</code> (revenue per available night). No seasonality adjustment is added; the nightly rates already reflect demand.</li>
        <li><b>Occupancy.</b> ${esc(OM.label)}: occupancy starts from the Studio at ${pct1(OM.occ_studio)} and steps down ${pct1(OM.d)} for each bedroom, with a den counting as ${OM.den_weight} of a bedroom (<code>Occ = ${pct1(OM.occ_studio)} × (1 − ${OM.d}) ^ size</code>). ${esc(BO.label)}: the same step and den weight from a ${pct1(BO.anchor)} Studio anchor (Callum’s historical figure). The two anchors are separate settings; the step and den weight are proposed and adjustable and apply to both.</li>
        <li><b>Vs. base.</b> Each plan’s base is its base ADR at its historical base occupancy (base RevPAR = base ADR × base occupancy). ADR vs base reflects rates only. RevPAR vs base also reflects the higher estimated occupancy anchor (${pct(OM.occ_studio)} vs ${pct(BO.anchor)}); because both step down by the same factor, that occupancy effect is the same for every plan. Because plans are scaled with ratios from the same base ADRs, both percentages are the same for every plan on a given night. The ADR / RevPAR switch above the cards chooses which one each card shows.</li>
        <li><b>Example of Owner Economics.</b> In each expanded view: gross = base ADR × estimated occupancy (size step-down) × 365 ÷ 12, less the Marriott brand fee (10%) and hotel operations (40%); the owner’s 50% share then bears FF&amp;E (4%), OTA (2.5%) and card processing (2.41%) of gross and the fixed costs (HOA, property tax, insurance, utilities). Cap rate = annual net ÷ reference list price. At the original per-plan occupancies this formula reproduces the AMBAR cost breakdown exactly. Example at base ADR with size step-down occupancy; not a forecast, and it does not change with the selected night or week.</li>
        <li><b>Confidence.</b> High = ${A.pipeline.high_confidence_min_n}+ comparables and not flagged; Medium = fewer comparables or a flagged night; Low = trimmed mean. Plans other than the Studio are scaled, not observed, so their confidence is one step lower.</li>
      </ul>
      <table><thead><tr><th>Plan</th><th>Base ADR</th><th>Ratio to S1</th><th>Size units</th><th>Est. occupancy</th><th>Historical base occ.</th><th>Base RevPAR</th><th>Realization</th><th>Position index</th></tr></thead><tbody>
      ${R.units.map((u) => { const e = byId[u.id], t = ut[u.unit_type]; return `<tr><td>${esc(u.layout)}</td><td>${usd(u.base_scenario.adr)}</td><td>${e.ratio_to_s1.toFixed(3)}</td><td>${e.size_units}</td><td>${pct1(e.occupancy)}</td><td>${pct1(e.base_occupancy)}</td><td>${usd2(e.base_revpau)}</td><td>${t.realization.toFixed(2)}${t.realization_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td><td>${t.position_index.toFixed(2)}${t.position_index_status === "NEEDS_INPUT" ? " (to confirm)" : ""}</td></tr>`; }).join("")}
      </tbody></table>
      <p class="fineprint">Settings live in data/week_ahead/assumptions.json: estimated-occupancy anchor ${pct1(OM.occ_studio)}; historical base anchor ${pct1(BO.anchor)}; step d = ${pct1(OM.d)} and den weight = ${OM.den_weight} (proposed, adjustable). The Example of Owner Economics in each expanded view is recomputed at base ADR with the estimated size step-down occupancy, using the same revenue-flow formula and fixed costs; it does not change with the selected night or week. Every figure is computed in your browser from data/comps.json for the selected night, so a new weekly rate update flows straight into the cards.</p>
    </details>`;
  }

  function render() {
    const S = STATE, W = S.out;
    controls(W); header(S.A, W); cards(S.A, S.R, W); method(S.A, S.R, W);
    if (MODAL_ID) renderModal();
  }
  function selectNight(night, opts = {}) {
    const S = STATE, out = S.nights[night];
    if (!out || out.error) { $("#rwWeekNote").textContent = `No estimate for ${fLong(night)}: ${out ? out.error : "no comparable rates were collected for this night"}.`; return; }
    if (!opts.keepNote) $("#rwWeekNote").textContent = "";
    const weekChanged = S.out && S.out.week_start !== out.week_start;
    S.night = night; S.out = out; S.week = out.week_start;
    render();
    if (MODAL_ID && opts.focus !== false) { const b = $(`#rwModal [data-night="${night}"]`); if (b) b.focus(); }
    if ((weekChanged || opts.syncTabs) && !opts.fromTabs) { const t = document.querySelector(`#weekTabs [data-week="${out.week_start}"]`); if (t && t.getAttribute("aria-selected") !== "true") t.click(); }
  }
  /* a week's default night: today if it is in that week, else the first night with an estimate */
  function selectWeek(wk, fromTabs) {
    const S = STATE, w = S.market.weeks.find((x) => x.week === wk), note = $("#rwWeekNote");
    if (!w || w.status !== "collected") {
      note.textContent = w ? `The week of ${fLong(w.week)} was not collected, so there are no estimates for it; still showing ${fLong(S.night)}.` : "";
      return;
    }
    if (S.out && S.out.week_start === wk) return;
    const nights = Object.keys(S.nights).filter((n) => !S.nights[n].error && S.nights[n].week_start === wk).sort();
    if (!nights.length) { note.textContent = `Not enough comparable hotels on any night in the week of ${fLong(wk)} to estimate.`; return; }
    selectNight(nights.includes(S.today) ? S.today : nights[0], { fromTabs, focus: false });
    if (MODAL_ID) { const b = $(`#rwModal .m-weekbar [data-week="${wk}"]`); if (b) b.focus(); }
  }

  function boot(cfgData, market, E) {
    const A = cfgData.assumptions, R = cfgData.residences;
    const collected = E.collectedWeeks(market);
    const nights = E.runAllNights(market, A, R.units);
    const avail = Object.keys(nights).filter((n) => !nights[n].error).sort();
    const qs = new URLSearchParams(location.search).get("night");
    STATE = { A, R, market, E, nights, latest: collected[collected.length - 1], week: null, night: null, out: null, metric: "adr", today: orlandoToday() };
    const seg = $("#rwFilter");
    const TYPES = ["studio", "1br", "2br", "3br"];
    seg.innerHTML = [["all", "All residences"], ...TYPES.map((k) => [k, A.unit_types[k].label])]
      .map(([k, l], i) => `<button type="button" class="seg-btn" data-t="${k}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("");
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); applyFilter();
    });
    const ms = $("#rwMetric");
    ms.innerHTML = Object.entries(METRICS).map(([k, m]) => `<button type="button" class="seg-btn" data-m="${k}" aria-pressed="${k === "adr"}">${esc(m.btn)}</button>`).join("");
    ms.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.dataset.m === STATE.metric) return; STATE.metric = b.dataset.m; controls(STATE.out); cards(STATE.A, STATE.R, STATE.out); });
    $("#rwWeeks").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.disabled) selectWeek(b.dataset.week); });
    $("#rwDays").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.disabled) selectNight(b.dataset.night); });
    // follow the site's existing week selector (Week ahead grid) too
    const tabs = $("#weekTabs");
    if (tabs) tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-week]"); if (b) selectWeek(b.dataset.week, true); });
    initModal();
    if (!avail.length) { $("#rwGrid").innerHTML = '<p class="fineprint">No night in data/comps.json has enough comparable hotel rates to estimate.</p>'; return; }
    // default: today (Orlando time) if it has an estimate, else the nearest night that does (ties go to the later night)
    let pick = qs && avail.includes(qs) ? qs : STATE.today, note = "";
    if (!avail.includes(pick)) {
      pick = avail.slice().sort((a, b) => Math.abs(dayDiff(a, STATE.today)) - Math.abs(dayDiff(b, STATE.today)) || (a < b ? 1 : -1))[0];
      note = `Today (${fNight(STATE.today)}) has no comparable hotel rates yet, so this shows the nearest night with data: ${fNight(pick)}.`;
    }
    selectNight(pick, { syncTabs: true, focus: false });
    if (note) $("#rwWeekNote").textContent = note;
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
