"""Blender rest-mesh intersection gate, after sewing coincident seam vertices."""
import bpy,bmesh,json
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
from pathlib import Path
stage=Path(__file__).resolve().parents[1]/'.avatar-source/lifelike'
bpy.ops.wm.open_mainfile(filepath=str(stage/'panels.blend'))
reports=[]
for o in bpy.data.objects:
 if not o.name.startswith('garment:'):continue
 m=o.data;bm=bmesh.new();bm.from_mesh(m);isolated=[f for f in bm.faces if all(len(e.link_faces)==1 for e in f.edges)];bmesh.ops.delete(bm,geom=isolated,context='FACES');bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(m);bm.free();m.calc_loop_triangles();p=[v.co for v in m.vertices];t=[tuple(f.vertices) for f in m.loop_triangles];tree=BVHTree.FromPolygons(p,t,all_triangles=True);hits=[]
 for a,b in tree.overlap(tree):
  if a>=b or set(t[a])&set(t[b]):continue
  actual=False
  for source,target in [(t[a],t[b]),(t[b],t[a])]:
   for j in range(3):
    start,end=p[source[j]],p[source[(j+1)%3]];delta=end-start
    point=intersect_ray_tri(*[p[k] for k in target],delta,start,True)
    if point is not None and 1e-5<(point-start).dot(delta.normalized())<delta.length-1e-5:actual=True
  if actual:hits.append((a,b))
 print('INTERSECTIONS',o.name,len(hits),hits[:12],flush=True)
 reports.append({'garment':o.name,'intersections':len(hits),'triangleCount':len(t),'test':'Nonadjacent triangle edge intersections after seam welding; coplanar overlap is not exhaustively covered.'})
(stage/'panel-check.json').write_text(json.dumps(reports,indent=2)+'\n')
if any(r['intersections'] for r in reports):raise RuntimeError('Intersecting garment panels block cloth authoring')


