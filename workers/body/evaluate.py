"""Offline acceptance report from consented, de-identified physical trial CSV.

Rows: participant,repeat,dimension,predicted_m,reference_m,predicted_size,reference_size
Optional garment_id distinguishes physical fittings of different garments.
No participant names, scans, or imagery belong in the report or repository.
"""
import csv
import json
import statistics
import sys
import math

NAMES = ("height", "chest", "waist", "hip", "shoulder", "inseam")


def percentile(values, fraction):
    values = sorted(values)
    index = (len(values) - 1) * fraction
    lo, hi = math.floor(index), math.ceil(index)
    return values[lo] + (values[hi] - values[lo]) * (index - lo)


def evaluate(rows, coverage=None):
    people = set(row["participant"] for row in rows)
    dimensions = {}
    required_dimensions = sorted(set(NAMES) | {name for g in (coverage or {}).get("garments", {}).values() for name in g.get("dimensions", [])})
    for name in required_dimensions:
        matches = [row for row in rows if row["dimension"] == name]
        try:
            errors = [abs(float(row["predicted_m"]) - float(row["reference_m"])) for row in matches]
        except (ValueError, TypeError):
            errors = [float("nan")]
        if not errors or not all(math.isfinite(e) for e in errors):
            dimensions[name] = {"passed": False, "reason": "Missing or invalid observations"}
            continue
        groups = {}
        for row in matches:
            groups.setdefault(row["participant"], []).append(float(row["predicted_m"]))
        repeat_ids = {person: {r["repeat"] for r in matches if r["participant"] == person} for person in groups}
        repeated = len(groups) >= 12 and all(len(ids) >= 2 for ids in repeat_ids.values())
        median, p95 = statistics.median(errors), percentile(errors, 0.95)
        dimensions[name] = {"medianAbsoluteErrorM": median, "p95AbsoluteErrorM": p95,
            "maxRepeatRangeM": max(max(v) - min(v) for v in groups.values()), "passed": repeated and median <= 0.01 and p95 <= 0.02}
    # One physical fitting must not count six times because its size was copied
    # beside each body dimension in the CSV.
    fittings = {}
    conflicts = False
    for row in rows:
        if not row.get("reference_size"):
            continue
        key = (row["participant"], row["repeat"], row.get("garment_id", "pilot"), row.get("configuration", "individual"))
        pair = (row.get("predicted_size"), row["reference_size"])
        if key in fittings and fittings[key] != pair:
            conflicts = True
        fittings[key] = pair
    sizing = list(fittings.values())
    agreement = sum(predicted == reference for predicted, reference in sizing) / len(sizing) if sizing else 0
    garment_reports = {}
    for garment_id, expected in (coverage or {}).get("garments", {}).items():
        observations = [row for row in rows if row.get("garment_id") == garment_id and row.get("reference_size")]
        selected = {key: value for key, value in fittings.items() if key[2] == garment_id}
        participants = {key[0] for key in selected}
        size_coverage = {size: len({row["participant"] for row in observations if row["reference_size"] == size}) for size in expected["sizes"]}
        score = sum(a == b for a, b in selected.values()) / len(selected) if selected else 0
        configurations = {mode: len({r["participant"] for r in observations if r.get("configuration", "individual") == mode}) for mode in expected.get("configurations", ["individual"])}
        appearance = bool(observations) and all(all(row.get(view) == "pass" for view in ("front", "side", "back")) and row.get("blinded") == "true" for row in observations)
        garment_reports[garment_id] = {"participants": len(participants), "sizes": size_coverage, "sizeAgreement": score,
            "configurations": configurations,
            "passed": bool(size_coverage) and bool(configurations) and not conflicts and len(participants) >= 12 and all(count >= 3 for count in size_coverage.values()) and all(count >= 12 for count in configurations.values()) and score >= .9 and appearance,
            "appearanceGate": appearance}
    return {"participants": len(people), "dimensions": dimensions, "sizeAgreement": agreement,
        "measurementGate": len(people) >= 12 and all(d["passed"] for d in dimensions.values()),
        "sizingGate": not conflicts and len({key[0] for key in fittings}) >= 12 and agreement >= 0.9,
        "appearanceGate": "requires physical front/side/back assessment", "performanceGate": "requires device benchmarks",
        "garments": garment_reports, "coverageGate": bool(garment_reports) and all(g["passed"] for g in garment_reports.values()),
        "generalization": "Pilot observations only; body-shape subgroup review required before release"}


if __name__ == "__main__":
    with open(sys.argv[1], newline="") as source:
        coverage = json.loads(open(sys.argv[2]).read()) if len(sys.argv) > 2 else None
        print(json.dumps(evaluate(list(csv.DictReader(source)), coverage), indent=2))
