"""Editable, metric Blender art: custom profiles, fitted stonework and manufactured weapons.
Run: blender -b --factory-startup --python tools/build-art.py -- [cemetery|weapons|all]
Scanned supporting assets and PBR sources: art/ASSET_MANIFEST.json.
"""
import bpy, math, random, sys, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]; random.seed(1704)
M={}
SCANS={}
def clean():
 SCANS.clear()
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.6,texture=None,scale=1):
 m=bpy.data.materials.new(name); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*color,1); b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
 if texture:
  for file,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(R/f'public/assets/textures/{texture}/{file}.jpg'),check_existing=True)
   if file!='color':t.image.colorspace_settings.name='Non-Color'
   if file=='normal':
    n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65;m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],b.inputs[socket])
   else:m.node_tree.links.new(t.outputs['Color'],b.inputs[socket])
 return m

def materials():
 M.update(stone=mat('Weathered limestone',( .5,.48,.43),texture='medieval_blocks_03'),ground=mat('Moss in cobblestone joints',(.3,.3,.25),texture='mossy_cobblestone'),earth=mat('Gravel and wet earth',(.2,.17,.13),texture='rocky_terrain_02'),iron=mat('Oxidized black iron',(.09,.10,.11),.82,.39),steel=mat('Brushed gunmetal',(.24,.27,.29),.87,.3),brass=mat('Tarnished brass',(.42,.28,.12),.79,.36),wood=mat('Oiled walnut',(.22,.13,.06),texture='dark_wood'),leather=mat('Stitched leather',(.1,.075,.05),texture='brown_leather'),rust=mat('Rust blooms',(.25,.1,.04),.6,.7,texture='rusty_metal'),black=mat('Recessed shadow',(.009,.011,.013),.1,.8),slate=mat('Slate roof',(.045,.055,.065),.12,.8),bone=mat('Aged carved stone',(.36,.35,.3),.05,.8))
 for key in ['steel','iron','brass']:
  m=M[key];b=m.node_tree.nodes.get('Principled BSDF')
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(R/'public/assets/textures/rusty_metal/roughness.jpg'),check_existing=True);t.image.colorspace_settings.name='Non-Color';m.node_tree.links.new(t.outputs['Color'],b.inputs['Roughness'])
 M['amber']=mat('Lantern glass',(.75,.25,.05),.15,.25); b=M['amber'].node_tree.nodes.get('Principled BSDF'); b.inputs['Emission Color'].default_value=(1,.35,.065,1);b.inputs['Emission Strength'].default_value=3
 M['arc']=mat('Ceramic blue discharge',(.11,.25,.29),.2,.3);b=M['arc'].node_tree.nodes.get('Principled BSDF');b.inputs['Emission Color'].default_value=(.1,.45,.65,1);b.inputs['Emission Strength'].default_value=.5

def finish(o,name,material,bevel=0):
 o.name=name; o.data.materials.append(M[material] if isinstance(material,str) else material)
 if bevel:
  mod=o.modifiers.new('Light-catching machined edges','BEVEL');mod.width=bevel;mod.segments=2
  mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 return o

def box(name,p,s,material='stone',bevel=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material,bevel)
def tube(name,p,r,length,material='iron',inner=None,axis='Y',segments=32):
 # Open bore with an actual inner wall and rim, never a painted cylinder end.
 ri=inner if inner is not None else r*.74; verts=[]
 for y,rad in [(-length/2,r),(length/2,r),(-length/2,ri),(length/2,ri)]:
  for i in range(segments):
   a=i*math.tau/segments;v=(rad*math.cos(a),y,rad*math.sin(a)); verts.append((v[0],v[2],v[1]) if axis=='Z' else v)
 faces=[]
 for i in range(segments):
  j=(i+1)%segments
  faces.extend([(i,j,segments+j,segments+i),(2*segments+j,2*segments+i,3*segments+i,3*segments+j),(segments+i,segments+j,3*segments+j,3*segments+i),(j,i,2*segments+i,2*segments+j)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=p;finish(o,name,material,.0015)
 for f in mesh.polygons:f.use_smooth=True
 return o

def cylinder(name,p,r,depth,material='iron',axis='Z',vertices=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p);o=bpy.context.object
 if axis=='Y':o.rotation_euler.x=math.pi/2
 elif axis=='X':o.rotation_euler.y=math.pi/2
 finish(o,name,material,min(.015,r*.09));return o

def profile(name,outline,width,material='steel',bevel=.015,axis='X'):
 # Outline in longitudinal/vertical plane, extruded into a solid forged profile.
 verts=[]
 for x in [-width/2,width/2]:
  for y,z in outline:verts.append((x,y,z) if axis=='X' else (y,x,z))
 n=len(outline);faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,material,bevel);return o

def curve(name,points,r,material='iron',closed=False):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type=b.handle_right_type='AUTO'
 s.use_cyclic_u=closed;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(M[material]);return o

def text(name,value,p,size,material='bone',rot=(math.pi/2,0,0)):
 c=bpy.data.curves.new(name,'FONT');c.body=value;c.align_x='CENTER';c.size=size;c.extrude=0;c.bevel_depth=0;c.resolution_u=2;o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=p;o.rotation_euler=rot;c.materials.append(M[material]);return o

def uv_and_export(path):
 # Metric planar UVs per face avoid stretched stone and wooden surfaces.
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH' and not o.get('scanned'):
   if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
   uv=o.data.uv_layers.active.data
   for poly in o.data.polygons:
    n=poly.normal;axis=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=axis]
    size=2 if o.data.materials and o.data.materials[0] in [M['stone'],M['ground'],M['earth']] else .65
    for li in poly.loop_indices:
     v=o.data.vertices[o.data.loops[li].vertex_index].co;uv[li].uv=(v[axes[0]]/size,v[axes[1]]/size)
 bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/f'art/source/{path}.blend'))
 # Curves and type remain editable in .blend; export evaluated mesh copies.
 for o in list(bpy.context.scene.objects):
  if o.type in {'CURVE','FONT'}:
   bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
 bpy.ops.export_scene.gltf(filepath=str(R/f'public/assets/models/{path}.glb'),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)

def setup_render(name,location,target,res=(1400,900)):
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.resolution_x=res[0];sc.render.resolution_y=res[1];sc.render.resolution_percentage=100
 sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs[0].default_value=(.12,.17,.23,1);sc.world.node_tree.nodes.get('Background').inputs[1].default_value=.35
 bpy.ops.object.camera_add(location=location);cam=bpy.context.object;cam.name='Art review camera';cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=32;sc.camera=cam
 for pos,power,color,size in [((-8,-12,18),2200,(.68,.79,1),12),((10,2,12),1600,(1,.7,.4),9)]:
  bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.color=color;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector(target)-l.location).to_track_quat('-Z','Y').to_euler()
 sc.view_settings.view_transform='AgX';sc.render.filepath=str(R/f'art/renders/{name}.png')

def import_asset(asset,name,p,height,rotation=0):
 if asset in SCANS:
  original=SCANS[asset];parent=original.copy();parent.name=name;bpy.context.collection.objects.link(parent)
  def copychildren(old,new):
   for child in old.children:
    c=child.copy();bpy.context.collection.objects.link(c);c.parent=new;copychildren(child,c)
  copychildren(original,parent)
  ratio=height/original['height'];parent.scale=original.scale*ratio;parent.location=Vector(p)+Vector(original.get('origin',(0,0,0)))*ratio;parent.rotation_euler.z=rotation;return parent
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/f'art/source/{asset}/{asset}.gltf'));objects=set(bpy.data.objects)-before;meshes=[o for o in objects if o.type=='MESH']
 # Normalize complete imported asset in world coordinates.
 bounds=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box];mins=Vector([min(v[i] for v in bounds) for i in range(3)]);maxs=Vector([max(v[i] for v in bounds) for i in range(3)]);scale=height/max(.01,maxs.z-mins.z)
 parent=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(parent)
 for o in objects:
  if o.parent not in objects:o.parent=parent
 for o in meshes:
  o['scanned']=True
  if len(o.data.polygons)>14000:
   dec=o.modifiers.new('Game mesh reduction','DECIMATE');dec.ratio=min(1,14000/len(o.data.polygons));bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=dec.name)
 parent.scale=(scale,)*3;parent.location=Vector(p)-Vector(((mins.x+maxs.x)/2,(mins.y+maxs.y)/2,mins.z))*scale;parent.rotation_euler.z=rotation
 parent['height']=height;parent['origin']=list(parent.location-Vector(p));SCANS[asset]=parent
 return parent

def arch(name,x,y,z,width,height,depth=.28,material='stone',segments=18):
 # Pointed lancet with individually fitted voussoirs; two circular arcs meet at crown.
 half=width/2;spring=height-width*.7
 for side in [-1,1]:
  box(name+' jamb',(x+side*(half+.16),y,z+spring/2),(.32,depth,spring),material)
  for i in range(segments):
   t0=i/segments;t1=(i+1)/segments
   # A Gothic arch profile with a pointed crown.
   def pos(t):return Vector((side*half*(1-t),0,spring+(height-spring)*math.sin(t*math.pi/2)))
   a=pos(t0);b=pos(t1);d=b-a;mid=(a+b)/2
   o=box(name+' voussoir',(x+mid.x,y,z+mid.z),(.26,depth,d.length*.96),material,.015);o.rotation_euler.y=math.atan2(d.x,d.z)

def grave(x,y,i):
 h=1.05+(i%4)*.17
 base=box('Grave plinth',(x,y,.13),(1.3,.62,.26),'stone');base['collision']=True
 box('Burial ledger',(x,y-1.1,.075),(1.08,1.9,.15),'stone',.025)
 outline=[(-.46,.25),(-.46,h-.2),(-.34,h),(-.18,h+.09),(0,h+.16),(.18,h+.09),(.34,h),(.46,h-.2),(.46,.25)]
 o=profile('Carved headstone',outline,.20,'stone',.025,axis='Y');o.location=(x,y,0)
 if i%7==0:o.rotation_euler.y=.13
 box('Inset epitaph',(x,y-.111,h*.61),(.61,.025,.42),'bone',.018)
 text('Epitaph','REQUIESCAT\nIN PACE',(x,y-.133,h*.61+.06),.086,'black')
 if i%3==0:
  box('Cross upright',(x,y,h+.4),(.105,.16,.57),'stone',.015);box('Cross transom',(x,y,h+.48),(.38,.16,.1),'stone',.015)
 for dx in [-.49,.49]:box('Foot moulding',(x+dx,y,.31),(.12,.28,.22),'stone',.02)

def lantern(x,y,z=3):
 cylinder('Lamp post',(x,y,z/2),.055,z,'iron');cylinder('Post foot',(x,y,.12),.15,.24,'iron')
 box('Lantern foot',(x,y,z),(.38,.38,.065),'iron',.025);box('Aged amber glass',(x,y,z+.24),(.23,.23,.4),'amber',.015)
 for dx in [-.15,.15]:
  for dy in [-.15,.15]:box('Lantern frame',(x+dx,y+dy,z+.24),(.025,.025,.48),'iron',.004)
 bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.31,radius2=.08,depth=.22,location=(x,y,z+.56),rotation=(0,0,math.pi/4));finish(bpy.context.object,'Lantern cap','iron',.012)
 o=bpy.data.objects.new('warm_light',None);bpy.context.collection.objects.link(o);o.location=(x,y,z+.25);o['light']=True

def cemetery():
 clean();materials()
 box('Cemetery earth',(0,0,-.18),(68,86,.32),'earth',.02)
 box('Processional stone path',(0,0,-.025),(7.5,66,.08),'ground',.012)
 box('Cross path',(0,2,-.015),(52,5,.09),'ground',.01)
 for x in [-4,4]:box('Cut stone curb',(x,0,.04),(.18,64,.14),'stone',.025)
 for side in [-1,1]:
  box('Boundary wall',(side*27,0,.6),(.7,66,1.2),'stone');box('Weathered coping',(side*27,0,1.28),(.9,66,.2),'stone')
  for y in range(-32,34,4):
   box('Boundary buttress',(side*27,y,1.2),(1.05,1.05,2.4),'stone');box('Buttress cap',(side*27,y,2.45),(1.22,1.22,.18),'stone')
  for y in range(-31,33):
   cylinder('Iron fence bar',(side*27,y,2),.028,1.4,'iron',vertices=8)
   bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.09,depth=.2,location=(side*27,y,2.8));finish(bpy.context.object,'Spear finial','iron')
  for z in [1.65,2.35]:box('Fence rail',(side*27,0,z),(.05,66,.055),'iron',.006)
  for row,y in enumerate([-21,-14,-7,9,16,23]):
   for col,x in enumerate([7.5,12,17.5,22]):grave(side*x+random.uniform(-.3,.3),y+random.uniform(-.6,.6),row*4+col)
  for y in [-19,3,22]:lantern(side*4.8,y,2.65)
 # Church facade: walkable gate, recesses, buttresses, layered cornices, rose tracery.
 for side in [-1,1]:
  box('Nave front',(side*9.1,35,6.5),(11.8,2.4,13),'stone')
  box('Bell tower',(side*17,37,9),(6,8,18),'stone')
  for z in [.45,4.6,11.8,17.8]:box('Tower string course',(side*17,37,z),(6.5,8.5,.28),'stone')
  for dx in [-2.65,2.65]:
   box('Tower corner pier',(side*17+dx,32.5,7.8),(.6,1.3,15.6),'stone')
  for dx in [-1.1,1.1]:
   box('Dark bell opening',(side*17+dx,32.94,14.5),(1.35,.05,3),'black');arch('Bell lancet',side*17+dx,32.8,13,1.4,3.5,.24)
  bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=4.8,radius2=.12,depth=8,location=(side*17,37,22),rotation=(0,0,math.pi/4));finish(bpy.context.object,'Slate steeple','slate',.02)
  cylinder('Steeple finial',(side*17,37,26.8),.045,1.7,'iron');box('Steeple cross',(side*17,37,27),(.9,.075,.07),'iron',.006)
  for x in [5,12.8]:
   box('Stepped buttress',(side*x,32.5,3),(1.05,2.6,6),'stone');box('Buttress upper',(side*x,33.3,7),(.76,1,3),'stone')
  for x in [8,11]:
   box('Recessed nave window',(side*x,33.72,7.3),(1.55,.05,4.6),'black');arch('Nave window',side*x,33.6,5,1.6,5,.26)
   for dx in [-.28,.28]:box('Stone mullion',(side*x+dx,33.5,6.7),(.08,.18,3.5),'stone',.01)
 box('Entrance backing',(0,36,4.5),(6.6,.4,9),'black',.02)
 box('Portal upper',(0,35,10.5),(6.4,2.4,5),'stone')
 for n in range(3):arch('Recessed entrance',0,33.5-n*.22,0,5.9+n*.5,8.8+n*.28,.35)
 # Rose window and concentric carved stone rings.
 cylinder('Rose dark recess',(0,33.68,11),1.7,.08,'black','Y',64)
 for rad in [1.8,1.55,.42]:
  o=tube('Rose stone tracery',(0,33.48,11),rad,.18,'stone',rad-.10);o['scanned']=False
 for n in range(12):
  a=n*math.tau/12
  pts=[(math.cos(a)*.42,33.34,11+math.sin(a)*.42),(math.cos(a+.12)*1.0,33.34,11+math.sin(a+.12)),(math.cos(a)*1.55,33.34,11+math.sin(a)*1.55)]
  curve('Rose radial tracery',pts,.055,'stone')
 ped=profile('Nave gable',[(-15,12.8),(0,19),(15,12.8)],2.4,'stone',.03,axis='Y');ped.location.y=35
 for side in [-1,1]:
  curve('Gable coping',[(side*15,33.6,12.8),(side*7.5,33.6,16),(0,33.6,19.2)],.18,'stone')
  for y in [30,36]:
   box('Statue pedestal',(side*7,y,.65),(2.2,2,1.3),'stone');box('Pedestal cap',(side*7,y,1.4),(2.4,2.2,.2),'stone')
  import_asset('gothic_statue','Memorial guardian',(side*7,30,1.5),2.5,0 if side==1 else .12)
 import_asset('large_castle_door','Oak church doors',(0,34.6,0),7.7)
 # Trees and moss-covered fallen rocks break the manufactured silhouette.
 for i,(x,y) in enumerate([(-24,28),(24,27),(-24,-26),(23,-23),(-30,7),(31,3)]):
  import_asset('dead_tree_trunk_02','Fallen ancient trunk',(x,y,0),2.2,i*.7)
 for x,y in [(-10,18),(10,-15),(-19,-5),(19,9),(-23,26),(24,-26),(-7,25),(9,-23)]:
  import_asset('grass_medium_01','Grass tussocks',(x,y,0),.52,random.random()*6)
 for x,y in [(-20,3),(20,-3),(-15,-28),(15,27)]:import_asset('rock_moss_set_01','Moss rubble',(x,y,-.15),.9)
 box('Rear boundary',(0,-33,.6),(55,.7,1.2),'stone')
 setup_render('cemetery',(10,-22,3.3),(0,33,8))
 uv_and_export('cemetery');bpy.ops.render.render(write_still=True)

def loft(name,centers,radii,material='leather',sides=12):
 verts=[]
 for p,(rx,rz) in zip(centers,radii):
  for i in range(sides):
   a=i*math.tau/sides;verts.append((p[0]+rx*math.cos(a),p[1],p[2]+rz*math.sin(a)))
 faces=[]
 for n in range(len(centers)-1):
  for i in range(sides):faces.append((n*sides+i,n*sides+(i+1)%sides,(n+1)*sides+(i+1)%sides,(n+1)*sides+i))
 faces.extend([tuple(reversed(range(sides))),tuple(range((len(centers)-1)*sides,len(centers)*sides))])
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,material)
 sub=o.modifiers.new('Soft leather contour','SUBSURF');sub.levels=1
 for p in me.polygons:p.use_smooth=True
 return o

def gloves():
 loft('Right sleeve',[(.28,-.65,-.38),(.22,-.48,-.32),(.16,-.35,-.26),(.12,-.25,-.21)],[(.09,.1),(.085,.082),(.075,.07),(.065,.06)])
 loft('Right palm',[(.12,-.26,-.21),(.095,-.21,-.195),(.083,-.13,-.19),(.07,-.09,-.19)],[(.052,.06),(.05,.065),(.05,.057),(.024,.045)])
 for i in range(4):
  z=-.12-i*.045
  curve('Curled grip finger',[(.1,-.14,z),(.065,-.075,z),(-.01,-.062,z-.012),(-.062,-.11,z-.018)],.020,'leather')
  curve('Glove knuckle seam',[(.096,-.137,z+.01),(.06,-.073,z+.01),(.01,-.06,z)],.0015,'brass')
 curve('Right thumb',[(.12,-.22,-.15),(.11,-.14,-.10),(.07,-.10,-.105)],.024,'leather')
 loft('Left sleeve',[(-.32,-.38,-.40),(-.24,-.05,-.27),(-.18,.20,-.2),(-.12,.33,-.15)],[(.09,.1),(.083,.086),(.075,.07),(.059,.05)])
 loft('Supporting palm',[(-.12,.32,-.15),(-.09,.37,-.12),(-.05,.44,-.11),(-.04,.49,-.11)],[(.055,.05),(.061,.055),(.055,.053),(.028,.036)])
 for i in range(4):
  y=.355+i*.036
  curve('Supporting finger',[(-.07,y,-.10),(-.01,y,-.15),(.055,y,-.11),(.085,y,-.045)],.018,'leather')
 curve('Left thumb',[(-.12,.36,-.12),(-.12,.43,-.055),(-.075,.48,-.025)],.023,'leather')

def weapon(i):
 clean();materials()
 # Stock and pistol grip are shaped silhouettes, with a separate metal butt plate.
 profile('Walnut stock',[(-.55,-.16),(-.58,.08),(-.29,.12),(-.17,.02),(-.06,.02),(-.12,-.13),(-.3,-.18)],.16,'wood',.016)
 profile('Grip',[(-.22,-.04),(-.09,-.04),(-.11,-.34),(-.23,-.36),(-.27,-.28)],.115,'leather',.022)
 box('Receiver',(0,.02,.035),(.22,.38,.20),'steel',.018)
 box('Receiver sideplate',(.116,.02,.035),(.014,.31,.15),'iron',.006)
 curve('Trigger guard',[(0,-.13,-.1),(0,-.06,-.24),(0,.09,-.22),(0,.13,-.08)],.014,'steel')
 curve('Trigger',[(0,-.04,-.07),(0,-.015,-.13),(0,-.045,-.165)],.012,'brass')
 for side in [-1,1]:
  for y in [-.09,.12]:
   c=cylinder('Slotted receiver screw',(side*.124,y,.06),.018,.014,'brass','X',16)
   box('Screw slot',(side*.133,y,.06),(.003,.022,.004),'black',.001)
 for x in [-.028,.028]:box('Rear sight ear',(x,.07,.16),(.018,.04,.04),'iron',.004)
 box('Receiver spine',(0,.055,.143),(.12,.30,.035),'iron',.006)
 box('Breech seam',(0,.15,.115),(.205,.008,.04),'black',.001)
 for y in [-.07,-.03,.01,.05]:box('Charging serration',(.123,y,.085),(.011,.012,.035),'steel',.002)
 text('Armory proof','IV',(0,-.02,.164),.027,'brass',rot=(0,0,0))
 # Exported weapon forward is -Z; Blender +Y maps to that axis.
 if i==0:
  tube('Main drive housing',(0,.38,.035),.13,.54,'steel',.055)
  for y in [.19,.24,.29,.34]:tube('Cooling rib',(0,y,.035),.15,.019,'iron',.128)
  rotor=bpy.data.objects.new('rotor',None);bpy.context.collection.objects.link(rotor);rotor.location=(0,.72,.035)
  for n in range(5):
   # Curved hooked blades with real thickness and bevelled cutting edges.
   blade=profile('Hooked rotor blade',[(.06,0),(.14,.09),(.30,.10),(.40,.02),(.34,-.03),(.24,.015),(.13,-.025)],.028,'steel',.006,axis='Y')
   blade.parent=rotor;blade.rotation_euler.y=n*math.tau/5
  c=cylinder('Rotor hub',(0,.72,.035),.11,.11,'brass','Y');c.parent=rotor;c.location=(0,0,0)
 elif i==1:
  for x in [-.058,.058]:
   tube('Bored shotgun barrel',(x,.54,.10),.052,.86,'steel',.037)
   tube('Muzzle crown',(x,.976,.10),.056,.032,'iron',.037)
  profile('Shaped walnut fore-end',[(.19,-.03),(.24,-.105),(.62,-.09),(.68,-.01),(.58,.025),(.23,.025)],.17,'wood',.015)
  for y in [.28,.31,.34,.37,.40,.43,.46,.49,.52,.55]:
   curve('Fore-end chequering',[(-.086,y,-.025),(0,y,-.092),(.086,y,-.025)],.0025,'black')
  tube('Cryogenic reservoir',(.13,.39,.025),.044,.42,'brass',.016)
  for y in [.24,.31,.38,.45,.52]:tube('Reservoir rib',(.13,y,.025),.048,.018,'iron',.04)
  curve('Coolant line',[(.13,.6,.03),(.18,.64,.06),(.19,.3,.16),(.1,.13,.14)],.009,'arc')
  box('Front bead',(0,.9,.17),(.012,.025,.035),'brass',.003)
 elif i==2:
  for x in [-.115,.115]:
   profile('Stake guide rail',[(.14,.045),(.98,.045),(.99,.1),(.18,.17)],.035,'steel',.006).location.x=x
  cylinder('Loaded timber stake',(0,.68,.11),.037,.94,'wood','Y')
  bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.039,radius2=0,depth=.18,location=(0,1.24,.11),rotation=(-math.pi/2,0,0));finish(bpy.context.object,'Forged stake tip','steel',.002)
  tube('Grenade chamber',(0,.32,-.10),.085,.39,'iron',.065)
  for x in [-.145,.145]:
   tube('Hydraulic ram',(x,.3,.0),.027,.4,'brass',.015)
  box('Loading bracket',(0,.15,.19),(.32,.07,.05),'iron',.008)
 elif i==3:
  tube('Rocket tube',(-.045,.44,.10),.145,.85,'iron',.12)
  for y in [.04,.18,.77,.88]:tube('Rocket tube collar',(-.045,y,.1),.16,.037,'steel',.144)
  rotor=bpy.data.objects.new('rotor',None);bpy.context.collection.objects.link(rotor);rotor.location=(.21,.56,-.10)
  for n in range(6):
   a=n*math.tau/6;x=.21+math.cos(a)*.066;z=-.1+math.sin(a)*.066
   o=tube('Rotary barrel',(x,.6,z),.023,.61,'steel',.013);o.parent=rotor;o.location=(x-.21,.04,z+.10)
  for y in [.33,.77]:
   o=tube('Barrel support plate',(.21,y,-.1),.105,.043,'iron',.035);o.parent=rotor;o.location=(0,y-.56,0)
  box('Ammo feed box',(-.25,.02,-.03),(.18,.3,.28),'iron',.022)
  for n in range(7):cylinder('Feed belt round',(-.27+n*.036,.20,-.17),.014,.12,'brass','Y',12)
 else:
  tube('Tesla capacitor',(0,.37,.04),.112,.46,'iron',.06)
  for y in [.17,.22,.27,.32,.37,.42,.47,.52,.57]:tube('Copper induction winding',(0,y,.04),.126,.022,'brass',.11)
  for x in [-.15,.15]:
   profile('Conductive fork',[(.20,.01),(.27,.12),(.72,.17),(.82,.1),(.79,.035),(.66,.08),(.29,.035)],.046,'steel',.008).location.x=x
   cylinder('Ceramic insulator',(x,.62,.12),.044,.14,'arc','Y')
  curve('Braided power cable',[(-.16,.05,-.08),(-.24,.15,-.15),(-.24,.38,-.12),(-.12,.49,-.06)],.022,'leather')
 for y in [-.37,-.40,-.43]:
  curve('Stock checkering',[(-.082,y,-.08),(0,y,-.14),(.082,y,-.08)],.0025,'black')
 # Tang screws, serial plate and machined bolt handle.
 box('Serial plate',(-.119,.025,.02),(.008,.15,.048),'brass',.004)
 cylinder('Bolt shaft',(.19,.05,.11),.016,.14,'steel','X',16)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.03,location=(.255,.05,.11));finish(bpy.context.object,'Bolt knob','iron')
 gloves()
 setup_render('weapon-'+str(i),(1.4,-1.45,.9),(0,.3,0),(1200,800))
 for o in bpy.context.scene.objects:
  if o.type=='LIGHT':o.location*=.1;o.data.energy*=.03;o.data.size*=.1;o.rotation_euler=(Vector((0,.3,0))-o.location).to_track_quat('-Z','Y').to_euler()
 uv_and_export('weapon-'+str(i));bpy.ops.render.render(write_still=True)

arg=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'all'
if arg in {'cemetery','all'}:cemetery()
if arg in {'weapons','all'}:
 for i in range(5):weapon(i)
