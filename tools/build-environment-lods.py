"""Export lighter environment meshes without changing packed, editable art masters."""
import bpy
from pathlib import Path
R=Path(__file__).resolve().parents[1]
for name in ['cemetery','cathedral','crypt','factory']:
    bpy.ops.wm.open_mainfile(filepath=str(R/f'art/source/{name}.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(bpy.context.scene.objects):
        if o.type in {'CURVE','FONT'}:
            bpy.context.view_layer.objects.active=o;o.select_set(True)
            bpy.ops.object.convert(target='MESH');o.select_set(False)
    seen=set()
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH' or o.data.name in seen:continue
        seen.add(o.data.name)
        mats=' '.join(m.name for m in o.data.materials if m)
        ratio=1
        for term,r in [('grass_medium',.2),('rock_moss',.18),('dead_tree_trunk',.25),('Fissured oak',.45),('gothic_statue',.4)]:
            if term in mats:ratio=min(ratio,r)
        if ratio==1:continue
        # Shared instances retain one reduced mesh; every instance still exports.
        shared=[p for p in bpy.context.scene.objects if p.type=='MESH' and p.data==o.data]
        bpy.context.view_layer.objects.active=o
        o.data=o.data.copy()
        dec=o.modifiers.new('Runtime scanned-detail budget','DECIMATE');dec.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=dec.name)
        for p in shared:p.data=o.data
        seen.add(o.data.name)
    bpy.ops.export_scene.gltf(filepath=str(R/f'public/assets/models/{name}.glb'),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
