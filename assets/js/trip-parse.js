/* AMBAR Orlando · Travel Concierge: read a plain-words trip description into the My Preferences fields.
   Pure (no DOM); used by assets/js/concierge.js in the browser (window.AMBAR_TRIP_PARSE) and by
   tests/js/trip_parse_test.js in Node.
   parse(text, { today:"YYYY-MM-DD", routes: AMBAR_FLIGHTS.ROUTES }) →
     { fields: { adults, kids, kid_ages, pace, interests, budget, from, nights, home, access }, found: [field names], ask: "…" | "" }
   Only fields the sentence actually mentions are in `found`; the caller merges just those into the form, so nothing the
   visitor set by hand is overwritten by a guess. validate(obj) checks an AI reply against the same schema (strict). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AMBAR_TRIP_PARSE = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const PACES = ["relaxed", "balanced", "packed"], BUDGETS = ["value", "comfort", "luxury"];
  const INTERESTS = ["parks", "golf", "dining", "nightlife", "shopping", "nature", "wellness", "sports", "culture"];
  const ACCESS = ["step-free", "limited-walking", "sensory", "stroller", "hearing", "sight"];
  const FIELDS = ["adults", "kids", "kid_ages", "pace", "interests", "budget", "from", "nights", "home", "access"];
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const MON_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, couple: 2, pair: 2 };
  const NUM_RE = "(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)";
  const num = (s) => (s == null ? NaN : /^\d+$/.test(s) ? +s : NUM[String(s).toLowerCase()] ?? NaN);

  /* city / airport name → IATA. Covers the routes on the visit page plus common origins; the route table's own names are added at runtime. */
  const CITY = {
    "london gatwick": "LGW", gatwick: "LGW", "london heathrow": "LHR", heathrow: "LHR", london: "LHR", "london stansted": "STN", stansted: "STN",
    manchester: "MAN", edinburgh: "EDI", glasgow: "GLA", newcastle: "NCL", belfast: "BFS", birmingham: "BHX", bristol: "BRS", "east midlands": "EMA",
    leeds: "LBA", "leeds bradford": "LBA", cardiff: "CWL", aberdeen: "ABZ", liverpool: "LPL", dublin: "DUB", shannon: "SNN", cork: "ORK",
    paris: "CDG", frankfurt: "FRA", munich: "MUC", madrid: "MAD", lisbon: "LIS", amsterdam: "AMS", reykjavik: "KEF", dubai: "DXB",
    toronto: "YYZ", montreal: "YUL", "montréal": "YUL", "sao paulo": "GRU", "são paulo": "GRU", campinas: "VCP", "mexico city": "MEX", bermuda: "BDA",
    belize: "BZE", "punta cana": "PUJ", "new york laguardia": "LGA", laguardia: "LGA", "new york": "JFK", nyc: "JFK", newark: "EWR",
    minneapolis: "MSP", "st paul": "MSP", pittsburgh: "PIT", allentown: "ABE", cincinnati: "CVG", boston: "BOS", chicago: "ORD", atlanta: "ATL",
    dallas: "DFW", houston: "IAH", "los angeles": "LAX", "san francisco": "SFO", seattle: "SEA", denver: "DEN", philadelphia: "PHL",
    washington: "IAD", "washington dc": "DCA", miami: "MIA", detroit: "DTW", charlotte: "CLT", phoenix: "PHX", "las vegas": "LAS", nashville: "BNA",
    vancouver: "YVR", calgary: "YYC", ottawa: "YOW", rome: "FCO", milan: "MXP", zurich: "ZRH", brussels: "BRU", copenhagen: "CPH", oslo: "OSL", stockholm: "ARN",
  };
  const KNOWN_CODES = new Set(Object.values(CITY));

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const monIdx = (s) => MONTHS.findIndex((m) => m.startsWith(String(s).toLowerCase().slice(0, 3)));
  const lastOfMonth = (y, m) => new Date(y, m + 1, 0, 12).getDate();
  /* the next occurrence of month m (0-11), day d: this year if still ahead (or later this month), else next year */
  function nextDate(m, d, today) {
    const t = parseIso(today);
    let y = t.getFullYear();
    const dd = Math.min(d, lastOfMonth(y, m));
    if (iso(new Date(y, m, dd, 12)) < today) y += 1;
    return iso(new Date(y, m, Math.min(d, lastOfMonth(y, m)), 12));
  }
  /* "in April": the next April. The 1st, or a week from today if we're already in that month. */
  function monthStart(m, part, today) {
    const day = part === "mid" ? 15 : part === "late" ? 22 : 1;
    const t = parseIso(today);
    if (t.getMonth() === m) {
      const want = iso(new Date(t.getFullYear(), m, day, 12));
      if (want > today) return want;
      const soon = addDays(today, 7);
      return parseIso(soon).getMonth() === m ? soon : iso(new Date(t.getFullYear() + 1, m, day, 12));
    }
    return nextDate(m, day, today);
  }
  const nextDow = (today, dow, minAhead = 1) => { let s = addDays(today, minAhead); while (parseIso(s).getDay() !== dow) s = addDays(s, 1); return s; };
  function thanksgiving(y) { const d = new Date(y, 10, 1, 12); while (d.getDay() !== 4) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 21); return iso(d); }

  function airports(text, routes) {
    const names = { ...CITY };
    for (const k of Object.keys(routes || {})) {
      const [o] = k.split("-"); if (o === "ANY") continue;
      const n = String(routes[k].name || "").toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
      if (n && !names[n]) names[n] = o;
      KNOWN_CODES.add(o);
    }
    const low = " " + text.toLowerCase().replace(/[^a-zà-ÿ0-9' -]+/g, " ").replace(/\s+/g, " ") + " ";
    /* an explicit code after "from" wins: "flying from JFK" */
    const code = text.match(/\b(?:from|out of|leaving|departing)\s+([A-Z]{3})\b/);
    if (code && KNOWN_CODES.has(code[1])) return code[1];
    const keys = Object.keys(names).sort((a, b) => b.length - a.length);
    /* prefer a name right after from / out of / leaving */
    for (const k of keys) if (new RegExp(`\\b(?:from|out of|leaving|departing|fly(?:ing)? in from)\\s+(?:the\\s+)?${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(low)) return names[k];
    for (const k of keys) if (low.includes(" " + k + " ")) return names[k];
    const bare = text.trim().match(/^([A-Za-z]{3})[.!]?$/);
    if (bare && KNOWN_CODES.has(bare[1].toUpperCase())) return bare[1].toUpperCase();
    return "";
  }

  function party(t, out, found) {
    let adults = NaN, kids = NaN, ages = [];
    const ageList = (s) => (s.match(/\d{1,2}/g) || []).map(Number).filter((a) => a <= 17);
    /* ages: "kids 3 and 6", "kids aged 3 and 6", "children (5, 8)", "a 4-year-old and a 7 year old", "ages 3 & 6" */
    let m = t.match(/\b(?:kids?|children|child|boys?|girls?|sons?|daughters?|grandkids|grandchildren|little ones|toddlers?|babies|baby|infants?|tots?)\b[^.;]{0,12}?\b(?:aged?|ages|of)?\s*\(?((?:\d{1,2})(?:\s*(?:,|and|&|\+)\s*\d{1,2})*)\)?(?!\s*(?:adults?|nights?|days?|weeks?))/i);
    if (m && !/\d\s*(?:kids?|children)/i.test(m[0])) ages = ageList(m[1]);
    if (!ages.length) { m = t.match(/\bages?\s+((?:\d{1,2})(?:\s*(?:,|and|&)\s*\d{1,2})*)/i); if (m) ages = ageList(m[1]); }
    const yo = [...t.matchAll(/\b(\d{1,2})[\s-]*(?:years?|yrs?|yo)[\s-]*old\b|\b(\d{1,2})\s*yo\b/gi)].map((x) => +(x[1] || x[2])).filter((a) => a <= 17);
    if (!ages.length && yo.length) ages = yo;
    /* counts */
    const fam = t.match(new RegExp(`\\b(?:family|group|party)\\s+of\\s+${NUM_RE}\\b`, "i")) || t.match(new RegExp(`\\b${NUM_RE}\\s+of\\s+us\\b`, "i")) || t.match(new RegExp(`\\bwe(?:'re| are)\\s+${NUM_RE}\\b`, "i"));
    const total = fam ? num(fam[1]) : NaN;
    const k = t.match(new RegExp(`\\b${NUM_RE}\\s+(?:little\\s+|young\\s+|small\\s+)?(?:kids?|children|child|boys?|girls?|sons?|daughters?|grandkids|grandchildren|toddlers?|teens?|teenagers?|little ones)\\b`, "i"));
    if (k) kids = num(k[1]);
    const a = t.match(new RegExp(`\\b${NUM_RE}\\s+(?:adults?|grown-?ups|grownups)\\b`, "i"));
    if (a) adults = num(a[1]);
    if (isNaN(kids) && ages.length) kids = ages.length;
    if (isNaN(kids)) {
      const solo = (t.match(/\b(?:a|our|my)\s+(?:son|daughter|kid|child|toddler|baby|teen|teenager|boy|girl)\b/gi) || []).length;
      if (solo) kids = solo;
      else if (/\b(?:kids|children|toddlers|little ones)\b/i.test(t) && !/\bno (?:kids|children)\b/i.test(t)) kids = NaN; /* mentioned, number unknown */
    }
    if (/\b(?:no kids|no children|just adults|adults only|without (?:the )?kids)\b/i.test(t)) kids = 0;
    if (isNaN(adults)) {
      if (/\b(?:just me|on my own|solo|by myself|alone)\b/i.test(t)) adults = 1;
      else if (/\b(?:my|our)\s+(?:wife|husband|partner|spouse|girlfriend|boyfriend|fianc[eé]e?)\b|\b(?:couple|honeymoon|anniversary|the two of us|me and my|my (?:wife|husband) and i|two of us)\b/i.test(t)) adults = 2;
      if (/\b(?:grandparents|grandma and grandpa|my parents|our parents|in-laws)\b/i.test(t)) adults = (isNaN(adults) ? 2 : adults) + 2;
      else if (/\b(?:grandma|grandpa|grandmother|grandfather|nan|nana|granny|my (?:mum|mom|dad|mother|father))\b/i.test(t)) adults = (isNaN(adults) ? 2 : adults) + 1;
    }
    if (!isNaN(total)) {
      if (!isNaN(kids) && isNaN(adults)) adults = Math.max(1, total - kids);
      else if (!isNaN(adults) && isNaN(kids)) kids = Math.max(0, total - adults);
      else if (isNaN(adults) && isNaN(kids)) { adults = /\b(?:family)\b/i.test(t) ? Math.min(2, total) : total; kids = total - adults; }
    }
    if (isNaN(adults) && !isNaN(kids) && kids > 0) adults = 2;
    if (!isNaN(adults)) { out.adults = Math.max(1, Math.min(12, adults)); found.add("adults"); }
    if (!isNaN(kids)) { out.kids = Math.max(0, Math.min(10, kids)); found.add("kids"); }
    if (ages.length) { out.kid_ages = ages.slice(0, out.kids || ages.length); if (!found.has("kids")) { out.kids = out.kid_ages.length; found.add("kids"); } found.add("kid_ages"); }
  }

  function dates(t, today, out, found) {
    const low = t.toLowerCase();
    let from = "", nights = NaN, m;
    /* length first */
    if ((m = low.match(new RegExp(`\\b${NUM_RE}\\s+nights?\\b`)))) nights = num(m[1]);
    else if ((m = low.match(new RegExp(`\\b${NUM_RE}\\s+days?\\b`))) && !/\bdays? (?:ago|later)\b/.test(low)) nights = Math.max(1, num(m[1]) - 1);
    else if ((m = low.match(new RegExp(`\\b${NUM_RE}\\s+weeks?\\b`))) && !/\bin\s+\S+\s+weeks?\b/.test(m.input.slice(Math.max(0, m.index - 3), m.index + m[0].length))) nights = num(m[1]) * 7;
    else if (/\bfortnight\b/.test(low)) nights = 14;
    else if (/\blong weekend\b/.test(low)) nights = 3;
    else if (/\b(?:a|for the|one)\s+week\b|\bweek-long\b|\bweeklong\b/.test(low)) nights = 7;
    else if (/\bweekend\b/.test(low)) nights = 2;
    /* dates: ISO, "April 10", "10 April", "10th of April", ranges "April 3-10" / "3 to 10 April" */
    if ((m = low.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) from = `${m[1]}-${m[2]}-${m[3]}`;
    else if ((m = low.match(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|to|until|through|thru)\\s*(?:${MON_RE}\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s*(20\\d\\d))?\\b`)))) {
      const mi = monIdx(m[1]); from = m[5] ? iso(new Date(+m[5], mi, +m[2], 12)) : nextDate(mi, +m[2], today);
      if (m[4]) { const mi2 = m[3] ? monIdx(m[3]) : mi; let to = iso(new Date(+from.slice(0, 4), mi2, +m[4], 12)); if (to <= from) to = iso(new Date(+from.slice(0, 4) + 1, mi2, +m[4], 12)); nights = Math.round((parseIso(to) - parseIso(from)) / 864e5); }
    } else if ((m = low.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|to|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\s+(?:of\\s+)?${MON_RE}\\b(?:,?\\s*(20\\d\\d))?`)))) {
      const mi = monIdx(m[3]); from = m[4] ? iso(new Date(+m[4], mi, +m[1], 12)) : nextDate(mi, +m[1], today);
      if (m[2] && +m[2] > +m[1]) nights = +m[2] - +m[1];
    } else if ((m = low.match(new RegExp(`\\b(?:(early|mid|middle of|late|end of|beginning of|start of)[\\s-]*)?${MON_RE}\\b(?:\\s+(20\\d\\d))?`))) && !/\bmay (?:be|i|we|have|need|want|like|not)\b/.test(low.slice(m.index, m.index + 12))) {
      const part = /mid|middle/.test(m[1] || "") ? "mid" : /late|end/.test(m[1] || "") ? "late" : "";
      const mi = monIdx(m[2]);
      from = m[3] ? iso(new Date(+m[3], mi, part === "mid" ? 15 : part === "late" ? 22 : 1, 12)) : monthStart(mi, part, today);
      if (from < today) from = monthStart(mi, part, today);
    } else if (/\btomorrow\b/.test(low)) from = addDays(today, 1);
    else if (/\b(?:this|the coming) weekend\b/.test(low)) from = nextDow(today, 5, 0);
    else if (/\bnext weekend\b/.test(low)) from = addDays(nextDow(today, 5, 0), 7);
    else if (/\bnext week\b/.test(low)) from = nextDow(today, 1, 1);
    else if (/\bnext month\b/.test(low)) { const d = parseIso(today); from = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)); }
    else if ((m = low.match(new RegExp(`\\bin\\s+${NUM_RE}\\s+(days?|weeks?|months?)\\b`)))) {
      const n = num(m[1]); const u = m[2][0];
      if (u === "d") from = addDays(today, n); else if (u === "w") from = addDays(today, 7 * n);
      else { const d = parseIso(today); from = iso(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28), 12)); }
    } else if (/\bchristmas\b|\bxmas\b/.test(low)) from = nextDate(11, 21, today);
    else if (/\bnew year/.test(low)) from = nextDate(11, 29, today);
    else if (/\bthanksgiving\b/.test(low)) { let y = +today.slice(0, 4); let d = addDays(thanksgiving(y), -1); if (d < today) d = addDays(thanksgiving(y + 1), -1); from = d; }
    else if (/\bspring break\b/.test(low)) from = nextDate(2, 14, today);
    else if (/\b(?:summer|summer holidays?)\b/.test(low)) from = nextDate(6, 15, today);
    else if (/\beaster\b/.test(low)) from = nextDate(3, 1, today);
    if (/\blong weekend\b|\bweekend\b/.test(low) && from && !/\b(?:this|next|the coming) weekend\b/.test(low)) { /* "a long weekend in May": start on a Friday */
      if (parseIso(from).getDay() !== 5) from = nextDow(addDays(from, -1), 5, 1);
    }
    if (from && from < today) from = "";
    if (from) { out.from = from; found.add("from"); }
    if (!isNaN(nights) && nights > 0) { out.nights = Math.min(21, nights); found.add("nights"); }
  }

  function words(t, out, found) {
    const low = t.toLowerCase();
    const pick = (map) => { for (const [v, re] of map) if (re.test(low)) return v; return ""; };
    const pace = pick([["relaxed", /\b(?:relaxed|relaxing|slow|chill|chilled|easy[- ]going|laid[- ]back|take it easy|unhurried|lazy|gentle)\b/], ["packed", /\b(?:packed|busy|full[- ]on|action[- ]packed|see (?:it all|everything)|go[- ]go|fast[- ]paced|jam[- ]packed)\b/], ["balanced", /\b(?:balanced|a (?:bit of )?mix|moderate pace|in between|steady)\b/]]);
    if (pace) { out.pace = pace; found.add("pace"); }
    const budget = pick([["comfort", /\b(?:mid|mid-range|midrange|middle|moderate|medium|comfortable|comfort|sensible|reasonable)\s*(?:-\s*)?(?:budget|range|price[ds]?|priced)?\b(?=[^.]*\b(?:budget|range|price|priced|spend)\b)|\bmid[- ]?(?:budget|range)\b|\bcomfortable\b/], ["luxury", /\b(?:luxury|luxurious|splurge|high[- ]end|five[- ]star|5[- ]star|top[- ]end|lavish|treat ourselves|no expense)\b/], ["value", /\b(?:on a budget|budget|cheap|affordable|value|good value|thrifty|save money|low[- ]cost|tight budget|inexpensive)\b/]]);
    if (budget) { out.budget = budget; found.add("budget"); }
    const INT = [
      ["parks", /\b(?:theme parks?|parks|disney|disney world|universal|seaworld|sea world|epcot|magic kingdom|legoland|rides?|roller ?coasters?|epic universe|animal kingdom|hollywood studios)\b/],
      ["golf", /\b(?:golf|golfing|tee times?|fairways?)\b/],
      ["dining", /\b(?:food|foodie|good food|restaurants?|dining|eat(?:ing)? out|eat well|cuisine|brunch|fine dining|chefs?|wine|tasting)\b/],
      ["nightlife", /\b(?:nightlife|night ?life|bars?|clubs?|clubbing|cocktails?|live music|comedy|jazz|late nights?)\b/],
      ["shopping", /\b(?:shopping|shops?|outlets?|malls?|markets?|boutiques?)\b/],
      ["nature", /\b(?:nature|outdoors?|outdoor|springs|lakes?|gardens?|wildlife|hiking|hikes?|kayak(?:ing)?|airboats?|manatees?|trails?|beach(?:es)?)\b/],
      ["wellness", /\b(?:wellness|spa|spas|yoga|massage|relaxation|pool time|well-being|wellbeing)\b/],
      ["sports", /\b(?:sports?|games?|football|soccer|basketball|baseball|hockey|nba|magic game|orlando city|matches?)\b/],
      ["culture", /\b(?:culture|cultural|museums?|art|arts|galleries|gallery|theatre|theater|shows?|history|concerts?|festivals?|broadway)\b/],
    ];
    const ints = INT.filter(([, re]) => re.test(low)).map(([v]) => v);
    if (ints.length) { out.interests = ints; found.add("interests"); }
    const ACC = [
      ["step-free", /\b(?:wheelchair|wheel chair|step[- ]free|ramps?|accessible rooms?|power chair|scooter)\b/],
      ["limited-walking", /\b(?:limited walking|mobility|can(?:no|')t walk (?:far|much|long)|walker|walking frame|walking stick|cane|bad knees?|hip replacement|tire[sd]? easily|not walk too much)\b/],
      ["sensory", /\b(?:sensory|autis(?:m|tic)|asd|adhd|quiet(?:er)? options?|noise[- ]sensitive|loud noises?|overwhelm)\b/],
      ["stroller", /\b(?:stroller|pushchair|pram|buggy|baby carriage)\b/],
      ["hearing", /\b(?:deaf|hard of hearing|hearing (?:aid|loss|impair\w*|access)|asl|sign language|captions?)\b/],
      ["sight", /\b(?:blind|visually impaired|low vision|sight (?:loss|impair\w*|access)|guide dog)\b/],
    ];
    const acc = ACC.filter(([, re]) => re.test(low)).map(([v]) => v);
    if (acc.length) { out.access = acc; found.add("access"); }
  }

  function parse(text, opts) {
    opts = opts || {};
    const today = /^\d{4}-\d{2}-\d{2}$/.test(opts.today || "") ? opts.today : iso(new Date());
    const t = String(text || "").normalize("NFKC").replace(/[’‘]/g, "'").slice(0, 600);
    const out = {}, found = new Set();
    if (t.trim()) {
      party(t, out, found);
      dates(t, today, out, found);
      words(t, out, found);
      const home = airports(t, opts.routes);
      if (home) { out.home = home; found.add("home"); }
    }
    return { fields: out, found: FIELDS.filter((f) => found.has(f)) };
  }

  /* strict schema for an AI reply: { adults?, kids?, kid_ages?, pace?, interests?, budget?, from?, nights?, home?, access? }.
     Unknown keys, wrong types or out-of-range values make the whole reply invalid (the caller then uses parse()). */
  function validate(obj, opts) {
    opts = opts || {};
    const today = opts.today || iso(new Date());
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out = {}, found = [];
    for (const k of Object.keys(obj)) if (!FIELDS.includes(k)) return null;
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    for (const k of FIELDS) {
      const v = obj[k];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length && k !== "kid_ages")) continue;
      if (k === "adults" && !int(v, 1, 12)) return null;
      if (k === "kids" && !int(v, 0, 10)) return null;
      if (k === "nights" && !int(v, 1, 21)) return null;
      if (k === "kid_ages" && !(Array.isArray(v) && v.length <= 10 && v.every((a) => int(a, 0, 17)))) return null;
      if (k === "pace" && !PACES.includes(v)) return null;
      if (k === "budget" && !BUDGETS.includes(v)) return null;
      if (k === "interests" && !(Array.isArray(v) && v.every((x) => INTERESTS.includes(x)))) return null;
      if (k === "access" && !(Array.isArray(v) && v.every((x) => ACCESS.includes(x)))) return null;
      if (k === "from" && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parseIso(v)) && v >= today && v <= addDays(today, 730))) return null;
      if (k === "home" && !(typeof v === "string" && /^[A-Za-z]{3}$/.test(v))) return null;
      if (k === "kid_ages" && !v.length) continue;
      out[k] = k === "home" ? v.toUpperCase() : k === "kid_ages" ? v.slice() : Array.isArray(v) ? [...new Set(v)] : v; found.push(k); /* twins keep both ages */
    }
    if (out.kid_ages && out.kids != null && out.kid_ages.length > out.kids) out.kid_ages = out.kid_ages.slice(0, out.kids);
    return { fields: out, found };
  }

  /* the ONE follow-up: dates and/or home airport, whichever is still empty after merging */
  function followUp(trip) {
    const noDate = !trip || !trip.from, noHome = !trip || !trip.home;
    if (noDate && noHome) return { ask: "When are you arriving, and which city or airport are you flying from?", need: ["from", "home"] };
    if (noDate) return { ask: "When are you arriving? A month or a date is fine, like “mid April” or “April 10”.", need: ["from"] };
    if (noHome) return { ask: "Which city or airport are you flying from?", need: ["home"] };
    return { ask: "", need: [] };
  }

  return { parse, validate, followUp, airports, CITY, FIELDS, PACES, BUDGETS, INTERESTS, ACCESS, monthStart, nextDate };
});
