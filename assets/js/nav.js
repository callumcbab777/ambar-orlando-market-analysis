/* AMBAR Orlando · header nav. Desktop: inline links. At ≤1180px the links fold into a "Menu" disclosure
   (no sideways-scrolling nav). Without JS the old scrollable nav is kept. */
(function () {
  "use strict";
  const header = document.querySelector(".site-header");
  const nav = header && header.querySelector(".site-nav");
  if (!nav) return;
  if (!nav.id) nav.id = "siteNav";
  document.documentElement.classList.add("has-navjs");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-controls", nav.id);
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<span class="nav-toggle-i" aria-hidden="true"><span></span></span><span class="nav-toggle-l">Menu</span>';
  nav.before(btn);
  const set = (open) => { header.classList.toggle("nav-open", open); btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", () => set(!header.classList.contains("nav-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && header.classList.contains("nav-open")) { set(false); btn.focus(); } });
  document.addEventListener("click", (e) => { if (!header.contains(e.target)) set(false); });
})();
