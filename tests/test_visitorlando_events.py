"""Sanity checks for Visit Orlando events data + news shape."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class VisitOrlandoEventsTest(unittest.TestCase):
    def test_events_file(self):
        path = ROOT / "data" / "visitorlando_events.json"
        self.assertTrue(path.exists())
        data = json.loads(path.read_text())
        self.assertEqual(data.get("attribution"), "Visit Orlando")
        self.assertTrue(data.get("calendar_url", "").startswith("https://www.visitorlando.com/"))
        events = data["events"]
        self.assertEqual(data["event_count"], len(events))
        self.assertGreaterEqual(len(events), 20)
        for e in events:
            self.assertTrue(e["title"])
            self.assertRegex(e["start_date"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertRegex(e["end_date"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertIn("visitorlando.com", e["url"])
            self.assertLessEqual(e["start_date"], data["window_end"])
            self.assertGreaterEqual(e["end_date"], data["window_start"])

    def test_js_mirror(self):
        js = (ROOT / "data" / "visitorlando_events.js").read_text()
        self.assertIn("window.VO_EVENTS_DATA", js)

    def test_news_categories(self):
        comps = json.loads((ROOT / "data" / "comps.json").read_text())
        cats = {n.get("category") for n in comps["news"]}
        self.assertTrue({"marriott", "orlando", "hospitality"} <= cats)

    def test_index_has_section(self):
        html = (ROOT / "index.html").read_text()
        self.assertIn('id="orlando-events"', html)
        self.assertIn('href="#orlando-events"', html)
        self.assertIn("Wider Orlando", html)


if __name__ == "__main__":
    unittest.main()
