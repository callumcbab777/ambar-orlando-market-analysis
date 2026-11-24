#!/usr/bin/env python3
"""Refreshes the News hub feed (data/news_feed.json + data/news_feed.js) from public RSS.

Sources: Google News RSS search feeds (news.google.com/rss/search), one query per category, last 14 days, US English.
Each story keeps the publisher's own headline, the publisher name and the link Google News gives; nothing is
rewritten or summarised, so every card is traceable to its source. Stories older than MAX_AGE_DAYS, duplicates
(same normalised headline) and off-topic crime/accident items are dropped.

Run:   python3 scripts/update_news.py            (writes the files if anything changed)
       python3 scripts/update_news.py --check    (exit 1 if the feed is older than 3 days; used by CI)
The scheduled workflow .github/workflows/news-feed.yml runs this every 6 hours. Standard library only.
"""
import email.utils, hashlib, html, json, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "news_feed.json"
OUT_JS = ROOT / "data" / "news_feed.js"
MAX_AGE_DAYS = 21
PER_CAT = 10
UA = "Mozilla/5.0 (compatible; AMBAR-Orlando-news/1.0; +https://callumcbab777.github.io/ambar-orlando-market-analysis/)"

# id, label, Google News query. Existing site topics (Marriott, Wider Orlando, Hospitality) plus the new ones.
CATEGORIES = [
    ("theme-parks", "Theme Parks", '"Walt Disney World" OR "Universal Orlando" OR "Epic Universe" OR "SeaWorld Orlando" OR "Disney Springs"'),
    ("mco", "MCO / Airport", '"Orlando International Airport" OR "MCO airport" OR "Orlando airport" OR "Brightline Orlando"'),
    ("dining", "New Restaurants / Bars / Coffee", 'Orlando (restaurant OR bar OR "coffee shop" OR cafe OR brewery) (opening OR opens OR "now open" OR "coming soon" OR "new location")'),
    ("lake-nona", "Lake Nona", '"Lake Nona"'),
    ("hospitality", "Hospitality & Hotels", 'Orlando (hotel OR resort) (opening OR opens OR renovation OR occupancy OR "Visit Orlando")'),
    ("marriott", "Marriott", 'Marriott (Orlando OR Kissimmee OR "Gaylord Palms" OR "Grande Lakes" OR "Swan and Dolphin")'),
    ("events", "Conventions & Events", '"Orange County Convention Center" OR "Camping World Stadium" OR "Kia Center" Orlando'),
    ("development", "Development & Real Estate", '(Kissimmee OR Osceola OR Orlando) (development OR "real estate" OR condo OR "mixed-use") -crime'),
    ("orlando", "Wider Orlando", 'Orlando tourism OR "Visit Orlando" OR "Central Florida" tourism'),
]
# a story must match its category's MUST pattern in the headline (and not its NOT pattern) to be kept
PLACE = r"(orlando|kissimmee|osceola|lake nona|lake buena vista|celebration|winter park|college park|central florida|i-drive|international drive|disney springs|champions ?gate|four corners|sanford|mco)"
MUST = {
    "theme-parks": (r"(disney world|walt disney world|magic kingdom|epcot|hollywood studios|animal kingdom|disney springs|universal orlando|universal studios florida|epic universe|islands of adventure|volcano bay|seaworld orlando|legoland florida|theme park)", r"(disney\+|hulu|aulani|disneyland|tokyo|paris|shanghai|hong kong|cruise|stock|earnings call|box office)"),
    "mco": (r"(orlando international airport|orlando airport|\bmco\b|brightline)", r"(xp\d+|flight \d+)"),
    "dining": (r"(restaurant|bar\b|coffee|cafe|café|brewery|bakery|ramen|pizza|kitchen|eatery|dining|taproom|bistro|steakhouse|food hall)", r"(thanksgiving options|open for thanksgiving)"),
    "lake-nona": (r"lake nona", r"(football|basketball|soccer|varsity|baseball|volleyball|softball|lacrosse|lions|photos|vs\.?\b|@)"),
    "hospitality": (r"(hotel|resort|occupancy|tourism|visitors?|hospitality)", r""),
    "marriott": (r"(marriott|gaylord|ritz-carlton|jw |sheraton|westin|autograph collection|swan|dolphin|renaissance)", r"(investor relations|appoints)"),
    "events": (r"(convention|expo|\boccc\b|orange county convention center|camping world stadium|kia center|festival|concert|conference|tournament|bowl)", r""),
    "development": (r"(develop|real estate|condo|mixed-use|housing|apartments?|retail|town center|tower|demolish|construction|groundbreaking|headquarters|shopping center|community)", r"(baby|family home|celebrity)"),
    "orlando": (r"(tourism|tourist|visitors?|visit orlando|travel|attractions?|economy|jobs|airline|nonstop|service)", r""),
}
NEEDS_PLACE = {"dining", "hospitality", "events", "development", "orlando", "marriott"}
NOISE = re.compile(r"\b(picks?|predictions?|odds|betting|bet|varsity|how to watch|live & on demand|recap|prop|spread|injury report|watch .* vs|obituary|weather|lifts?|ski|tropical storm|cheerleaders?)\b", re.I)
BAD_SOURCES = re.compile(r"(maxpreps|nfhs|fubo|flyteam|tony's picks|winners & whiners|knup|the spread)", re.I)
BLOCK = re.compile(r"\b(shoot|shooting|shot|killed|kills|murder|stabb|arrest|charged|crash|dies|died|death|dead|deputies|sheriff|police|lawsuit|sues|sued|homicide|missing|drown|fire kills|overdose|sex|assault)\b", re.I)


def fetch(query):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": f"{query} when:14d", "hl": "en-US", "gl": "US", "ceid": "US:en"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def norm(t):
    return re.sub(r"[^a-z0-9 ]", "", t.lower())[:90]


def parse(xml_bytes, cat, now):
    out = []
    root = ET.fromstring(xml_bytes)
    for it in root.iter("item"):
        title = html.unescape((it.findtext("title") or "").strip())
        link = (it.findtext("link") or "").strip()
        src_el = it.find("source")
        source = html.unescape((src_el.text or "").strip()) if src_el is not None else ""
        src_url = src_el.get("url", "") if src_el is not None else ""
        pub = it.findtext("pubDate") or ""
        try:
            dt = email.utils.parsedate_to_datetime(pub).astimezone(timezone.utc)
        except Exception:
            continue
        if not title or not link.startswith("https://") or now - dt > timedelta(days=MAX_AGE_DAYS) or dt > now + timedelta(hours=6):
            continue
        # Google News appends " - Publisher" to the headline; keep the publisher separately
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)].strip()
        if BLOCK.search(title) or NOISE.search(title) or BAD_SOURCES.search(source):
            continue
        must, nope = MUST.get(cat, (r".", r""))
        t = title.lower()
        if not re.search(must, t) or (nope and re.search(nope, t)):
            continue
        if cat in NEEDS_PLACE and not re.search(PLACE, t) and not (cat == "marriott" and re.search(r"(gaylord palms|grande lakes|swan|dolphin)", t)):
            continue
        out.append({
            "id": hashlib.sha1(link.encode()).hexdigest()[:12],
            "cat": cat, "title": title[:240], "source": source[:80], "source_site": src_url[:200],
            "url": link, "published": dt.strftime("%Y-%m-%dT%H:%MZ"),
        })
    out.sort(key=lambda x: x["published"], reverse=True)
    return out


def build(now=None):
    now = now or datetime.now(timezone.utc)
    seen, items, errors = set(), [], []
    for cid, label, q in CATEGORIES:
        try:
            got = parse(fetch(q), cid, now)
        except Exception as e:  # one failing feed must not wipe the others
            errors.append(f"{cid}: {type(e).__name__}")
            got = []
        n = 0
        for s in got:
            k = norm(s["title"])
            if k in seen:
                continue
            seen.add(k)
            items.append(s)
            n += 1
            if n >= PER_CAT:
                break
        time.sleep(0.6)
    items.sort(key=lambda x: x["published"], reverse=True)
    return {
        "generated": now.strftime("%Y-%m-%dT%H:%MZ"),
        "max_age_days": MAX_AGE_DAYS,
        "source": "Google News RSS search feeds (news.google.com/rss), one query per category; headlines and links are the publishers' own.",
        "categories": [{"id": c, "label": l, "query": q} for c, l, q in CATEGORIES],
        "errors": errors,
        "items": items,
    }


def write(feed):
    old = json.loads(OUT.read_text()) if OUT.exists() else None
    if old and not feed["items"]:
        print("No stories fetched; keeping the previous feed.")
        return False
    if old and [i["id"] for i in old.get("items", [])] == [i["id"] for i in feed["items"]]:
        print("Feed unchanged.")
        return False
    txt = json.dumps(feed, ensure_ascii=False, indent=1)
    OUT.write_text(txt + "\n")
    OUT_JS.write_text("/* generated by scripts/update_news.py from data/news_feed.json; do not edit */\nwindow.AMBAR_NEWS_FEED = " + json.dumps(feed, ensure_ascii=False) + ";\n")
    print(f"Wrote {len(feed['items'])} stories ({', '.join(feed['errors']) or 'no feed errors'}).")
    return True


if __name__ == "__main__":
    if "--check" in sys.argv:
        feed = json.loads(OUT.read_text())
        age = datetime.now(timezone.utc) - datetime.strptime(feed["generated"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        print(f"Feed generated {feed['generated']} ({age.days} days ago), {len(feed['items'])} stories")
        sys.exit(1 if age > timedelta(days=3) else 0)
    write(build())
