"""Stage a relaxed 12-second CC0 human; does not replace published assets."""
import sys,math,json,hashlib,os
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from lifelike_common import ROOT,STAGE,FPS,END,export_glb,apply_static_modifiers_with_shapes,normalize_skin_weights

bpy.ops.wm.open_mainfile(filepath=str((STAGE if os.environ.get('MIRRA_MODEL') else ROOT/'.avatar-source')/'sample-human.blend'))
scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=END;scene.render.fps=FPS
rig=bpy.data.objects['FORM_sample_rig_v1'];rig.animation_data_clear()
body=bpy.data.objects['body:sample'];root=bpy.data.objects['sample-body-meters']
bpy.context.view_layer.update()
face_dir=ROOT/'.avatar-source/faceunits01/targets/faceunits'
metadata=json.loads((face_dir.parents[1]/'packs/faceunits01.json').read_text())
units=['eyeBlinkLeft','eyeBlinkRight','browInnerUp','mouthSmileLeft','mouthSmileRight']
body.shape_key_add(name='Basis')
for name in units:
    assert metadata[name]['license']=='CC0'
    key=body.shape_key_add(name=name)
    # MakeHuman targets are X/up/depth; the imported Blender mesh is X/-depth/up.
    for line in (face_dir/(name+'.target')).read_text().splitlines():
        if not line or line.startswith('#'):continue
        index,x,y,z=line.split();index=int(index)
        if index<len(key.data):key.data[index].co+=Vector((float(x),-float(z),float(y)))*body.get('MPFB_GEN_scale_factor',.1)
apply_static_modifiers_with_shapes(body)
breath=body.shape_key_add(name='breathing')
for vertex in breath.data:
    world=body.matrix_world@vertex.co
    influence=max(0,1-abs(world.z-1.255)/.18)*max(0,1-(abs(world.x)/.24)**4)
    vertex.co.x+=vertex.co.x*.018*influence
    vertex.co.y+=vertex.co.y*.025*influence

# Keep ankle position and foot orientation fixed while the pelvis shifts.
for side in ([] if os.environ.get('MIRRA_MODEL') else ['l','r']):
    calf=rig.pose.bones['calf_'+side];foot=rig.pose.bones['foot_'+side]
    anchor=bpy.data.objects.new('control:ankle_'+side,None);scene.collection.objects.link(anchor)
    anchor.matrix_world=rig.matrix_world@foot.bone.matrix_local
    if os.environ.get('MIRRA_MODEL'):anchor.location.x*=.65
    ik=calf.constraints.new('IK');ik.target=anchor;ik.chain_count=2;ik.use_stretch=False
    thigh=rig.data.bones['thigh_'+side]
    pole=bpy.data.objects.new('control:knee_'+side,None);scene.collection.objects.link(pole)
    knee=rig.matrix_world@calf.bone.head_local;pole.location=knee+Vector((0,-.6,0));ik.pole_target=pole
    if os.environ.get('MIRRA_MODEL'):pole.location.x=anchor.location.x
    pole_local=rig.matrix_world.inverted()@pole.location
    chain=foot.bone.head_local-thigh.head_local;axis=(thigh.tail_local-thigh.head_local).normalized()
    projected=chain.cross(pole_local-thigh.head_local).cross(axis).normalized()
    ik.pole_angle=math.atan2(axis.dot(thigh.x_axis.cross(projected)),thigh.x_axis.dot(projected))
    rotation=foot.constraints.new('COPY_ROTATION');rotation.target=anchor;rotation.owner_space='WORLD';rotation.target_space='WORLD'

# Re-project each existing eyeball atlas island from its anatomical coordinates.
# The source atlas has two iris discs; the previous generic material treatment
# left unreadable pupils in the browser.
eyes=bpy.data.objects['body:eyes']
centers={}
for sign in [-1,1]:
    vertices=[v for v in eyes.data.vertices if v.co.x*sign>0]
    center=Vector(tuple((max(v.co[i] for v in vertices)+min(v.co[i] for v in vertices))/2 for i in range(3)))
    centers[sign]=center
    radius=max(abs(v.co.x-center.x) for v in vertices)
    for polygon in eyes.data.polygons:
        for loop_index in polygon.loop_indices:
            co=eyes.data.vertices[eyes.data.loops[loop_index].vertex_index].co
            if co.x*sign<=0:continue
            uvcenter=.75 if sign>0 else .25
            uv_y=.70 if sign>0 else .28
            eyes.data.uv_layers.active.data[loop_index].uv=(uvcenter+(co.x-center.x-sign*.001)/radius*.24,uv_y+(co.z-center.z)/radius*.24)
eyes.shape_key_add(name='Basis')
for name,rotation in [('gazeLeft',.045),('gazeRight',-.045)]:
    key=eyes.shape_key_add(name=name)
    for v in key.data:
        center=centers[1 if v.co.x>0 else -1]
        v.co=center+Quaternion((0,0,1),rotation)@(v.co-center)

for material in bpy.data.materials:
    if material.name.startswith('uq-'):continue
    if not material.use_nodes:continue
    shader=material.node_tree.nodes.get('Principled BSDF')
    if not shader:continue
    name=material.name.lower()
    shader.inputs['Roughness'].default_value=.20 if 'high-poly' in name else .64 if any(t in name for t in ['short02','eyebrow']) else .48
    shader.inputs['Metallic'].default_value=0

# Choose local rotations from anatomical bone directions, rather than guessing
# Euler signs. Both arms hang beside the torso with a small elbow bend.
relaxed={}
for side,sign in [('l',1),('r',-1)]:
    upper=rig.data.bones['upperarm_'+side];lower=rig.data.bones['lowerarm_'+side]
    feminine=os.environ.get('MIRRA_MODEL')=='model-2'
    upper_delta=(upper.tail_local-upper.head_local).normalized().rotation_difference(Vector((sign*(.20 if feminine else .10),-.015,-1)).normalized())
    lower_delta=(lower.tail_local-lower.head_local).normalized().rotation_difference(Vector((sign*(.10 if feminine else .035),-.10,-1)).normalized())
    uq=upper.matrix_local.to_quaternion();lq=lower.matrix_local.to_quaternion()
    relaxed['upperarm_'+side]=uq.inverted()@upper_delta@uq
    relaxed['lowerarm_'+side]=lq.inverted()@upper_delta.inverted()@lower_delta@lq
    for finger in ['index','middle','ring','pinky']:
        for segment in ['01','02','03']:
            relaxed[f'{finger}_{segment}_{side}']=Quaternion((1,0,0),.10 if segment=='01' else .16)

if os.environ.get('MIRRA_MODEL'):
    # A quiet standing pose does not need a moving pelvis or leg IK. Align the
    # anatomical chains directly; the previous IK pole setup bowed the knees.
    for side,sign in [('l',1),('r',-1)]:
        thigh=rig.data.bones['thigh_'+side];calf=rig.data.bones['calf_'+side];foot=rig.data.bones['foot_'+side]
        td=(thigh.tail_local-thigh.head_local).normalized().rotation_difference(Vector((sign*.008,-.025,-1)).normalized())
        cd=(calf.tail_local-calf.head_local).normalized().rotation_difference(Vector((0,.025,-1)).normalized())
        tq=thigh.matrix_local.to_quaternion();cq=calf.matrix_local.to_quaternion();fq=foot.matrix_local.to_quaternion()
        relaxed['thigh_'+side]=tq.inverted()@td@tq
        relaxed['calf_'+side]=cq.inverted()@td.inverted()@cd@cq
        relaxed['foot_'+side]=fq.inverted()@cd.inverted()@fq

def motion(frame,preroll=False):
    phase=(frame%END)/END*math.tau
    ramp=max(0,min(1,(frame+96)/72)) if frame<0 else 1
    for bone in rig.pose.bones:
        bone.rotation_mode='QUATERNION';bone.rotation_quaternion=Quaternion()
    for name,q in relaxed.items():
        rig.pose.bones[name].rotation_quaternion=Quaternion().slerp(q,ramp)
    if frame>=0:
        pelvis=rig.pose.bones['pelvis']
        pelvis.location=Vector((0,0,0)) if os.environ.get('MIRRA_MODEL') else pelvis.bone.matrix_local.to_3x3().inverted()@Vector((.008*math.sin(phase),0,-.008))/root.scale.x
        rig.pose.bones['pelvis'].keyframe_insert('location',frame=frame)
        for name,axis,angle in [('spine_01',(0,1,0),.018*math.sin(phase)),('spine_02',(1,0,0),.018*math.sin(2*phase)),
            ('spine_03',(0,1,0),-.012*math.sin(phase)),('neck_01',(0,0,1),.035*math.sin(phase)),('head',(1,0,0),.018*math.sin(2*phase))]:
            rig.pose.bones[name].rotation_quaternion=Quaternion(axis,angle)
        for side,sign in [('l',1),('r',-1)]:
            bone=rig.pose.bones['upperarm_'+side];bone.rotation_quaternion=relaxed[bone.name]@Quaternion((0,1,0),sign*.025*math.sin(phase))
    for bone in rig.pose.bones:bone.keyframe_insert('rotation_quaternion',frame=frame)

for frame in list(range(-96,0,4))+list(range(0,END*2+1,4)):motion(frame)
rig.animation_data.action.name='FORM_Idle'

def animate_keys(obj):
    if not obj.data.shape_keys:return
    keys=obj.data.shape_keys.key_blocks
    for frame in range(END*2+1):
        t=frame/FPS
        blink=max(max(0,1-abs(t%12-center)/.10) for center in [2.25,6.7,10.25])
        for name in ['eyeBlinkLeft','eyeBlinkRight']:
            if name in keys:keys[name].value=blink;keys[name].keyframe_insert('value',frame=frame)
        for name in ['mouthSmileLeft','mouthSmileRight','browInnerUp']:
            if name in keys:
                keys[name].value=(.07 if 'Smile' in name else .025)*(1-math.cos(t/12*math.tau))
                keys[name].keyframe_insert('value',frame=frame)
        if 'breathing' in keys:
            keys['breathing'].value=.5-.5*math.cos(t/4*math.tau)
            keys['breathing'].keyframe_insert('value',frame=frame)
        for name,sign in [('gazeLeft',1),('gazeRight',-1)]:
            if name in keys:
                keys[name].value=max(0,sign*math.sin(t/12*math.tau))
                keys[name].keyframe_insert('value',frame=frame)
    if obj.data.shape_keys.animation_data:obj.data.shape_keys.animation_data.action.name='FORM_Idle_Face'
animate_keys(body);animate_keys(eyes)
snapshots=[]
for frame in range(END*2+1):
    scene.frame_set(frame);bpy.context.view_layer.update()
    if frame in [0,END,END*2]:snapshots.append({bone.name:(rig.matrix_world@bone.head).copy() for bone in rig.pose.bones})
cycle_error=max((snapshots[0][name]-snapshot[name]).length for snapshot in snapshots[1:] for name in snapshots[0])
if cycle_error>.001:raise RuntimeError('Body IK does not repeat deterministically: '+str(cycle_error))
scene.frame_set(0)
for obj in bpy.data.objects:
    if obj.type=='MESH':normalize_skin_weights(obj,rig)
for obj in list(bpy.context.selected_objects):obj.select_set(False)
for obj in bpy.data.objects:
    if obj.type in ['MESH','ARMATURE','EMPTY'] and not obj.name.startswith('garment:'):obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(STAGE/'human.blend'))
result=export_glb(STAGE/'human.glb')
result.update({'avatarVersion':3,'rigVersion':2,'bodyMotionVersion':2,'facialAnimationVersion':1,'clipDurationSeconds':12,
    'bodyCycleErrorM':cycle_error,
    'faceUnitSource':'https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html',
    'faceUnitArchiveSha256':hashlib.sha256((ROOT/'.avatar-source/faceunits01.zip').read_bytes()).hexdigest(),
    'facialUnits':units,'status':'candidate; visual review required','physicalFitValidated':False})
(STAGE/'human.json').write_text(json.dumps(result,indent=2)+'\n')
print('LIFELIKE_HUMAN',result)
