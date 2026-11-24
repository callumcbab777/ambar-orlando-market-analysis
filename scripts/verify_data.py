#!/usr/bin/env python3
"""Weekly data check for the Market Landscape: every figure in data/verification.json is re-checked.

For each check it (1) confirms the figure is still on the site where the checklist says it is and (2) fetches the
source page and confirms every 'expect' string still appears there. Results:
  OK        figure on the site and every expected string found at the source
  FAIL      the figure is missing from the site, or the source no longer shows an expected string
  MANUAL    the source blocks automated fetches (403/429), has no expect strings, or is marked manual/unverified:
            a person re-checks it with the steps in docs/DATA_VERIFICATION.md
Writes a markdown report to stdout (and to $GITHUB_STEP_SUMMARY in Actions). Exit 1 on any FAIL, else 0.
Also warns when the newest weekly occupancy figure is more than 14 days old (time to add the next one).
Standard library only:  python3 scripts/verify_data.py   [--offline  skips the source fetches]
"""
import html, json, os, re, sys, urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def page_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8", "ignore")
    raw = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", " ", raw)
    t = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", t)


def site_has(check):
    s = check["site"]
    text = (ROOT / s["file"]).read_text(encoding="utf-8")
    return s["value"] in text


def main():
    offline = "--offline" in sys.argv
    spec = json.loads((ROOT / "data" / "verification.json").read_text())
    rows, fails = [], 0
    for c in spec["checks"]:
        status, note = "OK", ""
        if not site_has(c):
            status, note = "FAIL", f"value '{c['site']['value']}' not found in {c['site']['file']}"
        elif c.get("status") in ("manual", "unverified") or not c.get("url") or not c.get("expect"):
            status, note = "MANUAL", c.get("note", "no automatic source check; follow the checklist")
        elif offline:
            status, note = "MANUAL", "offline run"
        else:
            try:
                t = page_text(c["url"])
                missing = [e for e in c["expect"] if e not in t]
                if missing:
                    status, note = "FAIL", "source no longer shows: " + ", ".join(missing)
            except urllib.error.HTTPError as e:
                status, note = ("MANUAL", f"source blocked automated fetch (HTTP {e.code})") if e.code in (401, 403, 429) else ("FAIL", f"HTTP {e.code}")
            except Exception as e:
                status, note = "MANUAL", f"could not fetch ({type(e).__name__})"
        fails += status == "FAIL"
        rows.append((status, c["id"], c["figure"], c.get("url", ""), note))
    # freshness of the weekly occupancy series
    comps = json.loads((ROOT / "data" / "comps.json").read_text())
    weekly = [m for m in comps.get("market", []) if m.get("period", "").startswith("Week ending")]
    newest = max((datetime.strptime(m["period"].replace("Week ending ", ""), "%b %d, %Y").date() for m in weekly), default=None)
    out = [f"# Market Landscape data check, {date.today().isoformat()}", "",
           f"Checklist last fully verified: {spec.get('last_verified')}. Newest weekly occupancy figure: week ending {newest}.", ""]
    if newest and (date.today() - newest).days > 14:
        out += [f"**Stale:** the newest weekly occupancy figure is {(date.today() - newest).days} days old. Add the latest Visit Orlando weekly metric (see the checklist).", ""]
    out += ["| Status | Check | Figure | Source | Note |", "|---|---|---|---|---|"]
    out += [f"| {s} | {i} | {f} | {u or '(none)'} | {n} |" for s, i, f, u, n in rows]
    report = "\n".join(out)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(report + "\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
