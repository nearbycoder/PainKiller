"""Bake an original, reusable armory material library and finish the five Blender masters.
Run after build-art.py. All surface recipes remain editable in armory-materials.blend.
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
R = Path(__file__).resolve().parents[1]
OUT = R / 'public/assets/textures/armory'
OUT.mkdir(parents=True, exist_ok=True)

def node(nodes, kind, **values):
    n = nodes.new(kind)
    for key, value in values.items(): n.inputs[key].default_value = value
    return n

def recipe(name, base, worn, rust, metal):
    m = bpy.data.materials.new(name); m.use_nodes = True
    ns, ls = m.node_tree.nodes, m.node_tree.links
    b = ns.get('Principled BSDF')
    uv = ns.new('ShaderNodeTexCoord')
    def noise(scale, detail=3, stretch=None):
        n = node(ns, 'ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=.72)
        source = uv.outputs['UV']
        if stretch:
            v = ns.new('ShaderNodeVectorMath'); v.operation = 'MULTIPLY'; v.inputs[1].default_value = stretch
            ls.new(source, v.inputs[0]); source = v.outputs[0]
        ls.new(source, n.inputs['Vector']); return n.outputs['Fac']
    def ramp(source, stops):
        n = ns.new('ShaderNodeValToRGB')
        r = n.color_ramp
        for e in list(r.elements)[2:]: r.elements.remove(e)
        for i, (pos, c) in enumerate(stops):
            e = r.elements[i] if i < 2 else r.elements.new(pos)
            e.position = pos; e.color = (*c, 1)
        ls.new(source, n.inputs[0]); return n.outputs['Color']
    broad = noise(7, 5)
    patina = ramp(broad, [(0, base), (.47, base), (.64, worn), (.72, rust), (1, rust)])
    grain = noise(190, 2, (1, .055, 1))
    mix = ns.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = .25
    ls.new(patina, mix.inputs[1]); ls.new(ramp(grain, [(0,(.24,)*3),(1,(1,)*3)]), mix.inputs[2])
    ls.new(mix.outputs[0], b.inputs['Base Color'])
    rough = ramp(broad, [(0,(.36,)*3),(.55,(.46,)*3),(.7,(.78,)*3),(1,(.9,)*3)])
    metallic = ramp(broad, [(0,(metal,)*3),(.63,(metal,)*3),(.73,(.08,)*3),(1,(.04,)*3)])
    ls.new(rough, b.inputs['Roughness']); ls.new(metallic, b.inputs['Metallic'])
    bump = node(ns, 'ShaderNodeBump', Strength=.26, Distance=.002)
    ls.new(noise(125, 3), bump.inputs['Height']); ls.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

def scanned(name, folder, saturation, value, tint):
    m=bpy.data.materials.new(name); m.use_nodes=True
    ns,ls=m.node_tree.nodes,m.node_tree.links; b=ns.get('Principled BSDF')
    for kind,socket in [('color','Base Color'),('roughness','Roughness'),('normal','Normal')]:
        t=ns.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(str(R/f'public/assets/textures/{folder}/{kind}.jpg'),check_existing=True)
        if kind!='color': t.image.colorspace_settings.name='Non-Color'
        source=t.outputs['Color']
        if kind=='color':
            h=node(ns,'ShaderNodeHueSaturation',Saturation=saturation,Value=value);ls.new(source,h.inputs['Color'])
            mix=ns.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*tint,1)
            ls.new(h.outputs[0],mix.inputs[1]);source=mix.outputs[0]
        if kind=='normal':
            n=node(ns,'ShaderNodeNormalMap',Strength=.4);ls.new(source,n.inputs['Color']);source=n.outputs['Normal']
        ls.new(source,b.inputs[socket])
    return m

def bake(m, name):
    obj=bpy.context.active_object;obj.data.materials.clear();obj.data.materials.append(m)
    ns,ls=m.node_tree.nodes,m.node_tree.links;b=ns.get('Principled BSDF');output=ns.get('Material Output')
    emission=ns.new('ShaderNodeEmission')
    for channel,socket in [('color','Base Color'),('roughness','Roughness'),('metallic','Metallic'),('normal','Normal')]:
        image=bpy.data.images.new(f'{name}-{channel}',width=1024,height=1024,alpha=False)
        image.colorspace_settings.name='sRGB' if channel=='color' else 'Non-Color'
        target=ns.new('ShaderNodeTexImage');target.image=image;ns.active=target
        if channel=='normal':ls.new(b.outputs[0],output.inputs['Surface'])
        else:
            if b.inputs[socket].is_linked:ls.new(b.inputs[socket].links[0].from_socket,emission.inputs['Color'])
            else:
                for l in list(emission.inputs['Color'].links):ls.remove(l)
                v=b.inputs[socket].default_value;emission.inputs['Color'].default_value=(v,v,v,1) if isinstance(v,float) else v
            ls.new(emission.outputs[0],output.inputs['Surface'])
        bpy.ops.object.bake(type='NORMAL' if channel=='normal' else 'EMIT',margin=4)
        image.filepath_raw=str(OUT/f'{name}-{channel}.png');image.file_format='PNG';image.save()
        ns.remove(target)
    ns.remove(emission);ls.new(b.outputs[0],output.inputs['Surface'])
    m.use_fake_user=True

def baked(name):
    m=bpy.data.materials.new('Armory / '+name);m.use_nodes=True
    ns,ls=m.node_tree.nodes,m.node_tree.links;b=ns.get('Principled BSDF')
    for channel,socket in [('color','Base Color'),('roughness','Roughness'),('metallic','Metallic'),('normal','Normal')]:
        t=ns.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(OUT/f'{name}-{channel}.png'),check_existing=True)
        if channel!='color':t.image.colorspace_settings.name='Non-Color'
        if channel=='normal':
            n=node(ns,'ShaderNodeNormalMap',Strength=.6);ls.new(t.outputs['Color'],n.inputs['Color']);ls.new(n.outputs[0],b.inputs[socket])
        else:ls.new(t.outputs['Color'],b.inputs[socket])
    return m

if '--reuse-textures' not in sys.argv:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.mesh.primitive_plane_add(size=1)
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=8;sc.render.bake.use_clear=True
    recipes={
      'steel':recipe('Blued steel: machining and oxidation',(.075,.085,.09),(.14,.145,.14),(.115,.047,.022),.86),
      'iron':recipe('Blackened iron: pitting and oil',(.022,.025,.026),(.07,.065,.055),(.07,.025,.012),.8),
      'brass':recipe('Antique brass: tarnish and patina',(.29,.18,.07),(.43,.29,.12),(.035,.06,.045),.82),
      'wood':scanned('Old walnut: desaturated oil finish','dark_wood',.5,.42,(.82,.73,.62)),
      'leather':scanned('Smoke-dark glove leather','brown_leather',.2,.18,(.72,.76,.72)),
    }
    for name,m in recipes.items():bake(m,name)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/source/armory-materials.blend'))

# Import only helper definitions; no asset generation side effects.
exec(compile((R/'tools/build-art.py').read_text().split('arg=sys.argv')[0],str(R/'tools/build-art.py'),'exec'))
for i in range(5):
    bpy.ops.wm.open_mainfile(filepath=str(R/f'art/source/weapon-{i}.blend'))
    for old in bpy.data.materials:
        if old.name.startswith('Armory /'):old.name='Previous / '+old.name
    finish_mats={name:baked(name) for name in ['steel','iron','brass','wood','leather']}
    M.update(finish_mats)
    M['black']=mat('Armory / deep recess',(.006,.007,.006),.1,.83)
    M['thread']=mat('Armory / waxed thread',(.12,.105,.078),0,.92)
    canvas=mat('Armory / charcoal canvas',(.021,.026,.022),0,.94)
    # Existing leather grain serves as a fine fabric relief on the sleeves.
    n=canvas.node_tree.nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(OUT/'leather-normal.png'),check_existing=True);n.image.colorspace_settings.name='Non-Color'
    norm=node(canvas.node_tree.nodes,'ShaderNodeNormalMap',Strength=.25);canvas.node_tree.links.new(n.outputs[0],norm.inputs['Color']);canvas.node_tree.links.new(norm.outputs[0],canvas.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
    for o in list(bpy.context.scene.objects):
        if o.name.startswith('Finish /'):bpy.data.objects.remove(o,do_unlink=True);continue
        if o.type not in {'MESH','CURVE','FONT'}:continue
        for slot in o.material_slots:
            old=slot.material.name.lower() if slot.material else ''
            key=next((key for key,terms in {'steel':['gunmetal','armory / steel'],'iron':['black iron','armory / iron'],'brass':['brass'],'wood':['walnut','armory / wood'],'leather':['leather','armory / leather']}.items() if any(t in old for t in terms)),None)
            if key:slot.material=finish_mats[key]
            if 'sleeve' in o.name.lower():slot.material=canvas
            if 'knuckle seam' in o.name.lower():slot.material=M['thread']
            if 'coolant line' in o.name.lower():slot.material=finish_mats['iron']
            if 'discharge' in old:
                b=slot.material.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(.04,.065,.05,1);b.inputs['Emission Strength'].default_value=.13
        for modifier in o.modifiers:
            if modifier.type=='BEVEL':modifier.segments=3
        if o.type=='MESH':
            # Smooth manufactured cylindrical sidewalls while retaining crisp caps.
            if any(s in o.name.lower() for s in ['barrel','reservoir','collar','shaft','coil','chamber','ram','hub','cuff','knob']):
                for p in o.data.polygons:p.use_smooth=len(p.vertices)<=4
            if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
            uv=o.data.uv_layers.active.data
            material=o.data.materials[0].name.lower() if o.data.materials else ''
            size=.48 if 'wood' in material else .20 if 'leather' in material or 'canvas' in material else .28
            for p in o.data.polygons:
                axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3) if k!=axis]
                cylindrical = any(s in o.name.lower() for s in ['barrel','muzzle','reservoir','drive housing','coil ring']) and len(o.data.vertices)>40
                ref = o.data.vertices[o.data.loops[p.loop_start].vertex_index].co
                ref_angle = math.atan2(ref.z,ref.x)
                for li in p.loop_indices:
                    v=o.data.vertices[o.data.loops[li].vertex_index].co
                    if cylindrical and abs(p.normal.y)<.8:
                        angle=ref_angle+(math.atan2(v.z,v.x)-ref_angle+math.pi)%math.tau-math.pi
                        uv[li].uv=(angle*math.hypot(v.x,v.z)/size,v.y/size)
                    else:uv[li].uv=(v[axes[0]]/size,v[axes[1]]/size)
    # Small, mechanically plausible armory details, visible in first-person inspection.
    text('Finish / maker proof','S • 1894',(0,-.045,.146),.017,'brass',rot=(0,0,0))
    for y in [-.115,.137]:
        box('Finish / receiver strap',(-.002,y,.042),(.236,.012,.208),'iron',.004)
    for x in [-.119,.119]:
        for y in [-.11,.13]:cylinder('Finish / peened rivet',(x,y,.045),.009,.011,'brass',axis='X',vertices=16)
    for side,centers,radii in [
      ('right',[(.145,-.32,-.245),(.13,-.28,-.225),(.115,-.245,-.21)],[(.077,.074),(.072,.07),(.068,.065)]),
      ('left',[(-.143,.275,-.173),(-.129,.31,-.16),(-.115,.342,-.146)],[(.071,.065),(.067,.059),(.064,.055)])]:
        loft('Finish / '+side+' glove cuff',centers,radii)
        for p,(rx,rz) in [(centers[0],radii[0]),(centers[-1],radii[-1])]:
            curve('Finish / cuff seam',[(p[0]+rx*math.cos(a*math.tau/20),p[1],p[2]+rz*math.sin(a*math.tau/20)) for a in range(20)],.0012,'thread',closed=True)
    for o in bpy.context.scene.objects:
        if o.type=='MESH' and o.name.startswith('Finish /'):
            if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
            for p in o.data.polygons:
                axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3) if k!=axis]
                for li in p.loop_indices:
                    v=o.data.vertices[o.data.loops[li].vertex_index].co
                    o.data.uv_layers.active.data[li].uv=(v[axes[0]]/.20,v[axes[1]]/.20)
    # Keep export independent of review lighting and preserve the editable curves.
    for o in bpy.context.scene.objects:
        if o.type=='LIGHT':
            if o.location.length>4:o.location*=.1
            o.rotation_euler=(Vector((0,.3,0))-o.location).to_track_quat('-Z','Y').to_euler()
            o.data.color=(.86,.91,1) if o.location.x<0 else (1,.82,.62)
    bpy.context.scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/f'art/source/weapon-{i}.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(bpy.context.scene.objects):
        if o.type in {'CURVE','FONT'}:
            bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=str(R/f'public/assets/models/weapon-{i}.glb'),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    sc=bpy.context.scene;sc.render.filepath=str(R/f'art/renders/weapon-{i}.png');sc.cycles.samples=32
    bpy.ops.render.render(write_still=True)
