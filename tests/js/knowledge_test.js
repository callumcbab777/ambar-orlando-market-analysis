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
console.log(`knowledge: ${n} checks passed`);
