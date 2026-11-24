"""KCOS-4 brand facelift: brand.css loads last, uses the brand palette and type rules."""
import re, subprocess, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = (ROOT / "assets" / "css" / "brand.css").read_text()


class BrandFaceliftTest(unittest.TestCase):
    def test_loaded_last_on_main_pages(self):
        for f in ("index.html", "visit/index.html", "profile/index.html", "events/index.html"):
            html = (ROOT / f).read_text()
            links = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
            self.assertTrue(links[-1].endswith("assets/css/brand.css"), f)
            self.assertIn("assets/js/motion.js", html)
            self.assertIn("assets/brand/ambar-logo-white.svg", html)
            self.assertNotIn("ambar-logo.png", html)

    def test_palette_and_fonts(self):
        for tok in ("#FFA94A", "#010101", "#F4EFE7", "#5A5A37", "#355965", "#B37D50", "#989B74", "#171717"):
            self.assertIn(tok, CSS)
        self.assertIn("Barlow Condensed", CSS)
        self.assertIn(".135em", CSS)
        self.assertIn("cubic-bezier(0,0,.58,1)", CSS)
        for banned in ("Playfair", "Montserrat", "gradient(", "#ff00", "purple"):
            self.assertNotIn(banned, CSS)
        self.assertTrue((ROOT / "assets/fonts/BarlowCondensed-normal-600.woff2").exists())

    def test_cinematic_hero_and_imagery(self):
        home = (ROOT / "index.html").read_text()
        self.assertIn('class="hero hero-cine"', home)
        self.assertIn('fetchpriority="high"', home)
        self.assertEqual(home.count("data-srcset="), 9)  # slides 2-4 (3 sources each) wait for page load
        self.assertIn("Renderings: AMBAR Residences Orlando", home)
        self.assertIn('id="cinePause"', home)
        for f in ("index.html", "visit/index.html", "events/index.html", "profile/index.html", "moments/index.html"):
            self.assertNotIn("ambar-logo.png", (ROOT / f).read_text(), f)
        r = subprocess.run([sys.executable, str(ROOT / "tools/build_imagery.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)
        # mobile hero budget: the first slide's 1600w AVIF (what a 390px @3x phone picks) stays under 400 KB
        self.assertLess((ROOT / "assets/img/r/pool-sunset-1600.avif").stat().st_size, 400_000)
        js = (ROOT / "assets/js/motion.js").read_text()
        self.assertIn("prefers-reduced-motion", js)

    def test_moments_in_facelift(self):
        m = (ROOT / "moments/index.html").read_text()
        self.assertIn("../assets/css/brand.css", m)
        self.assertIn("../assets/css/moments-brand.css", m)
        self.assertIn("../assets/js/motion.js", m)

    def test_reveal_never_hides_content(self):
        self.assertNotRegex(CSS, r"\.rv\s*\{[^}]*opacity:0")


if __name__ == "__main__":
    unittest.main()
