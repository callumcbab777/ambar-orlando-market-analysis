/* AMBAR Orlando · "Ask Isla about events" on the What's on page.
   Pure (no DOM); used by assets/js/events-isla.js (window.AMBAR_EV_ASK) and tests/js/events_ask_test.js in Node.
   Every answer is built ONLY from the site's Visit Orlando listings (data/visitorlando_events.json):
     understand(question, today) → { from, to, when, audience, cats, words }    (what the question asks for)
     answer(question, events, today) → { items:[{ event, why }], when, audience, empty, text }   (rule-based, ranked)
     candidates(question, events, today, n) → a wider ranked subset to send to the AI as its only context
     ground(aiReply, events, sentIds) → { text, items } or null: keeps only cited ids that are real events AND were sent;
       links are always rebuilt from the data, never taken from the AI's text.
   Nothing here invents an event; when nothing matches, the answer says so plainly. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_EV_ASK = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const monIdx = (s) => MONTHS.findIndex((m) => m.startsWith(String(s).toLowerCase().slice(0, 3)));
  const fmt = (s) => { const d = parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
  const runDays = (e) => Math.round((parse(e.end_date) - parse(e.start_date)) / 864e5) + 1;
  const ACCESS_WORDS = /\b(?:sensory|accessible|accessibility|wheelchair|asl|interpreted|audio[- ]described|relaxed performance)\b/i;

  /* who an event suits, from its own title, description and Visit Orlando categories */
  const LITTLE = /\b(?:toddlers?|preschool(?:ers)?|little ones|little kids|storytime|story time|puppets?|sesame|baby|babies|tots?|ages? [0-5]\b|under 5|mommy|daddy|peppa|bluey|paw patrol|daniel tiger|cocomelon|kinder)\b/i;
  const FAMILY = /\b(?:famil(?:y|ies)|kids?|children|child|all ages|family[- ]friendly|youth|junior|santa|elf|holiday lights?|light show|gingerbread|zoo|aquarium|science center|legoland|disney|nutcracker|princess|frozen|magic show|circus|parade|pumpkin|trick[- ]or[- ]treat|easter egg|petting|carnival|fair\b)\b/i;
  const ADULT = /\b(?:21\+|18\+|adults? only|after dark|bar crawl|burlesque|cocktails?|happy hour|wine (?:walk|tasting|dinner)|beer (?:fest|festival|tasting)|brew(?:ery|fest)|pub crawl|drag brunch|bottomless|late[- ]night|nightclub|stand[- ]up comedy|comedy)\b/i;
  const COUPLE = /\b(?:date night|romantic|valentine|candlelight|candle light|wine|dinner|jazz|symphony|orchestra|ballet|opera|theat(?:er|re)|broadway|chef|tasting|gala|sunset|dance)\b/i;
  const audienceOf = (e) => {
    const t = `${e.title || ""} ${e.description || ""}`;
    const cats = e.categories || [];
    return {
      little: LITTLE.test(t),
      family: LITTLE.test(t) || FAMILY.test(t) || cats.includes("Theme Park Events"),
      adult: ADULT.test(t),
      couple: COUPLE.test(t) || cats.includes("Live Theater & Performing Arts"),
    };
  };

  const CATS = [
    [/\b(?:concerts?|music|gigs?|bands?|live music|jazz|symphony|orchestra|rock|country|hip[- ]hop|dj)\b/, "Concerts and Live Shows"],
    [/\b(?:theat(?:er|re)|plays?|musicals?|broadway|ballet|opera|performing arts|shows?)\b/, "Live Theater & Performing Arts"],
    [/\b(?:art|arts|museums?|exhibits?|exhibitions?|galleries|gallery|culture|cultural)\b/, "Arts & Cultural Events"],
    [/\b(?:festivals?|fests?|fairs?)\b/, "Festivals"],
    [/\b(?:sports?|games?|match(?:es)?|basketball|soccer|football|hockey|baseball|races?|5k|marathon)\b/, "Sporting Events"],
    [/\b(?:outdoors?|outdoor|nature|gardens?|hikes?|hiking|parks? and trails|adventure)\b/, "Outdoors & Adventure"],
    [/\b(?:holidays?|christmas|xmas|hanukkah|halloween|thanksgiving|new year'?s?|festive|santa)\b/, "Holidays"],
    [/\b(?:theme parks?|disney|universal|seaworld|epcot|legoland)\b/, "Theme Park Events"],
    [/\b(?:free|no cost|no charge)\b/, "Free Events"],
  ];
  const STOP = new Set("a an and any are at be best can do does event events family families find for from fun good great have i in is it kids kid children little ones me my near next of on or our some something the there these this to upcoming us want we week weekend what whats where which who with would you young toddlers toddler couple couples adult adults date night nights things thing do going happening orlando recommend suggest show tell please around soon coming month months day days today tonight tomorrow ideas idea options option place places event's really very most top new old good something anything romantic date fun free kid-friendly family-friendly friendly happen happens plan planning visit visiting stay staying worth".split(" "));

  function understand(q, today) {
    const low = String(q || "").toLowerCase().replace(/[’']/g, "'");
    let from = today, to = addDays(today, 30), when = "in the next 30 days", m;
    const dow = parse(today).getDay();
    const fri = addDays(today, (5 - dow + 7) % 7);
    if (/\btonight\b|\btoday\b/.test(low)) { from = to = today; when = "today"; }
    else if (/\btomorrow\b/.test(low)) { from = to = addDays(today, 1); when = "tomorrow"; }
    else if (/\bnext weekend\b/.test(low)) { from = addDays(dow === 0 ? addDays(today, -2) : fri, 7); to = addDays(from, 2); when = `next weekend (${fmt(from)}–${fmt(to)})`; }
    else if (/\b(?:this|the) weekend\b|\bweekend\b/.test(low)) { from = dow === 6 ? today : dow === 0 ? today : fri; to = dow === 0 ? today : dow === 6 ? addDays(today, 1) : addDays(fri, 2); when = `this weekend (${fmt(from)}–${fmt(to)})`; }
    else if (/\bnext week\b/.test(low)) { from = addDays(today, ((8 - dow) % 7) || 7); to = addDays(from, 6); when = `next week (${fmt(from)}–${fmt(to)})`; }
    else if (/\bthis week\b/.test(low)) { to = addDays(today, (7 - dow) % 7); when = `this week (to ${fmt(to)})`; }
    else if (/\bnext month\b/.test(low)) { const d = parse(today); from = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)); to = iso(new Date(d.getFullYear(), d.getMonth() + 2, 0, 12)); when = `next month (${MON[parse(from).getMonth()]})`; }
    else if ((m = low.match(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`))) || (m = low.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_RE}\\b`)))) {
      const mi = /\d/.test(m[1]) ? monIdx(m[2]) : monIdx(m[1]); const dd = /\d/.test(m[1]) ? +m[1] : +m[2];
      let y = parse(today).getFullYear(); let d = iso(new Date(y, mi, dd, 12)); if (d < today) d = iso(new Date(y + 1, mi, dd, 12));
      from = to = d; when = `on ${fmt(d)}`;
    } else if ((m = low.match(new RegExp(`\\b(?:in|during|for|this|next)?\\s*${MON_RE}\\b`))) && !/\bmay (?:be|i|we|have|need|want|like)\b/.test(low)) {
      const mi = monIdx(m[1]); const t = parse(today); let y = t.getFullYear(); if (mi < t.getMonth()) y += 1;
      from = iso(new Date(y, mi, 1, 12)); if (from < today) from = today; to = iso(new Date(y, mi + 1, 0, 12)); when = `in ${MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1)}`;
    } else if ((m = low.match(/\b(20\d\d-\d\d-\d\d)\b/))) { from = to = m[1]; when = `on ${fmt(m[1])}`; }
    const audience = /\b(?:little (?:ones|kids|children)|toddlers?|preschool|young (?:kids|children)|small (?:kids|children)|babies|baby|under (?:5|five)|tots?)\b/.test(low) ? "little"
      : /\b(?:famil(?:y|ies)|kids?|children|child|all ages)\b/.test(low) ? "family"
      : /\b(?:couples?|date night|romantic|anniversary|for two)\b/.test(low) ? "couple"
      : /\b(?:adults?|grown[- ]ups?|21\+|nightlife|bars?)\b/.test(low) ? "adult" : "";
    const cats = CATS.filter(([re]) => re.test(low)).map(([, c]) => c);
    const all = (low.match(/[a-z0-9+]{3,}/g) || []).filter((w) => !STOP.has(w) && !MONTHS.some((mm) => mm.startsWith(w) && w.length >= 3));
    const words = all.filter((w) => !CATS.some(([re]) => re.test(w)));
    const boost = all.filter((w) => !words.includes(w) && !/^(?:concerts?|music|shows?|theat(?:er|re)|arts?|festivals?|sports?|games?|holidays?|outdoors?|outdoor|free|culture|cultural|museums?)$/.test(w));
    const access = ACCESS_WORDS.test(low);
    const free = /\bfree\b/.test(low);
    return { from, to, when, audience, cats, words: [...new Set(words)].slice(0, 6), boost: [...new Set(boost)].slice(0, 4), access, free };
  }

  function rank(q, events, today) {
    const u = understand(q, today);
    const out = [];
    for (const e of events || []) {
      if (!e || !e.id || !e.start_date || !e.end_date || !/^https:\/\/www\.visitorlando\.com\//.test(e.url || "")) continue;
      if (e.end_date < today || e.end_date < u.from || e.start_date > u.to) continue;
      const a = audienceOf(e), cats = e.categories || [];
      const text = `${e.title || ""} ${e.location || ""} ${e.description || ""}`.toLowerCase();
      let s = 0; const why = [];
      if (u.audience === "little") { if (a.adult) continue; if (a.little) { s += 6; why.push("for little ones"); } else if (a.family) { s += 3; why.push("family-friendly"); } else s -= 2; }
      else if (u.audience === "family") { if (a.adult) continue; if (a.family) { s += 5; why.push("family-friendly"); } else s -= 1; }
      else if (u.audience === "couple") { if (a.little && !a.couple) s -= 3; if (a.couple) { s += 4; why.push("good for a night out"); } if (a.adult) s += 1; }
      else if (u.audience === "adult") { if (a.little) s -= 4; if (a.adult) { s += 4; why.push("for adults"); } else if (a.couple) s += 2; }
      const catHit = u.cats.filter((c) => cats.includes(c));
      if (u.cats.length) { if (catHit.length) { s += 4 * catHit.length; why.push(catHit[0]); } else if (!u.words.length) s -= 3; }
      const wHit = u.words.filter((w) => text.includes(w));
      if (wHit.length) { s += 3 * wHit.length; why.push(`mentions “${wHit[0]}”`); }
      const bHit = u.boost.filter((w) => text.includes(w));
      if (bHit.length) { s += 4 * bHit.length; why.push(`mentions “${bHit[0]}”`); }
      if (u.words.length && wHit.length < Math.ceil(u.words.length / 2)) continue; /* asked about something specific this listing doesn't mention */
      if (u.cats.length && !catHit.length && !wHit.length && !u.audience) continue;
      if (u.free) { if (cats.includes("Free Events")) { s += 3; why.push("free"); } else continue; }
      if (u.access) { if (ACCESS_WORDS.test(text)) s += 3; }
      const run = runDays(e);
      if (run <= 3) s += 2; else if (run > 60) s -= 2;
      s += Math.max(0, 1.5 - (Math.max(0, (parse(e.start_date < today ? today : e.start_date) - parse(today)) / 864e5)) / 10);
      out.push({ e, s, why });
    }
    out.sort((x, y) => y.s - x.s || x.e.start_date.localeCompare(y.e.start_date) || String(x.e.title).localeCompare(String(y.e.title)));
    return { u, ranked: out };
  }

  const dates = (e) => (e.start_date === e.end_date ? fmt(e.start_date) : `${fmt(e.start_date)} – ${fmt(e.end_date)}`);
  const AUD = { little: "families with little children", family: "families", couple: "couples", adult: "adults" };
  function answer(q, events, today, n = 5) {
    const { u, ranked } = rank(q, events, today);
    const minS = u.audience || u.cats.length || u.words.length ? 1 : -99;
    const items = ranked.filter((x) => x.s >= minS).slice(0, n).map((x) => ({ event: x.e, why: x.why.slice(0, 2).join(" · ") }));
    const who = u.audience ? ` for ${AUD[u.audience]}` : "";
    const what = u.cats.length ? ` (${u.cats.join(", ").toLowerCase()})` : u.words.length ? ` matching “${u.words.join(" ")}”` : "";
    const text = items.length
      ? `Here ${items.length === 1 ? "is the best match" : `are the ${items.length} best matches`}${who}${what} ${u.when}, from the Visit Orlando listings on this site:`
      : `I couldn’t find any events${who}${what} ${u.when} in the Visit Orlando listings on this site. Try another date or fewer details, or browse the full calendar.`;
    return { items, when: u.when, audience: u.audience, empty: !items.length, text, understood: u };
  }
  /* the AI's context: the best-ranked listings for the question, a little wider than the rule answer */
  function candidates(q, events, today, n = 25) {
    const { ranked } = rank(q, events, today);
    let list = ranked.slice(0, n).map((x) => x.e);
    if (list.length < 5) { /* nothing specific matched: give the AI the soonest listings in the window so it can say so */
      const u = understand(q, today);
      const seen = new Set(list.map((e) => e.id));
      list = list.concat((events || []).filter((e) => e && !seen.has(e.id) && e.end_date >= u.from && e.start_date <= u.to && e.end_date >= today).slice(0, n - list.length));
    }
    return list;
  }
  /* AI reply → grounded answer. reply: { answer: string, event_ids: [string] }. Ids must be real AND among those sent. */
  function ground(reply, events, sentIds) {
    if (!reply || typeof reply !== "object" || typeof reply.answer !== "string" || !Array.isArray(reply.event_ids)) return null;
    const byId = new Map((events || []).map((e) => [String(e.id), e]));
    const sent = new Set((sentIds || []).map(String));
    const ids = [...new Set(reply.event_ids.map(String))].filter((id) => byId.has(id) && sent.has(id)).slice(0, 6);
    if (reply.event_ids.length && !ids.length) return null; /* it cited only things we don't have: don't trust it */
    const text = reply.answer.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!text) return null;
    return { text, items: ids.map((id) => ({ event: byId.get(id), why: "" })) };
  }
  return { understand, answer, candidates, ground, audienceOf, dates, fmt };
});
