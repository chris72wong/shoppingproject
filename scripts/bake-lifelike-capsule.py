"""Offline Blender cloth, explicitly estimated and isolated from calibrated fit.

Run -- --case 6 for the first white-tee/navy-chino review. All output is staged.
The cloth solve runs in metres. Baked keys are inverse-skinned residuals, not
world-space displacements that would double-apply the skeletal animation.
"""
import bpy,bmesh,sys,math,json,time,numpy as np,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
from lifelike_common import ROOT,STAGE,FPS,END,export_glb,normalize_skin_weights,apply_static_modifiers_with_shapes
from lifelike_details import add_surface_details
FPS=12
END=144
PREROLL=-48
STEP=4
IDS=['uq-489929-white','uq-493232-black','uq-482880-navy','uq-482880-olive','uq-482452-blue']
SETS=[[p] for p in IDS]
for top in IDS[:2]:
    for bottom in IDS[2:4]:SETS.extend([[top,bottom],[top,bottom,IDS[4]]])
arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if any(flag in arguments for flag in ['--no-self','--no-body-contact']) and '--diagnose' not in arguments:
    raise RuntimeError('Disabled collisions are diagnostic-only and cannot produce release assets')
case=int(arguments[arguments.index('--case')+1]) if '--case' in arguments else 6
names=SETS[case-1];started=time.monotonic()
bpy.ops.wm.open_mainfile(filepath=str(STAGE/'human.blend'))
scene=bpy.context.scene
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.co.x*=.5;point.handle_left.x*=.5;point.handle_right.x*=.5
scene.render.fps=FPS;scene.frame_start=PREROLL;scene.frame_end=END*2;scene.frame_set(PREROLL)
rig=bpy.data.objects['FORM_sample_rig_v1'];body=bpy.data.objects['body:sample'];root=bpy.data.objects['sample-body-meters']
bpy.context.view_layer.update()
with bpy.data.libraries.load(str(STAGE/'panels.blend'),link=False) as (source,target):
    target.objects=['garment:'+name for name in names]
garments=[obj for obj in target.objects if obj]
garments.sort(key=lambda obj: 0 if any(p in obj.name for p in IDS[2:4]) else 2 if IDS[4] in obj.name else 1)
pin_groups={};profile_report={}
for obj in garments:
    scene.collection.objects.link(obj)
    obj.parent=root
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    bpy.context.view_layer.update();matrix=obj.matrix_world.copy()
    obj.parent=None
    for vertex in obj.data.vertices:vertex.co=matrix@vertex.co
    obj.matrix_world=Matrix.Identity(4)
    bm=bmesh.new();bm.from_mesh(obj.data)
    # Remove the old isolated collar/pocket quads; tailored details are attached
    # to the solved surface after the cloth pass, never free-falling panels.
    if IDS[4] in obj.name:
        isolated=[f for f in bm.faces if all(len(edge.link_faces)==1 for edge in f.edges)]
        bmesh.ops.delete(bm,geom=isolated,context='FACES')
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    normalize_skin_weights(obj,rig)
    arm=obj.modifiers.new('Shared idle skeleton','ARMATURE');arm.object=rig;arm.use_deform_preserve_volume=False
    pin=obj.vertex_groups.new(name='cloth_anchors')
    bottom=any(p in obj.name for p in IDS[2:4]);outer=IDS[4] in obj.name
    for vertex in obj.data.vertices:
        p=vertex.co
        if bottom:weight=max(0,min(1,(p.z-1.005)/.025))
        else:
            # Hold neckline/shoulder seams; sleeves and hems remain free.
            weight=max(0,min(1,(p.z-1.405)/.035))*(1 if abs(p.x)<.13 else .2)
        if weight>0:pin.add([vertex.index],weight,'REPLACE')
    cloth=obj.modifiers.new('Estimated offline fabric','CLOTH')
    empty=bpy.data.collections.new('colliders:'+obj.name);scene.collection.children.link(empty)
    cloth.collision_settings.collection=empty
    settings=cloth.settings;settings.quality=12;settings.vertex_group_mass=pin.name;settings.pin_stiffness=1
    density=.26 if bottom else .22 if outer else .16
    # Blender's setting is mass PER VERTEX, not fabric mass per square metre.
    # Derive it from estimated area density so topology cannot multiply weight.
    area=sum(p.area for p in obj.data.polygons)
    settings.mass=density*area/len(obj.data.vertices)
    settings.tension_stiffness=2 if bottom or outer else 1
    settings.compression_stiffness=2 if bottom or outer else 1;settings.shear_stiffness=1 if bottom or outer else .5
    settings.bending_stiffness=.001 if bottom or outer else .0005
    settings.air_damping=.01;settings.tension_damping=.02;settings.compression_damping=.02;settings.shear_damping=.02;settings.bending_damping=.001
    cloth.collision_settings.use_collision=True;cloth.collision_settings.distance_min=.004
    cloth.collision_settings.use_self_collision=True;cloth.collision_settings.self_distance_min=.003
    if '--no-self' in arguments:cloth.collision_settings.use_self_collision=False
    if '--no-body-contact' in arguments:cloth.collision_settings.use_collision=False
    cloth.collision_settings.collision_quality=4
    cloth.collision_settings.friction=12;cloth.collision_settings.self_friction=12
    cloth.collision_settings.impulse_clamp=.0001;cloth.collision_settings.self_impulse_clamp=.0001
    cloth.point_cache.frame_start=PREROLL;cloth.point_cache.frame_end=END*2
    obj.modifiers.new('Garment layer contact','COLLISION');obj.collision.thickness_outer=.002
    profile_report[obj.name]={'estimated':True,'blenderVertexMass':settings.mass,'bending':settings.bending_stiffness,
        'arealDensityTargetKgM2':density,'restAreaM2':area,'totalMassKg':settings.mass*len(obj.data.vertices),
        'tension':settings.tension_stiffness,'vertexCount':len(obj.data.vertices),'calibrationId':None}
    profile_report[obj.name]['solverSettings']={name:getattr(settings,name) for name in ['quality','pin_stiffness','compression_stiffness','shear_stiffness','air_damping','tension_damping','compression_damping','shear_damping','bending_damping']}
    profile_report[obj.name]['collisionSettings']={name:getattr(cloth.collision_settings,name) for name in ['use_collision','use_self_collision','distance_min','self_distance_min','collision_quality','friction','self_friction','impulse_clamp','self_impulse_clamp']}

# Collision uses a low-resolution anatomical proxy, not the rendered face's
# dense topology. It shares bone weights and the same breathing driver.
proxy=body.copy();proxy.data=body.data.copy();scene.collection.objects.link(proxy);proxy.name='collision:body'
bpy.context.view_layer.objects.active=proxy
bpy.ops.object.shape_key_remove(all=True)
for modifier in list(proxy.modifiers):
    if modifier.type!='ARMATURE':proxy.modifiers.remove(modifier)
    else:modifier.show_viewport=False
bpy.context.view_layer.objects.active=proxy
decimate=proxy.modifiers.new('Collision proxy resolution','DECIMATE');decimate.ratio=.08
bpy.ops.object.modifier_apply(modifier=decimate.name)
for modifier in proxy.modifiers:modifier.show_viewport=True
proxy.shape_key_add(name='Basis');breath=proxy.shape_key_add(name='breathing')
for vertex in breath.data:
    world=proxy.matrix_world@vertex.co
    influence=max(0,1-abs(world.z-1.255)/.18)*max(0,1-(abs(world.x)/.24)**4)
    vertex.co.x+=vertex.co.x*.018*influence;vertex.co.y+=vertex.co.y*.025*influence
driver=breath.driver_add('value').driver;driver.type='AVERAGE'
variable=driver.variables.new();variable.name='breathing';variable.type='SINGLE_PROP'
variable.targets[0].id_type='KEY';variable.targets[0].id=body.data.shape_keys;variable.targets[0].data_path='key_blocks["breathing"].value'
proxy.modifiers.new('Animated body contact','COLLISION');proxy.collision.thickness_outer=.003
proxy.hide_render=True
previous=[]
for obj in garments:
    colliders=obj.modifiers['Estimated offline fabric'].collision_settings.collection
    colliders.objects.link(proxy)
    for inner in previous:colliders.objects.link(inner)
    obj.modifiers['Estimated offline fabric'].collision_settings.collection=colliders
    previous.append(obj)
samples={obj.name:[] for obj in garments}
rest_edges={obj.name:[(e.vertices[0],e.vertices[1],(obj.data.vertices[e.vertices[0]].co-obj.data.vertices[e.vertices[1]].co).length) for e in obj.data.edges if (obj.data.vertices[e.vertices[0]].co-obj.data.vertices[e.vertices[1]].co).length>.005] for obj in garments}
strain_samples={obj.name:[] for obj in garments}
bone_names={bone.name for bone in rig.data.bones}
weights={obj.name:[[(obj.vertex_groups[g.group].name,g.weight) for g in v.groups if obj.vertex_groups[g.group].name in bone_names] for v in obj.data.vertices] for obj in garments}
feet=[]
out=STAGE/f'case-{case}';out.mkdir(exist_ok=True)
source_hashes={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in {'human':STAGE/'human.blend','garments':STAGE/'panels.blend'}.items()}
if '--from-cache' in arguments:
    prior=json.loads((out/'cache.json').read_text())
    if prior['sourceHashes']!=source_hashes:raise RuntimeError('Cloth cache source versions are stale')
    if prior['fabric']!=profile_report:raise RuntimeError('Cloth cache coefficients are stale')
    if prior['cacheSha256']!=hashlib.sha256((out/'cloth-residuals.npz').read_bytes()).hexdigest():raise RuntimeError('Cloth cache data is incomplete')
    cache=np.load(out/'cloth-residuals.npz');samples={name:[[Vector(p) for p in frame] for frame in cache[name]] for name in samples}
    feet=prior['feetSamples'];strain_samples=prior['strainSamples']
else:(out/'source-hashes.json').write_text(json.dumps(source_hashes))
for frame in ([] if '--from-cache' in arguments else range(PREROLL,END*2+1)):
    scene.frame_set(frame);bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    # Evaluating every frame, not just sample frames, is required by cloth.
    current={}
    for obj in garments:
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
        if frame>=END and (frame-END)%STEP==0:current[obj.name]=[v.co.copy() for v in mesh.vertices]
        evaluated.to_mesh_clear()
    if current:
        matrices={name:rig.matrix_world@rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()@rig.matrix_world.inverted() for name in bone_names}
        for obj in garments:
            residual=[]
            stretch=[(current[obj.name][a]-current[obj.name][b]).length/length for a,b,length in rest_edges[obj.name]]
            strain_samples[obj.name].append({'frame':frame-END,'p95StretchRatio':float(np.quantile(stretch,.95)),'maxStretchRatio':max(stretch)})
            for p,influences in zip(current[obj.name],weights[obj.name]):
                total=sum(w for _,w in influences)
                skin=Matrix(tuple(tuple(sum(matrices[name][row][col]*w/total for name,w in influences) for col in range(4)) for row in range(4))) if total else Matrix.Identity(4)
                residual.append(skin.inverted_safe()@p)
            samples[obj.name].append(residual)
        feet.append({side:list(rig.matrix_world@rig.pose.bones['foot_'+side].head) for side in ['l','r']})
    if frame%48==0:print('CLOTH_PROGRESS',case,frame,round(time.monotonic()-started,1),flush=True)
    if '--diagnose' in arguments and frame in [PREROLL,PREROLL+1,-24,0,24,48,96,144]:
        for obj in [proxy]+garments:
            evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh();points=[obj.matrix_world@v.co for v in mesh.vertices]
            print('BOUNDS',frame,obj.name,[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)],flush=True);evaluated.to_mesh_clear()
        if frame==144:raise SystemExit(0)

np.savez_compressed(out/'cloth-residuals.npz',**{name:np.asarray([[[p.x,p.y,p.z] for p in positions] for positions in frames],dtype=np.float32) for name,frames in samples.items()})
(out/'cache.json').write_text(json.dumps({'sourceHashes':source_hashes,'fabric':profile_report,'feetSamples':feet,'strainSamples':strain_samples,
    'cacheSha256':hashlib.sha256((out/'cloth-residuals.npz').read_bytes()).hexdigest()}))
loop_errors={};bind_loop_errors={}
scene.frame_set(0);bpy.context.view_layer.update()
loop_matrices={name:rig.matrix_world@rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()@rig.matrix_world.inverted() for name in bone_names}
for obj in garments:
    frames=samples[obj.name];first,last=frames[0],frames[-1]
    bind_loop_errors[obj.name]=max((a-b).length for a,b in zip(first,last))
    # Inverse skinning can magnify a residual around blended joints. Review
    # visible seam displacement in posed metres, not that coordinate space.
    distances=[]
    for a,b,influences in zip(first,last,weights[obj.name]):
        total=sum(w for _,w in influences)
        delta=sum(((loop_matrices[n]@a-loop_matrices[n]@b)*w/total for n,w in influences),Vector()) if total else a-b
        distances.append(delta.length)
    loop_errors[obj.name]=max(distances)
    # Close only a small residual after the second simulated cycle. Large
    # residuals block publication rather than hiding a settling failure.
    if loop_errors[obj.name]<=.03:
        for index in range(len(frames)-4,len(frames)):
            t=(index-(len(frames)-5))/4;t=t*t*(3-2*t)
            for i in range(len(first)):frames[index][i]=frames[index][i].lerp(first[i],t)
    for modifier in list(obj.modifiers):
        if modifier.type in ['CLOTH','COLLISION']:obj.modifiers.remove(modifier)
    frames=add_surface_details(obj,frames,rig);first=frames[0]
    for vertex,p in zip(obj.data.vertices,first):vertex.co=p
    obj.shape_key_add(name='Basis')
    for index,positions in enumerate(frames[1:],1):
        key=obj.shape_key_add(name=f'cloth_frame_{index*STEP:03d}')
        for vertex,p in zip(key.data,positions):vertex.co=p
        keyframes={0:0,max(0,index*STEP-STEP):0,index*STEP:1}
        if index*STEP<END:keyframes[index*STEP+STEP]=0;keyframes[END]=0
        for frame,value in sorted(keyframes.items()):
            key.value=value;key.keyframe_insert('value',frame=frame)
    for slot in obj.data.shape_keys.animation_data.action.slots:
        pass
    # All cache weights interpolate linearly between adjacent solved samples.
    for layer in obj.data.shape_keys.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:point.interpolation='LINEAR'
    obj.data.shape_keys.animation_data.action.name='FORM_Cloth_Bake'
    thickness=obj.modifiers.new('Draft fabric thickness','SOLIDIFY');thickness.thickness=.0012
    apply_static_modifiers_with_shapes(obj)
    for polygon in obj.data.polygons:polygon.use_smooth=True

scene.frame_start=0;scene.frame_end=END;scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,rig,body]+[obj for obj in bpy.data.objects if obj.name.startswith('body:') and obj!=body]+garments:
    obj.select_set(True)
if not any(p in names for p in IDS[2:4]):bpy.data.objects['underlayer:neutral'].select_set(True)
out=STAGE/f'case-{case}';out.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'source.blend'))
asset=export_glb(out/'outfit.glb')
asset.update({'case':case,'productIds':names,'bodyMotionVersion':2,'facialAnimationVersion':1,'clothBakeVersion':1,
    'avatarVersion':3,'rigVersion':2,'clipDurationSeconds':12,'solver':'Blender cloth, estimated coefficients',
    'simulationFrames':[PREROLL,END*2],'simulationFps':FPS,'bakeStepFrames':STEP,'loopResidualBeforeBlendM':loop_errors,'loopResidualInBindSpaceM':bind_loop_errors,
    'loopApproved':max(loop_errors.values())<=.03,
    'strainSamples':strain_samples,'sourceHashes':source_hashes,
    'fabric':profile_report,'feetSamples':feet,'visualReviewPassed':False,'physicalFitValidated':False,'elapsedSeconds':time.monotonic()-started})
(out/'report.json').write_text(json.dumps(asset,indent=2)+'\n')
print('CLOTH_COMPLETE',case,asset['bytes'],flush=True)
