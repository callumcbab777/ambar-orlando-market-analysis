/* Node checks for the assistant's My Profile answers (assets/js/assistant.js, offline guide + the profile context
   sent to the proxy). Runs the real widget script against a tiny DOM stub. Run by tests/test_round3.py. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const K = require(path.join(ROOT, "assets", "js", "knowledge.js"));
const KNOW = require(path.join(ROOT, "data", "knowledge.json"));

/* a permissive DOM node: callable, and every unknown property is another such node */
function node() {
  const o = Object.assign(function () { return node(); }, { dataset: {}, style: {}, innerHTML: "", textContent: "", value: "", hidden: false, children: [] });
  return new Proxy(o, { get(t, k) {
    if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
    if (k === Symbol.toPrimitive) return () => "";
    if (k === "then") return undefined;
    if (k === "querySelectorAll") return () => [];
    if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
    return node();
  }, set(t, k, v) { t[k] = v; return true; } });
}
function loadAssistant(profile) {
  const win = {
    AMBAR_ASSISTANT_CONFIG: { proxyUrl: "" }, AMBAR_KNOWLEDGE: KNOW, AMBAR_KNOWLEDGE_SEARCH: K,
    AMBAR_PROFILE: { get: () => profile }, addEventListener() {}, location: { hash: "", href: "http://x/", pathname: "/" },
  };
  const doc = node();
  Object.assign(doc, { currentScript: { dataset: { root: "", page: "home" } } });
  const ctx = vm.createContext({ window: win, document: doc, console, Intl, Date, setTimeout, clearTimeout, URLSearchParams, fetch: () => Promise.reject(new Error("offline")), localStorage: { getItem: () => null, setItem() {} } });
  win.window = win; win.document = doc;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", "js", "assistant.js"), "utf8"), ctx);
  return win.AMBAR_ASSISTANT;
}
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };

const FULL = {
  hotels: ["swan", "conrad-evermore"], brands: ["jw-marriott"],
  events: [{ id: "34203", title: "2nd Annual Thriller Halloween Bar Crawl", start_date: "2026-10-31", end_date: "2026-10-31", url: "https://www.visitorlando.com/event/2nd-annual-thriller-halloween-bar-crawl/34203/" }],
  prefs: { cats: ["Concerts and Live Shows"], budget: "free" },
};
const EMPTY_HOTELS = { hotels: [], brands: ["jw-marriott"], events: FULL.events, prefs: FULL.prefs };
const HOTEL_QS = ["my saved hotels", "my favourite hotels", "my favorite hotels", "My favourites hotels?", "show my favorite hotels", "which hotels did I star", "Which hotels have I starred?", "which hotels did I favourite?", "which hotels did I favorite",
  "hotels I starred", "which hotels did I save", "show my starred hotels", "list my favorites hotels", "list my favourites hotels", "hotels I’ve saved"];
const EVENT_QS = ["my saved events", "which events did I save?", "my favourite events", "my favorite events", "show my saved events", "events I starred"];
/* bare "my hotel" / "my event" is the visitor's own hotel or plans, not their saved items: normal retrieval */
const NOT_PROFILE_QS = ["How far is my hotel from the airport?", "how far is my hotel from the airport", "is my hotel near Disney", "Is my hotel near Disney?", "my hotel is the Hilton, what's nearby?",
  "my hotel is the Hilton, what’s nearby", "my hotels", "my event", "when is my event", "my events", "is my event free?", "how do I star a hotel?", "how do I save an event"];
const ALL_QS = ["what's in my profile", "What’s in my profile?", "show my profile", "my favourites", "my favorites", "my saved hotels and events"];

t("profileIntent: hotels / events / all, British and American spelling", () => {
  for (const q of HOTEL_QS) assert.strictEqual(K.profileIntent(q), "hotels", q);
  for (const q of EVENT_QS) assert.strictEqual(K.profileIntent(q), "events", q);
  for (const q of ALL_QS) assert.strictEqual(K.profileIntent(q), "all", q);
  for (const q of NOT_PROFILE_QS.concat(["concerts this weekend", "How do I get from Miami?", "Which Marriott brands are in Orlando?"])) assert.strictEqual(K.profileIntent(q), null, q);
  for (const q of ["my brands", "my preferences", "what's in my profile", "my favourites", "my favorites"]) assert.ok(K.profileIntent(q), q);
});
t("retrieval: hotel-intent profile docs are hotels only; events intent events only; general = all sections", () => {
  const ix = K.createIndex(KNOW);
  const kinds = (q) => K.search(ix, q, { k: 8, profile: FULL }).filter((r) => r.doc.kind === "profile").map((r) => r.doc.id);
  for (const q of HOTEL_QS) assert.deepStrictEqual(kinds(q), ["profile:hotels"], q);
  for (const q of EVENT_QS) assert.deepStrictEqual(kinds(q), ["profile:events"], q);
  assert.deepStrictEqual(kinds("what's in my profile").sort(), ["profile:brands", "profile:events", "profile:hotels", "profile:prefs"]);
});
t("offline guide: 'my saved hotels' (and spellings) lists favourite hotels only", () => {
  const A = loadAssistant(FULL);
  for (const q of HOTEL_QS) {
    const h = A.guideAnswer(q).html;
    assert.ok(h.includes("Your favourite hotels (2)") && h.includes("Walt Disney World Swan") && h.includes("#hotel-conrad-evermore"), q + " → " + h);
    assert.ok(!/Thriller|visitorlando|Saved events|Brands you know|JW Marriott|preferences/i.test(h), q + " leaked other sections: " + h);
  }
});
t("offline guide: 'my saved events' lists events only", () => {
  const A = loadAssistant(FULL);
  for (const q of EVENT_QS) {
    const h = A.guideAnswer(q).html;
    assert.ok(h.includes("Saved events (1)") && h.includes("https://www.visitorlando.com/event/2nd-annual-thriller-halloween-bar-crawl/34203/"), q);
    assert.ok(!/favourite hotels|Swan|Brands you know|preferences saved/i.test(h), q + " leaked: " + h);
  }
});
t("offline guide: 'what's in my profile' returns every section", () => {
  const A = loadAssistant(FULL);
  for (const q of ALL_QS) {
    const h = A.guideAnswer(q).html;
    assert.ok(/Your favourite hotels/.test(h) && /Saved events/.test(h) && /Brands you know/.test(h) && /preferences saved/.test(h), q + " → " + h);
  }
});
t("offline guide: no favourites yet → says so and how to star a hotel (and nothing else)", () => {
  const A = loadAssistant(EMPTY_HOTELS);
  for (const q of ["my saved hotels", "my favorite hotels", "which hotels did I star"]) {
    const h = A.guideAnswer(q).html;
    assert.ok(/haven’t starred any favourite hotels yet/.test(h) && /tap the star/.test(h) && /href="(?:\.\.\/)?(?:index\.html)?#hotels"/.test(h), q + " → " + h);
    assert.ok(!/Thriller|Brands you know/.test(h), q);
  }
  const none = loadAssistant(null).guideAnswer("my favourite hotels").html;
  assert.ok(/haven’t starred any favourite hotels yet/.test(none), none);
  assert.ok(/haven’t saved any events yet/.test(loadAssistant({ hotels: ["swan"], brands: [], events: [], prefs: null }).guideAnswer("my saved events").html));
});
t("proxy context: section-specific intents send only that section; general sends all", () => {
  const A = loadAssistant(FULL);
  const c = (q) => A._profileContext(A.guideAnswer(q).profileScope);
  for (const q of HOTEL_QS) {
    const x = c(q);
    assert.strictEqual(JSON.stringify([x.scope, x.hotels, x.brands, x.events, x.prefs]), JSON.stringify(["hotels", ["swan", "conrad-evermore"], [], [], null]), q);
  }
  const e = c("my saved events");
  assert.strictEqual(JSON.stringify([e.scope, e.hotels.length, e.brands.length, e.events.length, e.prefs]), JSON.stringify(["events", 0, 0, 1, null]));
  const all = c("what's in my profile");
  assert.ok(all.scope === "all" && all.hotels.length === 2 && all.brands.length === 1 && all.events.length === 1 && all.prefs);
  const other = A._profileContext(A.guideAnswer("concerts this weekend").profileScope);
  assert.ok(other.scope === "all" && other.hotels.length === 2 && other.events.length === 1, "non-profile questions keep the whole profile");
});
t("retrieval: bare 'my hotel' questions get normal results, no profile docs", () => {
  const ix = K.createIndex(KNOW);
  for (const q of NOT_PROFILE_QS) {
    const r = K.search(ix, q, { k: 6, profile: FULL, today: "2026-10-31" });
    assert.ok(!r.some((x) => x.doc.kind === "profile" || x.doc.id === "page:profile:mine"), q + " → " + r.map((x) => x.doc.id).join());
  }
  const air = K.search(ix, "How far is my hotel from the airport?", { k: 3, profile: FULL }).map((x) => x.doc.id);
  assert.ok(air[0].startsWith("page:visit:getting-here"), air.join());
  assert.ok(K.search(ix, "is my hotel near Disney", { k: 3, profile: FULL })[0].doc.id === "brands:disney");
  assert.ok(K.search(ix, "my hotel is the Hilton, what's nearby?", { k: 3, profile: FULL })[0].doc.id === "brands:hilton");
});
(async () => {
  /* full offline answers with the index loaded */
  const A = loadAssistant(FULL);
  await A.loadKnowledge();
  t("offline guide: 'How far is my hotel from the airport?' answers from Getting here, not favourites", () => {
    for (const q of ["How far is my hotel from the airport?", "is my hotel near Disney", "my hotel is the Hilton, what's nearby?"]) {
      const g = A.guideAnswer(q);
      assert.ok(!g.profileScope && !/Your favourite hotels|Saved events|Open My Profile/.test(g.html), q + " → " + g.html);
    }
    const h = A.guideAnswer("How far is my hotel from the airport?").html;
    assert.ok(/href="visit\/#getting-here"/.test(h) && /Three airports, one destination/.test(h), h);
    const ctx = A._profileContext(A.guideAnswer("How far is my hotel from the airport?").profileScope);
    assert.strictEqual(ctx.scope, "all", "not a profile-section question: no section filter sent to the proxy");
  });
  t("offline guide with the index: 'hotels I starred' / 'show my starred hotels' still list favourites only", () => {
    for (const q of ["hotels I starred", "show my starred hotels", "list my favorites hotels", "which hotels did I save"]) {
      const h = A.guideAnswer(q).html;
      assert.ok(h.includes("Your favourite hotels (2)") && !/Thriller|Brands you know/.test(h), q + " → " + h);
    }
  });
  console.log(`assistant profile: ${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
