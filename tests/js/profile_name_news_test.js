/* Node checks for the visitor's name (shown on PDFs) and saved News stories in assets/js/profile.js. Exit 1 on failure. */
"use strict";
const assert = require("assert");
const path = require("path");
const P = require(path.join(__dirname, "..", "..", "assets", "js", "profile.js"));
const brands = require(path.join(__dirname, "..", "..", "data", "brands.json"));
const bIdx = P.brandIndex(brands);
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
t("cleanName keeps real names and rejects markup", () => {
  assert.strictEqual(P.cleanName("  Callum   Brown "), "Callum Brown");
  assert.strictEqual(P.cleanName("Siobhán O’Neil-Smith"), "Siobhán O’Neil-Smith");
  assert.strictEqual(P.cleanName("<b>x</b>"), "");
  assert.strictEqual(P.cleanName(""), "");
});
t("name is kept by normalise but never travels in a share link", () => {
  const prof = P.normalise({ name: "Alex Morgan", hotels: ["swan"] });
  assert.strictEqual(prof.name, "Alex Morgan");
  const url = P.shareUrl("https://x.org/profile/", prof, bIdx);
  assert.ok(!/Alex|Morgan/.test(decodeURIComponent(url)));
});
t("saved stories need an https url and a short id; duplicates dropped", () => {
  const prof = P.normalise({ news: [
    { id: "abc123def456", title: "Story", url: "https://news.example/a", source: "Pub", cat: "mco", date: "2026-11-24" },
    { id: "abc123def456", title: "Dupe", url: "https://news.example/a" },
    { id: "zz", title: "Bad id", url: "https://news.example/b" },
    { id: "abcd1234", title: "Bad url", url: "javascript:alert(1)" },
  ] });
  assert.strictEqual(prof.news.length, 1);
  assert.strictEqual(prof.news[0].cat, "mco");
  assert.strictEqual(P.counts(prof).news, 1);
  assert.ok(!P.isEmpty(prof));
});
t("a name alone does not make the profile non-empty (no empty PDFs)", () => {
  assert.ok(P.isEmpty(P.normalise({ name: "Alex" })));
});
console.log(`profile name/news: ${n} passed`);
