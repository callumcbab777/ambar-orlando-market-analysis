"""Folded from PR #13: 'By hotel' removed (stars stay on hotel cards); Week ahead grid shows the top 3 hotels with a toggle."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "index.html").read_text()
APP = (ROOT / "assets/js/app.js").read_text()
CSS = (ROOT / "assets/css/styles.css").read_text()
ASSISTANT = (ROOT / "assets/js/assistant.js").read_text()


class ByHotelRemovedTest(unittest.TestCase):
    def test_section_markup_gone(self):
        self.assertNotIn(">By hotel<", INDEX)
        self.assertNotIn('id="multiples"', INDEX)
        self.assertNotIn('href="#multiples"', INDEX)
        self.assertNotIn("by-hotel", INDEX)

    def test_js_gone(self):
        for token in ("#multiples", "small multiples", "minis", "miniMax", "updateMinis", "data-capnote", 'class: "mini"'):
            self.assertNotIn(token, APP, token)

    def test_css_gone(self):
        self.assertIsNone(re.search(r"(^|[\s,}])\.(multiples|mini)\b", CSS))

    def test_guide_does_not_mention_by_hotel(self):
        self.assertNotIn("per-hotel chart", ASSISTANT.lower())
        self.assertNotIn("#byHotel", ASSISTANT)
        self.assertNotIn("By hotel", ASSISTANT)

    def test_history_chart_not_back(self):
        self.assertNotIn('id="historyChart"', INDEX)
        self.assertNotIn("chart.umd", INDEX)
        self.assertNotIn("new Chart", APP)

    def test_knowledge_index_clean(self):
        for f in ("data/knowledge.json", "data/knowledge.js", "assistant-proxy/knowledge.json"):
            txt = (ROOT / f).read_text()
            for dead in ("By hotel", "byHotel", "favourites only", "Favourites only"):
                self.assertNotIn(dead, txt, f"{dead} in {f}")

    def test_no_leftover_text_in_pages_and_scripts(self):
        for f in list(ROOT.glob("*.html")) + list(ROOT.glob("*/index.html")) + list((ROOT / "assets/js").glob("*.js")):
            txt = f.read_text()
            for dead in ("By hotel", "#byHotel", 'id="byHotel"', "favourites only", "Favourites only"):
                self.assertNotIn(dead, txt, f"{dead} in {f.name}")
        self.assertNotRegex(APP, r"\bbyHotel\b")

    def test_every_in_page_anchor_resolves(self):
        ids = set(re.findall(r'\sid="([^"]+)"', INDEX))
        for href in re.findall(r'href="#([^"]+)"', INDEX):
            self.assertIn(href, ids, f"#{href} has no target")


class WeekAheadToggleTest(unittest.TestCase):
    def test_top_three_constant_and_rows_marked(self):
        self.assertIn("const WA_TOP = 3;", APP)
        self.assertIn("i >= WA_TOP ? ' class=\"wa-extra\"'", APP)

    def test_toggle_button_accessible(self):
        self.assertIn('id="heatToggle"', APP)
        self.assertIn('aria-controls="heatWrap"', APP)
        self.assertIn('btn.setAttribute("aria-expanded"', APP)
        self.assertIn("See all hotels (${H.length})", APP)
        self.assertIn('"Show fewer"', APP)
        self.assertIn('type="button" class="btn-more"', APP)  # native button: Enter/Space work

    def test_no_js_degrades_to_all_rows(self):
        # Rows are only hidden while JS has added .is-condensed; the static page never carries it.
        self.assertIn(".heat-wrap.is-condensed tr.wa-extra{display:none}", CSS)
        self.assertNotIn("is-condensed", INDEX)
        self.assertNotIn("wa-extra", INDEX)
        hides = re.findall(r"([^{}]*)wa-extra\{display:none\}", CSS)
        self.assertEqual(len(hides), 1, "only the JS-applied .is-condensed rule may hide rows")
        self.assertIn(".is-condensed", hides[0])

    def test_count_comes_from_data(self):
        db = json.loads((ROOT / "data/comps.json").read_text())
        self.assertGreater(len(db["hotels"]), 3, "toggle only appears with more than 3 hotels")
        self.assertNotRegex(APP, r"See all hotels \(\d+\)")  # never hard-coded

    def test_median_row_always_visible(self):
        self.assertIn('<tr class="setrow">', APP)
        self.assertNotIn('setrow wa-extra', APP)

    def test_state_kept_across_week_switches(self):
        # waExpanded lives outside selectWeek and is only flipped by the button.
        sel = APP[APP.index("function selectWeek("):]
        self.assertNotIn("waExpanded =", sel[: sel.index("\n  }\n")])
        self.assertEqual(APP.count("waExpanded = !waExpanded"), 1)
        self.assertIn("syncHeatToggle(true);", sel)
        self.assertIn("syncHeatToggle(false);", sel)

    def test_mobile_target_size(self):
        self.assertIn("min-height:44px", CSS[CSS.index(".btn-more{"):])


if __name__ == "__main__":
    unittest.main()
