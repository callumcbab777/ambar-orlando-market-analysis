/* AMBAR Orlando · site assistant widget (every page).
   - Knowledge: data/knowledge.json (built by tools/build_knowledge.py from the site's own pages and data) is searched
     in the browser with assets/js/knowledge.js (BM25). Both are loaded lazily the first time the widget opens.
   - AI mode: only when window.AMBAR_ASSISTANT_CONFIG.proxyUrl is set. The question, the ids of the best-matching
     knowledge docs, the matching Visit Orlando events and a summary of My Profile go to that proxy (assistant-proxy/),
     which holds the LLM key and builds the grounded prompt from its own copy of the index. No key is in this repo.
   - Offline "site guide" mode (default): the same retrieval plus the events search, answered with links and short
     quotes from the site only. It never makes up answers and is labelled as not AI. */
(function () {
  "use strict";
  const me = document.currentScript;
  const ROOT = (me && me.dataset.root) || "";
  const PAGE = (me && me.dataset.page) || "home";
  const CFG = window.AMBAR_ASSISTANT_CONFIG || {};
  const PROXY = String(CFG.proxyUrl || "").trim();
  const AI = /^https:\/\//.test(PROXY) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(PROXY);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const D = (iso) => new Date(iso + "T12:00:00");
  const fMD = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fMDY = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const addDays = (iso, n) => { const d = D(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const todayISO = (() => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } })();
  const home = (hash) => (PAGE === "home" ? hash : `${ROOT}index.html${hash}`);
  const evPage = (qs = "", hash = "") => `${ROOT}events/index.html${qs}${hash}`;
  const visit = (hash = "") => (PAGE === "visit" ? hash || "#top" : `${ROOT}visit/${hash}`);
  const profilePage = (hash = "") => (PAGE === "profile" ? hash || "#top" : `${ROOT}profile/${hash}`);
  /* knowledge URLs are relative to the site root ("index.html#hotels", "visit/#brightline") or absolute */
  const siteUrl = (u) => (/^https?:\/\//.test(u) ? u : u.startsWith("index.html") ? home(u.slice(10) || "#top") : ROOT + u);

  /* ---------- site map (what the guide can point to) ---------- */
  const SECTIONS = [
    { t: "Week ahead · nightly rates", h: home("#week-ahead"), d: "Lowest public nightly rates for each tracked hotel, by night.", k: "rate rates nightly night price prices cheapest tonight week ahead grid hotel heatmap" },
    { t: "Residences · the week ahead", h: home("#residences-week"), d: "Labelled estimates of ADR and RevPAU for each AMBAR floor plan.", k: "residence residences ambar adr revpar revpau estimate estimates floor plan studio bedroom owner economics cap occupancy" },
    { t: "Your brands · hotel brands in Orlando", h: home("#familiar"), d: "Pick the hotel companies and brands you know; verified Orlando-area brands, saved to My Profile.", k: "brand brands familiar company companies parent hilton hyatt ihg wyndham disney universal loews choice accor best western four seasons marriott" },
    { t: "Marriott brand matrix", h: home("#brands"), d: "Where AMBAR and the Marriott hotels sit in the Marriott portfolio.", k: "marriott brand brands matrix tier portfolio autograph premium luxury bonvoy" },
    { t: "The hotels + map", h: home("#hotels"), d: "The comparable hotels, their locations and distances.", k: "hotels hotel map location locations distance jw ritz swan dolphin gaylord hyatt conrad wyndham ette comparable comps" },
    { t: "By hotel · how rates moved, and favourites", h: home("#byHotel"), d: "A small chart per hotel; star hotels to keep them in My Profile.", k: "history chart trend trends moved change favourite favourites favorite favorites star starred by hotel" },
    { t: "Demand context", h: home("#demand"), d: "Conventions, Disney calendars and notes from the weekly briefs; metro occupancy.", k: "demand convention conventions disney occupancy market context brief briefs" },
    { t: "Orlando & hospitality news", h: home("#news"), d: "Marriott, wider Orlando and hospitality-media headlines.", k: "news headlines headline hospitality media article articles" },
    { t: "Sources & methodology", h: home("#sources"), d: "How the figures are gathered, caveats and sources.", k: "source sources methodology method caveat caveats data how gathered disclaimer" },
    { t: "Orlando events (Visit Orlando)", h: evPage(), d: "Browse and filter Visit Orlando listings by date, category and area.", k: "event events whats what's on things do calendar concert concerts festival festivals show shows visit orlando activities activity" },
    { t: "My preferences → Recommended for you", h: evPage("", "#preferences"), d: "Set interests, areas, dates and budget to get a ranked shortlist.", k: "preference preferences recommend recommended recommendation recommendations personalise personalize interests for me" },
    { t: "My Profile · saved events, hotels and brands", h: profilePage(), d: "Everything you saved on this browser; download a PDF or share a read-only link.", k: "profile saved save bookmark bookmarks share sharing pdf link send list friends family mine" },
    { t: "Getting here: MCO, SFB and MLB airports", h: visit("#getting-here"), d: "Direct routes from the UK and other markets, seasonal routes marked, with official sources.", k: "flight flights fly airport airports mco sanford sfb melbourne mlb getting here travel uk london gatwick heathrow manchester edinburgh airline airlines direct nonstop" },
    { t: "Brightline from Miami and South Florida", h: visit("#brightline"), d: "Brightline stations from MiamiCentral to Orlando (at MCO), with a link to gobrightline.com.", k: "brightline train rail miami fort lauderdale aventura boca west palm beach south florida" },
    { t: "Drive times from AMBAR", h: visit("#drive-times"), d: "Approximate drive times to the airports and the Brightline station, with no traffic.", k: "drive driving car distance far minutes miles route directions" },
    { t: "Best time to visit Orlando", h: visit("#best-time"), d: "Average high/low temperatures by month (NOAA) and typical crowd levels.", k: "best time when weather temperature temperatures climate crowd crowds busy quiet season seasons month months" },
    { t: "Visit AMBAR: meet us in person", h: visit("#visit-ambar"), d: "Book an in-person visit to AMBAR in Kissimmee, plus directions.", k: "book booking meet in person tour visit sales center centre appointment meeting address directions calendly contact" },
  ];
  const STOP = new Set("a an and are any at be can do does for from get give have how i in is it me my near of on or please show tell that the there this to up us we what whats when where which who will with you your about find looking look want some".split(" "));
  const SYN = { music: ["music", "concert", "live"], concert: ["concert", "music"], theatre: ["theatre", "theater"], theater: ["theater", "theatre"], kid: ["kid", "family", "children"], kids: ["kid", "family", "children"], family: ["family", "kid", "children"], sport: ["sport"], sports: ["sport"], art: ["art"], arts: ["art"], halloween: ["halloween"], thanksgiving: ["thanksgiving"], christmas: ["christmas", "holiday"], holiday: ["holiday"], holidays: ["holiday"], outdoor: ["outdoor"], outdoors: ["outdoor"] };
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  /* ---------- events data (events page exposes AMBAR_EVENTS; elsewhere load the .js mirror lazily) ---------- */
  let EV = null;
  const areaOf = (e) => { const c = String(e.city || "").replace(/,\s*FL$/i, "").trim(); return c ? (c === c.toUpperCase() ? c.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : c) : "Other"; };
  function norm(raw) {
    return (raw.events || []).filter((e) => e && e.title && e.url).map((e) => ({ ...e, area: e.area || areaOf(e), categories: e.categories || [], runDays: Math.round((D(e.end_date) - D(e.start_date)) / 864e5) + 1 }));
  }
  /* a knowledge-index event doc → the event shape the guide and the AI context use */
  const docEvent = (d) => ({ id: String(d.id).replace(/^event:/, ""), title: d.title, start_date: d.start, end_date: d.end, location: d.venue || "", area: d.city || "Other", categories: d.tags || [], url: d.url, runDays: Math.round((D(d.end) - D(d.start)) / 864e5) + 1 });
  function loadEvents() {
    if (EV) return Promise.resolve(EV);
    if (window.AMBAR_EVENTS) { EV = window.AMBAR_EVENTS.events; return Promise.resolve(EV); }
    if (window.VO_EVENTS_DATA) { EV = norm(window.VO_EVENTS_DATA); return Promise.resolve(EV); }
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = `${ROOT}data/visitorlando_events.js`;
      s.onload = () => { EV = window.VO_EVENTS_DATA ? norm(window.VO_EVENTS_DATA) : []; res(EV); };
      s.onerror = () => { EV = []; res(EV); };
      document.body.appendChild(s);
    });
  }
  const calUrl = () => (window.VO_EVENTS_DATA && window.VO_EVENTS_DATA.calendar_url) || "https://www.visitorlando.com/events/";

  /* ---------- site knowledge (lazy: data/knowledge.js + assets/js/knowledge.js) ---------- */
  let KX = null, kxLoading = null;
  const addScript = (src) => new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.body.appendChild(s); });
  function loadKnowledge() {
    if (KX) return Promise.resolve(KX);
    if (!kxLoading) kxLoading = Promise.all([
      window.AMBAR_KNOWLEDGE ? true : addScript(`${ROOT}data/knowledge.js`),
      window.AMBAR_KNOWLEDGE_SEARCH ? true : addScript(`${ROOT}assets/js/knowledge.js`),
    ]).then(() => {
      if (window.AMBAR_KNOWLEDGE && window.AMBAR_KNOWLEDGE_SEARCH) KX = window.AMBAR_KNOWLEDGE_SEARCH.createIndex(window.AMBAR_KNOWLEDGE);
      return KX;
    });
    return kxLoading;
  }
  const myProfile = () => { try { return window.AMBAR_PROFILE ? window.AMBAR_PROFILE.get() : null; } catch (e) { return null; } };
  function knowledgeHits(q, k = 4) {
    if (!KX) return [];
    const hits = window.AMBAR_KNOWLEDGE_SEARCH.search(KX, q, { k: k + 2, profile: myProfile() });
    const top = hits.length ? hits[0].score : 0;
    return hits.filter((r) => r.doc.kind === "profile" || (top >= 2 && r.score >= top * 0.4)).slice(0, k);
  }

  /* ---------- offline guide: parse + search ---------- */
  function parse(q) {
    let s = " " + q.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9/\- ]+/g, " ") + " ";
    let from = null, to = null, free = false, area = null;
    const take = (re) => { const m = s.match(re); if (m) s = s.replace(re, " "); return m; };
    if (take(/\b(today|tonight)\b/)) { from = to = todayISO; }
    else if (take(/\btomorrow\b/)) { from = to = addDays(todayISO, 1); }
    else if (take(/\b(this )?weekend\b/)) { const dow = D(todayISO).getDay(); const sun = addDays(todayISO, dow === 0 ? 0 : 7 - dow); from = dow === 0 || dow === 6 ? todayISO : addDays(sun, -2); to = sun; }
    else if (take(/\bnext week\b/)) { const dow = D(todayISO).getDay(); const mon = addDays(todayISO, ((8 - dow) % 7) || 7); from = mon; to = addDays(mon, 6); }
    else if (take(/\bthis week\b/)) { const dow = D(todayISO).getDay(); from = todayISO; to = addDays(todayISO, dow === 0 ? 0 : 7 - dow); }
    else {
      let m = take(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/);
      if (m) { const d = `${todayISO.slice(0, 4)}-${String(MONTHS[m[1]]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; from = to = d; }
      else if ((m = take(/\b(\d{1,2})\/(\d{1,2})\b/))) { const d = `${todayISO.slice(0, 4)}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; from = to = d; }
    }
    if (take(/\bfree\b/)) free = true;
    if (EV) {
      const areas = [...new Set(EV.map((e) => e.area))].sort((a, b) => b.length - a.length);
      for (const a of areas) { const re = new RegExp(`\\b${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`); if (a !== "Orlando" && re.test(s)) { area = a; s = s.replace(re, " "); break; } }
    }
    const words = s.split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^(event|events|orlando|happening|going|thing|things|on)$/.test(w));
    const terms = words.map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
    return { terms, from, to, free, area, raw: q };
  }
  const hay = (e) => ({ title: e.title.toLowerCase(), cats: e.categories.join(" ").toLowerCase(), loc: `${e.location || ""} ${e.area}`.toLowerCase(), desc: (e.description || "").toLowerCase() });
  const variants = (t) => SYN[t] || [t];
  function searchEvents(p) {
    const from = p.from || todayISO, to = p.to;
    let pool = (EV || []).filter((e) => e.end_date >= from && (!to || e.start_date <= to));
    if (p.free) pool = pool.filter((e) => e.categories.includes("Free Events"));
    if (p.area) pool = pool.filter((e) => e.area === p.area);
    const scored = pool.map((e) => {
      const h = hay(e); let s = 0, all = true;
      for (const t of p.terms) {
        let hit = 0;
        for (const v of variants(t)) { if (h.title.includes(v)) hit = Math.max(hit, 3); else if (h.cats.includes(v) || h.loc.includes(v)) hit = Math.max(hit, 2); else if (h.desc.includes(v)) hit = Math.max(hit, 1); }
        s += hit; if (!hit) all = false;
      }
      return { e, s, all };
    });
    const startKey = (e) => (e.start_date < from ? from : e.start_date);
    const sorter = (a, b) => b.s - a.s || (a.e.runDays > 31) - (b.e.runDays > 31) || startKey(a.e).localeCompare(startKey(b.e)) || a.e.title.localeCompare(b.e.title);
    if (!p.terms.length) return { list: scored.sort(sorter).map((r) => r.e), strict: true };
    const strict = scored.filter((r) => r.all).sort(sorter);
    if (strict.length) return { list: strict.map((r) => r.e), strict: true };
    return { list: scored.filter((r) => r.s > 0).sort(sorter).map((r) => r.e), strict: false };
  }
  function searchSections(p, raw) {
    const q = raw.toLowerCase();
    return SECTIONS.map((x) => {
      const k = ` ${x.k} ${x.t.toLowerCase()} `; let s = 0;
      for (const t of p.terms) for (const v of variants(t)) if (k.includes(` ${v}`)) { s += 1; break; }
      if (/\b(adr|revpar|revpau)\b/.test(q) && x.h.includes("residences-week")) s += 2;
      return { x, s };
    }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.x);
  }
  /* scope: "all" (whole profile) or one section asked about: "hotels" | "events" | "brands" | "prefs" */
  const PROFILE_SCOPES = ["hotels", "events", "brands", "prefs"];
  function profileScope(q) {
    const KSx = window.AMBAR_KNOWLEDGE_SEARCH;
    if (KSx && KSx.profileIntent) return KSx.profileIntent(q);
    return /\b(saved|favou?rite|starred|profile|my (hotels?|brands?|events?|list))\b/i.test(q) ? "all" : null;
  }
  function profileAnswer(scope) {
    scope = PROFILE_SCOPES.includes(scope) ? scope : "all";
    const P = myProfile() || { events: [], hotels: [], brands: [], prefs: null }, L = (window.AMBAR_KNOWLEDGE && window.AMBAR_KNOWLEDGE.lookups) || {};
    const link = `<a href="${esc(profilePage())}">Open My Profile →</a>`;
    const starHow = `To save one, go to <a href="${esc(home("#hotels"))}">Hotels</a> and tap the star (☆) on a hotel card, or next to a hotel’s name in <a href="${esc(home("#byHotel"))}">By hotel</a>; starred hotels show up here and in My Profile.`;
    if (scope === "all" && !P.events.length && !P.hotels.length && !P.brands.length && !P.prefs) {
      return `<p>Your profile on this browser is empty so far. Star hotels in <a href="${esc(home("#hotels"))}">Hotels</a>, pick brands in <a href="${esc(home("#familiar"))}">Your brands</a> and save events on the <a href="${esc(evPage())}">events page</a>; they all show up in ${link.replace("Open My Profile →", "My Profile")}.</p>`;
    }
    const want = (k) => scope === "all" || scope === k;
    let h = "";
    if (want("hotels")) {
      if (P.hotels.length) h += `<p>Your favourite hotels (${P.hotels.length}):</p><ul class="as-secs as-favs">${P.hotels.map((id) => `<li><a href="${esc(home("#hotel-" + id))}">${esc((L.hotels && L.hotels[id]) || id)}</a></li>`).join("")}</ul>`;
      else if (scope === "hotels") h += `<p>You haven’t starred any favourite hotels yet. ${starHow}</p>`;
    }
    if (want("brands")) {
      if (P.brands.length) {
        const by = {};
        for (const id of P.brands) { const b = L.brands && L.brands[id]; if (b) (by[b.parent] = by[b.parent] || []).push(b.name); }
        h += `<p>Brands you know: ${Object.keys(by).map((k) => `<b>${esc(k)}</b>: ${esc(by[k].join(", "))}`).join("; ")}.</p>`;
      } else if (scope === "brands") h += `<p>You haven’t picked any hotel brands yet. Tick the ones you know in <a href="${esc(home("#familiar"))}">Your brands</a>.</p>`;
    }
    if (want("events")) {
      if (P.events.length) h += `<p>Saved events (${P.events.length}):</p><ul class="as-evs">${P.events.slice(0, 8).map((e) => `<li>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title || "Event")}</a>` : esc(e.title || "Event")}${e.start_date ? `<span>${esc(e.start_date === e.end_date || !e.end_date ? fMD(e.start_date) : `${fMD(e.start_date)} – ${fMD(e.end_date)}`)}</span>` : ""}</li>`).join("")}</ul>${P.events.length > 8 ? `<p>…and ${P.events.length - 8} more.</p>` : ""}`;
      else if (scope === "events") h += `<p>You haven’t saved any events yet. Tap “Save” on any listing on the <a href="${esc(evPage())}">events page</a> and it will show up here and in My Profile.</p>`;
    }
    if (want("prefs")) {
      if (P.prefs) h += `<p>You have event preferences saved; see <a href="${esc(evPage("", "#preferences"))}">Recommended for you</a>.</p>`;
      else if (scope === "prefs") h += `<p>You haven’t set any event preferences yet. Set them in <a href="${esc(evPage("", "#preferences"))}">Recommended for you</a>.</p>`;
    }
    return h + `<p>${link}</p>`;
  }
  function guideAnswer(q) {
    const p = parse(q);
    const scope = profileScope(q);
    if (scope) return { html: profileAnswer(scope), events: [], profileScope: scope };
    const isHelp = /^\s*(help|hi|hello|hey|\?|what can you do)\b/i.test(q);
    if (isHelp) return { html: `<p>I’m the offline site guide: I search this site’s sections and the Visit Orlando listings and give you links. I’m not AI and won’t make up answers.</p><p>Try “concerts this weekend”, “free events in Winter Park”, “how do I get from Miami?”, “which Marriott brands are in Orlando?”, “best time to visit”, “my saved hotels” or “how are rates gathered”.</p>`, events: [] };
    const kh = knowledgeHits(q).filter((r) => r.doc.kind !== "profile");
    const KS = window.AMBAR_KNOWLEDGE_SEARCH;
    /* events come from the knowledge index when it's loaded (one doc per Visit Orlando listing, with its source link) */
    const ES = KX && KS && KS.eventSearch ? KS.eventSearch(KX, q, { today: todayISO, k: 60 }) : null;
    const siteHits = kh.filter((r) => r.doc.kind !== "event" && r.doc.kind !== "events-meta");
    const sections = siteHits.length
      ? siteHits.map((r) => ({ t: r.doc.title, h: siteUrl(r.doc.url), d: KS.snippet(r.doc, q, 200) + (r.doc.as_of ? ` (as of ${r.doc.as_of})` : ""), ext: /^https?:/.test(r.doc.url) }))
      : (ES ? [] : searchSections(p, q));
    let res, eventIntent;
    if (ES) {
      const named = kh.filter((r) => r.doc.kind === "event");
      eventIntent = ES.intent || named.length > 0;
      const hits = ES.intent ? ES.hits : named;
      res = { list: hits.map((r) => docEvent(r.doc)), strict: true, total: ES.intent ? ES.total : hits.length };
      if (ES.when) { p.from = ES.when.from; p.to = ES.when.to; }
    } else {
      eventIntent = p.from || p.free || p.area || p.terms.length > 0;
      res = eventIntent ? searchEvents(p) : { list: [], strict: true };
      res.total = res.list.length;
    }
    const looksLikeSiteQ = sections.length && !sections.some((s) => /events\/|profile\/|#preferences/i.test(s.h)) && res.list.length && !res.strict;
    const evs = looksLikeSiteQ ? [] : res.list;
    const cur = ES && ES.currency;
    const curNote = cur && (evs.length || ES.intent)
      ? `<p class="as-note">${ES.outside ? "That’s outside the dates this site has listings for. " : ""}Events data: ${esc(cur.source || "Visit Orlando")} listings captured ${esc(fMDY(cur.captured))}, covering ${esc(fMD(cur.window_start))} – ${esc(fMDY(cur.window_end))}. Listings can change, so check each event’s <a href="${esc(cur.calendar_url || calUrl())}" target="_blank" rel="noopener">Visit Orlando</a> link for the latest details.</p>`
      : "";
    const aboutData = /\b(data|updated?|current|latest|stale|captured|fresh|up to date)\b/i.test(q);
    let html = "";
    const when = p.from ? (p.from === p.to ? ` on ${fMD(p.from)}` : ` ${fMD(p.from)} – ${fMD(p.to)}`) : "";
    if (evs.length) {
      const qs = new URLSearchParams();
      if (p.terms.length && res.strict && p.terms.every((t) => evs.some((e) => `${e.title} ${e.location || ""} ${e.area} ${e.categories.join(" ")} ${e.description || ""}`.toLowerCase().includes(t)))) qs.set("q", p.terms.join(" "));
      if (p.area) qs.set("area", p.area);
      if (p.from) qs.set("from", p.from);
      if (p.to) qs.set("to", p.to);
      if (p.free) qs.set("cat", "Free Events");
      html += `<p>${res.total} Visit Orlando listing${res.total === 1 ? "" : "s"}${when}${p.area ? ` in ${esc(p.area)}` : ""}${p.free ? " tagged Free" : ""}${res.strict ? "" : " (closest keyword matches)"}. Top ${Math.min(5, evs.length)}:</p><ul class="as-evs">` +
        evs.slice(0, 5).map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a><span>${esc(e.start_date === e.end_date ? fMD(e.start_date) : `${fMD(e.start_date)} – ${fMD(e.end_date)}`)} · ${esc([e.location, e.area].filter(Boolean).join(", "))}</span></li>`).join("") +
        `</ul><p><a href="${esc(evPage(qs.toString() ? "?" + qs.toString() : ""))}">See all matches on the events page →</a></p>`;
    } else if (eventIntent && !sections.length && !(ES && aboutData)) {
      html += `<p>I couldn’t find a Visit Orlando listing on this site matching that${when}. Try fewer words, or check the <a href="${esc(calUrl())}" target="_blank" rel="noopener">Visit Orlando calendar</a>.</p>`;
    }
    html += curNote;
    if (sections.length) html += `<p>${evs.length ? "Related on this site:" : "On this site:"}</p><ul class="as-secs">${sections.map((s) => `<li><a href="${esc(s.h)}"${s.ext ? ' target="_blank" rel="noopener"' : ""}>${esc(s.t)}</a><span>${esc(s.d)}</span></li>`).join("")}</ul>`;
    if (!html) html = `<p>I couldn’t find that on this site. I can point you to events (try “concerts this weekend”), getting here (“how do I get from Miami?”), hotel brands, the week-ahead rates, hotels, demand context, news, sources or your profile.</p>`;
    return { html, events: evs };
  }

  /* ---------- UI ---------- */
  const css = document.querySelector('link[href$="assistant.css"]');
  if (!css) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `${ROOT}assets/css/assistant.css`; document.head.appendChild(l); }
  const launcher = document.createElement("button");
  launcher.type = "button"; launcher.className = "as-launch"; launcher.id = "asLaunch";
  launcher.setAttribute("aria-expanded", "false"); launcher.setAttribute("aria-controls", "asPanel");
  launcher.innerHTML = `<span class="as-dot" aria-hidden="true"></span>${AI ? "Ask Isla" : "Site guide"}`;
  const panel = document.createElement("div");
  panel.className = "as-panel"; panel.id = "asPanel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", "asTitle");
  panel.innerHTML = `
    <div class="as-head">
      <div><h2 class="as-title" id="asTitle">${AI ? "Isla · Orlando assistant" : "Orlando site guide"}</h2>
      <p class="as-mode">${AI ? "Powered by Isla AI - ABI Group" : "Offline site guide · keyword search, not AI"}</p></div>
      <button type="button" class="as-close" aria-label="Close ${AI ? "assistant" : "site guide"}">×</button>
    </div>
    <div class="as-log" id="asLog" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div>
    <div class="as-suggest" role="group" aria-label="Suggested questions">
      <button type="button" data-ask="Concerts this weekend">Concerts this weekend</button>
      <button type="button" data-ask="How do I get from Miami?">From Miami</button>
      <button type="button" data-ask="Which Marriott brands are in Orlando?">Marriott brands</button>
      <button type="button" data-ask="My saved hotels">My saved hotels</button>
    </div>
    <form class="as-form" id="asForm">
      <label for="asInput" class="sr-only">Ask ${AI ? "Isla" : "the site guide"} a question</label>
      <input id="asInput" type="text" maxlength="500" autocomplete="off" placeholder="${AI ? "Ask about Orlando, your visit or this site" : "Search events, your visit or this site"}">
      <button type="submit" class="as-send">Send</button>
    </form>
    <p class="as-foot">${AI ? "AI answers use this site’s data and can be wrong. Check each Visit Orlando source link." : `Answers are links from this site and <a href="${esc(calUrl())}" target="_blank" rel="noopener">Visit Orlando</a>.`}</p>`;
  document.body.appendChild(launcher);
  document.body.appendChild(panel);
  const log = panel.querySelector("#asLog"), input = panel.querySelector("#asInput"), form = panel.querySelector("#asForm");
  const history = [];
  function add(role, html, cls = "") {
    const div = document.createElement("div");
    div.className = `as-msg as-${role}${cls ? " " + cls : ""}`;
    div.innerHTML = role === "user" ? `<span class="sr-only">You: </span>${html}` : `<span class="sr-only">${AI ? "Isla" : "Site guide"}: </span>${html}`;
    log.appendChild(div); log.scrollTop = log.scrollHeight; return div;
  }
  let greeted = false;
  function open() {
    panel.hidden = false; launcher.setAttribute("aria-expanded", "true"); launcher.hidden = true;
    if (!greeted) {
      greeted = true;
      add("bot", AI ? `<p>Hi, I’m Isla. Ask me about Orlando events, getting here, hotel brands, your profile or where to find something here. I only use this site’s data, cite its sources and never quote fares or invent rates.</p>`
        : `<p>Hi! I’m the offline site guide. I search this site’s pages and data and the Visit Orlando listings and reply with links and short quotes. I’m not AI, so I won’t make up answers. Type “help” for examples.</p>`);
    }
    loadEvents(); loadKnowledge();
    input.focus();
  }
  function close() { panel.hidden = true; launcher.hidden = false; launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
  launcher.addEventListener("click", open);
  panel.querySelector(".as-close").addEventListener("click", close);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } });
  panel.querySelector(".as-suggest").addEventListener("click", (e) => { const b = e.target.closest("[data-ask]"); if (b) ask(b.dataset.ask); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value.trim(); if (q) { input.value = ""; ask(q); } });

  /* render plain AI text safely: escape, then linkify http(s) URLs and site-relative links in [text](url) form */
  function renderAi(text) {
    let h = esc(text);
    h = h.replace(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+|[a-z0-9_\-./]*\.html(?:[?#][^\s):]*)?|#[a-z0-9-]+)\)/gi, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
    h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    return h.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  }
  /* the profile summary the proxy may use: ids it can resolve itself, plus saved Visit Orlando events */
  /* scope: a section-specific profile question ("my saved hotels") sends only that section; anything else sends all */
  function profileContext(scope) {
    const P = myProfile();
    if (!P) return null;
    const only = PROFILE_SCOPES.includes(scope) ? scope : null, want = (k) => !only || only === k;
    return {
      scope: only || "all",
      hotels: want("hotels") ? P.hotels.slice(0, 20) : [], brands: want("brands") ? P.brands.slice(0, 120) : [],
      events: want("events") ? P.events.filter((e) => e.url).slice(0, 25).map((e) => ({ title: e.title, start_date: e.start_date, end_date: e.end_date, url: e.url })) : [],
      prefs: want("prefs") && P.prefs ? { cats: P.prefs.cats, areas: P.prefs.areas, from: P.prefs.from, to: P.prefs.to, budget: P.prefs.budget, party: P.prefs.party, keywords: P.prefs.keywords, access: P.prefs.access } : null,
    };
  }
  let busy = false;
  async function ask(q) {
    if (busy) return;
    add("user", esc(q));
    await Promise.all([loadEvents(), loadKnowledge()]);
    if (!AI) { add("bot", guideAnswer(q).html); return; }
    busy = true; form.querySelector(".as-send").disabled = true;
    const pending = add("bot", `<p class="as-typing">Isla is thinking…</p>`);
    const g = guideAnswer(q);
    let evs = g.events.slice(0, 20);
    if (!evs.length && !g.profileScope) evs = (EV || []).filter((e) => e.end_date >= todayISO).sort((a, b) => (a.runDays > 31) - (b.runDays > 31) || a.start_date.localeCompare(b.start_date)).slice(0, 20);
    history.push({ role: "user", content: q.slice(0, 500) });
    const body = {
      messages: history.slice(-8),
      context: {
        page: PAGE, today: todayISO, calendar_url: calUrl(),
        events: evs.map((e) => ({ title: e.title, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.area, categories: e.categories, url: e.url })),
        knowledge_ids: knowledgeHits(q, 6).filter((r) => r.doc.kind !== "profile").map((r) => r.doc.id),
        profile: profileContext(g.profileScope),
      },
    };
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(PROXY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j.reply !== "string") throw new Error(j.error || `HTTP ${r.status}`);
      history.push({ role: "assistant", content: j.reply.slice(0, 1500) });
      pending.innerHTML = `<span class="sr-only">Isla: </span>${renderAi(j.reply)}`;
    } catch (err) {
      history.pop();
      pending.innerHTML = `<span class="sr-only">Site guide: </span><p class="as-warn">Isla isn’t reachable right now, so here’s the offline site guide (keyword search, not AI):</p>${g.html}`;
    } finally { clearTimeout(t); busy = false; form.querySelector(".as-send").disabled = false; log.scrollTop = log.scrollHeight; }
  }
  window.AMBAR_ASSISTANT = { mode: AI ? "ai" : "guide", open, close, ask, guideAnswer, loadKnowledge, _parse: parse, _profileContext: profileContext };
})();
