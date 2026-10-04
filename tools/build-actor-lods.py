"""Retain high-detail Blender masters; export reduced, weighted gameplay meshes."""
import bpy
from pathlib import Path
R=Path(__file__).resolve().parents[1]
for name,target in [('skeleton',16000),('revenant',15000)]:
    bpy.ops.wm.open_mainfile(filepath=str(R/f'art/source/{name}.blend'))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    total=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    for o in meshes:
        bpy.context.view_layer.objects.active=o
        dec=o.modifiers.new('Runtime silhouette budget','DECIMATE');dec.ratio=min(1,target/max(1,total))
        bpy.ops.object.modifier_move_to_index(modifier=dec.name,index=0)
        bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.export_scene.gltf(filepath=str(R/f'public/assets/models/{name}.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_yup=True)
