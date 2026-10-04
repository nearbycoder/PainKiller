"""Replace scan reduction artifacts with a continuous, tapered dead-oak mesh."""
from pathlib import Path
exec(compile(Path(__file__).with_name('build-art.py').read_text().split("arg=sys.argv")[0],str(Path(__file__).with_name('build-art.py')),'exec'))
bpy.ops.wm.open_mainfile(filepath=str(R/'art/source/cemetery.blend'))
# Restore material lookup for the loaded source scene.
for key,label in [('stone','Weathered limestone'),('ground','Moss in cobblestone joints'),('earth','Gravel and wet earth')]:M[key]=bpy.data.materials.get(label)
for o in [obj for obj in bpy.data.objects if obj.name.startswith('Cemetery tree')]:
 if o:
  for child in list(o.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
  bpy.data.objects.remove(o,do_unlink=True)
bark=mat('Fissured oak bark',(.2,.17,.14),0,.95)
bs=bark.node_tree.nodes.get('Principled BSDF')
for file,socket in [('tree_small_02_diff_2k.jpg','Base Color'),('tree_small_02_nor_gl_2k.jpg','Normal')]:
 t=bark.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(R/'art/source/tree_small_02/textures'/file),check_existing=True)
 if socket=='Normal':
  t.image.colorspace_settings.name='Non-Color';n=bark.node_tree.nodes.new('ShaderNodeNormalMap');bark.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);bark.node_tree.links.new(n.outputs['Normal'],bs.inputs[socket])
 else:bark.node_tree.links.new(t.outputs['Color'],bs.inputs[socket])
def oak(x,y,seed):
 rng=random.Random(seed);verts=[];faces=[];uvs=[]
 def limb(points,radii):
  start=len(verts);sides=10;length=0
  for k,p in enumerate(points):
   tangent=(points[min(k+1,len(points)-1)]-points[max(0,k-1)]).normalized();u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
   if k:length+=(p-points[k-1]).length
   for j in range(sides):
    a=j*math.tau/sides;r=radii[k]*(1+.12*math.sin(j*3.2+k*.2));verts.append(p+(u*math.cos(a)+v*math.sin(a))*r);uvs.append((j/sides,length*.45))
   if k:
    for j in range(sides):faces.append((start+(k-1)*sides+j,start+(k-1)*sides+(j+1)%sides,start+k*sides+(j+1)%sides,start+k*sides+j))
 def branch(origin,direction,length,radius,depth):
  points=[]
  for k in range(7):
   t=k/6;points.append(origin+direction*length*t+Vector((math.sin(t*3.4)*length*.1,math.sin(t*4.1)*length*.07,t*t*length*.15)))
  limb(points,[max(.004,radius*(1-k/6)**.8) for k in range(7)])
  if depth:
   for n,k in enumerate([3,5]):
    d=(direction+Vector((rng.uniform(-.9,.9),rng.uniform(-.9,.9),rng.uniform(.05,.5)))).normalized();branch(points[k],d,length*rng.uniform(.42,.67),radius*.48,depth-1)
 trunk=[Vector(p) for p in [(0,0,0),(.06,.04,1),(.16,.1,2.4),(-.03,.21,4),(.12,.3,5.7),(.26,.2,7.2),(.12,.35,8.8)]]
 limb(trunk,[.46,.38,.32,.26,.17,.085,.008])
 for k in range(2,6):
  for n in range(2):
   a=k*2.4+n*2.7+rng.uniform(-.3,.3);d=Vector((math.cos(a),math.sin(a),.35+rng.random()*.65)).normalized();branch(trunk[k],d,4.5-(k-2)*.6,.15-(k-2)*.023,3)
 for n in range(6):
  a=n*math.tau/6;limb([Vector((0,0,.4)),Vector((math.cos(a)*.5,math.sin(a)*.5,.10)),Vector((math.cos(a)*1.3,math.sin(a)*1.3,.03))],[.18,.12,.007])
 me=bpy.data.meshes.new('Continuous tapered branches');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Gnarled cemetery oak',me);bpy.context.collection.objects.link(o);o.location=(x,y,0);o.rotation_euler.z=seed*.7;finish(o,o.name,bark);o['scanned']=True
 uv=me.uv_layers.new(name='Bark grain')
 for poly in me.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:uv.data[li].uv=uvs[me.loops[li].vertex_index]
for i,(x,y) in enumerate([(-24,28),(24,27),(-24,-26),(23,-23),(-30,7),(31,3)]):oak(x,y,170+i)
# Retain manual camera and lighting for a directly comparable art review render.
uv_and_export('cemetery');bpy.context.scene.render.filepath=str(R/'art/renders/cemetery.png');bpy.ops.render.render(write_still=True)
