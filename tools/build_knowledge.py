#!/usr/bin/env python3
"""Build the site knowledge index for the assistant (offline guide + AI grounding).

Reads the site's own content only:
  - visible text of index.html, events/index.html, visit/index.html, profile/index.html (by <section id>)
  - data/comps.json (hotels, brand matrix, methodology, demand context, news)
  - data/brands.json (Orlando-area hotel brands, verified, with an as-of date)
  - assets/js/plan.js (NOAA monthly normals and crowd levels)
Writes (deterministic: same inputs -> byte-identical outputs, no timestamps):
  - data/knowledge.json            the index (docs + small lookups)
  - data/knowledge.js              window.AMBAR_KNOWLEDGE mirror, so file:// works
  - assistant-proxy/knowledge.json server-side copy: the proxy grounds its prompt in this, never in client text
  - data/brands.js                 window.AMBAR_BRANDS mirror of data/brands.json
  - assistant-proxy/lib/knowledge-search.js  copy of assets/js/knowledge.js (the proxy deploys from assistant-proxy/ only)
Usage:  python3 tools/build_knowledge.py          # write
        python3 tools/build_knowledge.py --check  # exit 1 if any output is stale (CI)
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = [("index.html", "index.html", "Market landscape"), ("events/index.html", "events/", "Orlando events"),
         ("visit/index.html", "visit/", "Plan your visit"), ("profile/index.html", "profile/", "My Profile")]
DATA = ["data/comps.json", "data/brands.json", "assets/js/plan.js"]
OUT_JSON, OUT_JS, OUT_PROXY, OUT_BRANDS_JS = "data/knowledge.json", "data/knowledge.js", "assistant-proxy/knowledge.json", "data/brands.js"
SEARCH_SRC, OUT_PROXY_SEARCH = "assets/js/knowledge.js", "assistant-proxy/lib/knowledge-search.js"
CHUNK = 900
SKIP = {"script", "style", "svg", "noscript", "template", "dialog"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def ws(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


class SectionText(HTMLParser):
    """Collects visible text per outermost <section|footer id=...>, skipping scripts, SVG and screen-reader-only spans."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool]] = []   # (tag, starts-a-skip)
        self.skip = 0
        self.cur = None
        self.depth = 0
        self.sections: list[dict] = []
        self.heading = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in VOID:
            return
        cls = a.get("class") or ""
        starts_skip = tag in SKIP or "sr-only" in cls.split() or a.get("hidden") is not None and tag in {"div", "p", "section"} and self.cur is None
        self.stack.append((tag, starts_skip))
        if starts_skip:
            self.skip += 1
        if self.cur is None and tag in {"section", "footer"} and a.get("id") and not self.skip:
            self.cur = {"id": a["id"], "title": "", "text": []}
            self.depth = len(self.stack)
        if self.cur is not None and tag in {"h1", "h2"} and not self.cur["title"]:
            self.heading = []
        if self.cur is not None and tag in {"p", "li", "h1", "h2", "h3", "h4", "div", "dt", "dd", "address", "legend", "tr"}:
            self.cur["text"].append(" \n")

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        while self.stack:
            t, sk = self.stack.pop()
            if sk:
                self.skip -= 1
            if self.cur is not None and t in {"h1", "h2"} and self.heading is not None:
                self.cur["title"] = ws("".join(self.heading))
                self.heading = None
            if self.cur is not None and len(self.stack) < self.depth:
                self.sections.append(self.cur)
                self.cur = None
            if t == tag:
                break

    def handle_data(self, data):
        if self.cur is None or self.skip:
            return
        self.cur["text"].append(data)
        if self.heading is not None:
            self.heading.append(data)


def chunks(text: str, n: int = CHUNK) -> list[str]:
    text = ws(text)
    if len(text) <= n:
        return [text] if text else []
    out, cur = [], ""
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if cur and len(cur) + 1 + len(sent) > n:
            out.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    if cur:
        out.append(cur)
    return out


def doc(id_, title, url, text, *, kind, source="", as_of="", tags=None):
    d = {"id": id_, "kind": kind, "title": ws(title), "url": url, "text": ws(text)}
    if source:
        d["source"] = source
    if as_of:
        d["as_of"] = as_of
    if tags:
        d["tags"] = tags
    return d


def page_docs() -> list[dict]:
    docs = []
    for rel, url, page in PAGES:
        p = SectionText()
        p.feed((ROOT / rel).read_text(encoding="utf-8"))
        for s in p.sections:
            text = ws(" ".join(s["text"]))
            if len(text) < 40:
                continue
            title = s["title"] or s["id"].replace("-", " ").title()
            parts = chunks(text)
            for i, part in enumerate(parts):
                docs.append(doc(f"page:{url.rstrip('/') or 'index'}:{s['id']}{'' if i == 0 else ':' + str(i + 1)}".replace("index.html", "home"),
                                f"{title} · {page}" + ("" if len(parts) == 1 else f" ({i + 1}/{len(parts)})"),
                                f"{url}#{s['id']}" if s["id"] not in {"top"} else url, part, kind="page"))
    return docs


def money(v):
    return f"${round(v):,}"


def fmd(iso):
    y, m, d = iso.split("-")
    return f"{MONTHS[int(m) - 1]} {int(d)}, {y}"


def comps_docs(db: dict) -> list[dict]:
    docs = []
    meta = db["meta"]
    weeks = db["weeks"]
    collected = [w for w in weeks if w.get("status") == "collected"]
    latest = collected[-1]["week"] if collected else None
    for h in db["hotels"]:
        bits = [f"{h['name']} ({h['short']}) is a {h['brand']} hotel, {h['tier']} tier, parent {h.get('parent') or 'Marriott International'}"
                + ("; a non-Marriott hotel in the landscape." if h.get("non_marriott") else "; part of the Marriott set in the landscape."),
                f"Area: {h['area']}. Address: {h['address']}.",
                f"About {h['distance_to_epcot_mi']} miles straight-line to EPCOT" + (", on Walt Disney World property." if h.get("on_disney_property") else "."),
                h.get("blurb") or ""]
        if h.get("keys"):
            bits.append(f"{h['keys']:,} keys.")
        if latest:
            rs = [r for r in db["rates"] if r["hotel"] == h["id"] and r["week"] == latest and r.get("status") == "OK" and (r.get("rate") or 0) > 0]
            if rs:
                lo, hi = min(r["rate"] for r in rs), max(r["rate"] for r in rs)
                src = sorted({r.get("source", "") for r in rs if r.get("source")})
                bits.append(f"Lowest public nightly rates observed for the week of {fmd(latest)}: {money(lo)} to {money(hi)} across {len(rs)} of 7 nights"
                            f" (source: {', '.join(src) or 'see Sources'}). These are lowest public rates, not ADR; taxes and resort fees are generally excluded.")
            else:
                bits.append(f"No public rates were collected for the week of {fmd(latest)}.")
        docs.append(doc(f"hotel:{h['id']}", f"{h['name']}", f"index.html#hotel-{h['id']}", " ".join(bits), kind="hotel",
                        source=h.get("address_source", ""), as_of=meta.get("last_updated", ""), tags=[h["id"], h["brand"], h["short"]] + list(h.get("aliases") or [])))
    for t in db["tiers"]:
        bs = [b for b in db["brands"] if b["tier"] == t["name"]]
        names = [("AMBAR Residences Orlando (Apartments by Marriott Bonvoy)" if b.get("featured") else b["name"]) for b in bs]
        tracked = [f"{b['name']}: " + ", ".join(next(h["short"] for h in db["hotels"] if h["id"] == c) for c in b["comps"]) for b in bs if b["comps"]]
        docs.append(doc(f"matrix:{t['name'].lower()}", f"Marriott brand matrix · {t['name']} tier", "index.html#brands",
                        f"Marriott {t['name']} tier ({t['line']}): {', '.join(names)}." + (f" Hotels tracked on this site: {'; '.join(tracked)}." if tracked else ""),
                        kind="matrix", source="Marriott brand portfolio, as organised on this site"))
    feat = next((b for b in db["brands"] if b.get("featured")), None)
    if feat:
        docs.append(doc("ambar", "What is AMBAR Residences Orlando?", "index.html#brands", feat["description"], kind="ambar",
                        source="orlandoambar.com and this site", tags=["ambar", "apartments by marriott bonvoy"]))
    docs.append(doc("method:rates", "How hotel rates are gathered (methodology)", "index.html#sources",
                    f"{meta['rate_definition']} Currency {meta.get('currency', 'USD')}. {meta['distance_method']} " + " ".join(meta.get("caveats", [])),
                    kind="method", as_of=meta.get("last_updated", "")))
    for wk, items in sorted((db.get("context") or {}).items()):
        lines = [f"{i.get('dates', '')}: {i.get('title', '')} ({i.get('type', '')}). {i.get('detail', '')}" + (f" Source: {i['source']}." if i.get("source") else "") for i in items]
        for n, part in enumerate(chunks(" ".join(lines), 1200)):
            docs.append(doc(f"demand:{wk}{'' if n == 0 else ':' + str(n + 1)}", f"Demand context · week of {fmd(wk)}", "index.html#demand", part, kind="demand", as_of=wk))
    la = db.get("looking_ahead") or []
    if la:
        docs.append(doc("demand:looking-ahead", "Demand context · looking ahead", "index.html#demand",
                        " ".join(f"{i.get('dates', '')}: {i.get('title', '')}. {i.get('detail', '')}" + (f" Source: {i['source']}." if i.get("source") else "") for i in la), kind="demand"))
    mk = db.get("market") or []
    if mk:
        docs.append(doc("demand:market", "Metro Orlando market indicators", "index.html#demand",
                        " ".join(f"{m.get('period', '')}: {m.get('metric', '')} {m.get('value', '')} ({m.get('change', '')}). Source: {m.get('source', '')}." for m in mk), kind="demand"))
    for i, n in enumerate(db.get("news") or []):
        docs.append(doc(f"news:{i + 1}", ws(n["headline"])[:110], n.get("url") or "index.html#news",
                        f"{n.get('date', '')}: {n['headline']} Source: {n.get('source', '')}.", kind="news", source=n.get("source", ""), as_of=n.get("week", "")))
    return docs


def brand_docs(b: dict) -> list[dict]:
    docs = []
    as_of = b["as_of"]
    summary = []
    for p in b["parents"]:
        names = [x["name"] for x in p["brands"]]
        summary.append(f"{p['name']}: {', '.join(names)}.")
        lines = [f"{x['name']}" + (f" ({x['tag']})" if x.get("tag") else "") + f", e.g. {x['example']}" for x in p["brands"]]
        docs.append(doc(f"brands:{p['id']}", f"{p['name']} brands with hotels in the Orlando area", "index.html#familiar",
                        f"{p['blurb']} Verified as of {fmd(as_of)}: " + "; ".join(lines) + "." + (f" {p['note']}" if p.get("note") else ""),
                        kind="brands", source=p.get("link") or p["brands"][0]["source_url"], as_of=as_of, tags=[p["id"]] + [x["id"] for x in p["brands"]]))
    docs.append(doc("brands:all", "Hotel brands in the Orlando area, by company", "index.html#familiar",
                    f"{b['area']} " + " ".join(summary) + f" Verified as of {fmd(as_of)}.", kind="brands", as_of=as_of))
    if b.get("not_included"):
        docs.append(doc("brands:not-included", "Hotel brands not listed for Orlando, and why", "index.html#familiar",
                        " ".join(f"{n['name']} ({n['parent']}): {n['reason']}" for n in b["not_included"]), kind="brands", as_of=as_of))
    return docs


def climate_doc() -> list[dict]:
    js = (ROOT / "assets/js/plan.js").read_text(encoding="utf-8")
    normals = re.findall(r"\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]", re.search(r"NORMALS_F\s*=\s*\[(.*?)\];", js, re.S).group(1))
    crowd = [int(v) for v in re.search(r"CROWD_1_5\s*=\s*\[([^\]]*)\]", js).group(1).split(",")]
    lvl = lambda c: "low" if c <= 2 else "moderate" if c == 3 else "high"
    parts = [f"{MONTHS[i]} high {int(float(hi) + 0.5)}°F / low {int(float(lo) + 0.5)}°F, crowds {lvl(crowd[i])}" for i, (hi, lo) in enumerate(normals)]
    return [doc("climate:months", "Best time to visit Orlando: temperatures and crowds by month", "visit/#best-time",
                "Monthly normal daily high and low at Orlando International Airport (NOAA NCEI 1991–2020 normals) and typical theme-park crowd levels "
                "(Theme Park Direct crowd calendar): " + "; ".join(parts) + ".",
                kind="climate", source="NOAA NCEI U.S. Climate Normals; Theme Park Direct")]


def build() -> dict:
    comps = json.loads((ROOT / "data/comps.json").read_text(encoding="utf-8"))
    brands = json.loads((ROOT / "data/brands.json").read_text(encoding="utf-8"))
    docs = page_docs() + comps_docs(comps) + brand_docs(brands) + climate_doc()
    ids = [d["id"] for d in docs]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise SystemExit(f"duplicate knowledge ids: {sorted(dup)}")
    inputs = {rel: hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:16] for rel, _, _ in PAGES}
    inputs.update({rel: hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:16] for rel in DATA})
    return {
        "version": 1,
        "about": "Generated by tools/build_knowledge.py from this site's own pages and data. Do not edit by hand.",
        "inputs": inputs,
        "lookups": {
            "hotels": {h["id"]: h["name"] for h in comps["hotels"]},
            "brands": {x["id"]: {"name": x["name"], "parent": p["name"]} for p in brands["parents"] for x in p["brands"]},
            "brands_as_of": brands["as_of"],
        },
        "docs": docs,
    }


def render(k: dict) -> dict[str, str]:
    body = json.dumps(k, ensure_ascii=False, indent=1) + "\n"
    brands = json.loads((ROOT / "data/brands.json").read_text(encoding="utf-8"))
    return {
        OUT_JSON: body,
        OUT_PROXY: body,
        OUT_JS: "/* Generated by tools/build_knowledge.py from the site's pages and data. Do not edit. */\nwindow.AMBAR_KNOWLEDGE = "
                + json.dumps(k, ensure_ascii=False, separators=(",", ":")) + ";\n",
        OUT_PROXY_SEARCH: "/* Copied by tools/build_knowledge.py from assets/js/knowledge.js. Edit that file, then re-run the tool. */\n"
                          + (ROOT / SEARCH_SRC).read_text(encoding="utf-8"),
        OUT_BRANDS_JS: "/* Generated by tools/build_knowledge.py from data/brands.json (mirror so file:// works). Do not edit. */\nwindow.AMBAR_BRANDS = "
                       + json.dumps(brands, ensure_ascii=False, separators=(",", ":")) + ";\n",
    }


def main(argv: list[str]) -> int:
    outs = render(build())
    if "--check" in argv:
        stale = [rel for rel, text in outs.items() if not (ROOT / rel).exists() or (ROOT / rel).read_text(encoding="utf-8") != text]
        if stale:
            print("Knowledge index is stale. Run: python3 tools/build_knowledge.py\n  " + "\n  ".join(stale))
            return 1
        print(f"Knowledge index up to date ({len(json.loads(outs[OUT_JSON])['docs'])} docs).")
        return 0
    for rel, text in outs.items():
        (ROOT / rel).parent.mkdir(parents=True, exist_ok=True)
        (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"Wrote {', '.join(outs)} ({len(json.loads(outs[OUT_JSON])['docs'])} docs).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
