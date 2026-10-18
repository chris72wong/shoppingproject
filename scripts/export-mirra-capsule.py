"""Export model-specific outfit previews. Visual review is a separate release gate."""
import bpy,bmesh,sys,os,json,hashlib,itertools
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from lifelike_common import ROOT,STAGE,export_glb,apply_static_modifiers_with_shapes,normalize_skin_weights
MODEL=os.environ.get('MIRRA_MODEL','model-1')
bpy.ops.wm.open_mainfile(filepath=str(STAGE/'human.blend'))
scene=bpy.context.scene;scene.frame_set(0)
rig=bpy.data.objects['FORM_sample_rig_v1'];body=bpy.data.objects['body:sample'];root=bpy.data.objects['sample-body-meters']
garments={o.name[8:]:o for o in bpy.data.objects if o.name.startswith('garment:')}
TOPS=['uq-489929-white','uq-493232-black'];BOTTOMS=['uq-482880-navy','uq-482880-olive'];OUTER='uq-482452-blue'
for obj in garments.values():
    apply_static_modifiers_with_shapes(obj);normalize_skin_weights(obj,rig)
    # Reuse the CC0 construction template's tangent-space folds with neutral colors.
    source='male_casualsuit03' if obj.name.endswith('uq-482452-blue') else 'male_casualsuit06'
    normal_path=ROOT/'.avatar-source/system/clothes'/source/(source+'_normal.png')
    if normal_path.exists():
        mat=obj.data.materials[0];nodes=mat.node_tree.nodes;shader=nodes.get('Principled BSDF')
        image=bpy.data.images.load(str(normal_path),check_existing=True);image.colorspace_settings.name='Non-Color'
        if image.size[0]>1024:image.scale(1024,1024)
        image.pack()
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65 if obj.name.endswith(('uq-489929-white','uq-493232-black')) else .45
        mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
base=[o for o in bpy.data.objects if o.name.startswith('body:') or o.name=='neutral:footwear']
out=ROOT/'public/models/mirra'/MODEL;out.mkdir(parents=True,exist_ok=True)
sets=[[t,b]+([OUTER] if layer else []) for t,b,layer in itertools.product(TOPS,BOTTOMS,[False,True])]
sets += [[id] for id in TOPS+BOTTOMS+[OUTER]]
if '--cases' in sys.argv:indices=[int(value) for value in sys.argv[sys.argv.index('--cases')+1].split(',')]
elif '--case' in sys.argv:indices=[int(sys.argv[sys.argv.index('--case')+1])]
elif '--from' in sys.argv:indices=range(int(sys.argv[sys.argv.index('--from')+1]),len(sets))
else:indices=range(len(sets))
manifest_path=ROOT/'public/models/mirra-manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'models':{}}
model=manifest['models'].setdefault(MODEL,{'label':'Model 1' if MODEL=='model-1' else 'Model 2','height':1.75 if MODEL=='model-1' else 1.68,'duration':12,'assets':[]})
for number in indices:
    ids=sets[number];present=set(ids);selected=[garments[id] for id in ids]
    # Individual inspection retains neutral non-shopping clothing on the other half.
    neutral=[]
    if not any(id in TOPS for id in ids) and OUTER not in present:
        obj=garments[TOPS[0]].copy();obj.data=garments[TOPS[0]].data.copy();obj.name='neutral:top';bpy.context.collection.objects.link(obj);neutral.append(obj)
    if not any(id in BOTTOMS for id in ids):
        obj=garments[BOTTOMS[0]].copy();obj.data=garments[BOTTOMS[0]].data.copy();obj.name='neutral:bottom';bpy.context.collection.objects.link(obj);neutral.append(obj)
    # Apply conservative hidden-body masks only to fully covered torso/leg regions.
    visible=body.vertex_groups.new(name='mirra_visible')
    keep=[]
    for vertex in body.data.vertices:
        p=body.matrix_world@vertex.co
        hidden=(p.z<.93 if 'neutral:footwear' in bpy.data.objects else .10<p.z<.93) or (.96<p.z<1.39 and abs(p.x)<.205)
        if OUTER in present:
            for side in ['l','r']:
                for limb in ['upperarm','lowerarm']:
                    bone=rig.data.bones[limb+'_'+side]
                    start=rig.matrix_world@bone.head_local;end=rig.matrix_world@bone.tail_local
                    axis=(end-start).normalized();projection=(p-start).dot(axis)
                    cuff_margin=.045 if MODEL=='model-2' and limb=='lowerarm' else .01
                    if -.01<projection<(end-start).length-cuff_margin and (p-start-axis*projection).length<.09:hidden=True
        if not hidden:keep.append(vertex.index)
    visible.add(keep,1,'REPLACE')
    mask=body.modifiers.new('Covered body','MASK');mask.vertex_group=visible.name
    original_body=apply_static_modifiers_with_shapes(body)
    # The long sleeve layer conceals most of the tee; keep neckline and central placket.
    clipped=[]
    if OUTER in present:
        for id in TOPS:
            if id not in present:continue
            obj=garments[id];original=obj.data;obj.data=original.copy();clipped.append((obj,original))
            bm=bmesh.new();bm.from_mesh(obj.data)
            # Garment coordinates include the root scale, so use world-space tests.
            remove=[f for f in bm.faces if (obj.matrix_world@f.calc_center_median()).z<1.40 or (obj.matrix_world@f.calc_center_median()).y>-.04 or abs((obj.matrix_world@f.calc_center_median()).x)>.075]
            bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(obj.data);bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root,rig]+base+selected+neutral:obj.select_set(True)
    path=out/f'look-{number}.glb'
    temporary_output=STAGE/f'export-{number}.glb'
    result=export_glb(temporary_output)
    temporary_output.replace(path)
    row={'url':f'/models/mirra/{MODEL}/{path.name}','sha256':result['sha256'],'productIds':ids}
    model['assets']=[a for a in model['assets'] if sorted(a['productIds'])!=sorted(ids)]+[row]
    latest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'models':{}}
    latest['models'][MODEL]=model
    temporary_manifest=manifest_path.with_suffix('.'+MODEL+'.tmp')
    temporary_manifest.write_text(json.dumps(latest,indent=2)+'\n');temporary_manifest.replace(manifest_path)
    temporary_body=body.data;body.data=original_body;bpy.data.meshes.remove(temporary_body)
    body.vertex_groups.remove(visible)
    for obj,original in clipped:
        temp=obj.data;obj.data=original;bpy.data.meshes.remove(temp)
    for obj in neutral:bpy.data.objects.remove(obj,do_unlink=True)
    print('MIRRA_EXPORTED',MODEL,number,result,flush=True)
body_source=json.loads((STAGE/'base.provenance.json').read_text())
body_source['heightMeters']=1.68 if MODEL=='model-2' else 1.75
body_source['measurements']['height']['valueM']=body_source['heightMeters']
provenance={'model':MODEL,'bodySource':body_source,'humanSource':json.loads((STAGE/'human.json').read_text()),'wardrobeSource':json.loads((STAGE/'wardrobe-source.json').read_text()),'visualReviewPassed':False,'physicalFitValidated':False}
(out/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
