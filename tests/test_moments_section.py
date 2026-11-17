"""My Orlando Moments, folded into the Market Landscape as /moments/."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = (
    "index.html",
    "events/index.html",
    "visit/index.html",
    "profile/index.html",
    "moments/index.html",
)
CALENDLY = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar"
BANNED = (
    "quiz",
    "score",
    "video call",
    "video-call",
    "calendly.com/callum-ambarorlando/30min",
    "/30min",
)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class MomentsNavTest(unittest.TestCase):
    def test_every_page_has_moments_in_the_site_nav(self):
        for rel in PAGES:
            html = read(rel)
            nav = re.search(r'<nav class="site-nav".*?</nav>', html, flags=re.S)
            self.assertIsNotNone(nav, rel)
            self.assertIn("assets/js/nav.js", html, rel)
            self.assertIn("My Profile", nav.group(0), rel)
            if rel == "index.html":
                self.assertIn('href="moments/"', nav.group(0))
                self.assertIn("Moments", nav.group(0))
            elif rel == "moments/index.html":
                self.assertRegex(
                    nav.group(0),
                    r'href="index.html" class="active" aria-current="page">Moments',
                )
                self.assertRegex(nav.group(0), r'href="(\.\./)?visit/"')
                self.assertRegex(nav.group(0), r'href="(\.\./)?profile/"')
            else:
                self.assertIn('href="../moments/"', nav.group(0), rel)


class MomentsPageTest(unittest.TestCase):
    def setUp(self):
        self.html = read("moments/index.html")

    def test_landscape_chrome_and_demo_lines_unchanged(self):
        self.assertIn('class="site-header"', self.html)
        self.assertIn('class="site-footer', self.html)
        self.assertIn("Internal concept demo", self.html)
        self.assertIn("Not for distribution to buyers.", self.html)
        self.assertIn(
            "AMBAR renderings courtesy of AMBAR Residences Orlando, approved for external use",
            self.html,
        )
        self.assertIn("Reset demo", self.html)
        self.assertIn('id="reset"', self.html)

    def test_moments_behaviour_hooks_present(self):
        for needle in (
            'id="cards"',
            "assets/js/tiles.js",
            "assets/js/app.js",
            "assets/js/data.js",
            "assets/vendor/leaflet.js",
            'data-tab="explore"',
            'data-tab="saved"',
            'data-tab="moments"',
        ):
            self.assertIn(needle, self.html)
        js = read("moments/assets/js/tiles.js")
        self.assertIn("demo=complete", js)
        self.assertIn("mo-fin", js)
        self.assertIn("ambar-aerial.jpg", js)
        self.assertIn("prefers-reduced-motion", js)
        app = read("moments/assets/js/app.js")
        for key in ("mo-ans", "mo-done", "mo-sum", "mo-pins"):
            self.assertIn(key, app)
        # Keys stay in the Moments mo-* namespace; they do not collide with Landscape.
        self.assertNotIn("ambar.profile", app)

    def test_no_banned_language_or_video_calendly(self):
        files = [ROOT / rel for rel in PAGES]
        files += [ROOT / "moments" / "assets" / "js" / "app.js"]
        files += [ROOT / "moments" / "assets" / "js" / "data.js"]
        files += [ROOT / "moments" / "assets" / "js" / "tiles.js"]
        files += [ROOT / "moments" / "index.html"]
        for f in files:
            text = re.sub(r"\s+", " ", f.read_text(encoding="utf-8")).lower()
            for bad in BANNED:
                self.assertNotIn(bad, text, f"{f.name}: found {bad!r}")
            for url in re.findall(r"https://calendly\.com/[A-Za-z0-9_\-/]+", f.read_text(encoding="utf-8")):
                self.assertEqual(url, CALENDLY, f.name)


if __name__ == "__main__":
    unittest.main()
