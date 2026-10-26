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
  const todayISO = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);   /* boot */
  load().then(init).catch((e) => {
    console.error(e);
    $("#main").insertAdjacentHTML("afterbegin", '<p class="wrap" style="padding:24px">Data could not be loaded (data/comps.json).</p>');
  });
})();

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
      loadJson("data/visitorlando_events.json", "VO_EVENTS_DATA", "data/visitorlando_events.js").catch(() => null),
    ]).then(([comps, vo]) => ({ comps, vo }));
  }


  let DB, VO, H, byHotel, weeks, collected, latest, tip;

    function init(payload) {
    const db = payload.comps || payload;
    VO = payload.vo || null;
    DB = db; H = db.hotels; weeks = db.weeks; collected = weeks.filter((w) => w.status === "collected"); latest = collected[collected.length - 1];
    byHotel = Object.fromEntries(H.map((h) => [h.id, h]));
    tip = $("#tip");
    renderHero(); renderWeekAhead(); renderHistory(); renderMatrix(); renderHotels(); renderVisitOrlando(); renderDemand(); renderNews(); renderFooter(); navSpy();
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
    const all = DB.rates.filter((r) => r.status === "OK").length;
    const gaps = weeks.filter((w) => w.status === "missing");
    const stats = [
      ["Hotels tracked", H.length, `${H.filter((h) => !h.non_marriott).length} Marriott · ${H.filter((h) => h.non_marriott).length} non-Marriott`],
      ["Weeks tracked", collected.length, `of ${weeks.length} in window`],
      ["Priced nights", all, "lowest public rates"],
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
      $("#heatFoot").textContent = ""; return;
    }
    const rs = ratesFor(wk), dates = weekDates(w), srcs = sourcesOf(rs);
    $("#waSub").innerHTML = `${wk === latest.week ? "Latest week" : "Week"} · ${fLong(w.week)} – ${fLong(w.week_end)}. Lowest public nightly rate observed, snapshot ${fLong(w.generated)} (${esc(srcs.join("; "))}).`;
    let html = `<table class="heat"><caption class="sr-only" style="position:absolute;left:-9999px">Lowest public nightly rates, week of ${fMD(wk)}</caption><thead><tr><th scope="col" class="row"><span>Hotel</span></th>`;
    dates.forEach((d) => { html += `<th scope="col" class="${d === todayISO ? "today" : ""}">${fDay(d)}<b>${fMD(d).split(" ")[1]}</b></th>`; });
    html += `<th scope="col" class="sumhead">Mean of<br>priced nights</th></tr></thead><tbody>`;
    H.forEach((h) => {
      html += `<tr><th scope="row" class="row"><strong>${esc(h.short)}</strong><span>${esc(h.brand)} · ${h.tier}</span></th>`;
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
      (notes.length ? `<br><strong>Brief notes this week:</strong> ` + notes.map((n) => `${esc(byHotel[n.hotel].short)}: ${esc(n.rate_note)}`).join(" · ") : "");
  }

  /* ---------- 3 history ---------- */
  let chart, view = "nightly", showBand = true, capOn = true, CAP = null, minis = [];
  const CAP_SHAPE = "triangle";
  // Cap rule: 1.5 x the 95th percentile of all priced nights, rounded up to the next $250 (min $500).
  // With the current data: p95 = $658 -> cap = $1,000. Recomputed automatically as weeks are added.
  function capValue() {
    if (CAP) return CAP;
    const v = priced(DB.rates).sort((a, b) => a - b); if (!v.length) return (CAP = Infinity);
    const p95 = v[Math.max(0, Math.ceil(0.95 * v.length) - 1)];
    CAP = Math.max(500, Math.ceil((p95 * 1.5) / 250) * 250); capValue.p95 = p95; return CAP;
  }
  const capArr = (arr) => (capOn ? arr.map((v) => (v != null && v > capValue() ? capValue() : v)) : arr);
  const isCapped = (raw, i) => capOn && raw[i] != null && raw[i] > capValue();
  const capPlugin = {
    id: "capLine",
    afterDatasetsDraw(c) {
      const o = c.options.plugins.capLine; if (!o || !o.on) return;
      const { ctx, chartArea: a, scales: { y } } = c, py = y.getPixelForValue(o.value);
      if (py < a.top - 1 || py > a.bottom) return;
      ctx.save(); ctx.strokeStyle = "rgba(243,111,67,.75)"; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
      if (o.label) { ctx.setLineDash([]); ctx.fillStyle = "#B4492A"; ctx.font = "600 11px 'DM Sans', sans-serif"; ctx.textAlign = "left"; ctx.fillText(o.label, a.left + 6, py + 14); }
      ctx.restore();
    }
  };
  const anyAbove = (arrs) => arrs.some((a) => a.some((v) => v != null && v > capValue()));
  const visible = new Set();
  const allDates = () => weeks.flatMap(weekDates);

  const gapPlugin = {
    id: "gapShade",
    beforeDatasetsDraw(c) {
      const { ctx, chartArea: a, scales: { x } } = c, ranges = c.options.plugins.gapShade?.ranges || [];
      ranges.forEach(([i0, i1, label]) => {
        const step = x.getPixelForValue(1) - x.getPixelForValue(0) || 40;
        const x0 = x.getPixelForValue(i0) - step / 2, x1 = x.getPixelForValue(i1) + step / 2;
        ctx.save(); ctx.fillStyle = "rgba(117,117,117,.09)"; ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        ctx.strokeStyle = "rgba(117,117,117,.35)"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x0, a.top); ctx.lineTo(x0, a.bottom); ctx.moveTo(x1, a.top); ctx.lineTo(x1, a.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = "#757575"; ctx.font = "600 11px 'DM Sans', sans-serif"; ctx.textAlign = "center";
        const cx = (x0 + x1) / 2; label.split("\n").forEach((l, k) => ctx.fillText(l, cx, a.top + 18 + k * 14));
        ctx.restore();
      });
    }
  };

  function series() {
    if (view === "nightly") {
      const dates = allDates();
      const labels = dates.map((d) => fMD(d));
      const val = (hid, d) => { const r = DB.rates.find((x) => x.hotel === hid && x.date === d); return r && r.status === "OK" && Number(r.rate) > 0 ? r.rate : null; };
      const per = H.map((h) => ({ h, data: dates.map((d) => val(h.id, d)) }));
      const set = dates.map((d) => priced(DB.rates.filter((r) => r.date === d)));
      const gaps = weeks.map((w, i) => w.status === "missing" ? [i * 7, i * 7 + 6, `Week of ${fMD(w.week)}\nnot collected`] : null).filter(Boolean);
      return { labels, per, min: set.map((p) => (p.length ? Math.min(...p) : null)), max: set.map((p) => (p.length ? Math.max(...p) : null)), med: set.map(median), gaps, dates };
    }
    const labels = weeks.map((w) => `w/c ${fMD(w.week)}`);
    const per = H.map((h) => ({ h, data: weeks.map((w) => mean(priced(DB.rates.filter((r) => r.week === w.week && r.hotel === h.id))) ) }));
    const set = weeks.map((w, i) => per.map((p) => p.data[i]).filter((v) => v != null));
    const gaps = weeks.map((w, i) => (w.status === "missing" ? [i, i, "Not\ncollected"] : null)).filter(Boolean);
    return { labels, per, min: set.map((p) => (p.length ? Math.min(...p) : null)), max: set.map((p) => (p.length ? Math.max(...p) : null)), med: set.map(median), gaps };
  }

  function buildDatasets(s) {
    const ds = [];
    if (showBand) {
      ds.push({ label: "Range low", data: s.min, borderWidth: 0, pointRadius: 0, fill: false, spanGaps: false, backgroundColor: "rgba(201,163,90,.18)", order: 10, _band: 1 });
      ds.push({ label: "Range", data: capArr(s.max), borderWidth: 0, pointRadius: 0, fill: "-1", spanGaps: false, backgroundColor: "rgba(201,163,90,.18)", order: 10, _band: 1 });
      ds.push({ label: "Median", data: s.med, borderColor: "#171717", borderDash: [6, 5], borderWidth: 1.6, pointRadius: 0, spanGaps: false, tension: 0.25, order: 1 });
    }
    s.per.forEach(({ h, data }) => {
      if (!visible.has(h.id)) return;
      const base = view === "weekly" ? 5 : 2.5;
      ds.push({ label: h.short, data: capArr(data), _raw: data, borderColor: COLORS[h.id], backgroundColor: COLORS[h.id], borderWidth: 2.2, tension: 0.25,
        pointStyle: (c) => (isCapped(data, c.dataIndex) ? CAP_SHAPE : "circle"),
        pointRadius: (c) => (isCapped(data, c.dataIndex) ? 8 : base),
        pointHoverRadius: (c) => (isCapped(data, c.dataIndex) ? 10 : 6),
        pointBorderColor: (c) => (isCapped(data, c.dataIndex) ? "#F36F43" : COLORS[h.id]),
        pointBorderWidth: (c) => (isCapped(data, c.dataIndex) ? 2.5 : 1),
        spanGaps: false, order: 2, clip: 12, _hid: h.id });
    });
    return ds;
  }

  function renderHistory() {
    H.forEach((h) => visible.add(h.id));
    const chips = $("#hotelChips");
    H.forEach((h) => {
      const b = el("button", { type: "button", class: "chip", "aria-pressed": "true", "data-hid": h.id }, `<i style="background:${COLORS[h.id]}"></i>${esc(h.short)}`);
      b.addEventListener("click", () => { visible.has(h.id) ? visible.delete(h.id) : visible.add(h.id); syncChips(); updateChart(); });
      chips.appendChild(b);
    });
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      view = b.dataset.view; document.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); updateChart(true);
    }));
    $("#toggleBand").addEventListener("click", (e) => { showBand = !showBand; e.currentTarget.setAttribute("aria-pressed", String(showBand)); updateChart(); });
    $("#allHotels").addEventListener("click", () => { H.forEach((h) => visible.add(h.id)); syncChips(); updateChart(); });
    $("#noHotels").addEventListener("click", () => { visible.clear(); syncChips(); updateChart(); });
    $("#toggleCap").addEventListener("click", (e) => { capOn = !capOn; e.currentTarget.setAttribute("aria-pressed", String(capOn)); updateChart(); updateMinis(); });

    Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif"; Chart.defaults.color = "#5f5f55";
    const s = series();
    chart = new Chart($("#historyChart"), {
      type: "line", data: { labels: s.labels, datasets: buildDatasets(s) }, plugins: [gapPlugin, capPlugin],
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, animation: { duration: 450 }, layout: { padding: { top: 12 } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14 } },
          y: { grid: { color: "rgba(30,58,44,.08)" }, beginAtZero: false, ticks: { callback: (v) => (Number(v) > 0 ? "$" + Number(v).toLocaleString("en-US") : "") }, title: { display: true, text: "Lowest public nightly rate (USD)" } }
        },
        plugins: {
          legend: { display: false }, gapShade: { ranges: s.gaps }, capLine: { on: false },
          tooltip: {
            backgroundColor: "#143023", titleColor: "#E3C68A", padding: 12, boxPadding: 4,
            filter: (i) => !i.dataset._band && i.raw != null,
            callbacks: {
              title: (items) => (view === "nightly" && items[0] ? fDay(series.cache.dates[items[0].dataIndex]) + " " + items[0].label : items[0]?.label),
              label: (i) => {
                const raw = i.dataset._raw ? i.dataset._raw[i.dataIndex] : i.raw;
                return raw > i.raw ? ` ${i.dataset.label}: shown at ${money(i.raw)} cap · Actual: ${money(raw)}` : ` ${i.dataset.label}: ${money(raw)}`;
              }
            }
          }
        }
      }
    });
    series.cache = s;
    applyCapAxis(s);
    chart.update("none");
    updateCaption(s);

    // small multiples
    const box = $("#multiples");
    const dates = allDates();
    H.forEach((h) => {
      const wm = weeks.map((w) => ({ w, m: mean(priced(DB.rates.filter((r) => r.week === w.week && r.hotel === h.id))) }));
      const have = wm.filter((x) => x.m != null), last = have[have.length - 1], prev = have[have.length - 2];
      const ch = last && prev ? (last.m / prev.m - 1) * 100 : null;
      const card = el("button", { type: "button", class: "mini", "aria-label": `Show only ${h.short} in the main chart` },
        `<h4><i style="background:${COLORS[h.id]}"></i>${esc(h.short)}</h4><span class="m-brand">${esc(h.brand)} · ${h.tier}</span>
         <div class="m-stats"><span><b>${money(last?.m)}</b> w/c ${last ? fMD(last.w.week) : "—"}</span>
         ${ch == null ? "" : Math.abs(ch) < 0.5 ? `<span class="delta flat" title="Change in weekly mean vs w/c ${fMD(prev.w.week)}">Flat vs ${fMD(prev.w.week)}</span>` : `<span class="delta ${ch > 0 ? "up" : "down"}" title="Change in weekly mean vs w/c ${fMD(prev.w.week)}">${ch > 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(0)}% vs ${fMD(prev.w.week)}</span>`}</div>
         <canvas aria-hidden="true"></canvas>`);
      card.addEventListener("click", () => { visible.clear(); visible.add(h.id); syncChips(); updateChart(); $("#history").scrollIntoView({ behavior: "smooth" }); });
      box.appendChild(card);
      const data = dates.map((d) => { const r = DB.rates.find((x) => x.hotel === h.id && x.date === d); return r && r.status === "OK" && Number(r.rate) > 0 ? r.rate : null; });
      const mc = new Chart($("canvas", card), {
        type: "line", data: { labels: dates, datasets: [{ data: capArr(data), borderColor: COLORS[h.id], borderWidth: 1.8, tension: 0.3, spanGaps: false, fill: false,
          pointStyle: CAP_SHAPE, pointBackgroundColor: "#F36F43", pointBorderColor: "#fff", pointBorderWidth: 1,
          pointRadius: (c) => (isCapped(data, c.dataIndex) ? 8 : 0), clip: 12 }] },
        plugins: [gapPlugin, capPlugin],
        options: { responsive: true, maintainAspectRatio: false, animation: false, events: [], layout: { padding: { top: 10 } }, plugins: { legend: { display: false }, tooltip: { enabled: false }, gapShade: { ranges: weeks.map((w, i) => w.status === "missing" ? [i * 7, i * 7 + 6, ""] : null).filter(Boolean) } },
          scales: { x: { display: false }, y: { display: false, min: undefined, suggestedMin: undefined, max: miniMax() } } }
      });
      mc._raw = data; minis.push(mc);
      const capped = data.filter((v) => v != null && v > capValue());
      if (capped.length) card.querySelector(".m-stats").insertAdjacentHTML("afterend", `<span class="m-cap" data-capnote>▲ ${capped.length} night${capped.length > 1 ? "s" : ""} above ${money(capValue())} cap (max ${money(Math.max(...capped))})</span>`);
    });
  }
  const miniMax = () => (capOn && anyAbove([priced(DB.rates)]) ? capValue() * 1.22 : Math.max(...priced(DB.rates)) * 1.02);
  function updateMinis() {
    minis.forEach((m) => { m.data.datasets[0].data = capArr(m._raw); m.options.scales.y.max = miniMax(); m.update("none"); });
    document.querySelectorAll("[data-capnote]").forEach((n) => (n.hidden = !capOn));
  }
  function applyCapAxis(s) {
    const above = capOn && anyAbove([...s.per.filter((p) => visible.has(p.h.id)).map((p) => p.data), showBand ? s.max : []]);
    chart.options.scales.y.max = above ? capValue() : undefined;
    chart.options.plugins.capLine = { on: above, value: capValue(), label: above ? `Cap ${money(capValue())}` : "" };
    const note = $("#capNote");
    if (!capOn) note.innerHTML = `Cap is off: the axis shows every value, so the highest nights compress the rest of the chart.`;
    else note.innerHTML = `<span class="cap-mark" aria-hidden="true">▲</span> <strong>Cap extreme values is on.</strong> The axis stops at ${money(capValue())} (1.5 × the 95th percentile of all priced nights, ${money(capValue.p95)}, rounded up to the next $250). ` +
      (above ? `Nights above the cap are pinned at ${money(capValue())} with a triangle marker; hover or tap one to see the actual rate. Currently capped: ${cappedList()}.` : `No values in the current view exceed the cap.`) + ` Turn the toggle off to see the full scale.`;
  }
  function cappedList() {
    return DB.rates.filter((r) => r.status === "OK" && r.rate > capValue() && (view === "nightly" ? visible.has(r.hotel) : false))
      .map((r) => `${esc(byHotel[r.hotel].short)}, ${fDay(r.date)} ${fMD(r.date)} (actual ${money(r.rate)})`).join("; ") || (view === "weekly" ? "none (weekly means are all below the cap)" : "none for the hotels shown");
  }
  function syncChips() { document.querySelectorAll("#hotelChips .chip").forEach((c) => c.setAttribute("aria-pressed", String(visible.has(c.dataset.hid)))); }
  function updateChart(relabel) {
    const s = series(); series.cache = s;
    chart.data.labels = s.labels; chart.data.datasets = buildDatasets(s); chart.options.plugins.gapShade.ranges = s.gaps;
    applyCapAxis(s); chart.update(); updateCaption(s);
  }
  function updateCaption(s) {
    $("#historyCaption").textContent = (view === "nightly"
      ? "Nightly view: each point is one night’s lowest public rate. Unavailable or uncollected nights break the line."
      : "Weekly view: simple mean of the nights that showed a price, per hotel (illustrative, not ADR).") +
      ` The range band and median are calculated across all ${H.length} hotels, whichever hotels are toggled on. Sources: ` +
      collected.map((w) => `w/c ${fMD(w.week)}: ${sourcesOf(ratesFor(w.week)).join(" & ")} (${fMD(w.generated)})`).join("; ") + ".";
    $("#historyChart").setAttribute("aria-label", `${view === "nightly" ? "Nightly" : "Weekly mean"} lowest public rates for ${visible.size} hotels from ${fMD(weeks[0].week)} to ${fMD(weeks[weeks.length - 1].week_end)}; week of ${weeks.filter((w) => w.status === "missing").map((w) => fMD(w.week)).join(", ") || "none"} not collected.`);
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
    const comps = b.comps.map((id) => byHotel[id]);
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
      const card = el("article", { class: "hcard", id: "hotel-" + h.id, "aria-labelledby": "hn-" + h.id });
      card.innerHTML = `<div class="pills"><span class="pill t-${h.tier}">${h.tier}</span><span class="pill">${esc(h.brand)}</span>${h.non_marriott ? `<span class="pill pill-nm">Non-Marriott${h.parent && h.parent !== h.brand ? " · " + esc(h.parent) : ""}</span>` : ""}</div>
        <h3 id="hn-${h.id}">${i + 1}. ${esc(h.name)}</h3>
        <p class="loc">${esc(h.area)}<br>${esc(h.address)}</p>
        ${h.keys ? `<p class="dist">${h.keys.toLocaleString("en-US")} keys</p>` : ""}<p class="dist">${h.on_disney_property ? "On Walt Disney World® property · " : ""}≈ ${h.distance_to_epcot_mi} mi straight-line to EPCOT</p>
        ${(() => { const n = DB.hotel_notes.find((x) => x.hotel === h.id && x.week === latest.week); return n && n.demand_note ? `<p class="hnote"><span>Brief note, w/c ${fMD(latest.week)}:</span> ${esc(n.demand_note)}</p>` : ""; })()}
        <div class="latest"><span><b>${p.length ? money(Math.min(...p)) + "–" + money(Math.max(...p)).slice(1) : "Not collected"}</b><br>${p.length ? `range, w/c ${fMD(latest.week)}` : `no public rates, w/c ${fMD(latest.week)}`}</span><span><b>${p.length ? p.length + "/7" : "—"}</b><br>${p.length ? "nights priced" : "not collected"}</span></div>
        <div class="actions"><button type="button" class="linkbtn" data-map="${h.id}">Show on map</button><button type="button" class="linkbtn" data-chart="${h.id}">See history</button></div>`;
      grid.appendChild(card);
    });
    grid.addEventListener("click", (e) => {
      const m = e.target.closest("[data-map]"), c = e.target.closest("[data-chart]");
      if (m && markers[m.dataset.map]) { map.flyTo(markers[m.dataset.map].getLatLng(), 14, { duration: 0.8 }); markers[m.dataset.map].openPopup(); $("#map").scrollIntoView({ behavior: "smooth", block: "center" }); }
      if (c) { visible.clear(); visible.add(c.dataset.chart); syncChips(); updateChart(); $("#history").scrollIntoView({ behavior: "smooth" }); }
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

  /* ---------- 6 Visit Orlando calendar ---------- */
  function fmtRange(s, e) {
    if (!s) return "";
    if (!e || e === s) return fMD(s);
    return `${fMD(s)} – ${fMD(e)}`;
  }
  function renderVisitOrlando() {
    const rootToolbar = $("#voToolbar");
    const rootGrid = $("#voGrid");
    const rootMeta = $("#voMeta");
    const rootAttrib = $("#voAttrib");
    if (!rootGrid) return;
    if (!VO || !Array.isArray(VO.events) || !VO.events.length) {
      rootGrid.innerHTML = `<p class="vo-empty">Visit Orlando events are not loaded yet. Refresh with <code>scripts/fetch_visitorlando_events.py</code>.</p>`;
      if (rootAttrib) rootAttrib.innerHTML = `Event calendar: <a href="https://www.visitorlando.com/events/" target="_blank" rel="noopener">Visit Orlando</a>.`;
      return;
    }
    const all = VO.events.slice();
    const cats = Array.from(new Set(all.flatMap((e) => e.categories || []))).sort();
    // Week buckets overlapping the window
    const weeksBuckets = [];
    {
      const start = new Date(VO.window_start + "T12:00:00");
      const end = new Date(VO.window_end + "T12:00:00");
      let cur = new Date(start);
      // align to Monday of start week
      const day = (cur.getDay() + 6) % 7;
      cur.setDate(cur.getDate() - day);
      while (cur <= end) {
        const ws = cur.toISOString().slice(0, 10);
        const we = new Date(cur); we.setDate(we.getDate() + 6);
        weeksBuckets.push({ start: ws, end: we.toISOString().slice(0, 10), label: `${fMD(ws)} – ${fMD(we.toISOString().slice(0, 10))}` });
        cur.setDate(cur.getDate() + 7);
      }
    }
    let state = { week: "all", cat: "all", limit: 24 };
    function overlapsWeek(e, b) {
      return e.start_date <= b.end && e.end_date >= b.start;
    }
    function filtered() {
      return all.filter((e) => {
        if (state.cat !== "all" && !(e.categories || []).includes(state.cat)) return false;
        if (state.week !== "all") {
          const b = weeksBuckets.find((w) => w.start === state.week);
          if (b && !overlapsWeek(e, b)) return false;
        }
        return true;
      });
    }
    function paintToolbar() {
      if (!rootToolbar) return;
      const weekChips = [`<button type="button" class="chip" data-week="all" aria-pressed="${state.week==="all"}">All dates</button>`]
        .concat(weeksBuckets.map((b) => `<button type="button" class="chip" data-week="${b.start}" aria-pressed="${state.week===b.start}">${esc(b.label)}</button>`))
        .join("");
      const catChips = [`<button type="button" class="chip" data-cat="all" aria-pressed="${state.cat==="all"}">All types</button>`]
        .concat(cats.slice(0, 10).map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${state.cat===c}">${esc(c)}</button>`))
        .join("");
      rootToolbar.innerHTML = `<div class="vo-chiprow" style="display:flex;flex-wrap:wrap;gap:8px;width:100%">${weekChips}</div><div class="vo-chiprow" style="display:flex;flex-wrap:wrap;gap:8px;width:100%;margin-top:8px">${catChips}</div>`;
      rootToolbar.querySelectorAll("[data-week]").forEach((b) => b.addEventListener("click", () => { state.week = b.dataset.week; state.limit = 24; paint(); }));
      rootToolbar.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { state.cat = b.dataset.cat; state.limit = 24; paint(); }));
    }
    function card(e) {
      const tags = (e.categories || []).slice(0, 3).map((c) => `<span class="tag">${esc(c)}</span>`).join("");
      const loc = [e.location, e.city].filter(Boolean).join(" · ");
      return `<a class="vo-card" href="${esc(e.url)}" target="_blank" rel="noopener">
        <div class="vo-date">${esc(fmtRange(e.start_date, e.end_date))}</div>
        <h3 class="vo-title">${esc(e.title)}</h3>
        ${loc ? `<p class="vo-loc">${esc(loc)}</p>` : ""}
        ${e.description ? `<p class="vo-desc">${esc(e.description)}</p>` : ""}
        <div class="vo-tags">${tags}</div>
      </a>`;
    }
    function paint() {
      paintToolbar();
      const list = filtered();
      const show = list.slice(0, state.limit);
      rootMeta.textContent = `${list.length} event${list.length===1?"":"s"} in view · window ${fMD(VO.window_start)} – ${fMD(VO.window_end)} · fetched ${VO.fetched_at ? fMD(VO.fetched_at.slice(0,10)) : "—"}`;
      rootGrid.innerHTML = show.map(card).join("") || `<p class="vo-empty">No Visit Orlando events match these filters.</p>`;
      if (list.length > state.limit) {
        rootGrid.insertAdjacentHTML("beforeend", `<div class="vo-more" style="grid-column:1/-1"><button type="button" id="voMore">Show more (${list.length - state.limit} remaining)</button></div>`);
        $("#voMore")?.addEventListener("click", () => { state.limit += 24; paint(); });
      }
      if (rootAttrib) {
        const cal = VO.calendar_url || "https://www.visitorlando.com/events/";
        rootAttrib.innerHTML = `Source: <a href="${esc(cal)}" target="_blank" rel="noopener">Visit Orlando events calendar</a>. Listings are attributed to Visit Orlando; this page does not invent events.`;
      }
    }
    paint();
  }

  /* ---------- 7 demand ---------- */
  function renderDemand() {
    const strip = $("#marketStrip");
    if (strip) strip.innerHTML = (DB.market || []).map((m) => `<div class="mstat"><div class="p">${esc(m.period)}</div><div class="v">${esc(m.value)}</div><p class="c">${esc(m.metric)} · ${esc(m.change)}</p><p class="s">Metro-wide, not these hotels. ${esc(m.source)}</p></div>`).join("");
    const evHTML = (e) => `<div class="ev"><div class="d"><span class="type type-${esc(e.type || "Other")}">${esc(e.type || "Note")}</span><span>${esc(e.dates)}</span></div><p class="t">${esc(e.title)}</p>${e.detail ? `<p class="x">${esc(e.detail)}</p>` : ""}${(e.hotels && e.hotels.length) ? `<p class="x">Linked hotels: ${e.hotels.map((id) => `<a href="#hotel-${id}">${esc((byHotel[id]||{}).short || id)}</a>`).join(", ")}</p>` : ""}<p class="s">${esc(e.source || "")}</p></div>`;
    const weekList = [...weeks].reverse();
    let active = latest ? latest.week : (weekList[0] && weekList[0].week);
    const toolbar = $("#demandToolbar");
    const timeline = $("#timeline");
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
          return `<article class="tweek${w.status === "missing" ? " missing" : ""}"><h3>${fMD(w.week)} – ${fMD(w.week_end)}</h3>
            <p class="wk-status">${w.status === "missing" ? "No rate brief · context only" : `Brief of ${fMD(w.generated)}`}</p>${evs.map(evHTML).join("") || '<p class="x">No events recorded for this week.</p>'}</article>`;
        }).join("");
      }
    }
    paintDemand();
    const ahead = $("#ahead");
    if (ahead) {
      if (DB.looking_ahead?.length) {
        ahead.innerHTML = `<h3>Looking ahead</h3><ul>${DB.looking_ahead.map((e) => `<li><div class="d">${esc(e.dates)}</div><p class="t">${esc(e.title)}</p>${e.detail ? `<p class="t" style="font-size:.82rem;opacity:.85">${esc(e.detail)}</p>` : ""}<span class="s">${esc(e.source)}</span></li>`).join("")}</ul>`;
      } else ahead.remove();
    }
  }

  /* ---------- 8 news ---------- */
  function renderNews() {
    const list = $("#newsList");
    const toolbar = $("#newsToolbar");
    if (!list) return;
    const items = [...(DB.news || [])].map((n) => ({
      ...n,
      category: n.category || (n.orlando ? "orlando" : "marriott"),
    }));
    // Sort newest week first, then as listed
    const weekOrder = [...collected].reverse().map((w) => w.week);
    items.sort((a, b) => {
      const ia = weekOrder.indexOf(a.week); const ib = weekOrder.indexOf(b.week);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    let filter = "all";
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
      for (const n of shown) {
        if (n.week !== lastWeek) {
          lastWeek = n.week;
          const w = weeks.find((x) => x.week === n.week);
          html += `<div class="news-week-label">Week of ${fMD(n.week)}${w && w.generated ? ` · brief ${fMD(w.generated)}` : ""}</div>`;
        }
        const cat = n.category || "marriott";
        html += `<article class="nitem">
          <div class="d"><span>${esc(n.date || "")}</span><span class="tag-cat tag-cat-${esc(cat)}">${esc(cat)}</span>${n.orlando ? '<span class="tag-orl">Orlando</span>' : ""}</div>
          <p>${esc(n.headline)}</p>
          <div class="s">${esc(n.source || "")}</div>
          ${n.url ? `<a class="nlink" href="${esc(n.url)}" target="_blank" rel="noopener">Read source</a>` : ""}
        </article>`;
      }
      list.innerHTML = html || `<p class="vo-empty">No headlines in this filter.</p>`;
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
    links.forEach((a) => { const s = $(a.getAttribute("href")); if (s) io.observe(s); });
  }
  /* boot */
  load().then(init).catch((e) => {
    console.error(e);
    $("#main").insertAdjacentHTML("afterbegin", '<p class="wrap" style="padding:24px">Data could not be loaded (data/comps.json).</p>');
  });
})();
