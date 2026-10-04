import bpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'art/source/revenant.blend'))
s=bpy.context.scene;s.frame_set(45);s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=800;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.17,.20,.25,1);s.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
bpy.ops.object.camera_add(location=(2,-3,1.5));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=48;s.camera=cam
for p,col,power in [((1,-3,4),(1,.82,.64),250),((-2,0,3),(.55,.7,1),180)]:
 bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.color=col;o.data.size=3;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
s.render.filepath=str(R/'art/renders/revenant.png');bpy.ops.render.render(write_still=True)
