/* Node checks for assets/js/fav-hotels.js: favourite hotels show only the site's own comps data. Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const FH = require(path.join(__dirname, "..", "..", "assets", "js", "fav-hotels.js"));
const db = require(path.join(__dirname, "..", "..", "data", "comps.json"));
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const latest = db.weeks.filter((w) => w.status === "collected").map((w) => w.week).sort().pop();
const anyRate = db.rates.find((r) => r.status === "OK" && r.rate != null);

t("summary carries the hotel's comp facts (brand, tier, area, keys)", () => {
  for (const h of db.hotels) {
    const s = FH.summarize(db, h.id, latest);
    assert.strictEqual(s.name, h.name); assert.strictEqual(s.brand, h.brand || ""); assert.strictEqual(s.tier, h.tier || "");
    assert.strictEqual(s.area, h.area || ""); assert.strictEqual(s.keys, Number(h.keys) > 0 ? Number(h.keys) : null);
  }
});
t("tonight = the exact rate row in comps.json for that date", () => {
  const s = FH.summarize(db, anyRate.hotel, anyRate.date);
  assert.strictEqual(s.tonight.rate, Number(anyRate.rate)); assert.strictEqual(s.tonight.status, "OK");
});
t("a night with no row says 'Not collected' (never a guessed figure)", () => {
  const s = FH.summarize(db, db.hotels[0].id, "2030-01-01");
  assert.strictEqual(s.tonight.rate, null); assert.strictEqual(s.tonight.status, "Not collected");
});
t("an UNAVAILABLE row says 'No public rate'", () => {
  const u = db.rates.find((r) => r.status === "UNAVAILABLE");
  if (!u) return;
  assert.strictEqual(FH.summarize(db, u.hotel, u.date).tonight.status, "No public rate");
});
t("week ahead = mean of the priced nights in the latest collected week, from comps.json only", () => {
  for (const h of db.hotels) {
    const s = FH.summarize(db, h.id, latest);
    assert.strictEqual(s.weekAhead.week, latest);
    const ws = db.rates.filter((r) => r.hotel === h.id && r.week === latest && r.status === "OK" && r.rate != null).map((r) => Number(r.rate));
    assert.strictEqual(s.weekAhead.n, ws.length);
    if (ws.length) {
      assert.strictEqual(s.weekAhead.mean, Math.round(ws.reduce((a, b) => a + b, 0) / ws.length));
      assert.strictEqual(s.weekAhead.min, Math.min(...ws)); assert.strictEqual(s.weekAhead.max, Math.max(...ws));
    } else assert.strictEqual(s.weekAhead.mean, null);
  }
});
t("recent weeks include the missing week as 'Not collected'", () => {
  const s = FH.summarize(db, db.hotels[0].id, latest);
  assert.ok(s.recent.length <= 4 && s.recent.length > 0);
  const missingWeeks = db.weeks.filter((w) => w.status !== "collected").map((w) => w.week);
  for (const w of s.recent) if (missingWeeks.includes(w.week)) { assert.strictEqual(w.n, 0); assert.strictEqual(w.status, "Not collected"); }
  for (let i = 1; i < s.recent.length; i++) assert.ok(s.recent[i - 1].week > s.recent[i].week, "newest first");
});
t("unknown ids are reported as missing, not invented", () => {
  const all = FH.summarizeAll(db, [db.hotels[1].id, "not-a-hotel"], latest);
  assert.deepStrictEqual(all.hotels.map((h) => h.id), [db.hotels[1].id]); assert.deepStrictEqual(all.missing, ["not-a-hotel"]);
  assert.ok(/no longer in the comp set/.test(FH.panelHtml(all)));
});
t("a hotel with no rate rows renders gracefully", () => {
  const fake = { ...db, hotels: db.hotels.concat([{ id: "zz-test", name: "Test Hotel", brand: "X", tier: "Premium" }]) };
  const s = FH.summarize(fake, "zz-test", latest);
  assert.strictEqual(s.has_rates, false);
  const html = FH.cardHtml(s, { root: "../" });
  assert.ok(html.includes("Not collected")); assert.ok(!/\$\d/.test(html));
});
t("card HTML escapes text and links to the hotel card on the market page", () => {
  const fake = { ...db, hotels: [{ id: "x1", name: "<script>x</script>", brand: "B" }] };
  const html = FH.cardHtml(FH.summarize(fake, "x1", latest), { root: "../", rm: true });
  assert.ok(!html.includes("<script>")); assert.ok(html.includes('href="../index.html#hotel-x1"')); assert.ok(html.includes('data-rm-hotel="x1"'));
});
t("money figures on a card all come from comps.json", () => {
  const s = FH.summarize(db, anyRate.hotel, anyRate.date);
  const html = FH.cardHtml(s, {});
  const allowed = new Set(db.rates.filter((r) => r.hotel === anyRate.hotel && r.rate != null).map((r) => Number(r.rate)));
  const means = [s.weekAhead, ...s.recent].filter((w) => w.n).map((w) => w.mean);
  for (const m of html.matchAll(/\$([\d,]+)/g)) { const v = Number(m[1].replace(/,/g, "")); assert.ok(allowed.has(v) || means.includes(v), `$${v}`); }
});
console.log(`fav hotels: ${n} checks passed`);
