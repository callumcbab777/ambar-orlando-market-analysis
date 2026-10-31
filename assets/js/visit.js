/* AMBAR Orlando · Plan your visit page.
   The page headline lives in ONE constant: change HEADLINE below to swap it (the same words are in
   visit/index.html as the no-JavaScript fallback; tests/test_round3.py checks the two match).
   Options proposed alongside the default: "Every Road Leads Home to AMBAR", "Fly, Ride or Drive — Arrive at AMBAR",
   "From Gatwick to Kissimmee: Your Way to AMBAR". */
(function () {
  "use strict";
  const HEADLINE = "All Roads Lead to AMBAR";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const h1 = document.getElementById("visitHeadline");
  if (h1) {
    /* "AMBAR" (or the last word) is set in the italic accent line, like the events hero */
    const i = HEADLINE.lastIndexOf("AMBAR");
    const cut = i > 0 ? i : HEADLINE.lastIndexOf(" ") + 1;
    h1.innerHTML = `${esc(HEADLINE.slice(0, cut).trim())} <em>${esc(HEADLINE.slice(cut))}</em>`;
    document.title = `${HEADLINE} · Plan your visit · AMBAR Orlando`;
  }
  window.AMBAR_VISIT = { HEADLINE };
})();
