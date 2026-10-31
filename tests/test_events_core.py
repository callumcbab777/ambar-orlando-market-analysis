"""Date buckets, share-link encode/decode and 'This week' picks (assets/js/events-core.js), run in Node."""
from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("node"), "node not installed")
class EventsCoreTest(unittest.TestCase):
    def test_core_js(self):
        out = subprocess.run(["node", str(ROOT / "tests" / "js" / "events_core_test.js")], capture_output=True, text=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("checks passed", out.stdout)

    def test_core_has_no_dom_or_network(self):
        js = (ROOT / "assets" / "js" / "events-core.js").read_text()
        for bad in ("document.", "fetch(", "XMLHttpRequest", "localStorage"):
            self.assertNotIn(bad, js)


if __name__ == "__main__":
    unittest.main()
