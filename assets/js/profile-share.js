/* AMBAR Orlando · My Profile sharing, used on every page that offers "Share my profile":
   resolves a profile into readable sections (event titles from the Visit Orlando data, hotel names from
   data/comps.json, brand names from data/brands.json), and builds the share link and the branded PDF.
   Data files are loaded on demand from this repo (their .js mirrors, so file:// works). Nothing is sent anywhere.
   Empty sections are left out of the PDF and the link. */
(function () {
  "use strict";
  const P = window.AMBAR_PROFILE;
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res) => {
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => res(true); s.onerror = () => { delete loaded[src]; res(false); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function data(root) {
    await Promise.all([
      window.VO_EVENTS_DATA ? 1 : loadScript(root + "data/visitorlando_events.js"),
      window.COMPS_DATA ? 1 : loadScript(root + "data/comps.js"),
      window.AMBAR_BRANDS ? 1 : loadScript(root + "data/brands.js"),
    ]);
    const ev = new Map(((window.VO_EVENTS_DATA || {}).events || []).map((e) => [String(e.id), e]));
    const hotels = new Map(((window.COMPS_DATA || {}).hotels || []).map((h) => [h.id, h]));
    const brands = window.AMBAR_BRANDS || { parents: [] };
    const brandById = new Map();
    for (const p of brands.parents) for (const b of p.brands) brandById.set(b.id, { ...b, parent: p.name, parentId: p.id });
    return { ev, hotels, brands, brandById, bIdx: P.brandIndex(brands) };
  }
  const D = (iso) => new Date(iso + "T12:00:00");
  const fMD = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fMDY = (iso) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const range = (s, e) => (!s ? "" : s === e || !e ? fMDY(s) : s.slice(0, 4) === e.slice(0, 4) ? `${fMD(s)} – ${fMDY(e)}` : `${fMDY(s)} – ${fMDY(e)}`);
  const VO_URL = /^https:\/\/www\.visitorlando\.com\//;
  const areaOf = (e) => { const c = String(e.city || "").replace(/,\s*FL$/i, "").trim(); return c ? (c === c.toUpperCase() ? c.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : c) : ""; };
  const PARTY = { solo: "Just me", couple: "Couple", group: "Friends / group", family: "Family with kids" };
  function prefsLines(p) {
    if (!p) return [];
    const out = [];
    if (p.cats.length) out.push(["Interests", p.cats.join(", ")]);
    if (p.areas.length) out.push(["Areas", p.areas.join(", ")]);
    if (p.from || p.to) out.push(["Dates", `${p.from ? fMDY(p.from) : "Any time"} – ${p.to ? fMDY(p.to) : "open"}`]);
    if (p.budget === "free") out.push(["Budget", "Free events only"]);
    if (p.party !== "any") out.push(["Who’s going", PARTY[p.party]]);
    if (p.keywords.length) out.push(["Keywords", p.keywords.join(", ")]);
    if (p.access) out.push(["Accessibility", "Prefer accessibility-focused listings"]);
    return out;
  }
  /* readable sections; hotels and brands not in the current data are dropped */
  function sections(profile, d) {
    const out = [];
    const evs = profile.events.map((s) => {
      const e = d.ev.get(s.id);
      const src = e || s;
      const loc = [src.location, e ? areaOf(e) : s.area].filter(Boolean).join(" · ");
      return { id: s.id, title: src.title || "Saved event", dates: range(src.start_date, src.end_date) || "Date unknown", location: loc, url: VO_URL.test(src.url || "") ? src.url : "https://www.visitorlando.com/events/", end_date: src.end_date || "", listed: !!e };
    }).sort((a, b) => (a.end_date || "9").localeCompare(b.end_date || "9"));
    if (evs.length) out.push({ key: "events", kicker: "Visit Orlando", heading: "Saved events", entries: evs });
    const hs = profile.hotels.map((id) => d.hotels.get(id)).filter(Boolean).map((h) => ({ id: h.id, title: h.name, dates: h.brand || "", location: [h.area, h.address].filter(Boolean).join(" · ") }));
    if (hs.length) out.push({ key: "hotels", kicker: "Market landscape", heading: "Favourite hotels", entries: hs });
    const byParent = new Map();
    for (const id of profile.brands) { const b = d.brandById.get(id); if (!b) continue; if (!byParent.has(b.parent)) byParent.set(b.parent, []); byParent.get(b.parent).push(b); }
    const bs = [...byParent.entries()].map(([parent, list]) => ({ title: parent, dates: `${list.length} brand${list.length === 1 ? "" : "s"}`, location: list.map((b) => b.name).join(", "), ambar: list.some((b) => b.ambar) }));
    if (bs.length) out.push({ key: "brands", kicker: "Hotel brands", heading: "Brands I know", note: `Brands with Orlando-area hotels, verified as of ${d.brands.as_of ? fMDY(d.brands.as_of) : "the date shown on the site"}.`, entries: bs });
    const pl = prefsLines(profile.prefs);
    if (pl.length) out.push({ key: "prefs", kicker: "Events", heading: "My preferences", entries: pl.map(([k, v]) => ({ title: v, dates: k })) });
    return out;
  }
  const genDate = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const profileBase = (root) => new URL(root + "profile/index.html", location.href).href.replace(/index\.html$/, "");
  async function url(root, profile) { const d = await data(root); return P.shareUrl(profileBase(root), profile, d.bIdx); }
  function summary(secs) {
    const n = (k) => (secs.find((s) => s.key === k) || { entries: [] }).entries.length;
    const bits = [];
    if (n("events")) bits.push(`${n("events")} event${n("events") === 1 ? "" : "s"}`);
    if (n("hotels")) bits.push(`${n("hotels")} hotel${n("hotels") === 1 ? "" : "s"}`);
    const nb = secs.find((s) => s.key === "brands");
    if (nb) { const c = nb.entries.reduce((t, e) => t + Number(e.dates.split(" ")[0]), 0); bits.push(`${c} brand${c === 1 ? "" : "s"}`); }
    if (n("prefs")) bits.push("preferences");
    return bits.join(" · ");
  }
  async function pdf(root, profile, opts = {}) {
    const d = await data(root);
    const secs = sections(profile, d);
    if (!secs.length) throw new Error("empty");
    const link = P.shareUrl(profileBase(root), profile, d.bIdx);
    await window.AMBAR_EV_PDF.download(root, secs, {
      title: opts.title || "My Orlando profile",
      generated: genDate(),
      subtitle: `${summary(secs)}  ·  Generated ${genDate()}`,
      pageUrl: link,
      footnote: "Events from the Visit Orlando calendar; hotels and brands from the AMBAR Orlando site. Check each listing for times, prices and changes.",
    }, opts.filename || `my-orlando-profile-${new Date().toISOString().slice(0, 10)}.pdf`);
    return secs;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } ta.remove(); return ok;
    }
  }
  /* wire a share bar: { pdf, copy, native, status } element ids, a getter for the profile and the root */
  function wire(root, ids, getProfile, title) {
    const $ = (id) => document.getElementById(id);
    const status = (m) => { if ($(ids.status)) $(ids.status).textContent = m; };
    if ($(ids.native)) $(ids.native).hidden = typeof navigator.share !== "function";
    $(ids.pdf) && $(ids.pdf).addEventListener("click", async () => {
      status("Preparing your PDF…");
      try { await pdf(root, getProfile(), { title }); status("PDF downloaded. Attach it to a message, or use the share link."); }
      catch (e) { status(e && e.message === "empty" ? "Your profile is empty, so there’s nothing to put in a PDF yet." : "Sorry, the PDF couldn’t be created here. Use your browser’s Print → Save as PDF instead."); }
    });
    $(ids.copy) && $(ids.copy).addEventListener("click", async () => {
      const u = await url(root, getProfile());
      status((await copyText(u)) ? "Link copied. Anyone who opens it sees a read-only copy of this profile." : `Copy this link: ${u}`);
    });
    $(ids.native) && $(ids.native).addEventListener("click", async () => {
      const u = await url(root, getProfile());
      try { await navigator.share({ title: title || "My Orlando profile", text: "My Orlando profile: saved events, hotels and brands", url: u }); status("Shared."); }
      catch (e) { if (e && e.name !== "AbortError") status("Sharing isn’t available here. Use Copy share link instead."); }
    });
  }
  window.AMBAR_PROFILE_SHARE = { data, sections, prefsLines, url, pdf, wire, copyText, summary, profileBase };
})();
