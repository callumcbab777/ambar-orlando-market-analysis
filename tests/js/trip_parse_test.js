/* Node checks for assets/js/trip-parse.js: the Travel Concierge chat box → My Preferences fields,
   the strict validator for AI replies, and the one follow-up question. Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const J = (...p) => path.join(__dirname, "..", "..", ...p);
const TP = require(J("assets", "js", "trip-parse.js"));
const F = require(J("assets", "js", "flights.js"));
const P = require(J("assets", "js", "profile.js"));
const T = "2026-11-04";
const parse = (s, today = T) => TP.parse(s, { today, routes: F.ROUTES });
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; console.error(e); process.exit(1); } };

t("the brief's example sentence", () => {
  const r = parse("We're a family of 4 from Manchester, kids 3 and 6, a week in April, love theme parks and good food");
  const f = r.fields;
  assert.strictEqual(f.adults, 2); assert.strictEqual(f.kids, 2); assert.deepStrictEqual(f.kid_ages, [3, 6]);
  assert.strictEqual(f.from, "2027-04-01", "'in April' = the next April"); assert.strictEqual(f.nights, 7, "'a week' = 7");
  assert.strictEqual(f.home, "MAN");
  assert.ok(f.interests.includes("parks") && f.interests.includes("dining"));
  for (const k of ["adults", "kids", "kid_ages", "from", "nights", "home", "interests"]) assert.ok(r.found.includes(k), k);
  assert.ok(P.cleanTrip({ ...f, access_note: "" }), "result is a valid saved trip");
});
t("long weekend = 3 nights; luxury; London → LHR", () => {
  const f = parse("Just the two of us from London for a long weekend in March, something luxurious with spa time").fields;
  assert.strictEqual(f.nights, 3); assert.strictEqual(f.budget, "luxury"); assert.strictEqual(f.home, "LHR"); assert.strictEqual(f.adults, 2);
  assert.ok(/^2027-03-/.test(f.from)); assert.strictEqual(new Date(f.from + "T12:00").getDay(), 5, "a long weekend starts on a Friday"); assert.ok(f.interests.includes("wellness"));
});
t("explicit dates, wheelchair, Toronto", () => {
  const f = parse("3 adults flying from Toronto Dec 20 to Dec 27, my mum uses a wheelchair").fields;
  assert.strictEqual(f.adults, 3); assert.strictEqual(f.from, "2026-12-20"); assert.strictEqual(f.nights, 7);
  assert.strictEqual(f.home, "YYZ"); assert.ok(f.access.includes("step-free"));
});
t("next week for 5 days on a budget from New York", () => {
  const r = parse("Next week for 5 days from New York, cheap as possible, golf and nightlife");
  assert.strictEqual(r.fields.home, "JFK"); assert.strictEqual(r.fields.budget, "value");
  assert.strictEqual(r.fields.nights, 4, "5 days = 4 nights"); assert.ok(r.fields.from > T);
  assert.ok(r.fields.interests.includes("golf") && r.fields.interests.includes("nightlife"));
});
t("grandparents, stroller, sensory, Christmas", () => {
  const f = parse("Me, my husband, both grandparents and our toddler (2) over Christmas. We need a stroller and sensory-friendly places, relaxed pace").fields;
  assert.strictEqual(f.kids, 1); assert.deepStrictEqual(f.kid_ages, [2]); assert.ok(f.adults >= 4);
  assert.ok(f.access.includes("stroller") && f.access.includes("sensory")); assert.strictEqual(f.pace, "relaxed");
  assert.ok(/^2026-12-2/.test(f.from));
});
t("Dublin, 10 nights mid May, packed", () => {
  const f = parse("Flying from Dublin, 10 nights in mid May, we want packed days of parks and shopping").fields;
  assert.strictEqual(f.home, "DUB"); assert.strictEqual(f.nights, 10); assert.strictEqual(f.pace, "packed");
  assert.ok(/^2027-05-1/.test(f.from)); assert.ok(f.interests.includes("shopping"));
});
t("nothing trip-like → nothing filled; only stated fields are reported", () => {
  assert.deepStrictEqual(parse("hello there").found, []);
  assert.deepStrictEqual(parse("we love golf").found, ["interests"]);
});
t("'in April' when it's already April → next year unless days remain", () => {
  const f = parse("a week in April", "2027-04-20").fields;
  assert.ok(f.from >= "2027-04-20");
});
t("AI reply validator: strict schema", () => {
  const ok = TP.validate({ adults: 2, kids: 2, kid_ages: [3, 6], from: "2027-04-01", nights: 7, interests: ["parks", "dining"], home: "man" }, { today: T });
  assert.ok(ok); assert.strictEqual(ok.fields.home, "MAN"); assert.ok(ok.found.includes("kid_ages"));
  assert.strictEqual(TP.validate({ adults: 2, password: "x" }, { today: T }), null, "unknown key");
  assert.strictEqual(TP.validate({ adults: 99 }, { today: T }), null, "out of range");
  assert.strictEqual(TP.validate({ interests: ["skydiving"] }, { today: T }), null, "unknown interest");
  assert.strictEqual(TP.validate({ from: "2020-01-01" }, { today: T }), null, "past date");
  assert.strictEqual(TP.validate("nope", { today: T }), null);
  assert.strictEqual(TP.validate([], { today: T }), null);
});
t("one follow-up for the key missing items", () => {
  assert.deepStrictEqual(TP.followUp({ adults: 2 }).need, ["from", "home"]);
  assert.deepStrictEqual(TP.followUp({ adults: 2, from: "2027-04-01" }).need, ["home"]);
  assert.deepStrictEqual(TP.followUp({ adults: 2, home: "MAN" }).need, ["from"]);
  assert.strictEqual(TP.followUp({ from: "2027-04-01", home: "MAN" }).ask, "");
  assert.ok(!/quiz|test|score/i.test(TP.followUp({}).ask));
});
console.log(`trip parse: ${n} checks passed`);
