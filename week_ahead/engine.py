"""Week-ahead estimate engine for AMBAR residences.

Per unit type, per week:
  1. ingest comp records (date, property, unit_type, bedrooms, sqft, rate, min_stay, is_booked)
  2. clean: de-duplicate, drop stale records, IQR-trim outliers
  3. segment by unit type (studio / 1br / 2br / 3br)
  4. point estimate = median (>= median_min_n comps) or trimmed mean (drop high & low)
  5. realization: listed (asking) rates x realization(type); booked rates used as-is
  6. x position_index(type)            -> type ADR
  7. x layout_index(layout)            -> layout ADR;  x step-down occupancy(plan) -> RevPAU
  8. output point, P25-P75 range, comp count, confidence label, as_of date

  ADR(t, w) = Median(comp ADR, t, w) x Realization x PositionIndex(t)
  RevPAU    = ADR x occupancy

No seasonality adjustment: a weekly feed already contains the demand pattern.
Types with fewer than gap_fill_min_n clean comps are derived from the best-supported
type via a size ratio or power curve and labelled 'Derived'.
"""
from __future__ import annotations

import csv
import math
import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from statistics import mean as _mean, median as _median
from typing import Iterable

UNIT_TYPES = ("studio", "1br", "2br", "3br")
BEDROOMS_TO_TYPE = {0: "studio", 1: "1br", 2: "2br", 3: "3br"}
FIELDS = ("date", "property", "unit_type", "bedrooms", "sqft", "rate", "min_stay", "is_booked")


# ---------------------------------------------------------------- stats helpers
def percentile(values: Iterable[float], p: float) -> float:
    """Linear-interpolation percentile (same as numpy 'linear' / Excel PERCENTILE.INC)."""
    s = sorted(values)
    if not s:
        raise ValueError("percentile of empty set")
    if len(s) == 1:
        return float(s[0])
    k = (len(s) - 1) * p / 100.0
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def median(values: Iterable[float]) -> float:
    return float(_median(list(values)))


def mean(values: Iterable[float]) -> float:
    return float(_mean(list(values)))


def trimmed_mean(values: Iterable[float]) -> float:
    """Drop the single highest and lowest value, average the rest (needs >= 3 values)."""
    s = sorted(values)
    if len(s) < 3:
        raise ValueError("trimmed mean needs at least 3 values")
    return float(_mean(s[1:-1]))


def mean_median_gap_pct(values: Iterable[float]) -> float:
    v = list(values)
    m = median(v)
    return abs(mean(v) - m) / m * 100.0


def iqr_bounds(values: Iterable[float], k: float = 1.5) -> tuple[float, float]:
    v = list(values)
    q1, q3 = percentile(v, 25), percentile(v, 75)
    iqr = q3 - q1
    return q1 - k * iqr, q3 + k * iqr


def adr_from_median(comp_median: float, realization: float, position_index: float) -> float:
    """Spec formula: ADR = Median(comp ADR) x Realization x PositionIndex."""
    return comp_median * realization * position_index


def size_units(bedrooms: int, has_den: bool, den_weight: float) -> float:
    """Studio 0, 1 Bed 1, 1 Bed + Den 1.5, 2 Bed 2, 2 Bed + Den 2.5, 3 Bed 3 (with den_weight 0.5)."""
    return bedrooms + (den_weight if has_den else 0.0)


def step_down_occupancy(occ_studio: float, d: float, units_: float) -> float:
    """Occ(plan) = Occ_Studio x (1 - d) ^ size_units."""
    return occ_studio * (1.0 - d) ** units_


def run_all_weeks(db: dict, cfg: dict, units: list[dict]) -> dict:
    """Engine output for every collected week (insufficient weeks get an 'error' entry)."""
    out = {}
    for w in sorted((w for w in db["weeks"] if w.get("status") == "collected"), key=lambda w: w["week"]):
        try:
            out[w["week"]] = run_hotel_median(db, cfg, units, w["week"])
        except ValueError as e:
            out[w["week"]] = {"week_start": w["week"], "error": str(e)}
    return out


def plan_occupancy(unit: dict, cfg: dict) -> float:
    m = cfg["occupancy_model"]
    if m.get("method") != "size_step_down":
        raise ValueError(f"unknown occupancy_model.method {m.get('method')!r}")
    return step_down_occupancy(m["occ_studio"], m["d"], size_units(unit["bedrooms"], unit.get("has_den", False), m["den_weight"]))


def revpau(adr: float, occupancy: float) -> float:
    """Revenue per available unit-night = ADR x occupancy."""
    return adr * occupancy


# ---------------------------------------------------------------- records
@dataclass(frozen=True)
class Comp:
    date: date
    property: str
    unit_type: str
    bedrooms: int
    sqft: float | None
    rate: float
    min_stay: int | None
    is_booked: bool

    @property
    def key(self):
        return (self.date, self.property.strip().lower(), self.unit_type, self.sqft, self.is_booked)


def _bool(v) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "y", "booked", "realized", "realised")


def _num(v, cast=float):
    if v is None or str(v).strip() == "":
        return None
    return cast(float(v))


def parse_comp(row: dict) -> Comp:
    missing = [f for f in ("date", "property", "rate") if not str(row.get(f, "")).strip()]
    if missing:
        raise ValueError(f"comp record missing {missing}: {row}")
    beds = _num(row.get("bedrooms"), int)
    ut = str(row.get("unit_type") or "").strip().lower() or BEDROOMS_TO_TYPE.get(beds, "")
    if ut not in UNIT_TYPES:
        raise ValueError(f"unknown unit_type {ut!r} (expected one of {UNIT_TYPES}): {row}")
    if beds is None:
        beds = {v: k for k, v in BEDROOMS_TO_TYPE.items()}[ut]
    rate = float(row["rate"])
    if rate <= 0:
        raise ValueError(f"rate must be > 0: {row}")
    return Comp(date=date.fromisoformat(str(row["date"]).strip()[:10]), property=str(row["property"]).strip(),
                unit_type=ut, bedrooms=beds, sqft=_num(row.get("sqft")), rate=rate,
                min_stay=_num(row.get("min_stay"), int), is_booked=_bool(row.get("is_booked", False)))


def load_feed(path: str | Path) -> list[Comp]:
    p = Path(path)
    if p.suffix.lower() == ".json":
        raw = json.loads(p.read_text(encoding="utf-8"))
        rows = raw["comps"] if isinstance(raw, dict) else raw
    else:
        with p.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
    return [parse_comp(r) for r in rows]


# ---------------------------------------------------------------- pipeline
def dedupe(comps: list[Comp]) -> list[Comp]:
    seen, out = {}, []
    for c in comps:  # last record wins for an identical key
        seen[c.key] = c
    out = list(seen.values())
    return out


def drop_stale(comps: list[Comp], as_of: date, stale_days: int) -> list[Comp]:
    earliest = as_of - timedelta(days=stale_days)
    return [c for c in comps if earliest <= c.date <= as_of]


@dataclass
class TypeResult:
    unit_type: str
    label: str
    method: str                 # median | trimmed_mean | derived
    confidence: str             # High | Medium | Low | Derived
    comp_count: int             # clean comps behind the number (after trim)
    raw_count: int              # after dedupe/stale, before IQR trim
    trimmed_out: int
    comp_point: float | None    # realised-equivalent comp point estimate
    comp_p25: float | None
    comp_p75: float | None
    diag_mean: float | None
    diag_median: float | None
    gap_pct: float | None
    flagged: bool
    adr: float | None = None
    adr_p25: float | None = None
    adr_p75: float | None = None
    derived_from: str | None = None
    derived_factor: float | None = None
    notes: list[str] = field(default_factory=list)


def _realised(c: Comp, realization: float) -> float:
    return c.rate if c.is_booked else c.rate * realization


def estimate_type(comps: list[Comp], unit_type: str, cfg: dict) -> TypeResult:
    pipe = cfg["pipeline"]
    tcfg = cfg["unit_types"][unit_type]
    vals = [_realised(c, tcfg["realization"]) for c in comps if c.unit_type == unit_type]
    raw_n = len(vals)
    diag_mean = diag_median = gap = None
    flagged = False
    if raw_n:
        diag_mean, diag_median = mean(vals), median(vals)
        gap = abs(diag_mean - diag_median) / diag_median * 100.0
        flagged = gap > pipe["mean_median_flag_pct"]
    clean = vals
    if pipe.get("iqr_trim", True) and raw_n >= pipe.get("iqr_min_n", 5):
        lo, hi = iqr_bounds(vals, pipe.get("iqr_k", 1.5))
        clean = [v for v in vals if lo <= v <= hi]
    n = len(clean)
    res = TypeResult(unit_type, tcfg["label"], "derived", "Derived", n, raw_n, raw_n - n, None, None, None,
                     diag_mean, diag_median, gap, flagged)
    if n < pipe["gap_fill_min_n"]:
        res.notes.append(f"Only {n} clean comps; derived from the best-supported type.")
        return res
    if n >= pipe["median_min_n"]:
        res.method, res.comp_point = "median", median(clean)
    else:
        res.method, res.comp_point = "trimmed_mean", trimmed_mean(clean)
        res.notes.append(f"{n} comps: trimmed mean (highest and lowest dropped).")
    res.comp_p25, res.comp_p75 = percentile(clean, 25), percentile(clean, 75)
    if res.method == "trimmed_mean":
        res.confidence = "Low"
    elif n >= pipe["high_confidence_min_n"] and not flagged:
        res.confidence = "High"
    else:
        res.confidence = "Medium"
    if flagged:
        res.notes.append(f"Mean and median differ by {gap:.1f}% (> {pipe['mean_median_flag_pct']}%): week flagged.")
    pi = tcfg["position_index"]
    res.adr = res.comp_point * pi          # realization already applied per record
    res.adr_p25, res.adr_p75 = res.comp_p25 * pi, res.comp_p75 * pi
    return res


def _derive_factor(target: str, anchor: str, cfg: dict, units_by_id: dict) -> float:
    gf = cfg["gap_fill"]
    if gf["method"] == "ratio":
        r = gf["ratios_to_studio"]
        return r[target] / r[anchor]
    if gf["method"] == "power":
        beta = gf.get("power_beta")
        if beta is None:
            raise ValueError("gap_fill.method='power' needs gap_fill.power_beta")
        ut = cfg["unit_types"]
        s_t = units_by_id[ut[target]["reference_layout"]]["sqft"]
        s_a = units_by_id[ut[anchor]["reference_layout"]]["sqft"]
        return (s_t / s_a) ** beta
    raise ValueError(f"unknown gap_fill.method {gf['method']!r}")


def run(comps: list[Comp], cfg: dict, units: list[dict], as_of: date, data_status: str = "sample") -> dict:
    pipe = cfg["pipeline"]
    in_n = len(comps)
    d = dedupe(comps)
    s = drop_stale(d, as_of, pipe["stale_days"])
    types = {t: estimate_type(s, t, cfg) for t in UNIT_TYPES}
    units_by_id = {u["id"]: u for u in units}
    observed = [r for r in types.values() if r.method != "derived"]
    if not observed:
        raise ValueError("no unit type has enough comps to anchor a derived estimate")
    anchor = max(observed, key=lambda r: (r.comp_count, r.unit_type == "studio"))
    for r in types.values():
        if r.method == "derived":
            f = _derive_factor(r.unit_type, anchor.unit_type, cfg, units_by_id)
            # derive from anchor's comp-level estimate, then apply this type's own position index
            pi = cfg["unit_types"][r.unit_type]["position_index"]
            base = anchor.comp_point * f
            r.comp_point, r.comp_p25, r.comp_p75 = base, anchor.comp_p25 * f, anchor.comp_p75 * f
            r.adr, r.adr_p25, r.adr_p75 = base * pi, r.comp_p25 * pi, r.comp_p75 * pi
            r.derived_from, r.derived_factor = anchor.unit_type, f
    out_units = []
    for u in units:
        lc = cfg["layouts"][u["id"]]
        tr = types[u["unit_type"]]
        li, occ = lc["layout_index"], plan_occupancy(u, cfg)
        adr = tr.adr * li
        out_units.append({
            "id": u["id"], "unit_type": u["unit_type"],
            "adr": round(adr, 2), "adr_p25": round(tr.adr_p25 * li, 2), "adr_p75": round(tr.adr_p75 * li, 2),
            "occupancy": round(occ, 6), "doc_occupancy": u["base_scenario"]["occupancy"],
            "revpau": round(revpau(adr, occ), 2),
            "revpau_p25": round(revpau(tr.adr_p25 * li, occ), 2), "revpau_p75": round(revpau(tr.adr_p75 * li, occ), 2),
            "layout_index": li,
            "comp_count": tr.comp_count, "confidence": tr.confidence, "method": tr.method,
            "derived_from": tr.derived_from,
        })
    return {
        "as_of": as_of.isoformat(),
        "week_start": (as_of - timedelta(days=as_of.weekday())).isoformat(),
        "data_status": data_status,
        "basis": "ADR and RevPAU (RevPAU = ADR x occupancy), USD per night",
        "pipeline": {"records_in": in_n, "after_dedupe": len(d), "after_stale": len(s),
                     "duplicates_removed": in_n - len(d), "stale_removed": len(d) - len(s)},
        "types": {t: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.__dict__.items()} for t, r in types.items()},
        "units": out_units,
    }


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


# ================================================================ hotel comp-median mode
# The live source is the site's own weekly comparable hotel rates (data/comps.json).
# Those are lowest public standard-room rates with unspecified room types, so the comp-set
# median is treated as a STUDIO-EQUIVALENT baseline and every AMBAR plan is scaled from it
# with the floor-plan ratios in the AMBAR Residence Cards (plan base ADR / S1 base ADR).

def _r(x: float, nd: int = 0) -> float:
    """Round half up, matching JavaScript Math.round(x * 10**nd) / 10**nd exactly (parity with week-ahead-engine.js)."""
    f = 10 ** nd
    return math.floor(x * f + 0.5) / f


CONF_ORDER = ["High", "Medium", "Low"]


def downgrade(conf: str, steps: int = 1) -> str:
    i = CONF_ORDER.index(conf) if conf in CONF_ORDER else len(CONF_ORDER) - 1
    return CONF_ORDER[min(i + steps, len(CONF_ORDER) - 1)]


def latest_collected_week(db: dict) -> dict:
    weeks = [w for w in db["weeks"] if w.get("status") == "collected"]
    if not weeks:
        raise ValueError("comps.json has no collected week")
    return max(weeks, key=lambda w: w["week"])


def hotel_comps_from_market(db: dict, week: str | None = None, min_priced_nights: int = 2):
    """One comp record per hotel: the median of that hotel's priced nights in the week.

    Returns (comps, details). details lists every hotel, including ones excluded for
    having fewer than min_priced_nights priced nights."""
    wk = next(w for w in db["weeks"] if w["week"] == week) if week else latest_collected_week(db)
    names = {h["id"]: h for h in db["hotels"]}
    nights: dict[str, list] = {}
    for r in db["rates"]:
        if r["week"] != wk["week"] or r["hotel"] not in names:
            continue
        nights.setdefault(r["hotel"], []).append(r)
    comps, details = [], []
    for hid, h in names.items():
        rs = nights.get(hid, [])
        priced = [float(r["rate"]) for r in rs if r.get("status") == "OK" and r.get("rate") and float(r["rate"]) > 0]
        d = {"hotel": hid, "name": h["name"], "brand": h.get("brand"), "non_marriott": bool(h.get("non_marriott")),
             "priced_nights": len(priced), "nights": len(rs), "weekly_median": _r(median(priced), 2) if priced else None,
             "status": "used"}
        if len(priced) < min_priced_nights:
            d["status"] = f"excluded: {len(priced)} priced night(s) < {min_priced_nights}"
        else:
            comps.append(Comp(date.fromisoformat(wk["week"]), h["name"], "studio", 0, None, median(priced), None, False))
        details.append(d)
    return wk, comps, details


def plan_ratios(units: list[dict], baseline_layout: str = "s1") -> dict:
    base = next(u for u in units if u["id"] == baseline_layout)["base_scenario"]["adr"]
    return {u["id"]: u["base_scenario"]["adr"] / base for u in units}


def run_hotel_median(db: dict, cfg: dict, units: list[dict], week: str | None = None) -> dict:
    hm = cfg["hotel_median"]
    pipe = cfg["pipeline"]
    wk, comps, details = hotel_comps_from_market(db, week, hm["min_priced_nights"])
    as_of = date.fromisoformat(wk["week"])
    d = dedupe(comps)
    s = drop_stale(d, as_of, pipe["stale_days"])
    vals = [c.rate for c in s]
    if len(vals) < pipe["gap_fill_min_n"]:
        raise ValueError(f"only {len(vals)} comparable hotels this week; need {pipe['gap_fill_min_n']}")
    diag_mean, diag_median = mean(vals), median(vals)
    gap = abs(diag_mean - diag_median) / diag_median * 100.0
    flagged = gap > pipe["mean_median_flag_pct"]
    clean = s
    if pipe.get("iqr_trim", True) and len(vals) >= pipe.get("iqr_min_n", 5):
        lo, hi = iqr_bounds(vals, pipe.get("iqr_k", 1.5))
        clean = [c for c in s if lo <= c.rate <= hi]
        trimmed_names = {c.property for c in s if c not in clean}
        for dd in details:
            if dd["name"] in trimmed_names:
                dd["status"] = f"trimmed: outside IQR fence {_r(lo):.0f}–{_r(hi):.0f}"
    cv = [c.rate for c in clean]
    n = len(cv)
    if n >= pipe["median_min_n"]:
        method, point = "median", median(cv)
    else:
        method, point = "trimmed_mean", trimmed_mean(cv)
    p25, p75 = percentile(cv, 25), percentile(cv, 75)
    if method == "trimmed_mean":
        conf = "Low"
    elif n >= pipe["high_confidence_min_n"] and not flagged:
        conf = "High"
    else:
        conf = "Medium"
    baseline = {"method": method, "median": _r(point, 2), "p25": _r(p25, 2), "p75": _r(p75, 2),
                "comp_count": n, "raw_count": len(vals), "trimmed_out": len(vals) - n,
                "diag_mean": _r(diag_mean, 2), "diag_median": _r(diag_median, 2), "gap_pct": _r(gap, 2),
                "flagged": flagged, "confidence": conf}
    ratios = plan_ratios(units, hm["baseline_layout"])
    out_units = []
    for u in units:
        t = cfg["unit_types"][u["unit_type"]]
        lc = cfg["layouts"][u["id"]]
        ratio = ratios[u["id"]]
        k = t["realization"] * t["position_index"] * ratio
        adr = point * k
        occ = plan_occupancy(u, cfg)
        su = size_units(u["bedrooms"], u.get("has_den", False), cfg["occupancy_model"]["den_weight"])
        scaled = u["id"] != hm["baseline_layout"]
        base_adr = u["base_scenario"]["adr"]
        base_occ = cfg["base_occupancy"]["value"]
        base_rp = base_adr * base_occ
        rp = revpau(adr, occ)
        out_units.append({
            "id": u["id"], "unit_type": u["unit_type"], "ratio_to_s1": _r(ratio, 4),
            "realization": t["realization"], "position_index": t["position_index"],
            "adr": _r(adr, 2), "adr_p25": _r(p25 * k, 2), "adr_p75": _r(p75 * k, 2),
            "occupancy": _r(occ, 6), "occupancy_method": "size_step_down", "size_units": su,
            "revpau": _r(rp, 2),
            "revpau_p25": _r(revpau(p25 * k, occ), 2), "revpau_p75": _r(revpau(p75 * k, occ), 2),
            "comp_count": n, "method": method,
            "basis": "scaled" if scaled else "comp_median",
            "confidence": downgrade(conf) if scaled else conf,
            "base_adr": base_adr, "base_occupancy": base_occ, "base_revpau": _r(base_rp, 2),
            "vs_base_adr_pct": _r((adr / base_adr - 1) * 100, 1),
            "vs_base_revpau_pct": _r((rp / base_rp - 1) * 100, 1),
            "doc_occupancy": u["base_scenario"]["occupancy"],
        })
    return {
        "mode": "hotel_median",
        "as_of": wk["week"], "week_start": wk["week"], "week_end": wk.get("week_end"), "week_label": wk.get("label"),
        "snapshot_generated": wk.get("generated"), "comp_source": wk.get("rate_sources"),
        "data_status": "live",
        "basis": "ADR and RevPAU (RevPAU = ADR x occupancy), USD per night",
        "pipeline": {"records_in": len(comps), "after_dedupe": len(d), "after_stale": len(s),
                     "duplicates_removed": len(comps) - len(d), "stale_removed": len(d) - len(s),
                     "hotels_in_landscape": len(details)},
        "baseline": baseline, "comps": details, "units": out_units,
    }
