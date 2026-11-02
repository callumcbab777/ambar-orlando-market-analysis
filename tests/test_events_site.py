"""Events page, saved/preferences wiring, assistant widget and proxy (no network, no API key)."""
from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEY_PATTERNS = [r"xai-[A-Za-z0-9]{20,}", r"sk-[A-Za-z0-9_\-]{20,}", r"Bearer\s+[A-Za-z0-9_\-]{20,}"]


class EventsPageTest(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / "events" / "index.html").read_text()

    def test_structure(self):
        for needle in ['role="tablist"', 'id="tab-saved"', 'id="tab-prefs"', 'id="panel-browse"', 'id="evReco"',
                       'id="evCat"', 'id="evArea"', 'id="evFrom"', 'id="evTo"', 'id="prefsForm"']:
            self.assertIn(needle, self.html)

    def test_local_refs_exist(self):
        for ref in re.findall(r'(?:href|src)="([^"#:?]+)', self.html):
            if ref.startswith(("http", "mailto")):
                continue
            target = (ROOT / "events" / ref).resolve()
            if ref.endswith("/"):
                target = target / "index.html"
            self.assertTrue(target.exists(), ref)

    def test_branding_and_attribution(self):
        js = (ROOT / "assets" / "js" / "events.js").read_text()
        self.assertIn("Recommended for you", js)
        self.assertIn("Powered by Isla AI - ABI Group", js)
        self.assertIn("Source: Visit Orlando listing", js)
        self.assertIn("window.AMBAR_PROFILE", js)
        self.assertIn("localStorage", (ROOT / "assets" / "js" / "profile.js").read_text())


class AssistantTest(unittest.TestCase):
    def test_no_api_key_in_client_or_repo(self):
        files = [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts and p.suffix in {".js", ".html", ".json", ".md", ".css", ".py", ".example"}]
        for p in files:
            if p.name in {"comps.js", "comps.json", "visitorlando_events.js", "visitorlando_events.json", "week_ahead.js", "week_ahead.json", "week_ahead_nights.json"} or "vendor" in p.parts:
                continue
            text = p.read_text(errors="ignore")
            for pat in KEY_PATTERNS:
                self.assertIsNone(re.search(pat, text), f"possible API key in {p}")

    def test_config_empty_by_default(self):
        cfg = (ROOT / "assets" / "js" / "assistant-config.js").read_text()
        self.assertRegex(cfg, r'proxyUrl:\s*""')

    def test_offline_mode_is_labelled(self):
        js = (ROOT / "assets" / "js" / "assistant.js").read_text()
        self.assertIn("not AI", js)
        self.assertIn('aria-live="polite"', js)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_proxy_smoke(self):
        out = subprocess.run(["node", str(ROOT / "assistant-proxy" / "test" / "smoke.js")], capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)


if __name__ == "__main__":
    unittest.main()
