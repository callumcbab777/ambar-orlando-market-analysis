/* Node checks for assets/js/knowledge.js retrieval over data/knowledge.json (run by tests/test_round3.py). */
"use strict";
const assert = require("assert");
const path = require("path");
const K = require(path.join(__dirname, "..", "..", "assets", "js", "knowledge.js"));
const ix = K.createIndex(require(path.join(__dirname, "..", "..", "data", "knowledge.json")));
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const ids = (q, o) => K.search(ix, q, Object.assign({ k: 3 }, o)).map((r) => r.doc.id);

t("How do I get from Miami? → Brightline on the visit page", () => {
  const r = K.search(ix, "How do I get from Miami?", { k: 3 });
  assert.ok(r[0].doc.id.startsWith("page:visit:brightline"), ids("How do I get from Miami?").join());
  assert.strictEqual(r[0].doc.url, "visit/#brightline");
  assert.ok(/gobrightline|MiamiCentral/.test(r.map((x) => x.doc.text).join(" ")));
});
t("Which Marriott brands are in Orlando? → the verified Marriott brand list", () => {
  const top = K.search(ix, "Which Marriott brands are in Orlando?", { k: 3 })[0].doc;
  assert.strictEqual(top.id, "brands:marriott");
  assert.ok(top.as_of && top.text.includes("Apartments by Marriott Bonvoy"));
});
t("What's AMBAR? → the AMBAR doc", () => {
  assert.strictEqual(ids("What's AMBAR?")[0], "ambar");
  assert.strictEqual(ids("what is ambar")[0], "ambar");
});
t("my saved hotels → profile hotels first, then each hotel's doc", () => {
  const r = ids("my saved hotels", { k: 4, profile: { hotels: ["swan", "conrad-evermore", "not-real"], brands: [], events: [] } });
  assert.deepStrictEqual(r.slice(0, 3), ["profile:hotels", "hotel:swan", "hotel:conrad-evermore"]);
  const empty = ids("my saved hotels", { k: 2, profile: null });
  assert.strictEqual(empty[0], "page:profile:mine");
});
t("profile docs resolve brands and events", () => {
  const d = K.profileDocs(ix, { hotels: [], brands: ["jw-marriott", "nope"], events: [{ title: "Jazz", start_date: "2026-11-01", end_date: "2026-11-02" }], prefs: { cats: ["Arts"], budget: "free" } });
  assert.deepStrictEqual(d.map((x) => x.id), ["profile:brands", "profile:events", "profile:prefs"]);
  assert.ok(d[0].text.includes("Marriott International: JW Marriott") && !d[0].text.includes("nope"));
  assert.ok(d[1].text.includes("Jazz (2026-11-01 to 2026-11-02)"));
});
t("other site questions land on the right page", () => {
  assert.ok(ids("direct flights from London Gatwick")[0].startsWith("page:visit:getting-here"));
  assert.ok(["page:visit:best-time", "climate:months"].includes(ids("best time to visit weather")[0]));
  assert.strictEqual(ids("Hilton hotels in Orlando")[0], "brands:hilton");
  assert.ok(ids("how are rates gathered methodology").includes("method:rates"));
});
t("tokens fold accents, possessives and synonyms", () => {
  assert.deepStrictEqual(K.tokens("What's AMBAR’s café?"), ["ambar", "cafe"]);
  assert.deepStrictEqual(K.tokens("train flights"), ["brightline", "flight"]);
  assert.deepStrictEqual(K.search(ix, "the of and", {}), []);
});
t("snippet centres on the query", () => {
  const d = ix.byId.get("brands:marriott");
  const s = K.snippet(d, "Westin", 120);
  assert.ok(s.includes("Westin") && s.length <= 125, s);
});
const TODAY = "2026-10-31";   // a Saturday inside the captured window (Oct 26 – Nov 26, 2026)
const evHits = (q, k) => K.search(ix, q, { k: k || 5, today: TODAY });
const overlaps = (d, a, b) => d.start <= b && d.end >= a;
t("event docs: one per listing with date range, venue and Visit Orlando source link", () => {
  const evs = ix.docs.filter((d) => d.kind === "event");
  const raw = require(path.join(__dirname, "..", "..", "data", "visitorlando_events.json"));
  assert.strictEqual(evs.length, raw.events.length);
  for (const d of evs) {
    assert.ok(/^https:\/\/www\.visitorlando\.com\/event\//.test(d.url), d.id);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.start) && d.end >= d.start, d.id);
    assert.ok(d.text.includes(d.url) && d.text.includes(d.start) && d.source === "Visit Orlando" && d.as_of, d.id);
  }
  const cur = ix.byId.get("events:currency");
  assert.ok(cur && cur.captured === "2026-10-26" && cur.window_start === "2026-10-26" && cur.window_end === "2026-11-26");
  assert.ok(/captured on Oct 26, 2026, covering events from Oct 26, 2026 to Nov 26, 2026/.test(cur.text) && /check each event's Visit Orlando link/.test(cur.text));
});
t("parseWhen turns dates in a question into a window", () => {
  const w = (q) => { const r = K.parseWhen(q, TODAY); return r && [r.from, r.to]; };
  assert.deepStrictEqual(w("what's on this weekend"), ["2026-10-31", "2026-11-01"]);
  assert.deepStrictEqual(K.parseWhen("concerts this weekend", "2026-10-28").from, "2026-10-31");
  assert.deepStrictEqual(w("events in November"), ["2026-11-01", "2026-11-30"]);
  assert.deepStrictEqual(w("tomorrow"), ["2026-11-01", "2026-11-01"]);
  assert.deepStrictEqual(w("Nov 14th"), ["2026-11-14", "2026-11-14"]);
  assert.deepStrictEqual(w("next week"), ["2026-11-02", "2026-11-08"]);
  assert.strictEqual(K.parseWhen("may I book a visit?", TODAY), null);
  assert.strictEqual(K.parseWhen("How do I get from Miami?", TODAY), null);
});
t("what's on this weekend → listings overlapping Oct 31 – Nov 1, plus the currency note", () => {
  const r = evHits("What's on this weekend?");
  const evs = r.filter((x) => x.doc.kind === "event");
  assert.ok(evs.length >= 4 && evs.every((x) => overlaps(x.doc, "2026-10-31", "2026-11-01")), r.map((x) => x.doc.id).join());
  assert.strictEqual(r[0].doc.kind, "event");
  assert.ok(r.some((x) => x.doc.id === "events:currency"));
});
t("events in November → November listings only", () => {
  const r = evHits("events in November");
  const evs = r.filter((x) => x.doc.kind === "event");
  assert.ok(evs.length >= 4 && evs.every((x) => overlaps(x.doc, "2026-11-01", "2026-11-30")));
  assert.ok(r.some((x) => x.doc.id === "events:currency"));
});
t("concerts → listings in Concerts and Live Shows that haven't ended", () => {
  const evs = evHits("concerts").filter((x) => x.doc.kind === "event");
  assert.ok(evs.length >= 4 && evs.every((x) => x.doc.tags.includes("Concerts and Live Shows") && x.doc.end >= TODAY), evs.map((x) => x.doc.title).join(" | "));
  const wk = evHits("concerts this weekend").filter((x) => x.doc.kind === "event");
  assert.ok(wk.length >= 3 && wk.every((x) => overlaps(x.doc, "2026-10-31", "2026-11-01") && /concert/i.test(x.doc.text)));
});
t("a named event → that listing first, with its source link", () => {
  const r = evHits("Thriller Halloween Bar Crawl");
  assert.strictEqual(r[0].doc.id, "event:34203");
  assert.strictEqual(evHits("Golden Girls: The Laughs Continue")[0].doc.id, "event:34766");
});
t("dates without event words don't hijack site questions; out-of-window dates lead with the currency note", () => {
  assert.ok(["page:visit:best-time", "climate:months"].includes(evHits("best time to visit in November")[0].doc.id));
  assert.strictEqual(evHits("events in December")[0].doc.id, "events:currency");
  assert.ok(evHits("is the events data up to date?").some((x) => x.doc.id === "events:currency"));
  assert.ok(!evHits("How do I get from Miami?", 3).some((x) => x.doc.kind === "event"));
});
console.log(`knowledge: ${n} checks passed`);
