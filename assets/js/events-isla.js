/* AMBAR Orlando · events page "Ask Isla what's on" (button in the hero + modal dialog).
   Answers come ONLY from this site's Visit Orlando listings (window.VO_EVENTS_DATA). With the AI proxy on
   (assistant-config.js proxyUrl), the browser sends the best-matching subset, the reply must cite event ids from that
   subset, and every link is rebuilt from the data (AMBAR_EV_ASK.ground). Off, slow or invalid → the rule-based answer.
   Dialog: native <dialog> opened modally (background inert), Tab/Shift+Tab kept inside, Esc closes, focus goes back
   to the button. Full-screen on phones (events.css). */
(function () {
  "use strict";
  const A = window.AMBAR_EV_ASK, C = window.AMBAR_EV_CORE;
  const btn = document.getElementById("evIslaBtn"), dlg = document.getElementById("evIsla");
  if (!A || !btn || !dlg) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const data = window.VO_EVENTS_DATA || {};
  const events = data.events || [];
  const today = C && C.localToday ? C.localToday() : new Date().toISOString().slice(0, 10);
  const proxy = () => { const u = String((window.AMBAR_ASSISTANT_CONFIG || {}).proxyUrl || "").trim(); return /^https:\/\//.test(u) ? u : ""; };
  const captured = data.fetched_at ? A.fmt(String(data.fetched_at).slice(0, 10)) : "recently";
  $("evIslaNote").textContent = (proxy() ? "Isla AI answers only from the Visit Orlando listings on this site and can be wrong." : "Isla matches your question to the Visit Orlando listings on this site.")
    + ` Listings captured ${captured}; check each one before you go.`;
  const log = $("evIslaLog"), input = $("evIslaQ"), form = $("evIslaForm");

  function card(e, why) {
    const where = [e.location, e.city].filter(Boolean).join(", ");
    return `<li class="isla-ev"><a href="${esc(e.url)}" target="_blank" rel="noopener" data-event-id="${esc(e.id)}">${esc(e.title)}<span class="sr-only"> (Visit Orlando listing, opens in a new tab)</span></a>
      <span class="isla-ev-meta">${esc(A.dates(e))}${where ? ` · ${esc(where)}` : ""}${why ? ` · ${esc(why)}` : ""}</span></li>`;
  }
  function add(cls, html) {
    const div = document.createElement("div");
    div.className = `isla-msg ${cls}`; div.innerHTML = html;
    log.appendChild(div); log.scrollTop = log.scrollHeight; return div;
  }
  function show(text, items, by) {
    add("isla-a", `<span class="sr-only">Isla: </span><p>${esc(text)}</p>${items.length ? `<ul class="isla-evs">${items.map((x) => card(x.event, x.why)).join("")}</ul>` : `<p><a href="https://www.visitorlando.com/events/" target="_blank" rel="noopener">Browse the full Visit Orlando calendar<span class="sr-only"> (opens in a new tab)</span></a></p>`}
      <p class="isla-src">${by === "ai" ? "Isla AI · from this site’s listings" : "Matched from this site’s listings"}</p>`);
  }
  async function viaAI(q) {
    const url = proxy(); if (!url) return null;
    const subset = A.candidates(q, events, today, 25);
    if (!subset.length) return null;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ task: "events_answer", messages: [{ role: "user", content: q.slice(0, 500) }],
          context: { page: "events", today, calendar_url: "https://www.visitorlando.com/events/",
            events: subset.map((e) => ({ id: String(e.id), title: e.title, start_date: e.start_date, end_date: e.end_date, location: e.location || "", area: e.city || "", categories: e.categories || [], url: e.url })) } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.data) return null;
      return A.ground(j.data, events, subset.map((e) => String(e.id)));
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  let busy = false;
  async function ask(q) {
    q = String(q || "").trim(); if (!q || busy) return;
    busy = true;
    add("isla-q", `<span class="sr-only">You: </span>${esc(q)}`);
    input.value = "";
    const wait = proxy() ? add("isla-a isla-wait", "Isla is looking through the listings…") : null;
    const ai = await viaAI(q);
    if (wait) wait.remove();
    if (ai) show(ai.text, ai.items, "ai");
    else { const r = A.answer(q, events, today); show(r.text, r.items, "rules"); }
    busy = false; input.focus();
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  $("evIslaSugg").addEventListener("click", (e) => { const b = e.target.closest(".isla-chip"); if (b) ask(b.textContent); });

  /* open / close + focus trap */
  function open() {
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    document.documentElement.classList.add("isla-open");
    btn.setAttribute("aria-expanded", "true");
    input.focus();
  }
  function close() {
    if (typeof dlg.close === "function" && dlg.open) dlg.close(); else dlg.removeAttribute("open");
  }
  dlg.addEventListener("close", () => { document.documentElement.classList.remove("isla-open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); });
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", open);
  $("evIslaX").addEventListener("click", close);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); }); /* backdrop */
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.AMBAR_EV_ISLA = { open, close, ask };
})();
