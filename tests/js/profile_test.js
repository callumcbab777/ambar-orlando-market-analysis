/* Node checks for assets/js/profile.js (run by tests/test_round3.py). Exit code 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const P = require(path.join(__dirname, "..", "..", "assets", "js", "profile.js"));
const brands = require(path.join(__dirname, "..", "..", "data", "brands.json"));
const comps = require(path.join(__dirname, "..", "..", "data", "comps.json"));
const bIdx = P.brandIndex(brands);
const hotels = new Set(comps.hotels.map((h) => h.id));
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };

t("migrates the old events keys into ambar.profile.v1", () => {
  const store = { "ambar.events.saved.v1": JSON.stringify([{ id: "123", title: "Jazz", url: "https://www.visitorlando.com/event/x/123/", start_date: "2026-11-01", end_date: "2026-11-01" }, { id: "bad id" }]),
    "ambar.events.prefs.v1": JSON.stringify({ cats: ["Concerts and Live Shows"], budget: "free", party: "family" }) };
  const m = P.migrate((k) => store[k] ?? null);
  assert.strictEqual(P.KEY, "ambar.profile.v1");
  assert.ok(m.migrated);
  assert.deepStrictEqual(m.profile.events.map((e) => e.id), ["123"]);
  assert.strictEqual(m.profile.prefs.budget, "free");
  assert.deepStrictEqual(m.profile.migrated_from, ["ambar.events.saved.v1", "ambar.events.prefs.v1"]);
});
t("an existing profile wins over legacy keys", () => {
  const store = { "ambar.profile.v1": JSON.stringify({ hotels: ["swan"] }), "ambar.events.saved.v1": "[]" };
  const m = P.migrate((k) => store[k] ?? null);
  assert.ok(!m.migrated); assert.deepStrictEqual(m.profile.hotels, ["swan"]);
});
t("normalise drops junk and non-Visit-Orlando urls, caps lists", () => {
  const p = P.normalise({ events: [{ id: "1", url: "javascript:alert(1)", title: "<b>x</b>" }], hotels: ["swan", "Swan!", "swan"], brands: Array.from({ length: 300 }, (_, i) => "b" + i), prefs: { cats: ["<script>"], budget: "x" } });
  assert.strictEqual(p.events[0].url, "");
  assert.deepStrictEqual(p.hotels, ["swan"]);
  assert.strictEqual(p.brands.length, P.LIMITS.brands);
  assert.strictEqual(p.prefs, null);
});
t("share link round-trip: events, hotels, brands, prefs; empty sections omitted", () => {
  const prof = P.normalise({ events: [{ id: "42" }, { id: "7" }], hotels: ["swan", "conrad-evermore"], brands: ["jw-marriott", "apartments"],
    prefs: { cats: ["Concerts and Live Shows"], areas: ["Winter Park"], budget: "free", party: "couple", keywords: ["jazz"], access: true } });
  const enc = P.encode(prof, bIdx);
  assert.ok(/^e42\.7~hswan\.conrad-evermore~b[a-z0-9.]+~p[A-Za-z0-9_-]+$/.test(enc), enc);
  assert.ok(enc.length < 200, "compact");
  const d = P.decode(enc, { events: new Set(["42", "7"]), hotels, brands: bIdx });
  assert.strictEqual(d.unknown, 0);
  assert.deepStrictEqual(d.profile.events.map((e) => e.id), ["42", "7"]);
  assert.deepStrictEqual(d.profile.hotels, prof.hotels);
  assert.deepStrictEqual(d.profile.brands, prof.brands);
  assert.deepStrictEqual(d.profile.prefs, prof.prefs);
  assert.strictEqual(P.encode(P.normalise({ hotels: ["swan"] }), bIdx), "hswan");
  assert.strictEqual(P.shareUrl("https://x.test/profile/?p=old#mine", P.empty(), bIdx), "https://x.test/profile/");
});
t("decode ignores and counts unknown or malformed items", () => {
  const d = P.decode("e1.abc.99~hnot-a-hotel.swan~bzz.~p!!!~xjunk", { events: new Set(["1"]), hotels, brands: bIdx });
  assert.deepStrictEqual(d.profile.events.map((e) => e.id), ["1"]);
  assert.deepStrictEqual(d.profile.hotels, ["swan"]);
  assert.ok(d.unknown >= 5, String(d.unknown));
  assert.deepStrictEqual(P.decode("x".repeat(10000), {}).profile.events, []);
});
t("brand codes are unique and short", () => {
  assert.strictEqual(bIdx.idToCode.size, bIdx.codeToId.size);
  for (const c of bIdx.codeToId.keys()) assert.ok(/^[a-z][0-9a-f]{1,2}$/.test(c), c);
});
t("merge keeps the owner's items first and adds the shared ones", () => {
  const m = P.merge({ hotels: ["swan"], prefs: { budget: "free", cats: ["Arts"] } }, { hotels: ["dolphin", "swan"], events: [{ id: "5" }], prefs: { budget: "any", cats: ["Sports"] } });
  assert.deepStrictEqual(m.hotels, ["swan", "dolphin"]);
  assert.deepStrictEqual(m.events.map((e) => e.id), ["5"]);
  assert.deepStrictEqual(m.prefs.cats, ["Arts"]);
});
t("isEmpty / counts", () => {
  assert.ok(P.isEmpty(P.empty()));
  assert.strictEqual(P.counts(P.normalise({ hotels: ["swan"], brands: ["westin"] })).total, 2);
});
t("Other brand: cleaned, capped at 60, saved, counted, merged", () => {
  assert.strictEqual(P.cleanOther("  <b>Kimpton</b>\n  Hotels  "), "b Kimpton /b Hotels");
  assert.strictEqual(P.cleanOther("Hôtel Café & Co. (Paris)"), "Hôtel Café & Co. (Paris)");
  assert.strictEqual(P.cleanOther("javascript:alert(1)"), "javascript alert(1)");
  assert.strictEqual(P.cleanOther("x".repeat(80)).length, 60);
  assert.strictEqual(P.cleanOther(42), "");
  const p = P.normalise({ other_brand: "  Omni   Hotels " });
  assert.strictEqual(p.other_brand, "Omni Hotels");
  assert.ok(!P.isEmpty(p));
  assert.deepStrictEqual([P.counts(p).brands, P.counts(p).total], [1, 1]);
  assert.strictEqual(P.merge({ other_brand: "Mine" }, { other_brand: "Theirs" }).other_brand, "Mine");
  assert.strictEqual(P.merge({}, { other_brand: "Theirs" }).other_brand, "Theirs");
});
t("Other brand round-trips through the ?p= share link; junk is dropped", () => {
  const enc = P.encode({ brands: ["westin"], other_brand: "Omni Hotels & Resorts" }, bIdx);
  assert.ok(/~o[A-Za-z0-9_-]+/.test(enc), enc);
  const d = P.decode(enc, { hotels, brands: bIdx });
  assert.deepStrictEqual(d.profile.brands, ["westin"]);
  assert.strictEqual(d.profile.other_brand, "Omni Hotels & Resorts");
  assert.strictEqual(d.unknown, 0);
  const bad = P.decode("o" + P.b64e("<<<>>>"), { brands: bIdx });
  assert.strictEqual(bad.profile.other_brand, ""); assert.strictEqual(bad.unknown, 1);
  const long = P.decode("o" + P.b64e("y".repeat(200)), { brands: bIdx });
  assert.strictEqual(long.profile.other_brand.length, 60);
});
t("old profiles with removed brands (Accor, Four Seasons, Choice, Best Western) load without them", () => {
  const removed = ["four-seasons-resort", "park-royal", "cambria", "ascend", "clarion", "comfort", "quality", "sleep-inn", "bw", "bw-plus"];
  for (const id of removed) assert.ok(!bIdx.idToCode.has(id), id + " should no longer be in data/brands.json");
  for (const pid of ["accor", "four-seasons", "choice", "best-western"]) assert.ok(!brands.parents.some((p) => p.id === pid), pid);
  const store = { "ambar.profile.v1": JSON.stringify({ brands: ["westin", ...removed, "hampton"], hotels: ["swan"] }) };
  const m = P.migrate((k) => store[k] ?? null);
  assert.deepStrictEqual(m.profile.brands, ["westin", "hampton"]);
  assert.strictEqual(P.counts(m.profile).total, 3);
  /* old share links with their codes: dropped and counted, never shown */
  const d = P.decode("bm5.f1.a1.c1.b2~hswan", { hotels, brands: bIdx });
  assert.deepStrictEqual(d.profile.brands, ["westin"]);
  assert.strictEqual(d.unknown, 4);
});
console.log(`profile: ${n} checks passed`);
