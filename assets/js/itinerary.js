/* AMBAR Orlando · Travel Concierge itinerary: data model, rule-based generator and the share-link codec.
   Pure (no DOM); used by assets/js/concierge.js in the browser (window.AMBAR_ITIN) and by
   tests/js/itinerary_test.js in Node.
   Model: { v:1, start:"YYYY-MM-DD", note:"", days:[ { items:[ { k, time, title, ref, note } ] } ] }
     k: f flight · h hotel stay · e Visit Orlando event · a AMBAR visit · v site page (visit / events / market)
        · d departure · c the visitor's own item
     time: "" | "am" | "pm" | "eve"
   Links are never stored: they are rebuilt from k + ref when shown (linkFor), so a shared link can't carry a URL.
   The AMBAR item always links to the in-person Calendly page and every itinerary has exactly one (ensureAmbar).
   Share token (~i… inside ?p=): "z" + base64url(deflate-raw(JSON)) where CompressionStream exists, else "j" + base64url(JSON). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_ITIN = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  const CALENDLY = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar";
  const KINDS = ["f", "h", "e", "a", "v", "d", "c"];
  const TIMES = ["", "am", "pm", "eve"];
  const TIME_LABEL = { "": "Any time", am: "Morning", pm: "Afternoon", eve: "Evening" };
  const MAX = { days: 14, items: 10, title: 90, note: 200, token: 8000 };
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  /* site pages a "v" item may point to (ref → path from the site root) */
  const PAGES = {
    "getting-here": "visit/#getting-here", "drive-times": "visit/#drive-times", "best-time": "visit/#best-time",
    brightline: "visit/#brightline", "visit-ambar": "visit/#visit-ambar", events: "events/", hotels: "index.html#hotels",
    "week-ahead": "index.html#week-ahead",
  };
  /* drive times from AMBAR, no traffic, as on the visit page (OSRM / OpenStreetMap, as of Oct 31, 2026) */
  const DRIVE = { MCO: "≈ 41 min (26.6 mi)", SFB: "≈ 69 min (51.7 mi)", MLB: "≈ 1 hr 44 min (70.2 mi)" };
  const AIRPORT = { MCO: "Orlando International (MCO)", SFB: "Orlando Sanford (SFB)", MLB: "Melbourne Orlando (MLB)" };
  /* interests → Visit Orlando categories and title keywords already in the events data */
  const INTEREST_MAP = {
    parks: { cats: ["Theme Park Events"], kw: /\b(disney|universal|seaworld|epcot|magic kingdom|legoland|park)\b/i, label: "Theme parks" },
    golf: { cats: [], kw: /\bgolf\b/i, label: "Golf" },
    dining: { cats: [], kw: /\b(food|wine|dinner|brunch|taste|tasting|culinary|chef|beer|cocktail)\b/i, label: "Dining" },
    nightlife: { cats: ["Concerts and Live Shows"], kw: /\b(night|live music|comedy|dj|club|jazz)\b/i, label: "Nightlife" },
    shopping: { cats: ["Consumer Trade Shows"], kw: /\b(market|shop|shopping|craft fair|bazaar)\b/i, label: "Shopping" },
    nature: { cats: ["Outdoors & Adventure"], kw: /\b(garden|nature|park|lake|spring|trail|bloom|wildlife)\b/i, label: "Nature" },
    wellness: { cats: [], kw: /\b(yoga|wellness|spa|meditation|run|5k)\b/i, label: "Wellness" },
    sports: { cats: ["Sporting Events"], kw: /\b(magic|orlando city|pride|solar bears|ucf|game|match|race)\b/i, label: "Sports" },
    culture: { cats: ["Arts & Cultural Events", "Live Theater & Performing Arts", "Festivals"], kw: /\b(museum|art|theatre|theater|gallery|festival)\b/i, label: "Culture" },
  };
  const PACE_SLOTS = { relaxed: 2, balanced: 3, packed: 4 };

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayLabel = (s) => { const d = parse(s); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
  function text(v, n) {
    if (typeof v !== "string") return "";
    const t = v.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim();
    return Array.from(t).slice(0, n).join("").trim();
  }
  const REF_RE = { f: /^(?:[A-Z]{3}|ANY)-(?:MCO|SFB|MLB)$/, h: /^[a-z0-9][a-z0-9-]{0,47}$/, e: /^\d{1,9}$/, v: /^[a-z-]{2,20}$/, d: /^(?:MCO|SFB|MLB)$/ };

  /* ---------- normalise (anything from storage or a link) ---------- */
  function cleanItem(x) {
    if (!x || typeof x !== "object") return null;
    const k = KINDS.includes(x.k) ? x.k : "c";
    let ref = typeof x.ref === "string" ? x.ref : "";
    if (k === "v" && !PAGES[ref]) ref = "";
    if (REF_RE[k] && !REF_RE[k].test(ref)) ref = "";
    const it = { k: (REF_RE[k] && !ref) || (k === "v" && !ref) ? "c" : k, time: TIMES.includes(x.time) ? x.time : "", title: text(x.title, MAX.title), ref: "", note: text(x.note, MAX.note) };
    if (it.k !== "c" && it.k !== "a") it.ref = ref;
    if (it.k === "a" && !it.title) it.title = "Visit AMBAR · in-person tour";
    return it.title ? it : null;
  }
  function ensureAmbar(it) {
    const all = it.days.flatMap((d) => d.items);
    const n = all.filter((x) => x.k === "a").length;
    if (n === 1) return it;
    if (n > 1) { let seen = false; for (const d of it.days) d.items = d.items.filter((x) => x.k !== "a" || (!seen && (seen = true))); return it; }
    const day = it.days[Math.min(1, it.days.length - 1)];
    day.items.splice(0, 0, ambarItem());
    if (day.items.length > MAX.items) day.items.length = MAX.items;
    return it;
  }
  function normalise(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const days = (Array.isArray(r.days) ? r.days : []).slice(0, MAX.days).map((d) => ({
      items: (Array.isArray(d && d.items) ? d.items : []).map(cleanItem).filter(Boolean).slice(0, MAX.items),
    }));
    if (!days.length) days.push({ items: [] });
    const it = { v: 1, start: ISO_RE.test(r.start || "") ? r.start : "", note: text(r.note, 600), days };
    if (r.ai === true && it.note) it.ai = true;
    return ensureAmbar(it);
  }
  const ambarItem = () => ({ k: "a", time: "am", title: "Visit AMBAR · in-person tour", ref: "", note: "45 minutes at the sales center, 8701 W Irlo Bronson Memorial Hwy, Unit 108, Kissimmee. Pick a time on Calendly." });

  /* ---------- links (rebuilt, never stored) ---------- */
  /* ctx: { root, events: Map id→event, hotels: Map id→hotel, flights: AMBAR_FLIGHTS, start, end } */
  function linkFor(item, ctx) {
    ctx = ctx || {};
    const root = ctx.root || "";
    switch (item.k) {
      case "a": return CALENDLY;
      case "h": return ctx.hotels && !ctx.hotels.has(item.ref) ? root + "index.html#hotels" : root + "index.html#hotel-" + item.ref;
      case "e": { const e = ctx.events && ctx.events.get(item.ref); return e && /^https:\/\/www\.visitorlando\.com\//.test(e.url || "") ? e.url : "https://www.visitorlando.com/events/"; }
      case "v": return root + PAGES[item.ref];
      case "d": return root + "visit/#drive-times";
      case "f": {
        if (!ctx.flights) return "";
        const [o, d] = item.ref.split("-");
        return ctx.flights.gfUrl(o === "ANY" ? "" : o, d, ctx.start || "", ctx.end || "");
      }
      default: return "";
    }
  }

  /* ---------- rule-based generator ---------- */
  const overlaps = (e, d) => e.start_date <= d && e.end_date >= d;
  const runDays = (e) => Math.round((parse(e.end_date) - parse(e.start_date)) / 864e5) + 1;
  function eventScore(e, trip) {
    let s = 0;
    const cats = e.categories || [];
    for (const i of trip.interests || []) {
      const m = INTEREST_MAP[i]; if (!m) continue;
      if (cats.some((c) => m.cats.includes(c))) s += 3;
      if (m.kw.test(e.title || "")) s += 2;
    }
    if (trip.budget === "value" && cats.includes("Free Events")) s += 2;
    if (trip.kids && (cats.includes("Holidays") || cats.includes("Theme Park Events") || cats.includes("Free Events"))) s += 1;
    if (trip.kids && /(21\+|adults only|after dark|bar crawl|burlesque|cocktail|happy hour)/i.test(e.title || "")) s -= 10;
    if (runDays(e) <= 3) s += 1; /* one-offs over month-long runs */
    return s;
  }
  /* pick the home-airport flight: a listed route into MCO, then SFB, then MLB; else a Google Flights search */
  function flightItem(trip, start, end, today, F) {
    const home = trip.home || "";
    const keys = F ? F.fromHome(home) : [];
    const order = ["MCO", "SFB", "MLB"];
    keys.sort((a, b) => order.indexOf(a.split("-")[1]) - order.indexOf(b.split("-")[1]));
    for (const k of keys) {
      const p = F.plan(k, today, { key: k, date: start, ret: end });
      if (p.live) {
        const r = F.ROUTES[k];
        const wd = p.date !== start && r.days ? ` It flies ${r.days.map((d) => ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][d]).join(" and ")}, so check the days around your dates.` : "";
        return { k: "f", time: "", title: `Fly ${home} → ${k.split("-")[1]}`, ref: k, note: `Nonstop listed on the visit page (${r.airline}).${wd} Google Flights opens with your dates; no fares are shown here.` };
      }
    }
    const off = keys.map((k) => F.plan(k, today, { key: k, date: start, ret: end })).find((p) => !p.live);
    const ref = home ? `${home}-MCO` : "ANY-MCO";
    const why = off && off.label ? `The nonstop from ${home} is ${off.label.replace(/^Seasonal/, "seasonal")}; ` : home && !keys.length ? `No nonstop from ${home} is listed on the visit page; ` : "";
    return { k: "f", time: "", title: home ? `Fly ${home} → MCO` : "Fly into Orlando (MCO)", ref, note: `${why}Google Flights shows the options for your dates.${home ? "" : " Add your home airport in My Preferences for a direct link."}` };
  }
  function pickHotel(trip, favs, db) {
    const H = (db && db.hotels) || [];
    const fav = (favs || []).map((id) => H.find((h) => h.id === id)).filter(Boolean)[0];
    if (fav) return { h: fav, why: "Your favourite on the market page" };
    const tier = trip.budget === "luxury" ? "Luxury" : "Premium";
    let pool = H.filter((h) => h.tier === tier);
    if (trip.interests && trip.interests.includes("parks") && pool.some((h) => h.on_disney_property)) pool = pool.filter((h) => h.on_disney_property);
    pool.sort((a, b) => (a.distance_to_epcot_mi ?? 99) - (b.distance_to_epcot_mi ?? 99) || a.name.localeCompare(b.name));
    return pool[0] ? { h: pool[0], why: `A ${tier} hotel from the market page’s comp set${pool[0].on_disney_property ? ", on Walt Disney World property" : ""}` } : null;
  }
  /* input: { trip, today, events:[], db (comps), favs:[hotel ids], flights (AMBAR_FLIGHTS) } */
  function generate(input) {
    const trip = input.trip || {};
    const today = ISO_RE.test(input.today || "") ? input.today : iso(new Date());
    const start = trip.from && trip.from >= today ? trip.from : addDays(today, 30);
    const nights = trip.nights || 4;
    const nDays = Math.min(nights + 1, MAX.days);
    const end = addDays(start, nDays - 1);
    const slots = PACE_SLOTS[trip.pace] || PACE_SLOTS.balanced;
    const days = Array.from({ length: nDays }, () => ({ items: [] }));
    const F = input.flights;
    const fl = flightItem(trip, start, end, today, F);
    days[0].items.push({ ...fl, time: "am" });
    const hp = pickHotel(trip, input.favs, input.db);
    if (hp) days[0].items.push({ k: "h", time: "pm", title: `Check in · ${hp.h.name}`, ref: hp.h.id, note: `${hp.why}. ${hp.h.area}. Rates and notes are on the hotel card.` });
    else days[0].items.push({ k: "v", time: "pm", title: "Choose where to stay", ref: "hotels", note: "Compare the hotels on the market page." });
    /* AMBAR visit: the morning of day 2 (day 1 on a one-day trip) */
    const aDay = nDays > 1 ? 1 : 0;
    days[aDay].items.push(ambarItem());
    /* events in the trip dates, best match first, each used once */
    const used = new Set();
    const evs = (input.events || []).filter((e) => e && e.start_date && e.end_date && e.end_date >= start && e.start_date <= end);
    const lastFull = nDays > 1 ? nDays - 2 : 0;
    for (let i = 0; i < nDays; i++) {
      const date = addDays(start, i);
      const day = days[i];
      /* arrival day: an evening at most; departure day: a morning at most */
      const allowed = i === 0 ? ["eve"] : i === nDays - 1 && nDays > 1 ? ["am"] : ["am", "pm", "eve"];
      const free = () => allowed.filter((t) => !day.items.some((x) => x.time === t));
      const room = Math.min(free().length, slots - (i === 0 ? Math.max(0, day.items.length - 1) : day.items.length));
      if (room <= 0) continue;
      const pool = evs.filter((e) => overlaps(e, date) && !used.has(String(e.id)))
        .map((e) => ({ e, s: eventScore(e, trip) })).filter((x) => x.s > (i === nDays - 1 && nDays > 1 ? 1 : -5))
        .sort((a, b) => b.s - a.s || runDays(a.e) - runDays(b.e) || String(a.e.title).localeCompare(String(b.e.title)));
      for (const { e } of pool.slice(0, room)) {
        const t = free()[0]; if (!t) break;
        used.add(String(e.id));
        day.items.push({ k: "e", time: t, title: text(e.title, MAX.title), ref: String(e.id), note: text([e.location, (e.categories || [])[0]].filter(Boolean).join(" · "), MAX.note) });
      }
      /* no listings for this day in the site's events data: suggest by interest, pointing at site pages only */
      if (i > 0 && i <= lastFull && day.items.length < slots && free().length) {
        const ints = (trip.interests && trip.interests.length ? trip.interests : ["parks", "culture", "dining"]);
        const pick = ints[(i + day.items.length) % ints.length];
        const m = INTEREST_MAP[pick];
        if (pick === "parks" || pick === "culture" || pick === "sports" || pick === "nightlife" || pick === "nature" || pick === "shopping") {
          day.items.push({ k: "v", time: free()[0], title: `${m.label}: see what’s on`, ref: "events", note: `Browse the Visit Orlando listings on the events page for ${dayLabel(date)}. Listings cover the dates the site has collected.` });
        } else {
          day.items.push({ k: "c", time: free()[0], title: `${m.label} time`, ref: "", note: "Your pick: add the place and time when you’ve chosen." });
        }
      }
    }
    if (nDays > 1) {
      const dest = (fl.ref.split("-")[1]) || "MCO";
      days[nDays - 1].items.push({ k: "d", time: "pm", title: `Head to ${AIRPORT[dest] || dest}`, ref: dest, note: `${DRIVE[dest] || ""} from AMBAR with no traffic; allow longer at busy times.`.trim() });
    }
    const rank = { "": 0, am: 1, pm: 2, eve: 3 };
    for (const d of days) d.items.sort((a, b) => rank[a.time] - rank[b.time]);
    const it = normalise({ v: 1, start, days, note: "" });
    return it;
  }
  const endDate = (it) => addDays(it.start, it.days.length - 1);

  /* ---------- editing (pure; return a new itinerary) ---------- */
  const clone = (it) => JSON.parse(JSON.stringify(it));
  function addItem(it, dayIdx, item) { const n = clone(it); const d = n.days[dayIdx]; const c = cleanItem({ ...item, k: item.k || "c" }); if (d && c && d.items.length < MAX.items) d.items.push(c); return normalise(n); }
  function removeItem(it, dayIdx, i) { const n = clone(it); const d = n.days[dayIdx]; if (d && d.items[i] && d.items[i].k !== "a") d.items.splice(i, 1); return normalise(n); }
  function editItem(it, dayIdx, i, patch) {
    const n = clone(it); const d = n.days[dayIdx]; if (!d || !d.items[i]) return n;
    const cur = d.items[i];
    const next = cleanItem({ ...cur, title: patch.title ?? cur.title, note: patch.note ?? cur.note, time: patch.time ?? cur.time });
    if (next) d.items[i] = next;
    return normalise(n);
  }
  /* move one step up/down, crossing into the previous/next day at the edges */
  function moveItem(it, dayIdx, i, dir) {
    const n = clone(it); const d = n.days[dayIdx]; if (!d || !d.items[i]) return { it: n, day: dayIdx, i };
    const [x] = d.items.splice(i, 1);
    let nd = dayIdx, ni = i + dir;
    if (ni < 0) { if (dayIdx === 0) { d.items.splice(0, 0, x); return { it: n, day: 0, i: 0 }; } nd = dayIdx - 1; ni = n.days[nd].items.length; }
    else if (ni > d.items.length) { if (dayIdx === n.days.length - 1) { d.items.push(x); return { it: n, day: dayIdx, i: d.items.length - 1 }; } nd = dayIdx + 1; ni = 0; }
    if (n.days[nd].items.length >= MAX.items && nd !== dayIdx) { d.items.splice(i, 0, x); return { it: n, day: dayIdx, i }; }
    n.days[nd].items.splice(ni, 0, x);
    return { it: normalise(n), day: nd, i: ni };
  }
  function addDay(it) { const n = clone(it); if (n.days.length < MAX.days) n.days.push({ items: [] }); return normalise(n); }
  function removeDay(it, dayIdx) {
    const n = clone(it); if (n.days.length <= 1) return n;
    const hadA = n.days[dayIdx].items.some((x) => x.k === "a");
    n.days.splice(dayIdx, 1);
    const out = normalise(n); /* ensureAmbar re-adds the AMBAR visit if that day had it */
    return hadA ? out : out;
  }

  /* ---------- share codec ---------- */
  function compact(it) {
    const n = normalise(it);
    const o = { v: 1, s: n.start, d: n.days.map((d) => d.items.map((x) => { const a = [x.k, x.time, x.title, x.ref, x.note]; while (a.length > 3 && !a[a.length - 1]) a.pop(); return a; })) };
    if (n.note) { o.n = n.note; if (n.ai) o.ai = 1; }
    return o;
  }
  function expand(o) {
    if (!o || typeof o !== "object" || o.v !== 1 || !Array.isArray(o.d)) return null;
    return normalise({ start: o.s, note: o.n, ai: o.ai === 1, days: o.d.map((d) => ({ items: (Array.isArray(d) ? d : []).map((a) => Array.isArray(a) ? { k: a[0], time: a[1], title: a[2], ref: a[3], note: a[4] } : null) })) });
  }
  const isNode = typeof module === "object" && module.exports && typeof require === "function";
  const toB64u = (bytes) => {
    let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64u = (s) => {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const utf8 = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8"));
  const unutf8 = (b) => (typeof TextDecoder !== "undefined" ? new TextDecoder().decode(b) : Buffer.from(b).toString("utf8"));
  async function streamBytes(bytes, Stream) {
    const s = new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function canStream() { try { return typeof CompressionStream === "function" && typeof Response === "function" && typeof Blob === "function" && !!new CompressionStream("deflate-raw"); } catch (e) { return false; } }
  async function deflate(bytes) {
    if (canStream()) return streamBytes(bytes, CompressionStream);
    if (isNode) return new Uint8Array(require("zlib").deflateRawSync(Buffer.from(bytes)));
    return null;
  }
  async function inflate(bytes) {
    if (canStream()) return streamBytes(bytes, DecompressionStream);
    if (isNode) return new Uint8Array(require("zlib").inflateRawSync(Buffer.from(bytes), { maxOutputLength: 64000 }));
    throw new Error("no inflate");
  }
  async function encode(it) {
    const json = JSON.stringify(compact(it));
    try { const z = await deflate(utf8(json)); if (z) return "z" + toB64u(z); } catch (e) { /* fall through to plain */ }
    return "j" + toB64u(utf8(json));
  }
  async function decode(tok) {
    const s = String(tok || "");
    if (!/^[jz][A-Za-z0-9_-]{1,8000}$/.test(s)) return null;
    try {
      let bytes = fromB64u(s.slice(1));
      if (s[0] === "z") bytes = await inflate(bytes);
      if (bytes.length > 64000) return null;
      return expand(JSON.parse(unutf8(bytes)));
    } catch (e) { return null; }
  }

  /* ---------- PDF sections for AMBAR_EV_PDF ---------- */
  /* the PDF's standard fonts have no arrows or ≈, so spell them out */
  const pdfText = (v) => String(v || "").replace(/\s*→\s*/g, " to ").replace(/≈\s*/g, "about ").replace(/[–—]/g, "-");
  function pdfSections(it, ctx) {
    return it.days.map((d, i) => ({
      kicker: `Day ${i + 1}`, heading: `Day ${i + 1} · ${it.start ? dayLabel(addDays(it.start, i)) : ""}`.replace(/ · $/, ""),
      entries: d.items.map((x) => ({ title: pdfText(x.title), dates: TIME_LABEL[x.time] + (x.k === "a" ? " · Book on Calendly" : ""), location: pdfText(x.note), url: linkFor(x, ctx) || undefined })),
    })).filter((s) => s.entries.length);
  }

  return { CALENDLY, KINDS, TIMES, TIME_LABEL, MAX, PAGES, DRIVE, INTEREST_MAP, normalise, cleanItem, ensureAmbar, linkFor, generate, endDate,
    addItem, removeItem, editItem, moveItem, addDay, removeDay, compact, expand, encode, decode, pdfSections, dayLabel, addDays, eventScore };
});
