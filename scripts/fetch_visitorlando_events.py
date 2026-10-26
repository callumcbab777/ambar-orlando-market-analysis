#!/usr/bin/env python3
"""Fetch Visit Orlando public events into data/visitorlando_events.json (+ .js).

Visit Orlando runs on Simpleview. The documented REST endpoint
  /includes/rest_v2/plugins_events_events_by_date/find/
is often blocked by Akamai for non-browser clients (403 Access Denied).

This script therefore:
  1) Tries the REST API with a simpleToken from /plugins/core/get_simple_token/
  2) Falls back to sitemap + public event detail pages (JSON-LD), using a cookie
     jar warmed on / and /events/all/ (same path that worked from a desktop).

Usage:
  python3 scripts/fetch_visitorlando_events.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Writes:
  data/visitorlando_events.json
  data/visitorlando_events.js
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "data" / "visitorlando_events.json"
OUT_JS = ROOT / "data" / "visitorlando_events.js"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
)
CJ = Path("/tmp/vo_fetch_cookies.txt")
BASE = "https://www.visitorlando.com"


def curl(url: str, out: Path | None = None, extra: list[str] | None = None) -> tuple[str, str]:
    cmd = [
        "curl", "-sL", "-c", str(CJ), "-b", str(CJ), "-A", UA,
        "-H", "Accept: text/html,application/xhtml+xml,application/json",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-H", "Referer: https://www.visitorlando.com/events/all/",
        "--max-time", "30", "-w", "%{http_code}",
    ]
    if extra:
        cmd.extend(extra)
    if out is not None:
        cmd.extend(["-o", str(out), url])
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.stdout.strip(), out.read_text(errors="replace") if out.exists() else ""
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    body, code = r.stdout[:-3], r.stdout[-3:]
    return code, body


def warm_session() -> None:
    CJ.unlink(missing_ok=True)
    curl(f"{BASE}/")
    curl(f"{BASE}/events/all/")


def try_rest(start: date, end: date) -> list[dict] | None:
    """Return events from Simpleview REST, or None if blocked/unavailable."""
    code, token = curl(f"{BASE}/plugins/core/get_simple_token/")
    token = token.strip()
    if code != "200" or len(token) < 16:
        print(f"  REST token failed ({code})", file=sys.stderr)
        return None
    cats = ["7", "9", "6", "5", "23", "4", "22", "3", "2", "1"]
    body = {
        "filter": {
            "active": True,
            "$and": [{"categories.catId": {"$in": cats}}],
            "date_range": {
                "start": {"$date": f"{start.isoformat()}T04:00:00.000Z"},
                "end": {"$date": f"{end.isoformat()}T04:00:00.000Z"},
            },
        },
        "fields": {
            "recid": 1, "title": 1, "categories": 1, "description": 1,
            "startDate": 1, "endDate": 1, "location": 1, "city": 1,
            "url": 1, "weburl": 1, "admission": 1, "times": 1,
        },
        "skip": 0,
        "limit": 500,
        "sort": {"startDate": 1},
    }
    qs = urllib.parse.urlencode({"json": json.dumps(body, separators=(",", ":")), "token": token})
    url = f"{BASE}/includes/rest_v2/plugins_events_events_by_date/find/?{qs}"
    code, text = curl(url)
    if code != "200":
        print(f"  REST find blocked/failed ({code})", file=sys.stderr)
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        print("  REST response not JSON", file=sys.stderr)
        return None
    docs = data.get("docs") or data.get("results") or []
    out = []
    for d in docs:
        sd = (d.get("startDate") or "")[:10]
        ed = (d.get("endDate") or sd)[:10]
        if not sd:
            continue
        cats_raw = d.get("categories") or []
        if isinstance(cats_raw, list):
            labels = [c.get("catName") or c.get("name") or str(c) for c in cats_raw if c]
        else:
            labels = []
        out.append({
            "id": str(d.get("recid") or d.get("url") or sd),
            "title": d.get("title") or "",
            "start_date": sd,
            "end_date": ed,
            "location": d.get("location") or "",
            "city": d.get("city") or "",
            "categories": labels,
            "description": (d.get("description") or "").strip(),
            "url": d.get("weburl") or d.get("url") or BASE + "/events/",
            "source": "Visit Orlando",
        })
    return out


def parse_event_html(html: str, url: str) -> dict | None:
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.S | re.I,
    ):
        try:
            d = json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            continue
        graph = d.get("@graph", [d]) if isinstance(d, dict) else d if isinstance(d, list) else []
        for item in graph:
            if not isinstance(item, dict):
                continue
            t = item.get("@type", "")
            types = t if isinstance(t, list) else [t]
            if not any(isinstance(x, str) and "Event" in x for x in types):
                continue
            sd = item.get("startDate")
            ed = item.get("endDate") or sd
            if not sd:
                continue
            try:
                start = date.fromisoformat(sd[:10])
                end = date.fromisoformat(ed[:10])
            except ValueError:
                continue
            loc = item.get("location") or {}
            addr = loc.get("address") or {}
            cats = []
            if item.get("keywords"):
                cats = [c.strip() for c in str(item["keywords"]).split(",") if c.strip()]
            return {
                "id": url.rstrip("/").split("/")[-1],
                "title": item.get("name") or "",
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "location": loc.get("name") or "",
                "city": addr.get("addressLocality") or "",
                "categories": cats,
                "description": (item.get("description") or "").strip(),
                "url": item.get("url") or url,
                "source": "Visit Orlando",
            }
    return None


def scrape_sitemap(start: date, end: date) -> list[dict]:
    code, xml = curl(f"{BASE}/sitemap.xml")
    if code != "200":
        raise RuntimeError(f"sitemap fetch failed ({code})")
    locs = re.findall(r"<loc>([^<]+)</loc>", xml)
    urls = [u for u in locs if "/event/" in u and "/events/" not in u]
    print(f"  sitemap events: {len(urls)}", file=sys.stderr)

    def one(url: str):
        out = Path("/tmp") / ("vo_" + re.sub(r"[^a-zA-Z0-9]+", "_", url)[-60:] + ".html")
        code, body = curl(url, out)
        out.unlink(missing_ok=True)
        if code != "200":
            return None
        return parse_event_html(body, url)

    matched = []
    errors = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(one, u) for u in urls]
        for i, fut in enumerate(as_completed(futs), 1):
            ev = fut.result()
            if ev is None:
                errors += 1
            else:
                s = date.fromisoformat(ev["start_date"])
                e = date.fromisoformat(ev["end_date"])
                if s <= end and e >= start:
                    matched.append(ev)
            if i % 150 == 0:
                print(f"  progress {i}/{len(urls)} matched={len(matched)} miss/err~{errors}", file=sys.stderr)
    return matched


def slim(events: list[dict]) -> list[dict]:
    out = []
    seen = set()
    for e in sorted(events, key=lambda x: (x["start_date"], x["title"])):
        if e["id"] in seen:
            continue
        seen.add(e["id"])
        desc = (e.get("description") or "").strip()
        if len(desc) > 180:
            desc = desc[:177].rsplit(" ", 1)[0] + "…"
        cats = [c for c in (e.get("categories") or []) if c not in ("One Time Event", "Ongoing Event")]
        out.append({**e, "description": desc, "categories": cats})
    return out


def write(events: list[dict], start: date, end: date, method: str) -> None:
    cal = (
        f"{BASE}/events/?bounds=false&view=grid&sort=date"
        f"&filter_daterange%5Bstart%5D={start.isoformat()}"
        f"&filter_daterange%5Bend%5D={end.isoformat()}"
    )
    payload = {
        "_note": (
            "Public Visit Orlando events. Refresh with scripts/fetch_visitorlando_events.py. "
            f"Method this run: {method}."
        ),
        "source": f"{BASE}/events/",
        "attribution": "Visit Orlando",
        "calendar_url": cal,
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "fetched_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "event_count": len(events),
        "events": events,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    OUT_JS.write_text(
        "/* Generated — do not edit by hand. */\nwindow.VO_EVENTS_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    print(f"Wrote {len(events)} events → {OUT_JSON.relative_to(ROOT)}")


def main() -> int:
    today = date.today()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--start", default=today.isoformat())
    ap.add_argument("--end", default=(today + timedelta(days=31)).isoformat())
    args = ap.parse_args()
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    print(f"Window {start} → {end}", file=sys.stderr)
    warm_session()
    events = try_rest(start, end)
    method = "rest_v2"
    if not events:
        print("Falling back to sitemap + event JSON-LD scrape…", file=sys.stderr)
        events = scrape_sitemap(start, end)
        method = "sitemap_jsonld"
    events = slim(events or [])
    if not events:
        print("No events collected — aborting without overwrite.", file=sys.stderr)
        return 1
    write(events, start, end, method)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
