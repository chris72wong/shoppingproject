"""Author fixed-size product-specific drafts, not verified patterns or cloth simulation.

Published dimensions are targets; unresolved pattern geometry is explicitly estimated.
Use the sample-human.blend from build-sample-human.py. No runtime fitting/scaling.
"""
import bpy, bmesh, json, math, hashlib, struct, sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.avatar-source'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'sample-human.blend'))
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
body = bpy.data.objects['body:sample']
rig = bpy.data.objects['FORM_sample_rig_v1']
root = bpy.data.objects['sample-body-meters']
inverse = root.matrix_world.inverted()
group = body.vertex_groups['body']
ids = {v.index for v in body.data.vertices if any(g.group == group.index and g.weight > .5 for g in v.groups)}
kd = KDTree(len(ids))
for i in ids: kd.insert(body.matrix_world @ body.data.vertices[i].co, i)
kd.balance()
deps = bpy.context.evaluated_depsgraph_get()
evaluated = body.evaluated_get(deps)
geo = evaluated.to_mesh()
bvh = BVHTree.FromPolygons([body.matrix_world @ v.co for v in geo.vertices], [list(p.vertices) for p in geo.polygons])
evaluated.to_mesh_clear()

research = json.loads((ROOT / 'docs/animated-capsule-research.json').read_text())['products']
specs = [
    ('uq-489929-white', 'top', (0.91, .90, .86), 'M', 0),
    ('uq-493232-black', 'top', (.025, .028, .032), 'M', 1),
    ('uq-482880-navy', 'bottom', (.025, .045, .085), '32inch / 79 cm inseam', 2),
    ('uq-482880-olive', 'bottom', (.19, .22, .12), '32inch / 79 cm inseam', 3),
    ('uq-482452-blue', 'outerwear', (.19, .32, .45), 'M', 4),
]
garments = {}
reports = {}

def ellipse_b(a, perimeter):
    lo, hi = .001, perimeter / 2
    for _ in range(50):
        b = (lo + hi) / 2
        c = math.pi * (3*(a+b) - math.sqrt((3*a+b)*(a+3*b)))
        if c > perimeter: hi = b
        else: lo = b
    return (lo+hi)/2

def make_mesh(name, points, faces, color, category, material=None):
    # Minimum body clearance at authored rest pose. This is a vertex check,
    # not a proof of triangle or full-animation collision freedom.
    corrected = 0
    for i, p in enumerate(points):
        p = Vector(p)
        hit, normal, _, distance = bvh.find_nearest(p)
        if hit and (p-hit).dot(normal) < .006:
            p = hit + normal * .006
            corrected += 1
        points[i] = inverse @ p
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh);bm.free()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj.parent = root
    for g in body.vertex_groups: obj.vertex_groups.new(name=g.name)
    for v in mesh.vertices:
        _, old, _ = kd.find(root.matrix_world @ v.co)
        for g in body.data.vertices[old].groups: obj.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
    obj.modifiers.new('Shared garment skeleton', 'ARMATURE').object = rig
    if material is None:
        material = bpy.data.materials.new(name + ':fabric'); material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = .88
        shader.inputs['Sheen Weight'].default_value = .18
        # Fine weave changes shading only; no invented product print/branding.
        noise = material.node_tree.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 220
        bump = material.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .12; bump.inputs['Distance'].default_value = .0003
        material.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        material.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    mesh.materials.append(material)
    for p in mesh.polygons: p.use_smooth = True
    solid = obj.modifiers.new('Draft fabric thickness 1 mm', 'SOLIDIFY'); solid.thickness = .001 / root.scale.x
    reports[name] = {'restPoseVerticesMovedForBodyClearance': corrected, 'vertexCount': len(points),
        'geometryStatus': 'estimated construction; no cloth simulation or sample verification', 'physicalFitValidated': False}
    return obj

def shirt(name, color, length, shoulder, chest, sleeve_cb, outer=False):
    columns, rows = 32, 20
    shoulder_z, hem = 1.465 + (.008 if outer else 0), 1.465 + (.008 if outer else 0) - length
    armpit_row = 14
    points, faces = [], []
    # Two sewn curved panels, open at neck and armholes. All values in metres.
    for side in [-1, 1]:
        for r in range(rows+1):
            v = r/rows
            a = .225 + (shoulder/2 - .225) * max(0, (v-.7)/.3)
            if outer: a += .012 * (1-v)
            b = ellipse_b(.225 if not outer else .237, chest*2)
            # Unpublished hem sweep is estimated: leave room over the trousers
            # instead of allowing their hip surface to cut through the shirt.
            b += .050 * max(0, 1-v/.60)
            for c in range(columns+1):
                t = -math.pi/2 + math.pi*c/columns
                x = a*math.sin(t)
                # Rounded crew neck; open placket/collar on the overshirt.
                neck = max(0, 1-(abs(x)/.10)**2)
                ztop = shoulder_z - neck*(.075 if side == -1 else .025)
                z = hem + v*(ztop-hem)
                y = side*(b*math.cos(t) + .055*max(0,(v-.7)/.3)*abs(math.sin(t))**8)
                # Small fixed folds, not runtime cloth physics.
                y += side*.003*math.sin(c*.8+r*.55)*(1-v)**2
                points.append((x,y,z))
    stride = columns+1; panel = stride*(rows+1)
    ix = lambda side,r,c: side*panel+r*stride+c
    for side in range(2):
        for r in range(rows):
            for c in range(columns):
                f = [ix(side,r,c),ix(side,r,c+1),ix(side,r+1,c+1),ix(side,r+1,c)]
                if not (outer and side==0 and c in [columns//2-1,columns//2]):
                    faces.append(f if side == 0 else f[::-1])
    for r in range(armpit_row):
        for c in [0, columns]: faces.append([ix(0,r,c),ix(1,r,c),ix(1,r+1,c),ix(0,r+1,c)])
    for c in range(columns):
        if abs(points[ix(0,rows,c)][0]) > .10 and abs(points[ix(0,rows,c+1)][0]) > .10:
            faces.append([ix(0,rows,c),ix(0,rows,c+1),ix(1,rows,c+1),ix(1,rows,c)])
    # Loft sleeves from each panel armhole boundary. Center-back sleeve length
    # constrains the target; exact armscye/cuff pattern remains estimated.
    for sign,c in [(-1,0),(1,columns)]:
        loop = [ix(0,r,c) for r in range(armpit_row,rows+1)] + [ix(1,r,c) for r in range(rows,armpit_row-1,-1)]
        start = sum((Vector(points[i]) for i in loop), Vector())/len(loop)
        arm = rig.data.bones['upperarm_l' if sign>0 else 'upperarm_r']
        elbow = rig.matrix_world @ arm.tail_local
        if outer:
            hand = rig.matrix_world @ rig.data.bones['lowerarm_l' if sign>0 else 'lowerarm_r'].tail_local
            end = hand + Vector((sign*.01, .01, .025))
        else:
            direction = (elbow-start).normalized()
            end = start + direction*(sleeve_cb-shoulder/2)
        tangent = (end-start).normalized(); across = Vector((0,-1,0))
        up = (Vector((0,0,1))-tangent*tangent.z).normalized()
        previous = loop
        for step in range(1,9):
            fraction=step/8; center=start.lerp(end,fraction)
            ring=[]
            for j,index in enumerate(loop):
                # Start from real armhole boundary; progressively form a cuff.
                p0=Vector(points[index]); angle=2*math.pi*j/len(loop) - math.pi/2
                radius = (.060 if outer else (.091 if chest>.58 else .082))
                target=center + across*math.cos(angle)*radius + up*math.sin(angle)*radius
                pos=(p0+(end-start)*fraction).lerp(target,fraction)
                ring.append(len(points)); points.append(tuple(pos))
            for j in range(len(loop)): faces.append([previous[j],previous[(j+1)%len(loop)],ring[(j+1)%len(loop)],ring[j]])
            previous=ring
    if outer:
        # Draft chest pockets and folded collar; these details are estimated,
        # explicitly not a reproduction of an unmeasured sewing pattern.
        front=-ellipse_b(.237,chest*2)-.004
        for sign in [-1,1]:
            k=len(points); x=sign*.105
            points.extend([(x-.038,front,1.19),(x+.038,front,1.19),(x+.038,front,1.285),(x-.038,front,1.285)])
            faces.append([k,k+1,k+2,k+3])
            k=len(points)
            points.extend([(sign*.035,-.095,1.46),(sign*.105,-.07,1.46),(sign*.13,-.15,1.40),(sign*.07,-.18,1.36)])
            faces.append([k,k+1,k+2,k+3])
    obj=make_mesh('garment:'+name,points,faces,color,'outerwear' if outer else 'top')
    smooth=obj.modifiers.new('Soften draft panel transitions','SUBSURF');smooth.levels=smooth.render_levels=1
    return obj

def pants(name,color):
    # Continuous waistband/hip surface splits into two leg tubes at one shared
    # crotch vertex. Do not deform the body's anatomical topology into pants.
    n=64; points=[]; faces=[]
    for row in range(6):
        f=row/5; z=1.04-.16*f; a=.153+(.184-.153)*f; b=ellipse_b(a,.86+(1.05-.86)*f)
        for j in range(n):
            angle=-math.pi/2+2*math.pi*j/n
            points.append((a*math.cos(angle),b*math.sin(angle),z))
    for row in range(5):
        for j in range(n): faces.append([row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j])
    crotch=len(points);points.append((0,-.005,.85))
    for sign,outer_indices in [(1,list(range(33))),(-1,list(range(32,64))+[0])]:
        previous=[5*n+j for j in outer_indices]+[crotch]
        angles=[]; last=-100
        for index in previous:
            x,y,z=points[index]; angle=math.atan2(y+.005,x-sign*.115)
            while angle < last: angle+=math.tau
            angles.append(angle);last=angle
        for row in range(1,24):
            t=row/23; z=.85-.79*t; center=sign*(.118+.083*t)
            a=.109-(.109-.071)*t; b=ellipse_b(a,.69-(.69-.43)*t)
            current=[]
            for angle in angles:
                current.append(len(points));points.append((center+a*math.cos(angle),-.02+b*math.sin(angle),z))
            for j in range(len(previous)): faces.append([previous[j],previous[(j+1)%len(previous)],current[(j+1)%len(current)],current[j]])
            previous=current
    obj=make_mesh('garment:'+name,points,faces,color,'bottom')
    smooth=obj.modifiers.new('Smooth draft leg seams','SUBSURF'); smooth.levels=smooth.render_levels=1
    return obj

for name,category,color,size,index in specs:
    if category=='bottom': obj=pants(name,color)
    else:
        d=research[index]['publishedCm']
        obj=shirt(name,color,d.get('backLength',d.get('length'))/100,d['shoulderSeamToSeam']/100,d['chestFlatWidth']/100,d['sleeveFromCenterBack']/100,category=='outerwear')
    garments[name]=obj

# Keep editable source and explicit estimates beside reproducible authoring code.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'draft-capsule.blend'))
outdir=ROOT/'public/models/capsule';outdir.mkdir(exist_ok=True)
base=[o for o in bpy.data.objects if o.name.startswith('body:') or o.name=='underlayer:neutral']
sets=[[s[0]] for s in specs]
for top in specs[:2]:
    for bottom in specs[2:4]:
        sets.extend([[top[0],bottom[0]],[top[0],bottom[0],specs[4][0]]])
combinations=[]
for number,names in enumerate(sets):
    path=outdir/f'draft-{number+1}.glb'
    if '--only-layered' in sys.argv and specs[4][0] not in names:
        combinations.append({'url':f'/models/capsule/{path.name}','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'productIds':names,
            'avatarVersion':2,'rigVersion':1,'idleCollisionChecked':False,'visualReviewPassed':False})
        continue
    # Standard garment occlusion masks prevent hidden skin triangles from
    # poking through draft surfaces. This is a visual technique, not fit proof.
    top_name=next((name for name in names if next(s[1] for s in specs if s[0]==name)=='top'),None)
    outer_present=specs[4][0] in names
    bottom_present=any(name in names for name in [specs[2][0],specs[3][0]])
    original_pants=[]
    original_tops=[]
    if top_name and outer_present:
        # The open placket reveals a strip of the complete underlying tee.
        # Omit its otherwise hidden surface to prevent layer poke-through.
        obj=garments[top_name]; original=obj.data;obj.data=original.copy();original_tops.append((obj,original))
        bm=bmesh.new();bm.from_mesh(obj.data)
        for sign in [-1,1]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,
                plane_co=inverse@Vector((sign*.052,0,0)),plane_no=Vector((sign,0,0)),clear_outer=True)
        bm.to_mesh(obj.data);bm.free()
    if (top_name or outer_present) and bottom_present:
        # Render-only occlusion: retain the complete editable trousers source,
        # but omit the waistband/hips hidden underneath an untucked top.
        hem=1.465-(.77 if outer_present else .72)
        for name in names:
            if name not in [specs[2][0],specs[3][0]]: continue
            obj=garments[name]; original=obj.data; obj.data=original.copy(); original_pants.append((obj,original))
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,
                plane_co=inverse@Vector((0,0,hem+.01)),plane_no=Vector((0,0,1)),clear_outer=True)
            bm.to_mesh(obj.data);bm.free()
    visible_group=body.vertex_groups.new(name='draft_visible_body')
    keep=[]
    for vertex in body.data.vertices:
        p=body.matrix_world@vertex.co; hidden=False
        if bottom_present and .075 < p.z < 1.035: hidden=True
        if top_name or outer_present:
            hem=1.465-(.77 if outer_present else .72)
            if hem+.01 < p.z < 1.46 and abs(p.x)<.235 and not (p.z>1.39 and abs(p.x)<.09): hidden=True
            for side in ['l','r']:
                bone=rig.data.bones['upperarm_'+side]
                start=rig.matrix_world@bone.head_local; end=rig.matrix_world@bone.tail_local
                axis=(end-start).normalized(); projection=(p-start).dot(axis)
                cuff=.30 if outer_present else (.235 if top_name==specs[1][0] else .195)
                if -.02<projection<cuff and (p-start-axis*projection).length<.105:hidden=True
                if outer_present:
                    lower=rig.data.bones['lowerarm_'+side]; start=rig.matrix_world@lower.head_local;end=rig.matrix_world@lower.tail_local
                    axis=(end-start).normalized();projection=(p-start).dot(axis)
                    if -.02<projection<(end-start).length-.025 and (p-start-axis*projection).length<.08:hidden=True
        if not hidden:keep.append(vertex.index)
    visible_group.add(keep,1,'REPLACE')
    mask=body.modifiers.new('Draft clothing body occlusion','MASK');mask.vertex_group=visible_group.name
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root,rig]+[obj for obj in base if not (bottom_present and obj.name=='underlayer:neutral')]+[garments[name] for name in names]: obj.select_set(True)
    path=outdir/f'draft-{number+1}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
        export_animations=True,export_animation_mode='ACTIONS',export_frame_range=True,export_force_sampling=True,
        export_frame_step=4,export_extras=False,export_image_format='JPEG',export_jpeg_quality=88)
    data=path.read_bytes(); size=struct.unpack_from('<I',data,12)[0]; doc=json.loads(data[20:20+size]); binary=data[28+size:]
    def clean(value):
        if isinstance(value,dict):
            for k in ['extensions','extensionsUsed','extensionsRequired']: value.pop(k,None)
            for v in value.values(): clean(v)
        elif isinstance(value,list):
            for v in value:clean(v)
    clean(doc)
    for material in doc.get('materials',[]):
        if any(word in material.get('name','').lower() for word in ['short02','eyebrow']): material['alphaMode']='MASK';material['alphaCutoff']=.45
        else:material.pop('alphaMode',None)
    doc['asset']['copyright']='MakeHuman CC0 body. FORM product-specific draft garment geometry. Estimated appearance; no verified physical fit.'
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
    data=struct.pack('<IIIII',0x46546c67,2,28+len(encoded)+len(binary),len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(data)
    body.modifiers.remove(mask);body.vertex_groups.remove(visible_group)
    for obj,original in original_pants+original_tops:
        temporary=obj.data;obj.data=original;bpy.data.meshes.remove(temporary)
    combinations.append({'url':f'/models/capsule/{path.name}','sha256':hashlib.sha256(data).hexdigest(),'productIds':names,
        'avatarVersion':2,'rigVersion':1,'idleCollisionChecked':False,'visualReviewPassed':False})
manifest={'schemaVersion':1,'status':'draft','reason':'Product-specific drafts authorized for visual preview. Missing pattern dimensions are estimated. No sample verification, cloth simulation, full-loop collision approval or personal fit validation.',
    'avatarVersion':2,'rigVersion':1,'idleClip':'FORM_Idle','products':[],'combinations':combinations}
for name,category,color,size,index in specs:
    source=research[index]
    manifest['products'].append({'productId':name,'sku':source['productId'],'variant':source['variant'],'region':'US','category':category,'size':size,
        'garmentVersion':1,'dimensionsVerified':False,'sourceUrls':[source['url']]})
(ROOT/'public/models/preview-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'public/models/capsule/draft-authoring-report.json').write_text(json.dumps({'schemaVersion':1,'status':'draft','targets':research,'geometry':reports,
    'limitations':['Rest-pose vertex clearance and render-only body/hidden-trouser occlusion masks; triangle and layered collisions unverified','Cuff, rise, crotch, hem sweep and panel shapes estimated','No offline cloth simulation','No physical samples or fit validation','No runtime garment scaling']},indent=2)+'\n')
print('DRAFT_CAPSULE_EXPORTED',len(combinations))
