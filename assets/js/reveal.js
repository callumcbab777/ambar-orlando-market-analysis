/* KCOS-4 · subtle reveal for section headings. Nothing is hidden by default: headings fade up
   once as they scroll into view; skipped with reduced motion or without IntersectionObserver. */
(function () {
  "use strict";
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = document.querySelectorAll(".section .section-head, .section h2, .section .kicker");
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px 12% 0px" });
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return; /* already on screen: no animation */
    el.classList.add("rv"); io.observe(el);
  });
})();
