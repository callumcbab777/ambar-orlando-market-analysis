/* Week Ahead engine — JavaScript port of week_ahead/engine.py (hotel_median mode).
   Runs in the browser (window.WeekAheadEngine) and in Node (module.exports) so the
   parity test (tests/test_week_ahead.py > JsParity) can check it against the Python engine.
   Keep the two in step: any change to the calc chain must be made in both files. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WeekAheadEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const r2 = (x) => Math.round(x * 100) / 100;
  const r1 = (x) => Math.round(x * 10) / 10;
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  function median(a) {
    const s = sorted(a), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function percentile(a, p) {
    const s = sorted(a);
    if (!s.length) throw new Error("percentile of empty set");
    if (s.length === 1) return s[0];
    const k = (s.length - 1) * p / 100, lo = Math.floor(k), hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (s[hi] - s[lo]) * (k - lo);
  }
  function trimmedMean(a) {
    const s = sorted(a);
    if (s.length < 3) throw new Error("trimmed mean needs at least 3 values");
    return mean(s.slice(1, -1));
  }
  function iqrBounds(a, k = 1.5) {
    const q1 = percentile(a, 25), q3 = percentile(a, 75), iqr = q3 - q1;
    return [q1 - k * iqr, q3 + k * iqr];
  }
  const CONF = ["High", "Medium", "Low"];
  const downgrade = (c) => CONF[Math.min((CONF.indexOf(c) < 0 ? 2 : CONF.indexOf(c)) + 1, 2)];
  const sizeUnits = (bedrooms, hasDen, denWeight) => bedrooms + (hasDen ? denWeight : 0);
  const stepDownOccupancy = (occStudio, d, units) => occStudio * Math.pow(1 - d, units);
  function planOccupancy(u, cfg) {
    const m = cfg.occupancy_model;
    if (m.method !== "size_step_down") throw new Error("unknown occupancy_model.method " + m.method);
    return stepDownOccupancy(m.occ_studio, m.d, sizeUnits(u.bedrooms, !!u.has_den, m.den_weight));
  }
  function planRatios(units, baselineLayout = "s1") {
    const base = units.find((u) => u.id === baselineLayout).base_scenario.adr;
    return Object.fromEntries(units.map((u) => [u.id, u.base_scenario.adr / base]));
  }
  const dayMs = 864e5, toDay = (iso) => Date.parse(iso + "T00:00:00Z") / dayMs;
  const collectedWeeks = (db) => db.weeks.filter((w) => w.status === "collected").map((w) => w.week).sort();

  function hotelCompsFromMarket(db, week, minPricedNights) {
    const wk = week ? db.weeks.find((w) => w.week === week)
      : db.weeks.filter((w) => w.status === "collected").sort((a, b) => (a.week < b.week ? -1 : 1)).pop();
    if (!wk) throw new Error("week not found: " + week);
    const names = Object.fromEntries(db.hotels.map((h) => [h.id, h]));
    const nights = {};
    for (const r of db.rates) {
      if (r.week !== wk.week || !names[r.hotel]) continue;
      (nights[r.hotel] = nights[r.hotel] || []).push(r);
    }
    const comps = [], details = [];
    for (const h of db.hotels) {
      const rs = nights[h.id] || [];
      const priced = rs.filter((r) => r.status === "OK" && r.rate && Number(r.rate) > 0).map((r) => Number(r.rate));
      const d = { hotel: h.id, name: h.name, brand: h.brand, non_marriott: !!h.non_marriott, priced_nights: priced.length,
        nights: rs.length, weekly_median: priced.length ? r2(median(priced)) : null, status: "used" };
      if (priced.length < minPricedNights) d.status = `excluded: ${priced.length} priced night(s) < ${minPricedNights}`;
      else comps.push({ date: wk.week, property: h.name, unit_type: "studio", sqft: null, rate: median(priced), is_booked: false });
      details.push(d);
    }
    return { wk, comps, details };
  }
  function dedupe(comps) {
    const m = new Map();
    for (const c of comps) m.set([c.date, c.property.trim().toLowerCase(), c.unit_type, c.sqft, c.is_booked].join("|"), c);
    return [...m.values()];
  }
  function dropStale(comps, asOf, staleDays) {
    const a = toDay(asOf);
    return comps.filter((c) => { const d = toDay(c.date); return d >= a - staleDays && d <= a; });
  }

  function runHotelMedian(db, cfg, units, week) {
    const hm = cfg.hotel_median, pipe = cfg.pipeline;
    const { wk, comps, details } = hotelCompsFromMarket(db, week, hm.min_priced_nights);
    const d = dedupe(comps), s = dropStale(d, wk.week, pipe.stale_days);
    const vals = s.map((c) => c.rate);
    if (vals.length < pipe.gap_fill_min_n) throw new Error(`only ${vals.length} comparable hotels this week; need ${pipe.gap_fill_min_n}`);
    const diagMean = mean(vals), diagMedian = median(vals);
    const gap = Math.abs(diagMean - diagMedian) / diagMedian * 100, flagged = gap > pipe.mean_median_flag_pct;
    let clean = s;
    if (pipe.iqr_trim !== false && vals.length >= (pipe.iqr_min_n ?? 5)) {
      const [lo, hi] = iqrBounds(vals, pipe.iqr_k ?? 1.5);
      clean = s.filter((c) => lo <= c.rate && c.rate <= hi);
      const trimmed = new Set(s.filter((c) => !clean.includes(c)).map((c) => c.property));
      for (const dd of details) if (trimmed.has(dd.name)) dd.status = `trimmed: outside IQR fence ${Math.round(lo)}–${Math.round(hi)}`;
    }
    const cv = clean.map((c) => c.rate), n = cv.length;
    const method = n >= pipe.median_min_n ? "median" : "trimmed_mean";
    const point = method === "median" ? median(cv) : trimmedMean(cv);
    const p25 = percentile(cv, 25), p75 = percentile(cv, 75);
    const conf = method === "trimmed_mean" ? "Low" : (n >= pipe.high_confidence_min_n && !flagged ? "High" : "Medium");
    const baseline = { method, median: r2(point), p25: r2(p25), p75: r2(p75), comp_count: n, raw_count: vals.length,
      trimmed_out: vals.length - n, diag_mean: r2(diagMean), diag_median: r2(diagMedian), gap_pct: r2(gap), flagged, confidence: conf };
    const ratios = planRatios(units, hm.baseline_layout);
    const outUnits = units.map((u) => {
      const t = cfg.unit_types[u.unit_type], ratio = ratios[u.id];
      const k = t.realization * t.position_index * ratio, adr = point * k, occ = planOccupancy(u, cfg);
      const baseOcc = occ; // historical base: same anchor / step / den weight as the live estimate
      const scaled = u.id !== hm.baseline_layout, baseAdr = u.base_scenario.adr, baseRp = baseAdr * baseOcc, rp = adr * occ;
      return { id: u.id, unit_type: u.unit_type, ratio_to_s1: Math.round(ratio * 1e4) / 1e4, realization: t.realization, position_index: t.position_index,
        adr: r2(adr), adr_p25: r2(p25 * k), adr_p75: r2(p75 * k),
        occupancy: Math.round(occ * 1e6) / 1e6, occupancy_method: "size_step_down", size_units: sizeUnits(u.bedrooms, !!u.has_den, cfg.occupancy_model.den_weight),
        revpau: r2(rp), revpau_p25: r2(p25 * k * occ), revpau_p75: r2(p75 * k * occ),
        comp_count: n, method, basis: scaled ? "scaled" : "comp_median", confidence: scaled ? downgrade(conf) : conf,
        base_adr: baseAdr, base_occupancy: Math.round(baseOcc * 1e6) / 1e6, base_revpau: r2(baseRp),
        vs_base_adr_pct: r1((adr / baseAdr - 1) * 100), vs_base_revpau_pct: r1((rp / baseRp - 1) * 100),
        doc_occupancy: u.base_scenario.occupancy };
    });
    return { mode: "hotel_median", as_of: wk.week, week_start: wk.week, week_end: wk.week_end, week_label: wk.label,
      snapshot_generated: wk.generated, comp_source: wk.rate_sources, data_status: "live",
      basis: "ADR and RevPAU (RevPAU = ADR x occupancy), USD per night",
      pipeline: { records_in: comps.length, after_dedupe: d.length, after_stale: s.length, duplicates_removed: comps.length - d.length,
        stale_removed: d.length - s.length, hotels_in_landscape: details.length },
      baseline, comps: details, units: outUnits };
  }
  function runAllWeeks(db, cfg, units) {
    const out = {};
    for (const w of collectedWeeks(db)) {
      try { out[w] = runHotelMedian(db, cfg, units, w); } catch (e) { out[w] = { week_start: w, error: e.message }; }
    }
    return out;
  }
  return { median, mean, percentile, trimmedMean, iqrBounds, downgrade, sizeUnits, stepDownOccupancy, planOccupancy, planRatios,
    hotelCompsFromMarket, dedupe, dropStale, runHotelMedian, runAllWeeks, collectedWeeks };
});
