/* AMBAR Orlando · motion layer (KCOS-4).
   - cinematic hero: crossfading renderings with a slow Ken Burns, pause button, pauses off-screen
   - header: transparent over the hero, solid once you scroll
   - count-up hero stats, staggered card entrances, heat-map "chart" entrance
   - parallax on full-bleed image bands
   Nothing is hidden unless JS is running, and everything is static with prefers-reduced-motion. */
(function () {
  "use strict";
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) root.classList.add("no-motion");
  const hasIO = "IntersectionObserver" in window;
  const header = document.querySelector(".site-header");
  const hero = document.querySelector(".hero-cine");

  /* ---------- header over the cinematic hero ---------- */
  if (hero && header) {
    root.classList.add("has-cine");
    const onScroll = () => root.classList.toggle("cine-top", scrollY <= 40);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- cinematic hero slideshow ---------- */
  const cine = document.getElementById("cine");
  if (cine) {
    const slides = [...cine.querySelectorAll(".cine-slide")];
    const dots = [...document.querySelectorAll(".cine-dots span")];
    const btn = document.getElementById("cinePause");
    let cur = 0, timer = 0, paused = reduce, inView = true;
    const ready = new Set([0]);
    const hydrate = (i) => {
      const s = slides[i];
      s.querySelectorAll("[data-srcset]").forEach((el) => { el.srcset = el.dataset.srcset; el.removeAttribute("data-srcset"); });
      const img = s.querySelector("img");
      if (img && img.dataset.src) { img.src = img.dataset.src; img.removeAttribute("data-src"); }
      if (img) (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })).then(() => ready.add(i));
    };
    const show = (i) => {
      slides[cur].classList.remove("is-on"); slides[cur].setAttribute("aria-hidden", "true");
      cur = i;
      slides[cur].classList.add("is-on"); slides[cur].removeAttribute("aria-hidden");
      dots.forEach((d, j) => d.classList.toggle("is-on", j === cur));
    };
    const next = () => {
      for (let k = 1; k <= slides.length; k++) { const j = (cur + k) % slides.length; if (ready.has(j)) { if (j !== cur) show(j); break; } }
    };
    const run = () => { clearInterval(timer); if (!paused && inView && !document.hidden) timer = setInterval(next, 6500); };
    if (!reduce) {
      /* fetch the other renderings only after the page is up, so the first screen stays light */
      const later = () => setTimeout(() => slides.forEach((_, i) => i && hydrate(i)), 1200);
      if (document.readyState === "complete") later(); else addEventListener("load", later);
    }
    if (btn) {
      if (reduce) { btn.hidden = true; }
      btn.addEventListener("click", () => {
        paused = !paused;
        btn.setAttribute("aria-pressed", String(paused));
        btn.textContent = paused ? "Play" : "Pause";
        btn.setAttribute("aria-label", paused ? "Play the slideshow" : "Pause the slideshow");
        cine.classList.toggle("is-paused", paused);
        run();
      });
    }
    if (hasIO) new IntersectionObserver((e) => { inView = e[0].isIntersecting; run(); }).observe(cine);
    document.addEventListener("visibilitychange", run);
    run();
  }

  if (reduce || !hasIO) { document.querySelectorAll(".img-band").forEach((b) => b.classList.add("is-in")); return; }

  /* ---------- count-up hero stats (numbers only; text is restored exactly) ---------- */
  const countUp = () => {
    document.querySelectorAll(".hero-stats dd").forEach((dd, k) => {
      const node = [...dd.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!node) return;
      const m = node.textContent.match(/^(\s*\$?)([\d,]+)(\s*)$/);
      if (!m) return;
      const end = +m[2].replace(/,/g, ""), final = node.textContent;
      if (!end) return;
      const t0 = performance.now() + k * 90, dur = 1400;
      const step = (t) => {
        const p = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
        node.textContent = m[1] + Math.round(end * e).toLocaleString("en-US") + m[3];
        if (p < 1) requestAnimationFrame(step); else node.textContent = final;
      };
      requestAnimationFrame(step);
    });
  };
  const stats = document.getElementById("heroStats");
  if (stats) {
    if (stats.children.length) countUp();
    else new MutationObserver((_, mo) => { if (stats.children.length) { mo.disconnect(); countUp(); } }).observe(stats, { childList: true });
  }

  /* ---------- entrances ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -6% 0px" });
  const below = (el) => el.getBoundingClientRect().top > innerHeight * 0.9;
  const mark = (el, i) => { if (!below(el)) return; el.style.setProperty("--i", i % 6); el.classList.add("rv"); io.observe(el); };
  const HEAD = ".section .section-head, .section > .wrap > h2, .section .kicker";
  const CARDS = ".mstat, .rcard, .nh-card, .tweek, .ev-card, .evh-pick, .pf-card, .mo-root .card, .tier, .pl-routes li";
  const scan = (scope) => {
    scope.querySelectorAll(HEAD).forEach((el) => { if (!el.classList.contains("rv")) mark(el, 0); });
    const groups = new Map();
    scope.querySelectorAll(CARDS).forEach((el) => {
      if (el.classList.contains("rv") || el.dataset.rvSeen) return;
      el.dataset.rvSeen = "1";
      const n = groups.get(el.parentNode) || 0; groups.set(el.parentNode, n + 1);
      mark(el, n);
    });
    scope.querySelectorAll(".heat").forEach((t) => {
      if (t.classList.contains("rv-chart") || !below(t)) return;
      t.querySelectorAll("tbody tr").forEach((tr, r) => [...tr.querySelectorAll(".cell")].forEach((c, ci) => { c.style.setProperty("--c", ci); c.style.setProperty("--r", r); }));
      t.classList.add("rv-chart"); io.observe(t);
    });
  };
  /* content is rendered by the page scripts; scan once they have run, and again when lists re-render */
  const start = () => {
    scan(document);
    let q = 0;
    new MutationObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(() => scan(document)); })
      .observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => setTimeout(start, 60)); else setTimeout(start, 60);

  /* ---------- image bands: caption reveal + parallax ---------- */
  const bands = [...document.querySelectorAll(".img-band")];
  if (bands.length) {
    const vis = new Set();
    const bio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { vis.add(e.target); e.target.classList.add("is-in"); } else vis.delete(e.target);
    }), { rootMargin: "10% 0px" });
    bands.forEach((b) => bio.observe(b));
    let tick = 0;
    const frame = () => {
      tick = 0;
      vis.forEach((b) => {
        const r = b.getBoundingClientRect();
        const p = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight + r.height); /* -0.5 .. 0.5 */
        b.style.setProperty("--py", (p * -90).toFixed(1) + "px");
      });
    };
    addEventListener("scroll", () => { if (!tick) tick = requestAnimationFrame(frame); }, { passive: true });
    frame();
  }
})();
