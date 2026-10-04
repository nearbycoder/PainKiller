import bpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
for i in range(5):
 bpy.ops.wm.open_mainfile(filepath=str(R/f'art/source/weapon-{i}.blend'))
 for o in bpy.context.scene.objects:
  if o.type=='LIGHT':
   if o.location.length>4:o.location*=.1
   o.rotation_euler=(Vector((0,.3,0))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.context.scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
 bpy.ops.wm.save_as_mainfile(filepath=str(R/f'art/source/weapon-{i}.blend'))
 bpy.context.scene.render.filepath=str(R/f'art/renders/weapon-{i}.png');bpy.ops.render.render(write_still=True)
