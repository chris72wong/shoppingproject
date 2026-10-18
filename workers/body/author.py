"""Blender CLI: author.py -- manifest.json size pattern.json calibration.json output.blend.

Inputs are trusted operator-authored data. No generic mesh is represented as a
reconstruction of a real product. Editable panel topology and sewing paths must
be supplied and pass their dimensional checks before a library is produced.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern import validate_pattern


def author(manifest_path, label, pattern_path, calibration_path, output):
    import bpy
    g, bundle, fabric = [json.loads(Path(path).read_text()) for path in (manifest_path, pattern_path, calibration_path)]
    if bundle["version"] != g["pattern"]["version"] or bundle["sku"] != g["identity"]["sku"]:
        raise ValueError("Editable source bundle version mismatch")
    p = bundle["sizes"][label]
    size = next(s for s in g["sizes"] if s["label"] == label)
    measured = validate_pattern(p, g, size)
    if fabric["calibrationId"] != g["fabric"]["calibrationId"] or fabric["version"] != g["fabric"]["version"]:
        raise ValueError("Fabric calibration version mismatch")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    mesh = bpy.data.meshes.new("editable-panels")
    sewing = [pair for seam in p["seams"] for pair in zip(seam["a"], seam["b"])]
    mesh.from_pydata([(x, -z, y) for x, y, z in p["vertices"]], sewing, p["faces"])
    mesh.update()
    obj = bpy.data.objects.new("panel:" + g["productId"], mesh)
    bpy.context.collection.objects.link(obj)
    cloth = obj.modifiers.new("Calibrated fabric", "CLOTH")
    cloth.settings.use_sewing_springs = True
    allowed = {"tension_stiffness", "compression_stiffness", "shear_stiffness", "bending_stiffness", "mass", "sewing_force_max"}
    settings = fabric["blenderCloth"]
    if set(settings) != allowed:
        raise ValueError("Supply all calibrated Blender cloth coefficients")
    for key, value in settings.items():
        if not isinstance(value, (int, float)) or not 0 < value < 10000:
            raise ValueError("Invalid cloth coefficient")
        setattr(cloth.settings, key, value)
    cloth.collision_settings.friction = sum(g["fabric"]["properties"]["friction"]) / 2
    material = bpy.data.materials.new("operator-material")
    material.diffuse_color = tuple(p.get("color", [.6, .6, .6, 1]))
    obj.data.materials.append(material)
    anchor = "waist" if g["category"] == "bottom" else "chest"
    obj["body_anchor"] = anchor + "Y"
    obj["reference_anchor_m"] = p["referenceAnchor"][1]
    obj["reference_origin"] = [p["referenceAnchor"][0], -p["referenceAnchor"][2], p["referenceAnchor"][1]]
    obj["fabric_calibration_id"] = g["fabric"]["calibrationId"]
    obj["pattern_version"] = g["pattern"]["version"]
    obj["arrangement_version"] = g["arrangementVersion"]
    obj["dimension_checks"] = json.dumps(measured)
    obj["size_label"] = label
    obj["sku"] = g["identity"]["sku"]
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(output).resolve()))


if __name__ == "__main__":
    author(*sys.argv[sys.argv.index("--") + 1:])
