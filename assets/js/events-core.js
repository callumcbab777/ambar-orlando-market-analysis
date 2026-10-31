/* AMBAR Orlando · events page pure helpers (no DOM). Used by assets/js/events.js in the browser
   (window.AMBAR_EV_CORE) and by tests/js/events_core_test.js in Node (module.exports).
   Dates are plain "YYYY-MM-DD" strings in the visitor's local calendar. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_EV_CORE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (n) => String(n).padStart(2, "0");
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /* noon local time avoids DST edge cases when adding days */
  const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const monthEnd = (s) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
  const localToday = (now) => iso(now instanceof Date ? now : new Date());

  /* Date buckets for "today": Today · This weekend (Fri–Sun, from today) · Next week (Mon–Sun after this weekend)
     · Later this month (rest of the month after next week; if next week already reaches month end, the rest of the
     following month, labelled "Later in <Month>") · All upcoming (today onwards). */
  function buckets(today) {
    if (!ISO_RE.test(today || "")) throw new Error("buckets(today) needs YYYY-MM-DD");
    const dow = parse(today).getDay(); /* 0 Sun .. 6 Sat */
    const sun = addDays(today, (7 - dow) % 7);
    const fri = addDays(sun, -2);
    const nextMon = addDays(sun, 1), nextSun = addDays(sun, 7);
    const laterFrom = addDays(nextSun, 1);
    let laterTo = monthEnd(today), laterLabel = "Later this month";
    if (laterFrom > laterTo) { laterTo = monthEnd(laterFrom); laterLabel = `Later in ${MONTHS[parse(laterFrom).getMonth()]}`; }
    return [
      { key: "today", label: "Today", from: today, to: today },
      { key: "weekend", label: "This weekend", from: fri < today ? today : fri, to: sun },
      { key: "next", label: "Next week", from: nextMon, to: nextSun },
      { key: "later", label: laterLabel, from: laterFrom, to: laterTo },
      { key: "all", label: "All upcoming", from: today, to: "" },
    ];
  }
  const overlaps = (e, from, to) => (!to || e.start_date <= to) && (!from || e.end_date >= from);

  /* Share links: saved Visit Orlando event ids (digits only) joined with "." in ?shared=… */
  const ID_RE = /^\d{1,9}$/;
  const MAX_SHARED = 60;
  function encodeShare(ids) {
    const out = [];
    for (const raw of ids || []) { const id = String(raw).trim(); if (ID_RE.test(id) && !out.includes(id)) out.push(id); if (out.length >= MAX_SHARED) break; }
    return out.join(".");
  }
  /* Returns { ids, unknown } — ids are valid AND known (when a known set/map is given), in link order, de-duplicated. */
  function decodeShare(str, known) {
    const ids = [], seen = new Set(); let unknown = 0;
    const s = String(str || "").slice(0, 2000);
    for (const tok of s.split(/[.,\s]+/)) {
      if (!tok) continue;
      if (!ID_RE.test(tok) || seen.has(tok)) { if (!seen.has(tok)) unknown++; continue; }
      seen.add(tok);
      if (known && !known.has(tok)) { unknown++; continue; }
      ids.push(tok);
      if (ids.length >= MAX_SHARED) break;
    }
    return { ids, unknown };
  }
  function shareUrl(base, ids) {
    const enc = encodeShare(ids);
    const u = String(base).split("#")[0].split("?")[0];
    return enc ? `${u}?shared=${enc}` : u;
  }

  /* "This week" picks: events running in the next 7 days, short runs first (one-offs beat month-long
     exhibitions), soonest first, at most 2 per lead category so the handful feels varied. Deterministic. */
  function picks(events, today, n) {
    n = n || 6;
    const end = addDays(today, 6);
    const pool = events.filter((e) => overlaps(e, today, end));
    const run = (e) => e.runDays || Math.round((parse(e.end_date) - parse(e.start_date)) / 864e5) + 1;
    const startKey = (e) => (e.start_date < today ? today : e.start_date);
    pool.sort((a, b) => (run(a) > 7) - (run(b) > 7) || startKey(a).localeCompare(startKey(b)) || run(a) - run(b) || a.title.localeCompare(b.title));
    const out = [], perCat = new Map();
    for (const e of pool) {
      const c = (e.categories || [])[0] || "Other";
      if ((perCat.get(c) || 0) >= 2) continue;
      perCat.set(c, (perCat.get(c) || 0) + 1); out.push(e);
      if (out.length >= n) return out;
    }
    for (const e of pool) { if (out.length >= n) break; if (!out.includes(e)) out.push(e); }
    return out;
  }

  return { MONTHS, iso, parse, addDays, monthEnd, localToday, buckets, overlaps, encodeShare, decodeShare, shareUrl, picks, MAX_SHARED };
});
