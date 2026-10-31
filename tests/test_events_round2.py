"""Round 2: calm landing, date buckets, share (PDF + link), plan-your-visit section, header nav."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class LandingAndShareTest(unittest.TestCase):
    def setUp(self):
        self.html = read("events/index.html")
        self.js = read("assets/js/events.js")

    def test_landing_structure(self):
        for needle in ['class="evh"', 'id="evPicks"', 'id="evBucketTiles"', 'id="evQuick"', 'id="evMoreFilters"',
                       'href="#events"', 'data-bucket-link="next"']:
            self.assertIn(needle, self.html)
        # no long date strip any more; buckets come from the shared core (local date)
        self.assertNotIn("ev-days", self.html)
        self.assertIn("C.buckets(", self.js)
        self.assertIn("C.localToday()", self.js)
        self.assertIn("C.picks(", self.js)

    def test_share_wiring(self):
        for needle in ['id="evShare"', 'id="shPdf"', 'id="shNative"', 'id="shCopy"', 'id="shStatus"', 'id="evShared"']:
            self.assertIn(needle, self.html)
        self.assertIn("navigator.share", self.js)
        self.assertIn("navigator.clipboard", self.js)
        self.assertIn("C.decodeShare(", self.js)
        self.assertIn("C.shareUrl(", self.js)
        self.assertIn("read-only", self.js)
        self.assertIn('id="shAddAll"', self.js)

    def test_pdf_is_vendored_and_licensed(self):
        for rel in ["assets/vendor/jspdf.umd.min.js", "assets/vendor/jspdf.LICENSE.txt",
                    "assets/vendor/pdf-fonts.js", "assets/vendor/pdf-fonts.LICENSE.txt", "assets/js/events-pdf.js"]:
            self.assertTrue((ROOT / rel).exists(), rel)
        pdf = read("assets/js/events-pdf.js")
        self.assertIn("assets/vendor/jspdf.umd.min.js", pdf)
        self.assertIn("textWithLink", pdf)
        self.assertIn("SIL Open Font License", read("assets/vendor/pdf-fonts.LICENSE.txt"))
        self.assertIn("MIT", read("assets/vendor/jspdf.LICENSE.txt"))
        fonts = read("assets/vendor/pdf-fonts.js")
        for k in ("DMSans-Regular", "DMSans-Bold", "Cormorant-Medium", "Cormorant-MediumItalic"):
            self.assertIn(k, fonts)

    def test_no_third_party_scripts(self):
        for page in ("index.html", "events/index.html"):
            for src in re.findall(r'<script[^>]+src="([^"]+)"', read(page)):
                self.assertFalse(src.startswith(("http:", "https:", "//")), f"{page}: external script {src}")

    def test_event_links_are_whitelisted(self):
        self.assertIn("https://www.visitorlando.com/", self.js)
        self.assertTrue("const safeUrl" in self.js)


class PlanSectionTest(unittest.TestCase):
    def setUp(self):
        html = read("events/index.html")
        i = html.index('id="plan"')
        self.plan = html[i:html.index("</section>", i)]
        self.plan_js = read("assets/js/plan.js")

    def test_tabs_and_panels(self):
        for needle in ['id="ptab-getting"', 'id="ptab-when"', 'id="ptab-visit"', 'id="plMonths"', 'id="plBook"']:
            self.assertIn(needle, self.plan)

    def test_links_are_https_and_well_formed(self):
        links = re.findall(r'href="([^"]+)"', self.plan)
        self.assertTrue(links)
        for href in links:
            self.assertTrue(href.startswith("https://") or href.startswith("#"), href)
            self.assertNotRegex(href, r"\s")
        self.assertIn("https://calendly.com/callum-ambarorlando/meet-us-at-ambar", links)
        self.assertIn("https://www.google.com/maps/dir/?api=1&amp;destination="
                      "8701%20W%20Irlo%20Bronson%20Memorial%20Hwy%2C%20Unit%20108%2C%20Kissimmee%2C%20FL%2034747", links)
        self.assertTrue(any(h.startswith("https://www.google.com/travel/flights") for h in links))

    def test_booking_cta_in_person_only(self):
        primary = re.search(r'<a class="btn btn-solid" id="plBook" href="([^"]+)"[^>]*>(.*?)</a>', self.plan, re.S)
        self.assertIsNotNone(primary)
        self.assertEqual(primary.group(1), "https://calendly.com/callum-ambarorlando/meet-us-at-ambar")
        self.assertIn("Meet us at AMBAR", primary.group(2))
        booking = sorted(set(re.findall(r'https://calendly\.com/[^"\s<)`]+', self.plan)))
        self.assertEqual(booking, ["https://calendly.com/callum-ambarorlando/meet-us-at-ambar"])
        self.assertIn("8701 W Irlo Bronson Memorial Hwy, Unit 108", self.plan)
        self.assertIn("google.com/maps/dir/?api=1", self.plan)

    def test_no_video_call_or_30min_anywhere(self):
        files = [ROOT / "index.html", ROOT / "README.md"] + sorted((ROOT / "events").rglob("*.html"))
        files += sorted(p for p in (ROOT / "assets" / "js").glob("*.js"))
        files += sorted((ROOT / "assets" / "css").glob("*.css"))
        files += sorted((ROOT / "data").glob("*.js*")) + sorted((ROOT / "assistant-proxy").rglob("*.*"))
        for f in files:
            if not f.is_file() or "node_modules" in f.parts:
                continue
            text = re.sub(r"\s+", " ", f.read_text(encoding="utf-8", errors="ignore")).lower()
            for bad in ("calendly.com/callum-ambarorlando/30min", "/30min", "video call", "video-call",
                        "can’t come in person", "can't come in person", "introduction to ambar",
                        "mention it when you book", "mention a tour"):
                self.assertNotIn(bad, text, f"{f.relative_to(ROOT)}: {bad}")
        # the only Calendly link on the site is the in-person visit
        for f in [ROOT / "index.html", ROOT / "events" / "index.html", ROOT / "assets" / "js" / "assistant.js", ROOT / "README.md"]:
            for url in re.findall(r"https://calendly\.com/[A-Za-z0-9_\-/]+", f.read_text(encoding="utf-8")):
                self.assertEqual(url, "https://calendly.com/callum-ambarorlando/meet-us-at-ambar", f.name)

    def test_sources_and_dates(self):
        for needle in ["flymco.com", "flysfb.com", "ncei.noaa.gov", "themeparkdirect.com", "openstreetmap.org",
                       "as of Oct 31, 2026", "Seasonal", "8701 W Irlo Bronson Memorial Hwy"]:
            self.assertIn(needle, self.plan)

    def test_no_fare_numbers(self):
        text = re.sub(r"<[^>]+>", " ", self.plan) + self.plan_js
        self.assertIsNone(re.search(r"[$£€]\s?\d", text), "fare/price figure found")
        self.assertIsNone(re.search(r"\d+\s?(USD|GBP|EUR)\b", text))

    def test_climate_and_crowd_data(self):
        normals = re.search(r"NORMALS_F\s*=\s*\[(.*?)\];", self.plan_js, re.S).group(1)
        pairs = re.findall(r"\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]", normals)
        self.assertEqual(len(pairs), 12)
        for hi, lo in pairs:
            self.assertGreater(float(hi), float(lo))
        crowd = re.search(r"CROWD_1_5\s*=\s*\[([^\]]*)\]", self.plan_js).group(1)
        vals = [int(v) for v in crowd.split(",")]
        self.assertEqual(len(vals), 12)
        self.assertTrue(all(1 <= v <= 5 for v in vals))


class NavTest(unittest.TestCase):
    def test_nav_script_on_both_pages(self):
        for page in ("index.html", "events/index.html"):
            self.assertIn("assets/js/nav.js", read(page))

    def test_menu_breakpoint_and_toggle(self):
        css = read("assets/css/styles.css")
        self.assertIn("@media (max-width:1180px)", css)
        self.assertIn(".nav-toggle", css)
        js = read("assets/js/nav.js")
        self.assertIn("aria-expanded", js)
        self.assertIn("Escape", js)

    def test_main_nav_labels_short(self):
        nav = re.search(r'<nav class="site-nav".*?</nav>', read("index.html"), re.S).group(0)
        labels = [re.sub(r"<[^>]+>", "", a).strip() for a in re.findall(r"<a[^>]*>(.*?)</a>", nav, re.S)]
        self.assertTrue(labels)
        # total label length budget keeps the bar on one line at 1280px (measured in render QA)
        self.assertLessEqual(sum(len(l) for l in labels), 90, labels)


if __name__ == "__main__":
    unittest.main()
