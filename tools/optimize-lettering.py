from pathlib import Path
exec(compile(Path(__file__).with_name('build-art.py').read_text().split("arg=sys.argv")[0],str(Path(__file__).with_name('build-art.py')),'exec'))
bpy.ops.wm.open_mainfile(filepath=str(R/'art/source/cemetery.blend'))
for key,label in [('stone','Weathered limestone'),('ground','Moss in cobblestone joints'),('earth','Gravel and wet earth')]:M[key]=bpy.data.materials.get(label)
for o in bpy.context.scene.objects:
 if o.type=='FONT':o.data.resolution_u=2;o.data.bevel_depth=0;o.data.extrude=0
uv_and_export('cemetery')
