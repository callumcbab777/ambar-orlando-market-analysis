/* AMBAR Orlando · My Profile page (profile/).
   Shows everything in the shared profile store (assets/js/profile.js): saved events, favourite hotels, hotel brands
   and event preferences, with remove buttons, share (PDF, link, share sheet) and Clear. A ?p= link opens a read-only
   copy of someone else's profile with one "Save to my profile" button (merge; your own items win).
   Names come from this repo's data files; unknown ids in a link are dropped and counted, never shown. */
(function () {
  "use strict";
  const P = window.AMBAR_PROFILE, S = window.AMBAR_PROFILE_SHARE;
  if (!P || !S) return;
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const EDIT = {
    events: { href: ROOT + "events/#events", label: "Browse Orlando events", empty: "No saved events yet." },
    hotels: { href: ROOT + "index.html#hotels", label: "Star hotels on the market page", empty: "No favourite hotels yet." },
    brands: { href: ROOT + "index.html#familiar", label: "Pick the brands you know", empty: "No brands picked yet." },
    prefs: { href: ROOT + "events/#preferences", label: "Set your event preferences", empty: "No preferences set yet." },
  };
  const HEAD = { events: "Saved events", hotels: "Favourite hotels", brands: "Brands I know", prefs: "Preferences" };
  let D = null;

  function brandsHtml(ids, editable, other) {
    const byParent = new Map();
    for (const id of ids) { const b = D.brandById.get(id); if (!b) continue; if (!byParent.has(b.parent)) byParent.set(b.parent, []); byParent.get(b.parent).push(b); }
    return [...byParent.entries()].map(([parent, list]) => `<li class="pf-brand-group"><b class="pf-item-t">${esc(parent)}</b>
      <ul class="pf-chips">${list.map((b) => `<li class="pf-chip${b.ambar ? " is-ambar" : ""}">${esc(b.name)}${b.ambar ? ` <small>· home of AMBAR Orlando</small>` : ""}${editable ? ` <button type="button" class="pf-x" data-rm-brand="${esc(b.id)}" aria-label="Remove ${esc(b.name)} from My Profile">×</button>` : ""}</li>`).join("")}</ul></li>`).join("")
      + (other ? `<li class="pf-brand-group pf-brand-other"><b class="pf-item-t">Other</b> <small class="pf-other-note">not on the list</small>
      <ul class="pf-chips"><li class="pf-chip">${esc(other)}${editable ? ` <button type="button" class="pf-x" data-rm-other="1" aria-label="Remove ${esc(other)} from My Profile">×</button>` : ""}</li></ul></li>` : "");
  }
  function sectionHtml(key, sec, profile, editable) {
    const e = EDIT[key];
    let items = "";
    const FH = window.AMBAR_FAV_HOTELS;
    if (key === "brands") items = brandsHtml(profile.brands, editable, profile.other_brand || "");
    else if (key === "hotels" && FH && D.db && profile.hotels.length) {
      /* favourite hotels with their own rates from the comps data; "Not collected" where there are none */
      const sum = FH.summarizeAll(D.db, profile.hotels);
      items = sum.hotels.length || sum.missing.length ? `<li class="pf-fh">${FH.panelHtml(sum, { root: ROOT, rm: editable, headingLevel: 4, idSuffix: editable ? "" : "-s" })}</li>` : "";
      if (!sum.hotels.length && !sum.missing.length) items = "";
    }
    else if (sec) items = sec.entries.map((x) => {
      const rm = !editable ? "" : key === "events" ? `<button type="button" class="pf-x" data-rm-event="${esc(x.id)}" aria-label="Remove ${esc(x.title)} from My Profile">×</button>`
        : key === "hotels" ? `<button type="button" class="pf-x" data-rm-hotel="${esc(x.id)}" aria-label="Remove ${esc(x.title)} from favourite hotels">×</button>` : "";
      const title = x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}<span class="sr-only"> (Visit Orlando, opens in a new tab)</span></a>` : esc(x.title);
      const meta = [x.dates, x.location].filter(Boolean).map(esc).join(" · ");
      const gone = key === "events" && x.listed === false ? ` <span class="pf-gone">no longer listed</span>` : "";
      return `<li class="pf-item"><div><b class="pf-item-t">${title}</b>${gone}${meta ? `<span class="pf-item-m">${meta}</span>` : ""}</div>${rm}</li>`;
    }).join("");
    const has = !!items;
    if (!has && !editable) return "";
    const note = key === "brands" && has ? `<p class="pf-note">Brands with Orlando-area hotels, verified as of ${esc(D.brands.as_of ? new Date(D.brands.as_of + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "the date shown on the site")}.</p>` : "";
    const fhNote = key === "hotels" && has && D.db ? `<p class="pf-note">Lowest public nightly rates observed on the market page’s snapshot dates (not ADR, not a quote). “Not collected” means there is no figure for that night or week.</p>` : "";
    const actions = editable ? `<p class="pf-sec-actions"><a href="${esc(e.href)}">${esc(e.label)}</a>${key === "prefs" ? ` <a href="#preferences">Edit trip preferences</a>` : ""}${key === "prefs" && has ? ` <button type="button" class="ev-link-btn" data-clear-prefs>Clear preferences</button>` : ""}</p>` : "";
    return `<section class="pf-sec pf-sec-${key}" aria-labelledby="pf-h-${key}${editable ? "" : "-s"}">
      <h3 id="pf-h-${key}${editable ? "" : "-s"}">${HEAD[key]}${has && key !== "prefs" ? ` <span class="pf-n">${key === "brands" ? profile.brands.filter((id) => D.brandById.has(id)).length + (profile.other_brand ? 1 : 0) : sec.entries.length}</span>` : ""}</h3>
      ${has ? `${note}${fhNote}<ul class="pf-list">${items}</ul>` : `<p class="pf-empty">${esc(e.empty)}</p>`}${actions}</section>`;
  }
  function render(profile, editable) {
    const secs = S.sections(profile, D);
    const by = Object.fromEntries(secs.map((s) => [s.key, s]));
    return ["events", "hotels", "brands", "prefs"].map((k) => sectionHtml(k, by[k], profile, editable)).join("");
  }
  function paintMine() {
    const p = P.get();
    const secs = S.sections(p, D);
    $("pfSections").innerHTML = render(p, true);
    $("pfShare").hidden = !secs.length;
    $("pfClear").hidden = P.isEmpty(p);
    $("pfSummary").textContent = secs.length ? `In your profile: ${S.summary(secs)}.` : "Your profile is empty for now. Save an event, star a hotel or pick the brands you know to start it.";
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-rm-event],[data-rm-hotel],[data-rm-brand],[data-rm-other],[data-clear-prefs]");
    if (!t || !$("pfSections").contains(t)) return;
    const status = (m) => { $("pfStatus").textContent = m; };
    if (t.dataset.rmEvent) { P.removeEvent(t.dataset.rmEvent); status("Event removed."); }
    else if (t.dataset.rmHotel) { P.toggleHotel(t.dataset.rmHotel); status("Hotel removed from favourites."); }
    else if (t.dataset.rmBrand) { P.setBrands(P.get().brands.filter((b) => b !== t.dataset.rmBrand)); status("Brand removed."); }
    else if (t.dataset.rmOther) { P.setOtherBrand(""); status("Other brand removed."); }
    else { P.clearPrefs(); P.clearTrip(); status("Preferences cleared."); }
    $("pfMineTitle").setAttribute("tabindex", "-1");
    $("pfMineTitle").focus();
  });
  $("pfClear").addEventListener("click", () => {
    if (!window.confirm("Clear your whole profile? This removes saved events, favourite hotels, brands and preferences from this browser.")) return;
    P.clearAll();
    $("pfStatus").textContent = "Your profile has been cleared.";
  });

  function sharedView(param) {
    const known = { events: new Set(D.ev.keys()), hotels: new Set(D.hotels.keys()), brands: D.bIdx };
    const { profile, unknown } = P.decode(param, known);
    $("pfShared").hidden = false;
    if (P.isEmpty(profile)) {
      $("pfSharedBody").innerHTML = `<p class="pf-empty">This link has nothing we can show${unknown ? ` (${plural(unknown, "item")} no longer listed or not recognised)` : ""}.</p>`;
      $("pfSaveShared").hidden = true;
      return;
    }
    $("pfSharedBody").innerHTML = render(profile, false);
    if (unknown) $("pfSharedSub").textContent += ` ${plural(unknown, "item")} in the link ${unknown === 1 ? "was" : "were"} left out because ${unknown === 1 ? "it is" : "they are"} no longer listed or not recognised.`;
    $("pfSaveShared").addEventListener("click", () => {
      /* keep a readable snapshot of each event so it still shows if the listing later disappears */
      const snap = { ...profile, events: profile.events.map((s) => { const e = D.ev.get(s.id) || {}; return { id: s.id, title: e.title || "", url: e.url || "", start_date: e.start_date || "", end_date: e.end_date || "", location: e.location || "", area: "", saved_at: new Date().toISOString() }; }) };
      P.set(P.merge(P.get(), snap));
      $("pfSaveShared").disabled = true;
      $("pfSaveShared").textContent = "Saved to my profile";
      $("pfSharedStatus").textContent = "Saved. Anything you already had stays as it was.";
    });
  }

  S.data(ROOT).then((d) => {
    D = d;
    paintMine();
    P.subscribe(paintMine);
    S.wire(ROOT, { pdf: "pfPdf", copy: "pfCopy", native: "pfNative", status: "pfStatus" }, () => P.get(), "My Orlando profile");
    const param = new URLSearchParams(location.search).get("p");
    if (param) sharedView(param);
  });
})();
