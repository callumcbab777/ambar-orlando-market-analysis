/* AMBAR Orlando · "All Roads Lead to AMBAR" animated globe (visit page hero).
   A canvas orthographic globe (d3-geo + Natural Earth 110m land, bundled in assets/vendor/globe/) that turns slowly
   while great-circle arcs from the international and domestic origin markets listed on this page pulse toward
   Orlando. Pauses when off screen or the tab is hidden; under prefers-reduced-motion it draws one still frame.
   If canvas, the libraries or the land data are missing, nothing changes and the static SVG route map stays.
   Airport coordinates are approximate (city airport reference points). */
(function () {
  "use strict";
  const fig = document.querySelector(".vh-art");
  const d3 = window.d3, topo = window.topojson, land110 = window.AMBAR_LAND_110M;
  if (!fig || !d3 || !d3.geoOrthographic || !topo || !land110) return;
  const cv = document.createElement("canvas");
  if (!cv.getContext) return;
  const ctx = cv.getContext("2d");
  const ORL = [-81.308, 28.431];
  /* origin markets shown on this page: [label, lon, lat, group] */
  const ORIG = [
    ["London", -0.19, 51.15, "intl"], ["Manchester", -2.27, 53.35, "intl"], ["Edinburgh", -3.37, 55.95, "intl"],
    ["Dublin", -6.27, 53.42, "intl"], ["Paris", 2.55, 49.01, "intl"], ["Frankfurt", 8.57, 50.03, "intl"],
    ["Munich", 11.79, 48.35, "intl"], ["Madrid", -3.57, 40.47, "intl"], ["Lisbon", -9.13, 38.77, "intl"],
    ["Amsterdam", 4.76, 52.31, "intl"], ["Reykjavik", -22.6, 63.98, "intl"], ["Toronto", -79.62, 43.68, "intl"],
    ["Montreal", -73.74, 45.47, "intl"], ["São Paulo", -46.47, -23.43, "intl"], ["Mexico City", -99.07, 19.44, "intl"],
    ["Dubai", 55.36, 25.25, "intl"],
    ["Atlanta", -84.43, 33.64, "dom"], ["San Juan", -66.0, 18.44, "dom"], ["Chicago", -87.9, 41.98, "dom"],
    ["Newark", -74.17, 40.69, "dom"], ["Philadelphia", -75.24, 39.87, "dom"], ["Dallas", -97.04, 32.9, "dom"],
    ["New York", -73.87, 40.77, "dom"], ["Denver", -104.67, 39.86, "dom"], ["Charlotte", -80.94, 35.21, "dom"],
  ];
  const LABELS = new Set(["London", "Toronto", "São Paulo", "Dubai", "Denver", "Mexico City", "San Juan"]);
  const land = topo.feature(land110, land110.objects.land);
  const arcs = ORIG.map(([name, lon, lat, g], i) => ({ name, g, from: [lon, lat], interp: d3.geoInterpolate([lon, lat], ORL), phase: (i * 0.137) % 1 }));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const grat = d3.geoGraticule10();
  const C = { sea: "#2E4E57", sea2: "#1E3A40", land: "#5A5A37", landLine: "rgba(244,239,231,.22)", grat: "rgba(244,239,231,.09)", arcI: "#FFA94A", arcD: "#F4EFE7", dot: "#FFA94A", pin: "#FFA94A", text: "#F4EFE7", rim: "#B37D50" };
  let W = 0, R = 0, dpr = 1, lon0 = 20, running = false, raf = 0, last = 0, visible = true;

  /* the globe swings between Europe-facing and America-facing views around Orlando */
  function rotFor(t) { return [-(ORL[0] + 28 * Math.sin(t / 9000)) - 8, -22]; }

  function size() {
    const box = fig.getBoundingClientRect();
    W = Math.max(220, Math.min(520, Math.round(box.width || 360)));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = W * dpr;
    cv.style.width = W + "px"; cv.style.height = W + "px";
    R = W / 2 - 6;
    proj.translate([W / 2, W / 2]).scale(R);
  }
  function visiblePt(p) { const r = proj.rotate(); return d3.geoDistance(p, [-r[0], -r[1]]) < Math.PI / 2 - 0.02; }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    proj.rotate(rotFor(t));
    /* ocean disc */
    const g = ctx.createRadialGradient(W * 0.38, W * 0.32, R * 0.1, W / 2, W / 2, R);
    g.addColorStop(0, C.sea); g.addColorStop(1, C.sea2);
    ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); path(grat); ctx.strokeStyle = C.grat; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = C.land; ctx.fill(); ctx.strokeStyle = C.landLine; ctx.lineWidth = 0.6; ctx.stroke();
    /* arcs, with a travelling pulse toward Orlando */
    for (const a of arcs) {
      const line = { type: "LineString", coordinates: d3.range(0, 1.0001, 1 / 48).map(a.interp) };
      ctx.beginPath(); path(line);
      ctx.strokeStyle = a.g === "intl" ? "rgba(255,169,74,.45)" : "rgba(244,239,231,.38)";
      ctx.lineWidth = a.g === "intl" ? 1.2 : 1; ctx.stroke();
      const k = reduce ? 0.85 : ((t / 4200 + a.phase) % 1);
      const seg = { type: "LineString", coordinates: d3.range(Math.max(0, k - 0.14), k + 0.0001, 0.02).map(a.interp) };
      ctx.beginPath(); path(seg); ctx.strokeStyle = a.g === "intl" ? C.arcI : C.arcD; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.stroke();
      if (visiblePt(a.from)) {
        const [x, y] = proj(a.from);
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 2 * Math.PI); ctx.fillStyle = a.g === "intl" ? C.dot : C.arcD; ctx.fill();
        if (LABELS.has(a.name) && W >= 300) {
          ctx.font = "600 10.5px 'DM Sans', system-ui, sans-serif"; ctx.fillStyle = C.text; ctx.globalAlpha = 0.85;
          /* labels flip to the left on the right half (keeps them inside the rim), and for Mexico City so it clears the AMBAR tag */
          const left = a.name === "Mexico City" || x > W * 0.62;
          ctx.textAlign = left ? "right" : "left";
          ctx.fillText(a.name, left ? x - 5 : x + 5, y - 4); ctx.globalAlpha = 1; ctx.textAlign = "left";
        }
      }
    }
    /* Orlando / AMBAR pin with a soft pulse */
    if (visiblePt(ORL)) {
      const [x, y] = proj(ORL);
      const pulse = reduce ? 0.5 : (t / 1600) % 1;
      ctx.beginPath(); ctx.arc(x, y, 6 + 16 * pulse, 0, 2 * Math.PI); ctx.strokeStyle = `rgba(255,169,74,${0.7 * (1 - pulse)})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 2 * Math.PI); ctx.fillStyle = C.pin; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 2 * Math.PI); ctx.fillStyle = "#010101"; ctx.fill();
      ctx.font = "italic 500 " + (W >= 300 ? 22 : 17) + "px 'Cormorant Garamond', Georgia, serif"; ctx.fillStyle = C.text;
      ctx.fillText("AMBAR", x + 10, y + 22);
    }
    ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = C.rim; ctx.lineWidth = 1.4; ctx.stroke();
  }
  function loop(ts) {
    if (!running) return;
    if (ts - last > 33) { draw(ts); last = ts; } /* ~30 fps is plenty for a slow turn */
    raf = requestAnimationFrame(loop);
  }
  function start() { if (reduce || running || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  try {
    const wrap = document.createElement("div");
    wrap.className = "vh-globe";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "A turning globe with flight routes from London, Manchester, Edinburgh, Dublin, Paris, Frankfurt, Munich, Madrid, Lisbon, Amsterdam, Reykjavik, Toronto, Montreal, São Paulo, Mexico City, Dubai and the ten busiest US markets converging on Orlando, where AMBAR is.");
    wrap.appendChild(cv);
    const cap = document.createElement("p");
    cap.className = "vh-globe-key";
    cap.innerHTML = '<span class="k-intl">International routes</span><span class="k-dom">Top US routes</span>';
    wrap.appendChild(cap);
    fig.appendChild(wrap);
    size();
    draw(performance.now());
    fig.classList.add("has-globe");
    window.addEventListener("resize", () => { size(); draw(performance.now()); }, { passive: true });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.05 }).observe(wrap);
    }
    start();
    window.AMBAR_GLOBE = { draw, start, stop, ORIG };
  } catch (e) {
    fig.classList.remove("has-globe"); /* keep the static map */
  }
})();
