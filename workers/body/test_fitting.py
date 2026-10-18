import copy
import math
import unittest
from arrangement import body_frame, place
from pattern import validate_pattern, distance
from evaluate import evaluate


class FittingTests(unittest.TestCase):
    def test_arrangement_is_rigid_and_category_anchored(self):
        landmarks = {"chestFront": [0, 1.3, .15], "chestBack": [0, 1.3, -.15], "waistFront": [0, 1, .13], "waistBack": [0, 1, -.13], "shoulderLeft": [-.2, 1.5, 0], "shoulderRight": [.2, 1.5, 0]}
        frame = body_frame(landmarks, "top")
        a, b = (.2, .1, .7), (-.4, .5, .8)
        self.assertAlmostEqual(distance(a, b), distance(place(a, (0, 0, .5), frame), place(b, (0, 0, .5), frame)))
        self.assertEqual(body_frame(landmarks, "bottom")["origin"][2], 1)
        # Rigidly rotating the captured person must not change garment lengths.
        angle = .7
        rotated = {k: [v[0]*math.cos(angle) + v[2]*math.sin(angle), v[1], -v[0]*math.sin(angle) + v[2]*math.cos(angle)] for k, v in landmarks.items()}
        frame = body_frame(rotated, "top")
        self.assertAlmostEqual(distance(a, b), distance(place(a, (0, 0, .5), frame), place(b, (0, 0, .5), frame)))
        landmarks["chestFront"], landmarks["chestBack"] = landmarks["chestBack"], landmarks["chestFront"]
        with self.assertRaises(ValueError):
            body_frame(landmarks, "top")

    def test_pattern_dimensions_seams_and_units_are_checked_before_authoring(self):
        # A synthetic square is a validator fixture, never a garment asset.
        g = {"category": "top", "identity": {"sku": "fixture"}, "pattern": {"version": 1, "dimensionToleranceM": .001}}
        d = {"value": 100, "uncertainty": 0, "units": "cm", "convention": "length"}
        size = {"label": "M", "dimensions": {k: copy.deepcopy(d) for k in ("chest", "shoulder", "sleeve", "upperArm", "length")}}
        p = {"units": "m", "upAxis": "y", "version": 1, "sku": "fixture", "size": "M", "vertices": [[0,0,0], [1,0,0], [1,1,0], [0,1,0]], "faces": [[0,1,2,3]], "seams": [{"a": [0,1], "b": [3,2]}], "grainDirection": [0,1,0], "constructionNotes": "synthetic", "closure": "closed", "dimensionChecks": [{"dimension": k, "paths": [[0,1]]} for k in size["dimensions"]]}
        self.assertEqual(validate_pattern(p, g, size)["chest"], 1)
        invalid = copy.deepcopy(p); invalid["vertices"][1][0] = 1.1
        with self.assertRaises(ValueError): validate_pattern(invalid, g, size)
        invalid = copy.deepcopy(p); invalid["units"] = "cm"
        with self.assertRaises(ValueError): validate_pattern(invalid, g, size)
        invalid = copy.deepcopy(p); invalid["dimensionChecks"].pop()
        with self.assertRaises(ValueError): validate_pattern(invalid, g, size)
        invalid = copy.deepcopy(p); invalid["seams"][0]["b"] = [0,2]
        with self.assertRaises(ValueError): validate_pattern(invalid, g, size)

    def test_trial_cannot_pass_untested_garments_or_sizes(self):
        rows = []
        for person in range(12):
            for repeat in range(2):
                for dimension in ("height", "chest", "waist", "hip", "shoulder", "inseam"):
                    rows.append(dict(participant=str(person), repeat=str(repeat), garment_id="tee", dimension=dimension, predicted_m="1", reference_m="1", predicted_size="M", reference_size="M", front="pass", side="pass", back="pass", blinded="true"))
        coverage = {"garments": {"tee": {"sizes": ["M"], "dimensions": ["chest"]}}}
        self.assertTrue(evaluate(rows, coverage)["coverageGate"])
        coverage["garments"]["tee"]["sizes"].append("L")
        self.assertFalse(evaluate(rows, coverage)["coverageGate"])
        self.assertFalse(evaluate(rows)["coverageGate"])
        rows[0]["predicted_m"] = "invalid"
        self.assertFalse(evaluate(rows, coverage)["measurementGate"])


if __name__ == "__main__":
    unittest.main()
