# Builds assets/props/living_set.glb from the supplied InteriorTest.blend: furniture pieces only (no walls/floor/roof/trees),
# missing image textures replaced by flat colours or Poly Haven textures. Every piece is a named node sitting on the floor,
# origin at the footprint centre, Blender -Y (room "forward") = glTF -Z.
import sys, os
sys.path.insert(0, '/tmp/bpy_env')
import bpy, mathutils
blend, tex, out = sys.argv[-3], sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=blend)

def mat_flat(name, col, rough=0.6, metal=0.0, emit=None, alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 2.0
    if alpha is not None: b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    return m
def mat_tex(name, img, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex + '/' + img); nt.links.new(t.outputs[0], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M = {
    'wood': mat_tex('wood', 'wood_cabinet_worn_long_Diffuse.jpg', 0.55),
    'marble': mat_tex('marble', 'marble_01_Diffuse.jpg', 0.2),
    'rug': mat_tex('rug', 'fabric_pattern_07_Diffuse.jpg', 0.95),
    'sofa': mat_flat('sofa', (0.82, 0.8, 0.76), 0.9),
    'cushion': mat_flat('cushion', (0.25, 0.32, 0.45), 0.9),
    'black': mat_flat('black', (0.02, 0.02, 0.025), 0.35, 0.3),
    'metal': mat_flat('metal', (0.55, 0.56, 0.6), 0.3, 0.9),
    'glass': mat_flat('glass', (0.7, 0.85, 0.9), 0.05, 0.0, alpha=0.25),
    'lamp': mat_flat('lamp', (1.0, 0.9, 0.7), 0.5, 0.0, emit=(1.0, 0.82, 0.55)),
    'art1': mat_flat('art1', (0.12, 0.42, 0.55), 0.7), 'art2': mat_flat('art2', (0.75, 0.3, 0.25), 0.7), 'art3': mat_flat('art3', (0.9, 0.78, 0.4), 0.7),
    'book': mat_flat('book', (0.5, 0.18, 0.15), 0.7), 'book2': mat_flat('book2', (0.18, 0.3, 0.5), 0.7),
    'clock': mat_flat('clock', (0.9, 0.9, 0.88), 0.5), 'screen': mat_flat('screen', (0.03, 0.04, 0.06), 0.1, 0.5),
}
MAP = {  # blend material -> new material
    'Lemari': 'wood', 'Meja': 'wood', 'Gelas': 'marble', 'Carpet': 'rug', 'Sofa': 'sofa', 'Cusion': 'cushion', 'Sofa Kecil': 'cushion',
    'Aluminium': 'metal', 'KerangkaLemari': 'black', 'PictureBorder': 'black', 'TV': 'black', 'Kaca': 'glass', 'Cermin': 'glass',
    'Emmision': 'lamp', 'Picture': 'art1', 'Picture2': 'art2', 'Picture3': 'art3', 'Picture4': 'art1', 'Book': 'book', 'Book2': 'book2',
    'InsideBook': 'clock', 'Jam': 'clock', 'Netflix': 'screen', 'TiangMeja': 'metal',
}
PIECES = {
    'rug': ['Carpet'],
    'table': ['Meja', 'TiangMeja'],
    'piano': ['Piano'],
    'lamp': ['UnderStandingLamp'],
    'pot': ['Pot'],
    'painting': ['Picture'],
    'photo': ['Foto'],
    'tv': ['TV'],
    'bench': ['Bangku', 'Atas Bangku'],
    'console': ['Cube.011'],
}
objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
report = {}
exported = []
for name, names in PIECES.items():
    sel = [objs[n] for n in names if n in objs]
    if not sel: print('MISSING piece', name); continue
    copies = []
    for o in sel:
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c); copies.append(c)
        c.data.materials.clear() if False else None
        for i, s in enumerate(c.material_slots):
            old = s.material.name if s.material else ''
            s.material = M[MAP.get(old, 'sofa')] if old in MAP else M['black']
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies: c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = name
    # sit on the floor, centre the footprint at the origin, apply transforms
    bb = [j.matrix_world @ v.co for v in j.data.vertices]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2; cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2; z0 = min(v.z for v in bb)
    j.data.transform(j.matrix_world); j.matrix_world = mathutils.Matrix.Identity(4); j.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0)))
    report[name] = (round(max(v.x for v in bb) - min(v.x for v in bb), 2), round(max(v.y for v in bb) - min(v.y for v in bb), 2), round(max(v.z for v in bb) - z0, 2), len(j.data.polygons))
    exported.append(j)
# delete everything that is not an exported piece
for o in list(bpy.data.objects):
    if o not in exported: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='JPEG', export_apply=True, export_materials='EXPORT')
for k, v in report.items(): print('piece', k, 'size(x,y,height)', v[:3], 'polys', v[3])
