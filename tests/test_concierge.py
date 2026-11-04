"""Favourite hotels with their data, Google Flights links on the visit page, My Preferences and the Travel Concierge."""
from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALENDLY = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar"
CTA_COPY = "Let Isla propose an itinerary for your upcoming trip. Share it with your family and plan it together."


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(["node", str(ROOT / script)], capture_output=True, text=True, timeout=60)


@unittest.skipUnless(shutil.which("node"), "node not installed")
class NodeChecks(unittest.TestCase):
    def run_js(self, script: str, label: str):
        out = node(script)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertRegex(out.stdout, rf"{label}: \d+ checks passed")

    def test_flights(self):
        self.run_js("tests/js/flights_test.js", "flights")

    def test_itinerary_and_share_url(self):
        self.run_js("tests/js/itinerary_test.js", "itinerary")

    def test_fav_hotels(self):
        self.run_js("tests/js/fav_hotels_test.js", "fav hotels")

    def test_profile_trip(self):
        self.run_js("tests/js/profile_trip_test.js", "profile trip")


class VisitFlightLinks(unittest.TestCase):
    def setUp(self):
        self.html = read("visit/index.html")

    def test_every_route_links_to_google_flights(self):
        links = re.findall(r'<a class="pl-fl" data-fl="([^"]+)" href="([^"]+)"', self.html)
        self.assertGreaterEqual(len(links), 30)
        for key, href in links:
            orig, dest = key.split("-")
            self.assertTrue(href.startswith("https://www.google.com/travel/flights?q=Flights%20to%20" + dest), href)
            if orig != "ANY":
                self.assertIn("from%20" + orig, href)
        self.assertIn('target="_blank" rel="noopener"', self.html)

    def test_script_and_no_fares(self):
        self.assertLess(self.html.index("assets/js/flights.js"), self.html.index("assets/js/visit.js"))
        self.assertIn("No fares are shown here", self.html)


class ProfilePage(unittest.TestCase):
    def setUp(self):
        self.html = read("profile/index.html")

    def test_cta_label_and_copy(self):
        self.assertIn('id="tcGo" aria-controls="concierge">Travel Concierge</button>', self.html)
        self.assertIn(CTA_COPY, self.html)

    def test_preference_topics(self):
        for name in ("adults", "kids", "pace", "interests", "budget", "from", "nights", "home", "access"):
            self.assertIn(f'name="{name}"', self.html, name)
        for v in ("parks", "golf", "dining", "nightlife", "shopping", "nature", "wellness", "sports", "culture"):
            self.assertIn(f'name="interests" value="{v}"', self.html, v)
        self.assertIn("My Preferences", self.html)

    def test_script_order(self):
        order = ["profile.js", "profile-share.js", "fav-hotels.js", "flights.js", "itinerary.js", "profile-page.js", "concierge.js"]
        pos = [self.html.index(f"assets/js/{s}") for s in order]
        self.assertEqual(pos, sorted(pos))

    def test_share_controls(self):
        for i in ("tcCopy", "tcNative", "tcPdf", "tcAddDay", "tcRegen", "tcKeep"):
            self.assertIn(f'id="{i}"', self.html)


class ConciergeRules(unittest.TestCase):
    def test_ambar_visit_is_calendly_only(self):
        js = read("assets/js/itinerary.js")
        self.assertIn(f'const CALENDLY = "{CALENDLY}"', js)
        self.assertIn('case "a": return CALENDLY;', js)
        self.assertNotRegex(js.lower(), r"video|zoom\.us|teams\.microsoft|meet\.google")

    def test_no_api_key_in_client(self):
        for rel in ("assets/js/concierge.js", "assets/js/itinerary.js", "assets/js/assistant-config.js"):
            src = read(rel)
            self.assertNotRegex(src, r"sk-[A-Za-z0-9]{10,}|LLM_API_KEY\s*[:=]|Authorization", rel)
        self.assertRegex(read("assets/js/assistant-config.js"), r'proxyUrl:\s*""')

    def test_ai_is_optional_with_silent_fallback(self):
        js = read("assets/js/concierge.js")
        self.assertIn("AMBAR_ASSISTANT_CONFIG", js)
        self.assertIn("AbortController", js)
        self.assertRegex(js, r"catch \(e\) \{ /\*[^*]*\*/ \}")

    def test_switch_on_documented(self):
        doc = read("assistant-proxy/README.md")
        self.assertIn("Travel Concierge", doc)
        self.assertIn("LLM_API_KEY", doc)


class Dashboard(unittest.TestCase):
    def test_home_has_favourites_panel_and_no_calendly(self):
        html = read("index.html")
        self.assertIn('id="favPanel"', html)
        self.assertLess(html.index("assets/js/fav-hotels.js"), html.index("assets/js/app.js"))
        self.assertNotIn("calendly.com", html)
        self.assertIn("renderFavPanel", read("assets/js/app.js"))


if __name__ == "__main__":
    unittest.main()
