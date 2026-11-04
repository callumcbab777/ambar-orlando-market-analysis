/* AMBAR Orlando · events, visit and profile pages: mobile-only sticky "Visit AMBAR" bar.
   Shows on phones (<=760px) once the visitor has scrolled past the hero (.evh-grid); hides while the Visit AMBAR band
   (#evVisitBand), the events page Plan your visit teaser (#plan) or the Travel Concierge itinerary (#tcDays, so it never
   covers an item's Edit / move buttons; the itinerary has its own AMBAR visit item) is on screen; dismissible for the session.
   Never shown on desktop. No popups. */
(function () {
  "use strict";
  const bar = document.getElementById("evMbar");
  const hero = document.querySelector(".evh-grid");
  const band = document.getElementById("evVisitBand");
  const plan = document.getElementById("plan");
  const days = document.getElementById("tcDays");
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  const KEY = "ambar.visitbar.dismissed";
  const mq = window.matchMedia("(max-width: 760px)");
  const dismissed = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; } };
  const state = { pastHero: false, band: false, plan: false, itin: false };
  function update() {
    const show = mq.matches && !dismissed() && state.pastHero && !state.band && !state.plan && !state.itin;
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
  watch(days, "itin");
  (mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update));
  document.getElementById("evMbarX").addEventListener("click", () => {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* private mode: hide for this page view */ }
    bar.hidden = true; document.documentElement.classList.remove("has-mbar");
  });
  window.AMBAR_VISIT_BAR = { state, update };
})();
