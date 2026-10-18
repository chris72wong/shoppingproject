"""Render candidate review frames/loop from Blender, without publishing assets."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from lifelike_common import STAGE
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
source=next((Path(arg) for arg in args if not arg.startswith('--')),STAGE/'human.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.45,.45,.45)
def aim(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-3.4,1.02));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.95;aim(camera,(0,0,.88));scene.camera=camera
for position,power,size in [((-2,-3,4),220,3),((2,-2,2),100,3),((1,2,3),180,2)]:
    bpy.ops.object.light_add(type='AREA',location=position);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,(0,0,1))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));floor=bpy.context.object
mat=bpy.data.materials.new('review floor');mat.diffuse_color=(.72,.72,.70,1);floor.data.materials.append(mat)
scene.view_settings.view_transform='AgX'
out=source.parent/'review';out.mkdir(exist_ok=True)
if '--views' in args:
    scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=16
    scene.render.resolution_x=480;scene.render.resolution_y=640
    for name,position in [('front',(0,-3.4,1.02)),('side',(3.4,0,1.02)),('back',(0,3.4,1.02))]:
        camera.location=position;aim(camera,(0,0,.88))
        for second in [0,3,6,9,12]:
            scene.frame_set(second*scene.render.fps)
            scene.render.filepath=str(out/(name+'-'+str(second)+'.png'));bpy.ops.render.render(write_still=True)
    raise SystemExit(0)
if '--movie' in args:
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples=8
    scene.render.resolution_x=480;scene.render.resolution_y=640
    # Render twelve seconds at 12 FPS, retaining the authored timing.
    factor=12/scene.render.fps
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.co.x*=factor;key.handle_left.x*=factor;key.handle_right.x*=factor
    scene.render.fps=12;scene.frame_start=0;scene.frame_end=143
    if '--face' in args:
        camera.location=(0,-1.5,1.62);camera.data.ortho_scale=.37;aim(camera,(0,-.02,1.61))
    elif '--side' in args:camera.location=(3.4,0,1.02);aim(camera,(0,0,.88))
    elif '--back' in args:camera.location=(0,3.4,1.02);aim(camera,(0,0,.88))
    scene.render.image_settings.file_format='FFMPEG';scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264'
    name='face' if '--face' in args else 'side' if '--side' in args else 'back' if '--back' in args else 'front'
    scene.render.filepath=str(out/(name+'-loop.mp4'))
    bpy.ops.render.render(animation=True)
    raise SystemExit(0)
for name,frame,position,scale,target in [('body-front',0,(0,-3.4,1.02),1.95,(0,0,.88)),('face-open',0,(0,-1.5,1.62),.37,(0,-.02,1.61)),('face-blink',round(2.25*scene.render.fps),(0,-1.5,1.62),.37,(0,-.02,1.61))]:
    camera.location=position;camera.data.ortho_scale=scale;aim(camera,target);scene.frame_set(frame)
    scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
