/* AMBAR Orlando · Plan your visit page (visit/): Best time to visit row.
   Temperatures: NOAA NCEI 1991–2020 U.S. Climate Normals, Orlando Intl Airport (USW00012815), monthly normal
   max/min °F as published (rounded for display). Crowds: Theme Park Direct Orlando crowd calendar 1–5 monthly
   rating (1–2 low, 3 moderate, 4–5 high). Sources are cited on the page. Do not edit numbers without a source. */
(function () {
  "use strict";
  const NORMALS_F = [ /* [max, min] Jan..Dec */
    [71.8, 49.5], [74.9, 52.4], [78.9, 55.8], [83.6, 60.7], [88.4, 66.3], [90.8, 71.6],
    [92.0, 73.2], [91.6, 73.7], [89.6, 72.4], [84.7, 66.2], [78.3, 58.2], [73.8, 52.9],
  ];
  const CROWD_1_5 = [2, 2, 4, 4, 3, 4, 5, 3, 1, 3, 3, 5];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const level = (n) => (n <= 2 ? "low" : n === 3 ? "moderate" : "high");
  const r = (f) => Math.round(f);
  const c = (f) => Math.round(((f - 32) * 5) / 9);
  const box = document.getElementById("plMonths");
  if (box) {
    const now = new Date().getMonth();
    box.insertAdjacentHTML("beforeend", NORMALS_F.map(([hi, lo], i) => {
      const lv = level(CROWD_1_5[i]);
      return `<div class="pl-month${i === now ? " is-now" : ""}" role="row">
        <span class="pl-m" role="rowheader">${MON[i]}${i === now ? '<span class="sr-only"> (this month)</span>' : ""}</span>
        <span class="pl-t" role="cell"><b>${r(hi)}°</b><span class="pl-lo">/${r(lo)}°F</span><small>${c(hi)}°/${c(lo)}°C</small></span>
        <span class="pl-c pl-c-${lv}" role="cell"><i aria-hidden="true"></i>${lv[0].toUpperCase() + lv.slice(1)}</span>
      </div>`;
    }).join(""));
  }
  window.AMBAR_PLAN = { NORMALS_F, CROWD_1_5 };
})();
