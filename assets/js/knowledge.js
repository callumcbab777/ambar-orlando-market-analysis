/* AMBAR Orlando · site knowledge retrieval (BM25 over data/knowledge.json, built by tools/build_knowledge.py).
   Used by the offline site guide and to pick the context the AI assistant is grounded in; the same file is mirrored to
   assistant-proxy/lib/knowledge-search.js so the server ranks the same way. Pure functions, no DOM, UMD:
   window.AMBAR_KNOWLEDGE_SEARCH in the browser, module.exports in Node.
   Events: Visit Orlando listings are docs of kind "event" with start/end dates. Event questions ("what's on this
   weekend", "concerts in November", a named event) are answered by eventSearch: dates in the question become a window
   (relative to opts.today), only listings overlapping it are kept, keyword matches rank first and short runs beat
   season-long ones. The "events:currency" doc (capture date + coverage) rides along with any event answer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_KNOWLEDGE_SEARCH = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const STOP = new Set(("a an the and or but of to in on at by for from with about into over is are was were be been am do does did " +
    "i me my mine we our you your it its this that these those there here what whats which who whom how when where why can could " +
    "would should will shall may might get got go going any some all just tell show find give please want like know s t im ive " +
    "near best good").split(" "));
  /* Folds wording variants onto the words the site uses. Keys are stemmed tokens. */
  const SYN = {
    fly: "flight", plane: "flight", airline: "flight", nonstop: "direct", train: "brightline", rail: "brightline",
    car: "drive", driving: "drive", far: "distance", mile: "distance", weather: "temperature", hot: "temperature",
    warm: "temperature", cold: "temperature", busy: "crowd", quiet: "crowd", favourite: "favorite", fave: "favorite",
    stay: "hotel", resort: "hotel", price: "rate", cost: "rate", night: "nightly", uk: "kingdom", britain: "kingdom",
    london: "gatwick", visit: "visit", tour: "visit", viewing: "visit", appointment: "visit",
    gig: "concert", band: "concert", theatre: "theater", play: "theater", musical: "theater", festival: "festival",
    kid: "family", children: "family", child: "family", sport: "sporting", game: "sporting",
  };
  const FIELD_W = { title: 3, tags: 3, text: 1 };
  const KIND_W = { news: 0.75, demand: 0.85, ambar: 1.4, "events-meta": 0.6 };
  const K1 = 1.2, B = 0.75;

  const fold = (s) => String(s == null ? "" : s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function stem(w) {
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(s) {
    const out = [];
    for (const raw of fold(s).replace(/['’]s\b/g, "").split(/[^a-z0-9]+/)) {
      if (!raw || STOP.has(raw) || (raw.length < 2 && !/\d/.test(raw))) continue;
      const t = stem(raw);
      if (STOP.has(t)) continue;
      out.push(SYN[t] || t);
    }
    return out;
  }

  function createIndex(knowledge) {
    const docs = (knowledge && Array.isArray(knowledge.docs)) ? knowledge.docs : [];
    const tf = [], len = [], df = new Map(), byId = new Map();
    let total = 0;
    docs.forEach((d, i) => {
      byId.set(d.id, d);
      const m = new Map(); let L = 0;
      const add = (text, w) => { for (const t of tokens(text)) { m.set(t, (m.get(t) || 0) + w); L += w; } };
      add(d.title, FIELD_W.title); add((d.tags || []).join(" "), FIELD_W.tags); add(d.text, FIELD_W.text);
      tf.push(m); len.push(L); total += L;
      for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
    });
    return { docs, byId, tf, len, df, N: docs.length, avgdl: docs.length ? total / docs.length : 1, lookups: (knowledge && knowledge.lookups) || {} };
  }

  const idf = (ix, t) => { const n = ix.df.get(t) || 0; return Math.log(1 + (ix.N - n + 0.5) / (n + 0.5)); };

  function bm25(ix, q) {
    const qt = [...new Set(Array.isArray(q) ? q : tokens(q))];
    if (!qt.length) return [];
    const out = [];
    ix.docs.forEach((d, i) => {
      const m = ix.tf[i]; let s = 0, hit = 0;
      for (const t of qt) {
        const f = m.get(t); if (!f) continue;
        hit++;
        s += idf(ix, t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * ix.len[i] / ix.avgdl));
      }
      if (!s) return;
      const titleT = new Set(tokens(d.title + " " + (d.tags || []).join(" ")));
      if (qt.every((t) => titleT.has(t))) s *= 1.5;          // every query word is in the title/tags
      s *= (0.6 + 0.4 * hit / qt.length) * (KIND_W[d.kind] || 1);
      out.push({ doc: d, score: s });
    });
    return out.sort((a, b) => b.score - a.score || (a.doc.id < b.doc.id ? -1 : 1));
  }

  const PROFILE_Q = /\b(my|mine|i\s+saved|saved|favou?rites?|starred|profile|shortlist)\b/i;
  const isProfileQuery = (q) => PROFILE_Q.test(String(q || ""));

  /* Turns a My Profile object ({events:[{title,start_date,end_date}], hotels:[ids], brands:[ids], prefs:{...}}) into docs. */
  function profileDocs(ix, profile) {
    if (!profile || typeof profile !== "object") return [];
    const out = [], L = ix.lookups || {};
    const hotels = (Array.isArray(profile.hotels) ? profile.hotels : []).filter((id) => ix.byId.has("hotel:" + id));
    if (hotels.length) {
      out.push({ id: "profile:hotels", kind: "profile", title: "Favourite hotels in your profile", url: "profile/",
        text: "Your favourite hotels: " + hotels.map((id) => (L.hotels && L.hotels[id]) || id).join("; ") + "." });
      for (const id of hotels) out.push(ix.byId.get("hotel:" + id));
    }
    const brands = (Array.isArray(profile.brands) ? profile.brands : []).filter((id) => L.brands && L.brands[id]);
    if (brands.length) {
      const by = {};
      for (const id of brands) { const b = L.brands[id]; (by[b.parent] = by[b.parent] || []).push(b.name); }
      out.push({ id: "profile:brands", kind: "profile", title: "Hotel brands you know, from your profile", url: "profile/",
        text: "Brands you marked as familiar: " + Object.keys(by).map((p) => `${p}: ${by[p].join(", ")}`).join("; ") + "." });
    }
    const evs = profile.events && typeof profile.events === "object" ? (Array.isArray(profile.events) ? profile.events : Object.values(profile.events)) : [];
    const ev = evs.filter((e) => e && e.title).slice(0, 25);
    if (ev.length) {
      out.push({ id: "profile:events", kind: "profile", title: "Events saved in your profile", url: "profile/",
        text: "Your saved events: " + ev.map((e) => { const a = e.start_date || e.start || "", b = e.end_date || e.end || ""; return e.title + (a ? ` (${a}${b && b !== a ? " to " + b : ""})` : ""); }).join("; ") + "." });
    }
    const pr = profile.prefs && typeof profile.prefs === "object" ? profile.prefs : null;
    if (pr) {
      const bits = [];
      if (Array.isArray(pr.cats) && pr.cats.length) bits.push("interests: " + pr.cats.slice(0, 20).join(", "));
      if (Array.isArray(pr.areas) && pr.areas.length) bits.push("areas: " + pr.areas.slice(0, 20).join(", "));
      if (pr.from || pr.to) bits.push(`dates: ${pr.from || "any"} to ${pr.to || "any"}`);
      if (pr.budget === "free") bits.push("free events only");
      if (pr.party && pr.party !== "any") bits.push("travelling as: " + pr.party);
      if (Array.isArray(pr.keywords) && pr.keywords.length) bits.push("keywords: " + pr.keywords.slice(0, 8).join(", "));
      if (pr.access) bits.push("accessibility information wanted");
      if (bits.length) out.push({ id: "profile:prefs", kind: "profile", title: "Your event preferences", url: "profile/", text: "Your preferences: " + bits.join("; ") + "." });
    }
    return out;
  }

  /* ---------- events: dates in the question → a window ---------- */
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const utc = (s) => new Date(s + "T00:00:00Z");
  const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monthEnd = (y, m) => iso(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  const localToday = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
  /* parseWhen("concerts this weekend", "2026-10-31") → {from:"2026-10-31", to:"2026-11-01", rest:"concerts"}; null if no date */
  function parseWhen(query, today) {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(today || "") ? today : localToday();
    const ty = +t.slice(0, 4), tm = +t.slice(5, 7) - 1, dow = utc(t).getUTCDay();
    let s = " " + fold(query).replace(/['’]/g, "") + " ", from = null, to = null;
    const take = (re) => { const m = s.match(re); if (m) s = s.replace(re, " "); return m; };
    const yearFor = (m) => (m < tm ? ty + 1 : ty);
    let m;
    if (take(/\b(today|tonight|this evening)\b/)) { from = to = t; }
    else if (take(/\btomorrow( night)?\b/)) { from = to = addDays(t, 1); }
    else if (take(/\bnext weekend\b/)) { const sat = addDays(t, dow === 0 ? 6 : 6 - dow + 7); from = sat; to = addDays(sat, 1); }
    else if (take(/\b(this )?weekend\b/)) {
      if (dow === 6) { from = t; to = addDays(t, 1); } else if (dow === 0) { from = to = t; }
      else if (dow === 5) { from = t; to = addDays(t, 2); } else { from = addDays(t, 6 - dow); to = addDays(from, 1); }
    }
    else if (take(/\bnext week\b/)) { from = addDays(t, ((8 - dow) % 7) || 7); to = addDays(from, 6); }
    else if (take(/\bthis week\b/)) { from = t; to = addDays(t, dow === 0 ? 0 : 7 - dow); }
    else if (take(/\bthis month\b/)) { from = t; to = monthEnd(ty, tm); }
    else if (take(/\bnext month\b/)) { const y = tm === 11 ? ty + 1 : ty, mm = (tm + 1) % 12; from = iso(y, mm, 1); to = monthEnd(y, mm); }
    else if ((m = take(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { from = to = `${m[1]}-${m[2]}-${m[3]}`; }
    else if ((m = take(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) { const mm = MON[m[1].slice(0, 4) === "sept" ? "sept" : m[1].slice(0, 3)]; from = to = iso(yearFor(mm), mm, +m[2]); }
    else if ((m = take(/\b(\d{1,2})\/(\d{1,2})\b/))) { const mm = +m[1] - 1; from = to = iso(yearFor(mm), mm, +m[2]); }
    else if ((m = take(new RegExp(`\\b(?:in|during|for|of|over|through|throughout)\\s+(?:early\\s+|late\\s+|mid\\s+)?${MON_RE}\\b`))) ||
             (m = take(new RegExp(`\\b(?!may\\b)${MON_RE}\\b`)))) {
      const mm = MON[m[1].slice(0, 3)], y = yearFor(mm);
      from = mm === tm && y === ty ? t : iso(y, mm, 1); to = monthEnd(y, mm);
    }
    if (!from) return null;
    if (to < from) to = from;
    return { from, to, rest: s.replace(/\s+/g, " ").trim() };
  }
  const EVENT_Q = /\b(events?|whats on|what is on|on this|happening|going on|things to do|to do|concerts?|gigs?|live music|music|shows|festivals?|theat(?:er|re)|plays|musicals?|comedy|sports?|sporting|games|exhibits?|exhibitions?|halloween|christmas|holidays?|thanksgiving|parades?|fireworks|tickets?|performances?|fairs?|markets?|free things)\b/;
  /* words that only say "an event" and shouldn't have to match a listing's text */
  const EV_GENERIC = new Set(["event", "happening", "thing", "on", "going", "orlando", "area", "near", "around", "list", "upcoming", "coming", "up", "anything", "fun", "local", "visitor", "listing", "week", "weekend", "month", "date", "time", "night", "nightly", "day", "early", "late", "mid"]);
  const runDays = (d) => Math.round((utc(d.end) - utc(d.start)) / 864e5) + 1;
  const runW = (d) => { const n = runDays(d); return n <= 3 ? 1 : n <= 14 ? 0.85 : n <= 45 ? 0.7 : 0.5; };
  /* eventSearch(index, query, {today, k}) → {intent, when, hits:[{doc,score}], total, currency, outside}
     intent: the question is about events (event words or a date window). when: {from,to} or null. */
  function eventSearch(ix, query, opts) {
    const o = opts || {}, k = o.k || 5;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(o.today || "") ? o.today : localToday();
    const q = String(query || "");
    const when = parseWhen(q, today);
    const words = fold(q).replace(/['’]/g, "");
    const intent = !!when || EVENT_Q.test(words);
    const currency = ix.byId.get("events:currency") || null;
    const evs = ix.docs.filter((d) => d.kind === "event" && d.start && d.end);
    const qt = [...new Set(tokens(when ? when.rest : q).filter((t) => !EV_GENERIC.has(t)))];
    const kw = qt.length ? new Map(bm25(ix, qt).filter((r) => r.doc.kind === "event").map((r) => [r.doc.id, r.score])) : null;
    const from = when ? when.from : today, to = when ? when.to : null;
    const hits = [];
    for (const d of evs) {
      const inWin = d.end >= from && (!to || d.start <= to);
      let s;
      if (kw) {
        const b = kw.get(d.id); if (!b) continue;
        if (!inWin) { if (when || !intent) continue; s = b * 0.5; }   // a named past listing still shows, lower
        else s = b * (0.6 + 0.4 * runW(d)) + (when ? 2 : 1);
      } else {
        if (!intent || !inWin) continue;
        s = 3 * runW(d);
      }
      hits.push({ doc: d, score: s });
    }
    const startKey = (d) => (d.start < from ? from : d.start);
    hits.sort((a, b) => b.score - a.score || startKey(a.doc).localeCompare(startKey(b.doc)) || (a.doc.title < b.doc.title ? -1 : 1));
    const outside = !!(when && currency && (when.to < currency.window_start || when.from > currency.window_end));
    return { intent, when, hits: hits.slice(0, k), total: hits.length, currency, outside, today };
  }

  /* search(index, query, {k, profile, today}) → [{doc, score}] best first.
     Profile questions put the profile's own docs first. Event questions put the matching listings first and add the
     events-data currency doc (capture date + coverage, "check the source link"). */
  function search(ix, query, opts) {
    const o = opts || {}, k = o.k || 5;
    const ev = eventSearch(ix, query, { today: o.today, k });
    const today = ev.today;
    let res = bm25(ix, query).filter((r) => r.doc.kind !== "events-meta")
      .map((r) => (r.doc.kind !== "event" ? r : { doc: r.doc, score: r.score * (r.doc.end < today ? 0.5 : 1) * (ev.intent ? 1 : 0.6) }))
      .sort((a, b) => b.score - a.score || (a.doc.id < b.doc.id ? -1 : 1));
    if (ev.intent) {
      const top = ev.hits.length ? ev.hits[0].score : 0;
      const others = res.filter((r) => r.doc.kind !== "event");
      res = ev.when && !EVENT_Q.test(fold(query).replace(/['’]/g, ""))
        ? ev.hits.concat(others).sort((a, b) => b.score - a.score)      // a date but no event words: let pages compete
        : ev.hits.concat(others.map((r) => ({ doc: r.doc, score: Math.min(r.score, top ? top * 0.99 : r.score) })));
    }
    if (isProfileQuery(query)) {
      const mine = profileDocs(ix, o.profile).map((d, i) => ({ doc: d, score: 1000 - i }));
      const pg = ix.byId.get("page:profile:mine");
      if (pg) mine.push({ doc: pg, score: 999 - mine.length });
      const seen = new Set(mine.map((r) => r.doc.id));
      res = mine.concat(res.filter((r) => !seen.has(r.doc.id)));
    }
    res = res.slice(0, k);
    const cur = ev.currency;
    if (cur && (res.some((r) => r.doc.kind === "event") || (ev.intent && (ev.outside || !ev.hits.length)))) {
      const c = { doc: cur, score: res.length ? res[res.length - 1].score : 1 };
      if (ev.outside || !ev.hits.length) res.unshift(c); else res.push(c);
      if (res.length > k + 1) res.length = k + 1;
    }
    return res;
  }

  function snippet(doc, query, n) {
    const max = n || 220, text = String(doc && doc.text || "");
    if (text.length <= max) return text;
    const low = fold(text);
    let at = -1;
    for (const t of tokens(query)) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    let start = at < 0 ? 0 : Math.max(0, at - Math.round(max / 3));
    if (start > 0) { const sp = text.indexOf(" ", start); start = sp > 0 && sp - start < 20 ? sp + 1 : start; }
    let s = text.slice(start, start + max);
    const cut = s.lastIndexOf(" "); if (start + max < text.length && cut > max * 0.6) s = s.slice(0, cut);
    return (start > 0 ? "…" : "") + s + (start + s.length < text.length ? "…" : "");
  }

  return { tokens, createIndex, search, eventSearch, parseWhen, profileDocs, isProfileQuery, snippet };
});
