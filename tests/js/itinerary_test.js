/* Node checks for assets/js/itinerary.js (+ the ?p= share link from profile.js):
   generator, AMBAR visit = Calendly only, edit helpers, and the share-URL round trip. Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const J = (...p) => path.join(__dirname, "..", "..", ...p);
const I = require(J("assets", "js", "itinerary.js"));
const F = require(J("assets", "js", "flights.js"));
const P = require(J("assets", "js", "profile.js"));
const events = require(J("data", "visitorlando_events.json")).events;
const db = require(J("data", "comps.json"));
const brands = require(J("data", "brands.json"));
const CAL = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar";
let n = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const T = "2026-11-03";
const trip = { adults: 2, kids: 2, kid_ages: [6, 9], pace: "balanced", interests: ["parks", "dining", "culture"], budget: "comfort", from: "2026-11-12", nights: 4, home: "LGW", access: [], access_note: "" };
const gen = (tr, extra = {}) => I.generate({ trip: tr, today: T, events, db, favs: [], flights: F, ...extra });
const all = (it) => it.days.flatMap((d) => d.items);
const ctx = (it) => ({ root: "../", events: new Map(events.map((e) => [String(e.id), e])), hotels: new Map(db.hotels.map((h) => [h.id, h])), flights: F, start: it.start, end: I.addDays(it.start, it.days.length - 1) });

t("one day per night + 1, starting on the trip date", () => {
  const it = gen(trip);
  assert.strictEqual(it.start, "2026-11-12"); assert.strictEqual(it.days.length, 5);
});
t("day 1 = flight from the home airport + hotel; the last day = drive to the airport", () => {
  const it = gen(trip);
  assert.strictEqual(it.days[0].items[0].k, "f"); assert.strictEqual(it.days[0].items[0].ref, "LGW-MCO");
  assert.ok(it.days[0].items.some((x) => x.k === "h"));
  const last = it.days[4].items; assert.strictEqual(last[last.length - 1].k, "d");
});
t("exactly one AMBAR visit, on day 2, linking ONLY to the Calendly page", () => {
  const it = gen(trip);
  const a = all(it).filter((x) => x.k === "a");
  assert.strictEqual(a.length, 1); assert.ok(it.days[1].items.some((x) => x.k === "a"));
  assert.strictEqual(I.linkFor(a[0], ctx(it)), CAL);
  assert.ok(!/video|zoom|meet\b|teams/i.test(JSON.stringify(a[0])));
});
t("events are real listings that run on the day they're planned", () => {
  const it = gen(trip);
  const byId = new Map(events.map((e) => [String(e.id), e]));
  it.days.forEach((d, i) => d.items.filter((x) => x.k === "e").forEach((x) => {
    const e = byId.get(x.ref); assert.ok(e, x.ref);
    const day = I.addDays(it.start, i); assert.ok(e.start_date <= day && e.end_date >= day, `${e.title} on ${day}`);
    assert.ok(/^https:\/\/www\.visitorlando\.com\//.test(I.linkFor(x, ctx(it))));
  }));
  const ids = all(it).filter((x) => x.k === "e").map((x) => x.ref);
  assert.strictEqual(new Set(ids).size, ids.length, "no event twice");
});
t("pace sets how full a day is", () => {
  const busy = (p) => Math.max(...gen({ ...trip, pace: p }).days.slice(1, -1).map((d) => d.items.length));
  assert.ok(busy("relaxed") <= 2); assert.ok(busy("packed") >= busy("relaxed"));
});
t("a seasonal home route off-season falls back to a generic search with the reason", () => {
  const it = gen({ ...trip, home: "EDI", from: "2026-12-01" });
  const f = it.days[0].items[0];
  assert.strictEqual(f.k, "f"); assert.ok(/returns Mar 2027/.test(f.note), f.note);
  assert.ok(I.linkFor(f, ctx(it)).startsWith("https://www.google.com/travel/flights?q=Flights%20to%20MCO"));
});
t("the flight link uses the trip dates (out on day 1, back on the last day)", () => {
  const it = gen(trip);
  assert.strictEqual(I.linkFor(it.days[0].items[0], ctx(it)), F.gfUrl("LGW", "MCO", "2026-11-12", "2026-11-16"));
});
t("favourite hotel is used for check-in; an empty trip still works", () => {
  const it = gen(trip, { favs: ["ette-orlando"] });
  assert.ok(all(it).some((x) => x.k === "h" && x.ref === "ette-orlando"));
  const e = I.generate({ trip: {}, today: T, events, db, favs: [], flights: F });
  assert.ok(e.days.length >= 2); assert.strictEqual(all(e).filter((x) => x.k === "a").length, 1);
});
t("edit helpers: add, edit, move (across days), remove; AMBAR can't be removed", () => {
  let it = gen(trip);
  it = I.addItem(it, 2, { title: "Pool afternoon", time: "pm", note: "Take it easy" });
  const d2 = it.days[2].items; assert.strictEqual(d2[d2.length - 1].title, "Pool afternoon");
  it = I.editItem(it, 2, d2.length - 1, { title: "Pool + ice cream", time: "eve" });
  assert.strictEqual(it.days[2].items[d2.length - 1].title, "Pool + ice cream");
  const first3 = it.days[3].items[0];
  const mv = I.moveItem(it, 3, 0, -1); /* top of day 4 → end of day 3 */
  assert.strictEqual(mv.day, 2); assert.strictEqual(mv.it.days[2].items[mv.i].title, first3.title);
  it = mv.it;
  const ai = it.days[1].items.findIndex((x) => x.k === "a");
  assert.strictEqual(I.removeItem(it, 1, ai).days[1].items.filter((x) => x.k === "a").length, 1);
  const before = all(it).length; it = I.removeItem(it, 2, 0); assert.strictEqual(all(it).length, before - 1);
  it = I.addDay(it); assert.strictEqual(it.days.length, 6);
  it = I.removeDay(it, 1); assert.strictEqual(all(it).filter((x) => x.k === "a").length, 1, "AMBAR kept when its day is removed");
});
t("untrusted input is cleaned: bad kinds/refs become custom items, no script, caps hold", () => {
  const it = I.normalise({ start: "x", days: [{ items: [{ k: "e", ref: "javascript:1", title: "<b>Hi</b>" }, { k: "zz", title: "A" }, { k: "v", ref: "nope", title: "B" }] }] });
  assert.strictEqual(it.start, ""); assert.ok(all(it).every((x) => I.KINDS.includes(x.k)));
  assert.ok(!JSON.stringify(it).includes("<b>"));
  assert.strictEqual(all(it).filter((x) => x.k === "a").length, 1);
  const big = I.normalise({ days: Array.from({ length: 40 }, () => ({ items: Array.from({ length: 40 }, () => ({ title: "x".repeat(500) })) })) });
  assert.ok(big.days.length <= I.MAX.days && big.days.every((d) => d.items.length <= I.MAX.items));
});
t("share link round trip: trip + edited itinerary → ?p= → decode → identical", async () => {
  let it = gen(trip);
  it = I.addItem(it, 3, { title: "Family dinner · Disney Springs", time: "eve", note: "Book ahead" });
  it = I.moveItem(it, 2, 1, 1).it;
  const tok = await I.encode(it);
  assert.ok(/^[zj][A-Za-z0-9_-]+$/.test(tok)); assert.ok(tok.length < I.MAX.token);
  const bIdx = P.brandIndex(brands);
  const url = P.shareUrl("https://example.org/profile/", P.normalise({ trip }), bIdx, tok);
  assert.ok(url.length - url.indexOf("?") <= P.LIMITS.link, `link too long: ${url.length}`);
  const p = new URL(url).searchParams.get("p");
  const r = P.decode(p, { events: new Set(), hotels: new Set(db.hotels.map((h) => h.id)), brands: bIdx });
  assert.deepStrictEqual(r.profile.trip, P.cleanTrip(trip));
  assert.strictEqual(r.profile.events.length + r.profile.hotels.length, 0, "an itinerary link carries only the trip and the plan");
  const back = await I.decode(r.itinerary);
  assert.deepStrictEqual(back, I.normalise(it));
  /* the family edits it and shares it back */
  const edited = I.removeItem(back, 3, 0);
  const tok2 = await I.encode(edited);
  assert.deepStrictEqual(await I.decode(tok2), I.normalise(edited));
});
t("uncompressed j-tokens decode too; corrupt tokens are rejected", async () => {
  const it = gen(trip);
  const j = "j" + Buffer.from(JSON.stringify(I.compact(it))).toString("base64url");
  assert.deepStrictEqual(await I.decode(j), I.normalise(it));
  assert.strictEqual(await I.decode("zAAAA"), null); assert.strictEqual(await I.decode("x123"), null); assert.strictEqual(await I.decode(""), null);
});
t("PDF sections: one per day, AMBAR entry points at Calendly", () => {
  const it = gen(trip);
  const s = I.pdfSections(it, ctx(it));
  assert.strictEqual(s.length, it.days.filter((d) => d.items.length).length);
  const a = s.flatMap((x) => x.entries).find((e) => /AMBAR/.test(e.title));
  assert.strictEqual(a.url, CAL);
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; console.error(e); process.exit(1); } }
  console.log(`itinerary: ${n} checks passed`);
})();
