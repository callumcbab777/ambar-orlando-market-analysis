"""KCOS-3: News hub, domestic MCO routes, animated globe, Brightline map, Powered by Isla, name on PDFs, data checks."""
import json, re, shutil, subprocess, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = (ROOT / "index.html").read_text()
VISIT = (ROOT / "visit" / "index.html").read_text()
PROFILE = (ROOT / "profile" / "index.html").read_text()
COMPS = json.loads((ROOT / "data" / "comps.json").read_text())


class NewsHubTest(unittest.TestCase):
    def test_hub_markup_and_scripts(self):
        for k in ('id="newsHub"', 'id="newsChips"', 'id="newsList"', 'data/news_feed.js', 'assets/js/news.js'):
            self.assertIn(k, INDEX)

    def test_feed_shape(self):
        feed = json.loads((ROOT / "data" / "news_feed.json").read_text())
        self.assertTrue(feed["items"])
        cats = {c["id"] for c in feed["categories"]}
        for need in ("theme-parks", "mco", "dining", "lake-nona", "hospitality", "marriott", "orlando"):
            self.assertIn(need, cats)
        for s in feed["items"]:
            self.assertTrue(s["url"].startswith("https://"), s)
            self.assertRegex(s["id"], r"^[a-z0-9]{4,16}$")
            self.assertIn(s["cat"], cats)
            self.assertTrue(s["source"])
        js = (ROOT / "data" / "news_feed.js").read_text()
        self.assertIn("window.AMBAR_NEWS_FEED", js)

    def test_share_options(self):
        js = (ROOT / "assets" / "js" / "news.js").read_text()
        for k in ("mailto:?subject=", "sms:?&amp;body=", 'data-act="copy"', "navigator.share", "toggleStory"):
            self.assertIn(k, js)

    def test_refresh_workflow(self):
        wf = (ROOT / ".github" / "workflows" / "news-feed.yml").read_text()
        self.assertIn("scripts/update_news.py", wf)
        self.assertIn("cron:", wf)
        self.assertNotIn("--force", wf)


class RoutesGlobeRailTest(unittest.TestCase):
    def test_domestic_routes_link_like_international(self):
        flights = (ROOT / "assets" / "js" / "flights.js").read_text()
        for code in ("ATL", "SJU", "ORD", "EWR", "PHL", "DFW", "LGA", "DEN", "CLT", "JFK"):
            self.assertIn(f'data-fl="{code}-MCO"', VISIT)
            self.assertIn(f'"{code}-MCO"', flights)
        self.assertIn("transtats.bts.gov", VISIT)
        # domestic list sits under the international one
        self.assertLess(VISIT.index('data-fl="DXB-MCO"'), VISIT.index('id="mcoDomestic"'))

    def test_globe_has_static_fallback(self):
        self.assertIn("assets/js/globe.js", VISIT)
        self.assertIn('class="vh-map vh-map-lg"', VISIT)  # static SVG stays as the fallback
        g = (ROOT / "assets" / "js" / "globe.js").read_text()
        self.assertIn("prefers-reduced-motion", g)
        self.assertIn("IntersectionObserver", g)

    def test_brightline_map_and_times(self):
        self.assertIn('class="bl-map"', VISIT)
        for st in ("MiamiCentral", "Aventura", "Fort Lauderdale", "Boca Raton", "West Palm Beach", "Orlando (MCO)"):
            self.assertIn(st, VISIT)
        self.assertIn("Approximate, not a timetable", VISIT)
        self.assertIn("gobrightline.com/train-stations/fl/orlando", VISIT)


class ProfileTest(unittest.TestCase):
    def test_powered_by_isla(self):
        self.assertGreaterEqual(PROFILE.count("Powered by Isla"), 2)

    def test_pdf_uses_name_not_my_profile(self):
        pdf = (ROOT / "assets" / "js" / "events-pdf.js").read_text()
        self.assertNotIn('doc.text("My", W - 96', pdf)
        self.assertIn("PREPARED FOR", pdf)
        share = (ROOT / "assets" / "js" / "profile-share.js").read_text()
        self.assertIn("nameForPdf", share)
        self.assertIn('id="pfName"', PROFILE)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_profile_name_news_node(self):
        r = subprocess.run(["node", str(ROOT / "tests/js/profile_name_news_test.js")], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)


class DataVerificationTest(unittest.TestCase):
    def test_every_market_figure_is_sourced_and_flagged(self):
        for m in COMPS["market"]:
            self.assertIn("verified", m, m["period"])
            self.assertNotIn("[verify", m["source"])
            if m["verified"]:
                self.assertTrue(m["url"].startswith("https://"), m["period"])
            else:
                self.assertTrue(m.get("verify_note"))
        self.assertIn("verification", COMPS["meta"])

    def test_checklist_covers_site_values(self):
        spec = json.loads((ROOT / "data" / "verification.json").read_text())
        for c in spec["checks"]:
            text = (ROOT / c["site"]["file"]).read_text()
            self.assertIn(c["site"]["value"], text, c["id"])
        self.assertTrue((ROOT / "docs" / "DATA_VERIFICATION.md").exists())

    def test_offline_run(self):
        r = subprocess.run(["python3", str(ROOT / "scripts" / "verify_data.py"), "--offline"], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class GuardrailsTest(unittest.TestCase):
    def test_no_secrets_or_banned_claims(self):
        for p in list((ROOT / "assets" / "js").glob("*.js")) + [ROOT / "index.html", ROOT / "visit" / "index.html", ROOT / "scripts" / "update_news.py"]:
            t = p.read_text()
            self.assertNotIn("LLM_API_KEY=", t)
            self.assertNotRegex(t, r"sk-[A-Za-z0-9]{20,}")
        self.assertNotIn("$350 benchmark", INDEX)


if __name__ == "__main__":
    unittest.main()
