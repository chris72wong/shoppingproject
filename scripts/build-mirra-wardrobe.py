"""Fit CC0 construction templates to each source body and author Mirra capsule variants.

These are appearance approximations, not exact retailer sewing patterns or validated fit.
Template shapes are fitted by MPFB to each independently generated body, then edited.
Run after build-sample-human.py, before build-lifelike-human.py, with MIRRA_MODEL set.
"""
import bpy, bmesh, sys, os, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.avatar-source'
MODEL=os.environ.get('MIRRA_MODEL','model-1')
STAGE=SOURCE/MODEL
REVISION='3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf'
sys.path.insert(0,str(SOURCE/'mpfb'/('mpfb2-'+REVISION)/'src'))
bpy.utils.extension_path_user=lambda *args,**kwargs:str(SOURCE/'mpfb-user')
import mpfb
mpfb.get_preference=lambda name:{'mpfb_user_data':str(SOURCE/'mpfb-user'),'mh_user_data':str(SOURCE/'system'),'mh_auto_user_data':False}.get(name,False)
mpfb.register()
from mpfb.services.humanservice import HumanService
bpy.ops.wm.open_mainfile(filepath=str(STAGE/'sample-human.blend'))
body=bpy.data.objects['body:sample'];rig=bpy.data.objects['FORM_sample_rig_v1']
root=bpy.data.objects['sample-body-meters']
for old in list(bpy.data.objects):
    if old.name.startswith('garment:') or old.name=='neutral:footwear':bpy.data.objects.remove(old,do_unlink=True)
original_body_modifiers={m.name for m in body.modifiers}
rig.data.pose_position='REST'
# The raw source remains unsubdivided for MHCLO's original topology references.
for modifier in body.modifiers:
    if modifier.type=='SUBSURF':modifier.show_viewport=False
templates={}
for source in ['male_casualsuit06','male_casualsuit03']:
    obj=HumanService.add_mhclo_asset(str(SOURCE/'system/clothes'/source/(source+'.mhclo')),body,asset_type='Clothes',subdiv_levels=0)
    templates[source]=obj
    bpy.context.view_layer.update()
    # Connected components keep the tee and trousers intact at their overlapping waist.
    neighbours={v.index:set() for v in obj.data.vertices}
    for edge in obj.data.edges:
        a,b=edge.vertices;neighbours[a].add(b);neighbours[b].add(a)
    remaining=set(neighbours);groups=[]
    while remaining:
        start=remaining.pop();group={start};todo=[start]
        while todo:
            for other in neighbours[todo.pop()]:
                if other in remaining:remaining.remove(other);group.add(other);todo.append(other)
        groups.append(group)
    print('TEMPLATE_COMPONENTS',source,[(len(g),tuple(round(min((obj.matrix_world@obj.data.vertices[i].co)[j] for i in g),3) for j in range(3)),tuple(round(max((obj.matrix_world@obj.data.vertices[i].co)[j] for i in g),3) for j in range(3))) for g in groups],flush=True)
    obj['mirra_top_vertices']=[i for g in groups if max((obj.matrix_world@obj.data.vertices[i].co).z for i in g)>1.15 for i in g]

def material(name,color):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=.86
    shader.inputs['Sheen Weight'].default_value=.22
    return mat

def garment(product,template,category,color,oversized=False):
    obj=template.copy();obj.data=template.data.copy();bpy.context.collection.objects.link(obj)
    obj.name='garment:'+product
    top=set(template['mirra_top_vertices'])
    remove=set(range(len(obj.data.vertices)))-top if category!='bottom' else top
    mesh=bmesh.new();mesh.from_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    bmesh.ops.delete(mesh,geom=[mesh.verts[i] for i in remove],context='VERTS')
    mesh.to_mesh(obj.data);mesh.free()
    obj.data.materials.clear();obj.data.materials.append(material(product,color))
    for polygon in obj.data.polygons:polygon.material_index=0;polygon.use_smooth=True
    inverse=obj.matrix_world.inverted()
    # Modest shape changes preserve the fitted garment construction and its authored folds.
    for vertex in obj.data.vertices:
        p=obj.matrix_world@vertex.co
        if category=='top':
            ease=1.055 if oversized else 1.025
            p.x*=ease;p.y*=1.08 if oversized else 1.04
            if oversized:p.z-=.014*max(0,min(1,(1.4-p.z)/.25))
        elif category=='outerwear':
            if MODEL=='model-2' and abs(p.x)>.20:
                bone=rig.data.bones['lowerarm_l' if p.x>0 else 'lowerarm_r']
                elbow=rig.matrix_world@bone.head_local;wrist=rig.matrix_world@bone.tail_local
                axis=(wrist-elbow).normalized();t=(p-elbow).dot(axis)/(wrist-elbow).length
                blend=max(0,min(1,(t-.55)/.45))
                p-=axis*(.045*blend*blend*(3-2*blend))
            p.x*=1.055;p.y*=1.13
            if abs(p.x)<.24:p.z-=.07*max(0,min(1,(1.15-p.z)/.25))
            # Keep the front clear of the underlying tee.
            if p.y<-.02:p.y-=.013
        else:
            # Reduce flare below the knee while retaining the template's ankle position.
            if p.z<.48:
                center=.135 if p.x>0 else -.135
                p.x=center+(p.x-center)*.92
        vertex.co=inverse@p
    # Avoid a paper-thin open edge at neckline and cuffs.
    for m in list(obj.modifiers):
        if m.type not in ['ARMATURE']:obj.modifiers.remove(m)
    smooth=obj.modifiers.new('Tailored surface','SUBSURF');smooth.levels=smooth.render_levels=1
    solid=obj.modifiers.new('Fabric edge','SOLIDIFY');solid.thickness=.0012/root.scale.x;solid.offset=0
    obj['mirra_product']=product
    obj['mirra_template']='MakeHuman system CC0 '+template.name
    return obj

garment('uq-489929-white',templates['male_casualsuit06'],'top',(.88,.865,.83))
garment('uq-493232-black',templates['male_casualsuit06'],'top',(.024,.027,.029),True)
garment('uq-482880-navy',templates['male_casualsuit06'],'bottom',(.025,.046,.077))
garment('uq-482880-olive',templates['male_casualsuit06'],'bottom',(.19,.22,.125))
garment('uq-482452-blue',templates['male_casualsuit03'],'outerwear',(.20,.34,.46))
for obj in templates.values():bpy.data.objects.remove(obj,do_unlink=True)
# Neutral studio footwear finishes the human preview; it is not a catalog product.
shoes=HumanService.add_mhclo_asset(str(SOURCE/'system/clothes/shoes05/shoes05.mhclo'),body,asset_type='Clothes',subdiv_levels=0)
shoes.name='neutral:footwear'
shoes.data.materials.clear();shoes.data.materials.append(material('Mirra neutral sneakers',(.79,.78,.73)))
for polygon in shoes.data.polygons:polygon.material_index=0;polygon.use_smooth=True
for modifier in list(body.modifiers):
    if modifier.type=='MASK' and modifier.name not in original_body_modifiers:body.modifiers.remove(modifier)
    elif modifier.type=='SUBSURF':modifier.show_viewport=True
rig.data.pose_position='POSE'
bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'sample-human.blend'))
(STAGE/'wardrobe-source.json').write_text(json.dumps({'model':MODEL,'templateLicense':'CC0-1.0','sources':['makehuman_system_assets/clothes/male_casualsuit06','makehuman_system_assets/clothes/male_casualsuit03','makehuman_system_assets/clothes/shoes05'],'neutralFootwearIsCatalogProduct':False,'appearanceApproximation':True,'physicalFitValidated':False},indent=2))
print('MIRRA_WARDROBE_READY',MODEL,flush=True)
