# ============================================================
#  build_woman_glb.py — женский персонаж Engineer (L2-style модульный)
#
#  Запуск (headless Blender 5.2):
#    blender -b --factory-startup --python scripts/build_woman_glb.py
#
#  Вход:
#    Woman/woman_MAIN.fbx        — мастер-меш (6 частей, без скелета)
#    Woman/animations/*.fbx      — Mixamo-клипы (тот же меш, тот же порядок вершин)
#    Woman/animations/эмодзи.fbx — эмоции/сидение (другой масштаб рига → ретаргет)
#
#  Выход (Woman/):
#    woman.glb       — LOD0: части Head/tors/hands/Shorts/legs/Haier + скелет + все клипы
#    hair.glb        — только причёска (жёстко на mixamorig:Head), тот же скелет
#    woman_lod1.glb  — ~45% треугольников, тот же скелет, без клипов
#    woman_lod2.glb  — ~20% треугольников, тот же скелет, без клипов
#  Все меши — Draco. Текстура атласа подключается движком (как у man.glb).
# ============================================================
import bpy, os, sys, math, glob
from mathutils import Matrix, Vector, Quaternion
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
ANIM_DIR = os.path.join(WDIR, 'animations')
MAIN_FBX = os.path.join(WDIR, 'woman_MAIN.fbx')
SKIN_SRC_FBX = os.path.join(ANIM_DIR, 'Idle.fbx')   # источник скелета и Mixamo-весов
OUT_FPS = 30
HEAD_BONE = 'mixamorig:Head'

# woman_MAIN.fbx: 'tors' — это голова, 'tors.001' — торс (Mixamo-имена: Head / tors)
PART_MAP = {'Haier': 'Haier', 'hands': 'hands', 'tors': 'Head',
            'legs': 'legs', 'Shorts': 'Shorts', 'tors.001': 'tors'}

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


def find_emote_actions(acts, cname):
    if cname == 'stand_up':
        arm_act = next(a for a in acts if is_bone_action(a) and 'встаёт' in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'встаёт' in a.name), None)
    elif cname == 'sit_down':
        arm_act = next(a for a in acts if is_bone_action(a) and 'садится' in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'садится' in a.name), None)
    elif cname == 'sit_loop':
        arm_act = next(a for a in acts if is_bone_action(a) and 'скромно сидит' in a.name and 'встаёт' not in a.name and 'садится' not in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'скромно сидит' in a.name and 'встаёт' not in a.name and 'садится' not in a.name), None)
    else:
        arm_act = next(a for a in acts if is_bone_action(a) and cname in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and cname in a.name), None)
    return arm_act, par_act
# Циклы передвижения: горизонтальный дрейф бёдер убирается (in-place), вертикаль остаётся
IN_PLACE = {'idle', 'walk', 'fast_run', 'sword_run', 'sit_loop', 'dance', 'clap', 'warm_up'}

# Доля треугольников по частям. Причёска — тонкие оболочки с UV-швами: при 20%
# коллапс рвёт UV макушки, поэтому для неё коэффициент мягче.
LODS = [('woman_lod1.glb', {'*': 0.45, 'Haier': 0.50}),
        ('woman_lod2.glb', {'*': 0.20, 'Haier': 0.30})]
# Упрощённая оболочка волос проседает внутрь черепа → раздуваем по нормалям (м)
HAIR_LOD_INFLATE = {1: 0.0, 2: 0.0}
HAIR_LOD_ANGLE = {1: 6.0, 2: 14.0}
HAIR_PLANAR = False
# Защита UV-швов при коллапсе: проверено — тело на 20% выглядит хуже (остальное
# схлопывается сильнее), поэтому выключено; швы частей (границы) защищены всегда
PROTECT_UV_SEAMS = False


def log(*a):
    print('[woman]', *a, flush=True)


def objs_before():
    return set(bpy.data.objects)


def import_fbx(path):
    before = objs_before()
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


# ─── 1. Скелет + Mixamo-веса (источник) ─────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
src_new, src_acts, _ = import_fbx(SKIN_SRC_FBX)
arm = next(o for o in src_new if o.type == 'ARMATURE')
arm.name = 'Armature'
arm.data.name = 'Armature'
if arm.animation_data:
    arm.animation_data.action = None
for a in src_acts:
    bpy.data.actions.remove(a)
src_meshes = {o.name: o for o in src_new if o.type == 'MESH'}
for n, o in src_meshes.items():
    o.name = 'SRC_' + n
    o.data.name = 'SRC_' + n

# ─── 2. Мастер-меш woman_MAIN.fbx ───────────────────────────
main_new, main_acts, _ = import_fbx(MAIN_FBX)
parts = {}
for o in main_new:
    if o.type != 'MESH':
        continue
    tgt = PART_MAP.get(o.name)
    if not tgt:
        log('skip unknown part', o.name)
        continue
    src = src_meshes[tgt]
    assert len(o.data.vertices) == len(src.data.vertices), (o.name, tgt)
    o.name = 'NEW_' + tgt
    parts[tgt] = o
select_only(list(parts.values()))
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Перенос весов по индексу вершины (топология и порядок вершин совпадают 1:1)
for name, o in parts.items():
    src = src_meshes[name]
    o.vertex_groups.clear()
    gname = {g.index: g.name for g in src.vertex_groups}
    groups = {}
    for v in src.data.vertices:
        for ge in v.groups:
            if ge.weight <= 0:
                continue
            gn = gname[ge.group]
            if gn not in groups:
                groups[gn] = o.vertex_groups.new(name=gn)
            groups[gn].add([v.index], ge.weight, 'REPLACE')

delete_objs(src_meshes.values())

# Скелет в метры, Z-up, без поворота/масштаба на объекте
select_only([arm])
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
arm.data.pose_position = 'POSE'
bone_names = [b.name for b in arm.data.bones]
for name, o in parts.items():
    o.name = name
    o.data.name = name
    o.parent = arm
    o.matrix_parent_inverse = Matrix.Identity(4)
    m = o.modifiers.new('Armature', 'ARMATURE')
    m.object = arm

# ─── 3. Чистка скина ────────────────────────────────────────
def set_rigid(o, bone):
    o.vertex_groups.clear()
    g = o.vertex_groups.new(name=bone)
    g.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')


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
    """Не более 4 костей на вершину (лимит glTF/three.js), без мусорных весов."""
    for v in o.data.vertices:
        w = weights_of(o, v.index)
        items = sorted(w.items(), key=lambda kv: -kv[1])[:limit]
        items = [(n, x) for n, x in items if x >= eps] or items[:1]
        s = sum(x for _, x in items)
        nw = {n: x / s for n, x in items}
        if nw != w:
            write_weights(o, v.index, nw)
    for g in list(o.vertex_groups):  # пустые группы
        if not any(ge.group == g.index for v in o.data.vertices for ge in v.groups):
            o.vertex_groups.remove(g)


def weld_seams(objs, tol=0.004):
    """Стыки частей (броня L2): совпадающие вершины соседних частей получают
    одинаковые веса → швы не расходятся в анимации."""
    pts = []
    for o in objs:
        for v in o.data.vertices:
            pts.append((o, v.index, o.matrix_world @ v.co))
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p[2], i)
    kd.balance()
    done = set()
    welded = 0
    for i, (o, vi, co) in enumerate(pts):
        if i in done:
            continue
        cluster = [j for (_, j, _) in kd.find_range(co, tol)]
        if len({pts[j][0].name for j in cluster}) < 2:
            continue
        acc = {}
        for j in cluster:
            for n, x in weights_of(pts[j][0], pts[j][1]).items():
                acc[n] = acc.get(n, 0) + x
        s = sum(acc.values())
        avg = {n: x / s for n, x in acc.items()}
        for j in cluster:
            done.add(j)
            write_weights(pts[j][0], pts[j][1], avg)
            welded += 1
    return welded


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def drop_far_influences(o, slack=0.06):
    """woman_MAIN правили после авто-рига Mixamo: часть вершин держится за
    кости, до которых теперь далеко (шея → Spine2 на 73%). Влияние кости,
    которая дальше ближайшей влияющей кости на > slack м, убирается."""
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    fixed = 0
    for v in o.data.vertices:
        w = weights_of(o, v.index)
        if len(w) < 2:
            continue
        d = {n: seg_dist(v.co, *segs[n]) for n in w if n in segs}
        near = min(d.values())
        nw = {n: x for n, x in w.items() if d.get(n, 0) <= near + slack}
        if len(nw) < len(w):
            s = sum(nw.values())
            write_weights(o, v.index, {n: x / s for n, x in nw.items()})
            fixed += 1
    return fixed


def smooth_weights(o, iters, lam=0.5):
    """Лапласовское сглаживание весов по рёбрам меша: убирает рваные
    переходы (пах шорт, подмышки, шея) без смены набора костей."""
    nv = len(o.data.vertices)
    adj = [[] for _ in range(nv)]
    for e in o.data.edges:
        a, b = e.vertices
        adj[a].append(b); adj[b].append(a)
    W = [weights_of(o, i) for i in range(nv)]
    for _ in range(iters):
        NW = []
        for i in range(nv):
            if not adj[i]:
                NW.append(W[i]); continue
            acc = {}
            for j in adj[i]:
                for n, x in W[j].items():
                    acc[n] = acc.get(n, 0) + x / len(adj[i])
            mix = {n: (1 - lam) * W[i].get(n, 0) + lam * acc.get(n, 0) for n in set(W[i]) | set(acc)}
            s = sum(mix.values())
            NW.append({n: x / s for n, x in mix.items() if x > 1e-4})
        W = NW
    for i in range(nv):
        write_weights(o, i, W[i])


def auto_weights(o):
    """Blender bone-heat веса (концевые *_End кости не деформируют)."""
    o.vertex_groups.clear()
    for mname in [m.name for m in o.modifiers if m.type == 'ARMATURE']:
        o.modifiers.remove(o.modifiers[mname])
    o.parent = None
    select_only([o, arm], arm)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    o.matrix_parent_inverse = Matrix.Identity(4)


for b in arm.data.bones:
    b.use_deform = not b.name.endswith('_End')

set_rigid(parts['Haier'], HEAD_BONE)   # причёска — жёстко на голове, как hair1.glb у man
body = [parts[n] for n in ('Head', 'tors', 'hands', 'Shorts', 'legs')]
# mixamo = перенос весов авто-рига Mixamo + чистка; auto = bone heat Blender
# Замер растяжения рёбер по всем 31 клипу: bone heat лучше Mixamo на всех частях
# (пик ×3.6 против ×4.7; веса Mixamo «съехали» после правок формы woman_MAIN)
WEIGHT_MODE = {'Head': 'auto', 'tors': 'auto', 'hands': 'auto', 'Shorts': 'auto', 'legs': 'auto'}
SMOOTH_AUTO = {'Shorts': int(os.environ.get('WOMAN_SHORTS_SMOOTH', '0')), 'tors': 1}
for kv in filter(None, os.environ.get('WOMAN_WEIGHTS', '').split(',')):
    k, v = kv.split('=')
    WEIGHT_MODE[k] = v
SMOOTH = {'Head': 4, 'tors': 3, 'Shorts': 4, 'legs': 2, 'hands': 1}
for o in body:
    if WEIGHT_MODE[o.name] == 'auto':
        auto_weights(o)
        if SMOOTH_AUTO.get(o.name):
            smooth_weights(o, SMOOTH_AUTO[o.name])
        log('auto weights', o.name, len(o.vertex_groups))
        continue
    log('far influences dropped', o.name, drop_far_influences(o))
    smooth_weights(o, SMOOTH[o.name])
    drop_far_influences(o)

# ─── Грудь: единый «носитель» Spine1/Spine2 ─────────────────
# Bone heat раздавал груди Hips/плечи/руки (Spine2 ≈4%) → при опущенных руках
# бока груди тянуло к плечам, форма становилась квадратной со складкой снизу.
# Внутри эллипсоида груди веса равномерные → объём двигается целиком и
# сохраняет круглую форму модели; к краю плавно переходят в автовеса.
BREAST_CENTERS = [Vector((0.075, -0.11, 1.30)), Vector((-0.075, -0.11, 1.30))]
BREAST_RADII = Vector((0.105, 0.12, 0.105))
BREAST_CARRIER = {'mixamorig:Spine1': 0.5, 'mixamorig:Spine2': 0.5}


def breast_mask(co):
    if co.y > 0.0:  # только передняя сторона торса
        return 0.0
    d = min(Vector(((co - c).x / BREAST_RADII.x, (co - c).y / BREAST_RADII.y,
                    (co - c).z / BREAST_RADII.z)).length for c in BREAST_CENTERS)
    t = max(0.0, min(1.0, (1.15 - d) / 0.55))  # 1 внутри d<0.6, 0 при d>1.15
    return t * t * (3 - 2 * t)


def apply_breast_carrier(o):
    n = 0
    for v in o.data.vertices:
        m = breast_mask(v.co)
        if m <= 0:
            continue
        w = weights_of(o, v.index)
        nw = {k: x * (1 - m) for k, x in w.items()}
        for k, x in BREAST_CARRIER.items():
            nw[k] = nw.get(k, 0) + x * m
        s = sum(nw.values())
        write_weights(o, v.index, {k: x / s for k, x in nw.items() if x / s > 1e-4})
        n += 1
    return n


for name in ('tors', 'Head'):
    log('breast carrier verts', name, apply_breast_carrier(parts[name]))
log('seam verts welded:', weld_seams(body))
for o in parts.values():
    normalize_limit(o)
    log('part', o.name, 'verts', len(o.data.vertices), 'groups', len(o.vertex_groups))

# Материал: один общий атлас; изображение не встраивается (движок даёт WebP)
mat = bpy.data.materials.get('woman_atlas') or bpy.data.materials.new('woman_atlas')
for n in list(mat.node_tree.nodes):
    if n.type == 'TEX_IMAGE':
        mat.node_tree.nodes.remove(n)
for o in parts.values():
    o.data.materials.clear()
    o.data.materials.append(mat)
    for uv in o.data.uv_layers:
        uv.name = 'UVMap'
    bpy.context.view_layer.objects.active = o
    o.data.shade_smooth() if hasattr(o.data, 'shade_smooth') else None
for img in list(bpy.data.images):
    bpy.data.images.remove(img)

# ─── 4. Ретаргет клипов (world-space delta от rest, бёдра масштабируются) ──
tgt_rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
tgt_parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
order = []
def _walk(b):
    order.append(b.name)
    for c in b.children:
        _walk(c)
for b in arm.data.bones:
    if not b.parent:
        _walk(b)
HIPS = 'mixamorig:Hips'
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
    # rest-состояние источника (без экшенов)
    for idb, _ in src_actions:
        if idb.animation_data:
            idb.animation_data.action = None
    sc.frame_set(0)
    bpy.context.view_layer.update()
    mw0 = src_arm.matrix_world.copy()
    src_rest_w = {b.name: mw0 @ b.matrix_local for b in src_arm.data.bones}
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
    src_names = {b.name for b in src_arm.data.bones}
    keys = {bn: [] for bn in order}  # (loc, quat)
    hips_track = []
    for k in range(n):
        f = lo + k * src_fps / OUT_FPS
        fi = int(math.floor(f))
        sc.frame_set(fi, subframe=f - fi)
        mw = src_arm.matrix_world
        pose_t = {}
        for bn in order:
            rt = tgt_rest[bn]
            if bn in src_names:
                pb = src_arm.pose.bones[bn]
                d = (mw @ pb.matrix).to_quaternion() @ src_rest_w[bn].to_quaternion().inverted()
                q_t = d @ rt.to_quaternion()
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
                if q_t is None:
                    bq = Quaternion()
                else:
                    bq = base.to_quaternion().inverted() @ q_t
                B = Matrix.Translation((0, 0, 0)) @ bq.to_matrix().to_4x4()
                P = base @ B
            pose_t[bn] = P
            loc, rot, _ = B.decompose()
            keys[bn].append((loc, rot))
        hips_track.append(pose_t[HIPS].translation.copy())
    # in-place: убрать горизонтальный дрейф (линейно от первого к последнему кадру)
    if clip_name in IN_PLACE and n > 1:
        d0, d1 = hips_track[0], hips_track[-1]
        drift = Vector((d1.x - d0.x, d1.y - d0.y, 0))
        if drift.length > 0.02:
            rt = tgt_rest[HIPS]
            for k in range(n):
                t = k / (n - 1)
                wp = hips_track[k] - drift * t
                q = keys[HIPS][k][1]
                P = Matrix.Translation(wp) @ (rt.to_quaternion() @ q).to_matrix().to_4x4()
                loc, rot, _ = (rt.inverted() @ P).decompose()
                keys[HIPS][k] = (loc, rot)
            log(f'  {clip_name}: removed root drift {drift.length:.3f} m')
    # записать в экшен
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
            for k in range(n):
                co += [float(k), qs[k][i]]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', [1] * n)  # LINEAR
            fc.update()
        if bn == HIPS:
            for i in range(3):
                fc = cb.fcurves.new(pbp + '.location', index=i, group_name=bn)
                fc.keyframe_points.add(n)
                co = []
                for k in range(n):
                    co += [float(k), seq[k][0][i]]
                fc.keyframe_points.foreach_set('co', co)
                fc.keyframe_points.foreach_set('interpolation', [1] * n)
                fc.update()
    act.use_fake_user = True
    log(f'  clip {clip_name}: {n} frames, {dur:.2f}s, src_fps={src_fps}, hips_ratio={ratio:.3f}')
    return act, slot


for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def is_bone_action(a):
    if hasattr(a, 'layers'):
        for layer in a.layers:
            for st in layer.strips:
                for cb in st.channelbags:
                    if any(fc.data_path.startswith('pose.bones') for fc in cb.fcurves):
                        return True
        return False
    return any(fc.data_path.startswith('pose.bones') for fc in a.fcurves)

clips = []
for fname, cname in MIXAMO_CLIPS.items():
    p = os.path.join(ANIM_DIR, fname)
    new, acts, fps = import_fbx(p)
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
def make_lod(ratios, suffix):
    out = []
    for name, o in parts.items():
        ratio = ratios.get(name, ratios['*'])
        c = o.copy(); c.data = o.data.copy()
        c.name = name + suffix
        bpy.context.scene.collection.objects.link(c)
        c.parent = arm
        # Открытые границы (стыки частей) защищаем от схлопывания
        import bmesh
        bm = bmesh.new(); bm.from_mesh(c.data)
        uvl = bm.loops.layers.uv.active
        border = []
        for v in bm.verts:
            if v.is_boundary:
                border.append(v.index); continue
            if uvl is not None and PROTECT_UV_SEAMS:  # UV-шов: у вершины несколько разных UV
                uvs = {(round(l[uvl].uv.x, 4), round(l[uvl].uv.y, 4)) for l in v.link_loops}
                if len(uvs) > 1:
                    border.append(v.index)
        bm.free()
        g = c.vertex_groups.new(name='_lod_keep')
        g.add(list(range(len(c.data.vertices))), 0.0, 'REPLACE')
        if border:
            g.add(border, 1.0, 'REPLACE')
        dm = c.modifiers.new('Decimate', 'DECIMATE')
        if name == 'Haier' and HAIR_PLANAR:
            # Причёска: планарное растворение в пределах UV-островов — UV не схлопываются
            dm.decimate_type = 'DISSOLVE'
            dm.angle_limit = math.radians(HAIR_LOD_ANGLE[int(suffix.rsplit('lod', 1)[1])])
            dm.delimit = {'UV', 'SEAM', 'SHARP'}
            dm.use_dissolve_boundaries = False
        else:
            dm.decimate_type = 'COLLAPSE'
            dm.ratio = ratio
            dm.use_collapse_triangulate = True
            dm.vertex_group = '_lod_keep'
            dm.invert_vertex_group = True
            dm.vertex_group_factor = 1000.0
        # Decimate раньше Armature
        bpy.context.view_layer.objects.active = c
        while c.modifiers[0].name != 'Decimate':
            bpy.ops.object.modifier_move_up(modifier='Decimate')
        bpy.ops.object.modifier_apply(modifier='Decimate')
        c.vertex_groups.remove(c.vertex_groups['_lod_keep'])
        # Кастомные нормали после децимации битые (засветы на макушке) →
        # переносим нормали с LOD0 той же части (ближайшая грань, интерполяция)
        # (только причёска: у тела нормали децимации чище, проверено в шоуруме)
        if name == 'Haier':
            dt = c.modifiers.new('NrmXfer', 'DATA_TRANSFER')
            dt.object = o
            dt.use_loop_data = True
            dt.data_types_loops = {'CUSTOM_NORMAL'}
            dt.loop_mapping = 'POLYINTERP_NEAREST'
            while c.modifiers[0].name != 'NrmXfer':
                bpy.ops.object.modifier_move_up(modifier='NrmXfer')
            bpy.ops.object.modifier_apply(modifier='NrmXfer')
        if name == 'Haier' and HAIR_PLANAR:
            tm = c.modifiers.new('Tri', 'TRIANGULATE')
            while c.modifiers[0].name != 'Tri':
                bpy.ops.object.modifier_move_up(modifier='Tri')
            bpy.ops.object.modifier_apply(modifier='Tri')
        if name == 'Haier':
            lvl = int(suffix.rsplit('lod', 1)[1])
            c.data.update()
            for v in c.data.vertices:
                v.co += v.normal * HAIR_LOD_INFLATE.get(lvl, 0)
        out.append(c)
    weld_seams([o for o in out if not o.name.startswith('Haier')])
    for c in out:
        normalize_limit(c)
    return out


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


def export(path, objs, animations):
    select_only([arm] + objs, arm)
    hidden = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in objs]
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
        export_image_format='NONE',
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


lod0 = list(parts.values())
log('LOD0 tris', tris(lod0))
export(os.path.join(WDIR, 'woman.glb'), lod0, True)
export(os.path.join(WDIR, 'hair.glb'), [parts['Haier']], False)

# Вторая причёска (hair2.fbx -> hair2.glb Draco)
hair2_fbx = os.path.join(WDIR, 'hair2.fbx')
if os.path.exists(hair2_fbx):
    h2_new, _, _ = import_fbx(hair2_fbx)
    h2_mesh = next((o for o in h2_new if o.type == 'MESH' and 'Cube' not in o.name), None)
    if h2_mesh:
        for o in h2_new:
            if o != h2_mesh:
                bpy.data.objects.remove(o, do_unlink=True)
        h2_mesh.name = 'Haier'
        h2_mesh.data.name = 'Haier'
        select_only([h2_mesh])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        h2_mesh.parent = arm
        h2_mesh.matrix_parent_inverse = Matrix.Identity(4)
        m = h2_mesh.modifiers.new('Armature', 'ARMATURE')
        m.object = arm
        set_rigid(h2_mesh, HEAD_BONE)
        export(os.path.join(WDIR, 'hair2.glb'), [h2_mesh], False)
        bpy.data.objects.remove(h2_mesh, do_unlink=True)

for i, (fname, ratios) in enumerate(LODS, 1):
    lod = make_lod(ratios, f'_lod{i}')
    for c in lod:  # имена частей в LOD совпадают с LOD0 (Head, tors, ..., Haier)
        c.name = c.name.rsplit('_lod', 1)[0] + f'_lod{i}'
    export(os.path.join(WDIR, fname), lod, False)

if '--save-blend' in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WDIR, 'woman_rigged.blend'))
log('DONE')
