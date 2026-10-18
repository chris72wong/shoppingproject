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


def evaluate(rows):
    people = set(row["participant"] for row in rows)
    dimensions = {}
    for name in NAMES:
        matches = [row for row in rows if row["dimension"] == name]
        errors = [abs(float(row["predicted_m"]) - float(row["reference_m"])) for row in matches]
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
        key = (row["participant"], row["repeat"], row.get("garment_id", "pilot"))
        pair = (row.get("predicted_size"), row["reference_size"])
        if key in fittings and fittings[key] != pair:
            conflicts = True
        fittings[key] = pair
    sizing = list(fittings.values())
    agreement = sum(predicted == reference for predicted, reference in sizing) / len(sizing) if sizing else 0
    return {"participants": len(people), "dimensions": dimensions, "sizeAgreement": agreement,
        "measurementGate": len(people) >= 12 and all(d["passed"] for d in dimensions.values()),
        "sizingGate": not conflicts and len({key[0] for key in fittings}) >= 12 and agreement >= 0.9,
        "appearanceGate": "requires physical front/side/back assessment", "performanceGate": "requires device benchmarks",
        "generalization": "Pilot observations only; body-shape subgroup review required before release"}


if __name__ == "__main__":
    with open(sys.argv[1], newline="") as source:
        print(json.dumps(evaluate(list(csv.DictReader(source))), indent=2))
