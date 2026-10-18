import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
from validation import validate_glb, validate_ply, unpack_capture
from evaluate import evaluate


def glb(document):
    data = json.dumps(document).encode()
    data += b" " * (-len(data) % 4)
    return struct.pack("<IIIII", 0x46546C67, 2, 28 + len(data) + 4, len(data), 0x4E4F534A) + data + struct.pack("<II", 4, 0x004E4942) + b"\0" * 4


class ValidationTests(unittest.TestCase):
    def test_glb_container_and_external_references(self):
        document = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 4}]}
        self.assertEqual(validate_glb(glb(document)), document)
        for addition in ({"images": [{"uri": "http://attacker.invalid"}]}, {"extensionsUsed": ["test"]}, {"buffers": [{"byteLength": 1000}]}):
            with self.assertRaises(ValueError):
                validate_glb(glb({**document, **addition}))
        with self.assertRaises(ValueError):
            validate_glb(glb(document)[:-1])

    def test_ply_resource_bounds(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            path = Path(temp) / "input.ply"
            path.write_text("ply\nformat ascii 1.0\nelement vertex 2000001\nend_header\n")
            with self.assertRaises(ValueError):
                validate_ply(path)
            path.write_text("ply\nformat ascii 1.0\nelement vertex 10\nend_header\n")
            validate_ply(path)

    def test_capture_zip_traversal_and_calibration(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            path = Path(temp) / "capture.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("../escape", "bad")
            with self.assertRaises(ValueError):
                unpack_capture(path, Path(temp) / "output")
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("manifest.json", json.dumps({"schemaVersion": 1, "units": "cm", "upAxis": "y", "frames": []}))
            with self.assertRaises(ValueError):
                unpack_capture(path, Path(temp) / "output")

    def test_acceptance_requires_all_dimensions_repeats_and_twelve_people(self):
        self.assertFalse(evaluate([])["measurementGate"])
        rows = []
        for person in range(12):
            for repeat in range(2):
                for dimension in ("height", "chest", "waist", "hip", "shoulder", "inseam"):
                    rows.append(dict(participant=str(person), repeat=str(repeat), dimension=dimension, predicted_m="1.005", reference_m="1", predicted_size="M", reference_size="M"))
        self.assertTrue(evaluate(rows)["measurementGate"])
        self.assertTrue(evaluate(rows)["sizingGate"])
        self.assertFalse(evaluate([r for r in rows if r["dimension"] != "waist"])["measurementGate"])
        rows[0]["predicted_m"] = "nan"
        self.assertFalse(evaluate(rows)["measurementGate"])


if __name__ == "__main__":
    unittest.main()
