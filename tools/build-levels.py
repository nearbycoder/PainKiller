"""Three additional editable environments. Authored collision markers keep routes clear."""
from pathlib import Path
exec(compile(Path(__file__).with_name('build-art.py').read_text().split("arg=sys.argv")[0],str(Path(__file__).with_name('build-art.py')),'exec'))
def interior_render(name,location,target):
 setup_render(name,location,target)
 for o in list(bpy.data.objects):
  if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
 height=3.4 if name=='crypt' else 8
 for pos,power,color,size in [((0,-20,height),1800,(.66,.77,1),8),((3,8,height),2200,(1,.74,.45),10),((-4,26,height),1800,(.65,.8,1),8)]:
  bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.color=color;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,pos[1]+8,1))-l.location).to_track_quat('-Z','Y').to_euler()

def solid(name,p,size,material='stone',bevel=.035):
 o=box(name,p,size,material,bevel);o['collision']=True;return o

def light_marker(x,y,z,color='warm'):
 o=bpy.data.objects.new(color+'_light',None);bpy.context.collection.objects.link(o);o.location=(x,y,z);o['light']=True;o['color']=color

def column(x,y,height):
 for z,r,d in [(.15,.78,.3),(.37,.65,.14),(height-.35,.68,.2),(height-.12,.8,.24)]:cylinder('Moulded column base',(x,y,z),r,d,'stone',vertices=24)
 o=cylinder('Clustered pier',(x,y,height/2),.42,height,'stone',vertices=20);o['collision']=True
 for n in range(8):
  a=n*math.tau/8;cylinder('Engaged shaft',(x+math.cos(a)*.37,y+math.sin(a)*.37,height/2),.115,height-.45,'stone',vertices=12)

def stair_dais(y):
 for i in range(3):box('Sanctuary step',(0,y+i*.45,.06+i*.06),(8-i*.4,4-i*.6,.12+i*.12),'stone')

def cathedral():
 clean();materials()
 box('Nave flagstones',(0,0,-.12),(56,68,.24),'stone')
 box('Dark processional inlay',(0,0,.012),(6.2,66,.024),'slate',.003)
 for x in [-3.25,3.25]:box('Brass floor border',(x,0,.025),(.07,66,.025),'brass',.001)
 for side in [-1,1]:
  solid('Aisle wall',(side*27,0,7.7),(.7,68,15.4))
  for y in [-25,-13,-1,11,23]:
   column(side*8,y,9.6)
   # Longitudinal aisle arcade, rotated from the shared facade arch orientation.
   before=set(bpy.data.objects);arch('Aisle arcade',0,0,0,11.2,13,.3)
   parent=bpy.data.objects.new('Arcade bay',None);bpy.context.collection.objects.link(parent)
   for o in set(bpy.data.objects)-before:
    if o!=parent:o.parent=parent
   parent.location=(side*8,y+6,0);parent.rotation_euler.z=math.pi/2
   for z in [1.0,5.0,10.0]:box('Aisle cornice',(side*26.5,y,z),(.2,11.8,.22),'stone')
   box('Lancet window dark',(side*26.57,y,7.4),(.08,4,6),'black',.02)
   for j in range(6):
    glass=bpy.data.materials.get('Cathedral glass '+str(j%3)) or mat('Cathedral glass '+str(j%3),[(.11,.18,.29),(.27,.07,.04),(.25,.18,.04)][j%3],.05,.45)
    b=glass.node_tree.nodes.get('Principled BSDF');b.inputs['Emission Color'].default_value=(*[(.08,.12,.22),(.18,.04,.02),(.16,.11,.025)][j%3],1);b.inputs['Emission Strength'].default_value=.7
    box('Narrow stained pane',(side*26.50,y-1.5+j*.6,7.4),(.025,.49,5.5),glass,.002)
  for y in [-20,-9,3,15]:
   for x in [14,20]:
    solid('Oak pew seat',(side*x,y,.55),(4.2,.6,.18),'wood',.05)
    box('Oak pew back',(side*x,y+.3,1),(4.2,.16,.85),'wood',.06)
    for dx in [-1.8,1.8]:box('Pew foot',(side*x+dx,y,.28),(.16,.68,.56),'wood',.03)
  for y in [-22,1,22]:lantern(side*6,y,2.4)
 # Tall ribbed vault, solid ceiling behind graceful ribs.
 box('High vault canopy',(0,0,15.4),(56,68,.45),'stone')
 for y in [-25,-13,-1,11,23]:
  for side in [-1,1]:curve('Cross vault rib',[(side*8,y,9),(side*6,y,12),(side*3,y,14.3),(0,y,15)],.18,'stone')
 for x in [-25,-16,0,16,25]:box('Vault longitudinal rib',(x,0,15.1),(.22,67,.28),'stone')
 box('Apse wall',(0,33,7.7),(55,.7,15.4),'stone')
 stair_dais(28)
 box('Altar mensa',(0,30,1.35),(5,1.6,.25),'stone')
 for x in [-1.8,1.8]:box('Carved altar support',(x,30,.65),(.55,1.15,1.3),'stone')
 box('Apse cross upright',(0,32.5,8),(.34,.22,5),'brass');box('Apse cross beam',(0,32.5,8.8),(2.6,.22,.34),'brass')
 for x in [-13,13]:
  box('Saint plinth',(x,30,.8),(2.4,2.2,1.6),'stone');import_asset('gothic_statue','Apse saint',(x,30,1.6),3.6)
 box('Entry wall',(0,-33,7.7),(55,.7,15.4),'stone')
 interior_render('cathedral',(3,-24,2.8),(0,26,7));uv_and_export('cathedral');bpy.ops.render.render(write_still=True)

def crypt():
 clean();materials()
 box('Crypt paving',(0,0,-.12),(56,68,.24),'stone')
 for side in [-1,1]:
  solid('Catacomb retaining wall',(side*27,0,3),(.8,68,6))
  for y in range(-27,30,9):
   column(side*10,y,4.5)
   for z in [1.0,2.7]:
    box('Burial recess',(side*26.55,y,z),(.04,5,1.2),'black',.01)
    for yy in [-2.5,0,2.5]:box('Niche vertical division',(side*26.15,y+yy,z),(.75,.22,1.7),'stone')
    box('Niche lintel',(side*26.12,y,z+.72),(.8,5.3,.23),'stone')
    for yy in [-1.2,1.2]:
     box('Burial shelf',(side*26.1,y+yy,z-.5),(.8,2,.13),'stone')
     cylinder('Ceramic funerary jar',(side*26,y+yy,z-.18),.19,.57,'bone',vertices=16)
   # Sarcophagi line side aisles; broad central route stays open.
   x=side*(16 if y%2 else 21)
   solid('Sarcophagus chest',(x,y,.58),(2.3,3.8,1.16),'stone',.10)
   box('Coffin lid moulding',(x,y,1.22),(2.55,4.05,.18),'stone',.09)
   box('Carved lid cross',(x,y,1.33),(.17,2.5,.06),'bone',.018);box('Carved lid transom',(x,y+.6,1.33),(1.1,.17,.06),'bone',.015)
  for y in [-24,0,24]:lantern(side*8,y,1.65)
 # Barrel vaults made as continuous arched mesh strips with stone ribs.
 for cx in [-18,0,18]:
  width=18 if cx==0 else 16;verts=[]
  for y in [-33,33]:
   for k in range(25):
    a=k*math.pi/24;verts.append((cx+math.cos(a)*width/2,y,3.8+math.sin(a)*3.4))
  faces=[(i,i+1,i+26,i+25) for i in range(24)];me=bpy.data.meshes.new('Vault masonry');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Barrel vault',me);bpy.context.collection.objects.link(o);finish(o,o.name,'stone');o.data.materials[0].use_backface_culling=False
  solidify=o.modifiers.new('Vault thickness','SOLIDIFY');solidify.thickness=.3
  for y in [-27,-18,-9,0,9,18,27]:
   pts=[(cx+math.cos(k*math.pi/24)*width/2,y,3.8+math.sin(k*math.pi/24)*3.4) for k in range(25)];curve('Vault rib',pts,.13,'stone')
 for y in [-33,33]:box('Crypt end wall',(0,y,3.8),(56,.7,7.6),'stone')
 for n in range(3):arch('Sealed crypt doorway',0,32.6-n*.2,0,5.5+n*.4,6.4+n*.12,.3)
 box('Black burial gate',(0,32.65,2.6),(5,.05,5.2),'black');
 for x in [-2,-1,0,1,2]:cylinder('Gate iron upright',(x,32.4,2.5),.04,5,'iron',vertices=12)
 interior_render('crypt',(2,-23,2.4),(0,23,3.8));uv_and_export('crypt');bpy.ops.render.render(write_still=True)

def factory():
 clean();materials()
 box('Industrial floor',(0,0,-.14),(56,68,.28),'stone')
 for x in [-4.5,4.5]:box('Machine aisle safety stripe',(x,0,.008),(.16,65,.016),'brass',.002)
 for side in [-1,1]:
  solid('Brick shed wall',(side*27,0,6.65),(.7,68,13.3),'stone')
  for y in range(-29,32,10):
   # Riveted I-section columns and ties, not solid box pillars.
   for dx in [-.2,.2]:box('I beam flange',(side*25+dx,y,5.5),(.10,.65,11),'iron',.012)
   box('I beam web',(side*25,y,5.5),(.42,.12,11),'iron',.012)
   for z in [1,3,5,7,9]:
    for dy in [-.23,.23]:cylinder('Structural rivet',(side*25+.26,y+dy,z),.045,.025,'steel','X',12)
   box('Factory high window',(side*26.55,y,7.8),(.03,6,3),'arc',.001)
   for yy in [-3,-1.5,0,1.5,3]:box('Window mullion',(side*26.4,y+yy,7.8),(.08,.07,3.1),'iron',.006)
  for y in [-18,6,23]:
   x=side*15
   solid('Generator foundation',(x,y,.3),(6,5,.6),'stone',.04)
   # Banded horizontal cast generator with exposed axle and flywheel.
   o=cylinder('Generator stator',(x,y,1.9),1.25,3.3,'iron','Y',40);o['collision']=True
   for yy in [-1.7,-1.45,-1,-.5,0,.5,1,1.45,1.7]:tube('Stator cooling band',(x,y+yy,1.9),1.32,.09,'steel',1.24)
   cylinder('Generator shaft',(x,y-2.3,1.9),.16,1.4,'steel','Y')
   tube('Flywheel rim',(x,y-2.75,1.9),.92,.18,'rust',.74)
   for n in range(8):
    a=n*math.tau/8;curve('Flywheel spoke',[(x,y-2.75,1.9),(x+math.sin(a)*.8,y-2.75,1.9+math.cos(a)*.8)],.075,'iron')
   box('Control cabinet',(x+side*2.3,y,1.15),(.65,1.0,1.7),'iron',.04)
   for z in [.8,1.1,1.4]:cylinder('Gauge bezel',(x+side*2.3,y-.52,z),.12,.04,'brass','Y');cylinder('Gauge face',(x+side*2.3,y-.545,z),.095,.015,'bone','Y')
  # Wall services, elbows and bolted flanges.
  for z in [2,4.8,9]:
   tube('Long service pipe',(side*23.8,0,z),.17,64,'rust',.13)
   for y in range(-28,30,7):
    tube('Bolted pipe flange',(side*23.8,y,z),.26,.11,'iron',.17)
    for n in range(6):
     a=n*math.tau/6;cylinder('Flange bolt',(side*23.8+math.cos(a)*.215,y-.065,z+math.sin(a)*.215),.025,.055,'steel','Y',6)
  for y in [-24,0,24]:lantern(side*6,y,3.5)
 for y in [-28,-14,0,14,28]:
  box('Roof cross beam',(0,y,11),(53,.35,.45),'iron',.02)
  for x in range(-24,25,6):curve('Roof truss diagonal',[(x,y,11),(x+3,y,13),(x+6,y,11)],.07,'iron')
 box('Shed roof',(0,0,13.3),(57,69,.25),'slate')
 for y in [-33,33]:box('Factory end wall',(0,y,6.65),(55,.8,13.3),'stone')
 box('Shutter recess',(0,32.5,3.7),(7,.06,7.4),'black')
 for z in range(15):box('Loading door slat',(0,32.3,.25+z*.49),(6.6,.1,.44),'steel',.015)
 for side in [-1,1]:
  for y in [-28,29]:
   solid('Stacked supply crate',(side*20,y,.8),(2.4,2.4,1.6),'wood',.035)
   for z in [.2,1.3]:box('Crate strap',(side*20,y-1.22,z),(2.45,.035,.08),'iron',.008)
 interior_render('factory',(4,-24,3),(0,22,5));uv_and_export('factory');bpy.ops.render.render(write_still=True)

cathedral();crypt();factory()
