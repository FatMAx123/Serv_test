#!/usr/bin/env python3
"""
Build & optimize free CC0 itch.io 3D props for Operators Territory:
- All Avramania + 3dmodelscc0 props packed into 1 shared 1024x1024 WebP atlas (opt_camp_atlas.webp)
- All Quaternius Fantasy Props baked (Diffuse * VertexColor) into 1 shared 1024x1024 WebP atlas (opt_quat_atlas.webp)
  so EVERY prop uses ONLY ONE material (1 draw call per InstancedMesh batch!)
- Draco compression + clean bottom-center pivot + lean LODs + smart shadow culling for indoor/tiny props.

Run:
  "D:\\3d\\Blernder\\blender.exe" -b --factory-startup -P scripts/operators-territory/build_itch_props.py
  python scripts/operators-territory/build_itch_props.py --pack-textures
"""
import json
import math
import os
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ITCH_RAW = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\cdcfa7f9-61ba-4185-b32c-acd3d241ec7a\scratch\itch_raw"
OUT_MODELS = os.path.join(ROOT, 'client', 'assets', 'props', 'operators')
OUT_TEX = os.path.join(ROOT, 'client', 'assets', 'props', 'textures')
BAKE_TMP = os.path.join(HERE, '_tmp_bake')
MANIFEST_PATH = os.path.join(HERE, 'itch-manifest.json')
LICENSE_OUT = os.path.join(OUT_MODELS, 'LICENSES.txt')

os.makedirs(OUT_MODELS, exist_ok=True)
os.makedirs(OUT_TEX, exist_ok=True)
os.makedirs(BAKE_TMP, exist_ok=True)

ATLAS_TILES = {
    'mdvl': (0, 0),
    'gas_cylinder': (1, 0),
    'cable_drum': (2, 0),
    'work_light': (3, 0),
    'ind_barrel': (0, 1),
    'cannon': (1, 1),
    'sack': (2, 1),
    'warm_amber': (3, 2),
}


def find_raw(filename):
    hits = glob.glob(os.path.join(ITCH_RAW, '**', filename), recursive=True)
    if not hits:
        raise FileNotFoundError('Missing in itch_raw: ' + filename)
    return hits[0]


def pack_textures_pil():
    from PIL import Image, ImageEnhance

    # 1. Non-wrapping camp props -> 1024x1024 opt_camp_atlas.webp
    atlas = Image.new('RGB', (1024, 1024), (90, 82, 74))

    def put_tile(col_i, row_i, fname):
        im = Image.open(find_raw(fname)).convert('RGB')
        tile = im.resize((256, 256), Image.Resampling.LANCZOS)
        atlas.paste(tile, (col_i * 256, row_i * 256))

    put_tile(0, 0, "mdvl_palette.png")
    put_tile(1, 0, "Gas_Cylinder_Base_Color.png")
    put_tile(2, 0, "CableDrum_Base_Color.png")
    put_tile(3, 0, "WorkLight_Base_Color.png")
    put_tile(0, 1, "ExplosiveBarrel_Base_Color.png")
    put_tile(1, 1, "Cannon_Base_Color-min.png")
    put_tile(2, 1, "Sack_Base_Color.png")
    atlas.save(os.path.join(OUT_TEX, "opt_camp_atlas.webp"), "WEBP", quality=84, method=6)

    # 2. Baked Quaternius tiles -> 1024x1024 opt_quat_atlas.webp (5 cols x 4 rows = 200x250 each? Clean 4x5 -> 256x200 tiles!)
    quat_atlas = Image.new('RGB', (1024, 1024), (110, 92, 72))
    slots = json.load(open(os.path.join(BAKE_TMP, 'quat_slots.json'), encoding='utf-8'))
    for prop_id, slot in slots.items():
        png_p = os.path.join(BAKE_TMP, prop_id + '.png')
        if not os.path.exists(png_p):
            continue
        col_i, row_i, tw, th = slot['col'], slot['row'], slot['tw'], slot['th']
        im = Image.open(png_p).convert('RGB')
        if im.size != (tw, th):
            im = im.resize((tw, th), Image.Resampling.LANCZOS)
        im = ImageEnhance.Contrast(im).enhance(1.08)
        quat_atlas.paste(im, (col_i * tw, row_i * th))

    out_q = os.path.join(OUT_TEX, "opt_quat_atlas.webp")
    quat_atlas.save(out_q, "WEBP", quality=85, method=6)
    print("[itch-tex] opt_camp_atlas.webp =", os.path.getsize(os.path.join(OUT_TEX, "opt_camp_atlas.webp")),
          "| opt_quat_atlas.webp =", os.path.getsize(out_q))


if '--pack-textures' in sys.argv:
    pack_textures_pil()
    sys.exit(0)


import bpy
import bmesh
from mathutils import Matrix

# Quaternius source textures map
QUAT_TEX_CACHE = {}


def load_raw_image(fname):
    if fname not in QUAT_TEX_CACHE:
        img = bpy.data.images.load(find_raw(fname), check_existing=True)
        QUAT_TEX_CACHE[fname] = img
    return bpy.data.images.load(find_raw(fname), check_existing=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def get_or_make_simple_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_backface_culling = True
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.85
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.0
    return m


def prepare_bake_material_tree(ob, src_mats, prop_id):
    """
    Replace each source material node tree with an Emit tree multiplying:
      TrimTexture(origUV) * VertexColor(or Operator Banner Tint)
    so Cycles EMIT bake produces one crisp texture cleanly capturing trims + vcols.
    """
    vcol_name = ob.data.color_attributes[0].name if len(ob.data.color_attributes) else None
    for idx, orig_name in enumerate(src_mats):
        m = ob.data.materials[idx]
        if not m:
            continue
        low = (orig_name or '').lower()
        if 'cloth' in low or 'banner' in low:
            tex_file = 'T_Trim_Cloth_BaseColor.png'
        elif 'metal' in low:
            tex_file = 'T_Trim_Metal_BaseColor.png'
        elif 'prop' in low:
            tex_file = 'T_Trim_Props_BaseColor.png'
        else:
            tex_file = 'T_Trim_Furniture_BaseColor.png'

        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        emit = nt.nodes.new('ShaderNodeEmission')
        emit.inputs['Strength'].default_value = 1.0

        tex_node = nt.nodes.new('ShaderNodeTexImage')
        tex_node.image = bpy.data.images.load(find_raw(tex_file), check_existing=True)
        uv_orig = nt.nodes.new('ShaderNodeUVMap')
        uv_orig.uv_map = ob.data.uv_layers[0].name
        nt.links.new(uv_orig.outputs['UV'], tex_node.inputs['Vector'])

        color_out = tex_node.outputs['Color']

        # Apply Operator guild tint or preserve vertex color cleanly
        if ('cloth' in low or 'banner' in low) and prop_id == 'opt_dummy':
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            mul.inputs[7].default_value = (0.84, 0.68, 0.44, 1.0)
            nt.links.new(color_out, mul.inputs[6])
            color_out = mul.outputs[2]
        elif ('cloth' in low or 'banner' in low) and prop_id in ('opt_banner_stand', 'opt_banner_hang'):
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            mul.inputs[7].default_value = (0.72, 0.14, 0.12, 1.0) if prop_id == 'opt_banner_stand' else (0.18, 0.30, 0.54, 1.0)
            nt.links.new(color_out, mul.inputs[6])
            color_out = mul.outputs[2]
        elif vcol_name and ('vertex' in low or 'banner' in low or 'prop' in low):
            va = nt.nodes.new('ShaderNodeVertexColor')
            va.layer_name = vcol_name
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            nt.links.new(color_out, mul.inputs[6])
            nt.links.new(va.outputs['Color'], mul.inputs[7])
            color_out = mul.outputs[2]

        # Chandelier/Lantern candles warm glow
        if prop_id in ('opt_chandelier', 'opt_lantern_indoor') and ('prop' in low):
            warm = nt.nodes.new('ShaderNodeMix')
            warm.data_type = 'RGBA'
            warm.blend_type = 'SCREEN'
            warm.inputs['Factor'].default_value = 0.45
            warm.inputs[7].default_value = (0.98, 0.65, 0.18, 1.0)
            nt.links.new(color_out, warm.inputs[6])
            color_out = warm.outputs[2]

        nt.links.new(color_out, emit.inputs['Color'])
        nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])


def bake_prop_to_slot(ob, prop_id, col_i, row_i, tw, th):
    bake_uv = ob.data.uv_layers.new(name='BakeUV')
    bake_name = str(bake_uv.name)
    ob.data.uv_layers.active = bake_uv

    # Fast Smart UV Project into [0..1] on BakeUV
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Bake EMIT image at (tw, th)
    img = bpy.data.images.new(prop_id + '_bake', width=tw, height=th)
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bnode = nt.nodes.new('ShaderNodeTexImage')
        bnode.image = img
        for n in nt.nodes:
            n.select = False
        bnode.select = True
        nt.nodes.active = bnode

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 4
    bpy.ops.object.bake(type='EMIT', use_clear=True)

    png_out = os.path.join(BAKE_TMP, prop_id + '.png')
    img.filepath_raw = png_out
    img.file_format = 'PNG'
    img.save()

    # Replace object's UV with BakeUV mapped into opt_quat_atlas slot, and unify 1 material!
    while len(ob.data.uv_layers) > 1:
        for l in list(ob.data.uv_layers):
            if l.name != bake_name:
                ob.data.uv_layers.remove(l)
                break
    bake_uv = ob.data.uv_layers[bake_name]
    bake_uv.name = 'UVMap'

    # Atlas transform: PNG row 0..4 top-down -> Blender V = 1 - y/1024
    u0 = (col_i * tw + 3.0) / 1024.0
    u_span = (tw - 6.0) / 1024.0
    v_top = 1.0 - (row_i * th + 3.0) / 1024.0
    v_bot = 1.0 - ((row_i + 1) * th - 3.0) / 1024.0
    v_span = v_top - v_bot
    for d in bake_uv.data:
        uc = max(0.0, min(1.0, d.uv[0]))
        vc = max(0.0, min(1.0, d.uv[1]))
        d.uv[0] = u0 + uc * u_span
        d.uv[1] = v_bot + vc * v_span

    mat = get_or_make_simple_mat('opt_quat_atlas')
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0


def remap_uv_tile(mesh, col_i, row_i):
    if not mesh.uv_layers:
        return
    uvl = mesh.uv_layers.active.data
    u0 = (col_i * 256.0 + 3.0) / 1024.0
    u_span = (256.0 - 6.0) / 1024.0
    v_top = 1.0 - (row_i * 256.0 + 3.0) / 1024.0
    v_bot = 1.0 - ((row_i + 1) * 256.0 - 3.0) / 1024.0
    v_span = v_top - v_bot
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv = uvl[li].uv
            uv[0] = u0 + max(0.0, min(1.0, uv[0])) * u_span
            uv[1] = v_bot + max(0.0, min(1.0, uv[1])) * v_span


def import_and_merge(filepath, rot_z_deg=0.0, rot_x_deg=0.0, uniform_scale=1.0, scale_xyz=None):
    clear_scene()
    ext = os.path.splitext(filepath)[1].lower()
    if ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=filepath)
    else:
        bpy.ops.import_scene.fbx(filepath=filepath)

    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    M = Matrix.Identity(4)
    if scale_xyz is not None:
        M = Matrix.Diagonal((scale_xyz[0], scale_xyz[1], scale_xyz[2], 1.0)) @ M
    elif uniform_scale != 1.0:
        M = Matrix.Scale(uniform_scale, 4) @ M
    if rot_z_deg:
        M = Matrix.Rotation(math.radians(rot_z_deg), 4, 'Z') @ M
    if rot_x_deg:
        M = Matrix.Rotation(math.radians(rot_x_deg), 4, 'X') @ M
    if M != Matrix.Identity(4):
        ob.data.transform(M)

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()

    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    ob.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2.0, -(min(ys) + max(ys)) / 2.0, -min(zs))))
    ob.data.update()
    return ob


def make_lod_clone(src_ob, lod_name, ratio):
    me = src_ob.data.copy()
    ob = bpy.data.objects.new(lod_name, me)
    bpy.context.collection.objects.link(ob)
    if ratio < 0.99:
        mod = ob.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def tri_count(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    ob.evaluated_get(deps).to_mesh_clear()
    return n


# Lean LOD & shadow rules:
# - Small indoor / <1.5m props skip shadow pass (shadow=False) -> slashes ~50% shadow draw calls
# - Props <= 1600 tris keep 1 close LOD0 (plus optional far _LOD2 beyond 95m) -> no mid-courtyard LOD split
SPECS = [
    # Quaternius (19 models packed cleanly on 4x5 grid = 256x204 tiles in 1024x1024 opt_quat_atlas.webp)
    ('opt_dummy',        'quaternius_fantasy_props/extracted/Exports/glTF/Dummy.gltf',
     dict(pack='quat', scale=1.0, lod=(0.65, 0.0, 0.25), shadow=True,
          nameRu='Тренировочный манекен', nameEn='Training Dummy', cat='training', shape='cylinder',
          drawDist=260, lodDist=[75, 130], collider=(0.9, 0.9, 1.9))),
    ('opt_weapon_rack',  'quaternius_fantasy_props/extracted/Exports/glTF/WeaponStand.gltf',
     dict(pack='quat', scale=1.05, lod=(0.68, 0.0, 0.28), shadow=True,
          nameRu='Стойка с оружием', nameEn='Weapon Stand', cat='training', shape='box',
          drawDist=240, lodDist=[75, 130], collider=(1.5, 1.0, 1.3))),
    ('opt_anvil',        'quaternius_fantasy_props/extracted/Exports/glTF/Anvil_Log.gltf',
     dict(pack='quat', scale=1.05, lod=(0.45, 0.0, 0.20), shadow=True,
          nameRu='Наковальня полевой кузни', nameEn='Field Anvil', cat='forges', shape='box',
          drawDist=220, lodDist=[75, 120], collider=(1.0, 0.9, 1.15))),
    ('opt_whetstone',    'quaternius_fantasy_props/extracted/Exports/glTF/Whetstone.gltf',
     dict(pack='quat', scale=1.05, lod=(0.85, 0.0, 0.0), shadow=False,
          nameRu='Точильный станок', nameEn='Whetstone Wheel', cat='forges', shape='box',
          drawDist=200, lodDist=[90, 140], collider=(1.2, 0.95, 1.25))),
    ('opt_workbench',    'quaternius_fantasy_props/extracted/Exports/glTF/Workbench.gltf',
     dict(pack='quat', scale=1.0, lod=(0.80, 0.0, 0.0), shadow=False,
          nameRu='Верстак механика', nameEn='Mechanic Workbench', cat='workshops', shape='box',
          drawDist=200, lodDist=[90, 140], collider=(2.05, 1.05, 1.05))),
    ('opt_table_long',   'quaternius_fantasy_props/extracted/Exports/glTF/Table_Large.gltf',
     dict(pack='quat', scale=1.0, lod=(0.90, 0.0, 0.0), shadow=False,
          nameRu='Штабной стол', nameEn='Staff Table', cat='furniture', shape='box',
          drawDist=180, lodDist=[90, 140], collider=(2.85, 1.10, 0.95))),
    ('opt_bench_camp',   'quaternius_fantasy_props/extracted/Exports/glTF/Bench.gltf',
     dict(pack='quat', scale=1.0, lod=(1.0, 0.0, 0.0), shadow=False,
          nameRu='Деревянная скамья', nameEn='Camp Bench', cat='furniture', shape='box',
          drawDist=180, lodDist=[90, 140], collider=(2.78, 0.56, 0.6))),
    ('opt_chair',        'quaternius_fantasy_props/extracted/Exports/glTF/Chair_1.gltf',
     dict(pack='quat', scale=1.05, lod=(1.0, 0.0, 0.0), shadow=False,
          nameRu='Стул штаба', nameEn='Officer Chair', cat='furniture', shape='box',
          drawDist=140, lodDist=[80, 120], collider=(0.62, 0.60, 1.1))),
    ('opt_bookcase',     'quaternius_fantasy_props/extracted/Exports/glTF/Bookcase_2.gltf',
     dict(pack='quat', scale=1.0, lod=(0.65, 0.0, 0.0), shadow=False,
          nameRu='Шкаф уставов и чертежей', nameEn='Charter Bookcase', cat='furniture', shape='box',
          drawDist=180, lodDist=[90, 140], collider=(1.48, 0.48, 2.55))),
    ('opt_bookstand',    'quaternius_fantasy_props/extracted/Exports/glTF/BookStand.gltf',
     dict(pack='quat', scale=1.05, lod=(0.75, 0.0, 0.0), shadow=False,
          nameRu='Пюпитр с уставом', nameEn='Charter Lectern', cat='furniture', shape='cylinder',
          drawDist=160, lodDist=[90, 140], collider=(0.65, 0.65, 1.5))),
    ('opt_cabinet',      'quaternius_fantasy_props/extracted/Exports/glTF/Cabinet.gltf',
     dict(pack='quat', scale=1.05, lod=(0.65, 0.0, 0.0), shadow=False,
          nameRu='Шкаф снабжения', nameEn='Supply Cabinet', cat='furniture', shape='box',
          drawDist=160, lodDist=[90, 140], collider=(1.45, 0.45, 1.1))),
    ('opt_chandelier',   'quaternius_fantasy_props/extracted/Exports/glTF/Chandelier.gltf',
     dict(pack='quat', scale=1.45, lod=(0.38, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Люстра бастиона', nameEn='Bastion Chandelier', cat='furniture', shape='box',
          drawDist=180, lodDist=[90, 140])),
    ('opt_lantern_indoor','quaternius_fantasy_props/extracted/Exports/glTF/Lantern_Wall.gltf',
     dict(pack='quat', scale=0.85, lod=(0.45, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Настенный фонарь', nameEn='Wall Lantern', cat='steampunk', shape='box',
          drawDist=180, lodDist=[90, 140])),
    ('opt_chest',        'quaternius_fantasy_props/extracted/Exports/glTF/Chest_Wood.gltf',
     dict(pack='quat', scale=0.78, lod=(0.55, 0.0, 0.0), shadow=False,
          nameRu='Сундук снаряжения', nameEn='Supply Chest', cat='containers', shape='box',
          drawDist=180, lodDist=[90, 140], collider=(1.55, 1.55, 1.65))),
    ('opt_barrel',       'quaternius_fantasy_props/extracted/Exports/glTF/Barrel.gltf',
     dict(pack='quat', scale=1.05, lod=(0.85, 0.0, 0.0), shadow=False,
          nameRu='Дубовая бочка', nameEn='Oak Barrel', cat='containers', shape='cylinder',
          drawDist=200, lodDist=[90, 140], collider=(0.78, 0.78, 1.0))),
    ('opt_crate',        'quaternius_fantasy_props/extracted/Exports/glTF/Crate_Wooden.gltf',
     dict(pack='quat', scale=1.05, lod=(0.70, 0.0, 0.0), shadow=False,
          nameRu='Ящик припасов', nameEn='Wooden Crate', cat='containers', shape='box',
          drawDist=200, lodDist=[90, 140], collider=(0.95, 0.98, 1.0))),
    ('opt_crate_iron',   'quaternius_fantasy_props/extracted/Exports/glTF/Crate_Metal.gltf',
     dict(pack='quat', scale=1.10, lod=(0.55, 0.0, 0.0), shadow=False,
          nameRu='Клёпаный железный контейнер', nameEn='Riveted Iron Crate', cat='steampunk', shape='box',
          drawDist=220, lodDist=[90, 140], collider=(1.0, 1.0, 1.0))),
    ('opt_banner_stand', 'quaternius_fantasy_props/extracted/Exports/glTF/Banner_1.gltf',
     dict(pack='quat', scale=1.25, lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Штандарт операторов', nameEn='Operator Standard Banner', cat='monuments', shape='cylinder',
          drawDist=320, lodDist=[95, 150], collider=(0.45, 0.45, 3.0))),
    ('opt_banner_hang',  'quaternius_fantasy_props/extracted/Exports/glTF/Banner_2.gltf',
     dict(pack='quat', scale=1.15, lod=(1.0, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Настенный стяг бастиона', nameEn='Bastion Wall Banner', cat='furniture', shape='box',
          drawDist=200, lodDist=[90, 140])),

    # Avramania & 3dmodelscc0 (9 models packed cleanly on opt_camp_atlas.webp)
    ('opt_palisade',     'avramania_props/extracted/Props_Tools_Fencing/glTF/mdvl_props_fence_wood_01.glb',
     dict(pack='atlas', tile='mdvl', scale_xyz=(2.4, 2.0, 1.65), lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Палисад лагеря операторов', nameEn='Operator Camp Palisade', cat='walls', shape='box',
          drawDist=340, lodDist=[90, 150], collider=(2.45, 0.45, 2.2))),
    ('opt_weapon_rack_b','avramania_weapons/extracted/Weapons_Shields/glTF/mdvl_weapons_rack_01.glb',
     dict(pack='atlas', tile='mdvl', scale=1.05, lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Пирамида клинков и копий', nameEn='Blade & Spear Rack', cat='training', shape='box',
          drawDist=240, lodDist=[85, 140], collider=(1.32, 0.50, 1.65))),
    ('opt_rubble_pile',  'avramania_ruins/extracted/Dungeon_Ruins/glTF/mdvl_dungeon_rubble_01.glb',
     dict(pack='atlas', tile='mdvl', scale=1.35, lod=(0.80, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Каменная осыпь руин', nameEn='Stone Rubble Mound', cat='ruins', shape='box',
          drawDist=220, lodDist=[80, 130])),
    ('opt_camp_rug',     'avramania_interiors/extracted/Interiors_Furniture/glTF/mdvl_interiors_rug_01.glb',
     dict(pack='atlas', tile='mdvl', scale_xyz=(2.8, 3.6, 1.0), lod=(1.0, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Ковёр штабного зала', nameEn='Bastion Hall Runner Rug', cat='furniture', shape='box',
          drawDist=160, lodDist=[80, 130])),
    ('opt_gas_cylinder', '3dmodelscc0_industrial/extracted/IndustrialPack/Gas_Cylinder/Gas_Cylinder.fbx',
     dict(pack='atlas', tile='gas_cylinder', scale=1.55, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Паровой баллон давления', nameEn='High-Pressure Steam Cylinder', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(0.62, 0.62, 1.15))),
    ('opt_cable_drum',   '3dmodelscc0_industrial/extracted/IndustrialPack/CableDrum/CableDrum.fbx',
     dict(pack='atlas', tile='cable_drum', scale=1.05, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Катушка парового привода', nameEn='Conduit Cable Drum', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(1.1, 1.1, 1.1))),
    ('opt_work_light',   '3dmodelscc0_industrial/extracted/IndustrialPack/WorkLight/WorkLight.fbx',
     dict(pack='atlas', tile='work_light', scale=1.45, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Прожектор полигона', nameEn='Training Yard Worklight', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(0.65, 0.65, 0.9))),
    ('opt_cannon',       '3dmodelscc0_medieval/extracted/MedievalPropsPack/Cannon/Cannon.fbx',
     dict(pack='atlas', tile='cannon', rot_z_deg=-90.0, scale=0.88, lod=(0.55, 0.0, 0.25), shadow=True,
          nameRu='Паровое орудие бастиона', nameEn='Steam Bastion Cannon', cat='weapons', shape='box',
          drawDist=320, lodDist=[85, 145], collider=(1.55, 2.6, 1.45))),
    ('opt_sack_grain',   '3dmodelscc0_medieval/extracted/MedievalPropsPack/SackOfGrain/SackOfGrain.fbx',
     dict(pack='atlas', tile='sack', scale=1.35, lod=(0.90, 0.0, 0.0), shadow=False,
          nameRu='Мешок снабжения', nameEn='Supply Sack', cat='containers', shape='cylinder',
          drawDist=180, lodDist=[85, 130], collider=(0.75, 0.75, 0.75))),
]


def main():
    manifest = {
        'dir': 'operators',
        'textures': ['opt_camp_atlas.webp', 'opt_quat_atlas.webp'],
        'pieces': {}
    }
    quat_slots = {}
    q_idx = 0
    COLS, ROWS = 4, 5
    TW, TH = 1024 // COLS, 1024 // ROWS  # 256 x 204 -> top 256x204 slots

    for prop_id, rel_path, cfg in SPECS:
        src = find_raw(os.path.basename(rel_path))
        ob = import_and_merge(
            src,
            rot_z_deg=cfg.get('rot_z_deg', 0.0),
            rot_x_deg=cfg.get('rot_x_deg', 0.0),
            uniform_scale=cfg.get('scale', 1.0),
            scale_xyz=cfg.get('scale_xyz'),
        )

        if cfg['pack'] == 'atlas':
            col_i, row_i = ATLAS_TILES[cfg['tile']]
            remap_uv_tile(ob.data, col_i, row_i)
            mat = get_or_make_simple_mat('opt_camp_atlas')
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            for poly in ob.data.polygons:
                poly.material_index = 0
        else:
            src_mats = [m.name if m else '' for m in ob.data.materials]
            prepare_bake_material_tree(ob, src_mats, prop_id)
            col_i = q_idx % COLS
            row_i = q_idx // COLS
            q_idx += 1
            quat_slots[prop_id] = {'col': col_i, 'row': row_i, 'tw': TW, 'th': TH}
            bake_prop_to_slot(ob, prop_id, col_i, row_i, TW, TH)

        xs = [v.co.x for v in ob.data.vertices]
        ys = [v.co.y for v in ob.data.vertices]
        zs = [v.co.z for v in ob.data.vertices]
        size_game = [round(max(xs) - min(xs), 3), round(max(zs) - min(zs), 3), round(max(ys) - min(ys), 3)]

        r0, r1, r2 = cfg['lod']
        ob0 = make_lod_clone(ob, prop_id, r0)
        bpy.data.objects.remove(ob, do_unlink=True)

        tris = [tri_count(ob0), 0, 0]
        objs = [ob0]
        kept = [0]

        if r2 > 0.05:
            ob2 = make_lod_clone(ob0, prop_id + '_LOD2', r2 / max(0.01, r0))
            t2 = tri_count(ob2)
            if t2 <= 0.65 * tris[0]:
                objs.append(ob2)
                kept.append(2)
                tris[2] = t2
            else:
                bpy.data.objects.remove(ob2, do_unlink=True)

        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]

        out_glb = os.path.join(OUT_MODELS, prop_id + '.glb')
        bpy.ops.export_scene.gltf(
            filepath=out_glb,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_image_format='NONE',
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=14,
            export_yup=True,
        )

        bytes_len = os.path.getsize(out_glb)
        cols = []
        if cfg.get('collision', True):
            cw, cd, ch = cfg.get('collider', (size_game[0], size_game[2], size_game[1]))
            cols.append({
                'x': 0.0, 'z': 0.0,
                'w': round(cw, 3), 'd': round(cd, 3), 'h': round(ch, 3), 'y0': 0.0,
                'shape': cfg.get('shape', 'box')
            })
        manifest['pieces'][prop_id] = {
            'file': 'operators/' + prop_id + '.glb',
            'size': size_game,
            'tris': tris,
            'lods': kept,
            'bytes': bytes_len,
            'colliders': cols,
            'collision': bool(cfg.get('collision', True)),
            'shape': cfg.get('shape', 'box'),
            'drawDist': cfg.get('drawDist', 220),
            'lodDist': cfg.get('lodDist', [85, 140]),
            'shadow': cfg.get('shadow', False),
            'nameRu': cfg['nameRu'],
            'nameEn': cfg['nameEn'],
            'category': cfg['cat'],
            'pack': cfg['pack'],
            'source': rel_path,
        }
        print(f"[itch-opt] {prop_id:18s} tris={tris[0]:4d}/{tris[2]:4d} mats=1 -> {bytes_len:6d} B")

    with open(os.path.join(BAKE_TMP, 'quat_slots.json'), 'w', encoding='utf-8') as f:
        json.dump(quat_slots, f, indent=1)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    lic_txt = """PROJECT STEAM: ORIGINS — OPERATORS TERRITORY 3D ASSETS LICENSES
=================================================================

1. PROCEDURAL ARCHITECTURE & RUINS (CC0 / Project Original)
   - Files: opt_bastion.glb, opt_hero_monument.glb, opt_column*.glb, opt_arch.glb,
            opt_ruin*.glb, opt_debris.glb, opt_block.glb, opt_slab.glb, opt_lamp.glb,
            textures/opt_atlas.webp
   - Origin: Procedurally generated for Project Steam via headless Blender
     (scripts/operators-territory/build_kit.py & atlas.py), inspired in mood/composition
     by classic fantasy fortress ruins (0% external / L2 copied assets).

2. QUATERNIUS — FANTASY PROPS MEGAKIT (Standard Free Edition)
   - Author: Quaternius (@Quaternius)
   - URL: https://quaternius.itch.io/fantasy-props-megakit
   - License: CC0 1.0 Universal (Public Domain Dedication)
     https://creativecommons.org/publicdomain/zero/1.0/
   - Imported & Draco/LOD/Atlas-baked single-material models:
     opt_dummy.glb (Dummy.gltf), opt_weapon_rack.glb (WeaponStand.gltf),
     opt_anvil.glb (Anvil_Log.gltf), opt_whetstone.glb (Whetstone.gltf),
     opt_workbench.glb (Workbench.gltf), opt_table_long.glb (Table_Large.gltf),
     opt_bench_camp.glb (Bench.gltf), opt_chair.glb (Chair_1.gltf),
     opt_bookcase.glb (Bookcase_2.gltf), opt_bookstand.glb (BookStand.gltf),
     opt_cabinet.glb (Cabinet.gltf), opt_chandelier.glb (Chandelier.gltf),
     opt_lantern_indoor.glb (Lantern_Wall.gltf), opt_chest.glb (Chest_Wood.gltf),
     opt_barrel.glb (Barrel.gltf), opt_crate.glb (Crate_Wooden.gltf),
     opt_crate_iron.glb (Crate_Metal.gltf), opt_banner_stand.glb (Banner_1.gltf),
     opt_banner_hang.glb (Banner_2.gltf).
   - Shared baked atlas (<=256px per prop inside 1024x1024 WebP q85):
     textures/opt_quat_atlas.webp.

3. AVRAMANIA ASSET LIBRARY (Free Editions)
   - Author: Avramania (https://www.avramania.com/)
   - URLs: https://avramania.itch.io/medieval-props-tools-fencing-free-pack
           https://avramania.itch.io/medieval-weapons-shields-free-pack
           https://avramania.itch.io/medieval-dungeon-ruins-free-pack
           https://avramania.itch.io/medieval-interiors-furniture-free-pack
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Imported & Draco/Atlas-optimized single-material models:
     opt_palisade.glb (mdvl_props_fence_wood_01.glb),
     opt_weapon_rack_b.glb (mdvl_weapons_rack_01.glb),
     opt_rubble_pile.glb (mdvl_dungeon_rubble_01.glb),
     opt_camp_rug.glb (mdvl_interiors_rug_01.glb).

4. 3DMODELSCC0 — INDUSTRIAL & MEDIEVAL PROPS PACKS
   - Author: 3dmodelscc0
   - URLs: https://3dmodelscc0.itch.io/free-cc0-industrial-3d-models
           https://3dmodelscc0.itch.io/free-cc0-medieval-props
   - License: CC0 Public Domain (https://creativecommons.org/publicdomain/zero/1.0/)
   - Imported & Draco/Atlas-optimized single-material models:
     opt_gas_cylinder.glb (Gas_Cylinder.fbx),
     opt_cable_drum.glb (CableDrum.fbx),
     opt_work_light.glb (WorkLight.fbx),
     opt_cannon.glb (Cannon.fbx),
     opt_sack_grain.glb (SackOfGrain.fbx).
   - Shared compound atlas (tiles <=256px inside 1024x1024 WebP q84):
     textures/opt_camp_atlas.webp.
"""
    with open(LICENSE_OUT, 'w', encoding='utf-8') as f:
        f.write(lic_txt)


main()
