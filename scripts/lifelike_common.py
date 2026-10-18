"""Shared staging/export utilities for the estimated lifelike preview."""
import bpy, json, struct, hashlib, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'.avatar-source'/os.environ.get('MIRRA_MODEL','lifelike')
STAGE.mkdir(parents=True,exist_ok=True)
FPS=24
END=288

def normalize_skin_weights(obj,rig):
    """Match the four influences supported by this viewer's GLB skinning."""
    bones=set(rig.data.bones.keys())
    for vertex in obj.data.vertices:
        influences=[(g.group,g.weight) for g in vertex.groups if obj.vertex_groups[g.group].name in bones and g.weight>0]
        kept=sorted(influences,key=lambda pair:pair[1],reverse=True)[:4]
        total=sum(weight for _,weight in kept)
        for group,_ in influences:obj.vertex_groups[group].remove([vertex.index])
        if total:
            for group,weight in kept:obj.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')

def export_glb(path):
    path=Path(path)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=False,export_animations=True,export_animation_mode='SCENE',export_anim_scene_split_object=False,
        export_frame_range=True,export_frame_step=1,export_force_sampling=True,export_morph=True,
        export_extras=False,export_image_format='JPEG',export_jpeg_quality=90)
    data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size]);binary=data[28+size:]
    def clean(value):
        if isinstance(value,dict):
            for k in ['extensions','extensionsUsed','extensionsRequired']:value.pop(k,None)
            for child in value.values():clean(child)
        elif isinstance(value,list):
            for child in value:clean(child)
    clean(doc)
    for material in doc.get('materials',[]):
        if 'eyebrow' in material.get('name','').lower():
            # A grayscale eyebrow bump image is not a tangent-space normal map.
            material.pop('normalTexture',None);material['alphaMode']='BLEND'
        elif any(n in material.get('name','').lower() for n in ['short02','bob01','ponytail01']):
            material['alphaMode']='MASK';material['alphaCutoff']=.45
        else:material.pop('alphaMode',None)
    for clip in doc.get('animations',[]):clip['name']='FORM_Idle'
    doc['asset']['copyright']='MakeHuman CC0 body; CC0 facial units by Mika Suominen. FORM estimated garment drafts and motion. Physical fit unvalidated.'
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    data=struct.pack('<IIIII',0x46546c67,2,28+len(encoded)+len(binary),len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(data)
    return {'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}

def apply_static_modifiers_with_shapes(obj):
    """Evaluate topology consistently for every facial key, before GLB export."""
    bpy.context.view_layer.objects.active=obj
    armatures=[m for m in obj.modifiers if m.type=='ARMATURE']
    for m in armatures:m.show_viewport=False
    keys=obj.data.shape_keys
    action=keys.animation_data.action if keys and keys.animation_data else None
    action_slot=keys.animation_data.action_slot if keys and keys.animation_data else None
    if action:keys.animation_data.action=None
    states=[(k.name,k.value) for k in keys.key_blocks] if keys else []
    baked=[];reference=None
    for index in range(max(1,len(states))):
        if keys:
            for key in keys.key_blocks:key.value=0
            if index:keys.key_blocks[index].value=1
        bpy.context.view_layer.update()
        evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
        baked.append([v.co.copy() for v in mesh.vertices])
        if reference is None:reference=mesh
        else:bpy.data.meshes.remove(mesh)
    group_names=[g.name for g in obj.vertex_groups]
    old=obj.data;obj.data=reference
    for name in group_names:
        if name not in obj.vertex_groups:obj.vertex_groups.new(name=name)
    for modifier in list(obj.modifiers):
        if modifier.type!='ARMATURE':obj.modifiers.remove(modifier)
        else:modifier.show_viewport=True
    if states:
        for index,(name,_) in enumerate(states):
            key=obj.shape_key_add(name=name)
            for vertex,coordinate in zip(key.data,baked[index]):vertex.co=coordinate
        if action:
            obj.data.shape_keys.animation_data_create();obj.data.shape_keys.animation_data.action=action
            obj.data.shape_keys.animation_data.action_slot=action_slot
            # The caller may restore this source mesh for the next outfit export.
            # Leaving its action detached silently removes blinks after case zero.
            old.shape_keys.animation_data.action=action
            old.shape_keys.animation_data.action_slot=action_slot
        for key,(_,value) in zip(old.shape_keys.key_blocks,states):key.value=value
    return old
