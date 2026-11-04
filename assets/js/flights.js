/* AMBAR Orlando · Visit page flight links (and the Travel Concierge's home-airport link).
   Every route in "Three airports, one destination" links to Google Flights, origin = the route's city airport,
   destination = the Orlando-area airport (MCO, SFB or MLB). The date is worked out when the link is clicked:
   about one month from today (today + 30 days), with a return a week later.
   Seasonal routes: the link is live only when that date falls inside an operating season (and a date inside the
   season is used); otherwise the route shows "Seasonal, returns <Month>" as plain text.
   Season sources are noted per route. `unverified: true` marks a season that could NOT be confirmed from an airline
   or airport source (see the PR / README); the UI then adds "check with <airline>". Never add a season without a
   source. No fares are shown or fetched.
   Pure helpers are tested in tests/js/flights_test.js. Browser API: window.AMBAR_FLIGHTS. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_FLIGHTS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const IATA = /^[A-Z]{3}$/;
  const DEST = ["MCO", "SFB", "MLB"];
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = (s) => parse(s).getDay();
  const LEAD = 30, WINDOW = [21, 45], RETURN_AFTER = 7;

  /* key "ORIG-DEST". name: how the visit page labels the origin. Only routes listed on the visit page.
     seasons: [{ from, to }] inclusive, to "" = open-ended. days: operating weekdays (0 Sun … 6 Sat) when known.
     start: a new route's first day (not seasonal). src: where the dates come from. */
  const VS = "Virgin Atlantic, flights.virginatlantic.com Edinburgh–Orlando page (checked Nov 3, 2026)";
  const TUI_SRC = "ridingthemagic.uk MLB guide (third-party; TUI's own timetable could not be read, MLB publishes no TUI dates)";
  const ROUTES = {
    "LGW-MCO": { name: "London Gatwick", airline: "British Airways, Norse Atlantic" },
    "LHR-MCO": { name: "London Heathrow", airline: "Virgin Atlantic" },
    "MAN-MCO": { name: "Manchester", airline: "Virgin Atlantic" },
    "EDI-MCO": { name: "Edinburgh", airline: "Virgin Atlantic", seasonal: true,
      seasons: [{ from: "2026-04-01", to: "2026-10-24" }, { from: "2027-03-31", to: "2027-10-06" }], src: VS },
    "DUB-MCO": { name: "Dublin", airline: "Aer Lingus" },
    "CDG-MCO": { name: "Paris CDG", airline: "Air France" },
    "FRA-MCO": { name: "Frankfurt", airline: "Discover Airlines" },
    "MUC-MCO": { name: "Munich", airline: "Discover Airlines" },
    "MAD-MCO": { name: "Madrid", airline: "Iberia" },
    "LIS-MCO": { name: "Lisbon", airline: "TAP Air Portugal" },
    "AMS-MCO": { name: "Amsterdam", airline: "Delta" },
    "KEF-MCO": { name: "Reykjavik", airline: "Icelandair" },
    "YYZ-MCO": { name: "Toronto", airline: "Air Canada, Flair, Porter, WestJet" },
    "YUL-MCO": { name: "Montreal", airline: "Air Canada" },
    "GRU-MCO": { name: "São Paulo (GRU)", airline: "LATAM" },
    "VCP-MCO": { name: "Campinas, São Paulo (VCP)", airline: "Azul" },
    "MEX-MCO": { name: "Mexico City", airline: "Aeroméxico, Volaris" },
    "DXB-MCO": { name: "Dubai", airline: "Emirates" },
    /* SFB: "70+ US cities" has no single origin, so its link is "Flights to SFB" with the date only */
    "ANY-SFB": { name: "70+ US cities", airline: "mostly Allegiant", any: true },
    "BDA-SFB": { name: "Bermuda", airline: "BermudAir", start: "2026-10-31", src: "FlySFB news, as listed on the visit page" },
    "BZE-SFB": { name: "Belize", airline: "BermudAir", start: "2026-12-21", src: "FlySFB news, as listed on the visit page" },
    "PUJ-SFB": { name: "Punta Cana", airline: "Arajet" },
    /* MLB · TUI from the UK: seasonal. UNVERIFIED — next-season openings from a third-party guide only. */
    "LGW-MLB": { name: "London Gatwick", airline: "TUI", seasonal: true, unverified: true, seasons: [{ from: "2027-03-28", to: "2027-10-24" }], src: TUI_SRC },
    "MAN-MLB": { name: "Manchester", airline: "TUI", seasonal: true, unverified: true, seasons: [{ from: "2027-03-22", to: "2027-10-24" }], src: TUI_SRC },
    "GLA-MLB": { name: "Glasgow", airline: "TUI", seasonal: true, unverified: true, seasons: [{ from: "2027-05-07", to: "2027-10-24" }], src: TUI_SRC },
    "NCL-MLB": { name: "Newcastle", airline: "TUI", seasonal: true, unverified: true, seasons: [{ from: "2027-05-01", to: "2027-10-23" }], src: TUI_SRC },
    "BFS-MLB": { name: "Belfast", airline: "TUI", seasonal: true, unverified: true, seasons: [{ from: "2027-06-23", to: "2027-07-14" }], src: TUI_SRC },
    /* listed by MLB's airlines page, but not in TUI's current programme per the same third-party guide: no season known */
    "BHX-MLB": { name: "Birmingham", airline: "TUI", seasonal: true, unverified: true, seasons: [], src: "MLB airlines page lists it; no current TUI schedule found" },
    "LGA-MLB": { name: "New York LaGuardia", airline: "Delta", seasonal: true, days: [6, 0],
      seasons: [{ from: "2026-12-19", to: "2027-05-02" }], src: "MLB news page / Delta schedule as listed on the visit page (Sat & Sun)" },
    "MSP-MLB": { name: "Minneapolis–St Paul", airline: "Sun Country", seasonal: true,
      seasons: [{ from: "2027-01-22", to: "2027-04-02" }], src: "MLB (Jun 23, 2026 announcement) via Florida Today: Jan 22 – Apr 2, 2027" },
    "PIT-MLB": { name: "Pittsburgh", airline: "Allegiant" },
    "ABE-MLB": { name: "Allentown", airline: "Allegiant" },
    "CVG-MLB": { name: "Cincinnati", airline: "Allegiant" },
  };

  function gfUrl(orig, dest, date, ret) {
    if (!DEST.includes(dest)) throw new Error("unknown Orlando airport " + dest);
    let q = `Flights to ${dest}`;
    if (orig && IATA.test(orig)) q += ` from ${orig}`;
    if (date && ISO_RE.test(date)) q += ` on ${date}`;
    if (ret && ISO_RE.test(ret)) q += ` through ${ret}`;
    return "https://www.google.com/travel/flights?q=" + encodeURIComponent(q);
  }
  const inSeason = (s, d) => d >= s.from && (!s.to || d <= s.to);
  /* first operating day on/after d inside season s (respecting days), or "" */
  function firstOp(r, s, d) {
    let x = d < s.from ? s.from : d;
    for (let i = 0; i < 8; i++) {
      if (!inSeason(s, x)) return "";
      if (!r.days || r.days.includes(dow(x))) return x;
      x = addDays(x, 1);
    }
    return "";
  }
  /* plan(route, today) → { live, date, ret, url, label, reason, returns } — pure, today = "YYYY-MM-DD" */
  function plan(key, today, opts = {}) {
    const r = typeof key === "string" ? ROUTES[key] : key;
    if (!r) return { live: false, reason: "unknown" };
    if (!ISO_RE.test(today || "")) throw new Error("plan(today) needs YYYY-MM-DD");
    const k = typeof key === "string" ? key : opts.key || "";
    const [orig, dest] = k.split("-");
    const target = opts.date && ISO_RE.test(opts.date) ? opts.date : addDays(today, LEAD);
    const fixed = !!opts.date; /* a trip date from the Travel Concierge: use it or say why not, never move it */
    const mk = (date, extra) => {
      let ret = opts.ret && ISO_RE.test(opts.ret) ? opts.ret : addDays(date, RETURN_AFTER);
      const s = r.seasonal ? (r.seasons || []).find((x) => inSeason(x, date)) : null;
      if (s && s.to && ret > s.to) ret = "";
      return { live: true, date, ret, url: gfUrl(r.any ? "" : orig, dest, date, ret), ...extra };
    };
    if (r.start && !r.seasonal) {
      if (target >= r.start) return mk(target, {});
      if (fixed) return { live: false, reason: "before-start", returns: r.start, label: `From ${fmtMonth(r.start, today)}` };
      return mk(r.start, { note: `first flights ${r.start}` });
    }
    if (!r.seasonal) return mk(target, {});
    const seasons = (r.seasons || []).slice().sort((a, b) => a.from.localeCompare(b.from));
    const cur = seasons.find((s) => inSeason(s, target));
    if (cur) { const d = firstOp(r, cur, target); if (d && (!fixed || d === target || r.days)) return mk(d, {}); }
    if (!fixed) {
      /* a date inside the season, still "about a month out" (21–45 days) */
      const lo = addDays(today, WINDOW[0]), hi = addDays(today, WINDOW[1]);
      for (const s of seasons) {
        if ((s.to && s.to < lo) || s.from > hi) continue;
        const d = firstOp(r, s, lo);
        if (d && d <= hi) return mk(d, {});
      }
    }
    const next = seasons.find((s) => s.from > target) || null;
    const chk = r.unverified ? ` · check with ${r.airline}` : "";
    if (!next) return { live: false, reason: "no-season", label: r.unverified ? `Seasonal · not on a current schedule${chk}` : "Seasonal · check with the airline" };
    return { live: false, reason: "off-season", returns: next.from, label: `Seasonal, returns ${fmtMonth(next.from, today)}${chk}` };
  }
  function fmtMonth(isoD, today) { const d = parse(isoD), y = today ? parse(today).getFullYear() : new Date().getFullYear(); return MONTHS[d.getMonth()] + (d.getFullYear() !== y ? " " + d.getFullYear() : ""); }
  /* routes from a home airport into the Orlando area (for the Travel Concierge) */
  function fromHome(orig) { return Object.keys(ROUTES).filter((k) => k.startsWith(orig + "-")); }
  const localToday = () => iso(new Date());

  /* ---------- browser: enhance a[data-fl] on the visit page ---------- */
  function paint(a, today) {
    const key = a.dataset.fl;
    const p = plan(key, today);
    const r = ROUTES[key];
    const li = a.closest("li");
    const pill = li && li.querySelector(".pl-seasonal");
    if (p.live) {
      a.href = p.url;
      a.removeAttribute("aria-disabled");
      const sr = a.querySelector(".sr-only");
      if (sr) sr.textContent = `: flights to ${key.split("-")[1]} on Google Flights, ${p.date}${p.ret ? " to " + p.ret : ""} (opens in a new tab)`;
      if (pill && r.seasonal) pill.textContent = "Seasonal";
      return p;
    }
    /* outside the season: plain, non-clickable text */
    const span = document.createElement("span");
    span.className = "pl-fl-off";
    span.dataset.fl = key;
    span.textContent = a.firstChild ? a.firstChild.textContent : r.name;
    a.replaceWith(span);
    if (pill) { pill.textContent = p.label; pill.classList.add("is-off"); }
    else if (li) { const s = document.createElement("span"); s.className = "pl-seasonal is-off"; s.textContent = p.label; li.appendChild(s); }
    return p;
  }
  function enhance(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    const today = localToday();
    doc.querySelectorAll("a[data-fl]").forEach((a) => {
      paint(a, today);
      /* recompute at click time (the page may have been open since yesterday) */
      a.addEventListener("click", () => { const p = plan(a.dataset.fl, localToday()); if (p.live) a.href = p.url; });
    });
  }
  if (typeof document !== "undefined" && typeof module === "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(document));
    else enhance(document);
  }
  return { ROUTES, DEST, LEAD, WINDOW, gfUrl, plan, fromHome, addDays, iso, parse, enhance, localToday, fmtMonth };
});
