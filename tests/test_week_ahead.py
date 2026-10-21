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
