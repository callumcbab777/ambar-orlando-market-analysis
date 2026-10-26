"""Hero strip: true median $ across all priced nights in comps.json."""
from __future__ import annotations

import json
import statistics
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def priced_rates(db: dict) -> list[float]:
    """Same filter as assets/js/app.js `priced`: status OK and rate > 0."""
    out: list[float] = []
    for r in db.get("rates", []):
        if not r or r.get("status") != "OK":
            continue
        try:
            v = float(r.get("rate"))
        except (TypeError, ValueError):
            continue
        if v > 0:
            out.append(v)
    return out


def median_all_nights(db: dict) -> float | None:
    vals = priced_rates(db)
    return float(statistics.median(vals)) if vals else None


class HeroMedianAllNightsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = json.loads((ROOT / "data" / "comps.json").read_text())
        cls.vals = priced_rates(cls.db)

    def test_priced_nights_count_matches_hero(self):
        # Hero "Priced nights" is the count of OK rates with rate > 0.
        self.assertEqual(len(self.vals), 253)

    def test_true_median_not_weekly_or_nested(self):
        # Flat median of every priced night observation (not median-of-medians).
        med = median_all_nights(self.db)
        self.assertIsNotNone(med)
        self.assertEqual(med, 340.0)
        # Sanity vs mean-of-hotel-medians so we know it is not a nested median.
        by_hotel: dict[str, list[float]] = {}
        for r in self.db["rates"]:
            if r.get("status") == "OK" and float(r.get("rate") or 0) > 0:
                by_hotel.setdefault(r["hotel"], []).append(float(r["rate"]))
        hotel_meds = [statistics.median(v) for v in by_hotel.values()]
        nested = statistics.median(hotel_meds)
        self.assertNotEqual(med, nested)

    def test_app_js_wires_median_box(self):
        js = (ROOT / "assets" / "js" / "app.js").read_text()
        self.assertIn('["Median $"', js)
        self.assertIn("across all nights tracked", js)
        self.assertIn("okRates = priced(DB.rates)", js)
        # Order: Priced nights, then Median $, then Latest snapshot.
        i_priced = js.index('["Priced nights"')
        i_med = js.index('["Median $"')
        i_latest = js.index('["Latest snapshot"')
        self.assertLess(i_priced, i_med)
        self.assertLess(i_med, i_latest)

    def test_css_five_columns(self):
        css = (ROOT / "assets" / "css" / "styles.css").read_text()
        self.assertIn("grid-template-columns:repeat(5,minmax(0,1fr))", css)


if __name__ == "__main__":
    unittest.main()
