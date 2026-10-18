"""Run with Blender --background --factory-startup --disable-autoexec --python.

Only operator-authored, private garment .blend libraries are accepted. Each
library supplies actual-size pattern panels with calibrated CLOTH modifiers.
"""
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector


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
            if obj.type != "MESH" or obj.animation_data or any(abs(s - 1) > 0.0001 for s in obj.scale):
                raise ValueError("Pattern panels must be unscaled meshes without animation or drivers")
            cloths = [m for m in obj.modifiers if m.type == "CLOTH"]
            if len(cloths) != 1 or not obj.get("fabric_calibration_id"):
                raise ValueError("Garment lacks calibrated cloth settings")
            cloth = cloths[0]
            cloth.settings.quality = max(cloth.settings.quality, 10)
            cloth.collision_settings.use_collision = True
            cloth.collision_settings.use_self_collision = True
            cloth.collision_settings.distance_min = 0.003
            cloth.collision_settings.self_distance_min = 0.003
            cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, 120
            anchor = obj.get("body_anchor", "waistY")
            if anchor not in ("chestY", "waistY", "hipY"):
                raise ValueError("Unsupported panel arrangement anchor")
            # Blender imports glTF Y-up as Z-up. Translate the initial arrangement
            # only; never scale the garment to make the requested size fit.
            obj.location += Vector((0, 0, landmarks[anchor] - float(obj.get("reference_anchor_m", 0))))
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
    for obj in garments:
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
        baked = bpy.data.objects.new(obj.name, mesh)
        scene.collection.objects.link(baked)
        baked.matrix_world = obj.matrix_world
        product_id = obj["product_id"]
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
                if nearest is not None and distance < 0.03 and (point - nearest).dot(normal) < -0.002:
                    raise ValueError("Clothing penetrates captured body; review arrangement or scan")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in output + list(product_groups.values()):
        obj.select_set(True)
    options = dict(filepath=str(root / "result.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False, export_extras=False, export_original_specular=False)
    supported = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in supported})


if __name__ == "__main__":
    run(Path(sys.argv[sys.argv.index("--") + 1]))
