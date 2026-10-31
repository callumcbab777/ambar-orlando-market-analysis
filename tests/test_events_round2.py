"""Round 2 (+ round 3 moves): calm landing, date buckets, share (PDF + link), Plan your visit (now its own page,
visit/, with a teaser card on the events page), header nav."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "events/index.html", "visit/index.html", "profile/index.html")


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
        share = read("assets/js/profile-share.js")
        self.assertIn("navigator.share", share)
        self.assertIn("navigator.clipboard", share)
        self.assertIn("AMBAR_PROFILE_SHARE.wire(", self.js)
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
        for page in PAGES:
            for src in re.findall(r'<script[^>]+src="([^"]+)"', read(page)):
                self.assertFalse(src.startswith(("http:", "https:", "//")), f"{page}: external script {src}")

    def test_event_links_are_whitelisted(self):
        self.assertIn("https://www.visitorlando.com/", self.js)
        self.assertTrue("const safeUrl" in self.js)


class PlanSectionTest(unittest.TestCase):
    """The Plan your visit content now lives on visit/index.html; the events page keeps a teaser card."""
    def setUp(self):
        html = read("visit/index.html")
        self.plan = html[html.index('<main id="main">'):html.index("</main>")]
        self.plan_js = read("assets/js/plan.js")

    def test_sections(self):
        for needle in ['id="getting-here"', 'id="brightline"', 'id="drive-times"', 'id="best-time"', 'id="visit-ambar"',
                       'id="plMonths"', 'id="plBook"', 'id="vhBook"']:
            self.assertIn(needle, self.plan)
        for code in (">MCO<", ">SFB<", ">MLB<"):
            self.assertIn(code, self.plan)
        # the events page keeps a teaser, not the old tabs
        ev = read("events/index.html")
        i = ev.index('id="plan"')
        teaser = ev[i:ev.index("</section>", i)]
        self.assertIn('class="pl-teaser"', teaser)
        self.assertIn('href="../visit/"', teaser)
        self.assertNotIn('role="tab"', teaser)
        self.assertNotIn("planTabs", read("assets/js/plan.js"))
        self.assertIn("../visit/", read("assets/js/events.js"))  # old #getting-here etc. links redirect

    def test_links_are_https_and_well_formed(self):
        links = re.findall(r'href="([^"]+)"', self.plan)
        self.assertTrue(links)
        for href in links:
            self.assertTrue(href.startswith(("https://", "#", "../")), href)
            self.assertNotRegex(href, r"\s")
        self.assertIn("https://calendly.com/callum-ambarorlando/meet-us-at-ambar", links)
        self.assertIn("https://www.google.com/maps/dir/?api=1&amp;destination="
                      "8701%20W%20Irlo%20Bronson%20Memorial%20Hwy%2C%20Unit%20108%2C%20Kissimmee%2C%20FL%2034747", links)
        self.assertTrue(any(h.startswith("https://www.google.com/travel/flights") for h in links))

    def test_booking_cta_in_person_only(self):
        primary = re.search(r'<a class="btn btn-visit" id="plBook" href="([^"]+)"[^>]*>(.*?)</a>', self.plan, re.S)
        self.assertIsNotNone(primary)
        self.assertEqual(primary.group(1), "https://calendly.com/callum-ambarorlando/meet-us-at-ambar")
        self.assertIn("Visit AMBAR", primary.group(2))
        booking = sorted(set(re.findall(r'https://calendly\.com/[^"\s<)`]+', self.plan)))
        self.assertEqual(booking, ["https://calendly.com/callum-ambarorlando/meet-us-at-ambar"])
        self.assertIn("8701 W Irlo Bronson Memorial Hwy, Unit 108", self.plan)
        self.assertIn("google.com/maps/dir/?api=1", self.plan)

    def test_no_video_call_or_30min_anywhere(self):
        files = [ROOT / "index.html", ROOT / "README.md"] + [ROOT / p for p in PAGES[1:]]
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
        for f in [ROOT / p for p in PAGES] + [ROOT / "assets" / "js" / "assistant.js", ROOT / "README.md"]:
            for url in re.findall(r"https://calendly\.com/[A-Za-z0-9_\-/]+", f.read_text(encoding="utf-8")):
                self.assertEqual(url, "https://calendly.com/callum-ambarorlando/meet-us-at-ambar", f.name)

    def test_sources_and_dates(self):
        for needle in ["flymco.com", "flysfb.com", "mlbair.com", "gobrightline.com", "ncei.noaa.gov", "themeparkdirect.com",
                       "openstreetmap.org", "project-osrm.org", "as of Oct 31, 2026", "Seasonal", "no traffic",
                       "8701 W Irlo Bronson Memorial Hwy"]:
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


VISIT_URL = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar"


def calendly_anchors(text: str):
    return re.findall(r'<a\b([^>]*href="https://calendly\.com/[^"]*"[^>]*)>(.*?)</a>', text, re.S)


class VisitCtaTest(unittest.TestCase):
    def setUp(self):
        self.html = read("events/index.html")
        self.js = read("assets/js/events.js")

    def test_every_calendly_link_is_the_visit_cta(self):
        anchors = calendly_anchors(self.html) + calendly_anchors(self.js.replace("${VISIT_URL}", VISIT_URL))
        self.assertGreaterEqual(len(anchors), 4)
        for attrs, inner in anchors:
            self.assertIn(f'href="{VISIT_URL}"', attrs)
            self.assertIn('target="_blank"', attrs)
            self.assertIn('rel="noopener"', attrs)
            self.assertIn("btn-visit", attrs)
            visible = re.sub(r'<span class="sr-only">.*?</span>', "", inner).strip()
            self.assertEqual(visible, "Visit AMBAR")
        self.assertIn(f'const VISIT_URL = "{VISIT_URL}"', self.js)
        for url in re.findall(r"https://calendly\.com/[A-Za-z0-9_\-/]+", self.html + self.js):
            self.assertEqual(url, VISIT_URL)

    def test_band_sits_between_picks_and_buckets(self):
        picks = self.html.index('id="evPicks"')
        band = self.html.index('id="evVisitBand"')
        buckets = self.html.index('id="evBucketTiles"')
        full = self.html.index('id="events"')
        self.assertLess(picks, band)
        self.assertLess(band, buckets)
        self.assertLess(band, full)
        seg = self.html[band:buckets]
        self.assertIn("See AMBAR while you’re in", seg)
        self.assertIn("8701 W Irlo Bronson Memorial Hwy, Unit 108", seg)
        self.assertIn(">Directions<", seg)
        self.assertEqual(len(calendly_anchors(seg)), 1)
        self.assertIsNone(re.search(r"[$£€]\s?\d", seg))

    def test_my_list_and_shared_view_lines(self):
        i = self.html.index('id="panel-saved"')
        saved = self.html[i:self.html.index('id="panel-prefs"')]
        self.assertIn('id="evVisitLine" hidden', saved)
        self.assertIn('$("#evVisitLine").hidden = !saved.length;', self.js)
        self.assertIn('visitSlim("evSharedVisit")', self.js)

    def test_mobile_bar(self):
        self.assertIn('id="evMbar" hidden', self.html)
        self.assertIn('id="evMbarX"', self.html)
        self.assertIn("assets/js/visit-cta.js", self.html)
        js = read("assets/js/visit-cta.js")
        for needle in ("IntersectionObserver", "sessionStorage", "max-width: 760px", "evVisitBand", '"plan"'):
            self.assertIn(needle, js)
        css = read("assets/css/events.css")
        self.assertIn("safe-area-inset-bottom", css)
        self.assertIn("html.has-mbar body{padding-bottom", css)
        self.assertRegex(css, r"\.ev-mbar\{display:none\}")

    def test_no_cta_in_header_hero_cards_or_main_page(self):
        header = re.search(r"<header class=\"site-header.*?</header>", self.html, re.S).group(0)
        hero = self.html[self.html.index('class="evh"'):self.html.index('id="evPicks"')]
        self.assertNotIn("calendly", header + hero)
        card = self.js[self.js.index("function card("):self.js.index("document.addEventListener", self.js.index("function card("))]
        self.assertNotIn("VISIT_URL", card)
        self.assertNotIn("calendly", read("index.html"))

    def test_button_style_contrast_and_target(self):
        css = read("assets/css/events.css")
        rule = re.search(r"\.btn-visit\{([^}]*)\}", css).group(1)
        self.assertIn("background:var(--amber)", rule)
        self.assertIn("color:var(--dark)", rule)
        self.assertIn("min-height:48px", rule)
        self.assertIn("min-height:44px", re.search(r"\.btn-visit-sm\{([^}]*)\}", css).group(1))
        self.assertIn(".btn-visit:focus-visible{outline:3px solid", css)


class NavTest(unittest.TestCase):
    def test_nav_script_on_every_page(self):
        for page in PAGES:
            html = read(page)
            self.assertIn("assets/js/nav.js", html)
            nav = re.search(r'<nav class="site-nav".*?</nav>', html, re.S).group(0)
            self.assertIn("My Profile", nav, page)
            self.assertIn("data-profile-count", nav, page)
            self.assertRegex(nav, r'href="(\.\./)?visit/|href="index\.html" class="active"', page)
            self.assertNotIn("My list", html, page)

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
