"""KCOS-4 brand facelift: brand.css loads last, uses the brand palette and type rules."""
import re, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = (ROOT / "assets" / "css" / "brand.css").read_text()


class BrandFaceliftTest(unittest.TestCase):
    def test_loaded_last_on_main_pages(self):
        for f in ("index.html", "visit/index.html", "profile/index.html", "events/index.html"):
            html = (ROOT / f).read_text()
            links = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
            self.assertTrue(links[-1].endswith("assets/css/brand.css"), f)
            self.assertIn("assets/js/reveal.js", html)

    def test_palette_and_fonts(self):
        for tok in ("#FFA94A", "#010101", "#F4EFE7", "#5A5A37", "#355965", "#B37D50", "#989B74", "#171717"):
            self.assertIn(tok, CSS)
        self.assertIn("Barlow Condensed", CSS)
        self.assertIn(".135em", CSS)
        self.assertIn("cubic-bezier(0,0,.58,1)", CSS)
        for banned in ("Playfair", "Montserrat", "gradient(", "#ff00", "purple"):
            self.assertNotIn(banned, CSS)
        self.assertTrue((ROOT / "assets/fonts/BarlowCondensed-normal-600.woff2").exists())

    def test_reveal_never_hides_content(self):
        self.assertNotRegex(CSS, r"\.rv\s*\{[^}]*opacity:0")


if __name__ == "__main__":
    unittest.main()
