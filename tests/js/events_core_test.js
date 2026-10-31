/* Node checks for assets/js/events-core.js (run by tests/test_events_core.py). Exit code 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const C = require(path.join(__dirname, "..", "..", "assets", "js", "events-core.js"));
const B = (t) => Object.fromEntries(C.buckets(t).map((b) => [b.key, b]));
let n = 0;
const t = (name, fn) => { fn(); n++; };

t("weekday (Wed): weekend is upcoming Fri–Sun, next week Mon–Sun, later rest of month", () => {
  const b = B("2026-10-14");
  assert.deepStrictEqual([b.today.from, b.today.to], ["2026-10-14", "2026-10-14"]);
  assert.deepStrictEqual([b.weekend.from, b.weekend.to], ["2026-10-16", "2026-10-18"]);
  assert.deepStrictEqual([b.next.from, b.next.to], ["2026-10-19", "2026-10-25"]);
  assert.deepStrictEqual([b.later.from, b.later.to, b.later.label], ["2026-10-26", "2026-10-31", "Later this month"]);
  assert.deepStrictEqual([b.all.from, b.all.to], ["2026-10-14", ""]);
});
t("Friday: weekend starts today", () => {
  const b = B("2026-10-16");
  assert.deepStrictEqual([b.weekend.from, b.weekend.to], ["2026-10-16", "2026-10-18"]);
});
t("Saturday: weekend is Sat–Sun, next week the following Mon–Sun", () => {
  const b = B("2026-10-31");
  assert.deepStrictEqual([b.weekend.from, b.weekend.to], ["2026-10-31", "2026-11-01"]);
  assert.deepStrictEqual([b.next.from, b.next.to], ["2026-11-02", "2026-11-08"]);
});
t("Sunday: weekend is just today; next week starts tomorrow", () => {
  const b = B("2026-11-01");
  assert.deepStrictEqual([b.weekend.from, b.weekend.to], ["2026-11-01", "2026-11-01"]);
  assert.deepStrictEqual([b.next.from, b.next.to], ["2026-11-02", "2026-11-08"]);
});
t("month end: when next week runs past month end, 'later' rolls to next month and says so", () => {
  const b = B("2026-10-31");
  assert.deepStrictEqual([b.later.from, b.later.to, b.later.label], ["2026-11-09", "2026-11-30", "Later in November"]);
  const j = B("2027-01-28"); /* Thu */
  assert.deepStrictEqual([j.next.from, j.next.to], ["2027-02-01", "2027-02-07"]);
  assert.deepStrictEqual([j.later.from, j.later.to, j.later.label], ["2027-02-08", "2027-02-28", "Later in February"]);
});
t("year end and leap year", () => {
  const d = B("2026-12-30"); /* Wed */
  assert.deepStrictEqual([d.weekend.from, d.weekend.to], ["2027-01-01", "2027-01-03"]);
  assert.deepStrictEqual([d.later.from, d.later.label], ["2027-01-11", "Later in January"]);
  const l = B("2028-02-21"); /* Mon */
  assert.deepStrictEqual([l.later.from, l.later.to, l.later.label], ["2028-03-06", "2028-03-31", "Later in March"]);
  const l2 = B("2028-02-07");
  assert.deepStrictEqual([l2.later.from, l2.later.to], ["2028-02-21", "2028-02-29"]);
});
t("buckets never overlap and are in order", () => {
  for (let i = 0; i < 400; i++) {
    const today = C.addDays("2026-01-01", i);
    const b = C.buckets(today);
    assert.ok(b[0].from === today && b[1].from >= today && b[1].to >= b[1].from, today);
    assert.ok(b[2].from > b[1].to && b[3].from > b[2].to && b[3].to >= b[3].from, today);
    assert.strictEqual(C.parse(b[2].from).getDay(), 1, today);
    assert.strictEqual(C.parse(b[1].to).getDay(), 0, today);
  }
});
t("bad input throws", () => { assert.throws(() => C.buckets("31/10/2026")); });
t("overlaps", () => {
  const e = { start_date: "2026-10-01", end_date: "2026-10-31" };
  assert.ok(C.overlaps(e, "2026-10-31", "2026-10-31"));
  assert.ok(!C.overlaps(e, "2026-11-01", ""));
  assert.ok(C.overlaps(e, "", "2026-10-01"));
});
t("encodeShare: digits only, de-duplicated, capped", () => {
  assert.strictEqual(C.encodeShare(["24712", 1, "24712", "abc", "<script>", "12.3", " 77 "]), "24712.1.77");
  const many = Array.from({ length: 100 }, (_, i) => String(1000 + i));
  assert.strictEqual(C.encodeShare(many).split(".").length, C.MAX_SHARED);
});
t("decodeShare: ignores unknown/invalid ids, keeps order", () => {
  const known = new Set(["1", "24712", "77"]);
  assert.deepStrictEqual(C.decodeShare("77.24712.77.999.javascript:alert(1)", known), { ids: ["77", "24712"], unknown: 2 });
  assert.deepStrictEqual(C.decodeShare("", known), { ids: [], unknown: 0 });
  assert.deepStrictEqual(C.decodeShare(null, known).ids, []);
  assert.deepStrictEqual(C.decodeShare("1,77 24712", known).ids, ["1", "77", "24712"]);
});
t("round trip", () => {
  const ids = ["24712", "30001", "5"];
  const url = C.shareUrl("https://example.com/events/index.html?x=1#saved", ids);
  assert.strictEqual(url, "https://example.com/events/index.html?shared=24712.30001.5");
  const q = new URL(url).searchParams.get("shared");
  assert.deepStrictEqual(C.decodeShare(q, new Set(ids)).ids, ids);
  assert.strictEqual(C.shareUrl("https://e.com/a.html", []), "https://e.com/a.html");
});
t("picks: next 7 days, short runs first, varied, max n", () => {
  const ev = (id, s, e, cat) => ({ id, title: "E" + id, start_date: s, end_date: e, categories: [cat] });
  const list = [
    ev("1", "2026-01-01", "2026-12-31", "Arts"), ev("2", "2026-10-31", "2026-10-31", "Music"),
    ev("3", "2026-11-02", "2026-11-02", "Music"), ev("4", "2026-11-03", "2026-11-03", "Music"),
    ev("5", "2026-11-20", "2026-11-20", "Sport"), ev("6", "2026-11-05", "2026-11-06", "Food"),
  ];
  const p = C.picks(list, "2026-10-31", 4).map((e) => e.id);
  assert.deepStrictEqual(p, ["2", "3", "6", "1"]);
  assert.ok(!p.includes("5"));
});
console.log(`events-core: ${n} checks passed`);
