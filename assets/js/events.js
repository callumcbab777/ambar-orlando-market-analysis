/* AMBAR Orlando · Visit Orlando events page: calm landing (this week's picks + date buckets), full list with filters,
   My Profile (saved events, kept with favourite hotels and brands in the shared assets/js/profile.js store) with
   "Share my profile" (branded PDF, share link, phone share sheet), a read-only view for old ?shared= event links,
   and My preferences → Recommended for you.
   Data: data/visitorlando_events.js (window.VO_EVENTS_DATA; .js mirror so file:// works). Never invents events.
   Pure helpers (date buckets, share links, picks) live in assets/js/events-core.js and are unit-tested in Node. */
(function () {
  "use strict";
  /* old Plan-tab links (#getting-here, #best-time, #visit-ambar) now live on the Plan your visit page */
  const MOVED = { "#getting-here": "#getting-here", "#best-time": "#best-time", "#visit-ambar": "#visit-ambar" };
  if (MOVED[location.hash]) { location.replace("../visit/" + MOVED[location.hash]); return; }
  window.addEventListener("hashchange", () => { if (MOVED[location.hash]) location.replace("../visit/" + MOVED[location.hash]); });
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const C = window.AMBAR_EV_CORE;
  const D = (iso) => C.parse(iso);
  const fMD = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fMDY = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  /* today in the visitor's own calendar: the date buckets follow the user's local date */
  const todayISO = C.localToday();
  const ROOT = "../";
  /* My Profile store (shared with every page); migrates the old ambar.events.saved.v1 / prefs.v1 keys */
  const P = window.AMBAR_PROFILE;

  const VO = window.VO_EVENTS_DATA;
  const grid = $("#evGrid");
  if (!C || !P || !VO || !Array.isArray(VO.events) || !VO.events.length) {
    const msg = `<p class="vo-empty">Visit Orlando events are not loaded yet. Refresh with <code>scripts/fetch_visitorlando_events.py</code>, or browse the <a href="https://www.visitorlando.com/events/" target="_blank" rel="noopener">Visit Orlando calendar</a>.</p>`;
    if (grid) grid.innerHTML = msg;
    if ($("#evPicks")) $("#evPicks").outerHTML = msg;
    return;
  }

  /* ---------- normalise ---------- */
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const areaOf = (e) => { const c = String(e.city || "").replace(/,\s*FL$/i, "").trim(); return c ? (c === c.toUpperCase() ? titleCase(c) : c) : "Other"; };
  const EVENTS = VO.events
    .filter((e) => e && e.id && e.title && e.url)
    .map((e) => ({ ...e, id: String(e.id), area: areaOf(e), categories: e.categories || [], runDays: Math.round((D(e.end_date) - D(e.start_date)) / 864e5) + 1 }));
  const byId = new Map(EVENTS.map((e) => [e.id, e]));
  const countBy = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const CATS = [...countBy(EVENTS.flatMap((e) => e.categories)).entries()].sort((a, b) => b[1] - a[1]);
  const AREAS = [...countBy(EVENTS.map((e) => e.area)).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const calUrl = VO.calendar_url || "https://www.visitorlando.com/events/";
  const fetched = VO.fetched_at ? VO.fetched_at.slice(0, 10) : null;
  const windowStart = VO.window_start, windowEnd = VO.window_end;
  const defaultFrom = todayISO > windowStart && todayISO <= windowEnd ? todayISO : windowStart;
  const overlaps = C.overlaps;
  const fmtRange = (e) => (e.start_date === e.end_date ? fMD(e.start_date) : `${e.start_date.slice(0, 4) !== e.end_date.slice(0, 4) ? fMDY(e.start_date) : fMD(e.start_date)} – ${fMD(e.end_date)}`);
  const fmtRangeY = (s, e) => (!s ? "Date unknown" : s === e || !e ? fMDY(s) : s.slice(0, 4) === e.slice(0, 4) ? `${fMD(s)} – ${fMDY(e)}` : `${fMDY(s)} – ${fMDY(e)}`);
  const runLabel = (e) => (e.runDays > 31 ? "Ongoing" : e.runDays > 1 ? `${e.runDays}-day run` : "One day");
  const VO_URL = /^https:\/\/www\.visitorlando\.com\//;
  const safeUrl = (u) => (VO_URL.test(u || "") ? u : calUrl);
  const BUCKETS = C.buckets(todayISO);
  /* the one booking link on this site: in-person visit to the AMBAR sales center */
  const VISIT_URL = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar";
  const visitSlim = (id) => `<p class="ev-visit-slim" id="${id}"><span>Planning your trip? Add a visit to AMBAR.</span> <a class="btn btn-visit btn-visit-sm" href="${VISIT_URL}" target="_blank" rel="noopener">Visit AMBAR<span class="sr-only"> (book an in-person visit on Calendly, opens in a new tab)</span></a></p>`;
  const bucketCount = (b) => EVENTS.filter((e) => overlaps(e, b.from, b.to)).length;
  const bRange = (b) => (b.key === "all" ? `From ${fMD(b.from)}` : b.from === b.to ? D(b.from).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : `${fMD(b.from)} – ${fMD(b.to)}`);

  /* ---------- attribution ---------- */
  const srcLine = `Source: <a href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando events calendar</a>${fetched ? ` · fetched ${esc(fMDY(fetched))}` : ""} · listings ${esc(fMD(windowStart))} – ${esc(fMDY(windowEnd))}. Listings are attributed to Visit Orlando and each card links to its official page; this site does not invent events.`;
  $("#evAttrib").innerHTML = srcLine;
  $("#evFooterNote").textContent = `Window ${fMDY(windowStart)} – ${fMDY(windowEnd)}${fetched ? ` · fetched ${fMDY(fetched)}` : ""} · ${EVENTS.length} listings.`;
  if (fetched) $("#evUpdatePill").textContent = `Visit Orlando · ${fMD(fetched)}`;

  /* ---------- saved ---------- */
  let saved = P.get().events;
  const isSaved = (id) => saved.some((s) => s.id === String(id));
  const snapshot = (e) => ({ id: e.id, title: e.title, url: e.url, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.area, saved_at: new Date().toISOString() });
  function toggleSaved(id) {
    id = String(id);
    if (isSaved(id)) P.removeEvent(id);
    else { const e = byId.get(id); if (!e) return; P.toggleEvent(snapshot(e)); }
  }
  /* any change to My Profile (this page, another page or another tab) repaints the saved state */
  P.subscribe((p) => {
    const prefsChanged = JSON.stringify(p.prefs) !== JSON.stringify(prefs);
    saved = p.events; prefs = p.prefs;
    syncSaved();
    if (prefsChanged) { fillForm(prefs); paintReco(); }
  });
  function syncSaved() {
    $("#savedCount").textContent = String(saved.length);
    $$("[data-save]").forEach((b) => {
      const on = isSaved(b.dataset.save);
      b.setAttribute("aria-pressed", String(on));
      const l = b.querySelector(".ev-save-l"); if (l) l.textContent = on ? "Saved" : "Save";
      b.setAttribute("aria-label", `${on ? "Remove from My Profile" : "Save to My Profile"}: ${b.dataset.title}`);
    });
    if (!$("#panel-saved").hidden) paintSaved();
    if (!$("#evShared").hidden) paintSharedActions();
  }

  /* ---------- cards ---------- */
  const saveBtn = (e) => { const on = isSaved(e.id); return `<button type="button" class="ev-save" data-save="${esc(e.id)}" data-title="${esc(e.title)}" aria-pressed="${on}" aria-label="${on ? "Remove from My Profile" : "Save to My Profile"}: ${esc(e.title)}"><span class="ev-save-i" aria-hidden="true"></span><span class="ev-save-l">${on ? "Saved" : "Save"}</span></button>`; };
  const srcLink = (url) => `<a class="ev-src" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">Source: Visit Orlando listing<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a>`;
  function card(e, extra = "") {
    const loc = [e.location, e.area].filter(Boolean).join(" · ");
    const tags = e.categories.slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join("");
    return `<article class="ev-card" data-id="${esc(e.id)}">
      <div class="ev-card-top"><span class="vo-date">${esc(fmtRange(e))}</span><span class="ev-run">${esc(runLabel(e))}</span></div>
      <h3 class="vo-title">${esc(e.title)}</h3>
      ${loc ? `<p class="vo-loc">${esc(loc)}</p>` : ""}
      ${extra}
      ${e.description ? `<p class="vo-desc">${esc(e.description)}</p>` : ""}
      <div class="vo-tags">${tags}</div>
      <div class="ev-card-foot">${srcLink(e.url)}${saveBtn(e)}</div>
    </article>`;
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-save]");
    if (b) { toggleSaved(b.dataset.save); return; }
    const r = ev.target.closest("[data-unsave]");
    if (r) P.removeEvent(r.dataset.unsave);
  });

  /* ---------- landing: dateline, picks, bucket tiles ---------- */
  $("#evDateline").textContent = D(todayISO).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  $("#evStamp").innerHTML = `<span>${esc(D(todayISO).toLocaleDateString("en-US", { month: "short" }))}</span><b>${esc(String(D(todayISO).getDate()))}</b><span>${esc(D(todayISO).toLocaleDateString("en-US", { weekday: "short" }))}</span>`;
  function paintPicks() {
    const list = C.picks(EVENTS, todayISO, 6);
    const box = $("#evPicks");
    if (!list.length) {
      box.outerHTML = `<p class="vo-empty evh-empty" id="evPicks">No Visit Orlando listings for the next seven days in the data on this page (it covers ${esc(fMD(windowStart))} – ${esc(fMDY(windowEnd))}). See the live <a href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando calendar</a>.</p>`;
      return;
    }
    box.innerHTML = list.map((e, i) => `<li class="evh-pick">
        <span class="evh-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
        <div class="evh-pick-body">
          <p class="evh-pick-date">${esc(e.start_date <= todayISO && e.end_date >= todayISO ? (e.runDays > 1 ? `On now · until ${fMD(e.end_date)}` : "Today") : fmtRange(e))}</p>
          <h3 class="evh-pick-title"><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">${esc(e.title)}<span class="sr-only"> (Visit Orlando listing, opens in a new tab)</span></a></h3>
          <p class="evh-pick-loc">${esc([e.location, e.area].filter(Boolean).join(" · "))}</p>
          <div class="evh-pick-foot"><a class="evh-pick-src" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">Visit Orlando listing ↗</a>${saveBtn(e)}</div>
        </div>
      </li>`).join("");
  }
  function paintTiles() {
    $("#evBucketTiles").innerHTML = `<p class="evh-tiles-k">Browse by date</p><ul>${BUCKETS.map((b) => {
      const n = bucketCount(b);
      return `<li><a href="#events" class="evh-tile${n ? "" : " is-empty"}" data-bucket-link="${b.key}">
        <span class="evh-tile-l">${esc(b.label)}</span>
        <span class="evh-tile-d">${esc(bRange(b))}</span>
        <span class="evh-tile-n">${n ? `${n} event${n === 1 ? "" : "s"}` : "Nothing listed"}</span>
      </a></li>`;
    }).join("")}</ul>`;
  }
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-bucket-link]"); if (!a) return;
    ev.preventDefault();
    setBucket(a.dataset.bucketLink);
    if (sharedIds.length) closeShared(false);
    selectTab("browse");
    $("#events").scrollIntoView({ block: "start" });
    $(`[data-quick="${F.when}"]`)?.focus({ preventScroll: true });
  });

  /* ---------- browse + filters ---------- */
  const PAGE = 12;
  const params = new URLSearchParams(location.search);
  const F = { q: params.get("q") || "", cat: "all", area: "all", when: "all", from: todayISO, to: "", sort: "soon", limit: PAGE };
  if (params.get("cat") && CATS.some(([c]) => c === params.get("cat"))) F.cat = params.get("cat");
  if (params.get("area") && AREAS.some(([a]) => a === params.get("area"))) F.area = params.get("area");
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "")) { F.from = params.get("from"); F.when = "custom"; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("to") || "")) { F.to = params.get("to"); F.when = "custom"; }
  if (BUCKETS.some((b) => b.key === params.get("when"))) { const b = BUCKETS.find((x) => x.key === params.get("when")); Object.assign(F, { when: b.key, from: b.from, to: b.to }); }
  $("#evCat").insertAdjacentHTML("beforeend", CATS.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join(""));
  $("#evArea").insertAdjacentHTML("beforeend", AREAS.map(([a, n]) => `<option value="${esc(a)}">${esc(a)} (${n})</option>`).join(""));
  for (const id of ["evFrom", "evTo"]) { $("#" + id).min = windowStart; $("#" + id).max = windowEnd; }
  if (F.cat !== "all" || F.area !== "all" || F.when === "custom") $("#evMoreFilters").open = true;

  function setBucket(key) {
    const b = BUCKETS.find((x) => x.key === key) || BUCKETS[BUCKETS.length - 1];
    Object.assign(F, { when: b.key, from: b.from, to: b.to, limit: PAGE });
    syncInputs(); paint();
  }
  function paintQuick() {
    $("#evQuick").innerHTML = `<span class="ev-when-l" aria-hidden="true">When</span>` + BUCKETS.map((b) => {
      const n = bucketCount(b);
      return `<button type="button" class="ev-when-b" data-quick="${b.key}" aria-pressed="${b.key === F.when}" title="${esc(bRange(b))}">${esc(b.label)} <span class="ev-when-n">${n}</span></button>`;
    }).join("") + (F.when === "custom" ? `<span class="ev-when-custom">Custom dates · <button type="button" class="ev-link-btn" data-quick="all">clear</button></span>` : "");
  }
  $("#evQuick").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-quick]"); if (!b) return;
    setBucket(b.dataset.quick);
    $(`[data-quick="${F.when}"]`)?.focus();
  });
  function syncInputs() { $("#evQ").value = F.q; $("#evCat").value = F.cat; $("#evArea").value = F.area; $("#evFrom").value = F.from; $("#evTo").value = F.to; $("#evSort").value = F.sort; }
  const textOf = (e) => `${e.title} ${e.location || ""} ${e.area} ${e.categories.join(" ")} ${e.description || ""}`.toLowerCase();
  function filtered() {
    const terms = F.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = EVENTS.filter((e) => {
      if (F.cat !== "all" && !e.categories.includes(F.cat)) return false;
      if (F.area !== "all" && e.area !== F.area) return false;
      if (!overlaps(e, F.from, F.to)) return false;
      if (terms.length) { const t = textOf(e); if (!terms.every((w) => t.includes(w))) return false; }
      return true;
    });
    const startKey = (e) => (e.start_date < (F.from || "") ? F.from : e.start_date);
    if (F.sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (F.sort === "short") list.sort((a, b) => (a.runDays > 31) - (b.runDays > 31) || startKey(a).localeCompare(startKey(b)) || a.title.localeCompare(b.title));
    else list.sort((a, b) => startKey(a).localeCompare(startKey(b)) || a.runDays - b.runDays || a.title.localeCompare(b.title));
    return list;
  }
  function paint() {
    paintQuick();
    const list = filtered();
    const show = list.slice(0, F.limit);
    const b = BUCKETS.find((x) => x.key === F.when);
    const range = b ? ` · ${b.label.replace(/^(Today|This|Next|Later|All)/, (m) => m.toLowerCase())} (${bRange(b)})` : ` · ${F.from ? fMD(F.from) : fMD(windowStart)} – ${F.to ? fMD(F.to) : fMD(windowEnd)}`;
    $("#evMeta").textContent = `${list.length} event${list.length === 1 ? "" : "s"}${range}${F.cat !== "all" ? ` · ${F.cat}` : ""}${F.area !== "all" ? ` · ${F.area}` : ""}${F.q ? ` · “${F.q}”` : ""}`;
    const beyond = F.from && F.from > windowEnd;
    const empty = beyond
      ? `<p class="vo-empty">The Visit Orlando data on this page runs to ${esc(fMDY(windowEnd))}, so there’s nothing listed for these dates yet. Check the live <a href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando calendar</a>, or <button type="button" class="ev-link-btn" data-reset>see all upcoming</button>.</p>`
      : F.when === "today" && !F.q && F.cat === "all" && F.area === "all"
        ? `<p class="vo-empty">Nothing listed for today. Try <button type="button" class="ev-link-btn" data-quick-go="weekend">this weekend</button> or <button type="button" class="ev-link-btn" data-quick-go="next">next week</button>.</p>`
        : `<p class="vo-empty">No Visit Orlando events match these filters. <button type="button" class="ev-link-btn" data-reset>Reset filters</button></p>`;
    grid.innerHTML = show.map((e) => card(e)).join("") || empty;
    if (list.length > F.limit) grid.insertAdjacentHTML("beforeend", `<div class="vo-more"><button type="button" id="evMore">Show more (${list.length - F.limit} more)</button></div>`);
  }
  grid.addEventListener("click", (ev) => {
    if (ev.target.id === "evMore") { const n = F.limit; F.limit += PAGE; paint(); grid.querySelectorAll(".ev-card")[n]?.querySelector(".ev-src")?.focus(); }
    if (ev.target.closest("[data-reset]")) reset();
    const g = ev.target.closest("[data-quick-go]"); if (g) setBucket(g.dataset.quickGo);
  });
  let qTimer;
  $("#evQ").addEventListener("input", (ev) => { clearTimeout(qTimer); qTimer = setTimeout(() => { F.q = ev.target.value.trim(); F.limit = PAGE; paint(); }, 150); });
  $("#evCat").addEventListener("change", (ev) => { F.cat = ev.target.value; F.limit = PAGE; paint(); });
  $("#evArea").addEventListener("change", (ev) => { F.area = ev.target.value; F.limit = PAGE; paint(); });
  $("#evFrom").addEventListener("change", (ev) => { F.from = ev.target.value; F.when = "custom"; F.limit = PAGE; paint(); });
  $("#evTo").addEventListener("change", (ev) => { F.to = ev.target.value; F.when = "custom"; F.limit = PAGE; paint(); });
  $("#evSort").addEventListener("change", (ev) => { F.sort = ev.target.value; paint(); });
  function reset() { Object.assign(F, { q: "", cat: "all", area: "all", sort: "soon" }); setBucket("all"); }
  $("#evReset").addEventListener("click", reset);

  /* ---------- My Profile (saved events) + Share my profile ---------- */
  const entryOf = (s) => {
    const e = byId.get(s.id) || s;
    return { id: s.id, title: e.title || "Saved event", dates: fmtRangeY(e.start_date, e.end_date), location: [e.location, e.area].filter(Boolean).join(" · "), url: safeUrl(e.url), end_date: e.end_date || "" };
  };
  const pageBase = () => location.href.split("#")[0].split("?")[0];
  function paintSaved() {
    const sg = $("#savedGrid");
    $("#evShare").hidden = P.isEmpty(P.get());
    $("#evVisitLine").hidden = !saved.length;
    if (!saved.length) {
      $("#savedMeta").textContent = "No saved events in your profile yet.";
      sg.innerHTML = `<p class="vo-empty">Use <b>Save</b> on any event and it will appear here and in <a href="../profile/">My Profile</a>, ready to share as a PDF or a link. Your profile stays in this browser only.</p>`;
      return;
    }
    const live = [], gone = [];
    saved.forEach((s) => (byId.has(s.id) ? live : gone).push(s));
    live.sort((a, b) => byId.get(a.id).end_date.localeCompare(byId.get(b.id).end_date));
    const past = live.filter((s) => byId.get(s.id).end_date < todayISO).length;
    $("#savedMeta").textContent = `${saved.length} saved${gone.length ? ` · ${gone.length} no longer in the current Visit Orlando listings` : ""}${past ? ` · ${past} already ended` : ""}`;
    const goneCard = (s) => `<article class="ev-card ev-card-gone" data-id="${esc(s.id)}">
      <div class="ev-card-top"><span class="vo-date">${s.start_date ? esc(s.start_date === s.end_date ? fMD(s.start_date) : `${fMD(s.start_date)} – ${fMD(s.end_date)}`) : "Date unknown"}</span><span class="ev-run ev-run-gone">No longer listed</span></div>
      <h3 class="vo-title">${esc(s.title || "Saved event")}</h3>
      ${s.location || s.area ? `<p class="vo-loc">${esc([s.location, s.area].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="vo-desc">This event isn’t in the current Visit Orlando data (it may have ended or been removed). Check the original listing, or remove it.</p>
      <div class="ev-card-foot">
        ${VO_URL.test(s.url || "") ? srcLink(s.url) : `<a class="ev-src" href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando calendar<span aria-hidden="true"> ↗</span></a>`}
        <button type="button" class="ev-save" data-unsave="${esc(s.id)}" aria-label="Remove from My Profile: ${esc(s.title || "event")}">Remove</button>
      </div>
    </article>`;
    sg.innerHTML = live.map((s) => card(byId.get(s.id), byId.get(s.id).end_date < todayISO ? `<p class="ev-flag">Ended ${esc(fMD(byId.get(s.id).end_date))}</p>` : "")).join("") + gone.map(goneCard).join("");
  }
  /* Share my profile: whole profile (events, hotels, brands, preferences) as a PDF or a ../profile/?p= link */
  window.AMBAR_PROFILE_SHARE.wire(ROOT, { pdf: "shPdf", copy: "shCopy", native: "shNative", status: "shStatus" }, () => P.get(), "My Orlando profile");
  const genDate = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  /* PDF of an events-only list (the read-only view of an old ?shared= link) */
  async function makePdf(entries, title, link, statusFn) {
    statusFn("Preparing your PDF…");
    try {
      const sorted = entries.slice().sort((a, b) => (a.end_date || "9").localeCompare(b.end_date || "9"));
      await window.AMBAR_EV_PDF.download(ROOT, sorted, {
        title, generated: genDate(),
        subtitle: `${sorted.length} event${sorted.length === 1 ? "" : "s"} from the Visit Orlando calendar  ·  Generated ${genDate()}`,
        pageUrl: link,
      }, `orlando-events-${todayISO}.pdf`);
      statusFn("PDF downloaded.");
    } catch (err) {
      statusFn("Sorry, the PDF couldn’t be created here. Use your browser’s Print → Save as PDF instead.");
    }
  }

  /* ---------- shared-list view (?shared=id.id.id) ---------- */
  const decoded = C.decodeShare(params.get("shared"), byId);
  let sharedIds = decoded.ids;
  function paintSharedActions() {
    const notMine = sharedIds.filter((id) => !isSaved(id)).length;
    const b = $("#shAddAll");
    if (b) { b.disabled = !notMine; b.textContent = notMine ? `Save all ${notMine === sharedIds.length ? sharedIds.length : notMine} to my profile` : "All saved to my profile"; }
  }
  function paintShared() {
    const box = $("#evShared");
    if (!params.has("shared")) { box.hidden = true; return; }
    box.hidden = false;
    const evs = sharedIds.map((id) => byId.get(id));
    box.innerHTML = `<div class="wrap">
      <header class="ev-shared-head">
        <div>
          <p class="evh-kicker">Shared with you</p>
          <h2 id="evSharedTitle">An Orlando list, <em>shared with you</em></h2>
          <p class="ev-shared-meta">${evs.length ? `${evs.length} event${evs.length === 1 ? "" : "s"} from the Visit Orlando calendar.` : "None of the events in this link are in the current Visit Orlando listings."}${decoded.unknown ? ` ${decoded.unknown} item${decoded.unknown === 1 ? " in the link was" : "s in the link were"} not recognised or no longer listed, so ${decoded.unknown === 1 ? "it’s" : "they’re"} not shown.` : ""} This view is read-only; save any you like to your own profile.</p>
        </div>
        <div class="ev-shared-actions">
          ${evs.length ? `<button type="button" class="btn btn-solid" id="shAddAll"></button><button type="button" class="btn btn-outline" id="shSharedPdf">Download PDF</button>` : ""}
          <button type="button" class="ev-link-btn" id="shClose">Close shared list</button>
        </div>
      </header>
      <p class="ev-status" id="shSharedStatus" role="status" aria-live="polite"></p>
      ${evs.length ? visitSlim("evSharedVisit") : ""}
      ${evs.length ? `<div class="vo-grid ev-grid">${evs.map((e) => card(e)).join("")}</div>` : `<p class="vo-empty">Browse <a href="#events" data-bucket-link="all">all upcoming events</a> instead.</p>`}
    </div>`;
    paintSharedActions();
  }
  function closeShared(scroll = true) {
    sharedIds = []; params.delete("shared");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    $("#evShared").hidden = true; $("#evShared").innerHTML = "";
    if (scroll) $("#top").scrollIntoView({ block: "start" });
  }
  $("#evShared").addEventListener("click", (ev) => {
    if (ev.target.id === "shClose") closeShared();
    if (ev.target.id === "shAddAll") {
      let n = 0;
      const add = sharedIds.filter((id) => !isSaved(id) && byId.get(id)).map((id) => snapshot(byId.get(id)));
      n = add.length;
      if (n) P.update((p) => { p.events = [...p.events, ...add]; return p; });
      $("#shSharedStatus").innerHTML = n ? `Added ${n} to your profile. <a href="../profile/">Open My Profile</a> to see or share it.` : "Already in your profile.";
    }
    if (ev.target.id === "shSharedPdf") makePdf(sharedIds.map((id) => entryOf({ id })), "An Orlando list", C.shareUrl(pageBase(), sharedIds), (m) => { $("#shSharedStatus").textContent = m; });
  });

  /* ---------- preferences + Recommended for you ---------- */
  const TOP_AREAS = AREAS.slice(0, 10).map(([a]) => a);
  $("#pfCats").innerHTML = CATS.map(([c]) => `<label><input type="checkbox" name="cats" value="${esc(c)}"> ${esc(c)}</label>`).join("");
  $("#pfAreas").innerHTML = TOP_AREAS.map((a) => `<label><input type="checkbox" name="areas" value="${esc(a)}"> ${esc(a)}</label>`).join("");
  for (const id of ["pfFrom", "pfTo"]) { $("#" + id).min = windowStart; $("#" + id).max = windowEnd; }
  const FAMILY_RE = /\b(kids?|family|families|children|child|all ages|toddlers?)\b/i;
  const ACCESS_RE = /\b(accessib\w*|sensory|asl|wheelchair|access for all|neurodivers\w*)\b/i;
  let prefs = P.get().prefs;
  const hasPrefs = (p) => !!p && ((p.cats || []).length || (p.areas || []).length || (p.keywords || []).length || p.from || p.to || p.budget === "free" || p.party === "family" || p.access);

  function readForm() {
    const f = $("#prefsForm");
    return {
      cats: $$('input[name="cats"]:checked', f).map((i) => i.value),
      areas: $$('input[name="areas"]:checked', f).map((i) => i.value),
      from: $("#pfFrom").value || "", to: $("#pfTo").value || "",
      budget: (f.querySelector('input[name="budget"]:checked') || {}).value || "any",
      party: (f.querySelector('input[name="party"]:checked') || {}).value || "any",
      keywords: $("#pfKw").value.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 1).slice(0, 8),
      access: $("#pfAccess").checked,
      saved_at: new Date().toISOString(),
    };
  }
  function fillForm(p) {
    const f = $("#prefsForm");
    $$('input[name="cats"]', f).forEach((i) => (i.checked = !!p && (p.cats || []).includes(i.value)));
    $$('input[name="areas"]', f).forEach((i) => (i.checked = !!p && (p.areas || []).includes(i.value)));
    $("#pfFrom").value = (p && p.from) || ""; $("#pfTo").value = (p && p.to) || "";
    $$('input[name="budget"]', f).forEach((i) => (i.checked = i.value === ((p && p.budget) || "any")));
    $$('input[name="party"]', f).forEach((i) => (i.checked = i.value === ((p && p.party) || "any")));
    $("#pfKw").value = p && p.keywords ? p.keywords.join(", ") : "";
    $("#pfAccess").checked = !!(p && p.access);
  }
  /* Transparent, deterministic scoring. Shown to the user under "How this is ranked". */
  function score(e, p) {
    const why = []; let s = 0;
    const catHits = e.categories.filter((c) => (p.cats || []).includes(c));
    if (catHits.length) { s += 3 * catHits.length; why.push(...catHits); }
    if ((p.areas || []).includes(e.area)) { s += 2; why.push(e.area); }
    const t = textOf(e);
    const kwHits = (p.keywords || []).filter((k) => t.includes(k));
    if (kwHits.length) { s += Math.min(4, 2 * kwHits.length); why.push(...kwHits.map((k) => `“${k}”`)); }
    if (p.party === "family" && FAMILY_RE.test(`${e.title} ${e.description || ""}`)) { s += 2; why.push("Family-friendly wording"); }
    if (p.access && ACCESS_RE.test(`${e.title} ${e.description || ""}`)) { s += 2; why.push("Accessibility"); }
    if (p.budget === "free" && e.categories.includes("Free Events")) why.push("Free");
    const matched = s > 0 || (p.budget === "free" && !(p.cats || []).length && !(p.areas || []).length && !(p.keywords || []).length);
    if (matched && e.runDays <= 7) s += 1;
    return { s, why, matched };
  }
  function recommend(p) {
    const from = p.from || defaultFrom, to = p.to || "";
    return EVENTS
      .filter((e) => overlaps(e, from, to) && (p.budget !== "free" || e.categories.includes("Free Events")))
      .map((e) => ({ e, ...score(e, p) }))
      .filter((r) => r.matched)
      .sort((a, b) => b.s - a.s || (a.e.start_date < from ? from : a.e.start_date).localeCompare(b.e.start_date < from ? from : b.e.start_date) || a.e.title.localeCompare(b.e.title))
      .slice(0, 6);
  }
  function summary(p) {
    const bits = [];
    if ((p.cats || []).length) bits.push(p.cats.join(", "));
    if ((p.areas || []).length) bits.push(p.areas.join(", "));
    if (p.from || p.to) bits.push(`${p.from ? fMD(p.from) : "today"} – ${p.to ? fMD(p.to) : fMD(windowEnd)}`);
    if (p.budget === "free") bits.push("free only");
    if (p.party && p.party !== "any") bits.push({ solo: "just me", couple: "couple", group: "friends / group", family: "family with kids" }[p.party]);
    if ((p.keywords || []).length) bits.push(p.keywords.map((k) => `“${k}”`).join(" "));
    if (p.access) bits.push("accessibility");
    return bits.join(" · ");
  }
  function paintReco() {
    const box = $("#evReco");
    if (!hasPrefs(prefs)) { box.hidden = true; box.innerHTML = ""; return; }
    const recs = recommend(prefs);
    box.hidden = false;
    box.innerHTML = `<div class="ev-reco-head">
        <div><h3 class="ev-reco-title" id="recoTitle">Recommended for you</h3><p class="ev-reco-tag">Powered by Isla AI - ABI Group</p></div>
        <div class="ev-reco-actions"><button type="button" class="ev-link-btn" data-goto="prefs">Edit preferences</button><button type="button" class="ev-link-btn" id="recoClear">Clear</button></div>
      </div>
      <p class="ev-reco-sum">Based on: ${esc(summary(prefs))}</p>
      ${recs.length ? `<div class="vo-grid ev-grid ev-reco-grid" role="list" aria-labelledby="recoTitle">${recs.map((r) => `<div role="listitem">${card(r.e, `<p class="ev-why"><span>Why:</span> ${esc(r.why.join(" · ") || "Matches your dates")}</p>`)}</div>`).join("")}</div>`
        : `<p class="vo-empty">No current Visit Orlando listings match these preferences. Try more interests or areas, or widen the dates.</p>`}
      <details class="ev-how"><summary>How this is ranked</summary><p>Ranked in your browser from your preferences and the Visit Orlando listing text only: +3 per matching interest, +2 for a matching area, +2 per keyword found (max +4), +2 for family-friendly wording when “Family with kids” is chosen, +2 for accessibility wording when that box is ticked, +1 for events running 7 days or fewer. Events outside your dates (or without the Free Events tag, when “Free only” is chosen) are left out. Ties go to the soonest event. Nothing is sent anywhere.</p></details>`;
    syncSaved();
  }
  $("#evReco").addEventListener("click", (ev) => {
    if (ev.target.id === "recoClear") clearPrefs();
  });
  $("#prefsForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = readForm();
    if (p.from && p.to && p.from > p.to) { $("#pfStatus").textContent = "“From” must be on or before “To”."; $("#pfFrom").focus(); return; }
    if (!hasPrefs(p)) { $("#pfStatus").textContent = "Pick at least one interest, area, date, keyword or option."; return; }
    prefs = P.cleanPrefs(p); P.setPrefs(prefs);
    $("#pfStatus").textContent = "Saved. Your recommendations are at the top of All events.";
    paintReco();
    selectTab("browse", true);
    $("#evReco").scrollIntoView({ block: "start" });
  });
  function clearPrefs() {
    prefs = null; P.clearPrefs(); fillForm(null); paintReco();
    $("#pfStatus").textContent = "Preferences cleared.";
  }
  $("#pfClear").addEventListener("click", clearPrefs);

  /* ---------- tabs (WAI-ARIA tabs, automatic activation) ---------- */
  const TABS = ["browse", "saved", "prefs"];
  const TAB_HASH = { browse: "", saved: "#saved", prefs: "#preferences" };
  function selectTab(name, focusTab) {
    TABS.forEach((t) => {
      const on = t === name, tab = $("#tab-" + t);
      tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1;
      $("#panel-" + t).hidden = !on;
      if (on && focusTab) tab.focus();
    });
    if (name === "saved") paintSaved();
    /* only rewrite the hash when it is one of ours, so #plan / #events anchors keep working */
    const hash = TAB_HASH[name];
    if (["", "#saved", "#preferences"].includes(location.hash) && location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
    if (name !== "browse" && location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  }
  $("#evTabs").addEventListener("click", (ev) => { const t = ev.target.closest('[role="tab"]'); if (t) selectTab(t.id.slice(4)); });
  $("#evTabs").addEventListener("keydown", (ev) => {
    const i = TABS.indexOf(document.activeElement.id.slice(4)); if (i < 0) return;
    const k = ev.key; let n = null;
    if (k === "ArrowRight") n = (i + 1) % TABS.length; else if (k === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length; else if (k === "Home") n = 0; else if (k === "End") n = TABS.length - 1;
    if (n !== null) { ev.preventDefault(); selectTab(TABS[n], true); }
  });
  document.addEventListener("click", (ev) => { const g = ev.target.closest("[data-goto]"); if (g) { selectTab(g.dataset.goto, true); $("#events").scrollIntoView({ block: "start" }); } });
  function fromHash() {
    const h = location.hash;
    if (h === "#saved") selectTab("saved"); else if (h === "#preferences") selectTab("prefs"); else if (h === "") selectTab("browse");
  }
  window.addEventListener("hashchange", fromHash);

  /* boot */
  fillForm(prefs);
  syncInputs();
  paintPicks();
  paintTiles();
  paint();
  paintReco();
  paintShared();
  syncSaved();
  fromHash();
  if (location.hash === "#saved" || location.hash === "#preferences") $("#events").scrollIntoView({ block: "start" });
  /* expose a read-only view for the assistant widget */
  window.AMBAR_EVENTS = { events: EVENTS, today: todayISO, defaultFrom, windowStart, windowEnd, calendarUrl: calUrl, buckets: BUCKETS };
})();
