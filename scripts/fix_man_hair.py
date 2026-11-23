# ============================================================
#  fix_man_hair.py — причёска Tripo → посадка на голову мужского Инженера,
#  без видимых дыр и пересечений с головой
#
#  Запуск (headless Blender 5.2):
#    blender -b --factory-startup --python scripts/fix_man_hair.py -- "<in.fbx>" <out.fbx> [--fit auto|none]
#  Пример:
#    blender -b --factory-startup --python scripts/fix_man_hair.py -- "client/assets/Characters/engi/man/haier 3.fbx" client/assets/Characters/engi/man/haier3_fixed.fbx
#
#  Что делает:
#   1. --fit auto (по умолчанию): сырая причёска Tripo лежит в единичном кубе.
#      Перебором поворота (0/90/180/270°), масштаба и сдвига подбирается посадка:
#      причёска плотно накрывает череп, не заходит на лицо, минимум внутри головы.
#      --fit none — причёска уже посажена (координаты man.fbx / man.blend).
#   2. Вершины, ушедшие внутрь головы, выталкиваются наружу (луч из центра
#      головы) на MARGIN над кожей — голова не протыкает причёску.
#   3. Шапочка: под прядями добавляется оболочка по форме скальпа (кожа головы,
#      накрытая причёской, +CAP_OFFSET). В просветах между кудрями вместо кожи
#      видна шапочка цвета волос — стандартный приём для игровых причёсок.
#      Открытые края кудрей Tripo — это края тонких лепестков, их не заливаем
#      (получились бы двойные пластины).
#   Выход — FBX в координатах man.fbx (как Haier 2 в man.blend), исходник не меняется.
# ============================================================
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'man')
# Голова берётся из меша с ригом Mixamo (группа mixamorig:Head). man.fbx мог быть
# переэкспортирован из man.blend без рига — тогда idle.fbx (та же выгрузка Mixamo, те же координаты)
HEAD_SOURCES = [os.path.join(MDIR, f) for f in ('man.fbx', 'idle.fbx', 'Walking.fbx')]
HEAD = 'mixamorig:Head'
MARGIN = 0.003       # м над кожей для вытолкнутых вершин (масштаб man.fbx ≈ 1.03 м рост)
CAP_OFFSET = 0.0015  # шапочка над кожей (ниже MARGIN — остаётся под прядями)
COVER_DIST = 0.07    # кожа считается накрытой, если луч по нормали упирается в волосы ближе
VIEW_DIRS = 64       # направлений обзора для метрики «видимой кожи»

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
assert len(argv) >= 2, 'usage: -- <in.fbx> <out.fbx> [--fit auto|none]'
SRC, DST = os.path.abspath(argv[0]), os.path.abspath(argv[1])
FIT = argv[argv.index('--fit') + 1] if '--fit' in argv else 'auto'
NO_FIX = '--no-fix' in argv   # только посадка (для сравнения до/после)


def log(*a):
    print('[hair]', *a, flush=True)


# ─── голова мужчины (rest, координаты man.fbx) ─────────────
def is_body(o):
    return o.type == 'MESH' and any(n.type == 'TEX_IMAGE' and n.image and n.image.name.startswith('main')
                                    for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes)


for HEAD_SRC in HEAD_SOURCES + [HEAD_SOURCES[0]]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=HEAD_SRC, automatic_bone_orientation=False)
    man_objs = list(bpy.data.objects)
    body = next((o for o in man_objs if is_body(o)), None)
    if body is not None and HEAD in body.vertex_groups:
        break
log('head from', os.path.basename(HEAD_SRC), '(rig)' if HEAD in body.vertex_groups else '(geometry)')
hb = bmesh.new(); hb.from_mesh(body.data); hb.transform(body.matrix_world)
if HEAD in body.vertex_groups:
    dl = hb.verts.layers.deform.active
    gi = body.vertex_groups[HEAD].index
    head_set = {v.index for v in hb.verts if v[dl].get(gi, 0) > 0.3}
else:
    # man.fbx без рига (экспорт из man.blend): голова — всё выше самого узкого места шеи
    zs = [v.co.z for v in hb.verts]; z0, z1 = min(zs), max(zs); bh = z1 - z0
    def slice_w(z):
        xs = [v.co.x for v in hb.verts if abs(v.co.z - z) < bh * 0.006 and abs(v.co.x) < bh * 0.15]
        return (max(xs) - min(xs)) if len(xs) > 2 else 1e9
    neck = min((z0 + bh * (0.80 + i * 0.004) for i in range(26)), key=slice_w)
    head_set = {v.index for v in hb.verts if v.co.z > neck}
    log(f'no rig in man.fbx: head = above neck z={neck:.3f}')
bmesh.ops.delete(hb, geom=[f for f in hb.faces if not all(v.index in head_set for v in f.verts)], context='FACES_ONLY')
bmesh.ops.delete(hb, geom=[v for v in hb.verts if not v.link_faces], context='VERTS')
# после delete индексы устаревают: без index_update наборы вершин не совпадут с hb.copy()
hb.verts.index_update(); hb.edges.index_update(); hb.faces.index_update()
hb.verts.ensure_lookup_table(); hb.normal_update()
head_tree = BVHTree.FromBMesh(hb)
hp = [v.co.copy() for v in hb.verts]
lo = Vector([min(p[i] for p in hp) for i in range(3)]); hi = Vector([max(p[i] for p in hp) for i in range(3)])
H = hi.z - lo.z
center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + H * 0.6))   # внутри черепа
brow = lo.z + H * 0.62
cran = [(v.co.copy(), v.normal.copy()) for v in hb.verts if v.co.z > brow]
face = [(v.co.copy(), v.normal.copy()) for v in hb.verts if lo.z + H * 0.35 < v.co.z < brow and v.normal.y < -0.5]
log(f'head {tuple(round(x, 3) for x in lo)}..{tuple(round(x, 3) for x in hi)} cranium {len(cran)} face {len(face)}')
for o in man_objs:
    bpy.data.objects.remove(o, do_unlink=True)

# ─── причёска ──────────────────────────────────────────────
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=SRC)
new = [o for o in bpy.data.objects if o not in before]
hair = next(o for o in new if o.type == 'MESH')
for o in new:
    if o is not hair:
        bpy.data.objects.remove(o, do_unlink=True)
mw = hair.matrix_world.copy()
hair.parent = None
hair.matrix_world = mw
bpy.context.view_layer.objects.active = hair
hair.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = hair.data


def hair_tree(m):
    b = bmesh.new(); b.from_mesh(m); t = BVHTree.FromBMesh(b); b.free(); return t


def fit_score(tree, hcen, yaw, s, t):
    Ri = Matrix.Rotation(math.radians(yaw), 3, 'Z').transposed()
    to_l = lambda p: (Ri @ (p - t)) / s + hcen
    dir_l = lambda d: (Ri @ d).normalized()
    cov = 0; gap = 0.0; pen = 0
    for p, n in cran:
        h = tree.ray_cast(to_l(p), dir_l(n), 0.06 / s)
        if h[0] is not None:
            cov += 1; gap += h[3] * s
        c = p - center
        if tree.ray_cast(to_l(center), dir_l(c), c.length / s)[0] is not None:
            pen += 1
    fh = sum(1 for p, n in face if tree.ray_cast(to_l(p), dir_l(n), 0.04 / s)[0] is not None)
    covf, penf, facef = cov / len(cran), pen / len(cran), fh / max(1, len(face))
    mgap = gap / max(cov, 1)
    return covf - 1.5 * penf - 1.0 * facef - 8.0 * mgap, covf, penf, facef, mgap


if FIT == 'auto':
    tree = hair_tree(me)
    vs = [v.co for v in me.vertices]
    hlo = Vector([min(p[i] for p in vs) for i in range(3)]); hhi = Vector([max(p[i] for p in vs) for i in range(3)])
    hcen = (hlo + hhi) / 2
    head_w = hi.x - lo.x
    hcx, hcy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2

    def place(yaw, k, dy, dz):
        s = head_w * k
        return s, Vector((hcx, hcy + dy, hi.z - (hhi.z - hcen.z) * s + 0.012 + dz))

    cands = []
    for yaw in (0, 90, 180, 270):
        for k in (1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.75):
            for dy in (-0.03, -0.015, 0.0, 0.015, 0.03, 0.045):
                for dz in (-0.04, -0.025, -0.01, 0.005, 0.02):
                    s, t = place(yaw, k, dy, dz)
                    cands.append((fit_score(tree, hcen, yaw, s, t)[0], yaw, k, dy, dz))
    _, yaw, k, dy, dz = max(cands)
    # уточнение вокруг лучшего
    for step in (0.5, 0.25):
        loc = []
        for kk in (k - 0.05 * step, k, k + 0.05 * step):
            for yy in (dy - 0.01 * step, dy, dy + 0.01 * step):
                for zz in (dz - 0.01 * step, dz, dz + 0.01 * step):
                    s, t = place(yaw, kk, yy, zz)
                    loc.append((fit_score(tree, hcen, yaw, s, t)[0], kk, yy, zz))
        _, k, dy, dz = max(loc)
    s, t = place(yaw, k, dy, dz)
    sc = fit_score(tree, hcen, yaw, s, t)
    log(f'fit: yaw {yaw} scale {s:.4f} (x{k:.3f} head width) offset dy {dy:+.3f} dz {dz:+.3f} | '
        f'cranium covered {sc[1]:.0%}, inside head {sc[2]:.0%}, over face {sc[3]:.0%}, mean gap {sc[4]*1000:.1f} mm')
    R = Matrix.Rotation(math.radians(yaw), 4, 'Z')
    M = Matrix.Translation(t) @ R @ Matrix.Scale(s, 4) @ Matrix.Translation(-hcen)
    me.transform(M)
    me.update()


# ─── метрики ───────────────────────────────────────────────
def fibonacci_dirs(n):
    out = []
    for i in range(n):
        z = 1 - (i + 0.5) * 2 / n
        r = math.sqrt(max(0, 1 - z * z)); a = i * math.pi * (3 - math.sqrt(5))
        out.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    return out


DIRS = fibonacci_dirs(VIEW_DIRS)


def cone(n, deg=30, k=6):
    t = n.orthogonal().normalized(); b = n.cross(t); r = math.radians(deg)
    return [n] + [(n * math.cos(r) + (t * math.cos(2 * math.pi * i / k) + b * math.sin(2 * math.pi * i / k)) * math.sin(r)).normalized()
                  for i in range(k)]


def scalp_under_hair(tree):
    """Кожа, которую причёска должна закрывать:
    - над точкой волосы хотя бы в 4 из 7 лучей конуса (30°) ближе COVER_DIST;
    - участки кожи, со всех сторон окружённые такими точками (это и есть дыры в причёске);
    - верх черепа выше 80% высоты головы."""
    region = {v.index for v in hb.verts if v.co.z > lo.z + H * 0.45}
    cov = set()
    for v in hb.verts:
        if v.index not in region:
            continue
        if v.co.z > lo.z + H * 0.80:
            cov.add(v.index); continue
        o = v.co + v.normal * 0.0005
        if sum(1 for d in cone(v.normal) if tree.ray_cast(o, d, COVER_DIST)[0] is not None) >= 4:
            cov.add(v.index)
    seen = set()
    for v in hb.verts:
        if v.index not in region or v.index in cov or v.index in seen:
            continue
        comp, open_, st = [], False, [v]
        while st:
            x = st.pop()
            if x.index in seen:
                continue
            seen.add(x.index); comp.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in region:
                    open_ = True          # уходит к лицу/шее — это граница роста, не дыра
                elif y.index not in cov and y.index not in seen:
                    st.append(y)
        if not open_:
            cov.update(comp)
    return cov


# метрика: без крайнего ряда — на границе роста волос кожа видна по определению
_cov = scalp_under_hair(hair_tree(me))
covered = [(v.co.copy(), v.normal.copy()) for v in hb.verts
           if v.index in _cov and all(e.other_vert(v).index in _cov for e in v.link_edges)]


def inside_count(m):
    n = 0
    for v in m.vertices:
        d = v.co - center
        h = head_tree.ray_cast(center, d.normalized(), d.length)
        if h[0] is not None and d.length < h[3] + 0.0005:
            n += 1
    return n


def visible_skin(m):
    """Доля пар (точка накрытой кожи, направление взгляда), где кожа видна сквозь волосы."""
    t = hair_tree(m)
    vis = tot = 0
    for p, n in covered:
        for d in DIRS:
            if d.dot(n) <= 0.5:      # взгляд не скользящий (в пределах 60° от нормали)
                continue
            o = p + n * 0.0005
            if head_tree.ray_cast(o + d * 0.0005, d, 1.0)[0] is not None:
                continue      # закрыто самой головой (ухо и т.п.)
            tot += 1
            if t.ray_cast(o, d, 1.0)[0] is None:
                vis += 1
    return vis / max(tot, 1)


log(f'before: hair verts inside head {inside_count(me)}, skin visible through hair {visible_skin(me):.1%}')

# ─── 2. выталкивание из головы ─────────────────────────────
pushed = 0
for v in ([] if NO_FIX else me.vertices):
    d = v.co - center
    L = d.length
    if L < 1e-6:
        continue
    h = head_tree.ray_cast(center, d / L, L + MARGIN)
    if h[0] is not None and L < h[3] + MARGIN:
        v.co = center + d / L * (h[3] + MARGIN)
        pushed += 1
me.update()
log(f'pushed out of head: {pushed} verts')

# ─── 3. шапочка под кудрями ────────────────────────────────
cover_tree = hair_tree(me)
cb = bmesh.new(); cb.from_mesh(bpy.data.meshes.new('tmp'))
src = hb.copy()
src.verts.ensure_lookup_table()
keep = set() if NO_FIX else scalp_under_hair(cover_tree)   # индексы hb == индексы src (копия)
bmesh.ops.delete(src, geom=[f for f in src.faces if not all(v.index in keep for v in f.verts)], context='FACES_ONLY')
bmesh.ops.delete(src, geom=[v for v in src.verts if not v.link_faces], context='VERTS')
src.normal_update()
for v in src.verts:
    v.co += v.normal * CAP_OFFSET
cap_faces = len(src.faces)
hbm = bmesh.new(); hbm.from_mesh(me)
cap_me = bpy.data.meshes.new('cap'); src.to_mesh(cap_me); src.free()
hbm.from_mesh(cap_me)          # добавить шапочку в меш причёски
hbm.to_mesh(me); hbm.free(); cb.free()
bpy.data.meshes.remove(cap_me)
me.update()
log(f'cap: {cap_faces} faces over covered scalp')
log(f'after: hair verts inside head {inside_count(me)}, skin visible through hair {visible_skin(me):.1%}, '
    f'tris {sum(len(p.vertices) - 2 for p in me.polygons)}')

# ─── экспорт ───────────────────────────────────────────────
name = os.path.splitext(os.path.basename(DST))[0]
hair.name = name; me.name = name
for o in list(bpy.data.objects):
    if o is not hair:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
hair.select_set(True); bpy.context.view_layer.objects.active = hair
bpy.ops.export_scene.fbx(filepath=DST, use_selection=True, apply_scale_options='FBX_SCALE_ALL',
                         mesh_smooth_type='FACE', add_leaf_bones=False, bake_anim=False)
log('exported', DST, f'{os.path.getsize(DST)/1024:.0f} KB')
