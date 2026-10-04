from pathlib import Path
exec(compile(Path(__file__).with_name('build-art.py').read_text().split("arg=sys.argv")[0],str(Path(__file__).with_name('build-art.py')),'exec'))
bpy.ops.wm.open_mainfile(filepath=str(R/'art/source/revenant.blend'))
rig=bpy.data.objects['Revenant_Rig'];rig.data.pose_position='REST'
for o in list(bpy.data.objects):
 if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
materials();M['bone']=mat('Aged skeletal ivory',(.48,.43,.32),0,.83)
parts=[]
def bind(o,bone):
 if o.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o=bpy.context.object
 bpy.context.view_layer.objects.active=o
 for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
 g=o.vertex_groups.new(name='CityDeadOutfit:'+bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Skeletal deformation','ARMATURE');mod.object=rig;parts.append(o);return o

def ellipsoid(name,p,scale,bone,material='bone'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=p);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,material)
 for poly in o.data.polygons:poly.use_smooth=True
 return bind(o,bone)
# Long bones with expanded joint ends, tapered shafts and separate radius/ulna.
for bone in rig.data.bones:
 short=bone.name.split(':')[-1]
 if not any(n in short for n in ['Arm','Leg','Hand','Foot','Toe','Shoulder']):continue
 if 'End' in short:continue
 a=rig.matrix_world@bone.head_local;b=rig.matrix_world@bone.tail_local;length=(b-a).length
 if length<.005:continue
 radius=(.012 if short.endswith('Hand') else .004) if 'Hand' in short else .022 if 'Arm' in short else .029 if 'Leg' in short else .025
 points=[tuple(a.lerp(b,t)) for t in [0,.08,.30,.68,.93,1]]
 bind(curve(short+' shaft',points,radius,'bone'),short)
 ellipsoid(short+' proximal joint',a,(radius*1.5,)*3,short);ellipsoid(short+' distal joint',b,(radius*1.35,)*3,short)
 if 'ForeArm' in short or short.endswith('Leg'):
  offset=Vector((0,.024,0));bind(curve(short+' paired bone',[tuple(a+offset),tuple(a.lerp(b,.5)+offset*1.4),tuple(b+offset)],radius*.55,'bone'),short)
# Ribs form a tapered thorax, open at the sternum with curved cartilaginous ends.
for i in range(9):
 z=1.12+i*.031;width=.115+.045*math.sin(i/9*math.pi);depth=.09+.025*math.sin(i/9*math.pi);bone='Spine1' if i<5 else 'Spine2'
 for sign in [-1,1]:
  pts=[(sign*.025,.09,z+.028),(sign*width,.065,z+.015),(sign*(width+.015),-.01,z),(sign*width*.75,-depth,z-.022),(sign*.027,-depth,z-.028)]
  bind(curve('Individual rib',pts,.009,'bone'),bone)
for i in range(12):ellipsoid('Spinal vertebra',(0,.055,.97+i*.041),(.032,.031,.020),'Hips' if i<2 else 'Spine' if i<5 else 'Spine1' if i<8 else 'Spine2')
bind(box('Sternum',(0,-.111,1.30),(.038,.021,.18),'bone',.013),'Spine2')
for sign in [-1,1]:
 bind(curve('Clavicle',[(sign*.01,-.044,1.455),(sign*.085,-.042,1.47),(sign*.17,.023,1.448)],.014,'bone'),'Spine2')
 bind(curve('Iliac crest',[(sign*.025,.035,.97),(sign*.10,.015,1.01),(sign*.15,-.01,.98),(sign*.125,-.07,.87),(sign*.04,-.08,.86)],.024,'bone'),'Hips')
 bind(curve('Pelvic arch',[(sign*.035,.015,.92),(sign*.1,-.06,.86),(sign*.07,-.09,.80),(0,-.075,.82)],.016,'bone'),'Hips')
# Skull with actual cut sockets and nasal cavity; teeth are separate from jaw.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,radius=1,location=(0,.008,1.695));skull=bpy.context.object;skull.scale=(.095,.095,.12);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(skull,'Cranium','bone')
for x in [-.043,.043,0]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=(x,-.085,1.704 if x else 1.655));cut=bpy.context.object;cut.scale=(.032,.055,.034) if x else (.015,.035,.025);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.context.view_layer.objects.active=skull;mod=skull.modifiers.new('Anatomical cavity','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
bind(skull,'Head')
bind(curve('Mandible',[(-.08,-.024,1.65),(-.063,-.070,1.59),(0,-.094,1.585),(.063,-.070,1.59),(.08,-.024,1.65)],.016,'bone'),'Head')
for i in range(9):
 x=(i-4)*.011;y=-.09+abs(x)*.22
 bind(box('Upper tooth',(x,y,1.622),(.009,.016,.015),'bone',.002),'Head');bind(box('Lower tooth',(x,y,1.605),(.009,.015,.012),'bone',.002),'Head')
# Merge the skinned pieces to keep the complete skeleton within one material draw.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Ossuary skeleton'
rig.data.pose_position='POSE';bpy.context.scene.frame_set(40)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/source/skeleton.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/models/skeleton.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_yup=True)
setup_render('skeleton',(2,-3,1.6),(0,0,1),(800,1000))
for o in bpy.context.scene.objects:
 if o.type=='LIGHT':o.location*=.18;o.data.energy*=.12;o.data.size*=.18;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.render.render(write_still=True)
