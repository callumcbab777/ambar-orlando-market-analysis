/* AMBAR Orlando · News hub (index.html#news): a live-blog style feed of short, dated stories.
   Stories come from two places, both shown with their source:
     1. data/news_feed.json (mirror news_feed.js): public news feeds, refreshed by scripts/update_news.py on a schedule
        (.github/workflows/news-feed.yml). Headlines and links are the publishers' own.
     2. the weekly Marriott briefs (data/comps.json "news"), labelled "From the weekly brief"; anchors stay #news-N so the
        site assistant's links keep working.
   Filter by subcategory chips, save a story to My Profile (assets/js/profile.js, this browser only) and share it by
   email, text, copy link or the device share sheet. Nothing is sent anywhere by the site itself. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = window.AMBAR_PROFILE;
  const CAT_ORDER = ["theme-parks", "mco", "dining", "lake-nona", "hospitality", "marriott", "events", "development", "orlando"];
  const CAT_LABEL = { "theme-parks": "Theme Parks", mco: "MCO / Airport", dining: "New Restaurants / Bars / Coffee", "lake-nona": "Lake Nona", hospitality: "Hospitality & Hotels", marriott: "Marriott", events: "Conventions & Events", development: "Development & Real Estate", orlando: "Wider Orlando" };
  const TOP = 12, STEP = 12;
  const tz = "America/New_York";
  const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const dayLabel = (d) => {
    const k = dayKey(d), now = new Date(), today = dayKey(now), y = dayKey(new Date(now.getTime() - 864e5));
    if (k === today) return "Today";
    if (k === y) return "Yesterday";
    return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
  };
  const timeLabel = (d) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const ago = (d) => {
    const m = Math.round((Date.now() - d.getTime()) / 6e4);
    if (m < 60) return `${Math.max(1, m)} min ago`;
    const h = Math.round(m / 60);
    if (h < 36) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const dd = Math.round(h / 24);
    return `${dd} day${dd === 1 ? "" : "s"} ago`;
  };
  async function sha(s) {
    try {
      const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 12);
    } catch (e) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ("b" + h.toString(36)).slice(0, 12); }
  }

  async function stories(DB) {
    const feed = window.AMBAR_NEWS_FEED || { items: [] };
    const out = (feed.items || []).map((s) => ({ ...s, kind: "feed", when: new Date(s.published.replace(/Z$/, ":00Z")) }));
    const brief = DB && Array.isArray(DB.news) ? DB.news : [];
    for (let i = 0; i < brief.length; i++) {
      const n = brief[i];
      const url = /^https:\/\//.test(n.url || "") ? n.url : "";
      out.push({
        id: url ? await sha(url) : "brief" + (i + 1), anchor: "news-" + (i + 1), kind: "brief",
        cat: n.category === "orlando" ? "orlando" : n.category === "hospitality" ? "hospitality" : "marriott",
        title: n.headline, source: n.source || "", url, published: n.week, dateText: n.date || "",
        when: new Date(n.week + "T12:00:00-05:00"),
      });
    }
    out.sort((a, b) => b.when - a.when);
    return { list: out, feed };
  }

  function shareText(s) { return `${s.title}${s.source ? ` (${s.source})` : ""}${s.url ? `\n${s.url}` : ""}\n\nVia the AMBAR Orlando Market Landscape: ${hubUrl()}`; }
  function hubUrl() { return location.href.split("#")[0].replace(/index\.html$/, "") + "#news"; }

  async function render(DB) {
    const root = document.getElementById("newsHub");
    if (!root) return false;
    const { list, feed } = await stories(DB);
    const byId = new Map(list.map((s) => [s.id, s]));
    let filter = "all", shown = TOP;
    const toolbar = document.getElementById("newsChips");
    const listEl = document.getElementById("newsList");
    const status = document.getElementById("newsStatus");
    const more = document.getElementById("newsMore");
    const stamp = document.getElementById("newsStamp");
    if (stamp) {
      const g = feed.generated ? new Date(feed.generated.replace(/Z$/, ":00Z")) : null;
      stamp.innerHTML = g ? `<span class="nh-live" aria-hidden="true"></span>Feed refreshed <time datetime="${esc(feed.generated)}">${esc(ago(g))}</time> · ${list.length} stories` : `${list.length} stories from the weekly briefs`;
    }
    const isSaved = (id) => !!(P && P.hasStory && P.hasStory(id));
    function chips() {
      const counts = { all: list.length, saved: list.filter((s) => isSaved(s.id)).length };
      list.forEach((s) => { counts[s.cat] = (counts[s.cat] || 0) + 1; });
      const keys = ["all", "saved", ...CAT_ORDER.filter((k) => counts[k])];
      toolbar.innerHTML = keys.map((k) => {
        const label = k === "all" ? "All" : k === "saved" ? "Saved" : CAT_LABEL[k];
        return `<button type="button" class="chip nh-chip${k === "saved" ? " nh-chip-saved" : ""}" data-nf="${k}" aria-pressed="${filter === k}">${esc(label)} <span class="nh-n">${counts[k] || 0}</span></button>`;
      }).join("");
    }
    function card(s) {
      const saved = isSaved(s.id);
      const canSave = !!s.url && !!P && !!P.toggleStory;
      const dateBit = s.kind === "feed" ? `<time datetime="${esc(s.published)}">${esc(timeLabel(s.when))}</time>` : `<span>${esc(s.dateText || "Week of " + s.published)}</span>`;
      return `<article class="nh-card" id="${esc(s.anchor || "story-" + s.id)}" data-sid="${esc(s.id)}">
        <div class="nh-meta">${dateBit}<span class="nh-cat nh-cat-${esc(s.cat)}">${esc(CAT_LABEL[s.cat] || s.cat)}</span>${s.kind === "brief" ? '<span class="nh-brief">From the weekly brief</span>' : ""}</div>
        <h3 class="nh-t">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}<span class="sr-only"> (opens the original story in a new tab)</span></a>` : esc(s.title)}</h3>
        <p class="nh-src">${s.source ? `Source: ${esc(s.source)}` : ""}</p>
        <div class="nh-acts" role="group" aria-label="Save or share this story">
          ${canSave ? `<button type="button" class="nh-act nh-save" data-act="save" aria-pressed="${saved}">${saved ? "Saved" : "Save"}<span class="sr-only"> to My Profile</span></button>` : ""}
          <a class="nh-act" data-act="email" href="mailto:?subject=${encodeURIComponent(s.title)}&amp;body=${encodeURIComponent(shareText(s))}">Email</a>
          <a class="nh-act" data-act="sms" href="sms:?&amp;body=${encodeURIComponent(shareText(s))}">Text</a>
          <button type="button" class="nh-act" data-act="copy">Copy link</button>
          ${typeof navigator.share === "function" ? '<button type="button" class="nh-act" data-act="share">Share…</button>' : ""}
        </div>
      </article>`;
    }
    function paint() {
      chips();
      const pool = list.filter((s) => filter === "all" || (filter === "saved" ? isSaved(s.id) : s.cat === filter));
      const vis = pool.slice(0, shown);
      let html = "", lastDay = "";
      for (const s of vis) {
        const dk = s.kind === "feed" ? dayKey(s.when) : "brief-" + s.published;
        if (dk !== lastDay) {
          lastDay = dk;
          html += `<h3 class="nh-day">${esc(s.kind === "feed" ? dayLabel(s.when) : "Weekly brief · week of " + new Date(s.published + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</h3>`;
        }
        html += card(s);
      }
      listEl.innerHTML = html || `<p class="nh-empty">${filter === "saved" ? "No saved stories yet. Tap Save on any story and it appears here and in My Profile." : "No stories in this topic right now. The feed refreshes every few hours."}</p>`;
      more.hidden = pool.length <= shown;
      more.textContent = `Show more stories (${pool.length - shown} more)`;
    }
    toolbar.addEventListener("click", (e) => { const b = e.target.closest("[data-nf]"); if (!b) return; filter = b.dataset.nf; shown = TOP; paint(); });
    more.addEventListener("click", () => { shown += STEP; paint(); });
    listEl.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      const s = byId.get(a.closest("[data-sid]").dataset.sid); if (!s) return;
      const act = a.dataset.act;
      if (act === "save") {
        P.toggleStory({ id: s.id, title: s.title, url: s.url, source: s.source, cat: s.cat, date: s.kind === "feed" ? dayKey(s.when) : s.published });
        const now = isSaved(s.id);
        a.setAttribute("aria-pressed", String(now)); a.firstChild.textContent = now ? "Saved" : "Save";
        status.textContent = now ? "Saved to My Profile." : "Removed from My Profile.";
        chips();
      } else if (act === "copy") {
        const t = s.url || hubUrl();
        let ok = false;
        try { await navigator.clipboard.writeText(t); ok = true; } catch (err) { ok = false; }
        status.textContent = ok ? "Link copied." : `Copy this link: ${t}`;
      } else if (act === "share") {
        try { await navigator.share({ title: s.title, text: `${s.title}${s.source ? ` (${s.source})` : ""}`, url: s.url || hubUrl() }); status.textContent = "Shared."; }
        catch (err) { if (err && err.name !== "AbortError") status.textContent = "Sharing isn’t available here. Use Copy link instead."; }
      }
    });
    if (P && P.subscribe) P.subscribe(() => paint());
    paint();
    /* a deep link to a brief item (#news-N) or a story opens it even if it's below the fold */
    const h = location.hash.slice(1);
    if (/^(news-\d+|story-[a-z0-9]+)$/.test(h) && !document.getElementById(h)) {
      const s = list.find((x) => x.anchor === h || "story-" + x.id === h);
      if (s) { shown = list.indexOf(s) + 1; paint(); const n = document.getElementById(h); if (n) n.scrollIntoView(); }
    }
    return true;
  }
  window.AMBAR_NEWS = { render, CAT_LABEL, CAT_ORDER };
})();
