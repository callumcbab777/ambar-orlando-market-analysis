"""Writes responsive <picture> markup for the AMBAR renderings into the pages.

Blocks live between markers, so the script can be re-run safely:
  <!-- CINE:START --> ... <!-- CINE:END -->            home hero slideshow
  <!-- BAND:<id> --> ... <!-- /BAND:<id> -->          full-bleed image bands
Images: assets/img/r/<slug>-<width>.{avif,webp,jpg}, made from AMBAR's own marketing
renderings (Renderings: AMBAR Residences Orlando). Usage: python3 tools/build_imagery.py [--check]
"""
import re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img" / "r"
CREDIT = "Renderings: AMBAR Residences Orlando"

SLIDES = [
    ("pool-sunset", "Aerial rendering of the Ambar resort pool and palms at sunset"),
    ("aerial", "Aerial rendering of Ambar Residences Orlando, its towers, lake and pool among the trees"),
    ("event-lawn", "Rendering of the Ambar event lawn at dusk, with fire pit and lounge seating"),
    ("beach-entry", "Rendering of the beach-entry pool in front of an Ambar residence tower"),
]

# id: (page, slug, alt, kicker, title)
BANDS = {
    "home-residences": ("index.html", "a1-living", "Rendering of a furnished one-bedroom living room at Ambar", "Inside the residences", "Inside a one-bedroom residence"),
    "home-pool": ("index.html", "pool-people", "Aerial rendering of the Ambar pool deck with guests", "The setting", "Resort-style pool and gardens"),
    "home-cafe": ("index.html", "cafe-outdoor", "Rendering of Ambar's outdoor cafe terrace", "Everyday life", "A cafe terrace on site"),
    "visit-entry": ("visit/index.html", "main-entry", "Rendering of the main entry at Ambar Residences Orlando", "Arriving", "The main entry"),
    "events-lawn": ("events/index.html", "food-truck", "Rendering of a food truck evening on the Ambar lawn", "On site", "Evenings on the lawn"),
    "profile-lobby": ("profile/index.html", "lobby", "Rendering of the Ambar lobby and reception", "Welcome", "The lobby"),
    "moments-hero": ("moments/index.html", "beach-entry", "Rendering of the beach-entry pool in front of an Ambar residence tower", "My Orlando", "Moments"),
}


# arch-framed hero renderings: id: (page, slug, alt)
ARCHES = {
    "events": ("events/index.html", "event-lawn", "Rendering of the Ambar event lawn at dusk"),
    "profile": ("profile/index.html", "a1-bedroom", "Rendering of a one-bedroom residence bedroom at Ambar"),
}


def widths(slug):
    return sorted(int(p.stem.rsplit("-", 1)[1]) for p in IMG.glob(f"{slug}-*.jpg"))


def picture(slug, alt, prefix, sizes="100vw", eager=False, defer=False, cls=""):
    ws = widths(slug)
    if not ws:
        raise SystemExit(f"missing images for {slug}")
    mid = min(ws, key=lambda w: abs(w - 1600))
    with Image.open(IMG / f"{slug}-{mid}.jpg") as im:
        w, h = im.size
    base = f"{prefix}assets/img/r/{slug}"
    ss = lambda ext: ", ".join(f"{base}-{x}.{ext} {x}w" for x in ws)
    a = "data-srcset" if defer else "srcset"
    load = 'fetchpriority="high" decoding="async"' if eager else ('decoding="async"' if defer else 'loading="lazy" decoding="async"')
    src = f'data-src="{base}-{mid}.jpg"' if defer else f'src="{base}-{mid}.jpg"'
    return (f'<picture{(" class=" + chr(34) + cls + chr(34)) if cls else ""}>'
            f'<source type="image/avif" {a}="{ss("avif")}" sizes="{sizes}">'
            f'<source type="image/webp" {a}="{ss("webp")}" sizes="{sizes}">'
            f'<img {src} {a}="{ss("jpg")}" sizes="{sizes}" alt="{alt}" width="{w}" height="{h}" {load}></picture>')


def cine(prefix):
    out = ['<div class="cine" id="cine" aria-roledescription="carousel" aria-label="Ambar Residences Orlando renderings">']
    for i, (slug, alt) in enumerate(SLIDES):
        out.append(f'<div class="cine-slide{" is-on" if i == 0 else ""}" role="group" aria-roledescription="slide" aria-label="{i + 1} of {len(SLIDES)}"{"" if i == 0 else " aria-hidden=" + chr(34) + "true" + chr(34)}>'
                   + picture(slug, alt, prefix, eager=(i == 0), defer=(i > 0)) + "</div>")
    out.append("</div>")
    out.append(f'<div class="cine-ui"><div class="cine-dots" aria-hidden="true">' + "".join(f'<span class="{"is-on" if i == 0 else ""}"></span>' for i in range(len(SLIDES)))
               + f'</div><button type="button" class="cine-pause" id="cinePause" aria-pressed="false" aria-label="Pause the slideshow">Pause</button><p class="cine-credit">{CREDIT}</p></div>')
    return "\n".join(out)


def band(slug, alt, kicker, title, prefix, bid):
    return (f'<figure class="img-band" id="band-{bid}" data-band>'
            + picture(slug, alt, prefix)
            + f'<figcaption class="wrap"><span class="ib-plate"><span class="ib-k">{kicker}</span><span class="ib-t">{title}</span><span class="ib-c">{CREDIT}</span></span></figcaption></figure>')


def apply(html, start, end, block):
    if start not in html:
        return html, False
    i, j = html.index(start) + len(start), html.index(end)
    return html[:i] + "\n" + block + "\n" + html[j:], True


def main(check=False):
    changed = []
    pages = {"index.html", "visit/index.html", "events/index.html", "profile/index.html", "moments/index.html"}
    for page in sorted(pages):
        f = ROOT / page
        html = orig = f.read_text()
        prefix = "../" if "/" in page else ""
        html, _ = apply(html, "<!-- CINE:START -->", "<!-- CINE:END -->", cine(prefix))
        for bid, (pg, slug, alt, k, t) in BANDS.items():
            if pg == page:
                html, ok = apply(html, f"<!-- BAND:{bid} -->", f"<!-- /BAND:{bid} -->", band(slug, alt, k, t, prefix, bid))
                if not ok:
                    raise SystemExit(f"marker BAND:{bid} missing in {page}")
        for aid, (pg, slug, alt) in ARCHES.items():
            if pg == page:
                html, ok = apply(html, f"<!-- ARCH:{aid} -->", f"<!-- /ARCH:{aid} -->",
                                 '<div class="arch">' + picture(slug, alt, prefix, sizes="(max-width: 820px) 80vw, 440px", eager=True) + "</div>")
                if not ok:
                    raise SystemExit(f"marker ARCH:{aid} missing in {page}")
        if html != orig:
            changed.append(page)
            if not check:
                f.write_text(html)
    if check and changed:
        print("Imagery markup out of date in:", ", ".join(changed)); sys.exit(1)
    print("imagery", "checked" if check else "written", changed or "no changes")


if __name__ == "__main__":
    main("--check" in sys.argv)
