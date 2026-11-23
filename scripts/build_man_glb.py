# ============================================================
#  build_man_glb.py — мужской персонаж Engineer (engi/man)
#
#  Запуск (сначала атлас, потом headless Blender 5.2):
#    python scripts/build_man_atlas.py
#    blender -b --factory-startup --python scripts/build_man_glb.py
#
#  Вход (engi/man/):
#    man.fbx                — меш (Body/Tshirt/Shorts/Hair) + Mixamo-риг и веса
#    animations/*.fbx       — Mixamo-клипы, записанные на ЖЕНСКОМ скелете
#    animations/эмодзи.fbx  — эмоции/сидение (другой масштаб рига)
#    Textures/man_atlas*.webp — атлас 2×2 из build_man_atlas.py
#
#  Выход (engi/man/):
#    man.glb       — LOD0 + скелет + все 31 клип, атлас 2048 WebP внутри
#    man_lod1.glb  — ~45% треугольников, тот же скелет, атлас 1024, без клипов
#    man_lod2.glb  — ~20% треугольников, тот же скелет, атлас 512, без клипов
#  Все меши — Draco. Имена клипов как у woman.glb (idle, walk, fast_run, ...).
#
#  Ретаргет: скелеты одинаковые (65 костей mixamorig), но пропорции и T-поза
#  разные (у мужчины руки ниже на ~9°, ноги шире на ~7°). Поэтому сначала rest
#  мужчины доворачивается до направлений костей женского rest (как retarget pose
#  в UE), затем переносится мировая дельта поворота от rest. Бёдра — по
#  отношению высот таза. MAN_ALIGN_REST=0 — чистая дельта без выравнивания.
# ============================================================
import bpy, bmesh, os, sys, math
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'man')
ANIM_DIR = os.path.join(MDIR, 'animations')
TEX_DIR = os.path.join(MDIR, 'Textures')
SRC_FBX = os.path.join(MDIR, 'man.fbx')
OUT_DIR = os.environ.get('MAN_OUT_DIR', MDIR)
OUT_FPS = 30
HIPS = 'mixamorig:Hips'
# man.fbx (Tripo → Mixamo) ~1.03 м; движок не масштабирует (fitToHeight держит
# авторский масштаб), CHAR_MODELS.engi_m.height = 1.85
TARGET_HEIGHT = float(os.environ.get('MAN_HEIGHT', '1.85'))
ALIGN_REST = os.environ.get('MAN_ALIGN_REST', '1') != '0'

# Часть определяется по текстуре материала (имена tripo_node_* случайные)
PART_BY_TEX = {'main_color': 'Body', 'tshirt_color': 'Tshirt',
               'short_color': 'Shorts', 'haier_color': 'Hair'}
# Раскладка атласа — как в build_man_atlas.py: часть → (колонка, ряд)
ATLAS = {'Body': (0, 1), 'Tshirt': (1, 1), 'Shorts': (0, 0), 'Hair': (1, 0)}
PAD_FRAC = 1 / 128
ATLAS_IMG = ['man_atlas.webp', 'man_atlas_lod1.webp', 'man_atlas_lod2.webp']

MIXAMO_CLIPS = {
    'Idle.fbx': 'idle',
    'Walk.fbx': 'walk',
    'Fast Run.fbx': 'fast_run',
    'Sword And Shield Run.fbx': 'sword_run',
    'Boxing.fbx': 'boxing',
    'Sword And Shield Slash.fbx': 'sword_slash',
    'Sword And Shield Power Up.fbx': 'power_up',
    'Sword And Shield Casting.fbx': 'sword_cast_1',
    'Sword And Shield Casting (1).fbx': 'sword_cast_2',
    'Standing 1H Cast Spell 01.fbx': 'cast_1h',
    'Standing 1H Magic Attack 03.fbx': 'attack_1h',
    'Standing 2H Cast Spell 01.fbx': 'cast_2h',
    'Standing 2H Magic Attack 05.fbx': 'attack_2h',
    'Standing 2H Magic Area Attack 01.fbx': 'area_attack_1',
    'Standing 2H Magic Area Attack 02.fbx': 'area_attack_2',
    'Great Sword Casting.fbx': 'great_sword_cast',
    'Flying Back Death.fbx': 'death_back',
    'Standing React Death Forward.fbx': 'death_front',
    'Sword And Shield Death.fbx': 'death_sword_1',
    'Sword And Shield Death (1).fbx': 'death_sword_2',
}
EMOTE_FBX = 'эмодзи.fbx'
EMOTE_CLIPS = [
    'afraid', 'bow', 'clap', 'complain', 'dance', 'heart_pose', 'laugh', 'warm_up',
    'stand_up', 'sit_down', 'sit_loop'
]
# Циклы передвижения: горизонтальный дрейф бёдер убирается (in-place)
IN_PLACE = {'idle', 'walk', 'fast_run', 'sword_run', 'sit_loop', 'dance', 'clap', 'warm_up'}

# Доля треугольников по частям. Открытые края (ворот, рукава, низ шорт) от
# схлопывания защищены — держат силуэт. У причёски открыт почти каждый край
# (460 из 574 вершин — пряди-оболочки): с защитой она не ужимается вовсе,
# без защиты 50% визуально не отличить от LOD0 (сверено рендером).
LODS = [('man_lod1.glb', {'*': 0.45, 'Hair': 0.50}),
        ('man_lod2.glb', {'*': 0.20, 'Hair': 0.30})]
PROTECT_BORDER = {'Body': True, 'Tshirt': True, 'Shorts': True, 'Hair': False}
# В LOD тело под одеждой вырезается: упрощённые отдельно тело и ткань иначе
# пересекаются, и кожа проступает сквозь футболку/шорты. Грань тела убирается,
# если луч по нормали из каждой её вершины упирается в одежду ближе COVER_DIST.
# Под причёской не режем — между прядями видно голову.
COVER_BY = ('Tshirt', 'Shorts')
COVER_DIST = 0.08


def log(*a):
    print('[man]', *a, flush=True)


def import_fbx(path):
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    new = [o for o in bpy.data.objects if o not in before]
    acts = [a for a in bpy.data.actions if a not in acts_before]
    return new, acts, fps


def delete_objs(objs):
    for o in list(objs):
        bpy.data.objects.remove(o, do_unlink=True)


def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


# ─── 1. Меш + риг ───────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
src_new, src_acts, _ = import_fbx(SRC_FBX)
arm = next(o for o in src_new if o.type == 'ARMATURE')
arm.name = 'Armature'
arm.data.name = 'Armature'
if arm.animation_data:
    arm.animation_data.action = None
for a in src_acts:
    bpy.data.actions.remove(a)

parts = {}
for o in src_new:
    if o.type != 'MESH':
        continue
    imgs = [n.image.name for m in o.data.materials if m and m.node_tree
            for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    key = next((k for k in PART_BY_TEX if any(i.startswith(k) for i in imgs)), None)
    assert key, ('unknown part', o.name, imgs)
    parts[PART_BY_TEX[key]] = o
assert set(parts) == set(ATLAS), parts.keys()
delete_objs([o for o in src_new if o is not arm and o not in parts.values()])

# В метры, Z-up, ноги на z=0, рост TARGET_HEIGHT; трансформы объектов → identity
for o in parts.values():
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
bpy.context.view_layer.update()
zs = [(o.matrix_world @ v.co).z for o in parts.values() for v in o.data.vertices]
src_h = max(zs) - min(zs)
S = TARGET_HEIGHT / src_h
fix = Matrix.Scale(S, 4) @ Matrix.Translation((0, 0, -min(zs)))
for o in [arm] + list(parts.values()):
    o.matrix_world = fix @ o.matrix_world
select_only([arm] + list(parts.values()), arm)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
log(f'height {src_h:.3f} m -> {TARGET_HEIGHT:.3f} m (x{S:.3f})')

arm.data.pose_position = 'POSE'
for b in arm.data.bones:
    b.use_deform = not b.name.endswith('_End')
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
    pb.matrix_basis = Matrix.Identity(4)
for name, o in parts.items():
    o.name = name
    o.data.name = name
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    for m in [m for m in o.modifiers if m.type == 'ARMATURE']:
        o.modifiers.remove(m)
    o.modifiers.new('Armature', 'ARMATURE').object = arm

# Контроль: rest скелета совпадает с bind-позой меша (иначе меш «поедет»)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for o in parts.values():
    ev = o.evaluated_get(dg).data
    d = max((ev.vertices[i].co - v.co).length for i, v in enumerate(o.data.vertices))
    assert d < 1e-3, (o.name, 'rest != bind', d)


# ─── 2. Веса: ≤4 кости на вершину (лимит glTF/three.js) ─────
def weights_of(o, vi):
    gn = {g.index: g.name for g in o.vertex_groups}
    return {gn[g.group]: g.weight for g in o.data.vertices[vi].groups if g.weight > 0}


def write_weights(o, vi, w):
    for g in o.vertex_groups:
        g.remove([vi])
    for n, val in w.items():
        g = o.vertex_groups.get(n) or o.vertex_groups.new(name=n)
        g.add([vi], val, 'REPLACE')


def normalize_limit(o, limit=4, eps=0.01):
    for v in o.data.vertices:
        w = weights_of(o, v.index)
        items = sorted(w.items(), key=lambda kv: -kv[1])[:limit]
        items = [(n, x) for n, x in items if x >= eps] or items[:1]
        s = sum(x for _, x in items)
        nw = {n: x / s for n, x in items}
        if nw != w:
            write_weights(o, v.index, nw)
    # пустые группы — по имени: remove() сдвигает индексы следующих групп
    used = {ge.group for v in o.data.vertices for ge in v.groups}
    for gname in [g.name for g in o.vertex_groups if g.index not in used]:
        o.vertex_groups.remove(o.vertex_groups[gname])


for o in parts.values():
    normalize_limit(o)


# ─── 3. Атлас: UV в квадрант части, один материал ───────────
def atlas_material(name, img_file):
    path = os.path.join(TEX_DIR, img_file)
    assert os.path.exists(path), f'нет {path} — сначала python scripts/build_man_atlas.py'
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.8
    return mat


mats = [atlas_material(f'man_atlas{"" if i == 0 else f"_lod{i}"}', f) for i, f in enumerate(ATLAS_IMG)]
k = (1 - 2 * PAD_FRAC) * 0.5
for name, o in parts.items():
    col, row = ATLAS[name]
    me = o.data
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[1])
    uvl = me.uv_layers[0]
    uvl.name = 'UVMap'
    for d in uvl.data:
        u, v = d.uv
        d.uv = ((col + PAD_FRAC) * 0.5 + u * k, (row + PAD_FRAC) * 0.5 + v * k)
    me.materials.clear()
    me.materials.append(mats[0])
for img in list(bpy.data.images):
    if not img.users:
        bpy.data.images.remove(img)
for m in list(bpy.data.materials):
    if not m.users and m not in mats:
        bpy.data.materials.remove(m)

# ─── 4. Ретаргет клипов ────────────────────────────────────
tgt_rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
tgt_dir = {b.name: (b.tail_local - b.head_local) for b in arm.data.bones}
tgt_parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
order = []


def _walk(b):
    order.append(b.name)
    for c in b.children:
        _walk(c)


for b in arm.data.bones:
    if not b.parent:
        _walk(b)
tgt_hips_h = tgt_rest[HIPS].translation.z


def new_action(name):
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type='OBJECT', name='Armature')
    layer = act.layers.new('Layer')
    strip = layer.strips.new(type='KEYFRAME')
    cb = strip.channelbag(slot, ensure=True)
    return act, slot, cb


def retarget(src_arm, src_actions, src_fps, clip_name):
    """src_actions: list of (id, action) — анимируемые ID источника (арматура/родитель)."""
    sc = bpy.context.scene
    for idb, _ in src_actions:
        if idb.animation_data:
            idb.animation_data.action = None
    sc.frame_set(0)
    bpy.context.view_layer.update()
    mw0 = src_arm.matrix_world.copy()
    src_rest_w = {b.name: mw0 @ b.matrix_local for b in src_arm.data.bones}
    src_names = {b.name for b in src_arm.data.bones}
    # Выравнивание rest: поворот, сводящий направление кости мужчины к женской
    align = {}
    if ALIGN_REST:
        for b in src_arm.data.bones:
            sd = (mw0 @ b.tail_local) - (mw0 @ b.head_local)
            td = tgt_dir.get(b.name)
            if td is not None and sd.length > 1e-6 and td.length > 1e-6:
                align[b.name] = td.normalized().rotation_difference(sd.normalized())
    src_hips_h = src_rest_w[HIPS].translation.z
    ratio = tgt_hips_h / src_hips_h
    lo, hi = 1e9, -1e9
    for idb, act in src_actions:
        ad = idb.animation_data or idb.animation_data_create()
        ad.action = act
        if act.slots and ad.action_slot is None:
            ad.action_slot = act.slots[0]
        lo = min(lo, act.frame_range[0]); hi = max(hi, act.frame_range[1])
    dur = (hi - lo) / src_fps
    n = int(round(dur * OUT_FPS)) + 1
    keys = {bn: [] for bn in order}  # (loc, quat)
    hips_track = []
    for f_i in range(n):
        f = lo + f_i * src_fps / OUT_FPS
        fi = int(math.floor(f))
        sc.frame_set(fi, subframe=f - fi)
        mw = src_arm.matrix_world
        pose_t = {}
        for bn in order:
            rt = tgt_rest[bn]
            rq = align.get(bn, Quaternion()) @ rt.to_quaternion()
            if bn in src_names:
                pb = src_arm.pose.bones[bn]
                d = (mw @ pb.matrix).to_quaternion() @ src_rest_w[bn].to_quaternion().inverted()
                q_t = d @ rq
            else:
                q_t = None
            par = tgt_parent[bn]
            if par is None:
                if bn in src_names:
                    hp = (mw @ src_arm.pose.bones[bn].matrix).translation
                    pos = rt.translation + (hp - src_rest_w[bn].translation) * ratio
                else:
                    pos = rt.translation
                q_t = q_t or rt.to_quaternion()
                P = Matrix.Translation(pos) @ q_t.to_matrix().to_4x4()
                B = rt.inverted() @ P
            else:
                Pp, Rp = pose_t[par], tgt_rest[par]
                base = Pp @ Rp.inverted() @ rt
                bq = Quaternion() if q_t is None else base.to_quaternion().inverted() @ q_t
                B = bq.to_matrix().to_4x4()
                P = base @ B
            pose_t[bn] = P
            loc, rot, _ = B.decompose()
            keys[bn].append((loc, rot))
        hips_track.append(pose_t[HIPS].translation.copy())
    if clip_name in IN_PLACE and n > 1:
        d0, d1 = hips_track[0], hips_track[-1]
        drift = Vector((d1.x - d0.x, d1.y - d0.y, 0))
        if drift.length > 0.02:
            rt = tgt_rest[HIPS]
            for f_i in range(n):
                t = f_i / (n - 1)
                wp = hips_track[f_i] - drift * t
                q = keys[HIPS][f_i][1]
                P = Matrix.Translation(wp) @ (rt.to_quaternion() @ q).to_matrix().to_4x4()
                loc, rot, _ = (rt.inverted() @ P).decompose()
                keys[HIPS][f_i] = (loc, rot)
            log(f'  {clip_name}: removed root drift {drift.length:.3f} m')
    act, slot, cb = new_action(clip_name)
    for bn in order:
        seq = keys[bn]
        prev = None
        qs = []
        for _, q in seq:
            q = q.copy()
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            qs.append(q); prev = q
        pbp = f'pose.bones["{bn}"]'
        for i in range(4):
            fc = cb.fcurves.new(pbp + '.rotation_quaternion', index=i, group_name=bn)
            fc.keyframe_points.add(n)
            co = []
            for f_i in range(n):
                co += [float(f_i), qs[f_i][i]]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', [1] * n)  # LINEAR
            fc.update()
        if bn == HIPS:
            for i in range(3):
                fc = cb.fcurves.new(pbp + '.location', index=i, group_name=bn)
                fc.keyframe_points.add(n)
                co = []
                for f_i in range(n):
                    co += [float(f_i), seq[f_i][0][i]]
                fc.keyframe_points.foreach_set('co', co)
                fc.keyframe_points.foreach_set('interpolation', [1] * n)
                fc.update()
    act.use_fake_user = True
    log(f'  clip {clip_name}: {n} frames, {dur:.2f}s, src_fps={src_fps}, hips_ratio={ratio:.3f}')
    return act, slot


def is_bone_action(a):
    if hasattr(a, 'layers'):
        for layer in a.layers:
            for st in layer.strips:
                for cb in st.channelbags:
                    if any(fc.data_path.startswith('pose.bones') for fc in cb.fcurves):
                        return True
        return False
    return any(fc.data_path.startswith('pose.bones') for fc in a.fcurves)


def find_emote_actions(acts, cname):
    tag = {'stand_up': 'встаёт', 'sit_down': 'садится'}.get(cname)
    if tag:
        match = lambda a: tag in a.name
    elif cname == 'sit_loop':
        match = lambda a: 'скромно сидит' in a.name and 'встаёт' not in a.name and 'садится' not in a.name
    else:
        match = lambda a: cname in a.name
    arm_act = next(a for a in acts if is_bone_action(a) and match(a))
    par_act = next((a for a in acts if not is_bone_action(a) and match(a)), None)
    return arm_act, par_act


clips = []
for fname, cname in MIXAMO_CLIPS.items():
    new, acts, fps = import_fbx(os.path.join(ANIM_DIR, fname))
    sa = next(o for o in new if o.type == 'ARMATURE')
    act = sa.animation_data.action if sa.animation_data and sa.animation_data.action else acts[0]
    clips.append(retarget(sa, [(sa, act)], fps, cname))
    delete_objs(new)
    for a in acts:
        bpy.data.actions.remove(a)

new, acts, fps = import_fbx(os.path.join(ANIM_DIR, EMOTE_FBX))
sa = next(o for o in new if o.type == 'ARMATURE')
parent = sa.parent
for cname in EMOTE_CLIPS:
    a_arm, a_par = find_emote_actions(acts, cname)
    pair = [(sa, a_arm)]
    if parent is not None and a_par is not None:
        pair.append((parent, a_par))
    clips.append(retarget(sa, pair, fps, cname))
delete_objs(new)
for a in acts:
    bpy.data.actions.remove(a)
for m in list(bpy.data.materials):
    if not m.users and m not in mats:
        bpy.data.materials.remove(m)
for img in list(bpy.data.images):
    if not img.users:
        bpy.data.images.remove(img)

bpy.context.scene.render.fps = OUT_FPS
bpy.context.scene.render.fps_base = 1.0

# NLA: каждый клип отдельной дорожкой → glTF exporter (ACTIONS) экспортирует все
ad = arm.animation_data or arm.animation_data_create()
ad.action = None
for act, slot in clips:
    tr = ad.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, 0, act)
    try:
        st.action_slot = slot
    except Exception:
        pass
    tr.mute = True
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.scene.frame_set(0)


# ─── 5. LOD ────────────────────────────────────────────────
def apply_first(c, mod_name):
    bpy.context.view_layer.objects.active = c
    while c.modifiers[0].name != mod_name:
        bpy.ops.object.modifier_move_up(modifier=mod_name)
    bpy.ops.object.modifier_apply(modifier=mod_name)


def cut_covered_body(me):
    """Удаляет грани тела, целиком закрытые одеждой (rest-поза LOD0)."""
    from mathutils.bvhtree import BVHTree
    cloth = bmesh.new()
    for n in COVER_BY:
        cloth.from_mesh(parts[n].data)
    tree = BVHTree.FromBMesh(cloth)
    bm = bmesh.new(); bm.from_mesh(me)
    covered = set()
    for v in bm.verts:
        nrm = v.normal
        hit = tree.ray_cast(v.co - nrm * 0.002, nrm, COVER_DIST)
        if hit[0] is not None:
            covered.add(v.index)
    faces = [f for f in bm.faces if all(v.index in covered for v in f.verts)]
    bmesh.ops.delete(bm, geom=faces, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free(); cloth.free()
    return len(faces)


def make_lod(ratios, lvl):
    out = []
    for name, o in parts.items():
        c = o.copy(); c.data = o.data.copy()
        c.name = f'{name}_lod{lvl}'
        c.data.name = c.name
        bpy.context.scene.collection.objects.link(c)
        c.parent = arm
        # бюджет треугольников — доля от LOD0 части, даже если часть граней вырезана
        budget = ratios.get(name, ratios['*']) * tris([o])
        if name == 'Body':
            log(f'  LOD{lvl}: body faces under clothes removed', cut_covered_body(c.data))
        dm = c.modifiers.new('Decimate', 'DECIMATE')
        dm.decimate_type = 'COLLAPSE'
        dm.ratio = min(1.0, budget / max(1, tris([c])))
        dm.use_collapse_triangulate = True
        if PROTECT_BORDER[name]:
            bm = bmesh.new(); bm.from_mesh(c.data)
            border = [v.index for v in bm.verts if v.is_boundary]
            bm.free()
            g = c.vertex_groups.new(name='_lod_keep')
            g.add(list(range(len(c.data.vertices))), 0.0, 'REPLACE')
            if border:
                g.add(border, 1.0, 'REPLACE')
            dm.vertex_group = '_lod_keep'
            dm.invert_vertex_group = True
            dm.vertex_group_factor = 1000.0
        apply_first(c, 'Decimate')
        if '_lod_keep' in c.vertex_groups:
            c.vertex_groups.remove(c.vertex_groups['_lod_keep'])
        if name == 'Hair':
            # нормали после коллапса на тонкой оболочке битые → берём с LOD0
            dt = c.modifiers.new('NrmXfer', 'DATA_TRANSFER')
            dt.object = o
            dt.use_loop_data = True
            dt.data_types_loops = {'CUSTOM_NORMAL'}
            dt.loop_mapping = 'POLYINTERP_NEAREST'
            apply_first(c, 'NrmXfer')
        c.data.materials.clear()
        c.data.materials.append(mats[lvl])
        normalize_limit(c)
        out.append(c)
    return out


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


def export(path, objs, animations):
    select_only([arm] + objs, arm)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_image_format='AUTO',        # WebP атласа встраивается как есть
        export_skins=True,
        export_all_influences=False,
        export_def_bones=False,
        export_animations=animations,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_morph=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_generic_quantization=12,
    )
    log('exported', os.path.basename(path), f'{os.path.getsize(path)/1024:.0f} KB', 'tris', tris(objs))


os.makedirs(OUT_DIR, exist_ok=True)
lod0 = list(parts.values())
log('LOD0 tris', tris(lod0), {n: tris([o]) for n, o in parts.items()})
export(os.path.join(OUT_DIR, 'man.glb'), lod0, True)
for lvl, (fname, ratios) in enumerate(LODS, 1):
    lod = make_lod(ratios, lvl)
    log(f'LOD{lvl} tris', tris(lod), {o.name: tris([o]) for o in lod})
    export(os.path.join(OUT_DIR, fname), lod, False)

if '--save-blend' in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, 'man_rigged.blend'))
log('DONE')
