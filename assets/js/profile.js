/* AMBAR Orlando · My Profile: one shared store for every page (saved events, favourite hotels, familiar hotel
   brands and event preferences). Kept in this browser only (localStorage "ambar.profile.v1"); nothing is sent
   anywhere. Older keys from the events page ("ambar.events.saved.v1", "ambar.events.prefs.v1") are migrated on
   first load and left in place as a backup.
   Pure helpers (normalise, migrate, compact share-link encode/decode) work in Node too and are unit-tested in
   tests/js/profile_test.js. Browser API: window.AMBAR_PROFILE. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_PROFILE = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  const KEY = "ambar.profile.v1";
  const LEGACY = { saved: "ambar.events.saved.v1", prefs: "ambar.events.prefs.v1" };
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const EVENT_ID = /^\d{1,9}$/;
  const HOTEL_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
  const BRAND_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
  const BRAND_CODE = /^[a-z][0-9a-f]{1,2}$/;
  const LIMITS = { events: 60, hotels: 20, brands: 120, link: 3000 };
  const PARTY = ["any", "solo", "couple", "group", "family"];
  const TEXT_RE = /^[\p{L}\p{N} &'’,.\/()+:-]{1,60}$/u;
  const KW_RE = /^[\p{L}\p{N} '&-]{2,30}$/u;
  const VO_URL = /^https:\/\/www\.visitorlando\.com\//;
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const uniq = (arr, re, max) => {
    const out = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
      const v = String(raw ?? "").trim();
      if (re.test(v) && !out.includes(v)) out.push(v);
      if (out.length >= max) break;
    }
    return out;
  };

  /* ---------- normalise (anything read from storage or a link goes through here) ---------- */
  function cleanPrefs(p) {
    if (!p || typeof p !== "object") return null;
    const out = {
      cats: uniq(p.cats, TEXT_RE, 20),
      areas: uniq(p.areas, TEXT_RE, 20),
      from: ISO_RE.test(p.from || "") ? p.from : "",
      to: ISO_RE.test(p.to || "") ? p.to : "",
      budget: p.budget === "free" ? "free" : "any",
      party: PARTY.includes(p.party) ? p.party : "any",
      keywords: uniq((Array.isArray(p.keywords) ? p.keywords : []).map((k) => String(k).toLowerCase()), KW_RE, 8),
      access: p.access === true,
    };
    if (p.saved_at && ISO_RE.test(String(p.saved_at).slice(0, 10))) out.saved_at = str(p.saved_at, 40);
    return hasPrefs(out) ? out : null;
  }
  function hasPrefs(p) {
    return !!p && !!(p.cats.length || p.areas.length || p.keywords.length || p.from || p.to || p.budget === "free" || p.party !== "any" || p.access);
  }
  function cleanEvent(s) {
    if (!s || typeof s !== "object" || !EVENT_ID.test(String(s.id ?? ""))) return null;
    return {
      id: String(s.id), title: str(s.title, 200), url: VO_URL.test(s.url || "") ? str(s.url, 400) : "",
      start_date: ISO_RE.test(s.start_date || "") ? s.start_date : "", end_date: ISO_RE.test(s.end_date || "") ? s.end_date : "",
      location: str(s.location, 200), area: str(s.area, 80), saved_at: str(s.saved_at, 40),
    };
  }
  function normalise(raw) {
    const p = raw && typeof raw === "object" ? raw : {};
    const events = [];
    for (const s of Array.isArray(p.events) ? p.events : []) {
      const e = cleanEvent(s);
      if (e && !events.some((x) => x.id === e.id)) events.push(e);
      if (events.length >= LIMITS.events) break;
    }
    return {
      v: 1,
      events,
      hotels: uniq(p.hotels, HOTEL_ID, LIMITS.hotels),
      brands: uniq(p.brands, BRAND_ID, LIMITS.brands),
      prefs: cleanPrefs(p.prefs),
      updated_at: str(p.updated_at, 40),
      ...(p.migrated_from ? { migrated_from: uniq(p.migrated_from, /^ambar\.[a-z.0-9]+$/, 4) } : {}),
    };
  }
  const empty = () => normalise({});
  const isEmpty = (p) => !p.events.length && !p.hotels.length && !p.brands.length && !p.prefs;

  /* ---------- migration from the events page's old keys ---------- */
  function parseJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  /* getItem: (key) => string|null. Returns { profile, migrated } without writing anything. */
  function migrate(getItem) {
    const cur = parseJSON(getItem(KEY));
    if (cur && typeof cur === "object") return { profile: normalise(cur), migrated: false };
    const saved = parseJSON(getItem(LEGACY.saved));
    const prefs = parseJSON(getItem(LEGACY.prefs));
    const from = [];
    if (Array.isArray(saved)) from.push(LEGACY.saved);
    if (prefs && typeof prefs === "object") from.push(LEGACY.prefs);
    const profile = normalise({ events: Array.isArray(saved) ? saved : [], prefs, migrated_from: from });
    return { profile, migrated: from.length > 0 };
  }

  /* ---------- compact share link: ?p=e<ids>~h<ids>~b<codes>~p<base64url prefs> ----------
     e: Visit Orlando event ids (digits) joined with "."   h: hotel ids from data/comps.json
     b: short brand codes from data/brands.json            p: preferences as compact JSON, base64url
     Empty sections are left out. Everything is re-validated when the link is opened. */
  const b64e = (s) => {
    const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8");
    let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const b = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64d = (s) => {
    if (!/^[A-Za-z0-9_-]{1,1200}$/.test(s)) return null;
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    try {
      const bin = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return typeof TextDecoder !== "undefined" ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("utf8");
    } catch (e) { return null; }
  };
  /* brandIndex: { idToCode: Map, codeToId: Map } built from data/brands.json */
  function brandIndex(brandsData) {
    const idToCode = new Map(), codeToId = new Map();
    for (const p of (brandsData && brandsData.parents) || []) for (const b of p.brands || []) { idToCode.set(b.id, b.code); codeToId.set(b.code, b.id); }
    return { idToCode, codeToId };
  }
  function encode(profile, bIdx) {
    const p = normalise(profile);
    const parts = [];
    const ev = p.events.map((e) => e.id);
    if (ev.length) parts.push("e" + ev.join("."));
    if (p.hotels.length) parts.push("h" + p.hotels.join("."));
    const codes = bIdx ? p.brands.map((id) => bIdx.idToCode.get(id)).filter(Boolean) : [];
    if (codes.length) parts.push("b" + codes.join("."));
    if (p.prefs) {
      const q = p.prefs, c = {};
      if (q.cats.length) c.c = q.cats;
      if (q.areas.length) c.a = q.areas;
      if (q.from) c.f = q.from;
      if (q.to) c.t = q.to;
      if (q.budget === "free") c.b = 1;
      if (q.party !== "any") c.y = q.party;
      if (q.keywords.length) c.k = q.keywords;
      if (q.access) c.x = 1;
      parts.push("p" + b64e(JSON.stringify(c)));
    }
    return parts.join("~");
  }
  /* known: { events?: Set|Map of ids, hotels?: Set, brands?: brandIndex } — unknown or malformed items are dropped
     and counted. Returns { profile, unknown }. */
  function decode(s, known) {
    known = known || {};
    const out = { events: [], hotels: [], brands: [], prefs: null };
    let unknown = 0;
    const text = String(s || "").slice(0, LIMITS.link);
    for (const part of text.split("~")) {
      if (!part) continue;
      const tag = part[0], body = part.slice(1);
      if (tag === "e" || tag === "h" || tag === "b") {
        for (const tok of body.split(".")) {
          if (!tok) continue;
          if (tag === "e") {
            if (!EVENT_ID.test(tok) || (known.events && !known.events.has(tok))) { unknown++; continue; }
            if (!out.events.includes(tok) && out.events.length < LIMITS.events) out.events.push(tok);
          } else if (tag === "h") {
            if (!HOTEL_ID.test(tok) || (known.hotels && !known.hotels.has(tok))) { unknown++; continue; }
            if (!out.hotels.includes(tok) && out.hotels.length < LIMITS.hotels) out.hotels.push(tok);
          } else {
            const id = BRAND_CODE.test(tok) && known.brands ? known.brands.codeToId.get(tok) : null;
            if (!id) { unknown++; continue; }
            if (!out.brands.includes(id) && out.brands.length < LIMITS.brands) out.brands.push(id);
          }
        }
      } else if (tag === "p") {
        const json = b64d(body);
        let c = null; try { c = json ? JSON.parse(json) : null; } catch (e) { c = null; }
        if (!c || typeof c !== "object" || Array.isArray(c)) { unknown++; continue; }
        out.prefs = cleanPrefs({ cats: c.c, areas: c.a, from: c.f, to: c.t, budget: c.b === 1 ? "free" : "any", party: c.y, keywords: c.k, access: c.x === 1 });
      } else unknown++;
    }
    return { profile: normalise({ events: out.events.map((id) => ({ id })), hotels: out.hotels, brands: out.brands, prefs: out.prefs }), unknown };
  }
  function shareUrl(base, profile, bIdx) {
    const enc = encode(profile, bIdx);
    const u = String(base).split("#")[0].split("?")[0];
    return enc ? `${u}?p=${enc}` : u;
  }
  /* add everything from b into a (used by "Save to my profile" on a shared view); a's own items win */
  function merge(a, b) {
    const A = normalise(a), B = normalise(b);
    const events = A.events.slice();
    for (const e of B.events) if (!events.some((x) => x.id === e.id)) events.push(e);
    return normalise({
      ...A,
      events,
      hotels: [...A.hotels, ...B.hotels.filter((h) => !A.hotels.includes(h))],
      brands: [...A.brands, ...B.brands.filter((x) => !A.brands.includes(x))],
      prefs: A.prefs || B.prefs,
    });
  }
  const counts = (p) => ({ events: p.events.length, hotels: p.hotels.length, brands: p.brands.length, prefs: p.prefs ? 1 : 0, total: p.events.length + p.hotels.length + p.brands.length + (p.prefs ? 1 : 0) });

  const core = { KEY, LEGACY, LIMITS, normalise, cleanPrefs, hasPrefs, migrate, encode, decode, shareUrl, merge, brandIndex, counts, empty, isEmpty, b64e, b64d };

  /* ---------- browser store ---------- */
  const ls = (() => { try { return root && root.localStorage ? root.localStorage : null; } catch (e) { return null; } })();
  if (!ls) return core;
  let cache = null;
  const listeners = new Set();
  function read() {
    if (cache) return cache;
    const m = migrate((k) => { try { return ls.getItem(k); } catch (e) { return null; } });
    cache = m.profile;
    if (m.migrated) write(cache, true);
    return cache;
  }
  function write(p, quiet) {
    cache = normalise({ ...p, updated_at: new Date().toISOString() });
    try { ls.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* storage full or blocked: keep in memory for this page */ }
    if (!quiet) emit();
    return cache;
  }
  function emit() {
    const p = read();
    listeners.forEach((fn) => { try { fn(p); } catch (e) { /* a listener failing must not break the others */ } });
    paintCounts();
  }
  function update(fn) { const next = fn(JSON.parse(JSON.stringify(read()))); return write(next || read()); }
  root.addEventListener && root.addEventListener("storage", (ev) => { if (ev.key === KEY) { cache = null; emit(); } });
  /* header link count: any element with [data-profile-count] */
  function paintCounts() {
    if (!root.document) return;
    const n = counts(read());
    root.document.querySelectorAll("[data-profile-count]").forEach((el) => {
      el.textContent = n.total ? String(n.total) : "";
      el.hidden = !n.total;
    });
    root.document.querySelectorAll("[data-profile-label]").forEach((el) => {
      el.setAttribute("aria-label", n.total ? `My Profile, ${n.total} item${n.total === 1 ? "" : "s"} saved` : "My Profile");
    });
  }
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", paintCounts);
    else paintCounts();
  }
  const api = Object.assign({}, core, {
    get: () => read(),
    set: (p) => write(p),
    update,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    hasEvent: (id) => read().events.some((e) => e.id === String(id)),
    toggleEvent(snapshot) {
      const id = String(snapshot && snapshot.id);
      return update((p) => { p.events = p.events.some((e) => e.id === id) ? p.events.filter((e) => e.id !== id) : [...p.events, snapshot]; return p; });
    },
    removeEvent: (id) => update((p) => { p.events = p.events.filter((e) => e.id !== String(id)); return p; }),
    isFavHotel: (id) => read().hotels.includes(String(id)),
    toggleHotel: (id) => update((p) => { id = String(id); p.hotels = p.hotels.includes(id) ? p.hotels.filter((h) => h !== id) : [...p.hotels, id]; return p; }),
    hasBrand: (id) => read().brands.includes(String(id)),
    setBrands: (ids) => update((p) => { p.brands = ids; return p; }),
    setPrefs: (prefs) => update((p) => { p.prefs = prefs; return p; }),
    clearPrefs: () => update((p) => { p.prefs = null; return p; }),
    clearAll: () => write(empty()),
    counts: (p) => counts(p || read()),
    paintCounts,
  });
  return api;
});
