/* AMBAR Orlando · favourite-hotel summaries for My Profile and the market page (home "dashboard").
   Pure helpers over data/comps.json (window.COMPS_DATA in the browser, require() in Node; tested in
   tests/js/fav_hotels_test.js). Only figures that are already in the comps data are shown: lowest public nightly
   rates observed on the snapshot date, never benchmarks, estimates or averages from anywhere else. A night or week
   without a rate says "Not collected" (or "No public rate" when the brief marked it UNAVAILABLE).
   Browser API: window.AMBAR_FAV_HOTELS = { summarize, summarizeAll, cardHtml, panelHtml }. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_FAV_HOTELS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const NC = "Not collected";
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const pad = (n) => String(n).padStart(2, "0");
  const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => (v == null || !(Number(v) > 0) ? NC : "$" + Math.round(v).toLocaleString("en-US"));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fMD = (iso) => (ISO_RE.test(iso || "") ? `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}` : "");
  const ok = (r) => r && r.status === "OK" && Number(r.rate) > 0;
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

  /* one week's figures for one hotel: mean / low / high of the priced nights, n of 7 priced */
  function weekStats(db, hotelId, w) {
    if (!w || w.status !== "collected") return { week: w ? w.week : "", label: w ? w.label || "" : "", collected: false, n: 0, of: 7, mean: null, min: null, max: null, status: NC };
    const rs = (db.rates || []).filter((r) => r.hotel === hotelId && r.week === w.week);
    const p = rs.filter(ok).map((r) => Number(r.rate));
    const unav = rs.filter((r) => r.status === "UNAVAILABLE").length;
    return {
      week: w.week, week_end: w.week_end || "", label: w.label || "", collected: true, n: p.length, of: 7,
      mean: p.length ? Math.round(mean(p)) : null, min: p.length ? Math.min(...p) : null, max: p.length ? Math.max(...p) : null,
      status: p.length ? "OK" : unav ? "No public rate" : NC,
      source: [...new Set(rs.map((r) => r.source).filter(Boolean))].join("; "),
    };
  }

  /* summarize(db, hotelId, today?) → null when the hotel isn't in the comps data */
  function summarize(db, hotelId, today) {
    if (!db || !Array.isArray(db.hotels)) return null;
    const h = db.hotels.find((x) => x.id === hotelId);
    if (!h) return null;
    today = ISO_RE.test(today || "") ? today : todayLocal();
    const weeks = (db.weeks || []).filter((w) => w.week <= today || w.status === "collected").slice().sort((a, b) => a.week.localeCompare(b.week));
    const collected = weeks.filter((w) => w.status === "collected");
    const latest = collected[collected.length - 1] || null;
    /* tonight: the rate row for today's date, if the data has one */
    const row = (db.rates || []).find((r) => r.hotel === hotelId && r.date === today);
    const tonight = { date: today, rate: row && ok(row) ? Number(row.rate) : null, status: row ? (ok(row) ? "OK" : row.status === "UNAVAILABLE" ? "No public rate" : NC) : NC, source: row ? row.source || "" : "" };
    /* week ahead = the latest collected week (the same week as the "Week ahead" grid on the market page) */
    const weekAhead = latest ? weekStats(db, hotelId, latest) : weekStats(db, hotelId, null);
    /* recent = the four weeks before it in the window, gaps included and labelled */
    const idx = latest ? weeks.indexOf(latest) : weeks.length;
    const recent = weeks.slice(Math.max(0, idx - 4), idx).reverse().map((w) => weekStats(db, hotelId, w));
    const notes = (db.hotel_notes || []).filter((n) => n.hotel === hotelId && (n.demand_note || n.rate_note)).sort((a, b) => b.week.localeCompare(a.week));
    const note = notes[0] || null;
    return {
      id: h.id, name: h.name, short: h.short || h.name, brand: h.brand || "", tier: h.tier || "", parent: h.parent || "",
      non_marriott: !!h.non_marriott, area: h.area || "", address: h.address || "", keys: Number(h.keys) > 0 ? Number(h.keys) : null,
      on_disney_property: !!h.on_disney_property, distance_to_epcot_mi: typeof h.distance_to_epcot_mi === "number" ? h.distance_to_epcot_mi : null,
      blurb: h.blurb || "", tonight, weekAhead, recent,
      note: note ? { week: note.week, demand: note.demand_note || "", rate: note.rate_note || "" } : null,
      rate_definition: (db.meta && db.meta.rate_definition) || "",
      has_rates: tonight.rate != null || weekAhead.n > 0 || recent.some((r) => r.n > 0),
    };
  }
  /* ids in profile order; ids not in the data come back in .missing so the page can say so */
  function summarizeAll(db, ids, today) {
    const out = [], missing = [];
    for (const id of ids || []) { const s = summarize(db, id, today); if (s) out.push(s); else missing.push(id); }
    return { hotels: out, missing };
  }

  const range = (w) => (w.n ? (w.min === w.max ? money(w.min) : `${money(w.min)}–${money(w.max).slice(1)}`) : w.status);
  /* one card; opts: { root: "../" | "", rm: bool (show remove button), headingLevel: 3|4 } */
  function cardHtml(s, opts = {}) {
    const root = opts.root || "", hl = opts.headingLevel || 3;
    const facts = [
      s.tier && `<span class="pill t-${esc(s.tier)}">${esc(s.tier)}</span>`,
      s.brand && `<span class="pill">${esc(s.brand)}</span>`,
      s.non_marriott ? `<span class="pill pill-nm">Non-Marriott${s.parent && s.parent !== s.brand ? " · " + esc(s.parent) : ""}</span>` : s.parent ? `<span class="pill">${esc(s.parent)}</span>` : "",
    ].filter(Boolean).join("");
    const meta = [s.area, s.keys ? `${s.keys.toLocaleString("en-US")} keys` : "", s.on_disney_property ? "On Walt Disney World® property" : "",
      s.distance_to_epcot_mi != null ? `≈ ${s.distance_to_epcot_mi} mi straight-line to EPCOT` : ""].filter(Boolean).map(esc).join(" · ");
    const wa = s.weekAhead;
    const waLabel = wa.week ? `Week ahead · w/c ${fMD(wa.week)}` : "Week ahead";
    const recent = s.recent.length ? `<div class="fh-recent"><p class="fh-k">Recent weeks · mean of priced nights</p><ul>${s.recent.map((w) =>
      `<li><span>w/c ${esc(fMD(w.week))}</span><b>${w.n ? money(w.mean) : esc(w.status)}</b>${w.n ? `<small>${w.n}/7 priced</small>` : `<small>${w.collected ? "no priced nights" : "week not collected"}</small>`}</li>`).join("")}</ul></div>` : "";
    const empty = !s.has_rates ? `<p class="fh-none">${NC}: there are no lowest-rate figures for this hotel in the site’s data yet.</p>` : "";
    return `<article class="fh-card" data-fav-hotel="${esc(s.id)}" aria-labelledby="fh-${esc(s.id)}${opts.idSuffix || ""}">
      <div class="fh-head"><div class="pills">${facts}</div>
        <h${hl} id="fh-${esc(s.id)}${opts.idSuffix || ""}" class="fh-name"><a href="${esc(root)}index.html#hotel-${esc(s.id)}">${esc(s.name)}</a></h${hl}>
        ${meta ? `<p class="fh-meta">${meta}</p>` : ""}${s.address ? `<p class="fh-addr">${esc(s.address)}</p>` : ""}</div>
      <dl class="fh-stats">
        <div><dt>Tonight · ${esc(fMD(s.tonight.date))}</dt><dd><b>${s.tonight.rate != null ? money(s.tonight.rate) : esc(s.tonight.status)}</b>${s.tonight.rate != null ? `<small>lowest public rate</small>` : ""}</dd></div>
        <div><dt>${esc(waLabel)}</dt><dd><b>${wa.n ? money(wa.mean) : esc(wa.status)}</b><small>${wa.n ? `mean of ${wa.n}/7 priced nights · ${esc(range(wa))}` : wa.collected ? "no priced nights" : ""}</small></dd></div>
      </dl>${recent}${empty}
      ${s.note && s.note.demand ? `<p class="fh-note"><span>Brief note, w/c ${esc(fMD(s.note.week))}:</span> ${esc(s.note.demand)}</p>` : ""}
      ${opts.rm ? `<p class="fh-actions"><button type="button" class="pf-x fh-rm" data-rm-hotel="${esc(s.id)}" aria-label="Remove ${esc(s.name)} from favourite hotels">×</button></p>` : ""}
    </article>`;
  }
  function panelHtml(sum, opts = {}) {
    const cards = sum.hotels.map((s) => cardHtml(s, opts)).join("");
    const miss = sum.missing.length ? `<p class="fh-none">${sum.missing.length} favourite${sum.missing.length === 1 ? " is" : "s are"} no longer in the comp set, so ${sum.missing.length === 1 ? "it isn’t" : "they aren’t"} shown.</p>` : "";
    return `<div class="fh-grid">${cards}</div>${miss}`;
  }
  return { NC, summarize, summarizeAll, weekStats, cardHtml, panelHtml, money, fMD };
});
