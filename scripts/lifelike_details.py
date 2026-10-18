"""Estimated sewn details bound to the actual cloth surface, not floating quads."""
import bpy,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def add_surface_details(obj,frames,rig):
    old=obj.data;old.calc_loop_triangles()
    triangles=[tuple(t.vertices) for t in old.loop_triangles]
    bone_names=set(rig.data.bones.keys())
    influences=[[(obj.vertex_groups[g.group].name,g.weight) for g in v.groups if obj.vertex_groups[g.group].name in bone_names and g.weight>0] for v in old.vertices]
    # Bind details on the physically settled surface at the relaxed frame.
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    matrices={n:rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in bone_names}
    reference=[]
    for point,weights in zip(frames[0],influences):
        total=sum(w for _,w in weights)
        reference.append(sum((matrices[n]@point*w/total for n,w in weights),Vector()) if total else point.copy())
    bvh=BVHTree.FromPolygons(reference,triangles,all_triangles=True)
    faces=[list(p.vertices) for p in old.polygons];material_ids=[p.material_index for p in old.polygons]
    attachments=[];new_faces=[];new_materials=[]
    def attach(point,offset=.0012):
        point=Vector(point)
        hit,normal,index,distance=bvh.ray_cast(Vector((point.x,-1,point.z)),Vector((0,1,0)))
        if hit is None:hit,normal,index,distance=bvh.find_nearest(point)
        a,b,c=triangles[index]
        weights=barycentric_transform(hit,reference[a],reference[b],reference[c],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
        attachments.append(([a,b,c],list(weights),offset))
        return len(old.vertices)+len(attachments)-1
    def patch(x0,x1,z0,z1,material=1):
        grid=[]
        for row in range(5):
            grid.append([attach((x0+(x1-x0)*col/4,-.2,z0+(z1-z0)*row/4),.0015) for col in range(5)])
        for row in range(4):
            for col in range(4):new_faces.append([grid[row][col],grid[row][col+1],grid[row+1][col+1],grid[row+1][col]]);new_materials.append(material)
    # A narrow binding follows the true boundary of the solved neck opening.
    edges={}
    for face in faces:
        for i,a in enumerate(face):
            key=tuple(sorted((a,face[(i+1)%len(face)])));edges.setdefault(key,[]).append(face)
    bottom='482880' in obj.name;outer='482452' in obj.name
    for (a,b),adjacent in edges.items():
        if len(adjacent)!=1:continue
        pa,pb=reference[a],reference[b]
        if not ((bottom and min(pa.z,pb.z)>1.015) or (not bottom and min(pa.z,pb.z)>1.36 and max(abs(pa.x),abs(pb.x))<.13)):continue
        face=adjacent[0];centroid=sum((reference[i] for i in face),Vector())/len(face)
        mid=(pa+pb)/2;fraction=min(.65,.012/max((centroid-mid).length,.001))
        ids=[]
        for index,inside in [(a,False),(b,False),(b,True),(a,True)]:
            coefficients=[(1-fraction if inside else 1) if i==index else 0 for i in face]
            if inside:coefficients=[w+fraction/len(face) for w in coefficients]
            attachments.append((face,coefficients,.001));ids.append(len(old.vertices)+len(attachments)-1)
        new_faces.append(ids);new_materials.append(1)
    if outer:
        for sign in [-1,1]:
            patch(sign*.07,sign*.145,1.17,1.265)
            # Folded collar patches retain corners rather than subdividing
            # isolated quads into the circular blobs in the old draft.
            corners=[(sign*.032,-.1,1.445),(sign*.10,-.08,1.45),(sign*.125,-.15,1.40),(sign*.065,-.17,1.365)]
            new_faces.append([attach(p,offset) for p,offset in zip(corners,[.002,.003,.014,.009])]);new_materials.append(1)
            patch(sign*.021,sign*.036,.765,1.36)
        for z in [1.30,1.215,1.13,1.045,.96,.875]:
            center=attach((.029,-.2,z),.003)
            ring=[attach((.029+.003*math.cos(j*math.tau/8),-.2,z+.003*math.sin(j*math.tau/8)),.003) for j in range(8)]
            for j in range(8):new_faces.append([center,ring[j],ring[(j+1)%8]]);new_materials.append(2)
    elif bottom:
        for sign in [-1,1]:
            # Short vertical belt loops; pockets are represented by stitched
            # surface strips, with their exact pattern still estimated.
            patch(sign*.075,sign*.082,.999,1.036)
    if not attachments:return frames
    extended=[]
    for positions in frames:
        values=[p.copy() for p in positions]
        for indices,weights,offset in attachments:
            point=sum((positions[i]*w for i,w in zip(indices,weights)),Vector())
            normal=(positions[indices[1]]-positions[indices[0]]).cross(positions[indices[2]]-positions[indices[0]]).normalized()
            values.append(point+normal*offset)
        extended.append(values)
    mesh=bpy.data.meshes.new(obj.name+':sewn-details');mesh.from_pydata(extended[0],[],faces+new_faces);mesh.update()
    for material in old.materials:mesh.materials.append(material)
    base=old.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:]
    binding=old.materials[0].copy();binding.name=obj.name+':binding'
    binding.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=tuple(c*.86 for c in base[:3])+(1,)
    button=binding.copy();button.name=obj.name+':buttons';button.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.045,.055,.06,1)
    mesh.materials.append(binding);mesh.materials.append(button)
    obj.data=mesh
    for i,(indices,weights,_) in enumerate(attachments,len(old.vertices)):
        combined={}
        for index,fraction in zip(indices,weights):
            for name,weight in influences[index]:combined[name]=combined.get(name,0)+weight*fraction
        kept=sorted(combined.items(),key=lambda pair:pair[1],reverse=True)[:4];total=sum(w for _,w in kept)
        influences.append([(name,weight/total) for name,weight in kept])
    # A new mesh has no deform layer. Recreate all weights explicitly.
    for name in {name for weights in influences for name, _ in weights}:
        if name not in obj.vertex_groups:obj.vertex_groups.new(name=name)
    for index,weights in enumerate(influences):
        for name,weight in weights:obj.vertex_groups[name].add([index],weight,'REPLACE')
    for polygon,material in zip(mesh.polygons,material_ids+new_materials):polygon.material_index=material;polygon.use_smooth=True
    uv=mesh.uv_layers.new(name='fabric-grain')
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:
            p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p.x*20,p.z*20)
    # Small, deterministic tangent-space weave, explicitly an appearance draft.
    image=bpy.data.images.get('estimated-woven-normal')
    if not image:
        image=bpy.data.images.new('estimated-woven-normal',width=256,height=256)
        pixels=[]
        for y in range(256):
            for x in range(256):pixels.extend((.5+.045*math.sin(x*math.tau/4),.5+.045*math.sin(y*math.tau/4),.998,1))
        image.pixels.foreach_set(pixels);image.colorspace_settings.name='Non-Color';image.pack()
    for material in [mesh.materials[0],binding]:
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value=.80 if bottom or outer else .74
        texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
        normal=material.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.25
        material.node_tree.links.new(texture.outputs['Color'],normal.inputs['Color']);material.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    return extended
