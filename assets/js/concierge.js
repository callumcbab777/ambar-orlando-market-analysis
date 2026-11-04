/* AMBAR Orlando · My Preferences + Travel Concierge (My Profile page).
   - My Preferences: trip details (party, pace, interests, budget feel, dates, home airport, accessibility),
     saved in this browser as you type (AMBAR_PROFILE.setTrip). Nothing is sent anywhere.
   - Travel Concierge: builds a day-by-day itinerary from this site's own content (assets/js/itinerary.js):
     Visit Orlando listings in your dates, the comp-set hotels, the visit page and the Google Flights link for your
     home airport (assets/js/flights.js). The AMBAR visit links only to the Calendly booking page.
   - Edit in place (add, remove, reorder, edit), share as a link (?p=t…~i…, the plan is compressed into the URL)
     or as a PDF (the site's jsPDF exporter).
   - Optional AI: if AMBAR_ASSISTANT_CONFIG.proxyUrl is set, Isla (through assistant-proxy, key server-side) adds a
     short welcome note. If the proxy is not set or doesn't answer, the plan is exactly the same, with no message. */
(function () {
  "use strict";
  const P = window.AMBAR_PROFILE, S = window.AMBAR_PROFILE_SHARE, I = window.AMBAR_ITIN, F = window.AMBAR_FLIGHTS;
  if (!P || !S || !I || !F || !document.getElementById("tpForm")) return;
  const me = document.currentScript;
  const ROOT = (me && me.dataset.root) || "../";
  const KEY = "ambar.itinerary.v1";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = F.localToday();
  const form = $("tpForm");
  let D = null, itin = null, shared = false, editing = null; /* editing: {d, i} or {d, add:true} */

  /* ---------------- My Preferences form ---------------- */
  const homeSel = $("tpHome");
  (function fillAirports() {
    const groups = { MCO: [], SFB: [], MLB: [] }, seen = new Set();
    for (const k of Object.keys(F.ROUTES)) {
      const [o, d] = k.split("-");
      if (o === "ANY" || seen.has(o)) continue;
      seen.add(o); groups[d].push([o, F.ROUTES[k].name]);
    }
    const label = { MCO: "Nonstop to Orlando International (MCO)", SFB: "Nonstop to Orlando Sanford (SFB)", MLB: "Nonstop to Melbourne Orlando (MLB)" };
    let html = "";
    for (const d of ["MCO", "SFB", "MLB"]) html += `<optgroup label="${label[d]}">${groups[d].sort((a, b) => a[1].localeCompare(b[1])).map(([o, n]) => `<option value="${o}">${esc(n)} (${o})</option>`).join("")}</optgroup>`;
    homeSel.insertAdjacentHTML("beforeend", html + `<option value="__other">Another airport…</option>`);
  })();
  const listed = (code) => !!homeSel.querySelector(`option[value="${code}"]`);

  function ageFields(n, ages) {
    const box = $("tpAges");
    const cur = [...box.querySelectorAll("select")].map((s) => s.value);
    box.innerHTML = Array.from({ length: n }, (_, i) => {
      const v = ages ? ages[i] : cur[i];
      return `<label class="tp-num">Kid ${i + 1} age <select name="kid_age" aria-label="Age of kid ${i + 1}"><option value="">–</option>${Array.from({ length: 18 }, (_, a) => `<option value="${a}"${String(v) === String(a) ? " selected" : ""}>${a}</option>`).join("")}</select></label>`;
    }).join("");
  }
  function fill(t) {
    t = t || { adults: 2, kids: 0, kid_ages: [], pace: "", interests: [], budget: "", from: "", nights: 0, home: "", access: [], access_note: "" };
    form.adults.value = t.adults; form.kids.value = t.kids;
    ageFields(t.kids, t.kid_ages);
    for (const el of form.querySelectorAll('input[name="pace"],input[name="budget"]')) el.checked = t[el.name] === el.value;
    for (const el of form.querySelectorAll('input[name="interests"],input[name="access"]')) el.checked = t[el.name].includes(el.value);
    form.from.value = t.from; form.nights.value = t.nights || "";
    if (!t.home) { homeSel.value = ""; form.home_other.value = ""; }
    else if (listed(t.home)) { homeSel.value = t.home; form.home_other.value = ""; }
    else { homeSel.value = "__other"; form.home_other.value = t.home; }
    $("tpOtherWrap").hidden = homeSel.value !== "__other";
    form.access_note.value = t.access_note || "";
  }
  function read() {
    const all = (n) => [...form.querySelectorAll(`input[name="${n}"]:checked`)].map((e) => e.value);
    const kids = Math.max(0, Math.min(10, parseInt(form.kids.value, 10) || 0));
    return {
      adults: form.adults.value, kids, kid_ages: [...form.querySelectorAll('select[name="kid_age"]')].map((s) => s.value).filter((v) => v !== ""),
      pace: all("pace")[0] || "", interests: all("interests"), budget: all("budget")[0] || "",
      from: form.from.value, nights: form.nights.value,
      home: homeSel.value === "__other" ? form.home_other.value.trim() : homeSel.value,
      access: all("access"), access_note: form.access_note.value,
    };
  }
  let writing = false, tm = 0;
  function save() {
    const raw = read();
    const t = P.cleanTrip(raw);
    writing = true; t ? P.setTrip(t) : P.clearTrip(); writing = false;
    const bad = homeSel.value === "__other" && raw.home && !/^[A-Za-z]{3}$/.test(raw.home);
    $("tpStatus").textContent = bad ? "Airport codes are three letters, like BOS." : "Saved in this browser.";
  }
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("input", (e) => {
    if (e.target.name === "kids") ageFields(Math.max(0, Math.min(10, parseInt(form.kids.value, 10) || 0)));
    if (e.target === homeSel) $("tpOtherWrap").hidden = homeSel.value !== "__other";
    clearTimeout(tm); tm = setTimeout(save, e.target.type === "text" || e.target.type === "number" ? 400 : 0);
  });
  form.addEventListener("change", () => { clearTimeout(tm); save(); });
  fill(P.get().trip);
  P.subscribe((p) => { if (!writing && !form.contains(document.activeElement)) fill(p.trip); });

  /* ---------------- itinerary storage ---------------- */
  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); return o ? I.expand(o) : null; } catch (e) { return null; } }
  function store() { if (shared || !itin) return; try { localStorage.setItem(KEY, JSON.stringify(I.compact(itin))); } catch (e) { /* storage full or blocked: the plan still works on the page */ } }

  /* ---------------- render ---------------- */
  const KIND = { f: "Flight", h: "Hotel", e: "Event", a: "AMBAR visit", v: "Plan your visit", d: "Drive", c: "Your plan" };
  const ctx = () => ({ root: ROOT, events: D.ev, hotels: D.hotels, flights: F, start: itin.start, end: I.addDays(itin.start, itin.days.length - 1) });
  const ext = (u) => /^https?:/.test(u);
  function itemHtml(x, d, i, n) {
    const u = I.linkFor(x, ctx());
    const isEd = editing && editing.d === d && editing.i === i;
    if (isEd) return `<li class="tc-item is-editing">${editorHtml(x, d, i)}</li>`;
    const label = x.k === "a" ? `${esc(x.title)}<span class="tc-cta-inline">Book a time on Calendly</span>` : esc(x.title);
    const title = u ? `<a href="${esc(u)}"${ext(u) ? ' target="_blank" rel="noopener"' : ""}>${label}${ext(u) ? '<span class="sr-only"> (opens in a new tab)</span>' : ""}</a>` : label;
    const who = esc(x.title);
    return `<li class="tc-item tc-k-${x.k}" data-d="${d}" data-i="${i}">
      <p class="tc-when"><span class="tc-time">${esc(I.TIME_LABEL[x.time])}</span><span class="tc-kind">${KIND[x.k]}</span></p>
      <h4 class="tc-title">${title}</h4>
      ${x.note ? `<p class="tc-note">${esc(x.note)}</p>` : ""}
      <div class="tc-acts" role="group" aria-label="Change ${who}">
        <button type="button" class="tc-btn" data-act="edit" aria-label="Edit ${who}">Edit</button>
        <button type="button" class="tc-btn" data-act="up" aria-label="Move ${who} earlier"${d === 0 && i === 0 ? " disabled" : ""}>↑<span class="sr-only"> earlier</span></button>
        <button type="button" class="tc-btn" data-act="down" aria-label="Move ${who} later"${d === itin.days.length - 1 && i === n - 1 ? " disabled" : ""}>↓<span class="sr-only"> later</span></button>
        ${x.k === "a" ? "" : `<button type="button" class="tc-btn tc-rm" data-act="rm" aria-label="Remove ${who}">Remove</button>`}
      </div>
    </li>`;
  }
  function editorHtml(x, d, i) {
    const id = `tcEd${d}-${i ?? "n"}`;
    const lockTitle = x && x.k === "a";
    return `<form class="tc-edit" data-d="${d}" ${i == null ? 'data-add="1"' : `data-i="${i}"`} aria-label="${i == null ? `Add to day ${d + 1}` : `Edit ${esc(x.title)}`}">
      <label for="${id}t">What</label><input id="${id}t" name="title" maxlength="${I.MAX.title}" required value="${esc(x ? x.title : "")}"${lockTitle ? " readonly" : ""} autocomplete="off">
      <label for="${id}w">When</label><select id="${id}w" name="time">${I.TIMES.map((t) => `<option value="${t}"${x && x.time === t ? " selected" : ""}>${I.TIME_LABEL[t]}</option>`).join("")}</select>
      <label for="${id}n">Note</label><textarea id="${id}n" name="note" maxlength="${I.MAX.note}" rows="2">${esc(x ? x.note : "")}</textarea>
      <p class="tc-edit-acts"><button type="submit" class="btn btn-solid">${i == null ? "Add" : "Save"}</button> <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button></p>
    </form>`;
  }
  function partyText(t) {
    if (!t) return "";
    return `${t.adults} adult${t.adults === 1 ? "" : "s"}${t.kids ? ` + ${t.kids} kid${t.kids === 1 ? "" : "s"}` : ""}`;
  }
  function render(focusSel) {
    const sec = $("concierge");
    sec.hidden = false;
    const n = itin.days.length;
    const end = I.addDays(itin.start, n - 1);
    const trip = P.get().trip;
    $("tcSub").textContent = `${I.dayLabel(itin.start)} – ${I.dayLabel(end)} · ${n} day${n === 1 ? "" : "s"}${!shared && trip ? ` · ${partyText(trip)}` : ""}. Built from this site: Visit Orlando listings, the comp-set hotels and the visit guide. Edit anything; it saves as you go.`;
    $("tcAi").hidden = !(itin.ai && itin.note);
    $("tcAi").innerHTML = itin.ai && itin.note ? `<b>A note from Isla</b> <span></span>` : "";
    if (itin.ai && itin.note) $("tcAi").querySelector("span").textContent = itin.note;
    $("tcDays").innerHTML = itin.days.map((day, d) => `
      <section class="tc-day" aria-labelledby="tcDay${d}">
        <header class="tc-day-head"><h3 id="tcDay${d}" tabindex="-1"><span>Day ${d + 1}</span> ${esc(I.dayLabel(I.addDays(itin.start, d)))}</h3>
          ${n > 1 ? `<button type="button" class="ev-link-btn tc-rmday" data-rmday="${d}" aria-label="Remove day ${d + 1}">Remove day</button>` : ""}</header>
        ${day.items.length ? `<ol class="tc-items">${day.items.map((x, i) => itemHtml(x, d, i, day.items.length)).join("")}</ol>` : `<p class="tc-empty">Nothing planned yet. A free day is a fine thing in Orlando.</p>`}
        ${editing && editing.d === d && editing.add ? editorHtml(null, d, null) : day.items.length < I.MAX.items ? `<p class="tc-add"><button type="button" class="btn-more" data-add="${d}" aria-label="Add to day ${d + 1}">+ Add to day ${d + 1}</button></p>` : ""}
      </section>`).join("");
    $("tcAddDay").disabled = n >= I.MAX.days;
    $("tcRegen").hidden = shared;
    $("tcShared").hidden = !shared;
    const vo = window.VO_EVENTS_DATA || {};
    $("tcSources").innerHTML = `Events from the Visit Orlando calendar (captured ${esc(vo.fetched_at ? String(vo.fetched_at).slice(0, 10) : "recently")}); check each listing before you go. Hotels are from the comp set on the <a href="${ROOT}index.html#hotels">market page</a>. Flights open Google Flights for your dates; no fares are shown. The AMBAR visit is in person at the sales center, booked on <a href="${I.CALENDLY}" target="_blank" rel="noopener">Calendly<span class="sr-only"> (opens in a new tab)</span></a>.`;
    if (focusSel) { const el = $("tcDays").querySelector(focusSel) || $("tcTitle"); el && el.focus(); }
  }
  function setItin(next, msg, focusSel) { itin = next; store(); render(focusSel); if (msg) $("tcStatus").textContent = msg; }

  /* ---------------- editing ---------------- */
  $("tcDays").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.add != null) { editing = { d: +b.dataset.add, add: true }; render(`form[data-add] input[name="title"]`); return; }
    if (b.dataset.rmday != null) {
      const d = +b.dataset.rmday;
      if (itin.days[d].items.some((x) => x.k !== "a") && !window.confirm(`Remove day ${d + 1} and its plans?`)) return;
      editing = null; setItin(I.removeDay(itin, d), `Day ${d + 1} removed.`, `#tcDay${Math.max(0, d - 1)}`); return;
    }
    if (b.dataset.act === "cancel") { const f = b.closest("form"); const d = +f.dataset.d, i = f.dataset.i; editing = null; render(i != null ? `li[data-d="${d}"][data-i="${i}"] [data-act="edit"]` : `[data-add="${d}"]`); return; }
    const li = b.closest("li[data-d]"); if (!li) return;
    const d = +li.dataset.d, i = +li.dataset.i, x = itin.days[d].items[i];
    if (b.dataset.act === "edit") { editing = { d, i }; render(`form[data-i="${i}"][data-d="${d}"] ${x.k === "a" ? "select" : "input"}`); }
    else if (b.dataset.act === "rm") {
      editing = null;
      const next = I.removeItem(itin, d, i);
      const left = next.days[d].items.length;
      setItin(next, `${x.title} removed.`, left ? `li[data-d="${d}"][data-i="${Math.min(i, left - 1)}"] [data-act="edit"]` : `#tcDay${d}`);
    } else if (b.dataset.act === "up" || b.dataset.act === "down") {
      editing = null;
      const r = I.moveItem(itin, d, i, b.dataset.act === "up" ? -1 : 1);
      setItin(r.it, `${x.title} moved to day ${r.day + 1}, position ${r.i + 1}.`, `li[data-d="${r.day}"][data-i="${r.i}"] [data-act="${b.dataset.act}"]:not([disabled]), li[data-d="${r.day}"][data-i="${r.i}"] [data-act="edit"]`);
    }
  });
  $("tcDays").addEventListener("submit", (e) => {
    const f = e.target.closest("form.tc-edit"); if (!f) return;
    e.preventDefault();
    const d = +f.dataset.d, title = f.title.value.trim();
    if (!title) { f.title.focus(); $("tcStatus").textContent = "Give it a name first."; return; }
    const patch = { title, time: f.time.value, note: f.note.value.trim() };
    editing = null;
    if (f.dataset.add) { const next = I.addItem(itin, d, { k: "c", ...patch }); setItin(next, `${title} added to day ${d + 1}.`, `li[data-d="${d}"][data-i="${next.days[d].items.length - 1}"] [data-act="edit"]`); }
    else { const i = +f.dataset.i; setItin(I.editItem(itin, d, i, patch), `${title} saved.`, `li[data-d="${d}"][data-i="${i}"] [data-act="edit"]`); }
  });
  $("tcDays").addEventListener("keydown", (e) => { if (e.key === "Escape" && editing) { const d = editing.d, i = editing.i; editing = null; render(i != null ? `li[data-d="${d}"][data-i="${i}"] [data-act="edit"]` : `[data-add="${d}"]`); } });
  $("tcAddDay").addEventListener("click", () => { editing = null; setItin(I.addDay(itin), `Day ${itin.days.length + 1} added.`, `#tcDay${itin.days.length}`); });

  /* ---------------- generate (+ optional AI note) ---------------- */
  function build() {
    const trip = P.get().trip || {};
    return I.generate({ trip, today, events: (window.VO_EVENTS_DATA || {}).events || [], db: D.db, favs: P.get().hotels, flights: F });
  }
  async function aiNote(it) {
    const url = String((window.AMBAR_ASSISTANT_CONFIG || {}).proxyUrl || "").trim();
    if (!/^https:\/\//.test(url)) return;
    const trip = P.get().trip || {};
    const evs = it.days.flatMap((d) => d.items).filter((x) => x.k === "e").map((x) => D.ev.get(x.ref)).filter(Boolean).slice(0, 12);
    const q = `Write a warm 2-sentence welcome note (under 60 words) for our ${it.days.length}-day Orlando trip from ${it.start}: ${partyText(trip) || "a small group"}${trip.interests && trip.interests.length ? `, into ${trip.interests.join(", ")}` : ""}. Mention one event from EVENTS by name. No prices, no links.`.slice(0, 500);
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ messages: [{ role: "user", content: q }], context: { page: "profile", today, calendar_url: "https://www.visitorlando.com/events/", events: evs.map((e) => ({ title: e.title, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.area || "", categories: e.categories || [], url: e.url })), knowledge_ids: [] } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j.reply !== "string" || !j.reply.trim() || itin !== it) return;
      const note = j.reply.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
      setItin(I.normalise({ ...it, note, ai: true }));
    } catch (e) { /* proxy unset, offline or slow: keep the rule-based plan, say nothing */ } finally { clearTimeout(t); }
  }
  function go(fresh) {
    if (!D) return;
    shared = false; editing = null;
    const saved = !fresh && load();
    const it = saved || build();
    setItin(it, saved ? "Here’s your saved itinerary. “Start again from my preferences” builds a fresh one." : "Isla’s proposal is ready. Edit anything below, then share it.", null);
    $("tcTitle").focus();
    $("concierge").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (!saved) aiNote(it);
  }
  $("tcGo").addEventListener("click", () => { if (shared && !window.confirm("Replace the shared plan on this page with a fresh one from your own preferences?")) return; go(shared); });
  $("tcRegen").addEventListener("click", () => { if (!load() || window.confirm("Replace this itinerary with a fresh one from your preferences?")) go(true); });
  $("tcKeep").addEventListener("click", () => {
    shared = false; store();
    $("tcStatus").textContent = "Saved to your profile in this browser. Your own trip preferences were kept.";
    render(); $("tcTitle").focus();
  });

  /* ---------------- share: link + PDF ---------------- */
  async function link() {
    const tok = await I.encode(itin);
    const trip = shared ? sharedTrip : P.get().trip;
    const u = P.shareUrl(S.profileBase(ROOT), P.normalise({ trip }), D.bIdx, tok);
    return u.length - u.indexOf("?") > P.LIMITS.link ? null : u + "#concierge";
  }
  $("tcCopy").addEventListener("click", async () => {
    const u = await link();
    if (!u) { $("tcStatus").textContent = "This plan is too long for one link. Remove a few items or notes, or use Download PDF."; return; }
    $("tcStatus").textContent = (await S.copyText(u)) ? "Itinerary link copied. Anyone who opens it can edit the plan and share it back." : `Copy this link: ${u}`;
  });
  if (navigator.share) {
    $("tcNative").hidden = false;
    $("tcNative").addEventListener("click", async () => {
      const u = await link();
      if (!u) { $("tcStatus").textContent = "This plan is too long for one link. Remove a few items or notes, or use Download PDF."; return; }
      try { await navigator.share({ title: "Our Orlando itinerary", text: "Here’s our Orlando plan. Open it to edit and share it back.", url: u }); $("tcStatus").textContent = "Shared."; }
      catch (e) { if (e && e.name !== "AbortError") $("tcStatus").textContent = "Sharing isn’t available here. Use Copy itinerary link instead."; }
    });
  }
  $("tcPdf").addEventListener("click", async () => {
    $("tcStatus").textContent = "Preparing your PDF…";
    try {
      const u = await link();
      const n = itin.days.length;
      const gen = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      await window.AMBAR_EV_PDF.download(ROOT, I.pdfSections(itin, { ...ctx(), root: new URL(ROOT, location.href).href }), {
        title: "Our Orlando itinerary",
        subtitle: `${I.dayLabel(itin.start)} – ${I.dayLabel(I.addDays(itin.start, n - 1))} · ${n} day${n === 1 ? "" : "s"}  ·  Generated ${gen}`,
        generated: gen, pageUrl: u || S.profileBase(ROOT),
        footnote: "Planned with the Travel Concierge on the AMBAR Orlando site. Events from Visit Orlando listings; check each before you go. No fares or rates are quoted. The AMBAR visit is in person, booked on Calendly.",
      }, `orlando-itinerary-${itin.start}.pdf`);
      $("tcStatus").textContent = "PDF downloaded.";
    } catch (e) { $("tcStatus").textContent = "The PDF couldn’t be made here. Try Copy itinerary link instead."; }
  });

  /* ---------------- start ---------------- */
  let sharedTrip = null;
  S.data(ROOT).then(async (d) => {
    D = d;
    const param = new URLSearchParams(location.search).get("p");
    if (param) {
      const r = P.decode(param, { events: new Set(D.ev.keys()), hotels: new Set(D.hotels.keys()), brands: D.bIdx });
      const it = r.itinerary ? await I.decode(r.itinerary) : null;
      if (it) {
        shared = true; sharedTrip = r.profile.trip; itin = it;
        render();
        $("tcStatus").textContent = "A shared itinerary is open. Your edits stay on this page until you share or save them.";
        if (location.hash === "#concierge") $("concierge").scrollIntoView({ block: "start" });
        return;
      }
    }
    const saved = load();
    if (saved) { itin = saved; render(); }
  });
  window.AMBAR_CONCIERGE = { go, get itinerary() { return itin; } };
})();
