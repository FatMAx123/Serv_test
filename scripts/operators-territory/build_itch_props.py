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
    for base in (ITCH_RAW, REPO_PROPS):
        hits = glob.glob(os.path.join(base, '**', filename), recursive=True)
        if hits:
            return hits[0]
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

    out_q = os.path.join(OUT_TEX, 'opt_quat_atlas.webp')
    quat_atlas.save(out_q, 'WEBP', quality=85, method=6)
    print('[itch-tex] camp =', os.path.getsize(out_c), '| quat =', os.path.getsize(out_q), '| steam =', os.path.getsize(out_s))


if '--pack-textures' in sys.argv:
    # Water_Barrel texture name may vary; probe dynamically before failing
    try:
        find_raw('barreltex1.png')
    except FileNotFoundError:
        wb_dir = os.path.dirname(find_raw('Water_Barrel.fbx'))
        texs = glob.glob(os.path.join(wb_dir, '*.png')) + glob.glob(os.path.join(ITCH_RAW, '3dmodelscc0_industrial', '**', '*Barrel*.png'), recursive=True)
        # Fallback: copy Sack/Gas tile if barrel PNG isn't loose
        if texs:
            CAMP_TILES['__wb_path'] = texs[0]
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
    wb_hits = glob.glob(os.path.join(ITCH_RAW, '3dmodelscc0_industrial', '**', '*.png'), recursive=True)
    for h in wb_hits:
        if 'water' in h.lower():
            WB_TEX_FNAME = h
            break


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


def bake_prop_to_slot(ob, prop_id, col_i, row_i, tw, th):
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

    mat = get_or_make_simple_mat('opt_quat_atlas')
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


def build_composite_pipe_arch():
    """
    Собирает стимпанковую паровую арку-мост над проездом (пролёт 6.4 м, клиренс 4.2 м)
    из модульных сегментов Poly Haven CC0 pipes.gltf с единой картой opt_steam_atlas!
    """
    clear_scene()
    pipes_gltf = find_raw('pipes.gltf')
    bpy.ops.import_scene.gltf(filepath=pipes_gltf)
    templates = {}
    for o in [x for x in bpy.context.scene.objects if x.type == 'MESH']:
        me_copy = o.data.copy()
        me_copy.use_fake_user = True
        templates[o.name] = me_copy
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    def spawn_part(key, scale, rot_euler, loc, tile_name):
        me = templates[key].copy()
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
        me.transform(Matrix.Translation((-(min(xs)+max(xs))/2, -(min(ys)+max(ys))/2, -(min(zs)+max(zs))/2)))
        remap_uv_rect(me, STEAM_TILES[tile_name])
        ob = bpy.data.objects.new('p', me)
        bpy.context.collection.objects.link(ob)
        ob.scale = scale
        ob.rotation_euler = rot_euler
        ob.location = loc
        return ob

    parts = []
    rx, top_z, h_scale = 3.05, 4.45, 2.25
    # 2 вертикальные стойки слева и справа (pipe02 длина 1.95 -> scale 2.25 => 4.38 м)
    for sx in (-1, 1):
        parts.append(spawn_part('modular_industrial_pipes_01_pipe02', (1.9, 1.9, h_scale), (0, 0, 0), (sx * rx, 0, 2.18), 'pipe1'))
        parts.append(spawn_part('modular_industrial_pipes_01_pipe01', (2.3, 2.3, 1.4), (0, 0, 0), (sx * rx, 0, 0.55), 'pipe1'))
        # Угловой колено-переход наверху (pipe04: x=[-0.40..0.03], z=[0.48..0.93])
        ang_z = 0.0 if sx > 0 else math.pi
        parts.append(spawn_part('modular_industrial_pipes_01_pipe04', (2.1, 2.1, 2.1), (0, 0, ang_z), (sx * (rx - 0.35), 0, top_z - 0.15), 'pipe1'))
        # Нижний контрольный вентиль на опоре
        parts.append(spawn_part('modular_industrial_pipes_01_pipe08', (1.9, 1.9, 1.9), (0, 0, math.pi / 2 if sx < 0 else -math.pi / 2), (sx * rx, -0.32, 1.55), 'pipe2'))
    # Горизонтальная двойная перемычка сверху на высоте 4.7 м
    for ox in (-1.45, 1.45):
        parts.append(spawn_part('modular_industrial_pipes_01_pipe02', (1.9, 1.9, 1.55), (0, math.pi / 2, 0), (ox, 0, top_z + 0.25), 'pipe1'))
    parts.append(spawn_part('modular_industrial_pipes_01_pipe06', (2.1, 2.1, 2.1), (0, math.pi / 2, 0), (0, 0, top_z + 0.25), 'pipe2'))

    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()
    mat = get_or_make_simple_mat('opt_steam_atlas')
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0
    recenter_bottom(ob)
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
     dict(pack='quat', scale=1.15, lod=(1.0, 0.0, 0.0), collision=False, shadow=False,
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
     dict(pack='steam', tile='boiler', scale=2.75, lod=(0.55, 0.0, 0.25), shadow=True,
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
]


def main():
    manifest = {
        'dir': 'operators',
        'textures': ['opt_camp_atlas.webp', 'opt_quat_atlas.webp', 'opt_steam_atlas.webp'],
        'pieces': {}
    }
    quat_slots = {}
    q_idx = 0
    COLS, ROWS = 4, 5
    TW, TH = 1024 // COLS, 1024 // ROWS  # 256 x 204

    # Remove deprecated props so stale binaries never sneak into builds
    for dead in ('opt_palisade', 'opt_banner_stand'):
        for suf in ('', '_LOD1', '_LOD2'):
            p = os.path.join(OUT_MODELS, dead + suf + '.glb')
            if os.path.exists(p):
                os.remove(p)

    for prop_id, rel_path, cfg in SPECS:
        if rel_path == '__COMPOSITE_PIPE_ARCH__':
            ob = build_composite_pipe_arch()
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
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    lic_txt = """PROJECT STEAM: ORIGINS — OPERATORS TERRITORY 3D ASSETS LICENSES
=================================================================

1. PROCEDURAL ARCHITECTURE & RUINS (CC0 / Project Original)
   - Files: opt_bastion.glb, opt_plaza_deck.glb, opt_plaza_steps.glb, opt_bastion_parapet.glb,
            opt_banner_wall.glb, opt_hero_monument.glb, opt_column*.glb, opt_arch.glb,
            opt_ruin*.glb, opt_debris.glb, opt_block.glb, opt_slab.glb, opt_lamp.glb,
            textures/opt_atlas.webp
   - Origin: Procedurally generated for Project Steam via headless Blender
     (scripts/operators-territory/build_kit.py & atlas.py).

2. QUATERNIUS — FANTASY PROPS MEGAKIT (Standard Free Edition)
   - Author: Quaternius (@Quaternius)
   - URL: https://quaternius.itch.io/fantasy-props-megakit
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Imported & Draco/LOD/Atlas-baked single-material models:
     opt_dummy, opt_weapon_rack, opt_anvil, opt_whetstone, opt_workbench,
     opt_table_long, opt_bench_camp, opt_chair, opt_bookcase, opt_bookstand,
     opt_cabinet, opt_chandelier, opt_lantern_indoor, opt_chest, opt_barrel,
     opt_crate, opt_crate_iron, opt_banner_hang (cantilever banner with bracket).
   - Shared baked atlas: textures/opt_quat_atlas.webp.

3. AVRAMANIA ASSET LIBRARY (Free Editions)
   - Author: Avramania (https://www.avramania.com/)
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Models (packed on opt_camp_atlas.webp):
     opt_wall_stone (mdvl_props_wall_stone_01.glb),
     opt_weapon_rack_b (mdvl_weapons_rack_01.glb),
     opt_rubble_pile (mdvl_dungeon_rubble_01.glb),
     opt_camp_rug (mdvl_interiors_rug_01.glb).

4. 3DMODELSCC0 — INDUSTRIAL & MEDIEVAL PROPS PACKS
   - Author: 3dmodelscc0
   - License: CC0 Public Domain (https://creativecommons.org/publicdomain/zero/1.0/)
   - Models: opt_gas_cylinder, opt_cable_drum, opt_work_light, opt_cannon,
     opt_sack_grain (opt_camp_atlas.webp), opt_switch_box (opt_steam_atlas.webp).

5. POLY HAVEN — MODULAR INDUSTRIAL PIPES 01
   - Source: https://polyhaven.com/a/modular_industrial_pipes_01
   - License: CC0 1.0 Universal (Public Domain Dedication)
   - Models (packed on opt_steam_atlas.webp):
     opt_pipe_straight, opt_pipe_vertical, opt_pipe_elbow, opt_pipe_tee,
     opt_pipe_valve, opt_pipe_arch (compound overhead pipeline bridge).

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
