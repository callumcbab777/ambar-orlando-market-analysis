"""Travel Concierge chat-first entry + Generate variations, and the events page "Ask Isla what's on" dialog."""
from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALENDLY = "https://calendly.com/callum-ambarorlando/meet-us-at-ambar"


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

    def test_trip_parser(self):
        self.run_js("tests/js/trip_parse_test.js", "trip parse")

    def test_generate_variations(self):
        self.run_js("tests/js/generate_test.js", "generate")

    def test_events_ask_grounding(self):
        self.run_js("tests/js/events_ask_test.js", "events ask")

    def test_proxy_tasks(self):
        out = node("assistant-proxy/test/smoke.js")
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)


class ProfileMarkup(unittest.TestCase):
    def setUp(self):
        self.html = read("profile/index.html")

    def test_chat_box_sits_with_the_concierge_cta(self):
        cta = self.html[self.html.index('id="tcCta"'):self.html.index('id="tpForm"')]
        for i in ('id="tcAsk"', 'id="tcChatForm"', 'id="tcLog"', 'role="log"', 'id="tcFilled"', 'for="tcAsk"', 'id="tcGo"'):
            self.assertIn(i, cta)

    def test_generate_and_keep_edits_controls(self):
        for i in ('id="tcGen"', 'id="tcKeepEdits"', 'id="tcAll"', 'id="tcChoice"', ">Generate<", ">Keep my edits<", ">Regenerate all<"):
            self.assertIn(i, self.html)

    def test_parser_loads_before_concierge(self):
        self.assertLess(self.html.index("trip-parse.js"), self.html.index("concierge.js"))

    def test_no_quiz_language(self):
        for rel in ("profile/index.html", "events/index.html", "assets/js/concierge.js", "assets/js/trip-parse.js", "assets/js/events-isla.js", "assets/js/events-ask.js"):
            text = re.sub(r"\.test\(|\btest\b(?=\s*\()|/\*.*?\*/", "", read(rel), flags=re.S)
            self.assertNotRegex(re.sub(r"<script.*?</script>", "", text, flags=re.S), r"(?i)\bquiz|\bscore\b|take the test", rel)


class EventsIsla(unittest.TestCase):
    def setUp(self):
        self.html = read("events/index.html")

    def test_button_and_label(self):
        self.assertIn('id="evIslaBtn"', self.html)
        self.assertIn("Powered by Isla AI - ABI Group", self.html)
        self.assertIn('aria-haspopup="dialog"', self.html)

    def test_dialog_and_prompts(self):
        dlg = self.html[self.html.index('<dialog class="isla-dlg"'):self.html.index("</dialog>")]
        self.assertIn('aria-labelledby="evIslaTitle"', dlg)
        self.assertIn('aria-label="Close Ask Isla"', dlg)
        self.assertTrue(3 <= dlg.count('class="isla-chip"') <= 4)

    def test_scripts(self):
        self.assertLess(self.html.index("visitorlando_events.js"), self.html.index("events-ask.js"))
        self.assertLess(self.html.index("events-ask.js"), self.html.index("events-isla.js"))
        self.assertLess(self.html.index("events-isla.js"), self.html.index("assistant-config.js") + 10 ** 6)

    def test_focus_trap_escape_and_grounding(self):
        js = read("assets/js/events-isla.js")
        self.assertIn("showModal", js)
        self.assertIn('"Escape"', js)
        self.assertIn('"Tab"', js)
        self.assertIn("A.ground(", js)
        self.assertIn("A.answer(", js)
        self.assertNotRegex(js, r"sk-[A-Za-z0-9]{10,}|LLM_API_KEY|Authorization")

    def test_mobile_full_screen(self):
        css = read("assets/css/events.css")
        self.assertRegex(css, r"@media \(max-width:640px\)\{\s*\.isla-dlg\{width:100vw")


class PhoneOverlay(unittest.TestCase):
    def test_visit_bar_steps_aside_for_the_itinerary(self):
        js = read("assets/js/visit-cta.js")
        self.assertIn('getElementById("tcDays")', js)
        self.assertIn("!state.itin", js)

    def test_launcher_tucks_over_edit_buttons(self):
        self.assertIn('data-as-avoid role="group"', read("assets/js/concierge.js"))
        self.assertIn('querySelectorAll("[data-as-avoid]")].some', read("assets/js/assistant.js"))

    def test_calendly_in_person_only(self):
        for rel in ("assets/js/concierge.js", "assets/js/itinerary.js", "assets/js/events-isla.js", "profile/index.html", "events/index.html"):
            for url in re.findall(r"https://calendly\.com/[^\s\"'<>)]+", read(rel)):
                self.assertEqual(url.rstrip("/"), CALENDLY, rel)


if __name__ == "__main__":
    unittest.main()
