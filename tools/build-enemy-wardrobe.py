"""Editable bone-mounted garments and armor, shared by the existing animated rigs."""
import bpy, math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'art/source/revenant.blend'))
rig=bpy.data.objects['Revenant_Rig'];rig.data.pose_position='REST';rig.animation_data_clear()
for o in list(bpy.context.scene.objects):
 if o!=rig:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update()
materials={}
def material(name,color,metal,rough,texture):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 for suffix,socket in [('color','Base Color'),('normal','Normal'),('roughness','Roughness')]:
  p=R/f'public/assets/textures/{texture}/{suffix}.jpg'
  if not p.exists():continue
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(p),check_existing=True)
  if suffix!='color':n.image.colorspace_settings.name='Non-Color'
  if suffix=='color':
   mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*color,1);m.node_tree.links.new(n.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],b.inputs[socket])
  elif suffix=='normal':
   normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35;m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs[0],b.inputs[socket])
  else:m.node_tree.links.new(n.outputs['Color'],b.inputs[socket])
 materials[name]=m;return m
material('Soot wool',(.19,.22,.20),0,.95,'brown_leather')
material('Weathered armor',(.35,.39,.38),.8,.6,'rusty_metal')
material('Worn hide',(.28,.18,.12),0,.9,'brown_leather')
material('Oxidized trim',(.45,.31,.13),.7,.6,'rusty_metal')
# Use glTF-supported image colors (the tint is a factor, not an unsupported procedural shader).
for m in materials.values():
 nodes=m.node_tree.nodes;b=nodes.get('Principled BSDF');mix=next((n for n in nodes if n.type=='MIX_RGB'),None)
 if mix:
  source=mix.inputs[1].links[0].from_node;m.node_tree.links.new(source.outputs['Color'],b.inputs['Base Color']);nodes.remove(mix)
parts=[]
def attach(o,type,bone,mat):
 o.data.materials.append(materials[mat]);o['archetype']=type;o['bone']='CityDeadOutfit'+bone
 bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=True
 world=o.matrix_world.copy();o.parent=rig;o.parent_type='BONE';o.parent_bone='CityDeadOutfit:'+bone;bpy.context.view_layer.update();o.matrix_world=world
 parts.append(o)
 return o
def ell(name,p,scale,type,bone,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,radius=1,location=p);o=bpy.context.object;o.name=name;o.scale=scale;return attach(o,type,bone,mat)
def plate(name,p,size,type,bone,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=o.modifiers.new('Rounded forged edges','BEVEL');bevel.width=.012;bevel.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name);return attach(o,type,bone,mat)
def shell(name,rings,type,bone,mat,openface=False):
 seg=24;verts=[]
 for z,rx,ry in rings:
  for i in range(seg+1):
   a=(-math.pi/3+i/seg*math.pi*5/3) if openface else i/seg*math.tau
   fold=1+.04*math.cos(a*12);verts.append((math.cos(a)*rx*fold,math.sin(a)*ry*fold,z))
 faces=[]
 for j in range(len(rings)-1):
  for i in range(seg):a=j*(seg+1)+i;faces.append((a,a+1,a+seg+2,a+seg+1))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 uv=mesh.uv_layers.new()
 for f in mesh.polygons:
  for li in f.loop_indices:
   vi=mesh.loops[li].vertex_index;uv.data[li].uv=(vi%(seg+1)/seg,vi//(seg+1)/(len(rings)-1))
 return attach(o,type,bone,mat)
for type in ['monk','witch','knight','brute','boss']:
 robes=type in ['monk','witch'];armor=type in ['knight','boss']
 if robes:
  shell(type+' folded cowl',[(1.42,.23,.17),(1.59,.17,.155),(1.79,.145,.14),(1.89,.035,.055)],type,'Head','Soot wool',True)
  shell(type+' tunic',[(.96,.20,.14),(1.17,.20,.145),(1.43,.24,.14),(1.47,.15,.12)],type,'Spine1','Soot wool')
  shell(type+' divided habit',[(.26,.31,.20),(.68,.25,.16),(.96,.205,.145)],type,'Hips','Soot wool')
  shell(type+' waist binding',[(.94,.21,.15),(.99,.21,.15)],type,'Hips','Worn hide')
 else:
  ell(type+' cuirass',(0,-.045,1.27),(.245,.15,.30),type,'Spine1','Weathered armor' if armor else 'Worn hide')
  for z in [1.08,1.17,1.26]:plate(type+' articulated fauld',(0,-.15,z),(.34,.035,.075),type,'Spine1','Weathered armor')
  if armor:
   ell(type+' enclosed helm',(0,.008,1.70),(.12,.12,.155),type,'Head','Weathered armor')
   plate(type+' visor',(0,-.113,1.704),(.20,.025,.046),type,'Head','Soot wool')
   plate(type+' nasal ridge',(0,-.139,1.70),(.022,.018,.12),type,'Head','Oxidized trim')
 for side in ['Left','Right']:
  for bone in ['Arm','ForeArm']:
   b=rig.data.bones['CityDeadOutfit:'+side+bone];a=rig.matrix_world@b.head_local;end=rig.matrix_world@b.tail_local
   center=a.lerp(end,.40)
   o=ell(type+' '+side+' '+bone,center,(.075,.075,(end-a).length*.48),type,side+bone,'Soot wool' if robes else 'Weathered armor')
   # Model ellipsoid shaft follows the rest-pose limb rather than world Z.
   world=o.matrix_world.copy();world=(end-a).to_track_quat('Z','Y').to_matrix().to_4x4();world.translation=center;o.matrix_world=world
  if armor:
   b=rig.data.bones['CityDeadOutfit:'+side+'Arm'];p=rig.matrix_world@b.head_local
   ell(type+' layered pauldron',p,(.13,.12,.095),type,side+'Arm','Weathered armor')
 if armor:
  for side in ['Left','Right']:
   for bone in ['UpLeg','Leg']:
    b=rig.data.bones['CityDeadOutfit:'+side+bone];a=rig.matrix_world@b.head_local;end=rig.matrix_world@b.tail_local;center=a.lerp(end,.43)
    o=ell(type+' '+side+' greave '+bone,center,(.082,.09,(end-a).length*.40),type,side+bone,'Weathered armor')
    world=(end-a).to_track_quat('Z','Y').to_matrix().to_4x4();world.translation=center;o.matrix_world=world
 if type=='knight':
  b=rig.data.bones['CityDeadOutfit:RightHand'];p=rig.matrix_world@b.head_local;direction=((rig.matrix_world@b.tail_local)-p).normalized()
  for label,distance,size,mat in [('blade',.33,(.065,.019,.58),'Weathered armor'),('guard',.035,(.19,.04,.035),'Oxidized trim'),('grip',-.03,(.03,.035,.12),'Worn hide')]:
   center=p+direction*distance;o=plate('Knight sword '+label,center,size,type,'RightHand',mat)
   world=direction.to_track_quat('Z','Y').to_matrix().to_4x4();world.translation=center;o.matrix_world=world
 if type=='boss':
  for x in [-.07,0,.07]:plate('Crown tine',(x,.01,1.91),(.022,.05,.23-abs(x)),type,'Head','Oxidized trim')
# Preserve modeling source; no duplicate actor skins, textures or animation clips in this attachment file.
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/source/enemy-wardrobe.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/models/enemy-wardrobe.glb'),export_format='GLB',export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
