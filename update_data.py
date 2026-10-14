#!/usr/bin/env python3
"""
update_data.py — parse weekly Marriott Orlando brief .md files into data/comps.json
(and mirror it to data/comps.js so the site also opens from file:// with no server).

Usage:
    python3 update_data.py                    # parse ../briefs/*.md (default)
    python3 update_data.py path/to/briefs     # parse a different folder
    python3 update_data.py brief1.md brief2.md

What it does
  * Reads every file named  marriott-orlando-brief-week-of-YYYY-MM-DD.md
  * From section 1's table it takes the 7 nightly lowest public rates per hotel
    ($123 -> OK, UNAV -> UNAVAILABLE, no sequence -> NOT_COLLECTED)
  * From section 3 it takes the Marriott news bullets
  * From section 4 it takes the "Rate sources" sentence
  * It REPLACES the rows for each week it parses (re-running is safe) and keeps
    every curated section already in comps.json (hotels, brands, context, market).
  * Any Monday between the first and last collected week with no brief is
    recorded as a gap (status "missing"), so the site can show it honestly.

Nothing is estimated or interpolated: a number only enters the JSON if it is
printed in a brief. Benchmark / projection language in the briefs is ignored.
"""
import json, re, sys, datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "comps.json"
JS = HERE / "data" / "comps.js"
NAME_RE = re.compile(r"marriott-orlando-brief-week-of-(\d{4}-\d{2}-\d{2})\.md$")
TOKEN = r"(?:\$[\d,]+\*?|UNAV(?:AILABLE)?)"
SEQ_RE = re.compile(TOKEN + r"(?:\s*/\s*" + TOKEN + r"){6}")
# words that belong to the internal benchmark discussion and must never be shown
BANNED = re.compile(r"anchor|\$350|80%|vs \$|ADR signal|Occ:|projection", re.I)


def clean_sentences(text):
    """Keep only sentences that carry no benchmark/projection language."""
    text = re.sub(r"\(avg[^)]*\)", "", text)  # site computes its own means
    parts = re.split(r"(?<=[.;])\s+", text.strip())
    keep = [p.strip() for p in parts if p.strip(" .;:") and not BANNED.search(p)]
    out = " ".join(keep).strip(" .;:")
    return out + "." if out else ""


def parse_brief(path, hotels):
    md = path.read_text(encoding="utf-8")
    week = NAME_RE.search(path.name).group(1)
    start = dt.date.fromisoformat(week)
    gen = re.search(r"\*\*Generated:\*\*\s*\w+\s+(\d+\s+\w+\s+\d{4})", md)
    generated = (dt.datetime.strptime(gen.group(1), "%d %b %Y").date().isoformat()
                 if gen else week)
    covered = re.search(r"\*\*Week covered:\*\*\s*(.+?)\s*$", md, re.M)

    alias = {}
    for h in hotels:
        for a in [h["name"], h["short"]] + h.get("aliases", []):
            alias[a.lower()] = h

    rates, hotel_notes = [], []
    for line in md.splitlines():
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[0].lower() == "property":
            continue
        h = alias.get(cells[0].lower())
        if not h:
            print(f"  ! {path.name}: unknown property '{cells[0]}' (add it to hotels[].aliases)")
            continue
        cell, demand = cells[1], cells[2]
        source = "Google Hotels (google.com/travel)" if "google hotels" in cell.lower() else "trivago.com U.S."
        m = SEQ_RE.search(cell)
        if m:
            tokens = [t.strip() for t in m.group(0).split("/")]
            remainder = (cell[:m.start()] + " " + cell[m.end():]).strip()
            remainder = re.sub(r"^[\w\s./–-]*?lowest(?: OTA)?:\s*", "", remainder)
            remainder = re.sub(r"^\d+/\d+\s*[–-]\s*(?:\d+/)?\d+(?: lowest(?: OTA)?)?:?\s*", "", remainder)
            star_note = ""
            sm = re.search(r"\*([^*]+?)(?:\.\s|$)", cell[m.end():])
            if sm:
                star_note = sm.group(1).strip().rstrip(".")
            for i, t in enumerate(tokens):
                d = (start + dt.timedelta(days=i)).isoformat()
                rec = dict(hotel=h["id"], brand=h["brand"], tier=h["tier"], week=week, date=d,
                           rate=None, status="UNAVAILABLE", source=source, source_date=generated, note="")
                if t.startswith("$"):
                    rec["rate"] = int(t.strip("$*").replace(",", ""))
                    rec["status"] = "OK"
                    if t.endswith("*") and star_note:
                        rec["note"] = star_note
                else:
                    rec["note"] = "No offer returned for a one-night search (scarcity signal, not a confirmed sell-out)."
                rates.append(rec)
            rate_note = clean_sentences(re.sub(r"\*[^*]+?(?:\.\s|$)", "", remainder))
        else:
            for i in range(7):
                d = (start + dt.timedelta(days=i)).isoformat()
                rates.append(dict(hotel=h["id"], brand=h["brand"], tier=h["tier"], week=week, date=d,
                                  rate=None, status="NOT_COLLECTED", source=source, source_date=generated,
                                  note="Rate calendar returned no prices for this week."))
            rate_note = clean_sentences(cell)
        hotel_notes.append(dict(hotel=h["id"], week=week, rate_note=rate_note,
                                demand_note=clean_sentences(demand)))

    news = []
    sec3 = re.search(r"## 3\..*?\n(.*?)(?=\n## )", md, re.S)
    if sec3:
        for b in re.findall(r"^- \*\*(.+?)\*\*\s*[—-]\s*(.+)$", sec3.group(1), re.M):
            date_txt, rest = b
            src = re.search(r"[—-]\s*\*([^*]+)\*\s*$", rest)
            headline = rest[:src.start()].strip(" —-") if src else rest.strip()
            news.append(dict(week=week, date=date_txt.strip(), headline=headline,
                             source=src.group(1).strip() if src else "",
                             orlando="orlando" in (date_txt + headline).lower()))

    rs = re.search(r"Rate sources:\s*(.+?)(?:\n|$)", md)
    week_meta = dict(week=week, week_end=(start + dt.timedelta(days=6)).isoformat(),
                     status="collected", label=covered.group(1) if covered else week,
                     generated=generated, brief_file=path.name,
                     rate_sources=rs.group(1).strip() if rs else "")
    return week_meta, rates, hotel_notes, news


def main(args):
    db = json.loads(DATA.read_text(encoding="utf-8"))
    files = []
    targets = [Path(a) for a in args] or [HERE.parent / "briefs"]
    for t in targets:
        files += sorted(t.glob("*.md")) if t.is_dir() else [t]
    files = [f for f in files if NAME_RE.search(f.name)]
    if not files:
        sys.exit("No marriott-orlando-brief-week-of-YYYY-MM-DD.md files found.")

    weeks = {w["week"]: w for w in db.get("weeks", []) if w["status"] == "collected"}
    for f in files:
        wm, rates, notes, news = parse_brief(f, db["hotels"])
        wk = wm["week"]
        weeks[wk] = wm
        db["rates"] = [r for r in db.get("rates", []) if r["week"] != wk] + rates
        db["hotel_notes"] = [n for n in db.get("hotel_notes", []) if n["week"] != wk] + notes
        db["news"] = [n for n in db.get("news", []) if n["week"] != wk] + news
        ok = sum(r["status"] == "OK" for r in rates)
        print(f"  parsed {f.name}: {ok} priced nights, {len(rates) - ok} without a price, {len(news)} news items")

    # rebuild the week list, inserting honest gaps
    old = {w["week"]: w for w in db.get("weeks", [])}
    mondays = sorted(weeks)
    d, last, out = dt.date.fromisoformat(mondays[0]), dt.date.fromisoformat(mondays[-1]), []
    while d <= last:
        k = d.isoformat()
        out.append(weeks.get(k) or dict(week=k, week_end=(d + dt.timedelta(days=6)).isoformat(),
                                         status="missing", label=old.get(k, {}).get("label", ""),
                                         note=old.get(k, {}).get("note", "No brief was produced for this week; no rates were collected.")))
        d += dt.timedelta(days=7)
    db["weeks"] = out
    db["rates"].sort(key=lambda r: (r["date"], r["hotel"]))
    db["meta"]["last_updated"] = max(w.get("generated", "") for w in out)
    db["meta"]["built"] = dt.datetime.now().isoformat(timespec="minutes")

    DATA.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    JS.write_text("/* Generated by update_data.py from comps.json — do not edit by hand. */\n"
                  "window.COMPS_DATA = " + json.dumps(db, ensure_ascii=False) + ";\n", encoding="utf-8")
    gaps = [w["week"] for w in out if w["status"] == "missing"]
    print(f"Wrote {DATA.relative_to(HERE)} and {JS.relative_to(HERE)}: {len(out)} weeks"
          + (f", gaps: {', '.join(gaps)}" if gaps else ""))


if __name__ == "__main__":
    main(sys.argv[1:])
