/* AMBAR Orlando · main page section 02 "Which hotel brands are you most familiar with?"
   Data: data/brands.json (mirrored as data/brands.js → window.AMBAR_BRANDS), only brands verified with an open
   Orlando-area hotel, with an as-of date and a source per brand. Picking a company (checkbox) reveals its brands;
   each company has a tri-state "Select all". Brand picks are saved to My Profile (assets/js/profile.js).
   Unticking a company hides its brands and removes them from My Profile; ticking it again within the same visit
   brings the previous picks back. Native checkboxes throughout, so keyboard and screen readers work as expected.
   The last tile, "Other", reveals a short text field ("Brand not listed? Tell us."); the typed brand is cleaned and
   capped at 60 characters by AMBAR_PROFILE.cleanOther and saved to My Profile as other_brand. */
(function () {
  "use strict";
  const B = window.AMBAR_BRANDS, P = window.AMBAR_PROFILE, box = document.getElementById("famBox");
  if (!box) return;
  if (!B || !P) { box.innerHTML = '<p class="fam-empty">The brand list could not be loaded.</p>'; return; }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const asOf = fDate(B.as_of);
  const parents = B.parents;
  const idsOf = (p) => p.brands.map((b) => b.id);
  const remembered = {};   // parent id -> brand ids picked before the company was unticked (this visit only)
  const open = new Set(parents.filter((p) => idsOf(p).some((id) => P.hasBrand(id))).map((p) => p.id));
  const O = Object.assign({ label: "Other", prompt: "Brand not listed? Tell us.", placeholder: "Your favourite brand", max: 60 }, B.other || {});
  const MAX = Math.min(Number(O.max) || 60, P.OTHER_MAX || 60);
  let otherOpen = !!P.get().other_brand, otherBack = "";

  box.innerHTML = `
    <fieldset class="fam-parents">
      <legend class="fam-legend">Hotel companies with brands in the Orlando area <span>Select all that apply</span></legend>
      <ul class="fam-plist">${parents.map((p) => `
        <li><label class="fam-ptile">
          <input type="checkbox" class="fam-pcheck" data-parent="${p.id}" aria-controls="fam-panel-${p.id}" aria-describedby="fam-pb-${p.id}">
          <span class="fam-pbox" aria-hidden="true"></span>
          <span class="fam-ptext"><b>${esc(p.name)}</b><small id="fam-pb-${p.id}">${p.brands.length} brand${p.brands.length === 1 ? "" : "s"}${p.brands.some((b) => b.ambar) ? " · includes AMBAR’s brand" : ""}</small></span>
          <span class="fam-pcount" data-pcount="${p.id}" aria-hidden="true"></span>
        </label></li>`).join("")}
        <li><label class="fam-ptile fam-ptile-other">
          <input type="checkbox" class="fam-pcheck" id="famOtherCheck" data-other="1" aria-controls="fam-panel-other" aria-describedby="fam-pb-other">
          <span class="fam-pbox" aria-hidden="true"></span>
          <span class="fam-ptext"><b>${esc(O.label)}</b><small id="fam-pb-other">${esc(O.prompt)}</small></span>
          <span class="fam-pcount" data-pcount="other" aria-hidden="true"></span>
        </label></li>
      </ul>
    </fieldset>
    <p class="fam-summary" id="famSummary" role="status" aria-live="polite"></p>
    <div class="fam-panels">${parents.map((p) => `
      <fieldset class="fam-panel" id="fam-panel-${p.id}" hidden>
        <legend class="fam-plegend">${esc(p.name)} <span>${p.brands.length} brand${p.brands.length === 1 ? "" : "s"} in the Orlando area</span></legend>
        <p class="fam-blurb">${esc(p.blurb)}${p.note ? ` ${esc(p.note)}` : ""}</p>
        ${p.brands.length > 1 ? `<label class="fam-all"><input type="checkbox" data-all="${p.id}"> <span>Select all ${p.brands.length}</span></label>` : ""}
        <ul class="fam-blist">${p.brands.map((b) => `
          <li class="${b.ambar ? "is-ambar" : ""}"><label class="fam-brand">
            <input type="checkbox" value="${esc(b.id)}" data-brand-of="${p.id}"${b.ambar ? ` aria-describedby="fam-tag-${b.id}"` : ""}>
            <span class="fam-bbox" aria-hidden="true"></span>
            <span class="fam-btext"><b>${esc(b.name)}</b>${b.ambar ? `<span class="fam-tag" id="fam-tag-${b.id}">${esc(b.tag)}</span>` : ""}<small>e.g. ${esc(b.example)}</small></span>
          </label><a class="fam-src" href="${esc(b.source_url)}" target="_blank" rel="noopener">Source<span class="sr-only"> for ${esc(b.name)} (opens in a new tab)</span></a></li>`).join("")}
        </ul>
        ${p.link ? `<p class="fam-plink"><a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name.split(" · ")[0])} hotels in Orlando<span class="sr-only"> (official site, opens in a new tab)</span></a></p>` : ""}
      </fieldset>`).join("")}
      <div class="fam-panel fam-other" id="fam-panel-other" hidden>
        <label class="fam-other-l" for="famOtherInput">${esc(O.prompt)}</label>
        <div class="fam-other-row">
          <input type="text" id="famOtherInput" class="fam-other-in" maxlength="${MAX}" placeholder="${esc(O.placeholder)}" autocomplete="off" spellcheck="false" aria-describedby="famOtherHint">
          <button type="button" class="fam-other-save" id="famOtherSave">Save</button>
        </div>
        <p class="fam-other-hint" id="famOtherHint">Up to ${MAX} characters. Letters, numbers and simple punctuation only. Saved to My Profile on this browser.</p>
      </div>
    </div>
    <details class="fam-more">
      <summary>How this list was checked, and brands left out</summary>
      <p>${esc(B.area)} ${esc(B.method)} Verified as of ${asOf}.</p>
      <ul>${(B.not_included || []).map((n) => `<li><b>${esc(n.name)}</b> (${esc(n.parent)}): ${esc(n.reason)}</li>`).join("")}</ul>
    </details>
    <p class="fam-asof">Brands verified as of ${asOf} against official brand and hotel sites. Marriott brand names match the <a href="#brands">brand matrix</a>.</p>`;

  const $$ = (s) => [...box.querySelectorAll(s)];
  const pick = (pid) => $$(`input[data-brand-of="${pid}"]`);
  function paint() {
    const saved = new Set(P.get().brands);
    let total = 0, cos = 0;
    for (const p of parents) {
      const isOpen = open.has(p.id);
      const pc = box.querySelector(`[data-parent="${p.id}"]`);
      pc.checked = isOpen;
      document.getElementById("fam-panel-" + p.id).hidden = !isOpen;
      const boxes = pick(p.id);
      boxes.forEach((c) => { c.checked = saved.has(c.value); });
      const n = boxes.filter((c) => c.checked).length;
      const all = box.querySelector(`[data-all="${p.id}"]`);
      if (all) { all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
      box.querySelector(`[data-pcount="${p.id}"]`).textContent = n ? String(n) : "";
      pc.closest(".fam-ptile").classList.toggle("has-picks", n > 0);
      total += n; if (n) cos++;
    }
    const other = P.get().other_brand || "";
    const oc = document.getElementById("famOtherCheck"), oi = document.getElementById("famOtherInput");
    oc.checked = otherOpen;
    document.getElementById("fam-panel-other").hidden = !otherOpen;
    if (document.activeElement !== oi) oi.value = other;
    box.querySelector('[data-pcount="other"]').textContent = other ? "1" : "";
    oc.closest(".fam-ptile").classList.toggle("has-picks", !!other);
    if (other) { total++; cos++; }
    return { total, cos };
  }
  function announce(msg) {
    const { total, cos } = paint();
    const base = total ? `${total} brand${total === 1 ? "" : "s"} across ${cos} compan${cos === 1 ? "y" : "ies"} saved to My Profile.` : "No brands picked yet.";
    document.getElementById("famSummary").innerHTML = `${msg ? esc(msg) + " " : ""}${esc(base)}${total ? ' <a href="profile/">View My Profile</a>' : ""}`;
  }
  function save(next) { P.setBrands([...new Set(next)].slice(0, P.LIMITS.brands)); }

  box.addEventListener("change", (e) => {
    const t = e.target;
    const cur = P.get().brands;
    if (t.dataset.parent) {
      const p = parents.find((x) => x.id === t.dataset.parent), ids = idsOf(p);
      if (t.checked) {
        open.add(p.id);
        const back = remembered[p.id] || [];
        if (back.length) save([...cur, ...back]);
        announce(`${p.name} brands shown below${back.length ? `, with your ${back.length} earlier pick${back.length === 1 ? "" : "s"} restored` : ""}.`);
      } else {
        open.delete(p.id);
        remembered[p.id] = cur.filter((id) => ids.includes(id));
        save(cur.filter((id) => !ids.includes(id)));
        announce(`${p.name} hidden${remembered[p.id].length ? ` and its ${remembered[p.id].length} pick${remembered[p.id].length === 1 ? "" : "s"} removed` : ""}.`);
      }
    } else if (t.dataset.all) {
      const ids = idsOf(parents.find((x) => x.id === t.dataset.all));
      save(t.checked ? [...cur, ...ids] : cur.filter((id) => !ids.includes(id)));
      announce(t.checked ? `All ${ids.length} selected.` : "All cleared.");
    } else if (t.dataset.brandOf) {
      save(t.checked ? [...cur, t.value] : cur.filter((id) => id !== t.value));
      announce("");
    } else if (t.dataset.other) {
      otherOpen = t.checked;
      if (t.checked) {
        if (otherBack) P.setOtherBrand(otherBack);
        announce(otherBack ? `Other brand “${otherBack}” restored.` : "Type a brand that isn’t listed, then press Save.");
      } else {
        otherBack = P.get().other_brand || "";
        P.setOtherBrand("");
        announce(otherBack ? "Other brand removed." : "");
      }
    } else if (t.id === "famOtherInput") saveOther();
  });
  /* the typed brand saves on Save, Enter, leaving the field, or after a short pause in typing */
  let typing = 0;
  function saveOther() {
    clearTimeout(typing);
    const oi = document.getElementById("famOtherInput");
    const v = P.cleanOther(oi.value);
    if (v === (P.get().other_brand || "")) return;
    P.setOtherBrand(v);
    if (document.activeElement !== oi) oi.value = v;
    announce(v ? `Other brand “${v}” saved.` : "Other brand cleared.");
  }
  box.addEventListener("input", (e) => { if (e.target.id === "famOtherInput") { clearTimeout(typing); typing = setTimeout(saveOther, 700); } });
  box.addEventListener("keydown", (e) => { if (e.target.id === "famOtherInput" && e.key === "Enter") { e.preventDefault(); saveOther(); } });
  box.addEventListener("click", (e) => { if (e.target.closest("#famOtherSave")) saveOther(); });
  P.subscribe(() => announce(""));
  announce("");
  window.AMBAR_FAMILIAR = { paint, open };
})();
