#!/usr/bin/env python3
"""
Build & optimize free CC0 / commercial-OK itch.io & steampunk 3D props for Operators Territory:
- Quaternius Fantasy Props (18 pieces) -> baked into 1 shared 1024x1024 WebP atlas (opt_quat_atlas.webp)
- Avramania + 3dmodelscc0 camp/fortress props -> packed into 1 shared 1024x1024 WebP atlas (opt_camp_atlas.webp)
- Poly Haven CC0 pipes + SKC-Shop Free Sampler condensers/vents/valves + repo steampunk boiler/wheel
  -> packed into 1 shared 1024x1024 WebP atlas (opt_steam_atlas.webp)
Every GLB uses ONLY ONE material, Draco compression, clean bottom-center pivot, and lean LODs.

Run:
  "D:\\3d\\Blernder\\blender.exe" -b --factory-startup -P scripts/operators-territory/build_itch_props.py
  py -3 scripts/operators-territory/build_itch_props.py --pack-textures
"""
import json
import math
import os
import sys
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ITCH_RAW = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\cdcfa7f9-61ba-4185-b32c-acd3d241ec7a\scratch\itch_raw"
REPO_PROPS = os.path.join(ROOT, 'client', 'assets', 'props')
OUT_MODELS = os.path.join(ROOT, 'client', 'assets', 'props', 'operators')
OUT_TEX = os.path.join(ROOT, 'client', 'assets', 'props', 'textures')
BAKE_TMP = os.path.join(HERE, '_tmp_bake')
MANIFEST_PATH = os.path.join(HERE, 'itch-manifest.json')
LICENSE_OUT = os.path.join(OUT_MODELS, 'LICENSES.txt')

os.makedirs(OUT_MODELS, exist_ok=True)
os.makedirs(OUT_TEX, exist_ok=True)
os.makedirs(BAKE_TMP, exist_ok=True)

# Grid coordinates (col, row, w_cells, h_cells) on a 4x4 grid inside 1024x1024
CAMP_TILES = {
    'mdvl': (0, 0, 1, 1),
    'gas_cylinder': (1, 0, 1, 1),
    'cable_drum': (2, 0, 1, 1),
    'work_light': (3, 0, 1, 1),
    'ind_barrel': (0, 1, 1, 1),
    'cannon': (1, 1, 1, 1),
    'sack': (2, 1, 1, 1),
    'water_barrel': (3, 1, 1, 1),
}

STEAM_TILES = {
    'boiler': (0, 0, 2, 2),       # 512x512 top-left
    'boiler_room': (2, 0, 2, 2),  # 512x512 top-right
    'pipe1': (0, 2, 1, 1),        # 256x256 Poly Haven group01 (straight/elbow)
    'pipe2': (1, 2, 1, 1),        # 256x256 Poly Haven group02 (tee/valve)
    'skc_plant': (2, 2, 1, 1),    # 256x256 SKC condenser & roof vent
    'mon_wheel': (3, 2, 1, 1),    # 256x256 Steampunk gear flywheel
    'skc_pipe': (0, 3, 1, 1),     # 256x256 SKC handwheel valve & pressure gauge
    'skc_elec': (1, 3, 1, 1),     # 256x256 SKC junction box
    'skc_props': (2, 3, 1, 1),    # 256x256 SKC bench grinder
    'elec_box': (3, 3, 1, 1),     # 256x256 3dmodelscc0 ElectricalBox
}


def find_raw(filename):
    if os.path.exists(filename):
        return filename
    import fnmatch
    target_low = filename.lower()
    has_glob = any(ch in target_low for ch in '*?[')
    for base in (ITCH_RAW, REPO_PROPS):
        for root, _, files in os.walk(base):
            for fn in files:
                low = fn.lower()
                if (fnmatch.fnmatch(low, target_low) if has_glob else low == target_low):
                    return os.path.join(root, fn)
    raise FileNotFoundError('Missing asset source: ' + filename)


def pack_textures_pil():
    from PIL import Image, ImageEnhance

    def make_4x4(slots_spec, bg=(90, 82, 74)):
        im_out = Image.new('RGB', (1024, 1024), bg)
        for tile_key, fname, tile_rect in slots_spec:
            c, r, wc, hc = tile_rect
            src = Image.open(find_raw(fname)).convert('RGB')
            resized = src.resize((wc * 256, hc * 256), Image.Resampling.LANCZOS)
            im_out.paste(resized, (c * 256, r * 256))
        return im_out

    camp_atlas = make_4x4([
        ('mdvl', 'mdvl_palette.png', CAMP_TILES['mdvl']),
        ('gas', 'Gas_Cylinder_Base_Color.png', CAMP_TILES['gas_cylinder']),
        ('drum', 'CableDrum_Base_Color.png', CAMP_TILES['cable_drum']),
        ('light', 'WorkLight_Base_Color.png', CAMP_TILES['work_light']),
        ('barrel', 'ExplosiveBarrel_Base_Color.png', CAMP_TILES['ind_barrel']),
        ('cannon', 'Cannon_Base_Color-min.png', CAMP_TILES['cannon']),
        ('sack', 'Sack_Base_Color.png', CAMP_TILES['sack']),
    ])
    out_c = os.path.join(OUT_TEX, 'opt_camp_atlas.webp')
    camp_atlas.save(out_c, 'WEBP', quality=84, method=6)

    steam_atlas = make_4x4([
        ('boiler', os.path.join(OUT_TEX, 'boiler.webp'), STEAM_TILES['boiler']),
        ('boiler_room', os.path.join(OUT_TEX, 'boiler_room.webp'), STEAM_TILES['boiler_room']),
        ('pipe1', 'modular_industrial_pipes_01_group01_diff_1k.jpg', STEAM_TILES['pipe1']),
        ('pipe2', 'modular_industrial_pipes_01_group02_diff_1k.jpg', STEAM_TILES['pipe2']),
        ('skc_plant', 'B02_Maintained_plant_albedo_1K.png', STEAM_TILES['skc_plant']),
        ('mon_wheel', os.path.join(OUT_TEX, 'monument_wheel.webp'), STEAM_TILES['mon_wheel']),
        ('skc_pipe', 'B03_Maintained_pipe-gauge_albedo_1K.png', STEAM_TILES['skc_pipe']),
        ('skc_elec', 'B03_Maintained_electrical-support_albedo_1K.png', STEAM_TILES['skc_elec']),
        ('skc_props', 'B04_Maintained_props_albedo_1K.png', STEAM_TILES['skc_props']),
        ('elec_box', 'ElectricalBox_Base_Color.png', STEAM_TILES['elec_box']),
    ], bg=(78, 72, 66))
    out_s = os.path.join(OUT_TEX, 'opt_steam_atlas.webp')
    # Затеняем слишком светлый оцинкованный купол вытяжки (skc_plant) в тёмную кованую бронзу/чугун под стимпанк L2
    from PIL import ImageEnhance
    plant_box = (STEAM_TILES['skc_plant'][0] * 256, STEAM_TILES['skc_plant'][1] * 256,
                 (STEAM_TILES['skc_plant'][0] + 1) * 256, (STEAM_TILES['skc_plant'][1] + 1) * 256)
    p_tile = steam_atlas.crop(plant_box)
    p_tile = ImageEnhance.Brightness(p_tile).enhance(0.55)
    p_tile = ImageEnhance.Color(p_tile).enhance(0.75)
    # Лёгкий тёпло-бронзовый оттенок
    r_c, g_c, b_c = p_tile.split()
    r_c = r_c.point(lambda x: min(255, int(x * 1.15)))
    g_c = g_c.point(lambda x: min(255, int(x * 0.98)))
    b_c = b_c.point(lambda x: min(255, int(x * 0.78)))
    p_tile = Image.merge('RGB', (r_c, g_c, b_c))
    steam_atlas.paste(p_tile, plant_box[:2])
    steam_atlas.save(out_s, 'WEBP', quality=84, method=6)

    def pack_bake_slots(slots_json, out_name, q=85):
        out_atlas = Image.new('RGB', (1024, 1024), (110, 92, 72))
        s_path = os.path.join(BAKE_TMP, slots_json)
        if not os.path.exists(s_path):
            return 0
        slots = json.load(open(s_path, encoding='utf-8'))
        for prop_id, slot in slots.items():
            png_p = os.path.join(BAKE_TMP, prop_id + '.png')
            if not os.path.exists(png_p):
                continue
            col_i, row_i, tw, th = slot['col'], slot['row'], slot['tw'], slot['th']
            im = Image.open(png_p).convert('RGB')
            if im.size != (tw, th):
                im = im.resize((tw, th), Image.Resampling.LANCZOS)
            if slot.get('bright', 1.0) != 1.0:
                im = ImageEnhance.Brightness(im).enhance(slot['bright'])
            im = ImageEnhance.Contrast(im).enhance(1.08)
            out_atlas.paste(im, (col_i * tw, row_i * th))
        out_p = os.path.join(OUT_TEX, out_name)
        out_atlas.save(out_p, 'WEBP', quality=q, method=6)
        return os.path.getsize(out_p)

    q_sz = pack_bake_slots('quat_slots.json', 'opt_quat_atlas.webp', 85)
    r_sz = pack_bake_slots('ruin_slots.json', 'opt_ruins_atlas.webp', 85)
    print('[itch-tex] camp =', os.path.getsize(out_c), '| quat =', q_sz, '| steam =', os.path.getsize(out_s), '| ruins =', r_sz)


if '--pack-textures' in sys.argv:
    try:
        find_raw('barreltex1.png')
    except FileNotFoundError:
        wb_dir = os.path.dirname(find_raw('Water_Barrel.fbx'))
        for d, _, fs in os.walk(wb_dir):
            for f in fs:
                if f.endswith('.png'):
                    CAMP_TILES['__wb_path'] = os.path.join(d, f)
                    break
    pack_textures_pil()
    sys.exit(0)


import bpy
import bmesh
from mathutils import Matrix

# Find Water_Barrel texture name if needed in Python run
WB_TEX_FNAME = None
for cand in ('barreltex1.png', 'Water_Barrel_Base_Color.png', 'WaterBarrel_Base_Color.png'):
    try:
        WB_TEX_FNAME = find_raw(cand)
        break
    except FileNotFoundError:
        pass
if not WB_TEX_FNAME:
    for d, _, fs in os.walk(os.path.join(ITCH_RAW, '3dmodelscc0_industrial')):
        for f in fs:
            if f.endswith('.png') and 'water' in f.lower():
                WB_TEX_FNAME = os.path.join(d, f)
                break


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def get_or_make_simple_mat(name, double_sided=False):
    m = bpy.data.materials.get(name)
    if m:
        if double_sided:
            m.use_backface_culling = False
        return m
    m = bpy.data.materials.new(name)
    m.use_backface_culling = not double_sided
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.85
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.0
    return m


def prepare_bake_material_tree(ob, src_mats, prop_id):
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

        if ('cloth' in low or 'banner' in low) and prop_id == 'opt_dummy':
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            mul.inputs[7].default_value = (0.84, 0.68, 0.44, 1.0)
            nt.links.new(color_out, mul.inputs[6])
            color_out = mul.outputs[2]
        elif prop_id == 'opt_banner_hang':
            mul = nt.nodes.new('ShaderNodeMix')
            mul.data_type = 'RGBA'
            mul.blend_type = 'MULTIPLY'
            mul.inputs['Factor'].default_value = 1.0
            # Багровое полотнище с тёмным бронзово-дубовым кронштейном (убираем серый нейтральный хвост)
            is_cloth_mat = ('cloth' in low or 'banner' in low or 'vertex' in low)
            mul.inputs[7].default_value = (0.78, 0.14, 0.12, 1.0) if is_cloth_mat else (0.58, 0.42, 0.28, 1.0)
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


def prepare_bake_material_tree_generic(ob, tint=None, override_tex=None):
    """Переключает любые материалы GLTF/FBX на чистую Emission-ветку (от альбедо) для запекания в атлас."""
    if not len(ob.data.materials):
        m = bpy.data.materials.new('bake_src')
        m.use_nodes = True
        ob.data.materials.append(m)
    for m in ob.data.materials:
        if not m:
            continue
        m.use_nodes = True
        nt = m.node_tree
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        emit = nt.nodes.new('ShaderNodeEmission')
        emit.inputs['Strength'].default_value = 1.0
        src_sock = None
        if override_tex:
            tex_n = nt.nodes.new('ShaderNodeTexImage')
            tex_n.image = bpy.data.images.load(find_raw(override_tex), check_existing=True)
            uv_n = nt.nodes.new('ShaderNodeUVMap')
            uv_n.uv_map = ob.data.uv_layers[0].name
            nt.links.new(uv_n.outputs['UV'], tex_n.inputs['Vector'])
            src_sock = tex_n.outputs['Color']
        elif bsdf and 'Base Color' in bsdf.inputs:
            bc = bsdf.inputs['Base Color']
            if bc.is_linked:
                src_sock = bc.links[0].from_socket
            else:
                emit.inputs['Color'].default_value = tuple(bc.default_value)
        if src_sock:
            if tint is not None:
                mul = nt.nodes.new('ShaderNodeMix')
                mul.data_type = 'RGBA'
                mul.blend_type = 'MULTIPLY'
                mul.inputs['Factor'].default_value = 1.0
                mul.inputs[7].default_value = (tint[0], tint[1], tint[2], 1.0)
                nt.links.new(src_sock, mul.inputs[6])
                nt.links.new(mul.outputs[2], emit.inputs['Color'])
            else:
                nt.links.new(src_sock, emit.inputs['Color'])
        nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])


def bake_prop_to_slot(ob, prop_id, col_i, row_i, tw, th, double_sided=False, atlas_mat_name='opt_quat_atlas'):
    bake_uv = ob.data.uv_layers.new(name='BakeUV')
    bake_name = str(bake_uv.name)
    ob.data.uv_layers.active = bake_uv

    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')

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

    while len(ob.data.uv_layers) > 1:
        for l in list(ob.data.uv_layers):
            if l.name != bake_name:
                ob.data.uv_layers.remove(l)
                break
    bake_uv = ob.data.uv_layers[bake_name]
    bake_uv.name = 'UVMap'

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

    mat = get_or_make_simple_mat(atlas_mat_name, double_sided=double_sided)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0


def remap_uv_rect(mesh, rect, poly_indices=None):
    c, r, wc, hc = rect
    if not mesh.uv_layers:
        return
    uvl = mesh.uv_layers.active.data
    u0 = (c * 256.0 + 3.0) / 1024.0
    u_span = (wc * 256.0 - 6.0) / 1024.0
    v_top = 1.0 - (r * 256.0 + 3.0) / 1024.0
    v_bot = 1.0 - ((r + hc) * 256.0 - 3.0) / 1024.0
    v_span = v_top - v_bot
    polys = [mesh.polygons[i] for i in poly_indices] if poly_indices is not None else mesh.polygons
    for poly in polys:
        for li in poly.loop_indices:
            uv = uvl[li].uv
            uv[0] = u0 + max(0.0, min(1.0, uv[0])) * u_span
            uv[1] = v_bot + max(0.0, min(1.0, uv[1])) * v_span


def recenter_bottom(ob):
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    ob.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2.0, -(min(ys) + max(ys)) / 2.0, -min(zs))))
    ob.data.update()


def add_banner_bracket(ob):
    """Добавляет компактную стальную скобу крепления на заднем торце кронштейна Banner_2 (x~0)."""
    metal_idx = 0
    for idx, m in enumerate(ob.data.materials):
        if m and 'metal' in m.name.lower():
            metal_idx = idx
            break
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret['verts']
    # Плита крепления по X [-0.04..+0.07], Y [-0.11..+0.11], Z [-0.18..+0.96]
    M_plate = Matrix.Translation((0.015, 0.0, 0.39)) @ Matrix.Diagonal((0.11, 0.22, 1.14, 1.0))
    for v in verts:
        v.co = M_plate @ v.co
    for f in bm.faces:
        if all(v in verts for v in f.verts):
            f.material_index = metal_idx
    uvl = bm.loops.layers.uv.active
    if uvl:
        for f in bm.faces:
            if all(v in verts for v in f.verts):
                for l in f.loops:
                    l[uvl].uv = (0.12, 0.12)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()


def import_and_merge(filepath, mesh_filter=None, rot_z_deg=0.0, rot_x_deg=0.0, rot_y_deg=0.0, uniform_scale=1.0, scale_xyz=None, extra_fn=None):
    clear_scene()
    ext = os.path.splitext(filepath)[1].lower()
    if ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=filepath)
    else:
        bpy.ops.import_scene.fbx(filepath=filepath)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if mesh_filter:
        for o in list(meshes):
            if mesh_filter.lower() not in o.name.lower():
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # First bring individual sub-mesh local coords to 0 so rotations orbit smoothly around object center!
    recenter_bottom(ob)

    M = Matrix.Identity(4)
    if scale_xyz is not None:
        M = Matrix.Diagonal((scale_xyz[0], scale_xyz[1], scale_xyz[2], 1.0)) @ M
    elif uniform_scale != 1.0:
        M = Matrix.Scale(uniform_scale, 4) @ M
    if rot_x_deg:
        M = Matrix.Rotation(math.radians(rot_x_deg), 4, 'X') @ M
    if rot_y_deg:
        M = Matrix.Rotation(math.radians(rot_y_deg), 4, 'Y') @ M
    if rot_z_deg:
        M = Matrix.Rotation(math.radians(rot_z_deg), 4, 'Z') @ M
    if M != Matrix.Identity(4):
        ob.data.transform(M)

    if extra_fn:
        extra_fn(ob)

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()

    recenter_bottom(ob)
    return ob


from mathutils import Matrix, Vector


def _tile_uv_bounds(tile_name):
    c, r, wc, hc = STEAM_TILES[tile_name]
    u0 = (c * 256.0 + 6.0) / 1024.0
    u1 = ((c + wc) * 256.0 - 6.0) / 1024.0
    v_top = 1.0 - (r * 256.0 + 6.0) / 1024.0
    v_bot = 1.0 - ((r + hc) * 256.0 - 6.0) / 1024.0
    return u0, u1, v_bot, v_top


def _add_tube(bm, uvl, pts, radius, seg, tile_name, cap_a=True, cap_b=True):
    """Sweeps a sealed watertight pipe mesh with clean normals along a 3D polyline."""
    pts = [Vector(p) for p in pts]
    u0, u1, vb, vt = _tile_uv_bounds(tile_name)
    rings = []
    n_prev = None
    for i, p in enumerate(pts):
        if i == 0:
            t = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            t = (pts[-1] - pts[-2]).normalized()
        else:
            t = (pts[i + 1] - pts[i - 1]).normalized()
        if n_prev is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = t.cross(ref).normalized()
        else:
            n = n_prev - t * n_prev.dot(t)
            if n.length < 1e-5:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                n = t.cross(ref).normalized()
            else:
                n.normalize()
        n_prev = n
        b = t.cross(n).normalized()
        ring = []
        for k in range(seg):
            a = 2.0 * math.pi * k / seg
            vco = p + radius * (math.cos(a) * n + math.sin(a) * b)
            ring.append(bm.verts.new(vco))
        rings.append(ring)

    v_len = 0.0
    for i in range(len(rings) - 1):
        rA, rB = rings[i], rings[i + 1]
        step_v = min(0.8, (pts[i + 1] - pts[i]).length * 0.25)
        va = vb + (v_len % 0.7) * (vt - vb)
        vc = vb + ((v_len % 0.7) + step_v * 0.5) * (vt - vb)
        v_len += step_v
        for k in range(seg):
            k1 = (k + 1) % seg
            f = bm.faces.new((rA[k], rA[k1], rB[k1], rB[k]))
            ua = u0 + (k / seg) * (u1 - u0)
            ub = u0 + ((k + 1) / seg) * (u1 - u0)
            f.loops[0][uvl].uv = (ua, va)
            f.loops[1][uvl].uv = (ub, va)
            f.loops[2][uvl].uv = (ub, vc)
            f.loops[3][uvl].uv = (ua, vc)
    uc, vc_m = 0.5 * (u0 + u1), 0.5 * (vb + vt)
    if cap_a:
        f = bm.faces.new(list(reversed(rings[0])))
        for lp in f.loops:
            lp[uvl].uv = (uc, vc_m)
    if cap_b:
        f = bm.faces.new(rings[-1])
        for lp in f.loops:
            lp[uvl].uv = (uc, vc_m)


def _add_collar(bm, uvl, pos, axis_dir, radius, thick, seg, tile_name):
    d = Vector(axis_dir).normalized() * (thick * 0.5)
    p = Vector(pos)
    _add_tube(bm, uvl, [p - d, p + d], radius, seg, tile_name, cap_a=True, cap_b=True)


def _add_elbow_pts(p_corner, dir_in, dir_out, bend_r, arc_steps=6):
    """Generates smooth quarter-circle arc points turning from dir_in into dir_out."""
    di = Vector(dir_in).normalized()
    do = Vector(dir_out).normalized()
    pc = Vector(p_corner)
    p_start = pc - di * bend_r
    c = p_start + do * bend_r
    pts = []
    for k in range(arc_steps + 1):
        th = (math.pi * 0.5) * (k / arc_steps)
        pts.append(c - do * (bend_r * math.cos(th)) + di * (bend_r * math.sin(th)))
    return pts


def _finish_pipe_bmesh(bm, atlas_mat_name='opt_steam_atlas'):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('pipe_mesh')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('pipe_obj', me)
    bpy.context.collection.objects.link(ob)
    mat = get_or_make_simple_mat(atlas_mat_name)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0
    recenter_bottom(ob)
    return ob


def build_composite_pipe_arch():
    """Строгая герметичная стимпанк-рамка над проездом/котельной (пролёт 6.4 м, высота 4.6 м, 0 висящих обрывков)."""
    clear_scene()
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rx, top_z, bend = 3.1, 4.6, 0.72
    # Главный цельный П-образный трубопровод от левой опоры до правой
    pts_main = (
        [(-rx, 0, 0.0), (-rx, 0, top_z - bend)]
        + _add_elbow_pts((-rx, 0, top_z), (0, 0, 1), (1, 0, 0), bend, 6)
        + _add_elbow_pts((+rx, 0, top_z), (1, 0, 0), (0, 0, -1), bend, 6)
        + [(+rx, 0, 0.0)]
    )
    _add_tube(bm, uvl, pts_main, 0.21, 12, 'pipe1')
    # Параллельная латунная труба-спутник чуть выше и глубже
    pts_sub = (
        [(-rx, 0.28, 0.0), (-rx, 0.28, top_z + 0.26 - 0.55)]
        + _add_elbow_pts((-rx, 0.28, top_z + 0.26), (0, 0, 1), (1, 0, 0), 0.55, 5)
        + _add_elbow_pts((+rx, 0.28, top_z + 0.26), (1, 0, 0), (0, 0, -1), 0.55, 5)
        + [(+rx, 0.28, 0.0)]
    )
    _add_tube(bm, uvl, pts_sub, 0.11, 8, 'pipe2')
    # Болтовые башмаки на полу, муфты на стойках и центральный запорный вентиль
    for sx in (-1, 1):
        _add_collar(bm, uvl, (sx * rx, 0.10, 0.12), (0, 0, 1), 0.44, 0.24, 12, 'pipe2')
        _add_collar(bm, uvl, (sx * rx, 0, 1.40), (0, 0, 1), 0.28, 0.18, 10, 'pipe2')
        _add_collar(bm, uvl, (sx * rx, 0, 3.10), (0, 0, 1), 0.28, 0.18, 10, 'pipe2')
    _add_collar(bm, uvl, (0, 0, top_z), (1, 0, 0), 0.32, 0.42, 10, 'pipe2')
    _add_tube(bm, uvl, [(0, 0, top_z), (0, -0.34, top_z)], 0.07, 6, 'pipe2')
    _add_collar(bm, uvl, (0, -0.34, top_z), (0, 1, 0), 0.26, 0.07, 10, 'pipe2')
    return _finish_pipe_bmesh(bm, 'opt_steam_atlas')


def build_bioshock_pipe(kind):
    """
    Собирает 100%-герметичные сварные/фланцевые стимпанк-магистрали в духе BioShock (общий атлас opt_steam_atlas):
    - MEGA_ARCH:   толстая (Ø 0.68 м) дугообразная труба с плавными 90°-отводами, уходящая муфтами в землю
    - RISER_BIG:   толстый (Ø 0.68 м) стояк из земли с плавным 90° отводом строго вдоль +X в стену/котёл
    - TRENCH_RUN:  спаренная 4-метровая трасса на чугунных седловых опорах (стыкуется с шагом 4 м)
    """
    clear_scene()
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')

    if kind == 'MEGA_ARCH':
        rx, top_z, bend = 2.45, 4.15, 0.85
        pts_main = (
            [(-rx, 0, 0.0), (-rx, 0, top_z - bend)]
            + _add_elbow_pts((-rx, 0, top_z), (0, 0, 1), (1, 0, 0), bend, 7)
            + _add_elbow_pts((+rx, 0, top_z), (1, 0, 0), (0, 0, -1), bend, 7)
            + [(+rx, 0, 0.0)]
        )
        _add_tube(bm, uvl, pts_main, 0.34, 14, 'pipe1')
        pts_sub = (
            [(-rx - 0.34, 0.40, 0.0), (-rx - 0.34, 0.40, top_z - 0.42 - 0.60)]
            + _add_elbow_pts((-rx - 0.34, 0.40, top_z - 0.42), (0, 0, 1), (1, 0, 0), 0.60, 6)
            + _add_elbow_pts((+rx + 0.34, 0.40, top_z - 0.42), (1, 0, 0), (0, 0, -1), 0.60, 6)
            + [(+rx + 0.34, 0.40, 0.0)]
        )
        _add_tube(bm, uvl, pts_sub, 0.13, 8, 'pipe2')
        for sx in (-1, 1):
            _add_collar(bm, uvl, (sx * rx, 0.15, 0.22), (0, 0, 1), 0.62, 0.44, 14, 'pipe2')
            _add_collar(bm, uvl, (sx * rx, 0, 1.35), (0, 0, 1), 0.43, 0.22, 12, 'pipe2')
            _add_collar(bm, uvl, (sx * rx, 0, 2.75), (0, 0, 1), 0.43, 0.22, 12, 'pipe2')
        _add_collar(bm, uvl, (0, 0, top_z), (1, 0, 0), 0.48, 0.56, 12, 'pipe2')
        _add_tube(bm, uvl, [(0, 0, top_z), (0, -0.45, top_z)], 0.09, 6, 'pipe2')
        _add_collar(bm, uvl, (0, -0.46, top_z), (0, 1, 0), 0.34, 0.08, 10, 'pipe2')

    elif kind == 'RISER_BIG':
        # Вертикальный стояк в точке (0, 0, 0) -> плавный 90° отвод строго в +X (0..2.35 м) с настенным фланцем
        tz, bend = 2.65, 0.78
        pts_main = (
            [(0, 0, 0.0), (0, 0, tz - bend)]
            + _add_elbow_pts((0, 0, tz), (0, 0, 1), (1, 0, 0), bend, 7)
            + [(2.35, 0, tz)]
        )
        _add_tube(bm, uvl, pts_main, 0.32, 14, 'pipe1')
        pts_sub = (
            [(0, 0.42, 0.0), (0, 0.42, 2.15 - 0.52)]
            + _add_elbow_pts((0, 0.42, 2.15), (0, 0, 1), (1, 0, 0), 0.52, 6)
            + [(2.35, 0.42, 2.15)]
        )
        _add_tube(bm, uvl, pts_sub, 0.12, 8, 'pipe2')
        _add_collar(bm, uvl, (0, 0.15, 0.20), (0, 0, 1), 0.56, 0.40, 14, 'pipe2')
        _add_collar(bm, uvl, (0, 0, 1.35), (0, 0, 1), 0.40, 0.20, 12, 'pipe2')
        _add_collar(bm, uvl, (1.40, 0, tz), (1, 0, 0), 0.40, 0.20, 12, 'pipe2')
        _add_collar(bm, uvl, (2.30, 0.15, tz), (1, 0, 0), 0.52, 0.22, 12, 'pipe2')
        _add_tube(bm, uvl, [(0, 0, 1.55), (0, -0.42, 1.55)], 0.07, 6, 'pipe2')
        _add_collar(bm, uvl, (0, -0.42, 1.55), (0, 1, 0), 0.28, 0.07, 10, 'pipe2')

    elif kind == 'TRENCH_RUN':
        # 4-метровая спаренная наземная трасса на глубоких опорах (x ∈ [-2.0, +2.0], опоры до z=0)
        _add_tube(bm, uvl, [(-2.0, -0.14, 0.62), (+2.0, -0.14, 0.62)], 0.24, 12, 'pipe1')
        _add_tube(bm, uvl, [(-2.0, +0.26, 0.48), (+2.0, +0.26, 0.48)], 0.11, 8, 'pipe2')
        for sx in (-1.94, 0.0, +1.94):
            _add_collar(bm, uvl, (sx, -0.14, 0.62), (1, 0, 0), 0.32, 0.16, 10, 'pipe2')
            _add_collar(bm, uvl, (sx, +0.26, 0.48), (1, 0, 0), 0.17, 0.12, 8, 'pipe2')
        for ox in (-1.20, +1.20):
            _add_tube(bm, uvl, [(ox, -0.14, 0.0), (ox, -0.14, 0.62)], 0.15, 8, 'pipe2')
            _add_tube(bm, uvl, [(ox, +0.26, 0.0), (ox, +0.26, 0.48)], 0.09, 6, 'pipe2')
            _add_collar(bm, uvl, (ox, +0.06, 0.08), (0, 0, 1), 0.42, 0.16, 8, 'pipe1')
        _add_tube(bm, uvl, [(0, -0.14, 0.62), (0, -0.14, 1.02)], 0.06, 6, 'pipe2')
        _add_collar(bm, uvl, (0, -0.14, 1.02), (0, 0, 1), 0.25, 0.06, 10, 'pipe2')

    return _finish_pipe_bmesh(bm, 'opt_steam_atlas')


def make_lod_clone(src_ob, lod_name, ratio):
    me = src_ob.data.copy()
    me.validate(clean_customdata=False)
    ob = bpy.data.objects.new(lod_name, me)
    bpy.context.collection.objects.link(ob)
    if ratio < 0.99:
        mod = ob.modifiers.new('Decimate', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        ob.data.validate(clean_customdata=False)
    return ob


def tri_count(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    ob.evaluated_get(deps).to_mesh_clear()
    return n


SPECS = [
    # --- Quaternius (18 моделей на 4x5 сетке opt_quat_atlas.webp; без парящего banner_stand!) ---
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
          drawDist=180, lodDist=[90, 140], collider=(2.78, 0.56, 0.65))),
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
    ('opt_banner_hang',  'quaternius_fantasy_props/extracted/Exports/glTF/Banner_2.gltf',
     dict(pack='quat', scale=1.15, lod=(1.0, 0.0, 0.0), collision=False, shadow=False, double_sided=True,
          extra_fn=add_banner_bracket,
          nameRu='Настенный стяг на кронштейне', nameEn='Cantilever Guild Banner', cat='monuments', shape='box',
          drawDist=320, lodDist=[95, 160])),

    # --- Avramania + 3dmodelscc0 (opt_camp_atlas.webp; деревянный забор заменён на каменную стену!) ---
    ('opt_wall_stone',   'avramania_props/extracted/Props_Tools_Fencing/glTF/mdvl_props_wall_stone_01.glb',
     dict(pack='camp', tile='mdvl', scale_xyz=(3.2, 2.2, 2.0), lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Каменная стена лагеря', nameEn='Operator Stone Rampart', cat='walls', shape='box',
          drawDist=400, lodDist=[95, 180], collider=(3.2, 0.72, 2.0))),
    ('opt_weapon_rack_b','avramania_weapons/extracted/Weapons_Shields/glTF/mdvl_weapons_rack_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.05, lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Пирамида клинков и копий', nameEn='Blade & Spear Rack', cat='training', shape='box',
          drawDist=240, lodDist=[85, 140], collider=(1.32, 0.50, 1.65))),
    ('opt_rubble_pile',  'avramania_ruins/extracted/Dungeon_Ruins/glTF/mdvl_dungeon_rubble_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.35, lod=(0.80, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Каменная осыпь руин', nameEn='Stone Rubble Mound', cat='ruins', shape='box',
          drawDist=220, lodDist=[80, 130])),
    ('opt_camp_rug',     'avramania_interiors/extracted/Interiors_Furniture/glTF/mdvl_interiors_rug_01.glb',
     dict(pack='camp', tile='mdvl', scale_xyz=(2.8, 3.6, 1.0), lod=(1.0, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Ковёр штабного зала', nameEn='Bastion Hall Runner Rug', cat='furniture', shape='box',
          drawDist=160, lodDist=[80, 130])),
    ('opt_gas_cylinder', '3dmodelscc0_industrial/extracted/IndustrialPack/Gas_Cylinder/Gas_Cylinder.fbx',
     dict(pack='camp', tile='gas_cylinder', scale=1.55, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Паровой баллон давления', nameEn='High-Pressure Steam Cylinder', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(0.62, 0.62, 1.15))),
    ('opt_cable_drum',   '3dmodelscc0_industrial/extracted/IndustrialPack/CableDrum/CableDrum.fbx',
     dict(pack='camp', tile='cable_drum', scale=1.05, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Катушка парового привода', nameEn='Conduit Cable Drum', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(1.1, 1.1, 1.1))),
    ('opt_work_light',   '3dmodelscc0_industrial/extracted/IndustrialPack/WorkLight/WorkLight.fbx',
     dict(pack='camp', tile='work_light', scale=1.45, lod=(0.45, 0.0, 0.0), shadow=False,
          nameRu='Прожектор полигона', nameEn='Training Yard Worklight', cat='steampunk', shape='cylinder',
          drawDist=220, lodDist=[90, 140], collider=(0.65, 0.65, 0.9))),
    ('opt_cannon',       '3dmodelscc0_medieval/extracted/MedievalPropsPack/Cannon/Cannon.fbx',
     dict(pack='camp', tile='cannon', rot_z_deg=-90.0, scale=0.88, lod=(0.55, 0.0, 0.25), shadow=True,
          nameRu='Паровое орудие бастиона', nameEn='Steam Bastion Cannon', cat='weapons', shape='box',
          drawDist=320, lodDist=[85, 145], collider=(1.55, 2.6, 1.45))),
    ('opt_sack_grain',   '3dmodelscc0_medieval/extracted/MedievalPropsPack/SackOfGrain/SackOfGrain.fbx',
     dict(pack='camp', tile='sack', scale=1.35, lod=(0.90, 0.0, 0.0), shadow=False,
          nameRu='Мешок снабжения', nameEn='Supply Sack', cat='containers', shape='cylinder',
          drawDist=180, lodDist=[85, 130], collider=(0.75, 0.75, 0.75))),

    # --- Steampunk Hardware, Boilers, Wheels & Pipe Network (1024x1024 opt_steam_atlas.webp, 1 material) ---
    ('opt_boiler_unit',  'boiler.fbx',
     dict(pack='steam', tile='boiler', scale=2.75, lod=(1.0, 0.0, 0.0), shadow=True,
          nameRu='Полевой паровой котёл', nameEn='Field Steam Boiler', cat='steampunk', shape='cylinder',
          drawDist=340, lodDist=[90, 170], collider=(2.45, 2.45, 2.75))),
    ('opt_boiler_station','boiler_room.fbx',
     dict(pack='steam', tile='boiler_room', scale=4.5, lod=(0.30, 0.0, 0.14), shadow=True,
          nameRu='Паровая силовая установка', nameEn='Steam Powerhouse Module', cat='steampunk', shape='box',
          drawDist=400, lodDist=[100, 200], collider=(4.4, 4.2, 4.1))),
    ('opt_steam_wheel',  'monument_wheel.fbx',
     dict(pack='steam', tile='mon_wheel', scale=2.9, lod=(0.65, 0.0, 0.30), shadow=True,
          nameRu='Маховик парового привода', nameEn='Brass Drive Flywheel', cat='steampunk', shape='box',
          drawDist=340, lodDist=[90, 170], collider=(1.9, 1.8, 2.9))),
    ('opt_pipe_straight','pipes.gltf',
     dict(pack='steam', tile='pipe1', mesh_filter='pipe02', rot_y_deg=90.0, scale=2.05, lod=(0.70, 0.0, 0.35), shadow=True,
          nameRu='Паровая магистральная труба 4м', nameEn='Horizontal Steam Pipe 4m', cat='steampunk', shape='box',
          drawDist=320, lodDist=[85, 150], collider=(3.95, 0.55, 0.55))),
    ('opt_pipe_vertical','pipes.gltf',
     dict(pack='steam', tile='pipe1', mesh_filter='pipe02', scale=2.0, lod=(0.70, 0.0, 0.35), shadow=True,
          nameRu='Вертикальный паропровод 4м', nameEn='Vertical Steam Riser 4m', cat='steampunk', shape='cylinder',
          drawDist=320, lodDist=[85, 150], collider=(0.55, 0.55, 3.9))),
    ('opt_pipe_elbow',   'pipes.gltf',
     dict(pack='steam', tile='pipe1', mesh_filter='pipe04', scale=2.2, lod=(0.65, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Колено паровой трубы 90°', nameEn='Steam Pipe 90° Elbow', cat='steampunk', shape='box',
          drawDist=260, lodDist=[80, 140])),
    ('opt_pipe_tee',     'pipes.gltf',
     dict(pack='steam', tile='pipe2', mesh_filter='pipe06', scale=2.3, lod=(0.60, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Тройник паропровода', nameEn='Steam Manifold Tee', cat='steampunk', shape='box',
          drawDist=260, lodDist=[80, 140])),
    ('opt_pipe_valve',   'pipes.gltf',
     dict(pack='steam', tile='pipe2', mesh_filter='pipe08', scale=2.2, lod=(0.22, 0.0, 0.10), collision=False, shadow=False,
          nameRu='Запорный паровой вентиль', nameEn='Main Steam Cutoff Valve', cat='steampunk', shape='box',
          drawDist=240, lodDist=[80, 130])),
    ('opt_pipe_arch',    '__COMPOSITE_PIPE_ARCH__',
     dict(pack='steam_custom', lod=(0.16, 0.0, 0.07), shadow=True,
          nameRu='Арка паровой магистрали', nameEn='Overhead Steam Pipeline Arch', cat='steampunk', shape='box',
          drawDist=400, lodDist=[95, 180],
          colliders=[
              {'x': -3.05, 'z': 0.0, 'w': 0.72, 'd': 0.72, 'h': 4.4, 'y0': 0.0, 'shape': 'cylinder'},
              {'x':  3.05, 'z': 0.0, 'w': 0.72, 'd': 0.72, 'h': 4.4, 'y0': 0.0, 'shape': 'cylinder'},
          ])),
    ('opt_steam_condenser', '*CompactCondenser*.glb',
     dict(pack='steam', tile='skc_plant', scale=1.85, lod=(0.24, 0.0, 0.12), shadow=True,
          nameRu='Паровой конденсаторный блок', nameEn='Steam Condenser Unit', cat='steampunk', shape='box',
          drawDist=280, lodDist=[85, 150], collider=(1.68, 1.12, 1.58))),
    ('opt_roof_vent',    '*UpblastRoofVent*.glb',
     dict(pack='steam', tile='skc_plant', scale=2.1, lod=(0.34, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Кровельная турбина вытяжки', nameEn='Steam Exhaust Roof Vent', cat='steampunk', shape='cylinder',
          drawDist=320, lodDist=[90, 160])),
    ('opt_switch_box',   'ElectricalBox.fbx',
     dict(pack='steam', tile='elec_box', scale=1.65, lod=(0.35, 0.0, 0.0), shadow=False,
          nameRu='Щиток парового распределения', nameEn='Steam Regulator Switchbox', cat='steampunk', shape='box',
          drawDist=200, lodDist=[80, 130], collider=(0.76, 0.54, 1.35))),
    ('opt_bench_grinder','*BenchGrinder*.glb',
     dict(pack='steam', tile='skc_props', scale=1.7, lod=(0.18, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Точильный привод кузни', nameEn='Powered Workshop Grinder', cat='forges', shape='box',
          drawDist=160, lodDist=[70, 110])),
    ('opt_pipe_mega_bend', '__BIOSHOCK_PIPE_MEGA_ARCH__',
     dict(pack='steam_custom', lod=(0.20, 0.0, 0.08), shadow=True,
          nameRu='Большая арочная паровая магистраль', nameEn='Heavy Grounded Steam Main Arch', cat='steampunk', shape='box',
          drawDist=420, lodDist=[95, 185],
          colliders=[
              {'x': -2.55, 'z': 0.0, 'w': 0.95, 'd': 0.95, 'h': 4.4, 'y0': 0.0, 'shape': 'cylinder'},
              {'x':  2.55, 'z': 0.0, 'w': 0.95, 'd': 0.95, 'h': 4.4, 'y0': 0.0, 'shape': 'cylinder'},
          ])),
    ('opt_pipe_riser_big', '__BIOSHOCK_PIPE_RISER_BIG__',
     dict(pack='steam_custom', lod=(0.22, 0.0, 0.09), shadow=True,
          nameRu='Большой наземный паровой стояк', nameEn='Heavy Ground-Emerging Steam Riser', cat='steampunk', shape='cylinder',
          drawDist=380, lodDist=[90, 175], collider=(1.10, 1.10, 3.6))),
    ('opt_pipe_trench_run', '__BIOSHOCK_PIPE_TRENCH_RUN__',
     dict(pack='steam_custom', lod=(0.26, 0.0, 0.11), shadow=True,
          nameRu='Спаренный паропровод на опорах', nameEn='Twin Grounded Steam Manifold', cat='steampunk', shape='box',
          drawDist=340, lodDist=[85, 165], collider=(4.0, 0.85, 1.15))),

    # --- Destroyed Outskirts & Realistic Library Boulders + CC0 Wagons/Dead Trees (opt_ruins_atlas.webp & opt_camp_atlas.webp) ---
    # Убран весь модульный мусор Quaternius (house_shell, house_gable, brick_rubble, chimney, wood_arch) и стилизованные зелёные камни!
    ('opt_wreck_wagon', 'Prop_Wagon.gltf',
     dict(pack='ruins', tint=(0.76, 0.70, 0.64), scale=1.18, rot_x_deg=14.0, rot_y_deg=-9.0, lod=(0.55, 0.0, 0.26), shadow=True,
          nameRu='Разбитая обозная повозка', nameEn='Wrecked Medieval Supply Wagon', cat='ruins', shape='box',
          drawDist=320, lodDist=[80, 150], collider=(2.2, 3.4, 1.8))),
    ('opt_wreck_pushcart', 'Stall_Cart_Empty.gltf',
     dict(pack='ruins', tint=(0.78, 0.72, 0.65), scale=0.62, rot_x_deg=18.0, rot_y_deg=11.0, lod=(0.55, 0.0, 0.22), shadow=True,
          nameRu='Перевёрнутая ручная тележка', nameEn='Overturned Handcart Wreck', cat='ruins', shape='box',
          drawDist=280, lodDist=[75, 140], collider=(1.4, 1.6, 1.2))),
    ('opt_dead_tree_a', 'DeadTree_1.gltf',
     dict(pack='ruins', tint=(0.86, 0.80, 0.72), bright=1.65, scale=0.95, lod=(0.45, 0.0, 0.16), shadow=True,
          nameRu='Иссушённое корявое дерево', nameEn='Charred Dead Tree Large', cat='dead_trees', shape='cylinder',
          drawDist=340, lodDist=[75, 150], collider=(0.95, 0.95, 5.5))),
    ('opt_dead_tree_b', 'DeadTree_3.gltf',
     dict(pack='ruins', tint=(0.86, 0.80, 0.72), bright=1.65, scale=0.80, lod=(0.48, 0.0, 0.16), shadow=True,
          nameRu='Сломленное сухое дерево', nameEn='Gnarled Dead Tree Snag', cat='dead_trees', shape='cylinder',
          drawDist=330, lodDist=[75, 145], collider=(0.85, 0.85, 4.5))),
    ('opt_boulder_s', 'SM_RP_Rock_2m_1.fbx',
     dict(pack='ruins', tex='T_RP_Rocks_2_2K.webp', tint=(1.0, 0.96, 0.90), bright=2.25, scale=0.92, lod=(0.85, 0.0, 0.45), shadow=True,
          nameRu='Гранитный валун малый', nameEn='Granite Outcrop Small', cat='rocks', shape='cylinder',
          drawDist=280, lodDist=[70, 140], collider=(2.6, 2.1, 1.6))),
    ('opt_boulder_m', 'SM_RP_Rock_4m_2.fbx',
     dict(pack='ruins', tex='T_RP_Rocks_2_2K.webp', tint=(1.0, 0.96, 0.90), bright=2.25, scale=0.72, lod=(0.80, 0.0, 0.40), shadow=True,
          nameRu='Гранитная скала средняя', nameEn='Granite Crag Medium', cat='rocks', shape='box',
          drawDist=360, lodDist=[85, 165], collider=(4.2, 3.8, 2.7))),
    ('opt_boulder_l', 'SM_RP_Rock_8m_1.fbx',
     dict(pack='ruins', tex='T_RP_Rocks_2_2K.webp', tint=(1.0, 0.96, 0.90), bright=2.25, scale=0.52, lod=(0.75, 0.0, 0.35), shadow=True,
          nameRu='Монолитная гранитная глыба', nameEn='Granite Cliff Monolith', cat='rocks', shape='box',
          drawDist=420, lodDist=[95, 190], collider=(6.4, 4.5, 3.4))),

    # --- Avramania CC0 Extra Outskirts & Ruin Debris (reuses opt_camp_atlas.webp tile mdvl = 0 extra bytes!) ---
    ('opt_cart_wheel', 'mdvl_props_cart_wheel_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.20, rot_x_deg=68.0, lod=(1.0, 0.0, 0.0), collision=False, shadow=False,
          nameRu='Сломанное колесо повозки', nameEn='Broken Wooden Cart Wheel', cat='ruins', shape='box',
          drawDist=200, lodDist=[70, 120])),
    ('opt_wheelbarrow', 'mdvl_props_wheelbarrow_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.12, rot_x_deg=14.0, rot_z_deg=22.0, lod=(0.55, 0.0, 0.0), shadow=False,
          nameRu='Брошенная тачка', nameEn='Abandoned Ruin Wheelbarrow', cat='ruins', shape='box',
          drawDist=200, lodDist=[70, 120], collider=(1.1, 1.6, 0.9))),
    ('opt_signpost', 'mdvl_props_signpost_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.30, rot_x_deg=8.0, lod=(1.0, 0.0, 0.0), shadow=False,
          nameRu='Покосившийся дорожный указатель', nameEn='Crooked Road Signpost', cat='ruins', shape='cylinder',
          drawDist=240, lodDist=[75, 130], collider=(0.45, 0.45, 2.4))),
    ('opt_ruin_vault', 'mdvl_dungeon_vault_01.glb',
     dict(pack='camp', tile='mdvl', scale=1.40, rot_x_deg=24.0, rot_y_deg=10.0, lod=(0.85, 0.0, 0.0), shadow=True,
          nameRu='Обрушенный каменный свод', nameEn='Collapsed Ribbed Stone Vault', cat='ruins', shape='box',
          drawDist=360, lodDist=[85, 160], collider=(3.6, 3.6, 2.8))),
]


def main():
    manifest = {
        'dir': 'operators',
        'textures': ['opt_camp_atlas.webp', 'opt_quat_atlas.webp', 'opt_steam_atlas.webp', 'opt_ruins_atlas.webp'],
        'pieces': {}
    }
    quat_slots = {}
    ruin_slots = {}
    q_idx = 0
    r_idx = 0
    COLS, ROWS = 4, 5
    TW, TH = 1024 // COLS, 1024 // ROWS  # 256 x 204
    R_COLS, R_TW, R_TH = 4, 256, 256

    # Remove deprecated props so stale binaries never sneak into builds
    for dead in (
        'opt_palisade', 'opt_banner_stand', 'opt_ruin_stair',
        'opt_ruin_house_shell', 'opt_ruin_house_gable', 'opt_brick_rubble',
        'opt_ruin_chimney', 'opt_ruin_wood_arch', 'opt_rock_crag_a', 'opt_rock_crag_b',
    ):
        for suf in ('', '_LOD1', '_LOD2'):
            p = os.path.join(OUT_MODELS, dead + suf + '.glb')
            if os.path.exists(p):
                os.remove(p)

    for prop_id, rel_path, cfg in SPECS:
        if rel_path == '__COMPOSITE_PIPE_ARCH__':
            ob = build_composite_pipe_arch()
        elif rel_path.startswith('__BIOSHOCK_PIPE_'):
            ob = build_bioshock_pipe(rel_path[len('__BIOSHOCK_PIPE_'):-2])
        else:
            src = find_raw(os.path.basename(rel_path))
            ob = import_and_merge(
                src,
                mesh_filter=cfg.get('mesh_filter'),
                rot_z_deg=cfg.get('rot_z_deg', 0.0),
                rot_x_deg=cfg.get('rot_x_deg', 0.0),
                rot_y_deg=cfg.get('rot_y_deg', 0.0),
                uniform_scale=cfg.get('scale', 1.0),
                scale_xyz=cfg.get('scale_xyz'),
                extra_fn=cfg.get('extra_fn'),
            )

        if cfg['pack'] == 'camp':
            remap_uv_rect(ob.data, CAMP_TILES[cfg['tile']])
            mat = get_or_make_simple_mat('opt_camp_atlas')
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            for poly in ob.data.polygons:
                poly.material_index = 0
        elif cfg['pack'] == 'steam':
            remap_uv_rect(ob.data, STEAM_TILES[cfg['tile']])
            mat = get_or_make_simple_mat('opt_steam_atlas')
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            for poly in ob.data.polygons:
                poly.material_index = 0
        elif cfg['pack'] == 'quat':
            src_mats = [m.name if m else '' for m in ob.data.materials]
            prepare_bake_material_tree(ob, src_mats, prop_id)
            col_i = q_idx % COLS
            row_i = q_idx // COLS
            q_idx += 1
            quat_slots[prop_id] = {'col': col_i, 'row': row_i, 'tw': TW, 'th': TH}
            bake_prop_to_slot(ob, prop_id, col_i, row_i, TW, TH, double_sided=cfg.get('double_sided', False), atlas_mat_name='opt_quat_atlas')
        elif cfg['pack'] == 'ruins':
            prepare_bake_material_tree_generic(ob, tint=cfg.get('tint'), override_tex=cfg.get('tex'))
            col_i = r_idx % R_COLS
            row_i = r_idx // R_COLS
            r_idx += 1
            ruin_slots[prop_id] = {'col': col_i, 'row': row_i, 'tw': R_TW, 'th': R_TH, 'bright': cfg.get('bright', 1.0)}
            bake_prop_to_slot(ob, prop_id, col_i, row_i, R_TW, R_TH, double_sided=False, atlas_mat_name='opt_ruins_atlas')

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
        if 'colliders' in cfg:
            cols = cfg['colliders']
        elif cfg.get('collision', True):
            cw, cd, ch = cfg.get('collider', (size_game[0], size_game[2], size_game[1]))
            cols = [{
                'x': 0.0, 'z': 0.0,
                'w': round(cw, 3), 'd': round(cd, 3), 'h': round(ch, 3), 'y0': 0.0,
                'shape': cfg.get('shape', 'box')
            }]
        else:
            cols = []

        manifest['pieces'][prop_id] = {
            'file': 'operators/' + prop_id + '.glb',
            'size': size_game,
            'tris': tris,
            'lods': kept,
            'bytes': bytes_len,
            'colliders': cols,
            'collision': bool(cols),
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
        print(f"[itch-opt] {prop_id:20s} tris={tris[0]:4d}/{tris[2]:4d} size={size_game} -> {bytes_len:6d} B")

    with open(os.path.join(BAKE_TMP, 'quat_slots.json'), 'w', encoding='utf-8') as f:
        json.dump(quat_slots, f, indent=1)
    with open(os.path.join(BAKE_TMP, 'ruin_slots.json'), 'w', encoding='utf-8') as f:
        json.dump(ruin_slots, f, indent=1)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    lic_txt = """PROJECT STEAM: ORIGINS — OPERATORS TERRITORY 3D ASSETS LICENSES
=================================================================

1. PROCEDURAL ARCHITECTURE & RUINS (CC0 / Project Original)
   - Files: opt_bastion.glb, opt_plaza_deck.glb, opt_plaza_deck_cracked.glb, opt_plaza_deck_edge.glb,
            opt_plaza_steps.glb, opt_bastion_parapet.glb, opt_banner_wall.glb, opt_pennant_wall.glb,
            opt_hero_monument.glb, opt_column*.glb, opt_arch.glb, opt_ruin*.glb, opt_debris.glb,
            opt_block.glb, opt_slab.glb, opt_lamp.glb,
            opt_pipe_arch.glb, opt_pipe_mega_bend.glb, opt_pipe_riser_big.glb, opt_pipe_trench_run.glb,
            textures/opt_atlas.webp
   - Origin: Procedurally generated for Project Steam via headless Blender
     (scripts/operators-territory/build_kit.py, build_itch_props.py & atlas.py).

2. QUATERNIUS — FANTASY PROPS MEGAKIT & MEDIEVAL VILLAGE MEGAKIT & STYLIZED NATURE MEGAKIT (Standard Free Editions)
   - Author: Quaternius (@Quaternius)
   - URLs: https://quaternius.itch.io/fantasy-props-megakit, https://quaternius.itch.io/medieval-village-megakit, https://quaternius.itch.io/stylized-nature-megakit
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Camp & Bastion models (textures/opt_quat_atlas.webp):
     opt_dummy, opt_weapon_rack, opt_anvil, opt_whetstone, opt_workbench,
     opt_table_long, opt_bench_camp, opt_chair, opt_bookcase, opt_bookstand,
     opt_cabinet, opt_chandelier, opt_lantern_indoor, opt_chest, opt_barrel,
     opt_crate, opt_crate_iron, opt_banner_hang (cantilever banner with bracket).
   - Shattered Outskirts Wagons & Dead Trees (textures/opt_ruins_atlas.webp):
     opt_wreck_wagon, opt_wreck_pushcart, opt_dead_tree_a, opt_dead_tree_b.
   - Granite Boulders (textures/opt_ruins_atlas.webp):
     opt_boulder_s, opt_boulder_m, opt_boulder_l (project library SM_RP_Rock_* granite meshes + lifted T_RP_Rocks_2_2K albedo).

3. AVRAMANIA ASSET LIBRARY (Free Editions)
   - Author: Avramania (https://www.avramania.com/)
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Models (packed on opt_camp_atlas.webp):
     opt_wall_stone, opt_weapon_rack_b, opt_rubble_pile, opt_camp_rug,
     opt_cart_wheel, opt_wheelbarrow, opt_signpost, opt_ruin_vault.

4. 3DMODELSCC0 — INDUSTRIAL & MEDIEVAL PROPS PACKS
   - Author: 3dmodelscc0
   - License: CC0 Public Domain (https://creativecommons.org/publicdomain/zero/1.0/)
   - Models: opt_gas_cylinder, opt_cable_drum, opt_work_light, opt_cannon,
     opt_sack_grain (opt_camp_atlas.webp), opt_switch_box (opt_steam_atlas.webp).

5. POLY HAVEN — MODULAR INDUSTRIAL PIPES 01
   - Source: https://polyhaven.com/a/modular_industrial_pipes_01
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Models (packed on opt_steam_atlas.webp):
     opt_pipe_straight, opt_pipe_vertical, opt_pipe_elbow, opt_pipe_tee, opt_pipe_valve.

6. SKC-SHOP — REALISTIC FREE SAMPLER V2
   - Author: SKC-Shop (Itch.io Free Sampler Realistic v2)
   - License: Commercial & Personal Use Permitted without attribution (per package LICENCE.txt:
     no resale as raw standalone 3D/asset-pack redistribution).
   - Models (decimated/Draco/atlased on opt_steam_atlas.webp):
     opt_steam_condenser (CompactCondenser), opt_roof_vent (UpblastRoofVent),
     opt_bench_grinder (BenchGrinder).
"""
    with open(LICENSE_OUT, 'w', encoding='utf-8') as f:
        f.write(lic_txt)


main()
