"""Run with Blender --background --factory-startup --disable-autoexec --python.

Only operator-authored, private garment .blend libraries are accepted. Each
library supplies actual-size pattern panels with calibrated CLOTH modifiers.
"""
import json
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector, Matrix
from arrangement import body_frame


def run(request_path):
    root = request_path.parent
    request = json.loads(request_path.read_text())
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.frame_start, scene.frame_end = 1, 120
    bpy.ops.import_scene.gltf(filepath=request["display"])
    body = list(scene.objects)
    for obj in body:
        obj.name = "body:" + obj.name
    # Display and collision remain separate: no duplicate body in the export.
    bpy.ops.import_scene.gltf(filepath=request["collision"])
    colliders = [obj for obj in scene.objects if obj not in body]
    for obj in colliders:
        if obj.type == "MESH":
            obj.modifiers.new("Body collision", "COLLISION")
            obj.collision.thickness_outer = 0.002
    garments = []
    rest_lengths = {}
    landmarks = request["landmarks"]
    category_order = {"bottom": 0, "top": 1, "outerwear": 2}
    for garment in sorted(request["garments"], key=lambda g: category_order[g["category"]]):
        with bpy.data.libraries.load(garment["path"], link=False) as (source, target):
            target.objects = [name for name in source.objects if name.startswith("panel:")]
        panels = [obj for obj in target.objects if obj]
        if not panels:
            raise ValueError("Garment asset has no actual-size pattern panels")
        for obj in panels:
            scene.collection.objects.link(obj)
            if obj.type != "MESH" or obj.animation_data or obj.constraints or any(abs(s - 1) > 0.0001 for s in obj.matrix_world.to_scale()):
                raise ValueError("Pattern panels must be unscaled meshes without animation or drivers")
            cloths = [m for m in obj.modifiers if m.type == "CLOTH"]
            if len(cloths) != 1 or not obj.get("fabric_calibration_id"):
                raise ValueError("Garment lacks calibrated cloth settings")
            cloth = cloths[0]
            if garment.get("schemaVersion") == 2:
                if obj.get("pattern_version") != garment["patternVersion"] or obj.get("arrangement_version") != garment["arrangementVersion"] or obj.get("fabric_calibration_id") != garment["fabric"]["calibrationId"] or obj.get("size_label") != garment["size"] or obj.get("sku") != garment["sku"] or not obj.get("dimension_checks"):
                    raise ValueError("Authored library does not match the garment manifest")
                # A rigid frame changes placement only; no body-dependent scale.
                frame = body_frame(landmarks, garment["category"])
                rotation = Matrix(frame["axes"]).transposed().to_4x4()
                origin = Vector(frame["origin"])
                reference = Vector(obj["reference_origin"])
                obj.matrix_world = Matrix.Translation(origin) @ rotation @ Matrix.Translation(-reference) @ obj.matrix_world
                properties = garment["fabric"]["properties"]
                scenario = request.get("scenario", "nominal")
                for name, prop, inverse in (("tension_stiffness", "stretchWarp", True), ("shear_stiffness", "stretchWeft", True), ("bending_stiffness", "bending", False), ("mass", "densityKgM2", False)):
                    low, high = properties[prop]
                    mid = (low + high) / 2
                    chosen = low if scenario == "lower" else high if scenario == "upper" else mid
                    factor = mid / chosen if inverse else chosen / mid
                    setattr(cloth.settings, name, getattr(cloth.settings, name) * factor)
                low, high = properties["friction"]
                cloth.collision_settings.friction = low if scenario == "lower" else high if scenario == "upper" else (low + high) / 2
                low, high = properties["thicknessM"]
                thickness = low if scenario == "lower" else high if scenario == "upper" else (low + high) / 2
                obj["collision_distance"] = max(.001, thickness / 2)
            rest_lengths[obj.name] = [(edge.vertices[:], (obj.data.vertices[edge.vertices[0]].co - obj.data.vertices[edge.vertices[1]].co).length) for edge in obj.data.edges if not edge.is_loose]
            cloth.settings.quality = max(cloth.settings.quality, 10)
            cloth.collision_settings.use_collision = True
            cloth.collision_settings.use_self_collision = True
            cloth.collision_settings.distance_min = obj.get("collision_distance", .003)
            cloth.collision_settings.self_distance_min = obj.get("collision_distance", .003)
            cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, 120
            anchor = obj.get("body_anchor", "waistY")
            if anchor not in ("chestY", "waistY", "hipY"):
                raise ValueError("Unsupported panel arrangement anchor")
            # Blender imports glTF Y-up as Z-up. Translate the initial arrangement
            # only; never scale the garment to make the requested size fit.
            if garment.get("schemaVersion") != 2:
                obj.location += Vector((0, 0, landmarks[anchor] - float(obj.get("reference_anchor_m", 0))))
            obj["rest_lengths_key"] = obj.name
            obj.name = "panel:" + garment["productId"]
            obj["product_id"] = garment["productId"]
            obj.modifiers.new("Layer collision", "COLLISION")
            obj.collision.thickness_outer = 0.002
            garments.append(obj)
    scene.render.fps = 30
    # Advance sequentially so all layers are solved in the same collision world.
    last = None
    movement = float("inf")
    for frame in range(1, 121):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        if frame in (115, 120):
            depsgraph = bpy.context.evaluated_depsgraph_get()
            positions = [obj.matrix_world @ vertex.co for obj in garments for vertex in obj.evaluated_get(depsgraph).data.vertices]
            if last is not None:
                if len(last) != len(positions):
                    raise ValueError("Garment topology changed during settling")
                movement = max((a - b).length for a, b in zip(last, positions))
            last = positions
    if movement > 0.005:
        raise ValueError("Cloth has not settled within 5 mm; asset needs calibration")
    depsgraph = bpy.context.evaluated_depsgraph_get()
    output = body[:]
    product_groups = {}
    diagnostics = {"status": "estimated", "scenario": request.get("scenario", "nominal"), "maxMovementM": movement, "garments": {}}
    for obj in garments:
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
        baked = bpy.data.objects.new(obj.name, mesh)
        scene.collection.objects.link(baked)
        baked.matrix_world = obj.matrix_world
        product_id = obj["product_id"]
        strain = []
        regions = diagnostics["garments"].setdefault(product_id, {"maxEdgeStrain": 0, "regions": {}, "regionMethod": "nearest reviewed torso section height"})["regions"]
        for (a, b), rest in rest_lengths[obj["rest_lengths_key"]]:
            if rest > 1e-8:
                value = (mesh.vertices[a].co - mesh.vertices[b].co).length / rest - 1
                if not math.isfinite(value):
                    raise ValueError("Nonfinite cloth strain")
                strain.append(value)
                midpoint = obj.matrix_world @ ((mesh.vertices[a].co + mesh.vertices[b].co) / 2)
                region = min(("chest", "waist", "hip"), key=lambda r: abs(midpoint.z - landmarks[r + "Y"]))
                detail = regions.setdefault(region, {"maxEdgeStrain": 0})
                detail["maxEdgeStrain"] = max(detail["maxEdgeStrain"], value)
        diagnostics["garments"][product_id]["maxEdgeStrain"] = max(diagnostics["garments"][product_id]["maxEdgeStrain"], max([0] + strain))
        if product_id not in product_groups:
            group = bpy.data.objects.new("garment:" + product_id, None)
            scene.collection.objects.link(group)
            product_groups[product_id] = group
        baked.parent = product_groups[product_id]
        output.append(baked)
    # Reject visible body penetration before publishing. BVH nearest-surface
    # checks are conservative; operator physical/visual validation is still needed.
    from mathutils.bvhtree import BVHTree
    for collider in colliders:
        if collider.type != "MESH":
            continue
        tree = BVHTree.FromObject(collider, depsgraph)
        inverse = collider.matrix_world.inverted()
        for obj in output[len(body):]:
            for vertex in obj.data.vertices:
                point = inverse @ obj.matrix_world @ vertex.co
                nearest, normal, _, distance = tree.find_nearest(point)
                if nearest is not None and (point - nearest).dot(normal) < -0.002:
                    raise ValueError("Clothing penetrates captured body; review arrangement or scan")
                if nearest is not None:
                    product_id = obj.parent.name.removeprefix("garment:")
                    world = obj.matrix_world @ vertex.co
                    region = min(("chest", "waist", "hip"), key=lambda r: abs(world.z - landmarks[r + "Y"]))
                    regions = diagnostics["garments"][product_id]["regions"]
                    detail = regions.setdefault(region, {"maxEdgeStrain": 0})
                    world_distance = (collider.matrix_world @ nearest - world).length
                    detail["minClearanceM"] = min(detail.get("minClearanceM", float("inf")), float(world_distance))
    # Triangle overlap detects intersections missed by vertex-only proximity.
    def world_tree(item):
        return BVHTree.FromPolygons([item.matrix_world @ v.co for v in item.data.vertices], [p.vertices[:] for p in item.data.polygons])
    trees = [(obj, world_tree(obj)) for obj in output[len(body):]]
    body_trees = [world_tree(obj) for obj in colliders if obj.type == "MESH"]
    for i, (obj, tree) in enumerate(trees):
        if any(tree.overlap(body_tree) for body_tree in body_trees):
            raise ValueError("Cloth triangles cross the captured body")
        for other, other_tree in trees[i + 1:]:
            if obj.parent != other.parent and tree.overlap(other_tree):
                raise ValueError("Garment layers intersect; revise arrangement")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in output + list(product_groups.values()):
        obj.select_set(True)
    options = dict(filepath=str(root / "result.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False, export_extras=False, export_original_specular=False)
    supported = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in supported})
    (root / "diagnostics.json").write_text(json.dumps(diagnostics, allow_nan=False))


if __name__ == "__main__":
    run(Path(sys.argv[sys.argv.index("--") + 1]))
