# Converts the supplied street_props.blend into two slim GLBs:
#   street_props.glb : vending machines, garbage container, garbage bags, cardboard boxes, AC unit  (origin = footprint centre on the floor)
#   street_signs.glb : the 15 shop signs, stood upright and facing +Z (glTF front); the A-frame board stays as modelled
# Materials are rebuilt from the first image (or the Principled colour) so the glTF exporter gets plain base-colour textures,
# and every image is scaled down first. usage: python3 bake_street_props.py <street_props.blend> <out dir>
import sys, os, math
sys.path.insert(0, '/tmp/bpy_env')
import bpy, mathutils
blend, out = sys.argv[-2], sys.argv[-1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend)
SIZE = {'signs.jpg': 2048, 'signs 2.jpg': 2048, 'props.jpg.png': 1024, 'box color.jpg': 1024, 'store props_BaseColor.png': 512}
for img in bpy.data.images:
    s = SIZE.get(img.name, 512)
    if img.size[0] > s: img.scale(s, int(img.size[1] * s / img.size[0]))
cache = {}
def rebuilt(mat):
    if mat.name in cache: return cache[mat.name]
    m = bpy.data.materials.new('r_' + mat.name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.65
    src = mat.node_tree
    img = next((n.image for n in src.nodes if n.type == 'TEX_IMAGE' and n.image), None) if src else None
    if img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs[0], b.inputs['Base Color'])
    else:
        p = next((n for n in src.nodes if n.type == 'BSDF_PRINCIPLED'), None) if src else None
        c = tuple(p.inputs['Base Color'].default_value) if p else (0.6, 0.6, 0.6, 1)
        b.inputs['Base Color'].default_value = c
        if mat.name == 'metal': b.inputs['Metallic'].default_value = 0.8; b.inputs['Roughness'].default_value = 0.4
    cache[mat.name] = m
    return m
PROPS = {'vend_blue': 'TexturesCom_Various0458_1_M', 'vend_dark': 'props.001', 'container': 'container', 'ac_unit': 'ac unit',
         'bag1': 'g bag1', 'bag2': 'g bag2', 'bag3': 'g bag3', 'bag4': 'g bag4', 'bag5': 'g bag5', 'box1': 'box1', 'box2': 'box2', 'box3': 'box3'}
SIGNS = {f'sign{i}': f'sign{i}' for i in range(1, 16)}
objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
def export(group, outfile, stand):
    kept = []
    for new, old in group.items():
        o = objs.get(old)
        if not o: print('MISSING', old); continue
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c); c['final'] = new
        for s in c.material_slots:
            if s.material: s.material = rebuilt(s.material)
        c.data.transform(c.matrix_world); c.matrix_world = mathutils.Matrix.Identity(4)
        if stand and new != 'sign15': c.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, 'X'))
        bb = [v.co for v in c.data.vertices]
        cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2; cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2; z0 = min(v.z for v in bb)
        c.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0)))
        kept.append(c)
    for o in list(bpy.data.objects):
        if o not in kept: bpy.data.objects.remove(o, do_unlink=True)
    for c in kept: c.name = c['final']; c.data.name = c['final']  # originals are gone now, so no '.001' suffix (GLTFLoader would also strip the dot)
    bpy.ops.export_scene.gltf(filepath=outfile, export_format='GLB', export_yup=True, export_image_format='WEBP', export_image_webp_fallback=False, export_apply=True)
    print('exported', len(kept), outfile, [(c.name, [round(x, 2) for x in c.dimensions]) for c in kept][:20])
    return kept
which = os.environ.get('WHICH', 'props')
if which == 'props': export(PROPS, out + '/street_props.glb', False)
else: export(SIGNS, out + '/street_signs.glb', True)
