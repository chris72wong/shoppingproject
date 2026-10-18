"""Synthetic geometry verifies transformations, not real-world body accuracy.

These tests run inside the worker container, or in a Python environment with
requirements.txt installed. They skip explicitly if geometry libraries are absent.
"""
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest

HAS_GEOMETRY = bool(importlib.util.find_spec("trimesh") and importlib.util.find_spec("open3d"))


@unittest.skipUnless(HAS_GEOMETRY, "Install geometry dependencies to run pipeline tests")
class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        import trimesh
        from pipeline import reconstruct, measure
        cls.np, cls.trimesh, cls.reconstruct, cls.measure = np, trimesh, staticmethod(reconstruct), staticmethod(measure)

    def test_metric_mesh_conversion_collision_and_measurement(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root = Path(temp)
            # A cylinder has known sections and is deliberately not a human.
            mesh = self.trimesh.creation.cylinder(radius=.15, height=1.75, sections=128)
            # Source is millimeters, Z up, translated far from origin.
            mesh.apply_scale(1000)
            mesh.apply_translation([300, 400, 900])
            source = root / "source.ply"
            mesh.export(source)
            self.reconstruct(source, {"format":"ply", "units":"mm", "upAxis":"z", "confirmedHeight":1.75}, root)
            display = self.trimesh.load(root / "display.glb").to_geometry()
            self.assertAlmostEqual(display.extents[1],1.75,places=4)
            self.assertAlmostEqual(display.bounds[0,1],0,places=4)
            self.assertTrue((root / "collision.glb").exists())
            self.measure(root / "display.glb", {"chestY":1.3,"waistY":1.0,"hipY":.9,"shoulderLeft":[-.15,1.4,0],"shoulderRight":[.15,1.4,0],"crotch":[0,.8,.15]}, root)
            values = json.loads((root / "result.json").read_text())["measurements"]
            self.assertAlmostEqual(values["chest"]["value"],math.pi * .3,places=3)
            self.assertEqual(values["chest"]["quality"],"unvalidated")
            self.assertTrue(values["chest"]["overClothing"])

    def test_wrong_units_are_rejected_instead_of_rescaling(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root=Path(temp)
            mesh=self.trimesh.creation.icosphere()
            source=root / "source.glb"
            mesh.export(source)
            with self.assertRaisesRegex(ValueError,"scale"):
                self.reconstruct(source,{"format":"glb","units":"mm","upAxis":"y","confirmedHeight":1.75},root)

    def test_scene_node_transforms_are_applied(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            root=Path(temp)
            mesh=self.trimesh.creation.cylinder(radius=.15,height=1.75,sections=64)
            transform=self.trimesh.transformations.rotation_matrix(math.pi / 2,[1,0,0])
            transform[:3,3]=[4,5,6]
            scene=self.trimesh.Scene()
            scene.add_geometry(mesh,transform=transform)
            source=root / "source.glb"
            scene.export(source)
            self.reconstruct(source,{"format":"glb","units":"m","upAxis":"y","confirmedHeight":1.75},root)
            result=self.trimesh.load(root / "display.glb").to_geometry()
            self.assertAlmostEqual(result.extents[1],1.75,places=4)
            self.assertAlmostEqual(result.bounds[0,1],0,places=4)


if __name__ == "__main__":
    unittest.main()
