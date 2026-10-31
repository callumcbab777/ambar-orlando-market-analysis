"""Round 3: Plan your visit page, My Profile, Your brands, favourite hotels, and the assistant's knowledge index."""
from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "events/index.html", "visit/index.html", "profile/index.html")
CALENDLY = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar"


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def text_of(html: str) -> str:
    html = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", html, flags=re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


def load_builder():
    spec = importlib.util.spec_from_file_location("build_knowledge", ROOT / "tools" / "build_knowledge.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(ROOT / script)], capture_output=True, text=True, timeout=60)


class VisitPageTest(unittest.TestCase):
    def setUp(self):
        self.html = read("visit/index.html")

    def test_headline_constant_matches_static_h1(self):
        js = read("assets/js/visit.js")
        m = re.search(r'const HEADLINE = "([^"]+)";', js)
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "All Roads Lead to AMBAR")
        h1 = re.search(r'<h1 id="visitHeadline">(.*?)</h1>', self.html).group(1)
        self.assertEqual(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h1)).strip(), m.group(1))
        self.assertEqual(js.count("HEADLINE ="), 1, "headline lives in one constant")
        self.assertGreaterEqual(len(re.findall(r'"[^"]*AMBAR"', js.split("*/")[0])), 2, "alternatives listed in the header comment")

    def test_sections_sources_and_ctas(self):
        for needle in ('id="getting-here"', 'id="brightline"', 'id="drive-times"', 'id="best-time"', 'id="visit-ambar"',
                       "MCO", "SFB", "MLB", "https://www.gobrightline.com", "project-osrm.org", "no traffic", "as of", "8701 W Irlo Bronson"):
            self.assertIn(needle, self.html, needle)
        anchors = re.findall(r'<a [^>]*href="(https://calendly\.com[^"]*)"[^>]*>(.*?)</a>', self.html, flags=re.S)
        self.assertGreaterEqual(len(anchors), 3, "hero, closing band, phone bar")
        for href, label in anchors:
            self.assertEqual(href, CALENDLY)
            self.assertTrue(label.startswith("Visit AMBAR"), label)
        self.assertIn('id="vhBook"', self.html)
        self.assertIn('id="evMbar"', self.html)

    def test_no_fares_or_prices(self):
        t = text_of(self.html)
        self.assertIsNone(re.search(r"[$£€]\s?\d", t), "no prices on the visit page")
        self.assertNotRegex(t.lower(), r"\bfares? (from|start|of)\b")

    def test_seasonal_routes_marked(self):
        self.assertGreaterEqual(self.html.count("Seasonal"), 3)


class ProfilePageTest(unittest.TestCase):
    def test_structure(self):
        html = read("profile/index.html")
        for needle in ('id="pfShared"', 'id="pfSaveShared"', "Save to my profile", 'id="pfPdf"', 'id="pfCopy"', 'id="pfNative"',
                       'id="pfSections"', 'id="pfClear"', 'id="evVisitBand"', "My <em>Profile</em>"):
            self.assertIn(needle, html, needle)
        order = [html.index(s) for s in ("assets/js/profile.js", "assets/js/profile-share.js", "assets/js/profile-page.js")]
        self.assertEqual(order, sorted(order))

    def test_profile_module_node(self):
        if not shutil.which("node"):
            self.skipTest("node not installed")
        out = node("tests/js/profile_test.js")
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("checks passed", out.stdout)

    def test_no_my_list_anywhere(self):
        for rel in list(PAGES) + [str(p.relative_to(ROOT)) for p in (ROOT / "assets" / "js").glob("*.js")] + ["README.md"]:
            self.assertNotIn("My list", read(rel), rel)

    def test_every_page_links_visit_and_profile(self):
        for rel in PAGES:
            html = read(rel)
            nav = re.search(r'<nav class="site-nav".*?</nav>', html, flags=re.S)
            self.assertIsNotNone(nav, rel)
            self.assertRegex(nav.group(0), r'href="(\.\./)?visit/"|href="index.html" class="active" aria-current="page">Plan your visit', rel)
            self.assertRegex(nav.group(0), r'href="(\.\./)?profile/"|href="index.html" class="[^"]*active[^"]*" aria-current="page"[^>]*>My Profile', rel)


class BrandsDataTest(unittest.TestCase):
    def setUp(self):
        self.b = json.loads(read("data/brands.json"))

    def test_schema(self):
        self.assertRegex(self.b["as_of"], r"^\d{4}-\d{2}-\d{2}$")
        ids, codes = [], []
        for p in self.b["parents"]:
            self.assertTrue(p["id"] and p["name"] and p["blurb"] and p["brands"], p.get("id"))
            for x in p["brands"]:
                ids.append(x["id"]); codes.append(x["code"])
                self.assertRegex(x["code"], r"^[a-z][0-9a-f]{1,2}$")
                self.assertTrue(x["source_url"].startswith("https://"), x["id"])
                self.assertTrue(x["verified"] and x["example"] and x["name"], x["id"])
        self.assertEqual(len(ids), len(set(ids)), "brand ids unique")
        self.assertEqual(len(codes), len(set(codes)), "brand codes unique")
        for n in self.b["not_included"]:
            self.assertTrue(n["name"] and n["parent"] and n["reason"])

    def test_apartments_tag(self):
        tagged = [(p["id"], x) for p in self.b["parents"] for x in p["brands"] if x.get("tag")]
        self.assertEqual(len(tagged), 1)
        pid, x = tagged[0]
        self.assertEqual(pid, "marriott")
        self.assertEqual(x["name"], "Apartments by Marriott Bonvoy")
        self.assertEqual(x["tag"], "Apartments by Marriott Bonvoy · home of AMBAR Orlando")

    def test_marriott_names_match_the_brand_matrix(self):
        matrix = {b["name"] for b in json.loads(read("data/comps.json"))["brands"]} | {"Apartments by Marriott Bonvoy"}
        marriott = next(p for p in self.b["parents"] if p["id"] == "marriott")
        for x in marriott["brands"]:
            self.assertIn(x["name"], matrix, f"{x['name']} is not a Marriott Brand Matrix name")

    def test_mirror_is_generated(self):
        js = read("data/brands.js")
        self.assertTrue(js.startswith("/* Generated by tools/build_knowledge.py"))
        self.assertEqual(json.loads(js.split("window.AMBAR_BRANDS = ", 1)[1].rstrip().rstrip(";")), self.b)


class MainPageTest(unittest.TestCase):
    def setUp(self):
        self.html = read("index.html")
        self.app = read("assets/js/app.js")

    def test_history_chart_removed(self):
        self.assertNotIn('id="history"', self.html)
        for dead in ("renderHistory", "historyChart", "updateChart"):
            self.assertNotIn(dead, self.app)
        self.assertNotIn(".chart-box", read("assets/css/styles.css"))

    def test_by_hotel_lives_in_hotels(self):
        hotels = re.search(r'<section[^>]*id="hotels".*?</section>', self.html, flags=re.S).group(0)
        for needle in ('id="byHotel"', 'id="multiples"', 'id="favOnly"', 'aria-pressed="false"'):
            self.assertIn(needle, hotels, needle)
        self.assertIn("renderByHotel", self.app)

    def test_favourites(self):
        for needle in ("fav-star", "aria-pressed", "toggleHotel", "P.subscribe"):
            self.assertIn(needle, self.app, needle)
        self.assertIn(".fav-star", read("assets/css/styles.css"))

    def test_familiar_section(self):
        sec = re.search(r'<section[^>]*id="familiar".*?</section>', self.html, flags=re.S).group(0)
        self.assertIn("02 · Your brands", sec)
        self.assertIn("Which hotel brands are you most familiar with?", sec)
        self.assertIn('id="famBox"', sec)
        js = read("assets/js/familiar.js")
        for needle in ("fieldset", "legend", 'type="checkbox"', "aria-controls", "indeterminate", "setBrands", "data-all", "as_of"):
            self.assertIn(needle, js, needle)
        order = [self.html.index(f'<script src="{s}"') for s in ("assets/js/profile.js", "data/brands.js", "assets/js/familiar.js")]
        self.assertEqual(order, sorted(order))

    def test_still_no_booking_link_on_main_page(self):
        self.assertNotIn("calendly.com", self.html)


class KnowledgeTest(unittest.TestCase):
    def test_index_is_fresh(self):
        out = subprocess.run([sys.executable, str(ROOT / "tools" / "build_knowledge.py"), "--check"], capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)

    def test_deterministic_and_well_formed(self):
        b = load_builder()
        a, c = b.render(b.build()), b.render(b.build())
        self.assertEqual(a, c)
        k = json.loads(a["data/knowledge.json"])
        self.assertEqual(a["data/knowledge.json"], a["assistant-proxy/knowledge.json"], "proxy copy identical")
        self.assertEqual(a["assistant-proxy/lib/knowledge-search.js"].split("\n", 1)[1], read("assets/js/knowledge.js"))
        self.assertGreater(len(k["docs"]), 50)
        for d in k["docs"]:
            self.assertTrue(d["id"] and d["title"] and d["text"] and d["url"], d.get("id"))
        kinds = {d["kind"] for d in k["docs"]}
        self.assertTrue({"page", "hotel", "brands", "matrix", "ambar", "method", "climate"} <= kinds, kinds)

    def test_events_chunks_and_currency(self):
        k = json.loads(read("data/knowledge.json"))
        raw = json.loads(read("data/visitorlando_events.json"))
        evs = {d["id"]: d for d in k["docs"] if d["kind"] == "event"}
        self.assertEqual(len(evs), len(raw["events"]), "one chunk per Visit Orlando listing")
        months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
        nice = lambda iso: f"{months[int(iso[5:7]) - 1]} {int(iso[8:])}, {iso[:4]}"
        for e in raw["events"]:
            d = evs["event:" + e["id"]]
            end = e.get("end_date") or e["start_date"]
            self.assertEqual((d["title"], d["url"], d["start"], d["end"]), (e["title"], e["url"], e["start_date"], end))
            rng = nice(e["start_date"]) if end == e["start_date"] else f"{nice(e['start_date'])} – {nice(end)}"
            self.assertIn(rng, d["text"], d["id"])                        # human date range (start–end)
            self.assertIn(e["url"], d["text"], d["id"])                   # source link travels with the chunk
            self.assertIn(e["location"], d["text"], d["id"])              # venue
            for c in e.get("categories") or []:
                self.assertIn(c, d["text"])
            self.assertEqual((d["source"], d["as_of"]), ("Visit Orlando", raw["fetched_at"][:10]))
            self.assertLessEqual(len(d["text"]), 900)
        cur = next(d for d in k["docs"] if d["id"] == "events:currency")
        self.assertIn(f"captured on {nice(raw['fetched_at'][:10])}", cur["text"])
        self.assertIn(f"from {nice(raw['window_start'])} to {nice(raw['window_end'])}", cur["text"])
        self.assertIn("check each event's Visit Orlando link", cur["text"])
        self.assertEqual((cur["window_start"], cur["window_end"]), (raw["window_start"], raw["window_end"]))
        # week-ahead estimates stay out of the index; sizes stay sane
        self.assertFalse(any(d["kind"].startswith("week") or d["id"].startswith("week") for d in k["docs"]))
        self.assertNotIn("data/week_ahead.json", k["inputs"])
        self.assertIn("data/visitorlando_events.json", k["inputs"])
        self.assertLess(len(read("data/knowledge.json").encode()), 600_000)
        self.assertLess(len(read("data/knowledge.js").encode()), 550_000)

    def test_events_on_the_proxy_and_guide(self):
        chat = read("assistant-proxy/api/chat.js")
        self.assertIn("events:currency", chat)
        self.assertIn("may be stale", chat)
        self.assertIn("today })", chat)
        guide = read("assets/js/assistant.js")
        for needle in ("eventSearch", "docEvent", "curNote", "Events data:"):
            self.assertIn(needle, guide)
        wf = read(".github/workflows/knowledge.yml")
        self.assertIn("data/visitorlando_events.json", wf)

    def test_local_doc_links_resolve(self):
        k = json.loads(read("data/knowledge.json"))
        for d in k["docs"]:
            u = d["url"]
            if u.startswith("http"):
                continue
            path, _, frag = u.partition("#")
            f = ROOT / (path + "index.html" if path.endswith("/") or not path else path)
            self.assertTrue(f.exists(), u)
            if frag and not frag.startswith("hotel-"):   # hotel cards are rendered by app.js with id="hotel-<id>"
                self.assertIn(f'id="{frag}"', f.read_text(encoding="utf-8"), u)

    def test_retrieval_node(self):
        if not shutil.which("node"):
            self.skipTest("node not installed")
        out = node("tests/js/knowledge_test.js")
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("checks passed", out.stdout)

    def test_assistant_profile_intents_node(self):
        """'my saved/favourite/favorite hotels', 'which hotels did I star' → hotels only; 'my saved events' → events only;
        'what's in my profile' → all; empty favourites → how to star; proxy context limited to the asked section."""
        if not shutil.which("node"):
            self.skipTest("node not installed")
        out = node("tests/js/assistant_profile_test.js")
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("assistant profile: 7 checks passed", out.stdout)

    def test_proxy_smoke_with_mocked_llm(self):
        if not shutil.which("node"):
            self.skipTest("node not installed")
        out = node("assistant-proxy/test/smoke.js")
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)

    def test_assistant_uses_index_and_profile_without_a_key(self):
        js = read("assets/js/assistant.js")
        for needle in ("data/knowledge.js", "assets/js/knowledge.js", "knowledge_ids", "profileContext", "profileIntent"):
            self.assertIn(needle, js, needle)
        self.assertNotIn("#history", js)
        for rel in ("assets/js/assistant.js", "assets/js/assistant-config.js", "assets/js/knowledge.js", "data/knowledge.js"):
            self.assertIsNone(re.search(r"\b(sk-[A-Za-z0-9]{16,}|xai-[A-Za-z0-9]{16,})", read(rel)), rel)
        proxy = read("assistant-proxy/api/chat.js")
        for needle in ('require("../knowledge.json")', "Never invent", "fares", "Cite as you go", "origins.includes(origin)", "limited(ip", "maxBytes"):
            self.assertIn(needle, proxy, needle)

    def test_workflows(self):
        ci = read(".github/workflows/week-ahead.yml")
        self.assertIn("tools/build_knowledge.py --check", ci)
        for p in ('"visit/**"', '"profile/**"', '"tools/**"'):
            self.assertIn(p, ci)
        wf = read(".github/workflows/knowledge.yml")
        self.assertIn("github-actions[bot]", wf)
        self.assertIn("branches: [main]", wf)
        self.assertIn("git pull --rebase", wf)
        for bad in ("--force", "push -f", "--no-verify"):
            self.assertNotIn(bad, wf + ci)


if __name__ == "__main__":
    unittest.main()
