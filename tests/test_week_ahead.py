"""Unit tests for the Week Ahead calc chain.  Run:  python3 -m unittest discover -s tests -v"""
import copy
import json
import unittest
from datetime import date
from pathlib import Path

from week_ahead import engine as E

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "data/week_ahead/assumptions.json").read_text())
UNITS = json.loads((ROOT / "data/week_ahead/units.json").read_text())["units"]
SPEC = [245, 250, 255, 260, 270, 450]   # the spec's illustrative studio comps
AS_OF = date(2026, 10, 19)


def comps(vals, t="studio", d="2026-10-19", booked=False):
    return [E.Comp(date.fromisoformat(d), f"P{i}", t, {"studio": 0, "1br": 1, "2br": 2, "3br": 3}[t], 500.0, float(v), 2, booked)
            for i, v in enumerate(vals)]


def cfg(**pipe):
    c = copy.deepcopy(CFG)
    c["pipeline"].update(pipe)
    return c


class WorkedExample(unittest.TestCase):
    """Spec: mean 288.33, median 257.50, gap ~12% -> flagged; 257.50 x 1.05 = 270.38; x 79% ~ $214 RevPAU."""

    def test_mean_median_gap(self):
        self.assertAlmostEqual(E.mean(SPEC), 288.33, places=2)
        self.assertAlmostEqual(E.median(SPEC), 257.50, places=2)
        gap = E.mean_median_gap_pct(SPEC)
        self.assertAlmostEqual(gap, 11.97, places=2)
        self.assertGreater(gap, CFG["pipeline"]["mean_median_flag_pct"])

    def test_adr_and_revpau(self):
        adr = E.adr_from_median(257.50, 1.0, 1.05)
        self.assertAlmostEqual(adr, 270.375, places=3)
        self.assertEqual(round(adr, 2), 270.38)
        self.assertEqual(round(E.revpau(adr, 0.79)), 214)

    def test_pipeline_without_iqr_reproduces_spec(self):
        c = cfg(iqr_trim=False)
        c["unit_types"]["studio"]["position_index"] = 1.05
        r = E.estimate_type(comps(SPEC), "studio", c)
        self.assertEqual(r.method, "median")
        self.assertTrue(r.flagged)
        self.assertAlmostEqual(r.adr, 270.375, places=3)
        self.assertEqual(r.comp_count, 6)

    def test_pipeline_with_iqr_trims_the_450(self):
        r = E.estimate_type(comps(SPEC), "studio", CFG)
        self.assertTrue(r.flagged)               # diagnostic runs before the trim
        self.assertEqual(r.trimmed_out, 1)
        self.assertEqual(r.comp_count, 5)
        self.assertAlmostEqual(r.comp_point, 255.0)
        self.assertEqual(r.confidence, "Medium")


class Stats(unittest.TestCase):
    def test_percentiles(self):
        self.assertAlmostEqual(E.percentile(SPEC, 25), 251.25)
        self.assertAlmostEqual(E.percentile(SPEC, 75), 267.5)
        lo, hi = E.iqr_bounds(SPEC)
        self.assertLess(hi, 450)
        self.assertGreater(hi, 270)

    def test_trimmed_mean(self):
        self.assertAlmostEqual(E.trimmed_mean([100, 200, 210, 900]), 205.0)
        with self.assertRaises(ValueError):
            E.trimmed_mean([1, 2])


class Pipeline(unittest.TestCase):
    def test_trimmed_mean_below_five(self):
        r = E.estimate_type(comps([300, 310, 320, 400]), "studio", CFG)
        self.assertEqual(r.method, "trimmed_mean")
        self.assertAlmostEqual(r.comp_point, 315.0)
        self.assertEqual(r.confidence, "Low")

    def test_realization_applies_to_listed_only(self):
        c = copy.deepcopy(CFG)
        c["unit_types"]["studio"]["realization"] = 0.9
        listed = E.estimate_type(comps([300] * 5), "studio", c)
        booked = E.estimate_type(comps([300] * 5, booked=True), "studio", c)
        self.assertAlmostEqual(listed.adr, 270.0)
        self.assertAlmostEqual(booked.adr, 300.0)

    def test_dedupe_and_stale(self):
        cs = comps([300, 300]) + comps([300], d="2026-09-01")
        cs = [cs[0], cs[0], cs[2]]
        self.assertEqual(len(E.dedupe(cs)), 2)
        self.assertEqual(len(E.drop_stale(E.dedupe(cs), AS_OF, 14)), 1)

    def test_no_seasonality_and_revpau_is_adr_times_occ(self):
        feed = comps([330, 335, 340, 345, 350, 355, 360, 365]) + comps([400, 405, 410, 415, 420], "1br") \
            + comps([540, 545, 550, 555, 560], "2br") + comps([650, 660], "3br")
        out = E.run(feed, CFG, UNITS, AS_OF)
        for u in out["units"]:
            self.assertAlmostEqual(u["revpau"], round(u["adr"] * u["occupancy"], 2), places=1)
        s1 = next(u for u in out["units"] if u["id"] == "s1")
        self.assertAlmostEqual(s1["adr"], 347.5)          # plain median x 1.00 x 1.00, nothing else applied
        self.assertEqual(out["types"]["studio"]["confidence"], "High")

    def test_gap_fill_ratio_is_labelled_derived(self):
        feed = comps([330, 335, 340, 345, 350, 355, 360, 365]) + comps([650, 660], "3br")
        out = E.run(feed, CFG, UNITS, AS_OF)
        t = out["types"]["3br"]
        self.assertEqual(t["method"], "derived")
        self.assertEqual(t["confidence"], "Derived")
        self.assertEqual(t["derived_from"], "studio")
        r = CFG["gap_fill"]["ratios_to_studio"]
        self.assertAlmostEqual(t["adr"], 347.5 * r["3br"], places=2)

    def test_gap_fill_spec_ratio_example(self):
        # spec: with an illustrative 1.80 ratio, a $270 studio implies roughly a $487 2BR (270.375 x 1.80 = 486.7)
        self.assertEqual(round(270.375 * 1.80), 487)

    def test_power_curve_requires_beta(self):
        c = copy.deepcopy(CFG)
        c["gap_fill"]["method"] = "power"
        feed = comps([330, 335, 340, 345, 350]) + comps([650], "3br")
        with self.assertRaises(ValueError):
            E.run(feed, c, UNITS, AS_OF)
        c["gap_fill"]["power_beta"] = 1.0
        out = E.run(feed, c, UNITS, AS_OF)
        self.assertAlmostEqual(out["types"]["3br"]["adr"], 340 * 1185 / 533, places=2)


class DocumentFigures(unittest.TestCase):
    """The cost data transcribed from the AMBAR Residence Cards must reconcile with the document's own math."""

    def test_waterfall_reconciles(self):
        for u in UNITS:
            b, f, fx = u["base_scenario"], u["monthly_revenue_flow"], u["fixed_owner_costs_monthly"]
            self.assertAlmostEqual(b["adr"] * b["occupancy"] * 365 / 12, f["gross_room_revenue"], delta=0.02, msg=u["id"])
            net = f["gross_room_revenue"] * (0.5 - 0.04 - 0.025 - 0.0241) - fx["total"]
            self.assertAlmostEqual(net, f["owner_net_before_financing"], delta=0.02, msg=u["id"])
            self.assertAlmostEqual(sum(fx[k] for k in ("hoa_condo", "property_tax", "insurance_estimate", "utilities_estimate")), fx["total"], delta=0.02, msg=u["id"])
            self.assertAlmostEqual(f["owner_net_before_financing"] * 12 / u["reference_list_price"] * 100, u["cap_rate_pct"], delta=0.01, msg=u["id"])


if __name__ == "__main__":
    unittest.main()


def market(rates_by_hotel, week="2026-10-19"):
    """Minimal comps.json-shaped dict: {hotel_id: [nightly rates or None]}."""
    hotels = [{"id": h, "name": f"Hotel {h}", "brand": "X"} for h in rates_by_hotel]
    rates = []
    for h, rs in rates_by_hotel.items():
        for i, r in enumerate(rs):
            rates.append({"hotel": h, "week": week, "date": f"2026-10-{19 + i}", "rate": r, "status": "OK" if r else "UNAVAILABLE"})
    return {"meta": {"last_updated": week}, "hotels": hotels, "rates": rates,
            "weeks": [{"week": week, "week_end": "2026-10-25", "status": "collected", "generated": week}]}


class HotelMedianScaling(unittest.TestCase):
    DOC_ADR = {"s1": 338, "a1": 409, "a2": 449, "a3": 504, "a4": 510, "b1": 589, "b2": 552, "b3": 552, "c1": 658}

    def test_plan_ratios_from_document(self):
        r = E.plan_ratios(UNITS)
        for k, v in self.DOC_ADR.items():
            self.assertAlmostEqual(r[k], v / 338, places=9)

    def test_scaling_point_range_revpau_and_vs_base(self):
        db = market({f"h{i}": [v, v] for i, v in enumerate([300, 320, 340, 360, 380, 400, 420, 440, 460])})
        out = E.run_hotel_median(db, CFG, UNITS)
        b = out["baseline"]
        self.assertEqual((b["median"], b["comp_count"], b["confidence"]), (380.0, 9, "High"))
        self.assertAlmostEqual(b["p25"], 340.0)
        self.assertAlmostEqual(b["p75"], 420.0)
        occ = {u["id"]: E.plan_occupancy(u, CFG) for u in UNITS}
        for u in out["units"]:
            k = self.DOC_ADR[u["id"]] / 338
            self.assertAlmostEqual(u["adr"], round(380 * k, 2), places=2, msg=u["id"])
            self.assertAlmostEqual(u["adr_p25"], round(340 * k, 2), places=2)
            self.assertAlmostEqual(u["adr_p75"], round(420 * k, 2), places=2)
            self.assertAlmostEqual(u["revpau"], round(380 * k * occ[u["id"]], 2), places=1)
            self.assertAlmostEqual(u["vs_doc_base_pct"], round((380 / 338 - 1) * 100, 1))
            self.assertEqual(u["basis"], "comp_median" if u["id"] == "s1" else "scaled")
            self.assertEqual(u["confidence"], "High" if u["id"] == "s1" else "Medium")

    def test_realization_and_position_index_multiply_baseline(self):
        c = copy.deepcopy(CFG)
        c["unit_types"]["2br"]["realization"] = 0.9
        c["unit_types"]["2br"]["position_index"] = 1.05
        db = market({f"h{i}": [v, v] for i, v in enumerate([300, 320, 340, 360, 380])})
        out = E.run_hotel_median(db, c, UNITS)
        b1 = next(u for u in out["units"] if u["id"] == "b1")
        self.assertAlmostEqual(b1["adr"], round(340 * 0.9 * 1.05 * 589 / 338, 2), places=2)

    def test_hotel_week_median_trim_and_exclusion(self):
        db = market({"a": [250, 260, 270], "b": [270, 280, None], "c": [290, 300], "d": [300, 310], "e": [320, 330],
                     "f": [330, 340], "g": [1500, 1600], "thin": [999, None, None]})
        out = E.run_hotel_median(db, CFG, UNITS)
        st = {c["hotel"]: c["status"] for c in out["comps"]}
        self.assertTrue(st["thin"].startswith("excluded"))      # only 1 priced night
        self.assertTrue(st["g"].startswith("trimmed"))          # IQR outlier
        self.assertTrue(out["baseline"]["flagged"])             # mean pulled up by the outlier before trim
        self.assertEqual(out["baseline"]["comp_count"], 6)
        self.assertAlmostEqual(out["baseline"]["median"], 300.0)

    def test_downgrade(self):
        self.assertEqual([E.downgrade(x) for x in ("High", "Medium", "Low")], ["Medium", "Low", "Low"])

    def test_live_week_of_2026_10_19(self):
        db = json.loads((ROOT / "data/comps.json").read_text())
        out = E.run_hotel_median(db, CFG, UNITS, "2026-10-19")
        b = out["baseline"]
        self.assertEqual(b["comp_count"], 11)
        self.assertAlmostEqual(b["median"], 383.0)
        self.assertAlmostEqual(b["p25"], 269.75)
        self.assertAlmostEqual(b["p75"], 451.5)

    def test_step_down_occupancy_formula(self):
        # Occ = 79% x (1 - 4%) ^ (bedrooms + 0.5 x den)
        m = CFG["occupancy_model"]
        self.assertEqual((m["occ_studio"], m["d"], m["den_weight"]), (0.79, 0.04, 0.5))
        self.assertEqual((m["d_status"], m["den_weight_status"]), ("proposed, adjustable", "proposed, adjustable"))
        expected = {"s1": 79.0, "a1": 75.8, "a2": 74.3, "a3": 74.3, "a4": 74.3, "b1": 71.3, "b2": 72.8, "b3": 72.8, "c1": 69.9}
        units = {"s1": 0, "a1": 1, "a2": 1.5, "a3": 1.5, "a4": 1.5, "b1": 2.5, "b2": 2, "b3": 2, "c1": 3}
        for u in UNITS:
            self.assertEqual(E.size_units(u["bedrooms"], u["has_den"], 0.5), units[u["id"]], u["id"])
            self.assertEqual(round(E.plan_occupancy(u, CFG) * 100, 1), expected[u["id"]], u["id"])
        self.assertAlmostEqual(E.step_down_occupancy(0.79, 0.04, 2.5), 0.79 * 0.96 ** 2.5)

    def test_revpau_uses_step_down_and_keeps_document_base(self):
        db = json.loads((ROOT / "data/comps.json").read_text())
        out = E.run_hotel_median(db, CFG, UNITS, "2026-10-19")
        doc = {u["id"]: u for u in UNITS}
        for u in out["units"]:
            occ = E.plan_occupancy(doc[u["id"]], CFG)
            self.assertAlmostEqual(u["revpau"], round(u["adr"] * occ, 2), places=1)
            self.assertAlmostEqual(u["revpau_p25"], round(u["adr_p25"] * occ, 2), places=1)
            self.assertEqual(u["doc_occupancy"], doc[u["id"]]["base_scenario"]["occupancy"])
        c1 = next(u for u in out["units"] if u["id"] == "c1")
        self.assertAlmostEqual(c1["revpau"], 521.13, places=2)
        # document's own net / cap-rate figures are untouched
        self.assertEqual((doc["c1"]["net_per_year"], doc["c1"]["cap_rate_pct"]), (60600, 7.93))
