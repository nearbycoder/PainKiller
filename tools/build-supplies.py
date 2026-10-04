# Uses the same metric modeling helpers and material palette as the weapon masters.
from pathlib import Path
exec(compile(Path(__file__).with_name('build-art.py').read_text().split("arg=sys.argv")[0],str(Path(__file__).with_name('build-art.py')),'exec'))
clean();materials()
red=mat('Faded red enamel',(.32,.045,.025),.25,.62);white=mat('Old ivory enamel',(.63,.61,.49),.18,.65)
def group(name,before):
 p=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(p)
 for o in set(bpy.context.scene.objects)-before:
  if o!=p and o.parent is None:o.parent=p
 return p
before=set(bpy.context.scene.objects)
box('Medical tin',(0,0,0),(.55,.27,.36),white,.04);box('Tin lid',(0,0,.19),(.57,.29,.045),'iron',.015)
box('Medical cross upright',(0,-.142,0),(.055,.012,.24),red,.006);box('Medical cross arms',(0,-.143,.01),(.2,.012,.055),red,.006)
curve('Carry handle',[(-.1,0,.22),(-.1,0,.3),(.1,0,.3),(.1,0,.22)],.016,'leather');group('health',before)
before=set(bpy.context.scene.objects)
box('Ammo field box',(0,0,0),(.58,.3,.32),'iron',.018);box('Ammo lid',(0,0,.18),(.6,.33,.04),'steel',.009)
for x in [-.19,.19]:box('Ammo box reinforcement',(x,-.16,0),(.035,.02,.31),'steel',.005)
box('Latch',(0,-.18,.12),(.07,.04,.13),'brass',.006);text('Ammo stencil','12 / 70',(0,-.174,-.06),.055,'bone')
for x in [-.12,0,.12]:
 cylinder('Shot shell',(x,0,.27),.035,.14,red);cylinder('Shell brass rim',(x,0,.2),.039,.03,'brass')
group('ammo',before)
before=set(bpy.context.scene.objects)
# Convex breastplate with embossed central ridge and rolled edge.
verts=[]
for z,width,depth in [(-.25,.17,.05),(-.12,.22,.10),(.05,.28,.14),(.22,.29,.12),(.29,.18,.05)]:
 for i in range(9):
  t=(i/8-.5)*2;verts.append((t*width,-depth*(1-t*t),z))
faces=[(r*9+i,r*9+i+1,(r+1)*9+i+1,(r+1)*9+i) for r in range(4) for i in range(8)]
me=bpy.data.meshes.new('Forged breastplate');me.from_pydata(verts,[],faces);o=bpy.data.objects.new('Forged breastplate',me);bpy.context.collection.objects.link(o);finish(o,o.name,'steel');solid=o.modifiers.new('Plate thickness','SOLIDIFY');solid.thickness=.015
for x in [-.2,.2]:curve('Armor shoulder strap',[(x,0,.2),(x,.04,.34),(x,.16,.25),(x,.17,-.12)],.024,'leather')
curve('Breastplate medial rib',[(0,-.051,-.24),(0,-.11,-.1),(0,-.15,.06),(0,-.12,.23)],.012,'brass');group('armor',before)
before=set(bpy.context.scene.objects)
box('Reliquary base',(0,0,-.15),(.25,.2,.08),'brass',.014);cylinder('Reliquary stem',(0,0,-.04),.027,.2,'brass')
box('Relic cross',(0,0,.17),(.055,.065,.35),'brass',.015);box('Relic arms',(0,0,.21),(.23,.065,.055),'brass',.013)
group('secret',before)
uv_and_export('supplies')
