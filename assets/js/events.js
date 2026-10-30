/* AMBAR Orlando · Visit Orlando events page: browse + filters, Saved (localStorage), My preferences → Recommended for you.
   Data: data/visitorlando_events.js (window.VO_EVENTS_DATA; .js mirror so file:// works). Never invents events. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const D = (iso) => new Date(iso + "T12:00:00");
  const fMD = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fMDY = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const addDays = (iso, n) => { const d = D(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  /* today in Orlando (America/New_York), as YYYY-MM-DD */
  const todayISO = (() => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  })();
  const SAVED_KEY = "ambar.events.saved.v1";
  const PREFS_KEY = "ambar.events.prefs.v1";
  const store = {
    get(k, dflt) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const VO = window.VO_EVENTS_DATA;
  const grid = $("#evGrid");
  if (!VO || !Array.isArray(VO.events) || !VO.events.length) {
    if (grid) grid.innerHTML = `<p class="vo-empty">Visit Orlando events are not loaded yet. Refresh with <code>scripts/fetch_visitorlando_events.py</code>, or browse the <a href="https://www.visitorlando.com/events/" target="_blank" rel="noopener">Visit Orlando calendar</a>.</p>`;
    return;
  }

  /* ---------- normalise ---------- */
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const areaOf = (e) => { const c = String(e.city || "").replace(/,\s*FL$/i, "").trim(); return c ? (c === c.toUpperCase() ? titleCase(c) : c) : "Other"; };
  const EVENTS = VO.events
    .filter((e) => e && e.id && e.title && e.url)
    .map((e) => ({ ...e, area: areaOf(e), categories: e.categories || [], runDays: Math.round((D(e.end_date) - D(e.start_date)) / 864e5) + 1 }));
  const byId = new Map(EVENTS.map((e) => [String(e.id), e]));
  const countBy = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  const CATS = [...countBy(EVENTS.flatMap((e) => e.categories)).entries()].sort((a, b) => b[1] - a[1]);
  const AREAS = [...countBy(EVENTS.map((e) => e.area)).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const calUrl = VO.calendar_url || "https://www.visitorlando.com/events/";
  const fetched = VO.fetched_at ? VO.fetched_at.slice(0, 10) : null;
  const windowStart = VO.window_start, windowEnd = VO.window_end;
  const defaultFrom = todayISO > windowStart && todayISO <= windowEnd ? todayISO : windowStart;

  const overlaps = (e, from, to) => (!to || e.start_date <= to) && (!from || e.end_date >= from);
  const fmtRange = (e) => (e.start_date === e.end_date ? fMD(e.start_date) : `${e.start_date.slice(0, 4) !== e.end_date.slice(0, 4) ? fMDY(e.start_date) : fMD(e.start_date)} – ${fMD(e.end_date)}`);
  const runLabel = (e) => (e.runDays > 31 ? "Ongoing" : e.runDays > 1 ? `${e.runDays}-day run` : "One day");

  /* ---------- header stats + attribution ---------- */
  const upcoming = EVENTS.filter((e) => e.end_date >= defaultFrom).length;
  $("#evStats").innerHTML = [
    ["Events listed", EVENTS.length, "from Visit Orlando"],
    ["Still to come", upcoming, `from ${fMD(defaultFrom)}`],
    ["Calendar window", `${fMD(windowStart)} – ${fMD(windowEnd)}`, windowEnd.slice(0, 4)],
    ["Categories", CATS.length, `${AREAS.length} areas`],
  ].map(([a, b, c]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}<small>${esc(c)}</small></dd></div>`).join("");
  const srcLine = `Source: <a href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando events calendar</a>${fetched ? ` · fetched ${esc(fMDY(fetched))}` : ""}. Listings are attributed to Visit Orlando and each card links to its official page; this site does not invent events.`;
  $("#evSourceNote").innerHTML = srcLine;
  $("#evAttrib").innerHTML = srcLine;
  $("#evFooterNote").textContent = `Window ${fMDY(windowStart)} – ${fMDY(windowEnd)}${fetched ? ` · fetched ${fMDY(fetched)}` : ""} · ${EVENTS.length} listings.`;
  if (fetched) $("#evUpdatePill").textContent = `Visit Orlando · ${fMD(fetched)}`;

  /* ---------- saved ---------- */
  let saved = store.get(SAVED_KEY, []);
  if (!Array.isArray(saved)) saved = [];
  saved = saved.filter((s) => s && s.id);
  const isSaved = (id) => saved.some((s) => String(s.id) === String(id));
  function toggleSaved(id) {
    id = String(id);
    if (isSaved(id)) saved = saved.filter((s) => String(s.id) !== id);
    else {
      const e = byId.get(id); if (!e) return;
      /* snapshot so the Saved view still shows something if the event later drops out of the data */
      saved.push({ id, title: e.title, url: e.url, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.area, saved_at: new Date().toISOString() });
    }
    store.set(SAVED_KEY, saved);
    syncSaved();
  }
  function syncSaved() {
    $("#savedCount").textContent = String(saved.length);
    $$("[data-save]").forEach((b) => {
      const on = isSaved(b.dataset.save);
      b.setAttribute("aria-pressed", String(on));
      b.querySelector(".ev-save-l").textContent = on ? "Saved" : "Save";
      b.setAttribute("aria-label", `${on ? "Remove from saved" : "Save"}: ${b.dataset.title}`);
    });
    if (!$("#panel-saved").hidden) paintSaved();
  }

  /* ---------- card ---------- */
  function card(e, extra = "") {
    const loc = [e.location, e.area].filter(Boolean).join(" · ");
    const tags = e.categories.slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join("");
    const on = isSaved(e.id);
    return `<article class="ev-card" data-id="${esc(e.id)}">
      <div class="ev-card-top"><span class="vo-date">${esc(fmtRange(e))}</span><span class="ev-run">${esc(runLabel(e))}</span></div>
      <h3 class="vo-title">${esc(e.title)}</h3>
      ${loc ? `<p class="vo-loc">${esc(loc)}</p>` : ""}
      ${extra}
      ${e.description ? `<p class="vo-desc">${esc(e.description)}</p>` : ""}
      <div class="vo-tags">${tags}</div>
      <div class="ev-card-foot">
        <a class="ev-src" href="${esc(e.url)}" target="_blank" rel="noopener">Source: Visit Orlando listing<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a>
        <button type="button" class="ev-save" data-save="${esc(e.id)}" data-title="${esc(e.title)}" aria-pressed="${on}" aria-label="${on ? "Remove from saved" : "Save"}: ${esc(e.title)}"><span class="ev-save-i" aria-hidden="true"></span><span class="ev-save-l">${on ? "Saved" : "Save"}</span></button>
      </div>
    </article>`;
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-save]");
    if (b) { toggleSaved(b.dataset.save); return; }
    const r = ev.target.closest("[data-unsave]");
    if (r) { saved = saved.filter((s) => String(s.id) !== r.dataset.unsave); store.set(SAVED_KEY, saved); syncSaved(); paintSaved(); }
  });

  /* ---------- browse + filters ---------- */
  const params = new URLSearchParams(location.search);
  const F = { q: params.get("q") || "", cat: "all", area: "all", from: defaultFrom, to: "", sort: "soon", limit: 24 };
  if (params.get("cat") && CATS.some(([c]) => c === params.get("cat"))) F.cat = params.get("cat");
  if (params.get("area") && AREAS.some(([a]) => a === params.get("area"))) F.area = params.get("area");
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "")) F.from = params.get("from");
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get("to") || "")) F.to = params.get("to");
  $("#evCat").insertAdjacentHTML("beforeend", CATS.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join(""));
  $("#evArea").insertAdjacentHTML("beforeend", AREAS.map(([a, n]) => `<option value="${esc(a)}">${esc(a)} (${n})</option>`).join(""));
  for (const id of ["evFrom", "evTo"]) { $("#" + id).min = windowStart; $("#" + id).max = windowEnd; }

  /* quick date chips: from today, this weekend, week buckets (Mon–Sun), whole window */
  const QUICK = [{ k: "upcoming", label: `From today (${fMD(defaultFrom)})`, from: defaultFrom, to: "" }];
  {
    const dow = D(defaultFrom).getDay(); // 0 Sun..6 Sat
    const fri = dow === 0 ? addDays(defaultFrom, -2) : addDays(defaultFrom, (5 - dow + 7) % 7);
    const sat = addDays(fri, 1), sun = addDays(fri, 2);
    const wkFrom = dow === 6 || dow === 0 ? defaultFrom : fri;
    if (sun <= windowEnd) QUICK.push({ k: "weekend", label: `This weekend (${fMD(wkFrom)}–${fMD(sun)})`, from: wkFrom, to: sun });
    let mon = addDays(defaultFrom, -((dow + 6) % 7));
    while (mon <= windowEnd) {
      const end = addDays(mon, 6);
      if (end >= defaultFrom) QUICK.push({ k: "w" + mon, label: `${fMD(mon)} – ${fMD(end)}`, from: mon < defaultFrom ? defaultFrom : mon, to: end });
      mon = addDays(mon, 7);
    }
    QUICK.push({ k: "all", label: "Whole window", from: "", to: "" });
  }
  function paintQuick() {
    const on = (QUICK.find((q) => F.from === q.from && F.to === q.to) || {}).k; /* only one chip pressed even if two ranges coincide */
    $("#evQuick").innerHTML = QUICK.map((q) => `<button type="button" class="chip" data-quick="${q.k}" aria-pressed="${q.k === on}">${esc(q.label)}</button>`).join("");
  }
  $("#evQuick").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-quick]"); if (!b) return;
    const q = QUICK.find((x) => x.k === b.dataset.quick); F.from = q.from; F.to = q.to; F.limit = 24; syncInputs(); paint();
    $(`[data-quick="${q.k}"]`)?.focus();
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
    const range = F.from || F.to ? ` · ${F.from ? fMD(F.from) : fMD(windowStart)} – ${F.to ? fMD(F.to) : fMD(windowEnd)}` : " · whole window";
    $("#evMeta").textContent = `${list.length} event${list.length === 1 ? "" : "s"} in view${range}${F.cat !== "all" ? ` · ${F.cat}` : ""}${F.area !== "all" ? ` · ${F.area}` : ""}${F.q ? ` · “${F.q}”` : ""}`;
    grid.innerHTML = show.map((e) => card(e)).join("") || `<p class="vo-empty">No Visit Orlando events match these filters. <button type="button" class="ev-link-btn" data-reset>Reset filters</button></p>`;
    if (list.length > F.limit) grid.insertAdjacentHTML("beforeend", `<div class="vo-more"><button type="button" id="evMore">Show more (${list.length - F.limit} remaining)</button></div>`);
  }
  grid.addEventListener("click", (ev) => {
    if (ev.target.id === "evMore") { const n = F.limit; F.limit += 24; paint(); grid.querySelectorAll(".ev-card")[n]?.querySelector(".ev-src")?.focus(); }
    if (ev.target.closest("[data-reset]")) reset();
  });
  let qTimer;
  $("#evQ").addEventListener("input", (ev) => { clearTimeout(qTimer); qTimer = setTimeout(() => { F.q = ev.target.value.trim(); F.limit = 24; paint(); }, 150); });
  $("#evCat").addEventListener("change", (ev) => { F.cat = ev.target.value; F.limit = 24; paint(); });
  $("#evArea").addEventListener("change", (ev) => { F.area = ev.target.value; F.limit = 24; paint(); });
  $("#evFrom").addEventListener("change", (ev) => { F.from = ev.target.value; F.limit = 24; paint(); });
  $("#evTo").addEventListener("change", (ev) => { F.to = ev.target.value; F.limit = 24; paint(); });
  $("#evSort").addEventListener("change", (ev) => { F.sort = ev.target.value; paint(); });
  function reset() { Object.assign(F, { q: "", cat: "all", area: "all", from: defaultFrom, to: "", sort: "soon", limit: 24 }); syncInputs(); paint(); }
  $("#evReset").addEventListener("click", reset);

  /* ---------- Saved view ---------- */
  function paintSaved() {
    const sg = $("#savedGrid");
    if (!saved.length) {
      $("#savedMeta").textContent = "No saved events yet.";
      sg.innerHTML = `<p class="vo-empty">Use <b>Save</b> on any event card and it will appear here. Saved events stay in this browser only.</p>`;
      return;
    }
    const live = [], gone = [];
    saved.forEach((s) => (byId.has(String(s.id)) ? live : gone).push(s));
    live.sort((a, b) => byId.get(String(a.id)).end_date.localeCompare(byId.get(String(b.id)).end_date));
    const past = live.filter((s) => byId.get(String(s.id)).end_date < todayISO).length;
    $("#savedMeta").textContent = `${saved.length} saved${gone.length ? ` · ${gone.length} no longer in the current Visit Orlando listings` : ""}${past ? ` · ${past} already ended` : ""}`;
    const goneCard = (s) => `<article class="ev-card ev-card-gone" data-id="${esc(s.id)}">
      <div class="ev-card-top"><span class="vo-date">${s.start_date ? esc(s.start_date === s.end_date ? fMD(s.start_date) : `${fMD(s.start_date)} – ${fMD(s.end_date)}`) : "Date unknown"}</span><span class="ev-run ev-run-gone">No longer listed</span></div>
      <h3 class="vo-title">${esc(s.title || "Saved event")}</h3>
      ${s.location || s.area ? `<p class="vo-loc">${esc([s.location, s.area].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="vo-desc">This event isn’t in the current Visit Orlando data (it may have ended or been removed). Check the original listing, or remove it.</p>
      <div class="ev-card-foot">
        ${/^https:\/\/www\.visitorlando\.com\//.test(s.url || "") ? `<a class="ev-src" href="${esc(s.url)}" target="_blank" rel="noopener">Source: Visit Orlando listing<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a>` : `<a class="ev-src" href="${esc(calUrl)}" target="_blank" rel="noopener">Visit Orlando calendar<span aria-hidden="true"> ↗</span></a>`}
        <button type="button" class="ev-save" data-unsave="${esc(s.id)}" aria-label="Remove from saved: ${esc(s.title || "event")}">Remove</button>
      </div>
    </article>`;
    sg.innerHTML = live.map((s) => card(byId.get(String(s.id)), byId.get(String(s.id)).end_date < todayISO ? `<p class="ev-flag">Ended ${esc(fMD(byId.get(String(s.id)).end_date))}</p>` : "")).join("") + gone.map(goneCard).join("");
  }

  /* ---------- preferences + Recommended for you ---------- */
  const TOP_AREAS = AREAS.slice(0, 10).map(([a]) => a);
  $("#pfCats").innerHTML = CATS.map(([c]) => `<label><input type="checkbox" name="cats" value="${esc(c)}"> ${esc(c)}</label>`).join("");
  $("#pfAreas").innerHTML = TOP_AREAS.map((a) => `<label><input type="checkbox" name="areas" value="${esc(a)}"> ${esc(a)}</label>`).join("");
  for (const id of ["pfFrom", "pfTo"]) { $("#" + id).min = windowStart; $("#" + id).max = windowEnd; }
  const FAMILY_RE = /\b(kids?|family|families|children|child|all ages|toddlers?)\b/i;
  const ACCESS_RE = /\b(accessib\w*|sensory|asl|wheelchair|access for all|neurodivers\w*)\b/i;
  let prefs = store.get(PREFS_KEY, null);
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
    prefs = p; store.set(PREFS_KEY, prefs);
    $("#pfStatus").textContent = "Saved. Your recommendations are at the top of All events.";
    paintReco();
    selectTab("browse", true);
    $("#evReco").scrollIntoView({ block: "start" });
  });
  function clearPrefs() {
    prefs = null; store.del(PREFS_KEY); fillForm(null); paintReco();
    $("#pfStatus").textContent = "Preferences cleared.";
  }
  $("#pfClear").addEventListener("click", clearPrefs);

  /* ---------- tabs (WAI-ARIA tabs, automatic activation) ---------- */
  const TABS = ["browse", "saved", "prefs"];
  function selectTab(name, focusTab) {
    TABS.forEach((t) => {
      const on = t === name, tab = $("#tab-" + t);
      tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1;
      $("#panel-" + t).hidden = !on;
      if (on && focusTab) tab.focus();
    });
    if (name === "saved") paintSaved();
    const hash = name === "browse" ? "" : name === "prefs" ? "#preferences" : "#saved";
    if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  }
  $("#evTabs").addEventListener("click", (ev) => { const t = ev.target.closest('[role="tab"]'); if (t) selectTab(t.id.slice(4)); });
  $("#evTabs").addEventListener("keydown", (ev) => {
    const i = TABS.indexOf(document.activeElement.id.slice(4)); if (i < 0) return;
    const k = ev.key; let n = null;
    if (k === "ArrowRight") n = (i + 1) % TABS.length; else if (k === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length; else if (k === "Home") n = 0; else if (k === "End") n = TABS.length - 1;
    if (n !== null) { ev.preventDefault(); selectTab(TABS[n], true); }
  });
  document.addEventListener("click", (ev) => { const g = ev.target.closest("[data-goto]"); if (g) { selectTab(g.dataset.goto, true); $("#events").scrollIntoView({ block: "start" }); } });
  function fromHash() { const h = location.hash.replace("#", ""); selectTab(h === "saved" ? "saved" : h === "preferences" ? "prefs" : "browse"); }
  window.addEventListener("hashchange", fromHash);

  /* boot */
  fillForm(prefs);
  syncInputs();
  paint();
  paintReco();
  syncSaved();
  fromHash();
  if (location.hash === "#saved" || location.hash === "#preferences") $("#events").scrollIntoView({ block: "start" });
  /* expose a read-only view for the assistant widget */
  window.AMBAR_EVENTS = { events: EVENTS, today: todayISO, defaultFrom, windowStart, windowEnd, calendarUrl: calUrl };
})();
