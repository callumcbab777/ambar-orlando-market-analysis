/* AMBAR Orlando · site assistant widget (events page + main site).
   - AI mode: only when window.AMBAR_ASSISTANT_CONFIG.proxyUrl is set. Messages go to that proxy (assistant-proxy/),
     which holds the LLM key server-side. No API key is ever in this file or this repo.
   - Offline "site guide" mode (default): local keyword search over the site's sections and the Visit Orlando
     events data. It returns links only and never makes up answers. It is labelled as not AI. */
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
  const addDays = (iso, n) => { const d = D(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const todayISO = (() => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } })();
  const home = (hash) => (PAGE === "home" ? hash : `${ROOT}index.html${hash}`);
  const evPage = (qs = "", hash = "") => `${ROOT}events/index.html${qs}${hash}`;

  /* ---------- site map (what the guide can point to) ---------- */
  const SECTIONS = [
    { t: "Week ahead · nightly rates", h: home("#week-ahead"), d: "Lowest public nightly rates for each tracked hotel, by night.", k: "rate rates nightly night price prices cheapest tonight week ahead grid hotel heatmap" },
    { t: "Residences · the week ahead", h: home("#residences-week"), d: "Labelled estimates of ADR and RevPAU for each AMBAR floor plan.", k: "residence residences ambar adr revpar revpau estimate estimates floor plan studio bedroom owner economics cap occupancy" },
    { t: "History · how rates moved", h: home("#history"), d: "Week-over-week rate chart and per-hotel charts.", k: "history chart trend trends moved change week over" },
    { t: "Marriott brand matrix", h: home("#brands"), d: "Where AMBAR and the Marriott hotels sit in the Marriott portfolio.", k: "marriott brand brands matrix tier portfolio autograph premium luxury bonvoy" },
    { t: "The hotels + map", h: home("#hotels"), d: "The comparable hotels, their locations and distances.", k: "hotels hotel map location locations distance jw ritz swan dolphin gaylord hyatt conrad wyndham ette comparable comps" },
    { t: "Demand context", h: home("#demand"), d: "Conventions, Disney calendars and notes from the weekly briefs; metro occupancy.", k: "demand convention conventions disney occupancy market context brief briefs" },
    { t: "Orlando & hospitality news", h: home("#news"), d: "Marriott, wider Orlando and hospitality-media headlines.", k: "news headlines headline hospitality media article articles" },
    { t: "Sources & methodology", h: home("#sources"), d: "How the figures are gathered, caveats and sources.", k: "source sources methodology method caveat caveats data how gathered disclaimer" },
    { t: "Orlando events (Visit Orlando)", h: evPage(), d: "Browse and filter Visit Orlando listings by date, category and area.", k: "event events whats what's on things do calendar concert concerts festival festivals show shows visit orlando activities activity" },
    { t: "My list (saved events) · Share my list", h: evPage("", "#saved"), d: "Events you saved on this browser; download them as a PDF or share a link with friends and family.", k: "saved save bookmark bookmarks favourite favourites favorite favorites share sharing pdf link send list friends family" },
    { t: "Getting here: MCO and SFB airports", h: evPage("", "#getting-here"), d: "Nonstop routes from the UK and other markets, drive times from AMBAR, and a Google Flights link.", k: "flight flights fly airport airports mco sanford sfb getting here travel uk london gatwick heathrow manchester edinburgh drive airline airlines" },
    { t: "Best time to visit Orlando", h: evPage("", "#best-time"), d: "Average high/low temperatures by month (NOAA) and typical crowd levels.", k: "best time when weather temperature temperatures climate crowd crowds busy quiet season seasons month months" },
    { t: "Visit AMBAR: meet us at the sales center", h: evPage("", "#visit-ambar"), d: "Book an in-person visit to the AMBAR sales center in Kissimmee, plus directions.", k: "book booking meet in person tour visit sales center centre appointment meeting address directions calendly contact" },
    { t: "My preferences → Recommended for you", h: evPage("", "#preferences"), d: "Set interests, areas, dates and budget to get a ranked shortlist.", k: "preference preferences recommend recommended recommendation recommendations personalise personalize interests for me" },
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
  function guideAnswer(q) {
    const p = parse(q);
    const isHelp = /^\s*(help|hi|hello|hey|\?|what can you do)\b/i.test(q);
    if (isHelp) return { html: `<p>I’m the offline site guide: I search this site’s sections and the Visit Orlando listings and give you links. I’m not AI and won’t make up answers.</p><p>Try “concerts this weekend”, “free events in Winter Park”, “family events Nov 7”, “brand matrix” or “how are rates gathered”.</p>`, events: [] };
    const sections = searchSections(p, q);
    const eventIntent = p.from || p.free || p.area || p.terms.length > 0;
    const res = eventIntent ? searchEvents(p) : { list: [], strict: true };
    const looksLikeSiteQ = sections.length && !sections.some((s) => /events|saved|preferences/i.test(s.t)) && res.list.length && !res.strict;
    const evs = looksLikeSiteQ ? [] : res.list;
    let html = "";
    const when = p.from ? (p.from === p.to ? ` on ${fMD(p.from)}` : ` ${fMD(p.from)} – ${fMD(p.to)}`) : "";
    if (evs.length) {
      const qs = new URLSearchParams();
      if (p.terms.length && res.strict && p.terms.every((t) => evs.some((e) => `${e.title} ${e.location || ""} ${e.area} ${e.categories.join(" ")} ${e.description || ""}`.toLowerCase().includes(t)))) qs.set("q", p.terms.join(" "));
      if (p.area) qs.set("area", p.area);
      if (p.from) qs.set("from", p.from);
      if (p.to) qs.set("to", p.to);
      if (p.free) qs.set("cat", "Free Events");
      html += `<p>${evs.length} Visit Orlando listing${evs.length === 1 ? "" : "s"}${when}${p.area ? ` in ${esc(p.area)}` : ""}${p.free ? " tagged Free" : ""}${res.strict ? "" : " (closest keyword matches)"}. Top ${Math.min(5, evs.length)}:</p><ul class="as-evs">` +
        evs.slice(0, 5).map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a><span>${esc(e.start_date === e.end_date ? fMD(e.start_date) : `${fMD(e.start_date)} – ${fMD(e.end_date)}`)} · ${esc([e.location, e.area].filter(Boolean).join(", "))}</span></li>`).join("") +
        `</ul><p><a href="${esc(evPage(qs.toString() ? "?" + qs.toString() : ""))}">See all matches on the events page →</a></p>`;
    } else if (eventIntent && !sections.length) {
      html += `<p>I couldn’t find a Visit Orlando listing on this site matching that${when}. Try fewer words, or check the <a href="${esc(calUrl())}" target="_blank" rel="noopener">Visit Orlando calendar</a>.</p>`;
    }
    if (sections.length) html += `<p>${evs.length ? "Related on this site:" : "On this site:"}</p><ul class="as-secs">${sections.map((s) => `<li><a href="${esc(s.h)}">${esc(s.t)}</a><span>${esc(s.d)}</span></li>`).join("")}</ul>`;
    if (!html) html = `<p>I couldn’t find that on this site. I can point you to events (try “concerts this weekend”) or sections like the week-ahead rates, brand matrix, hotels, demand context, news or sources.</p>`;
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
      <button type="button" data-ask="Free events">Free events</button>
      <button type="button" data-ask="Family events in Winter Park">Family · Winter Park</button>
      <button type="button" data-ask="Where are the hotel rates?">Hotel rates</button>
    </div>
    <form class="as-form" id="asForm">
      <label for="asInput" class="sr-only">Ask ${AI ? "Isla" : "the site guide"} a question</label>
      <input id="asInput" type="text" maxlength="500" autocomplete="off" placeholder="${AI ? "Ask about Orlando events or this site" : "Search events or this site"}">
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
      add("bot", AI ? `<p>Hi, I’m Isla. Ask me about Orlando events on this site or where to find something here. I only use this site’s data and link to Visit Orlando for every event.</p>`
        : `<p>Hi! I’m the offline site guide. I search this site’s sections and the Visit Orlando listings and reply with links. I’m not AI, so I won’t make up answers. Type “help” for examples.</p>`);
    }
    loadEvents();
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
  let busy = false;
  async function ask(q) {
    if (busy) return;
    add("user", esc(q));
    await loadEvents();
    if (!AI) { add("bot", guideAnswer(q).html); return; }
    busy = true; form.querySelector(".as-send").disabled = true;
    const pending = add("bot", `<p class="as-typing">Isla is thinking…</p>`);
    const g = guideAnswer(q);
    let evs = g.events.slice(0, 20);
    if (!evs.length) evs = (EV || []).filter((e) => e.end_date >= todayISO).sort((a, b) => (a.runDays > 31) - (b.runDays > 31) || a.start_date.localeCompare(b.start_date)).slice(0, 20);
    history.push({ role: "user", content: q.slice(0, 500) });
    const body = {
      messages: history.slice(-8),
      context: {
        page: PAGE, today: todayISO, calendar_url: calUrl(),
        sections: SECTIONS.map((s) => ({ title: s.t, url: new URL(s.h, location.href).href, about: s.d })),
        events: evs.map((e) => ({ title: e.title, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.area, categories: e.categories, url: e.url })),
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
  window.AMBAR_ASSISTANT = { mode: AI ? "ai" : "guide", open, close, ask, guideAnswer, _parse: parse };
})();
