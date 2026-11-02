"""Sections 05 (Demand context) and 06 (Orlando & hospitality news) are condensed by default with the
same 'See all' toggle pattern as the Week ahead grid."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "index.html").read_text()
APP = (ROOT / "assets/js/app.js").read_text()
CSS = (ROOT / "assets/css/styles.css").read_text()
DB = json.loads((ROOT / "data/comps.json").read_text())
KNOW = json.loads((ROOT / "data/knowledge.json").read_text())


class SectionNumberingTest(unittest.TestCase):
    def test_05_and_06_are_demand_and_news(self):
        self.assertRegex(INDEX, r'id="demand"[\s\S]{0,300}05 · Demand context')
        self.assertRegex(INDEX, r'id="news"[\s\S]{0,300}06 · Orlando &amp; hospitality news')


class SharedToggleTest(unittest.TestCase):
    def test_one_shared_helper_used_by_both_sections(self):
        self.assertEqual(APP.count("function moreToggle("), 1)
        self.assertIn('moreToggle({ id: "demandToggle", regions: ["timeline", ...(LA.length ? ["ahead"] : [])]', APP)
        self.assertIn('moreToggle({ id: "newsToggle", regions: ["newsList"]', APP)

    def test_native_accessible_button(self):
        helper = APP[APP.index("function moreToggle("):APP.index("function reveal(")]
        self.assertIn('type="button" class="btn-more"', helper)  # Enter/Space for free
        self.assertIn('aria-controls="${regions.join(" ")}"', helper)
        self.assertIn('btn.setAttribute("aria-expanded"', helper)
        self.assertIn('"Show fewer"', helper)
        self.assertIn("`See all ${noun} (${t.total})`", helper)
        self.assertIn("`Showing ${t.preview} of ${t.total} ${noun}`", helper)

    def test_reuses_week_ahead_css(self):
        self.assertIn('class: "heat-more more-bar"', APP)
        self.assertIn("min-height:44px", CSS[CSS.index(".btn-more{"):])
        self.assertIn("@media (max-width:560px){.heat-more{flex-direction:column}.btn-more{width:100%}}", CSS)

    def test_no_js_shows_everything(self):
        self.assertIn(".is-condensed .more-extra{display:none}", CSS)
        self.assertEqual(len(re.findall(r"more-extra\{display:none\}", CSS)), 1)
        for token in ("is-condensed", "more-extra", "demandToggle", "newsToggle"):
            self.assertNotIn(token, INDEX)

    def test_preview_sizes_and_counts_from_data(self):
        self.assertIn("const DM_TOP = 3, DA_TOP = 3;", APP)
        self.assertIn("const NEWS_TOP = 4;", APP)
        self.assertIn("more.sync(Math.min(shownEv, DM_TOP) + Math.min(LA.length, DA_TOP), shownEv + LA.length)", APP)
        self.assertIn("more.sync(Math.min(shown.length, NEWS_TOP), shown.length)", APP)
        self.assertNotRegex(APP, r"See all (demand notes|headlines) \(\d+\)")
        self.assertGreater(len(DB["news"]), 4, "news toggle should appear with this data")


class RevealTest(unittest.TestCase):
    def test_hash_links_expand_hidden_items(self):
        self.assertIn("function reveal(hash)", APP)
        self.assertIn('addEventListener("hashchange"', APP)
        self.assertIn('document.addEventListener("click", (e) => { const a = e.target.closest("a[href*=\'#\']")', APP)
        self.assertIn('target.closest(".more-extra")) t.expand()', APP)
        self.assertIn("bindReveal();", APP)

    def test_news_filter_resets_for_deep_link(self):
        self.assertIn("more.resolve = (id) =>", APP)

    def test_item_anchors_rendered(self):
        self.assertIn('id="news-${n._n}"', APP)
        self.assertIn('id="demand-${wk}-${i + 1}"', APP)
        self.assertIn('id="ahead-${i + 1}"', APP)

    def test_knowledge_news_links_point_at_headline_anchor(self):
        news = [d for d in KNOW["docs"] if d["id"].startswith("news:")]
        self.assertEqual(len(news), len(DB["news"]))
        for d, n in zip(sorted(news, key=lambda d: int(d["id"][5:])), DB["news"]):
            self.assertEqual(d["url"], n.get("url") or f"index.html#news-{d['id'][5:]}")

    def test_nav_anchors_still_present(self):
        for a in ("demand", "news"):
            self.assertIn(f'href="#{a}"', INDEX)
            self.assertIn(f'id="{a}"', INDEX)

    def test_stars_untouched(self):
        self.assertIn("function bindFavs()", APP)
        self.assertIn("P.toggleHotel(id)", APP)


if __name__ == "__main__":
    unittest.main()
