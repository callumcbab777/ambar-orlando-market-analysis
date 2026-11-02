/* AMBAR Orlando · events, visit and profile pages: mobile-only sticky "Visit AMBAR" bar.
   Shows on phones (<=760px) once the visitor has scrolled past the hero (.evh-grid); hides while the Visit AMBAR band
   (#evVisitBand) or the events page Plan your visit teaser (#plan) is on screen; dismissible for the session.
   Never shown on desktop. No popups. */
(function () {
  "use strict";
  const bar = document.getElementById("evMbar");
  const hero = document.querySelector(".evh-grid");
  const band = document.getElementById("evVisitBand");
  const plan = document.getElementById("plan");
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  const KEY = "ambar.visitbar.dismissed";
  const mq = window.matchMedia("(max-width: 760px)");
  const dismissed = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
  const state = { pastHero: false, band: false, plan: false };
  function update() {
    const show = mq.matches && !dismissed() && state.pastHero && !state.band && !state.plan;
    if (show === !bar.hidden) return;
    bar.hidden = !show;
    document.documentElement.classList.toggle("has-mbar", show);
  }
  new IntersectionObserver((es) => {
    es.forEach((e) => { state.pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; });
    update();
  }).observe(hero);
  const watch = (el, k) => el && new IntersectionObserver((es) => { es.forEach((e) => { state[k] = e.isIntersecting; }); update(); }).observe(el);
  watch(band, "band");
  watch(plan, "plan");
  (mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update));
  document.getElementById("evMbarX").addEventListener("click", () => {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* private mode: hide for this page view */ }
    bar.hidden = true; document.documentElement.classList.remove("has-mbar");
  });
  window.AMBAR_VISIT_BAR = { state, update };
})();
