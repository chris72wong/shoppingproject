"""Build the CC0 sample body with MPFB, using workspace-local source assets.

Blender --background --factory-startup --python-exit-code 1 --python this-file
Source downloads live in ignored .avatar-source; no user Blender setup is used.
This exports a body and neutral underlayer, never a branded clothing substitute.
"""
import hashlib
import json
import math
import struct
from pathlib import Path
import sys
import os
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".avatar-source"
MODEL = os.environ.get("MIRRA_MODEL")
MODEL_SOURCE = SOURCE / MODEL if MODEL else SOURCE
MODEL_SOURCE.mkdir(parents=True, exist_ok=True)
REVISION = "3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf"
sys.path.insert(0, str(SOURCE / "mpfb" / ("mpfb2-" + REVISION) / "src"))
# Keep MPFB's caches/preferences entirely within this workspace.
bpy.utils.extension_path_user = lambda *args, **kwargs: str(SOURCE / "mpfb-user")
import mpfb
mpfb.get_preference = lambda name: {"mpfb_user_data": str(SOURCE / "mpfb-user"), "mh_user_data": str(SOURCE / "system"), "mh_auto_user_data": False}.get(name, False)
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
macro = TargetService.get_default_macro_info_dict()
macro["gender"] = 0.0 if MODEL == "model-2" else 1.0
macro["age"] = .4
body = HumanService.create_human(macro_detail_dict=macro)
body.name = "body:sample"
skin = "young_caucasian_female" if MODEL == "model-2" else "young_caucasian_male"
HumanService.set_character_skin(str(SOURCE / f"system/skins/{skin}/{skin}.mhmat"), body, skin_type="MAKESKIN")
rig = HumanService.add_builtin_rig(body, "game_engine")
rig.name = "FORM_sample_rig_v1"
assets = []
for subdir, name, kind in (("eyes", "high-poly", "Eyes"), ("hair", "ponytail01" if MODEL == "model-2" else "short02", "Hair"), ("eyebrows", "eyebrow001", "Eyebrows"), ("teeth", "teeth_base", "Teeth"), ("tongue", "tongue01", "Tongue")):
    obj = HumanService.add_mhclo_asset(str(SOURCE / "system" / subdir / name / (name + ".mhclo")), body, asset_type=kind, subdiv_levels=0)
    obj.name = "body:" + kind.lower()
    assets.append(obj)

# Bake only the chosen body shape. Keep the rig and body helpers for weights.
bpy.context.view_layer.objects.active = body
body.select_set(True)
if body.data.shape_keys:
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
body_group = body.vertex_groups.get("body")
body_ids = {v.index for v in body.data.vertices if any(g.group == body_group.index and g.weight > .5 for g in v.groups)}
coords = [body.matrix_world @ v.co for v in body.data.vertices if v.index in body_ids]
bottom, top = min(v.z for v in coords), max(v.z for v in coords)
factor = (1.68 if MODEL == "model-2" else 1.75) / (top - bottom)

# A plain, unbranded modesty underlayer. Its geometry is separate from the body.
faces = []
for polygon in body.data.polygons:
    if not all(i in body_ids for i in polygon.vertices):
        continue
    center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
    height = ((body.matrix_world @ center).z - bottom) * factor
    if .73 < height < 1.04 and abs(center.x) * factor < .34:
        faces.append(list(polygon.vertices))
indices = sorted({i for face in faces for i in face})
mapping = {old: new for new, old in enumerate(indices)}
mesh = bpy.data.meshes.new("neutral-underlayer")
mesh.from_pydata([body.data.vertices[i].co + body.data.vertices[i].normal * .003 for i in indices], [], [[mapping[i] for i in f] for f in faces])
# Level the open waistband and leg hems instead of exposing the source body's
# irregular polygon rows. This is an unbranded privacy underlayer only.
edge_counts = {}
for polygon in mesh.polygons:
    for edge in polygon.edge_keys:
        edge_counts[edge] = edge_counts.get(edge, 0) + 1
boundary = {i for edge, count in edge_counts.items() if count == 1 for i in edge}
inverse_body = body.matrix_world.inverted()
for index in boundary:
    point = body.matrix_world @ mesh.vertices[index].co
    height = (point.z - bottom) * factor
    point.z = bottom + (1.04 if height > .9 else .73) / factor
    mesh.vertices[index].co = inverse_body @ point
underlayer = bpy.data.objects.new("underlayer:neutral", mesh)
bpy.context.collection.objects.link(underlayer)
underlayer.matrix_world = body.matrix_world.copy()
underlayer.parent = rig
for group in body.vertex_groups:
    underlayer.vertex_groups.new(name=group.name)
for old, new in mapping.items():
    for group in body.data.vertices[old].groups:
        underlayer.vertex_groups[group.group].add([new], group.weight, "REPLACE")
underlayer.modifiers.new("Shared skeleton", "ARMATURE").object = rig
material = bpy.data.materials.new("neutral charcoal")
material.diffuse_color = (.075, .09, .105, 1)
material.use_nodes = True
bsdf = material.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = material.diffuse_color
bsdf.inputs["Roughness"].default_value = .9
underlayer.data.materials.append(material)

root = bpy.data.objects.new("sample-body-meters", None)
bpy.context.collection.objects.link(root)
rig.parent = root
root.scale = (factor, factor, factor)
root.location.z = -bottom * factor
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 192
print("RIG_BONES", list(rig.pose.bones.keys()))
for frame in range(0, 193, 4):
    phase = frame / 192 * math.tau
    for name, amplitude in (("spine_01", .004), ("spine_02", .004), ("spine_03", .003), ("neck_01", .006), ("head", .008)):
        bone = rig.pose.bones.get(name)
        if bone:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (math.sin(phase) * amplitude, 0, math.sin(phase) * amplitude * .35)
            bone.keyframe_insert("rotation_euler", frame=frame)
if not rig.animation_data or not rig.animation_data.action:
    raise ValueError("No idle animation tracks were authored")
rig.animation_data.action.name = "FORM_Idle"
scene.frame_set(0)

# Skin and eyeballs are opaque. MakeSkin's blanket alpha blending causes
# triangle sorting defects in the face; hair/brows alone need cutout opacity.
for material in bpy.data.materials:
    if material.use_nodes:
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Roughness"].default_value = .72
            shader.inputs["Metallic"].default_value = 0
            if not any(word in material.name.lower() for word in ("short02", "bob01", "ponytail01", "eyebrow")):
                for link in list(shader.inputs["Alpha"].links): material.node_tree.links.remove(link)
                shader.inputs["Alpha"].default_value = 1
                material.surface_render_method = 'DITHERED'
subdivision = body.modifiers.new("Smooth anatomical surface", "SUBSURF")
subdivision.levels = subdivision.render_levels = 1

# Retain facial texture detail; small accessories stay at 1K.
for image in bpy.data.images:
    limit = 2048 if "male_diffuse" in image.name else 1024
    if image.size[0] > limit or image.size[1] > limit:
        image.scale(limit, limit)
    if image.source == "FILE":
        image.pack()
for obj in [body, underlayer] + assets:
    for p in obj.data.polygons:
        p.use_smooth = True

output = MODEL_SOURCE / "base.glb" if MODEL else ROOT / "public/models/sample-human.glb"
bpy.ops.object.select_all(action="DESELECT")
for obj in [root, rig, body, underlayer] + assets:
    obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL_SOURCE / "sample-human.blend"))
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
    export_animations=True, export_animation_mode="ACTIONS", export_frame_range=True, export_force_sampling=True,
    export_extras=False, export_image_format="JPEG", export_jpeg_quality=88)
data = output.read_bytes()
document_size = struct.unpack_from("<I", data, 12)[0]
document = json.loads(data[20:20 + document_size])
binary = data[28 + document_size:]
# The skin's optional clearcoat/specular extensions are unnecessary for the
# neutral viewer material. Keep the same bounded, self-contained GLB contract.
def remove_extensions(value):
    if isinstance(value, dict):
        for key in ("extensions", "extensionsUsed", "extensionsRequired"):
            value.pop(key, None)
        for child in value.values(): remove_extensions(child)
    elif isinstance(value, list):
        for child in value: remove_extensions(child)
remove_extensions(document)
for material in document.get("materials", []):
    if any(word in material.get("name", "").lower() for word in ("short02", "bob01", "ponytail01", "eyebrow")):
        material["alphaMode"] = "MASK"
        material["alphaCutoff"] = .45
    else:
        material.pop("alphaMode", None)
        material["doubleSided"] = False
document["asset"]["copyright"] = "MakeHuman system assets: CC0-1.0. See NOTICE-MakeHuman.txt. Idle animation and neutral underlayer authored for FORM."
encoded = json.dumps(document, separators=(",", ":")).encode()
encoded += b" " * (-len(encoded) % 4)
data = struct.pack("<IIIII", 0x46546c67, 2, 28 + len(encoded) + len(binary), len(encoded), 0x4e4f534a) + encoded + struct.pack("<II", len(binary), 0x004e4942) + binary
output.write_bytes(data)
provenance = {"schemaVersion": 1, "source": "https://github.com/makehumancommunity/mpfb2/tree/" + REVISION,
    "assetSource": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html",
    "license": "CC0-1.0", "tool": "Blender " + bpy.app.version_string + " / MPFB " + ".".join(map(str, mpfb.VERSION)),
    "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "heightMeters": 1.68 if MODEL == "model-2" else 1.75,
    "rigVersion": 1, "rig": "game_engine", "idleClip": "FORM_Idle", "idleDurationSeconds": 8,
    "sourceDownloads": {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in ("mpfb.zip", "system-assets.zip")},
    "measurements": {"height": {"valueM": 1.68 if MODEL == "model-2" else 1.75, "method": "exported-body height", "validated": False}},
    "limitations": "Sample body and neutral underlayer only. No shopping garments, personal sizing validation, or cloth physics."}
(MODEL_SOURCE / "base.provenance.json" if MODEL else ROOT / "public/models/sample-human.provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
print("EXPORTED", len(data))
