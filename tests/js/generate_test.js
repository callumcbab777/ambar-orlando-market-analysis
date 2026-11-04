/* Node checks for the Travel Concierge "Generate" button (assets/js/itinerary.js): seeded variation, avoiding the
   previous plan's picks, AI "prefer" ids, Keep my edits vs Regenerate all, and the seed in the share link. Exit 1 on failure. */
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
const T = "2026-11-03";
const trip = { adults: 2, kids: 2, kid_ages: [3, 6], pace: "balanced", interests: ["parks", "dining", "culture"], budget: "comfort", from: "2026-11-12", nights: 4, home: "MAN", access: [], access_note: "" };
const gen = (extra = {}) => I.generate({ trip, today: T, events, db, favs: [], flights: F, ...extra });
const evs = (it) => I.picksOf(it).filter((x) => x.startsWith("e:"));
let n = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t("no seed → the same plan every time (Start again stays predictable)", () => {
  assert.deepStrictEqual(gen(), gen());
});
t("same seed → same plan; consecutive seeds → different picks", () => {
  assert.deepStrictEqual(gen({ seed: 42 }), gen({ seed: 42 }));
  const seen = new Set();
  let prev = null;
  for (let s = 1; s <= 6; s++) {
    const it = gen({ seed: s, avoid: prev ? I.picksOf(prev) : [] });
    const key = evs(it).join(",");
    if (prev) assert.notStrictEqual(key, evs(prev).join(","), `seed ${s} repeated the previous plan`);
    seen.add(key); prev = it;
  }
  assert.ok(seen.size >= 5, `only ${seen.size} distinct plans in 6 presses`);
});
t("avoid: a new version mostly swaps out the previous picks", () => {
  const a = gen({ seed: 7 });
  const b = gen({ seed: 8, avoid: I.picksOf(a) });
  const old = new Set(evs(a)), now = evs(b);
  const same = now.filter((x) => old.has(x)).length;
  assert.ok(now.length && same <= Math.floor(now.length / 2), `${same}/${now.length} picks repeated`);
});
t("every generated event is a real listing in the trip window; AMBAR visit always present", () => {
  const ids = new Set(events.map((e) => String(e.id)));
  for (let s = 100; s < 110; s++) {
    const it = gen({ seed: s });
    for (const x of evs(it)) assert.ok(ids.has(x.slice(2)), x);
    assert.ok(it.days.flatMap((d) => d.items).some((x) => x.k === "a"));
  }
});
t("prefer (validated AI ids) are honoured when they fit", () => {
  const base = new Set(evs(gen({ seed: 3 })));
  const want = evs(gen({ seed: 99, avoid: [...base] })).filter((x) => !base.has(x)).slice(0, 3).map((x) => x.slice(2));
  assert.ok(want.length >= 2);
  const it = gen({ seed: 3, prefer: want });
  const got = new Set(evs(it).map((x) => x.slice(2)));
  assert.ok(want.filter((id) => got.has(id)).length >= 2, "most preferred ids used");
});
t("edits are pinned; Keep my edits keeps them, Regenerate all doesn't", () => {
  let it = gen({ seed: 11 });
  assert.ok(!I.hasEdits(it));
  it = I.addItem(it, 1, { k: "c", title: "Lunch with Gran", time: "mid", note: "" });
  it = I.editItem(it, 0, 0, { note: "Early start" });
  assert.ok(I.hasEdits(it));
  const fresh = gen({ seed: 12, avoid: I.picksOf(it) });
  const kept = I.keepEdits(fresh, it);
  const all = kept.days.flatMap((d) => d.items);
  assert.ok(all.some((x) => x.title === "Lunch with Gran" && x.p));
  assert.ok(all.some((x) => x.note === "Early start" && x.p));
  assert.ok(kept.days[1].items.some((x) => x.title === "Lunch with Gran"), "kept on the same day");
  assert.ok(!fresh.days.flatMap((d) => d.items).some((x) => x.title === "Lunch with Gran"), "Regenerate all drops it");
  assert.strictEqual(all.filter((x) => x.k === "a").length, 1, "one AMBAR visit, never duplicated");
  assert.strictEqual(kept.seed, fresh.seed);
});
t("share round trip keeps the seed and the edited/pinned items", async () => {
  let it = gen({ seed: 987654321 });
  it = I.addItem(it, 0, { k: "c", title: "Pool afternoon", time: "aft", note: "" });
  const tok = await I.encode(it);
  const url = P.shareUrl("https://example.org/profile/", P.normalise({ trip }), P.brandIndex(brands), tok);
  assert.ok(url.length - url.indexOf("?") <= P.LIMITS.link);
  const r = P.decode(new URL(url).searchParams.get("p"), { events: new Set(), hotels: new Set(db.hotels.map((h) => h.id)), brands: P.brandIndex(brands) });
  const back = await I.decode(r.itinerary);
  assert.deepStrictEqual(back, I.normalise(it));
  assert.strictEqual(back.seed, 987654321);
  assert.ok(I.hasEdits(back));
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; console.error(e); process.exit(1); } }
  console.log(`generate: ${n} checks passed`);
})();
