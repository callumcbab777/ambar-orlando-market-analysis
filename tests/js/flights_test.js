/* Node checks for assets/js/flights.js: Google Flights links, ~1 month dates, seasonal logic. Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const F = require(path.join(__dirname, "..", "..", "assets", "js", "flights.js"));
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const T = "2026-11-03";

t("gfUrl builds the Google Flights query (origin, Orlando airport, dates)", () => {
  assert.strictEqual(F.gfUrl("LHR", "MCO", "2026-12-03", ""), "https://www.google.com/travel/flights?q=Flights%20to%20MCO%20from%20LHR%20on%202026-12-03");
  assert.strictEqual(F.gfUrl("LHR", "MCO", "2026-12-03", "2026-12-10"), "https://www.google.com/travel/flights?q=Flights%20to%20MCO%20from%20LHR%20on%202026-12-03%20through%202026-12-10");
  assert.strictEqual(F.gfUrl("", "SFB", "2026-12-03", ""), "https://www.google.com/travel/flights?q=Flights%20to%20SFB%20on%202026-12-03");
});
t("year-round routes link about a month out (today + 30), return a week later", () => {
  const p = F.plan("LHR-MCO", T);
  assert.ok(p.live); assert.strictEqual(p.date, "2026-12-03"); assert.strictEqual(p.ret, "2026-12-10");
  assert.ok(p.url.includes("from%20LHR%20on%202026-12-03"));
  assert.strictEqual(F.plan("LHR-MCO", "2027-01-31").date, "2027-03-02"); /* month/year rollover */
});
t("every route key is ORIG-DEST with an Orlando-area destination", () => {
  for (const k of Object.keys(F.ROUTES)) assert.ok(/^(?:[A-Z]{3}|ANY)-(?:MCO|SFB|MLB)$/.test(k), k);
});
t("every seasonal route has a source and seasons, or is flagged unverified", () => {
  for (const [k, r] of Object.entries(F.ROUTES)) if (r.seasonal) {
    assert.ok(Array.isArray(r.seasons), k);
    assert.ok(r.src || r.unverified, `${k} needs a source or unverified:true`);
    for (const s of r.seasons) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.from) && (!s.to || /^\d{4}-\d{2}-\d{2}$/.test(s.to)), k);
  }
});
t("off-season Edinburgh shows 'Seasonal, returns Mar 2027' and no link", () => {
  const p = F.plan("EDI-MCO", T);
  assert.strictEqual(p.live, false); assert.strictEqual(p.returns, "2027-03-31");
  assert.strictEqual(p.label, "Seasonal, returns Mar 2027");
});
t("in season, the link uses a date inside the season", () => {
  const p = F.plan("EDI-MCO", "2027-05-01");
  assert.ok(p.live); assert.strictEqual(p.date, "2027-05-31");
  const q = F.plan("EDI-MCO", "2027-03-10"); /* today+30 is Apr 9: inside the 2027 season */
  assert.ok(q.live); assert.ok(q.date >= "2027-03-31" && q.date <= "2027-10-06", q.date);
  const r = F.plan("EDI-MCO", "2027-09-20"); /* today+30 = Oct 20 is after the season: use a date in the window that is still in season */
  assert.ok(!r.live || r.date <= "2027-10-06", JSON.stringify(r));
});
t("LGA–MLB flies weekends Dec 19 – May 2: off now, live (on a Sat/Sun) in season", () => {
  const off = F.plan("LGA-MLB", T);
  assert.strictEqual(off.live, false); assert.strictEqual(off.label, "Seasonal, returns Dec");
  const on = F.plan("LGA-MLB", "2026-12-15");
  assert.ok(on.live); assert.ok([0, 6].includes(new Date(on.date + "T12:00:00Z").getUTCDay()), on.date);
  assert.ok(on.date >= "2026-12-19" && on.date <= "2027-05-02");
});
t("TUI seasons are unverified and say so; Birmingham has no current schedule", () => {
  const p = F.plan("LGW-MLB", T);
  assert.strictEqual(p.live, false); assert.ok(/check with TUI/.test(p.label), p.label);
  assert.ok(F.ROUTES["LGW-MLB"].unverified);
  const b = F.plan("BHX-MLB", T);
  assert.strictEqual(b.live, false); assert.ok(/not on a current schedule/.test(b.label), b.label);
});
t("a future start date (Belize) links from the first flight, never before it", () => {
  const p = F.plan("BZE-SFB", T);
  assert.ok(p.live); assert.ok(p.date >= F.ROUTES["BZE-SFB"].start, p.date);
});
t("Concierge fixed dates are kept or explained, never silently moved", () => {
  const p = F.plan("LHR-MCO", T, { date: "2027-01-10", ret: "2027-01-15" });
  assert.ok(p.live); assert.strictEqual(p.date, "2027-01-10"); assert.strictEqual(p.ret, "2027-01-15");
  const q = F.plan("EDI-MCO", T, { date: "2026-12-01" });
  assert.strictEqual(q.live, false); assert.strictEqual(q.returns, "2027-03-31");
});
t("fromHome lists a city's routes; fmtMonth adds the year only when it differs", () => {
  assert.deepStrictEqual(F.fromHome("EDI"), ["EDI-MCO"]);
  assert.strictEqual(F.fmtMonth("2026-12-19", T), "Dec");
  assert.strictEqual(F.fmtMonth("2027-03-31", T), "Mar 2027");
});
t("every route on the visit page has a data-fl key known to flights.js", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "visit", "index.html"), "utf8");
  const keys = [...html.matchAll(/data-fl="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 30, `only ${keys.length} links`);
  for (const k of keys) assert.ok(F.ROUTES[k], k);
  for (const k of Object.keys(F.ROUTES)) assert.ok(keys.includes(k), `route ${k} has no link on the page`);
});
console.log(`flights: ${n} checks passed`);
