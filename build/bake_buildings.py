# Converts the 10 Unity "Residential Buildings" FBX files into slim GLBs sharing one baked wall texture (Wall_C x AO atlas).
# usage: python3 bake_buildings.py <dir with fbx/ and tex/> <out dir>
import sys, os, math
sys.path.insert(0, '/tmp/bpy_env')
import bpy
src, out = sys.argv[-2], sys.argv[-1]
os.makedirs(out, exist_ok=True)
import numpy as np
def load(p, scene=None):
    img = bpy.data.images.load(p); img.colorspace_settings.name = 'sRGB'
    w, h = img.size; a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4); return a
S = 2048
def resize(a, s):
    h, w = a.shape[:2]; yi = (np.arange(s) * h // s); xi = (np.arange(s) * w // s); return a[yi][:, xi]
wall = resize(load(src + '/tex/Wall_C.jpg'), S); ao = resize(load(src + '/tex/Hotel_Hous_AO.png'), S)
bake = wall.copy(); bake[..., :3] = wall[..., :3] * (0.35 + 0.65 * ao[..., :1]); bake[..., 3] = 1
img = bpy.data.images.new('bake', S, S); img.pixels = bake.ravel().tolist(); img.filepath_raw = out + '/res_wall.jpg'; img.file_format = 'JPEG'
bpy.context.scene.render.image_settings.quality = 82; img.save_render(out + '/res_wall.jpg')
for i in range(1, 11):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f'{src}/fbx/Residential_Buildings_{i:03d}.fbx')
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    wimg = bpy.data.images.load(out + '/res_wall.jpg')
    for m in ob.data.materials:
        m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], o.inputs[0])
        if m.name == 'ground':
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = wimg; nt.links.new(t.outputs[0], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.85
            m.name = 'res_wall'
        else:
            b.inputs['Base Color'].default_value = (0.10, 0.17, 0.26, 1); b.inputs['Roughness'].default_value = 0.08; b.inputs['Metallic'].default_value = 0.7
            m.name = 'res_glass'
    # origin to footprint centre on the ground; FBX import is Z-up, glTF export converts to Y-up
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bb = [ob.matrix_world @ v.co for v in ob.data.vertices]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2; cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2; z0 = min(v.z for v in bb)
    ob.data.transform(__import__('mathutils').Matrix.Translation((-cx, -cy, -z0)))
    ob.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=f'{out}/res_{i:02d}.glb', export_format='GLB', export_yup=True, export_image_format='JPEG', export_apply=True, export_normals=True, export_texcoords=True)
    print('exported', i, [round(x, 1) for x in ob.dimensions])
