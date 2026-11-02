/* AMBAR Orlando Market Landscape — all content is rendered from data/comps.json */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : v);
    }
    if (html) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => (v == null || !(Number(v) > 0) ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
  const D = (iso) => new Date(iso + "T12:00:00");
  const fmt = (iso, o) => D(iso).toLocaleDateString("en-US", o);
  const fDay = (iso) => fmt(iso, { weekday: "short" });
  const fMD = (iso) => fmt(iso, { month: "short", day: "numeric" });
  const fLong = (iso) => fmt(iso, { month: "long", day: "numeric", year: "numeric" });
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const todayISO = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); })();

  const COLORS = {
    "swan-reserve": "#B37D50", "jw-bonnet-creek": "#355965", "dolphin": "#6F97A3", "jw-grande-lakes": "#1E3A2C",
    "gaylord-palms": "#F36F43", "swan": "#D99A2B", "inn-celebration": "#989B74",
    "hyatt-grand-cypress": "#7A5C8E", "wyndham-grand-bonnet-creek": "#3F7F6B", "conrad-evermore": "#8C6A3F", "ette-orlando": "#A2505E"
  };

  /* ---------- load data (comps.json; comps.js mirror for file:// use) ---------- */
  function loadJson(path, globalName, scriptPath) {
    return fetch(path, { cache: "no-cache" }).then((r) => { if (!r.ok) throw 0; return r.json(); })
      .catch(() => new Promise((res, rej) => {
        if (window[globalName]) return res(window[globalName]);
        const s = el("script", { src: scriptPath });
        s.onload = () => res(window[globalName]); s.onerror = rej; document.body.appendChild(s);
      }));
  }
  function load() {
    return Promise.all([
      loadJson("data/comps.json", "COMPS_DATA", "data/comps.js"),
    ]).then(([comps]) => ({ comps }));
  }


  let DB, H, hotelById, weeks, collected, latest, tip;

    function init(payload) {
    const db = payload.comps || payload;
    DB = db; H = db.hotels; weeks = db.weeks; collected = weeks.filter((w) => w.status === "collected"); latest = collected[collected.length - 1];
    hotelById = Object.fromEntries(H.map((h) => [h.id, h]));
    tip = $("#tip");
    renderHero(); renderWeekAhead(); renderMatrix(); renderHotels(); renderDemand(); renderNews(); renderFooter(); navSpy(); bindReveal();
  }

  const ratesFor = (week) => DB.rates.filter((r) => r.week === week);
  const priced = (rs) => rs.filter((r) => r && r.status === "OK" && Number(r.rate) > 0).map((r) => r.rate);
  const weekDates = (w) => Array.from({ length: 7 }, (_, i) => { const d = D(w.week); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const sourcesOf = (rs) => [...new Set(rs.map((r) => r.source))];

  /* ---------- tooltip ---------- */
  function showTip(html, target) {
    tip.innerHTML = html; tip.hidden = false;
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 10;
    if (y < 76) y = r.bottom + 10;
    x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  addEventListener("scroll", hideTip, { passive: true });

  /* ---------- 1 hero ---------- */
  function renderHero() {
    const okRates = priced(DB.rates);
    const all = okRates.length;
    const medAll = median(okRates);
    const gaps = weeks.filter((w) => w.status === "missing");
    const stats = [
      ["Hotels tracked", H.length, `${H.filter((h) => !h.non_marriott).length} Marriott · ${H.filter((h) => h.non_marriott).length} non-Marriott`],
      ["Weeks tracked", collected.length, `of ${weeks.length} in window`],
      ["Priced nights", all, "lowest public rates"],
      ["Median $", money(medAll), "across all nights tracked"],
      ["Latest snapshot", fMD(latest.generated), `week of ${fMD(latest.week)}`]
    ];
    $("#heroStats").innerHTML = stats.map(([a, b, c]) => `<div><dt>${a}</dt><dd>${b}<small>${c}</small></dd></div>`).join("");
    $("#heroNote").textContent = `Every figure is a lowest public nightly rate observed on a booking site on the snapshot date (not ADR, not occupancy). ` +
      (gaps.length ? `The week of ${gaps.map((g) => fMD(g.week)).join(", ")} was not collected and is shown as a gap.` : "");
    $("#updatePill").textContent = `Updated weekly · ${fMD(DB.meta.last_updated)}`;
  }

  /* ---------- colour scale (percentile of all observed rates, so outliers don't wash out the grid) ---------- */
  const STOPS = ["#F4EFE7", "#EAD9B2", "#FFC27A", "#FFA94A", "#F36F43", "#B4492A", "#6E2E1C"];
  let SORTED;
  function pct(v) {
    SORTED = SORTED || priced(DB.rates).sort((a, b) => a - b);
    let lo = 0, hi = SORTED.length; while (lo < hi) { const m = (lo + hi) >> 1; SORTED[m] < v ? (lo = m + 1) : (hi = m); }
    return SORTED.length > 1 ? lo / (SORTED.length - 1) : 0.5;
  }
  function mix(a, b, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
    const A = p(a), B = p(b); return "rgb(" + A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(",") + ")";
  }
  function heatColor(v) {
    const p = Math.min(1, Math.max(0, pct(v))) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(p));
    return { bg: mix(STOPS[i], STOPS[i + 1], p - i), fg: p > 3.9 ? "#fff" : "#1D1F1A" };
  }

  /* ---------- 2 week ahead ---------- */
  let selWeek;
  /* Condensed list: the grid shows the first WA_TOP hotels (data/comps.json order, the same order the
     grid has always used) and a 'See all hotels (N)' button expands it. JS adds the condensed class, so
     without it every row stays visible. N comes from the data, so a weekly regeneration just works.
     The Median row is never hidden, and the expanded/collapsed choice is kept across week switches. */
  const WA_TOP = 3;
  let waExpanded = false;
  function syncHeatToggle(show) {
    const btn = $("#heatToggle"), wrap = $("#heatWrap"); if (!btn) return;
    const can = show && H.length > WA_TOP;
    btn.parentElement.hidden = !can;
    wrap.classList.toggle("is-condensed", can && !waExpanded);
    btn.setAttribute("aria-expanded", String(can && waExpanded));
    btn.textContent = waExpanded ? "Show fewer" : `See all hotels (${H.length})`;
    const note = $("#heatCount"); if (note) note.textContent = can ? (waExpanded ? `Showing all ${H.length} hotels` : `Showing ${WA_TOP} of ${H.length} hotels`) : "";
  }
  function renderWeekAhead() {
    const tabs = $("#weekTabs");
    weeks.forEach((w) => {
      const b = el("button", { type: "button", role: "tab", class: "seg-btn" + (w.status === "missing" ? " is-gap" : ""), "aria-selected": "false", "data-week": w.week },
        `${fMD(w.week)} – ${fMD(w.week_end)}${w.status === "missing" ? " · not collected" : ""}`);
      b.addEventListener("click", () => selectWeek(w.week));
      tabs.appendChild(b);
    });
    const s = SORTED || priced(DB.rates).sort((a, b) => a - b);
    $("#heatLegend").innerHTML = `<span class="ramp">${money(s[0])}<span class="bar" style="background:linear-gradient(90deg,${STOPS.join(",")})"></span>${money(s[s.length - 1])}</span>
      <span class="sw"><i style="background:repeating-linear-gradient(135deg,#EEE7D9 0 3px,#E2D7C2 3px 6px);border:1px dashed #b8ab8d"></i>Unavailable (no public offer)</span>
      <span class="sw"><i style="background:#F1F1F1"></i>Not collected</span>`;
    const more = el("div", { class: "heat-more" }, `<span class="heat-count" id="heatCount"></span><button type="button" class="btn-more" id="heatToggle" aria-controls="heatWrap" aria-expanded="false"></button>`);
    $("#heatWrap").after(more);
    $("#heatToggle").addEventListener("click", () => {
      waExpanded = !waExpanded; syncHeatToggle(true);
      if (!waExpanded) $("#heatToggle").scrollIntoView({ block: "nearest" });
    });
    selectWeek(latest.week);
  }

  function selectWeek(wk) {
    selWeek = wk;
    document.querySelectorAll("#weekTabs .seg-btn").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.week === wk)));
    const selB = $(`#weekTabs [data-week="${wk}"]`), tb = $("#weekTabs"); if (selB && tb.scrollWidth > tb.clientWidth) tb.scrollLeft = selB.offsetLeft - tb.offsetLeft - 8;
    const w = weeks.find((x) => x.week === wk), wrap = $("#heatWrap");
    if (w.status === "missing") {
      $("#waSub").textContent = `${fLong(w.week)} – ${fLong(w.week_end)}`;
      wrap.innerHTML = `<div class="gap-panel"><h3>Week of ${fMD(w.week)}: not collected</h3><p>${esc(w.note)}</p><p>No figures are shown or estimated for this week.</p></div>`;
      $("#heatFoot").textContent = ""; syncHeatToggle(false); return;
    }
    const rs = ratesFor(wk), dates = weekDates(w), srcs = sourcesOf(rs);
    $("#waSub").innerHTML = `${wk === latest.week ? "Latest week" : "Week"} · ${fLong(w.week)} – ${fLong(w.week_end)}. Lowest public nightly rate observed, snapshot ${fLong(w.generated)} (${esc(srcs.join("; "))}).`;
    let html = `<table class="heat"><caption class="sr-only" style="position:absolute;left:-9999px">Lowest public nightly rates, week of ${fMD(wk)}</caption><thead><tr><th scope="col" class="row"><span>Hotel</span></th>`;
    dates.forEach((d) => { html += `<th scope="col" class="${d === todayISO ? "today" : ""}">${fDay(d)}<b>${fMD(d).split(" ")[1]}</b></th>`; });
    html += `<th scope="col" class="sumhead">Mean of<br>priced nights</th></tr></thead><tbody>`;
    H.forEach((h, i) => {
      html += `<tr${i >= WA_TOP ? ' class="wa-extra"' : ""} data-rank="${i + 1}"><th scope="row" class="row"><strong>${esc(h.short)}</strong><span>${esc(h.brand)} · ${h.tier}</span></th>`;
      const row = dates.map((d) => rs.find((r) => r.hotel === h.id && r.date === d));
      row.forEach((r, i) => {
        if (!r) { html += `<td class="cell nc" tabindex="0" data-tip="">n/a</td>`; return; }
        const t = encodeURIComponent(JSON.stringify({ h: h.short, d: dates[i], r: r.rate, s: r.status, src: r.source, sd: r.source_date, n: r.note }));
        const ok = r.status === "OK" && Number(r.rate) > 0;
        const lab = ok ? money(r.rate) : r.status === "UNAVAILABLE" ? "unavailable" : "not collected";
        if (ok) {
          const c = heatColor(r.rate);
          html += `<td class="cell" tabindex="0" style="background:${c.bg};color:${c.fg}" data-tip="${t}" aria-label="${esc(h.short)}, ${fDay(dates[i])} ${fMD(dates[i])}: ${lab}">${money(r.rate)}${r.note ? "<sup>*</sup>" : ""}</td>`;
        } else if (r.status === "UNAVAILABLE") {
          html += `<td class="cell unav" tabindex="0" data-tip="${t}" aria-label="${esc(h.short)}, ${fMD(dates[i])}: unavailable, no public offer">Unavail.</td>`;
        } else {
          html += `<td class="cell nc" tabindex="0" data-tip="${t}" aria-label="${esc(h.short)}, ${fMD(dates[i])}: not collected">Not collected</td>`;
        }
      });
      const p = priced(row.filter(Boolean));
      html += `<td class="sum">${p.length ? `<b>${money(mean(p))}</b>${p.length}/7 nights priced` : "No prices"}</td></tr>`;
    });
    html += `<tr class="setrow"><th scope="row" class="row"><strong>Median</strong><span>across hotels with a price</span></th>`;
    dates.forEach((d) => { const p = priced(rs.filter((r) => r.date === d)); html += `<td class="cell" tabindex="0" aria-label="Median ${fMD(d)}: ${money(median(p))}" data-tip="${encodeURIComponent(JSON.stringify({ set: 1, d, r: median(p), k: p.length }))}">${money(median(p))}</td>`; });
    const unav = rs.filter((r) => r.status === "UNAVAILABLE").length;
    html += `<td class="sum">${unav ? `<b>${unav}</b>unavailable nights` : ""}</td></tr></tbody></table>`;
    wrap.innerHTML = html;
    syncHeatToggle(true);
    if (!$("#swipeHint")) wrap.before(el("p", { class: "swipe-hint", id: "swipeHint" }, "Swipe the grid sideways to see every night →"));
    wrap.querySelectorAll(".cell[data-tip]").forEach((c) => {
      const on = () => {
        if (!c.dataset.tip) return; const o = JSON.parse(decodeURIComponent(c.dataset.tip));
        if (o.set) return showTip(`<b>Median · ${fDay(o.d)} ${fMD(o.d)}</b><span class="t-rate">${o.k ? money(o.r) : "Not collected"}</span>${o.k ? `Median of ${o.k} hotels with a public price that night.` : "No hotels had a public price that night."}`, c);
        const head = `<b>${esc(o.h)} · ${fDay(o.d)} ${fMD(o.d)}</b>`;
        const body = o.s === "OK" && Number(o.r) > 0 ? `<span class="t-rate">${money(o.r)}</span>Lowest public nightly rate observed` :
          o.s === "UNAVAILABLE" ? `<span class="t-rate">Unavailable</span>` : `<span class="t-rate">Not collected</span>`;
        showTip(`${head}${body}<br><small>${esc(o.src)}, ${fMD(o.sd)}</small>${o.n ? `<br><small>${esc(o.n)}</small>` : ""}`, c);
      };
      c.addEventListener("mouseenter", on); c.addEventListener("focus", on);
      c.addEventListener("mouseleave", hideTip); c.addEventListener("blur", hideTip);
    });
    const notes = DB.hotel_notes.filter((n) => n.week === wk && n.rate_note);
    $("#heatFoot").innerHTML = `Unavailable = no offer returned for a one-night search: a scarcity signal, not a confirmed sell-out. * = note on that night (hover for detail). Taxes are generally excluded and resort fees may apply.` +
      (notes.length ? `<br><strong>Brief notes this week:</strong> ` + notes.map((n) => `${esc(hotelById[n.hotel].short)}: ${esc(n.rate_note)}`).join(" · ") : "");
  }

  /* ---------- shared 'See all' toggle (same pattern as the Week ahead grid), used by 05 Demand and 06 News ----------
     A native button with aria-expanded/aria-controls sits under the content. Items beyond the preview carry
     .more-extra and are hidden only while JS has put .is-condensed on their region, so without JS (or before
     render) everything shows. Counts come from the data each time a section repaints. */
  const MORE = [];
  function moreToggle({ id, regions, after, noun }) {
    const bar = el("div", { class: "heat-more more-bar", hidden: true }, `<span class="heat-count" id="${id}Count"></span><button type="button" class="btn-more" id="${id}" aria-controls="${regions.join(" ")}" aria-expanded="false"></button>`);
    after.after(bar);
    const btn = bar.querySelector("button"), count = bar.querySelector(".heat-count");
    const t = { expanded: false, preview: 0, total: 0, regions: regions.map((r) => document.getElementById(r)).filter(Boolean) };
    t.sync = (preview, total) => {
      if (preview != null) { t.preview = preview; t.total = total; }
      const can = t.total > t.preview;
      bar.hidden = !can;
      t.regions.forEach((r) => r.classList.toggle("is-condensed", can && !t.expanded));
      btn.setAttribute("aria-expanded", String(can && t.expanded));
      btn.textContent = t.expanded ? "Show fewer" : `See all ${noun} (${t.total})`;
      count.textContent = can ? (t.expanded ? `Showing all ${t.total} ${noun}` : `Showing ${t.preview} of ${t.total} ${noun}`) : "";
    };
    t.expand = () => { if (!t.expanded) { t.expanded = true; t.sync(); } };
    btn.addEventListener("click", () => { t.expanded = !t.expanded; t.sync(); if (!t.expanded) btn.scrollIntoView({ block: "nearest" }); });
    MORE.push(t);
    return t;
  }
  /* A nav jump, site-guide link or shared URL whose #target sits in a condensed list opens that list first,
     so the browser (or we) can scroll to it. t.resolve lets a section bring back an item hidden by its filter. */
  function reveal(hash) {
    if (!hash || hash.length < 2) return null;
    let id; try { id = decodeURIComponent(hash.slice(1)); } catch (e) { return null; }
    MORE.forEach((t) => t.resolve && !document.getElementById(id) && t.resolve(id));
    const target = document.getElementById(id); if (!target) return null;
    MORE.forEach((t) => { if (t.regions.some((r) => r.contains(target)) && target.closest(".more-extra")) t.expand(); });
    return target;
  }
  const samePage = (a) => { try { const u = new URL(a.href, location.href), norm = (p) => p.replace(/index\.html$/, ""); return u.origin === location.origin && norm(u.pathname) === norm(location.pathname) && u.search === location.search; } catch (e) { return false; } };
  function bindReveal() {
    document.addEventListener("click", (e) => { const a = e.target.closest("a[href*='#']"); if (a && a.hash && samePage(a)) reveal(a.hash); }, true);
    addEventListener("hashchange", () => { const t = reveal(location.hash); if (t) t.scrollIntoView(); });
    /* Opening a #link: the browser jumps before the data-driven sections exist, so land on the target once
       they have rendered, and again while the async Residences block above settles, unless the reader moves first. */
    if (location.hash) {
      const t = reveal(location.hash); if (!t) return;
      let moved = false; const stop = () => { moved = true; };
      ["wheel", "touchstart", "keydown", "mousedown"].forEach((ev) => addEventListener(ev, stop, { once: true, passive: true }));
      const land = () => { if (!moved) t.scrollIntoView({ behavior: "instant", block: "start" }); };
      requestAnimationFrame(land); [300, 900, 1800].forEach((ms) => setTimeout(land, ms));
    }
  }

  /* ---------- favourites: star on each hotel card saves it to My Profile ---------- */
  const P = window.AMBAR_PROFILE || null;
  const isFav = (id) => !!(P && P.isFavHotel(id));
  const starBtn = (h, where) => P ? `<button type="button" class="fav-star" data-fav="${h.id}" aria-pressed="${isFav(h.id)}" aria-label="Favourite ${esc(h.short)}${where ? " (" + where + ")" : ""}" title="Save ${esc(h.short)} to My Profile"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg></button>` : "";
  function syncFavs() {
    if (!P) return;
    const favs = P.get().hotels;
    document.querySelectorAll("[data-fav]").forEach((b) => b.setAttribute("aria-pressed", String(favs.includes(b.dataset.fav))));
    document.querySelectorAll(".hcard").forEach((c) => c.classList.toggle("is-fav", favs.includes(c.dataset.hid)));
  }
  function bindFavs() {
    if (!P) return;
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fav]"); if (!b) return;
      e.preventDefault();
      const id = b.dataset.fav, h = hotelById[id];
      const before = isFav(id);
      if (!before && P.get().hotels.length >= P.LIMITS.hotels) { $("#favStatus").textContent = `You can favourite up to ${P.LIMITS.hotels} hotels.`; return; }
      P.toggleHotel(id);
      $("#favStatus").textContent = before ? `${h.short} removed from your favourites.` : `${h.short} saved to your favourites in My Profile.`;
    });
    P.subscribe(syncFavs);
    syncFavs();
  }
  /* ---------- 4 brand matrix ---------- */
  const WM = {
    "The Ritz-Carlton": "wm-caps", "St. Regis": "wm-wide", "JW Marriott": "wm-jw", "The Luxury Collection": "wm-ital", "W Hotels": "wm-w", "EDITION": "wm-light", "Bvlgari": "wm-wide",
    "Autograph Collection": "wm-light", "Tribute Portfolio": "wm-caps", "Westin": "wm-wide", "Sheraton": "wm-caps", "Gaylord Hotels": "wm-serif", "Marriott Hotels": "wm-ital",
    "Renaissance": "wm-serif", "Le Méridien": "wm-ital", "Delta Hotels": "wm-w", "Design Hotels": "wm-sans", "Marriott Vacation Club": "wm-serif",
    "Courtyard": "wm-sans", "Fairfield by Marriott": "wm-ital", "Four Points by Sheraton": "wm-light", "SpringHill Suites": "wm-caps", "AC Hotels": "wm-w", "Aloft": "wm-sans", "Moxy": "wm-ital", "Protea Hotels": "wm-light",
    "Residence Inn": "wm-serif", "TownePlace Suites": "wm-light", "Element": "wm-sans", "Marriott Executive Apartments": "wm-ital", "Homes & Villas by Marriott Bonvoy": "wm-caps"
  };
  let pinned = null;
  function renderMatrix() {
    const box = $("#matrix");
    DB.tiers.forEach((t) => {
      const bs = DB.brands.filter((b) => b.tier === t.name), comps = bs.reduce((n, b) => n + b.comps.length, 0);
      const row = el("div", { class: "tier tier-" + t.name.toLowerCase().replace(/[^a-z]/g, ""), role: "group", "aria-label": `${t.name} brands` });
      row.innerHTML = `<div class="tier-label"><h3>${t.name}</h3><p>${esc(t.line)}</p><span class="count">${bs.filter((b) => !b.featured).length} brands${comps ? ` · ${comps} tracked` : ""}</span></div>`;
      const list = el("div", { class: "brand-list" });
      bs.forEach((b, i) => {
        const cls = b.featured ? "bchip ambar" : "bchip" + (b.comps.length ? " has-comps" : "");
        const inner = b.featured ? `<img src="assets/ambar-logo.png" alt="AMBAR Residences · Orlando">`
          : `<span class="wm ${WM[b.name] || "wm-serif"}">${esc(b.name)}</span>${b.comps.length ? `<span class="badge" aria-hidden="true">${b.comps.length}</span>` : ""}`;
        const btn = el("button", { type: "button", class: cls, "aria-pressed": "false", "aria-label": `${b.name}, ${t.name} tier${b.comps.length ? `, ${b.comps.length} tracked hotel${b.comps.length > 1 ? "s" : ""}` : ""}` }, inner);
        btn._b = b;
        btn.addEventListener("mouseenter", () => !pinned && panel(b, btn));
        btn.addEventListener("focus", () => panel(b, btn));
        btn.addEventListener("click", () => { pinned = pinned === b ? null : b; document.querySelectorAll(".bchip").forEach((x) => x.setAttribute("aria-pressed", String(x._b === pinned))); panel(b, btn); });
        list.appendChild(btn);
      });
      if (t.name === "Premium") { // AMBAR first in its tier
        const a = [...list.children].find((c) => c.classList.contains("ambar")); if (a) list.prepend(a);
      }
      row.appendChild(list); box.appendChild(row);
    });
    box.addEventListener("mouseleave", () => { if (!pinned) panel(DB.brands.find((b) => b.featured)); });
    $("#compOnly").addEventListener("click", (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(on)); box.classList.toggle("comp-only", on); });
    panel(DB.brands.find((b) => b.featured));
  }
  function panel(b, btn) {
    document.querySelectorAll(".bchip").forEach((x) => x.classList.toggle("is-active", x._b === b));
    const comps = b.comps.map((id) => hotelById[id]);
    $("#brandPanel").innerHTML = `<span class="bp-tier">${b.tier} tier${b.featured ? " · featured" : ""}</span><h3>${esc(b.name)}</h3><p>${esc(b.description)}</p>
      <h4>Hotels tracked here</h4>${comps.length ? `<ul>${comps.map((h) => `<li><a href="#hotel-${h.id}" data-hid="${h.id}"><span>${esc(h.short)}</span><small>${esc(h.area.split(",")[0])}</small></a></li>`).join("")}</ul>`
        : `<p class="none">${b.featured ? "AMBAR is the subject of this landscape, so it is not one of the hotels tracked." : "No hotels from this brand are tracked here."}</p>`}
      <p class="hint">Tap a brand to pin it. Numbers on a brand show how many tracked hotels it has.</p>`;
    $("#brandPanel").querySelectorAll("a[data-hid]").forEach((a) => a.addEventListener("click", () => flashCard(a.dataset.hid)));
  }

  /* ---------- 5 hotels + map ---------- */
  let map, markers = {};
  function renderHotels() {
    $("#hotelsSub").textContent = `Marriott: two JW Marriott resorts in the Luxury tier and five Premium-tier hotels across Autograph Collection, Westin, Sheraton and Gaylord. Non-Marriott: Hyatt Regency Grand Cypress (Hyatt), Wyndham Grand Bonnet Creek (Wyndham), Conrad Orlando (Hilton) and the independent ette, added Oct 14, 2026. Tiers for non-Marriott hotels are indicative. Distances are straight-line to ${DB.meta.reference_point.name}, computed from OpenStreetMap coordinates.`;
    const grid = $("#hotelGrid");
    H.forEach((h, i) => {
      const rs = DB.rates.filter((r) => r.hotel === h.id && r.week === latest.week), p = priced(rs);
      const card = el("article", { class: "hcard", id: "hotel-" + h.id, "data-hid": h.id, "aria-labelledby": "hn-" + h.id });
      card.innerHTML = `${starBtn(h, "")}<div class="pills"><span class="pill t-${h.tier}">${h.tier}</span><span class="pill">${esc(h.brand)}</span>${h.non_marriott ? `<span class="pill pill-nm">Non-Marriott${h.parent && h.parent !== h.brand ? " · " + esc(h.parent) : ""}</span>` : ""}</div>
        <h3 id="hn-${h.id}">${i + 1}. ${esc(h.name)}</h3>
        <p class="loc">${esc(h.area)}<br>${esc(h.address)}</p>
        ${h.keys ? `<p class="dist">${h.keys.toLocaleString("en-US")} keys</p>` : ""}<p class="dist">${h.on_disney_property ? "On Walt Disney World® property · " : ""}≈ ${h.distance_to_epcot_mi} mi straight-line to EPCOT</p>
        ${(() => { const n = DB.hotel_notes.find((x) => x.hotel === h.id && x.week === latest.week); return n && n.demand_note ? `<p class="hnote"><span>Brief note, w/c ${fMD(latest.week)}:</span> ${esc(n.demand_note)}</p>` : ""; })()}
        <div class="latest"><span><b>${p.length ? money(Math.min(...p)) + "–" + money(Math.max(...p)).slice(1) : "Not collected"}</b><br>${p.length ? `range, w/c ${fMD(latest.week)}` : `no public rates, w/c ${fMD(latest.week)}`}</span><span><b>${p.length ? p.length + "/7" : "—"}</b><br>${p.length ? "nights priced" : "not collected"}</span></div>
        <div class="actions"><button type="button" class="linkbtn" data-map="${h.id}">Show on map</button></div>`;
      grid.appendChild(card);
    });
    bindFavs();
    grid.addEventListener("click", (e) => {
      const m = e.target.closest("[data-map]");
      if (m && markers[m.dataset.map]) { map.flyTo(markers[m.dataset.map].getLatLng(), 14, { duration: 0.8 }); markers[m.dataset.map].openPopup(); $("#map").scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
    if (!window.L) { $("#map").innerHTML = '<p style="padding:20px">Map library could not load.</p>'; return; }
    map = L.map("map", { scrollWheelZoom: false, zoomControl: true });
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, subdomains: "abc", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    let tileErr = 0; tiles.on("tileerror", () => { if (++tileErr === 4) $("#mapNote").textContent = "Map tiles could not load (offline?). Hotel positions are still plotted; OpenStreetMap tiles need an internet connection."; });
    const pts = [];
    H.forEach((h, i) => {
      const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${COLORS[h.id]}"><span>${i + 1}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
      markers[h.id] = L.marker([h.lat, h.lon], { icon, title: h.short, alt: h.short }).addTo(map)
        .bindPopup(`<b>${esc(h.short)}</b><br>${esc(h.brand)} · ${h.tier}${h.non_marriott ? " · non-Marriott" : ""}<br>${esc(h.address)}<br><a href="#hotel-${h.id}">View card</a>`);
      pts.push([h.lat, h.lon]);
    });
    const ref = DB.meta.reference_point;
    L.marker([ref.lat, ref.lon], { icon: L.divIcon({ className: "", html: '<div class="pin-ref" title="EPCOT">★</div>', iconSize: [22, 22], iconAnchor: [11, 11] }), title: "EPCOT (reference point)" })
      .addTo(map).bindPopup(`<b>${esc(ref.name)}</b><br>Reference point for distances`);
    map.fitBounds(pts, { padding: [30, 30] });
    const tools = el("div", { class: "map-tools", role: "group", "aria-label": "Map view" });
    const disney = H.filter((h) => h.distance_to_epcot_mi <= 5).map((h) => [h.lat, h.lon]);
    [["All hotels", pts], ["Disney area", disney]].forEach(([lab, b]) => {
      const x = el("button", { type: "button", class: "seg-btn" }, lab); x.addEventListener("click", () => map.flyToBounds(b, { padding: [40, 40], duration: 0.8 })); tools.appendChild(x);
    });
    $("#map").before(tools);
  }
  function flashCard(id) { const c = $("#hotel-" + id); if (!c) return; c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 2200); }

  /* Visit Orlando calendar: moved to events/index.html (assets/js/events.js) */

  /* ---------- 7 demand ---------- */
  function renderDemand() {
    const strip = $("#marketStrip");
    if (strip) strip.innerHTML = (DB.market || []).map((m) => `<div class="mstat"><div class="p">${esc(m.period)}</div><div class="v">${esc(m.value)}</div><p class="c">${esc(m.metric)} · ${esc(m.change)}</p><p class="s">Metro-wide, not these hotels. ${esc(m.source)}</p></div>`).join("");
    const DM_TOP = 3, DA_TOP = 3; // condensed preview: first 3 notes of the chosen week + first 3 'Looking ahead' items
    const evHTML = (e, i, wk) => `<div class="ev${i >= DM_TOP ? " more-extra" : ""}" id="demand-${wk}-${i + 1}"><div class="d"><span class="type type-${esc(e.type || "Other")}">${esc(e.type || "Note")}</span><span>${esc(e.dates)}</span></div><p class="t">${esc(e.title)}</p>${e.detail ? `<p class="x">${esc(e.detail)}</p>` : ""}${(e.hotels && e.hotels.length) ? `<p class="x">Linked hotels: ${e.hotels.map((id) => `<a href="#hotel-${id}">${esc((hotelById[id]||{}).short || id)}</a>`).join(", ")}</p>` : ""}<p class="s">${esc(e.source || "")}</p></div>`;
    const weekList = [...weeks].reverse();
    let active = latest ? latest.week : (weekList[0] && weekList[0].week);
    const toolbar = $("#demandToolbar");
    const timeline = $("#timeline");
    let shownEv = 0, more = null;
    const LA = DB.looking_ahead || [];
    function paintDemand() {
      if (toolbar) {
        toolbar.innerHTML = weekList.map((w) => `<button type="button" class="chip" data-dw="${w.week}" aria-pressed="${w.week===active}">${fMD(w.week)}</button>`).join("");
        toolbar.querySelectorAll("[data-dw]").forEach((b) => b.addEventListener("click", () => { active = b.dataset.dw; paintDemand(); }));
      }
      const focus = weekList.filter((w) => w.week === active);
      const show = focus.length ? focus : weekList.slice(0, 1);
      if (timeline) {
        timeline.innerHTML = show.map((w) => {
          const evs = DB.context[w.week] || [];
          shownEv = evs.length;
          return `<article class="tweek${w.status === "missing" ? " missing" : ""}"><h3>${fMD(w.week)} – ${fMD(w.week_end)}</h3>
            <p class="wk-status">${w.status === "missing" ? "No rate brief · context only" : `Brief of ${fMD(w.generated)}`}</p>${evs.map((e, i) => evHTML(e, i, w.week)).join("") || '<p class="x">No events recorded for this week.</p>'}</article>`;
        }).join("");
      }
      if (more) more.sync(Math.min(shownEv, DM_TOP) + Math.min(LA.length, DA_TOP), shownEv + LA.length);
    }
    const ahead = $("#ahead");
    if (ahead) {
      if (LA.length) {
        ahead.innerHTML = `<h3>Looking ahead</h3><ul>${LA.map((e, i) => `<li${i >= DA_TOP ? ' class="more-extra"' : ""} id="ahead-${i + 1}"><div class="d">${esc(e.dates)}</div><p class="t">${esc(e.title)}</p>${e.detail ? `<p class="t" style="font-size:.82rem;opacity:.85">${esc(e.detail)}</p>` : ""}<span class="s">${esc(e.source)}</span></li>`).join("")}</ul>`;
      } else ahead.remove();
    }
    more = moreToggle({ id: "demandToggle", regions: ["timeline", ...(LA.length ? ["ahead"] : [])], after: LA.length ? ahead : timeline, noun: "demand notes" });
    paintDemand();
  }

  /* ---------- 8 news ---------- */
  function renderNews() {
    const list = $("#newsList");
    const toolbar = $("#newsToolbar");
    if (!list) return;
    const NEWS_TOP = 4; // condensed preview: the 4 newest headlines in the current filter (two rows on desktop)
    const items = [...(DB.news || [])].map((n, i) => ({
      ...n, _n: i + 1, // data order, matches the knowledge index id news:N and the #news-N anchor
      category: n.category || (n.orlando ? "orlando" : "marriott"),
    }));
    // Sort newest week first, then as listed
    const weekOrder = [...collected].reverse().map((w) => w.week);
    items.sort((a, b) => {
      const ia = weekOrder.indexOf(a.week); const ib = weekOrder.indexOf(b.week);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    let filter = "all";
    const more = moreToggle({ id: "newsToggle", regions: ["newsList"], after: list, noun: "headlines" });
    more.resolve = (id) => { if (filter !== "all" && /^news-\d+$/.test(id) && items.some((n) => "news-" + n._n === id)) { filter = "all"; paint(); } };
    function paint() {
      if (toolbar) {
        const counts = { all: items.length, marriott: 0, orlando: 0, hospitality: 0 };
        items.forEach((n) => { if (counts[n.category] != null) counts[n.category]++; });
        toolbar.innerHTML = ["all","marriott","orlando","hospitality"].map((k) => {
          const label = k === "all" ? "All" : k === "marriott" ? "Marriott" : k === "orlando" ? "Wider Orlando" : "Hospitality media";
          return `<button type="button" class="chip" data-nf="${k}" aria-pressed="${filter===k}">${label} (${counts[k]||0})</button>`;
        }).join("");
        toolbar.querySelectorAll("[data-nf]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.nf; paint(); }));
      }
      const shown = items.filter((n) => filter === "all" || n.category === filter);
      let html = "";
      let lastWeek = null;
      shown.forEach((n, i) => {
        const extra = i >= NEWS_TOP ? " more-extra" : "";
        if (n.week !== lastWeek) {
          lastWeek = n.week;
          const w = weeks.find((x) => x.week === n.week);
          html += `<div class="news-week-label${extra}">Week of ${fMD(n.week)}${w && w.generated ? ` · brief ${fMD(w.generated)}` : ""}</div>`;
        }
        const cat = n.category || "marriott";
        html += `<article class="nitem${extra}" id="news-${n._n}">
          <div class="d"><span>${esc(n.date || "")}</span><span class="tag-cat tag-cat-${esc(cat)}">${esc(cat)}</span>${n.orlando ? '<span class="tag-orl">Orlando</span>' : ""}</div>
          <p>${esc(n.headline)}</p>
          <div class="s">${esc(n.source || "")}</div>
          ${n.url ? `<a class="nlink" href="${esc(n.url)}" target="_blank" rel="noopener">Read source</a>` : ""}
        </article>`;
      });
      list.innerHTML = html || `<p class="vo-empty">No headlines in this filter.</p>`;
      more.sync(Math.min(shown.length, NEWS_TOP), shown.length);
    }
    paint();
  }

  /* ---------- 8 footer ---------- */
  function renderFooter() {
    const m = DB.meta;
    $("#updatedNote").textContent = `Updated weekly. Latest snapshot ${fLong(m.last_updated)}. Next update expected with the following Monday’s brief.`;
    $("#rateDef").textContent = m.rate_definition;
    $("#caveats").innerHTML = m.caveats.map((c) => `<li>${esc(c)}</li>`).join("");
    $("#weekSources").innerHTML = weeks.map((w) => w.status === "missing"
      ? `<li><b>w/c ${fMD(w.week)}:</b> not collected. ${esc(w.note)}</li>`
      : `<li><b>w/c ${fMD(w.week)}</b> (snapshot ${fMD(w.generated)}; ${esc(w.brief_file)}): ${esc(w.rate_sources)}</li>`).join("");
    $("#distMethod").textContent = `${m.distance_method} Addresses: swandolphin.com for the three Swan & Dolphin hotels, official hotel sites or venue listings for the four non-Marriott hotels, OpenStreetMap for the others; coordinates from OpenStreetMap.`;
    $("#excluded").innerHTML = m.excluded.map((c) => `<li>${esc(c)}</li>`).join("");
  }

  /* ---------- nav highlight ---------- */
  function navSpy() {
    const links = [...document.querySelectorAll(".site-nav a")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
    links.forEach((a) => { const h = a.getAttribute("href"); if (!h.startsWith("#")) return; const s = $(h); if (s) io.observe(s); });
  }
  /* boot */
  load().then(init).catch((e) => {
    console.error(e);
    $("#main").insertAdjacentHTML("afterbegin", '<p class="wrap" style="padding:24px">Data could not be loaded (data/comps.json).</p>');
  });
})();
