/* Node checks for the My Preferences trip fields in assets/js/profile.js (tag t in ?p=). Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const P = require(path.join(__dirname, "..", "..", "assets", "js", "profile.js"));
const brands = require(path.join(__dirname, "..", "..", "data", "brands.json"));
const bIdx = P.brandIndex(brands);
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const known = { events: new Set(), hotels: new Set(["swan"]), brands: bIdx };

t("cleanTrip keeps the listed topics and drops out-of-range numbers", () => {
  const c = P.cleanTrip({ adults: 40, kids: 3, kid_ages: [4, 30, "7", 9, 11], pace: "packed", interests: ["golf", "hacking", "parks"], budget: "luxury", from: "2027-02-10", nights: 99, home: "edi", access: ["stroller", "x"], access_note: "Wheelchair <b>" });
  assert.strictEqual(c.adults, 2); assert.strictEqual(c.kids, 3); assert.deepStrictEqual(c.kid_ages, [4, 7, 9]);
  assert.strictEqual(c.pace, "packed"); assert.deepStrictEqual(c.interests, ["parks", "golf"]); assert.strictEqual(c.budget, "luxury");
  assert.strictEqual(c.nights, 0); assert.strictEqual(c.home, "EDI"); assert.deepStrictEqual(c.access, ["stroller"]);
  assert.ok(!c.access_note.includes("<"));
});
t("the nine interests and the topic lists are as briefed", () => {
  assert.deepStrictEqual(P.INTERESTS, ["parks", "golf", "dining", "nightlife", "shopping", "nature", "wellness", "sports", "culture"]);
  assert.deepStrictEqual(P.PACE, ["relaxed", "balanced", "packed"]);
});
t("defaults alone are not a trip", () => {
  assert.strictEqual(P.cleanTrip({ adults: 2 }), null); assert.ok(P.isEmpty(P.normalise({ trip: { adults: 2 } })));
});
t("trip survives the share link round trip alongside the rest", () => {
  const trip = P.cleanTrip({ adults: 1, kids: 1, kid_ages: [5], pace: "relaxed", interests: ["nature"], from: "2026-12-01", nights: 3, home: "LHR", access: ["sensory"], access_note: "quiet rooms" });
  const prof = P.normalise({ hotels: ["swan"], trip });
  const url = P.shareUrl("https://x.org/profile/", prof, bIdx);
  const r = P.decode(new URL(url).searchParams.get("p"), known);
  assert.deepStrictEqual(r.profile.trip, trip); assert.deepStrictEqual(r.profile.hotels, ["swan"]); assert.strictEqual(r.itinerary, "");
});
t("an itinerary token rides along as tag i; junk i is counted unknown", () => {
  const url = P.shareUrl("https://x.org/profile/", P.normalise({}), bIdx, "jabc_-");
  const r = P.decode(new URL(url).searchParams.get("p"), known);
  assert.strictEqual(r.itinerary, "jabc_-");
  const bad = P.decode("i<script>", known); assert.strictEqual(bad.itinerary, ""); assert.ok(bad.unknown >= 1);
});
t("merge keeps your own trip over a shared one", () => {
  const a = P.normalise({ trip: P.cleanTrip({ pace: "packed" }) }), b = P.normalise({ trip: P.cleanTrip({ pace: "relaxed" }) });
  assert.strictEqual(P.merge(a, b).trip.pace, "packed"); assert.strictEqual(P.merge(P.normalise({}), b).trip.pace, "relaxed");
});
console.log(`profile trip: ${n} checks passed`);
