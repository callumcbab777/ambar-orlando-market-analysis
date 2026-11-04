/* Node checks for assets/js/events-ask.js ("Ask Isla what's on"): audience/date/category/keyword filtering, ranking,
   plain "nothing matches", and grounding: every answer link maps to a real event in data/visitorlando_events.json. */
"use strict";
const assert = require("assert");
const path = require("path");
const J = (...p) => path.join(__dirname, "..", "..", ...p);
const A = require(J("assets", "js", "events-ask.js"));
const events = require(J("data", "visitorlando_events.json")).events;
const byId = new Map(events.map((e) => [String(e.id), e]));
const T = "2026-11-04"; /* a Wednesday */
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; console.error(e); process.exit(1); } };
const real = (r) => r.items.forEach((x) => {
  const e = byId.get(String(x.event.id));
  assert.ok(e, `unknown event ${x.event.id}`);
  assert.strictEqual(x.event.url, e.url); assert.ok(/^https:\/\/www\.visitorlando\.com\//.test(e.url));
});
const inWindow = (r, from, to) => r.items.forEach((x) => assert.ok(x.event.end_date >= from && x.event.start_date <= to, `${x.event.title} outside ${from}–${to}`));

t("dates: this weekend, next week, a month, a specific day", () => {
  assert.deepStrictEqual([A.understand("this weekend", T).from, A.understand("this weekend", T).to], ["2026-11-06", "2026-11-08"]);
  assert.deepStrictEqual([A.understand("next week", T).from, A.understand("next week", T).to], ["2026-11-09", "2026-11-15"]);
  const d = A.understand("in December", T); assert.deepStrictEqual([d.from, d.to], ["2026-12-01", "2026-12-31"]);
  const s = A.understand("what's on Nov 14?", T); assert.deepStrictEqual([s.from, s.to], ["2026-11-14", "2026-11-14"]);
  const s2 = A.understand("14th November", T); assert.strictEqual(s2.from, "2026-11-14");
  assert.strictEqual(A.understand("anything", T).to, "2026-12-04", "default: next 30 days");
  assert.strictEqual(A.understand("we may be visiting", T).to, "2026-12-04", "'may' as a verb is not the month");
});
t("audiences", () => {
  assert.strictEqual(A.understand("best for families with little children", T).audience, "little");
  assert.strictEqual(A.understand("things for the kids", T).audience, "family");
  assert.strictEqual(A.understand("date night for a couple", T).audience, "couple");
  assert.strictEqual(A.understand("adults only nightlife", T).audience, "adult");
});
t("families with little children: real, upcoming, nothing adult-only, little-kid events first", () => {
  const r = A.answer("What are the best upcoming events for families with little children?", events, T);
  assert.ok(r.items.length >= 3); real(r); inWindow(r, T, "2026-12-04");
  for (const x of r.items) assert.ok(!A.audienceOf(x.event).adult, `${x.event.title} is adult-only`);
  assert.ok(A.audienceOf(r.items[0].event).little, "top pick suits little ones");
});
t("concerts this weekend: right category and dates", () => {
  const r = A.answer("Any concerts this weekend?", events, T);
  assert.ok(r.items.length); real(r); inWindow(r, "2026-11-06", "2026-11-08");
  for (const x of r.items) assert.ok(x.event.categories.includes("Concerts and Live Shows"));
});
t("keyword ranking: jazz first", () => {
  const r = A.answer("jazz in November", events, T);
  real(r); assert.ok(/jazz/i.test(r.items[0].event.title + r.items[0].event.description));
});
t("free events are free", () => {
  const r = A.answer("free things to do this week", events, T);
  real(r); for (const x of r.items) assert.ok(x.event.categories.includes("Free Events"));
});
t("nothing matches → says so plainly, no items", () => {
  for (const q of ["underwater basket weaving", "monster truck rally for toddlers on Nov 5", "polka festival next week"]) {
    const r = A.answer(q, events, T);
    assert.ok(r.empty && !r.items.length, q); assert.ok(/couldn’t find any events/.test(r.text));
  }
  assert.ok(A.answer("concerts", [], T).empty);
});
t("candidates for the AI are real events in the window", () => {
  const c = A.candidates("family things this weekend", events, T, 25);
  assert.ok(c.length > 0 && c.length <= 25);
  for (const e of c) { assert.ok(byId.has(String(e.id))); assert.ok(e.end_date >= "2026-11-06" && e.start_date <= "2026-11-08"); }
});
t("grounding an AI reply: only real ids that were sent; links from the data, never the AI", () => {
  const sent = A.candidates("concerts this weekend", events, T, 10).map((e) => String(e.id));
  const g = A.ground({ answer: "Try these! [Fake](https://evil.example/x) **great**", event_ids: [sent[0], "999999999", sent[1], sent[0]] }, events, sent);
  assert.deepStrictEqual(g.items.map((x) => String(x.event.id)), [sent[0], sent[1]]);
  assert.ok(!/evil|https?:|\*\*/.test(g.text));
  g.items.forEach((x) => assert.strictEqual(x.event.url, byId.get(String(x.event.id)).url));
  const notSent = events.find((e) => !sent.includes(String(e.id)));
  assert.strictEqual(A.ground({ answer: "x", event_ids: [String(notSent.id)] }, events, sent), null, "real but not sent → rejected");
  assert.strictEqual(A.ground({ answer: "x", event_ids: ["31337"] }, events, sent), null, "invented → rejected");
  assert.strictEqual(A.ground({ answer: "", event_ids: [] }, events, sent), null);
  assert.strictEqual(A.ground({ event_ids: [sent[0]] }, events, sent), null);
  const none = A.ground({ answer: "Nothing fits those dates.", event_ids: [] }, events, sent);
  assert.ok(none && !none.items.length, "an honest 'nothing' is fine");
});
t("every rule answer across many questions links only to real events", () => {
  for (const q of ["kids", "christmas", "theatre next month", "sports this weekend", "romantic dinner", "festivals in November", "museum", "outdoors tomorrow", "comedy for adults", "Nov 20"]) real(A.answer(q, events, T));
});
console.log(`events ask: ${n} checks passed`);
