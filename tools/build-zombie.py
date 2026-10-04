import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'art/source/zombie'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(SRC/'InfectedCityMan.fbx'))
for o in list(bpy.data.objects):
 if o.type not in {'MESH','ARMATURE'}: bpy.data.objects.remove(o,do_unlink=True)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE'); rig.name='Revenant_Rig'
mesh=next(o for o in bpy.data.objects if o.type=='MESH'); mesh.name='Revenant'
print('BOUND',[(tuple(mesh.matrix_world@Vector(c))) for c in mesh.bound_box]); print('RIG',rig.rotation_euler[:],rig.scale[:])
for mat in mesh.data.materials:
 mat.use_nodes=True; nodes=mat.node_tree.nodes; nodes.clear(); out=nodes.new('ShaderNodeOutputMaterial'); bs=nodes.new('ShaderNodeBsdfPrincipled'); mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
 prefix='InfectedCityMan_'+mat.name
 for suffix,socket in [('BaseColor','Base Color'),('Normal','Normal'),('OcclusionRoughnessMetallic','Roughness')]:
  path=SRC/(prefix+'_'+suffix+'.png')
  if not path.exists():continue
  tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(path),check_existing=True)
  if suffix=='BaseColor':mat.node_tree.links.new(tex.outputs['Color'],bs.inputs[socket])
  elif suffix=='Normal':
   tex.image.colorspace_settings.name='Non-Color'; normal=nodes.new('ShaderNodeNormalMap'); mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']); mat.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
  else:
   tex.image.colorspace_settings.name='Non-Color'; sep=nodes.new('ShaderNodeSeparateColor'); mat.node_tree.links.new(tex.outputs['Color'],sep.inputs['Color']); mat.node_tree.links.new(sep.outputs['Green'],bs.inputs['Roughness'])
 bs.inputs['Specular IOR Level'].default_value=.28
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
rig.animation_data_clear(); rig.animation_data_create()
clips=[]
for label,file in [('walk','Zombie Walk'),('run','Zombie Running'),('idle','Zombie Idle'),('attack','Zombie Attack'),('hit','Zombie Reaction Hit'),('death','Zombie Dying')]:
 before=set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=str(SRC/(file+'.fbx')))
 newrig=next(o for o in set(bpy.data.objects)-before if o.type=='ARMATURE')
 source_action=newrig.animation_data.action; end=int(source_action.frame_range[1])
 # FBX clips carry a different rest pose. Retarget evaluated world-space bones,
 # then bake to this character's own bind pose; renaming curves alone is insufficient.
 names={b.name.split(':')[-1]:b.name for b in newrig.pose.bones}
 for bone in rig.pose.bones:
  bone.matrix_basis.identity()
  if bone.name.split(':')[-1] in names:
   c=bone.constraints.new('COPY_TRANSFORMS');c.target=newrig;c.subtarget=names[bone.name.split(':')[-1]];c.owner_space='WORLD';c.target_space='WORLD'
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.nla.bake(frame_start=1,frame_end=end,step=1,only_selected=False,visual_keying=True,clear_constraints=True,clear_parents=False,use_current_action=False,bake_types={'POSE'})
 act=rig.animation_data.action;act.name=label;act.use_fake_user=True
 for fc in act.fcurves:
  if fc.data_path.endswith('location') and ('Hips' in fc.data_path or 'root' in fc.data_path) and fc.array_index in (0,2):
   val=fc.keyframe_points[min(4,len(fc.keyframe_points)-1)].co.y
   for key in fc.keyframe_points:key.co.y=val;key.handle_left.y=val;key.handle_right.y=val
 clips.append((label,act));rig.animation_data.action=None
 for o in set(bpy.data.objects)-before:bpy.data.objects.remove(o,do_unlink=True)
 if source_action.users==0:bpy.data.actions.remove(source_action)
for label,act in clips:
 track=rig.animation_data.nla_tracks.new();track.name=label;track.strips.new(label,1,act);track.mute=True
rig.animation_data.action=None
# Export each NLA track as a named clip, without duplicate armatures.
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.nla_tracks[0].mute=False
bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
print('POSEBOUND',[(tuple(mesh.matrix_world@Vector(c))) for c in mesh.bound_box])
for p in mesh.data.polygons:p.use_smooth=True
bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/source/revenant.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/revenant.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_materials='EXPORT',export_yup=True)
