# ============================================================
#  SCRIPTS / MARKET-SQUARE / BUILD_MARKET.PY
#  Рыночная площадь деревни (стимпанк-средневековье, ориентир — города L2):
#  лавки всех классов, фонтан со статуей основателя, большой зелёный шатёр,
#  фахверковые дома с черепицей, паровые фонари, котлы, паровой тягач, паропроводы,
#  вымпелы, гирлянды, столы с товаром, заборы, ящики и бочки.
#  Улицы и землю рисует кисть террейна (paint_market.py); площадь и дорожки парка — модели по рельефу
#  на фото-текстурах (paving_textures.py), без процедурной «синтетики».
#
#  Запуск (headless Blender, как convert-assets.js и кит операторов):
#    "D:/3d/Blernder/blender.exe" -b --factory-startup -P scripts/market-square/build_market.py -- [детали] [--preview out.png]
#
#  Как устроено (тот же конвейер, что scripts/operators-territory/build_kit.py):
#   - своя процедурная геометрия, без чужих моделей;
#   - до 3 LOD в одном файле: узлы <имя>, <имя>_LOD1, <имя>_LOD2 (ярус пишется,
#     только если он легче предыдущего хотя бы на 30%);
#   - ОДИН материал mkt_atlas без встроенной картинки: все модели площади берут
#     одну текстуру assets/props/textures/mkt_atlas.webp (atlas_market.py);
#   - экспорт GLB + Draco с настройками convert-assets.js → client/assets/props/market/;
#   - манифест market-manifest.json: размеры, треугольники по LOD, коллайдеры.
#  Общие построители мешей (MB, box, cylinder, decal, slope_plane, ...) берутся
#  из build_kit.py операторов: исполняется его часть до раздела колонн, атлас подменяется.
#
#  Оси: Blender Z вверх, фасад смотрит в −Y → в игре фасад смотрит в +Z.
# ============================================================
import bpy
import json
import math
import os
import random
import sys

from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OPT_KIT = os.path.join(ROOT, 'scripts', 'operators-territory', 'build_kit.py')
OUT_DIR = os.path.join(ROOT, 'client', 'assets', 'props', 'market')
MANIFEST = os.path.join(HERE, 'market-manifest.json')
LAYOUT = json.load(open(os.path.join(HERE, 'atlas-layout.json'), encoding='utf-8'))

# ---- общие построители кита операторов с атласом рынка ----
_src = open(OPT_KIT, encoding='utf-8').read()
_cut = _src.find('\nSEG = {')
if _cut < 0:
    raise SystemExit('build_kit.py: не найден конец общих построителей (строка "SEG = {")')
K = {'__file__': OPT_KIT, '__name__': 'opt_kit_helpers'}
exec(compile(_src[:_cut], OPT_KIT, 'exec'), K)
K['LAYOUT'] = LAYOUT
K['STRIPS'] = LAYOUT['strips']
K['CELLS'] = dict(LAYOUT['cells'])
K['CELLS']['rough'] = LAYOUT['cells']['pal_canvas']
K['U_SPAN'] = LAYOUT['uSpanM']
MB, box, cylinder, annulus = K['MB'], K['box'], K['cylinder'], K['annulus']
planar_top, decal, slope_plane, pyramid = K['planar_top'], K['decal'], K['slope_plane'], K['pyramid']
wall_rect, wall_profile, cone_spike = K['wall_rect'], K['wall_profile'], K['cone_spike']
strip_v, cell_uv = K['strip_v'], K['cell_uv']
STRIPS, CELLS, U_SPAN = K['STRIPS'], K['CELLS'], K['U_SPAN']


# ============================================================
#  Свои построители
# ============================================================
def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(axis, ang):
    return Matrix.Rotation(ang, 4, axis)


def S(sx, sy=None, sz=None):
    sy = sx if sy is None else sy
    sz = sx if sz is None else sz
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = sx, sy, sz
    return m


class place:
    """with place(mb, M): ... — локальная система координат для детали."""

    def __init__(self, mb, M):
        self.mb, self.M = mb, M

    def __enter__(self):
        self.old = self.mb.M
        self.mb.M = self.old @ self.M
        return self.mb

    def __exit__(self, *a):
        self.mb.M = self.old


def cuv(cell, fu, fv):
    return cell_uv(cell, max(0.0, min(1.0, fu)), max(0.0, min(1.0, fv)))


def cbox(mb, cx, cy, z0, sx, sy, sz, cell, top=True, bottom=False):
    """Коробка в цвет ячейки (каждая грань — вся ячейка). Для мелкого товара."""
    x0, x1, y0, y1, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, z0 + sz
    F = [
        ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        ([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], (0, 1, 0)),
        ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
        ([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], (-1, 0, 0)),
    ]
    if top:
        F.append(([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)))
    if bottom:
        F.append(([(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)], (0, 0, -1)))
    for pts, n in F:
        mb.poly(pts, [cuv(cell, 0.1, 0.1), cuv(cell, 0.9, 0.1), cuv(cell, 0.9, 0.9), cuv(cell, 0.1, 0.9)], n)


def post(mb, x, y, z0, z1, w, strip='timber', top_cell='pal_brown', d=None):
    """Стойка: одна растянутая лента на грань (дёшево), крышка — ячейкой."""
    d = w if d is None else d
    x0, x1, y0, y1 = x - w / 2, x + w / 2, y - d / 2, y + d / 2
    s = 0.0
    for a, b, n in (((x0, y0), (x1, y0), (0, -1, 0)), ((x1, y0), (x1, y1), (1, 0, 0)),
                    ((x1, y1), (x0, y1), (0, 1, 0)), ((x0, y1), (x0, y0), (-1, 0, 0))):
        wall_rect(mb, a, b, z0, z1, strip, n, s0=s, stretch=True)
        s += w
    planar_top(mb, [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], cell=top_cell)


def beam(mb, p0, p1, w, h, strip='timber'):
    """Брус между двумя точками (сечение w×h), растянут по полосе."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    if L < 1e-5:
        return
    t = d / L
    ref = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    sdir = t.cross(ref).normalized()
    up = sdir.cross(t).normalized()
    corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    ring0 = [p0 + sdir * a + up * b for a, b in corners]
    ring1 = [p1 + sdir * a + up * b for a, b in corners]
    for i in range(4):
        j = (i + 1) % 4
        mid = (ring0[i] + ring0[j]) / 2 - p0
        uu = L / U_SPAN
        mb.poly([ring0[i], ring0[j], ring1[j], ring1[i]],
                [(0, strip_v(strip, 0.1 + 0.2 * i)), (0, strip_v(strip, 0.3 + 0.2 * i)),
                 (uu, strip_v(strip, 0.3 + 0.2 * i)), (uu, strip_v(strip, 0.1 + 0.2 * i))], mid)


def lathe(mb, prof, seg, cell=None, strip=None, u_units=1.0, cap_top=True, cap_bot=False, cap_cell=None,
          phase=0.0, skey='lt', smooth=True):
    """Тело вращения вокруг Z: prof = [(r, z), ...] снизу вверх."""
    key = '%s_%d_%d' % (skey, id(mb), len(mb.v))
    acc = [0.0]
    for i in range(1, len(prof)):
        acc.append(acc[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
    tot = max(acc[-1], 1e-6)
    ring = [(math.cos(phase + 2 * math.pi * k / seg), math.sin(phase + 2 * math.pi * k / seg)) for k in range(seg + 1)]
    for i in range(len(prof) - 1):
        (ra, za), (rb, zb) = prof[i], prof[i + 1]
        if ra < 1e-6 and rb < 1e-6:
            continue
        fa, fb = acc[i] / tot, acc[i + 1] / tot
        for k in range(seg):
            (c0, s0), (c1, s1) = ring[k], ring[k + 1]
            pts = [(ra * c0, ra * s0, za), (ra * c1, ra * s1, za), (rb * c1, rb * s1, zb), (rb * c0, rb * s0, zb)]
            if cell:
                uvs = [cuv(cell, k / seg, fa), cuv(cell, (k + 1) / seg, fa), cuv(cell, (k + 1) / seg, fb), cuv(cell, k / seg, fb)]
            else:
                uvs = [(u_units * k / seg, strip_v(strip, fa)), (u_units * (k + 1) / seg, strip_v(strip, fa)),
                       (u_units * (k + 1) / seg, strip_v(strip, fb)), (u_units * k / seg, strip_v(strip, fb))]
            mid = ((c0 + c1) / 2, (s0 + s1) / 2, 0.0)
            # нормаль: наружу по радиусу с учётом наклона образующей
            nz = -(rb - ra)
            nr = (zb - za)
            mb.poly(pts, uvs, (mid[0] * nr, mid[1] * nr, nz if abs(nz) > 1e-6 else 0.0), smooth=smooth, skey=key)
    cc = cap_cell or cell or 'pal_dark_steel'
    if cap_top and prof[-1][0] > 1e-5:
        r, z = prof[-1]
        planar_top(mb, [(r * ring[k][0], r * ring[k][1], z) for k in range(seg)], cell=cc)
    if cap_bot and prof[0][0] > 1e-5:
        r, z = prof[0]
        planar_top(mb, [(r * ring[k][0], r * ring[k][1], z) for k in reversed(range(seg))], cell=cc, outward=(0, 0, -1))


def sphere(mb, c, r, seg=8, rings=5, cell='pal_steel', skey='sp'):
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    with place(mb, T(*c)):
        lathe(mb, prof, seg, cell=cell, cap_top=False, skey=skey)


def limb(mb, p0, p1, r0, r1, seg=6, cell='pal_steel', strip=None, caps=True, skey='lb'):
    """Усечённый конус между двумя точками (руки, стволы, ручки, трубы)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    if L < 1e-6:
        return
    z = d / L
    ref = Vector((0, 0, 1)) if abs(z.z) < 0.95 else Vector((1, 0, 0))
    x = ref.cross(z).normalized()
    y = z.cross(x)
    M = Matrix(((x.x, y.x, z.x, p0.x), (x.y, y.y, z.y, p0.y), (x.z, y.z, z.z, p0.z), (0, 0, 0, 1)))
    with place(mb, M):
        lathe(mb, [(r0, 0.0), (r1, L)], seg, cell=cell, strip=strip, u_units=2 * math.pi * max(r0, r1) / U_SPAN,
              cap_top=caps, cap_bot=caps, skey=skey)


def tube(mb, pts, radius, seg, strip='copper', cap_a=True, cap_b=True, skey='tb'):
    """Гладкая труба по ломаной (как в kit_park.py операторов)."""
    pts = [Vector(p) for p in pts]
    if len(pts) < 2:
        return
    bh = max(1e-4, STRIPS[strip]['heightM'])
    rings, norms = [], []
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
        ring, rn = [], []
        for j in range(seg):
            a = 2.0 * math.pi * j / seg
            od = (math.cos(a) * n + math.sin(a) * b).normalized()
            ring.append(tuple(p + radius * od))
            rn.append(od)
        rings.append(ring)
        norms.append(rn)

    def v_wave(s):
        ph = (s / max(0.35, bh * 1.8)) % 2.0
        tri = ph if ph <= 1.0 else (2.0 - ph)
        return strip_v(strip, 0.08 + 0.84 * tri)

    key = '%s_%d_%d' % (skey, id(mb), len(mb.v))
    acc = 0.0
    for i in range(len(rings) - 1):
        L = (pts[i + 1] - pts[i]).length
        va = v_wave(acc)
        acc += L
        vb = v_wave(acc)
        rA, rB, nA, nB = rings[i], rings[i + 1], norms[i], norms[i + 1]
        for j in range(seg):
            j1 = (j + 1) % seg
            out = (nA[j] + nA[j1] + nB[j1] + nB[j]) * 0.25
            mb.poly([rA[j], rA[j1], rB[j1], rB[j]],
                    [(j / seg, va), ((j + 1) / seg, va), ((j + 1) / seg, vb), (j / seg, vb)], out, smooth=True, skey=key)
    if cap_a:
        planar_top(mb, list(reversed(rings[0])), cell='dark', outward=(pts[0] - pts[1]).normalized())
    if cap_b:
        planar_top(mb, rings[-1], cell='dark', outward=(pts[-1] - pts[-2]).normalized())


def two_sided(mb, pts, uvs, outward):
    mb.poly(pts, uvs, outward)
    mb.poly(list(reversed(pts)), list(reversed(uvs)), tuple(-c for c in outward))


def disc(mb, r, thick, seg, rim_cell, face_cell, back_cell=None):
    """Диск в плоскости XY (лицо — +Z): щит, шестерня-медаль, манометр, колесо."""
    ring = [(math.cos(2 * math.pi * k / seg + math.pi / seg), math.sin(2 * math.pi * k / seg + math.pi / seg)) for k in range(seg)]
    for k in range(seg):
        (c0, s0), (c1, s1) = ring[k], ring[(k + 1) % seg]
        mb.poly([(r * c0, r * s0, 0), (r * c1, r * s1, 0), (r * c1, r * s1, thick), (r * c0, r * s0, thick)],
                [cuv(rim_cell, k / seg, 0.2), cuv(rim_cell, (k + 1) / seg, 0.2), cuv(rim_cell, (k + 1) / seg, 0.8), cuv(rim_cell, k / seg, 0.8)],
                ((c0 + c1) / 2, (s0 + s1) / 2, 0))
    mb.poly([(r * c, r * s, thick) for c, s in ring], [cuv(face_cell, 0.5 + 0.5 * c, 0.5 + 0.5 * s) for c, s in ring], (0, 0, 1))
    bc = back_cell or rim_cell
    mb.poly([(r * c, r * s, 0) for c, s in reversed(ring)], [cuv(bc, 0.5 + 0.5 * c, 0.5 + 0.5 * s) for c, s in reversed(ring)], (0, 0, -1))


def gear_flat(mb, r_out, r_root, r_hub, teeth, thick, cell='pal_gold', hub_cell=None):
    """Шестерня в плоскости XY толщиной thick (лицо +Z), без сквозных отверстий."""
    prof = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4)
        rr = r_out if (i % 4) in (1, 2) else r_root
        prof.append((rr * math.cos(a), rr * math.sin(a)))
    n = len(prof)
    for i in range(n):
        a, b = prof[i], prof[(i + 1) % n]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)
        mb.poly([(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], thick), (a[0], a[1], thick)],
                [cuv(cell, 0.2, 0.2), cuv(cell, 0.8, 0.2), cuv(cell, 0.8, 0.8), cuv(cell, 0.2, 0.8)], mid)
    for z, sgn in ((thick, 1), (0.0, -1)):
        for i in range(0, n, 2):
            a, b, c = prof[i], prof[(i + 1) % n], prof[(i + 2) % n]
            ang = [math.atan2(p[1], p[0]) for p in (a, c)]
            ia = (r_hub * math.cos(ang[0]), r_hub * math.sin(ang[0]))
            ic = (r_hub * math.cos(ang[1]), r_hub * math.sin(ang[1]))
            pts = [(ia[0], ia[1], z), (a[0], a[1], z), (b[0], b[1], z), (c[0], c[1], z), (ic[0], ic[1], z)]
            uvs = [cuv(cell, 0.5 + 0.5 * p[0] / r_out, 0.5 + 0.5 * p[1] / r_out) for p in pts]
            mb.poly(pts, uvs, (0, 0, sgn))
        hub = [(r_hub * math.cos(2 * math.pi * k / (n // 2)), r_hub * math.sin(2 * math.pi * k / (n // 2)), z) for k in range(n // 2)]
        hc = hub_cell or cell
        mb.poly(hub if sgn > 0 else list(reversed(hub)), [cuv(hc, 0.5 + 0.4 * p[0] / r_hub, 0.5 + 0.4 * p[1] / r_hub) for p in (hub if sgn > 0 else list(reversed(hub)))], (0, 0, sgn))


def lantern(mb, cx, cy, cz, s=1.0, lod=0):
    """Латунный фонарь: 4 светящихся стекла, донце, крышка-шатёр."""
    h = 0.30 * s
    w = 0.22 * s
    cbox(mb, cx, cy, cz - h / 2 - 0.03 * s, w + 0.06 * s, w + 0.06 * s, 0.04 * s, 'pal_gold', bottom=True)
    for (n, c, r) in (((0, -1, 0), (cx, cy - w / 2, cz), (1, 0, 0)), ((0, 1, 0), (cx, cy + w / 2, cz), (-1, 0, 0)),
                      ((1, 0, 0), (cx + w / 2, cy, cz), (0, 1, 0)), ((-1, 0, 0), (cx - w / 2, cy, cz), (0, -1, 0))):
        decal(mb, c, r, (0, 0, 1), w, h, 'glow', n)
    cbox(mb, cx, cy, cz + h / 2 - 0.01 * s, w + 0.06 * s, w + 0.06 * s, 0.04 * s, 'pal_gold', bottom=True)
    if lod <= 1:
        pyramid(mb, cx, cy, cz + h / 2 + 0.03 * s, w + 0.06 * s, w + 0.06 * s, 0.16 * s, 'brass')


def gear_sign(mb, c, r, emb, lod=0):
    """Латунная шестерня-вывеска с гербом класса в ступице (лицо к −Y, герб виден с обеих сторон)."""
    cx, cy, cz = c
    with place(mb, T(cx, cy, cz) @ R('X', math.pi / 2) @ T(0, 0, -0.05)):
        gear_flat(mb, r, r * 0.86, r * 0.7, 12 if lod == 0 else 8, 0.1, 'pal_gold', emb)


def sign_board(mb, c, w, h, emb, normal_axis='y', thick=0.05, both=True):
    """Вывеска: дощатый щит с гербом класса с обеих сторон."""
    cx, cy, cz = c
    if normal_axis == 'y':
        cbox(mb, cx, cy, cz - h / 2, w, thick, h, 'pal_brown', bottom=True)
        decal(mb, (cx, cy - thick / 2 - 0.004, cz), (1, 0, 0), (0, 0, 1), w * 0.94, h * 0.94, emb, (0, -1, 0))
        if both:
            decal(mb, (cx, cy + thick / 2 + 0.004, cz), (-1, 0, 0), (0, 0, 1), w * 0.94, h * 0.94, emb, (0, 1, 0))
    else:
        cbox(mb, cx, cy, cz - h / 2, thick, w, h, 'pal_brown', bottom=True)
        decal(mb, (cx + thick / 2 + 0.004, cy, cz), (0, 1, 0), (0, 0, 1), w * 0.94, h * 0.94, emb, (1, 0, 0))
        if both:
            decal(mb, (cx - thick / 2 - 0.004, cy, cz), (0, -1, 0), (0, 0, 1), w * 0.94, h * 0.94, emb, (-1, 0, 0))


# ------------------------------------------------------------
#  Ткани: тент-скат, фестоны, шатёр
# ------------------------------------------------------------
def cloth_uv(strip, u_m, fv):
    return (u_m / U_SPAN, strip_v(strip, 0.08 + 0.84 * max(0.0, min(1.0, fv))))


def awning(mb, x0, x1, yb, zb, yf, zf, strip, lod=0, sag=0.07, valance=0.28):
    """Скат-тент от заднего края (yb, zb) к переднему (yf, zf), полосы — по U (вдоль X).
    Двусторонний: снизу его видно, когда стоишь у прилавка."""
    segs = 4 if lod == 0 else (2 if lod == 1 else 1)
    rows = [0.0, 0.5, 1.0] if lod <= 1 else [0.0, 1.0]
    xs = [x0 + (x1 - x0) * i / segs for i in range(segs + 1)]
    half = (x1 - x0) / 2
    xm = (x0 + x1) / 2

    def P(x, t):
        y = yb + (yf - yb) * t
        z = zb + (zf - zb) * t
        z -= sag * (1 - ((x - xm) / half) ** 2) * math.sin(math.pi * t)
        return (x, y, z)
    for i in range(segs):
        for j in range(len(rows) - 1):
            a, b = rows[j], rows[j + 1]
            pts = [P(xs[i], a), P(xs[i + 1], a), P(xs[i + 1], b), P(xs[i], b)]
            uvs = [cloth_uv(strip, xs[i] - x0, a), cloth_uv(strip, xs[i + 1] - x0, a), cloth_uv(strip, xs[i + 1] - x0, b), cloth_uv(strip, xs[i] - x0, b)]
            two_sided(mb, pts, uvs, (0, -(zb - zf), abs(yf - yb)))
    if valance > 0:
        scallops(mb, x0, x1, yf, zf, valance, strip, lod, axis='x')


def scallops(mb, a0, a1, fixed, ztop, depth, strip, lod, axis='x', u0=0.0):
    """Фестоны (зубчатый подзор) вдоль оси axis на уровне ztop; LOD1+ — прямая лента."""
    L = a1 - a0
    if lod >= 1:
        n = 1
    else:
        n = max(1, int(round(L / (U_SPAN / 22.0))))
    w = L / n

    def Pt(s, z):
        return (a0 + s, fixed, z) if axis == 'x' else (fixed, a0 + s, z)
    nrm = (0, -1, 0) if axis == 'x' else (1, 0, 0)
    for k in range(n):
        s0, s1 = k * w, (k + 1) * w
        if n == 1:
            pts = [Pt(s0, ztop - depth * 0.8), Pt(s1, ztop - depth * 0.8), Pt(s1, ztop), Pt(s0, ztop)]
            uvs = [cloth_uv(strip, u0 + s0, 0.0), cloth_uv(strip, u0 + s1, 0.0), cloth_uv(strip, u0 + s1, 1.0), cloth_uv(strip, u0 + s0, 1.0)]
        else:
            sm = (s0 + s1) / 2
            pts = [Pt(s0, ztop - depth * 0.55), Pt(sm, ztop - depth), Pt(s1, ztop - depth * 0.55), Pt(s1, ztop), Pt(s0, ztop)]
            uvs = [cloth_uv(strip, u0 + s0, 0.2), cloth_uv(strip, u0 + sm, 0.0), cloth_uv(strip, u0 + s1, 0.2),
                   cloth_uv(strip, u0 + s1, 1.0), cloth_uv(strip, u0 + s0, 1.0)]
        two_sided(mb, pts, uvs, nrm)


def roof_face(mb, eave_a, eave_b, top_b, top_a, strip, outward, stretch=True, two=True, under=None):
    """Грань шатра/крыши: трапеция (или треугольник, если top_a == top_b).
    U — метры вдоль карниза, V — доля высоты ската (ткань растягивается)."""
    ea, eb, tb, ta = Vector(eave_a), Vector(eave_b), Vector(top_b), Vector(top_a)
    ed = (eb - ea)
    L = ed.length
    e = ed / max(L, 1e-6)

    def U(p):
        return (p - ea).dot(e)
    pts = [ea, eb, tb, ta]
    if (ta - tb).length < 1e-6:
        pts = [ea, eb, tb]
    if stretch:
        uvs = [cloth_uv(strip, U(p), 0.0 if i < 2 else 1.0) for i, p in enumerate(pts)]
    else:
        bh = STRIPS[strip]['heightM']
        h_slope = ((ta + tb) / 2 - (ea + eb) / 2).length
        uvs = [(U(p) / U_SPAN, strip_v(strip, (0.0 if i < 2 else h_slope / bh) % 1.0001)) for i, p in enumerate(pts)]
    mb.poly([tuple(p) for p in pts], uvs, outward)
    if two:
        su = under or strip
        uv2 = [cloth_uv(su, U(p), 0.0 if i < 2 else 1.0) for i, p in enumerate(pts)]
        mb.poly([tuple(p) for p in reversed(pts)], list(reversed(uv2)), tuple(-c for c in outward))


# ============================================================
#  ТОВАР (мелкие детали в локальных координатах, низ — z = 0)
# ============================================================
def it_wrench(mb, L=0.55, cell='pal_steel'):
    cbox(mb, 0, 0, 0, L, 0.06, 0.025, cell)
    cbox(mb, L / 2 + 0.03, 0.045, 0, 0.09, 0.03, 0.03, cell)
    cbox(mb, L / 2 + 0.03, -0.045, 0, 0.09, 0.03, 0.03, cell)
    cbox(mb, L / 2 - 0.02, 0, 0, 0.06, 0.12, 0.03, cell)
    with place(mb, T(-L / 2, 0, 0)):
        lathe(mb, [(0.055, 0.0), (0.055, 0.03)], 8, cell=cell)


def it_hammer(mb, L=0.6, head=0.22, head_cell='pal_dark_steel', handle='pal_leather'):
    cbox(mb, 0, 0, 0, 0.045, 0.045, L, handle)
    cbox(mb, 0, 0, L - 0.04, head, 0.09, 0.1, head_cell, bottom=True)


def it_rifle(mb, L=1.05, scope=False, cell='pal_dark_steel'):
    """Вдоль +X, лежит на боку; ствол — тонкий конус."""
    cbox(mb, -L / 2 + 0.17, 0, 0, 0.34, 0.05, 0.1, 'pal_brown')
    cbox(mb, -L / 2 + 0.52, 0, 0.02, 0.38, 0.05, 0.07, cell)
    limb(mb, (-L / 2 + 0.7, 0, 0.06), (L / 2, 0, 0.06), 0.02, 0.016, 6, cell=cell)
    if scope:
        limb(mb, (-L / 2 + 0.42, 0, 0.12), (-L / 2 + 0.78, 0, 0.12), 0.025, 0.03, 6, cell='pal_gold')


def it_pistol(mb, cell='pal_gold'):
    cbox(mb, 0, 0, 0, 0.07, 0.04, 0.14, 'pal_brown')
    cbox(mb, 0.09, 0, 0.1, 0.2, 0.04, 0.06, cell)
    limb(mb, (0.18, 0, 0.13), (0.32, 0, 0.13), 0.02, 0.026, 6, cell='pal_dark_steel')


def it_shield_round(mb, r=0.36, face='pal_navy', rim='pal_gold'):
    """Круглый щит стоит на ребре лицом к −Y."""
    with place(mb, T(0, 0, r) @ R('X', math.pi / 2)):
        disc(mb, r, 0.05, 10, rim, face, 'pal_brown')
        with place(mb, T(0, 0, 0.05)):
            lathe(mb, [(0.09, 0.0), (0.06, 0.05), (0.0, 0.07)], 8, cell='pal_gold', cap_top=False)


def it_tower_shield(mb, w=0.5, h=0.85, emb='pal_navy'):
    cbox(mb, 0, 0, 0, w, 0.06, h, 'pal_dark_steel')
    decal(mb, (0, -0.034, h / 2), (1, 0, 0), (0, 0, 1), w * 0.86, h * 0.86, emb, (0, -1, 0))
    cbox(mb, 0, -0.035, h - 0.06, w + 0.02, 0.02, 0.06, 'pal_gold')
    cbox(mb, 0, -0.035, 0.0, w + 0.02, 0.02, 0.06, 'pal_gold')


def it_bomb(mb, r=0.13):
    sphere(mb, (0, 0, r), r, 8, 5, 'pal_black')
    limb(mb, (0, 0, 2 * r - 0.01), (0.05, 0, 2 * r + 0.08), 0.015, 0.01, 4, cell='pal_rope')
    cbox(mb, 0.05, 0, 2 * r + 0.07, 0.04, 0.04, 0.04, 'glow')


def it_dynamite(mb):
    for i, (x, y) in enumerate(((-0.04, 0), (0.04, 0), (0, 0.065))):
        with place(mb, T(x, y, 0.04) @ R('Y', math.pi / 2) @ T(0, 0, -0.16)):
            lathe(mb, [(0.035, 0.0), (0.035, 0.32)], 6, cell='pal_red', cap_bot=True, cap_cell='pal_paper')
    cbox(mb, 0, 0.02, 0.0, 0.05, 0.16, 0.12, 'pal_rope')


def it_shell(mb, r=0.06, h=0.26, cell='pal_gold'):
    lathe(mb, [(r, 0.0), (r, h * 0.6), (r * 0.75, h * 0.8), (r * 0.25, h * 0.97), (0.0, h)], 8, cell=cell, cap_bot=False)


def it_cannon(mb):
    with place(mb, T(-0.05, 0, 0.17) @ R('Y', math.pi / 2 - 0.12)):
        lathe(mb, [(0.0, -0.06), (0.075, -0.05), (0.085, 0.0), (0.07, 0.5), (0.06, 0.62)], 8, cell='pal_dark_steel', cap_top=True, cap_cell='dark')
    cbox(mb, -0.1, 0, 0.04, 0.42, 0.14, 0.1, 'pal_brown')
    for y in (-0.1, 0.1):
        with place(mb, T(-0.05, y, 0.12) @ R('X', math.pi / 2)):
            with place(mb, T(0, 0, -0.02)):
                disc(mb, 0.12, 0.04, 8, 'pal_brown', 'pal_leather')


def it_gauge(mb, r=0.11):
    """Манометр на стойке, циферблат к −Y."""
    with place(mb, T(0, 0, r) @ R('X', math.pi / 2)):
        disc(mb, r, 0.05, 10, 'pal_gold', 'gauge', 'pal_gold')
    cbox(mb, 0, 0.05, 0, 0.05, 0.05, 0.05, 'pal_gold')


def it_flask(mb, r=0.06, h=0.2, glass='pal_acid'):
    lathe(mb, [(r * 0.6, 0.0), (r, h * 0.15), (r, h * 0.55), (r * 0.35, h * 0.75), (r * 0.3, h * 0.92)], 8, cell=glass, cap_top=False, cap_bot=True)
    lathe(mb, [(r * 0.33, h * 0.9), (r * 0.33, h + 0.03)], 6, cell='pal_brown')


def it_drone(mb, r=0.12):
    sphere(mb, (0, 0, r + 0.05), r, 8, 5, 'pal_gold')
    cbox(mb, 0, 0, r + 0.05, 0.6, 0.035, 0.03, 'pal_dark_steel')
    for x in (-0.3, 0.3):
        with place(mb, T(x, 0, r + 0.09)):
            lathe(mb, [(0.15, 0.0), (0.15, 0.012)], 8, cell='pal_steel', cap_bot=True)
        limb(mb, (x, 0, r + 0.05), (x, 0, r + 0.09), 0.015, 0.015, 4, cell='pal_dark_steel', caps=False)
    decal(mb, (0, -r - 0.003, r + 0.05), (1, 0, 0), (0, 0, 1), 0.07, 0.07, 'glow', (0, -1, 0))
    cbox(mb, 0, 0, 0, 0.12, 0.12, 0.05, 'pal_dark_steel')


def it_gear(mb, r=0.16, teeth=10, cell='pal_gold', upright=True):
    if upright:
        with place(mb, T(0, 0, r) @ R('X', math.pi / 2) @ T(0, 0, -0.015)):
            gear_flat(mb, r, r * 0.84, r * 0.4, teeth, 0.035, cell, 'pal_dark_steel')
    else:
        gear_flat(mb, r, r * 0.84, r * 0.4, teeth, 0.035, cell, 'pal_dark_steel')


def it_cards(mb, n=3, cell='pal_paper'):
    for i in range(n):
        with place(mb, T(0, 0, i * 0.025) @ R('Z', 0.18 * (i % 2) - 0.09)):
            cbox(mb, 0, 0, 0, 0.22, 0.14, 0.024, cell)


def it_scroll(mb, L=0.45, r=0.04, cell='pal_blueprint'):
    limb(mb, (-L / 2, 0, r), (L / 2, 0, r), r, r, 6, cell=cell)


def it_coil(mb, h=0.5):
    lathe(mb, [(0.09, 0.0), (0.09, 0.06), (0.06, 0.07), (0.06, h * 0.8), (0.03, h * 0.85)], 8, cell='pal_carrot', cap_top=False, cap_bot=True)
    for z in (0.15, 0.25, 0.35):
        with place(mb, T(0, 0, z)):
            lathe(mb, [(0.075, 0.0), (0.075, 0.03)], 8, cell='pal_gold', cap_top=False)
    sphere(mb, (0, 0, h * 0.85 + 0.06), 0.07, 8, 4, 'pal_steel')


def it_anvil(mb, s=1.0):
    cbox(mb, 0, 0, 0, 0.34 * s, 0.22 * s, 0.1 * s, 'pal_dark_steel')
    cbox(mb, 0, 0, 0.1 * s, 0.18 * s, 0.12 * s, 0.12 * s, 'pal_dark_steel')
    cbox(mb, 0, 0, 0.22 * s, 0.46 * s, 0.17 * s, 0.1 * s, 'pal_steel')
    limb(mb, (0.23 * s, 0, 0.28 * s), (0.42 * s, 0, 0.3 * s), 0.06 * s, 0.01 * s, 6, cell='pal_steel')


def it_ingots(mb, cell='pal_gold', n=6):
    k = 0
    for row, cnt in enumerate((3, 2, 1)):
        for i in range(cnt):
            if k >= n:
                return
            x = (i - (cnt - 1) / 2) * 0.13
            with place(mb, T(x, 0, row * 0.05) @ R('Z', (row % 2) * math.pi / 2 * 0)):
                cbox(mb, 0, 0, 0, 0.11, 0.24, 0.05, cell)
            k += 1


def it_scrap(mb, seed=1):
    r = random.Random(seed)
    for i in range(6):
        c = r.choice(['pal_dark_steel', 'pal_steel', 'pal_carrot', 'pal_soil'])
        with place(mb, T(r.uniform(-0.25, 0.25), r.uniform(-0.15, 0.15), 0.0) @ R('Z', r.uniform(0, 3)) @ R('X', r.uniform(-0.4, 0.4))):
            cbox(mb, 0, 0, 0, r.uniform(0.1, 0.3), r.uniform(0.06, 0.18), r.uniform(0.04, 0.12), c)
    with place(mb, T(0.1, 0.05, 0.08) @ R('Y', 0.5)):
        it_gear(mb, 0.13, 8, 'pal_soil', upright=False)


def it_toolbox(mb, cell='pal_red'):
    cbox(mb, 0, 0, 0, 0.42, 0.22, 0.2, cell)
    cbox(mb, 0, 0, 0.2, 0.44, 0.24, 0.025, 'pal_dark_steel')
    limb(mb, (-0.12, 0, 0.225), (0.12, 0, 0.225), 0.015, 0.015, 4, cell='pal_dark_steel')


def it_helmet(mb, cell='pal_steel'):
    lathe(mb, [(0.21, 0.0), (0.21, 0.02), (0.16, 0.03), (0.155, 0.1), (0.11, 0.16), (0.0, 0.185)], 8, cell=cell, cap_top=False, cap_bot=True)
    decal(mb, (0, -0.16, 0.08), (1, 0, 0), (0, 0, 1), 0.16, 0.05, 'pal_gold', (0, -1, 0))


def it_valve(mb, r=0.12):
    """Латунный вентиль-штурвал на патрубке (лицом к −Y)."""
    with place(mb, T(0, 0, r + 0.04) @ R('X', math.pi / 2)):
        n = 8
        pts = [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), 0.05) for k in range(n)]
        for k in range(n):
            limb(mb, pts[k], pts[(k + 1) % n], 0.014, 0.014, 4, cell='pal_red', caps=False)
        for k in range(0, n, 2):
            limb(mb, (0, 0, 0.05), pts[k], 0.01, 0.01, 4, cell='pal_red', caps=False)
        limb(mb, (0, 0, -0.1), (0, 0, 0.06), 0.03, 0.03, 6, cell='pal_gold')
    cbox(mb, 0, 0.1, 0, 0.08, 0.08, r + 0.04, 'pal_gold')


def it_bolts(mb, cells=('pal_red', 'pal_blue', 'pal_cream')):
    for i, c in enumerate(cells):
        limb(mb, (-0.25, (i - 1) * 0.12, 0.055), (0.25, (i - 1) * 0.12, 0.055), 0.055, 0.055, 6, cell=c)


def it_basket(mb, fill='pal_apple', w=0.42, d=0.3, h=0.16, heap=0.08, fruit=True):
    cbox(mb, 0, 0, 0, w, d, h, 'pal_burlap')
    with place(mb, T(0, 0, h) @ S(w / 2 * 0.95, d / 2 * 0.95, heap)):
        lathe(mb, [(1.0, 0.0), (0.7, 0.7), (0.0, 1.0)], 8, cell=fill, cap_top=False)
    if fruit:
        r = random.Random(hash(fill) & 0xffff)
        for i in range(3):
            sphere(mb, (r.uniform(-w * 0.3, w * 0.3), r.uniform(-d * 0.25, d * 0.25), h + heap * 0.5), 0.045, 6, 3, fill)


def it_bread(mb):
    cbox(mb, 0, 0, 0, 0.5, 0.32, 0.03, 'pal_brown')
    for i, (x, y) in enumerate(((-0.13, -0.06), (0.1, -0.07), (-0.02, 0.08), (0.16, 0.08))):
        with place(mb, T(x, y, 0.03) @ R('Z', 0.4 * i) @ S(0.11, 0.06, 0.06)):
            lathe(mb, [(1.0, 0.0), (0.9, 0.6), (0.0, 1.0)], 6, cell='pal_bread', cap_top=False)


def it_cheese(mb):
    for i, (x, z) in enumerate(((0.0, 0.0), (0.0, 0.09), (0.2, 0.0))):
        with place(mb, T(x, 0, z)):
            lathe(mb, [(0.12, 0.0), (0.13, 0.04), (0.12, 0.085)], 8, cell='pal_cheese', cap_bot=True)


def it_fish(mb):
    cbox(mb, 0, 0, 0, 0.55, 0.3, 0.04, 'pal_sky')
    for i in range(4):
        with place(mb, T(-0.18 + i * 0.12, 0, 0.04) @ R('Z', 1.3 + 0.1 * i) @ S(1.0, 0.35, 0.3)):
            lathe(mb, [(0.0, -0.14), (0.06, -0.06), (0.06, 0.06), (0.0, 0.14)], 4, cell='pal_fish', cap_top=False, phase=math.pi / 4)


def it_potions(mb):
    for i, (x, y, g) in enumerate(((-0.12, 0, 'pal_apple'), (0.0, 0.04, 'pal_glass_blue'), (0.12, 0, 'pal_acid'), (0.06, -0.08, 'pal_amber'))):
        with place(mb, T(x, y, 0)):
            it_flask(mb, 0.045, 0.16, g)


def it_cartridges(mb):
    cbox(mb, 0, 0, 0, 0.3, 0.2, 0.08, 'pal_brown')
    for i in range(4):
        for j in range(2):
            with place(mb, T(-0.1 + i * 0.065, -0.05 + j * 0.1, 0.08)):
                lathe(mb, [(0.022, 0.0), (0.022, 0.07), (0.0, 0.1)], 5, cell='pal_gold', cap_top=False)


# ============================================================
#  ЛАВКИ КЛАССОВ
# ============================================================
SW, SD = 3.6, 2.4            # ширина/глубина лавки


def stall_frame(mb, lod, style, cloth, drape, emb, roof=None):
    """Каркас лавки, крыша выбранного вида, прилавок, стеллаж, вывески, паровые детали."""
    fy, by = -0.95, 1.0                       # передние и задние стойки
    px = SW / 2 - 0.15
    if style == 'awning':
        hf, hb = 2.42, 2.98
        posts = [(-px, fy, hf), (px, fy, hf), (-px, by, hb), (px, by, hb)]
    elif style == 'gable':
        # скат лежит на брусьях стоек: стойки выше карниза на подъём ската до них
        hf, hb = 2.42, 2.42
        posts = [(x, y, hf + 0.34) for x in (-px, px) for y in (fy, by)]
    else:
        hf, hb = 2.5, 2.5
        # у шатра стойки — по углам карниза
        posts = [(x, y, hf) for x in (-(SW / 2 + 0.14), SW / 2 + 0.14) for y in (-1.44, 1.39)]
    for x, y, h in posts:
        post(mb, x, y, -0.5, h, 0.12)
    # прилавок
    cy = -0.62
    box(mb, 0, cy, 0.0, SW - 0.45, 0.62, 0.9, 'plank', 'plank')
    cbox(mb, 0, cy - 0.04, 0.9, SW - 0.3, 0.78, 0.05, 'pal_brown')
    # цветной полог на фасаде прилавка (цвет класса)
    decal(mb, (0, cy - 0.316, 0.58), (1, 0, 0), (0, 0, 1), SW - 0.5, 0.52, 'pal_' + drape, (0, -1, 0))
    if lod == 0:
        for k in range(7):
            x = -SW / 2 + 0.45 + k * (SW - 0.9) / 6
            mb.poly([(x - 0.13, cy - 0.318, 0.32), (x + 0.13, cy - 0.318, 0.32), (x, cy - 0.318, 0.24)],
                    [cuv('pal_' + drape, 0.2, 0.8), cuv('pal_' + drape, 0.8, 0.8), cuv('pal_' + drape, 0.5, 0.2)], (0, -1, 0))
    # стеллаж у задней стенки: задник, две полки
    sy = 0.78
    box(mb, 0, by + 0.02, 0.0, SW - 0.42, 0.05, 2.0, 'plank', 'plank')
    if lod <= 1:
        for z in (0.85, 1.45):
            cbox(mb, 0, sy, z, SW - 0.5, 0.36, 0.04, 'pal_brown', bottom=True)
    # крыша
    if style == 'awning':
        beam(mb, (-px - 0.06, by, hb - 0.04), (px + 0.06, by, hb - 0.04), 0.12, 0.12)
        beam(mb, (-px - 0.06, fy, hf - 0.04), (px + 0.06, fy, hf - 0.04), 0.1, 0.1)
        awning(mb, -SW / 2 - 0.12, SW / 2 + 0.12, by + 0.18, hb + 0.05, -1.55, hf - 0.08, cloth, lod)
        sign_y, base_z, sign_bot = by + 0.05, hb - 0.1, hb + 0.15
    elif style == 'gable':
        rs = roof or 'roof_red'
        beam(mb, (-px - 0.06, by, hb + 0.26), (px + 0.06, by, hb + 0.26), 0.12, 0.1)
        beam(mb, (-px - 0.06, fy, hf + 0.26), (px + 0.06, fy, hf + 0.26), 0.12, 0.1)
        ex, ey0, ey1, ez = SW / 2 + 0.25, -1.55, 1.6, hf - 0.02
        ry, rz = (ey0 + ey1) / 2, ez + 0.95
        for (ya, sgn) in ((ey0, -1), (ey1, 1)):
            E = (-ex, ya, ez) if sgn < 0 else (ex, ya, ez)
            Rd = (1, 0, 0) if sgn < 0 else (-1, 0, 0)
            Ud = (0, ry - ya, rz - ez)
            Ls = math.hypot(ry - ya, rz - ez)
            slope_plane(mb, E, Rd, Ud, 2 * ex, Ls, rs, (0, sgn * (rz - ez), abs(ry - ya)))
            # нижняя сторона ската — доски
            p0 = Vector(E)
            p1 = p0 + Vector(Rd) * 2 * ex
            p2 = p1 + Vector(Ud).normalized() * Ls
            p3 = p0 + Vector(Ud).normalized() * Ls
            mb.poly([tuple(p0), tuple(p3), tuple(p2), tuple(p1)],
                    [(0, strip_v('plank', 0)), (0, strip_v('plank', 1)), (2 * ex / U_SPAN, strip_v('plank', 1)), (2 * ex / U_SPAN, strip_v('plank', 0))],
                    (0, -sgn * (rz - ez), -abs(ry - ya)))
        for sx in (-1, 1):
            tri = [(sx * (ex - 0.02), ey0, ez), (sx * (ex - 0.02), ey1, ez), (sx * (ex - 0.02), ry, rz)]
            uvs = [(ey0 / U_SPAN, strip_v('plank', 0)), (ey1 / U_SPAN, strip_v('plank', 0)), (ry / U_SPAN, strip_v('plank', 1))]
            two_sided(mb, tri, uvs, (sx, 0, 0))
        beam(mb, (-ex - 0.05, ry, rz + 0.03), (ex + 0.05, ry, rz + 0.03), 0.12, 0.1, 'brass' if lod == 0 else 'timber')
        if lod == 0:
            scallops(mb, -ex, ex, ey0 - 0.01, ez + 0.02, 0.2, cloth, lod)
        sign_y, base_z, sign_bot = ry, rz - 0.05, rz + 0.12
    else:  # шатёр-«зонт»
        ex, ey0, ey1, ez = SW / 2 + 0.2, -1.5, 1.45, hf
        apex = (0, (ey0 + ey1) / 2, ez + 1.15)
        corners = [(-ex, ey0, ez), (ex, ey0, ez), (ex, ey1, ez), (-ex, ey1, ez)]
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.0)
            outn = Vector((mid[0], mid[1] - apex[1], 0)).normalized() + Vector((0, 0, 0.9))
            roof_face(mb, a, b, apex, apex, cloth, tuple(outn))
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            beam(mb, a, b, 0.08, 0.08)
        with place(mb, T(*apex)):
            lathe(mb, [(0.08, -0.05), (0.08, 0.05), (0.0, 0.28)], 6, cell='pal_gold', cap_top=False)
        scallops(mb, -ex, ex, ey0, ez + 0.01, 0.26, cloth, lod)
        if lod == 0:
            scallops(mb, ey0, ey1, ex, ez + 0.01, 0.26, cloth, lod, axis='y')
            scallops(mb, ey1, ey0, -ex, ez + 0.01, 0.26, cloth, lod, axis='y')
    # большая вывеска над лавкой: видна с обеих сторон (с кольца и от фонтана)
    if style == 'tent':
        post(mb, 0, by + 0.05, hb - 0.3, hb + 1.0, 0.08)
        gear_sign(mb, (0, by + 0.05 - 0.1, hb + 0.78), 0.55, emb, lod)
    else:
        gear_sign(mb, (0, sign_y, sign_bot + 0.62), 0.66, emb, lod)
        if lod <= 1:
            for x in (-0.5, 0.5):
                beam(mb, (x, sign_y, base_z), (x, sign_y, sign_bot + 0.05), 0.06, 0.06)
    # паровое: медный котелок в углу, труба вдоль стойки, манометр; фонарь под тентом
    if lod <= 1:
        bx, byy = -px + 0.28, by - 0.38
        with place(mb, T(bx, byy, 0.0)):
            lathe(mb, [(0.16, 0.0), (0.2, 0.08), (0.22, 0.45), (0.17, 0.62), (0.05, 0.68)], 8 if lod == 0 else 6,
                  strip='copper', u_units=0.18, cap_top=True, cap_cell='pal_dark_steel')
        if lod == 0:
            decal(mb, (bx, byy - 0.215, 0.32), (1, 0, 0), (0, 0, 1), 0.16, 0.16, 'gauge', (0, -1, 0))
            tube(mb, [(bx, byy, 0.66), (bx, byy, 0.9), (-px + 0.08, by - 0.08, 1.1), (-px + 0.08, by - 0.08, hb - 0.15)], 0.035, 6, 'copper')
            lantern(mb, -px + 0.35, -1.2, hf - 0.45, 0.8, lod)
            beam(mb, (-px + 0.35, -1.2, hf - 0.2), (-px + 0.35, -1.2, hf - 0.06), 0.015, 0.015, 'iron')


STALLS = {
    # класс: (стиль, ткань, цвет полога, крыша, товар)
    'operator':           ('gable', 'stripes_red', 'red', 'roof_red', 'operator'),
    'mechanic':           ('awning', 'stripes_blue', 'navy', None, 'mechanic'),
    'destroyer':          ('tent', 'canvas_cream', 'dark_red', None, 'destroyer'),
    'gunner':             ('awning', 'canvas_green', 'dark_green', None, 'gunner'),
    'repair_engineer':    ('awning', 'stripes_teal', 'teal', None, 'repair_engineer'),
    'boiler_guardian':    ('gable', 'stripes_blue', 'navy', 'roof_blue', 'boiler_guardian'),
    'demolitionist':      ('tent', 'stripes_red', 'orange', None, 'demolitionist'),
    'steam_berserker':    ('awning', 'stripes_red', 'dark_red', None, 'steam_berserker'),
    'pneumatic_sniper':   ('tent', 'canvas_green', 'green', None, 'pneumatic_sniper'),
    'artillery_engineer': ('gable', 'canvas_cream', 'brown', 'roof_green', 'artillery_engineer'),
    'engineer':           ('awning', 'stripes_teal', 'teal', None, 'engineer'),
    'constructor':        ('gable', 'stripes_blue', 'blue', 'roof_blue', 'constructor'),
    'technomancer':       ('tent', 'stripes_blue', 'purple', None, 'technomancer'),
    'pressure_sorcerer':  ('awning', 'canvas_cream', 'amber', None, 'pressure_sorcerer'),
    'machine_warlock':    ('tent', 'stripes_teal', 'navy', None, 'machine_warlock'),
    'circuit_necro':      ('awning', 'canvas_green', 'lime', None, 'circuit_necro'),
    'overhaul_master':    ('gable', 'canvas_cream', 'brown', 'roof_red', 'overhaul_master'),
    'protocol_prophet':   ('awning', 'stripes_blue', 'blueprint', None, 'protocol_prophet'),
    'craftsman':          ('gable', 'canvas_cream', 'leather', 'roof_green', 'craftsman'),
    'salvager':           ('tent', 'canvas_cream', 'orange', None, 'salvager'),
    'boiler_smith':       ('gable', 'stripes_red', 'dark_red', 'roof_red', 'boiler_smith'),
    'food':               ('awning', 'canvas_cream', 'green', None, 'food'),
    'supplies':           ('awning', 'stripes_red', 'purple', None, 'supplies'),
}

CZ = 0.95      # верх прилавка
CY = -0.66     # середина прилавка по глубине
S1, S2 = 0.89, 1.49   # верх полок
SY = 0.78


GOODS_S = 1.3   # товар крупнее натурального: читается с камеры игры (как в L2)


def at(mb, x, y, z, yaw=0.0, fn=None, *a, **kw):
    with place(mb, T(x, y, z) @ R('Z', yaw) @ S(GOODS_S)):
        fn(mb, *a, **kw)


def goods(mb, kind, lod):
    """Товар на прилавке и полках: по нему класс узнаётся издалека."""
    small = lod == 0
    E = 'emb_' + kind
    if kind == 'operator':
        at(mb, -1.05, CY, CZ, 0.3, it_wrench, 0.7)
        at(mb, -0.35, CY + 0.05, CZ, 0.0, it_shield_round, 0.34, E)
        at(mb, 0.45, CY, CZ, -0.2, it_wrench, 0.55, 'pal_gold')
        at(mb, 1.1, CY, CZ, 0.0, it_gauge)
        if small:
            for i, x in enumerate((-1.1, -0.5, 0.1)):
                at(mb, x, SY, S1, 0.0, it_hammer, 0.45, 0.18)
            at(mb, 0.9, SY, S2, 0.0, it_gear, 0.2, 10)
            at(mb, -0.6, SY, S2, 0.0, it_toolbox, 'pal_red')
    elif kind == 'mechanic':
        for i, x in enumerate((-1.0, 0.0, 1.0)):
            at(mb, x, 0.5, 0.0, 0.0, it_tower_shield, 0.55, 0.95, E if i == 1 else 'pal_navy')
        at(mb, -0.7, CY, CZ, 0.0, it_helmet)
        at(mb, 0.2, CY, CZ, 0.3, it_helmet, 'pal_gold')
        if small:
            at(mb, 0.9, CY, CZ, 0.0, it_ingots, 'pal_steel', 3)
            at(mb, -0.9, SY, S2, 0.0, it_gear, 0.18, 10)
    elif kind == 'destroyer':
        for i, x in enumerate((-0.9, -0.3, 0.3, 0.9)):
            at(mb, x, 0.55, 0.0, 0.2 * i, it_hammer, 1.15, 0.36 if i % 2 == 0 else 0.28, 'pal_dark_steel')
        at(mb, -0.6, CY, CZ, 0.0, it_hammer, 0.5, 0.2)
        at(mb, 0.5, CY, CZ, 0.0, it_shield_round, 0.3, E, 'pal_red')
    elif kind == 'gunner':
        for i, x in enumerate((-1.0, -0.4, 0.2, 0.8)):
            with place(mb, T(x, 0.62, 0.6) @ R('Y', -math.pi / 2 + 0.1) @ R('X', math.pi / 2)):
                it_rifle(mb, 1.15)
        at(mb, -0.6, CY, CZ, 0.25, it_rifle, 1.0)
        at(mb, 0.7, CY, CZ, 0.0, it_cartridges)
    elif kind == 'repair_engineer':
        at(mb, -1.0, CY, CZ, 0.2, it_wrench, 0.6)
        at(mb, -0.3, CY, CZ, -0.3, it_wrench, 0.45, 'pal_gold')
        at(mb, 0.5, CY, CZ, 0.0, it_toolbox, 'pal_teal')
        at(mb, 1.2, CY, CZ, 0.0, it_valve)
        if small:
            at(mb, -0.8, SY, S1, 0.0, it_toolbox, 'pal_red')
            at(mb, 0.4, SY, S1, 0.0, it_gear, 0.22, 12, 'pal_steel')
            at(mb, 0.8, SY, S2, 0.0, it_gauge)
    elif kind == 'boiler_guardian':
        at(mb, -0.8, 0.45, 0.0, 0.0, it_tower_shield, 0.75, 1.15, E)
        at(mb, 0.4, 0.45, 0.0, 0.0, it_tower_shield, 0.75, 1.15, 'pal_dark_red')
        with place(mb, T(1.15, CY, CZ)):
            lathe(mb, [(0.18, 0.0), (0.2, 0.3), (0.12, 0.42), (0.04, 0.46)], 8, strip='copper', u_units=0.16, cap_top=True)
        at(mb, -0.2, CY, CZ, 0.0, it_helmet, 'pal_gold')
        at(mb, 0.5, CY, CZ, 0.0, it_gauge, 0.12)
    elif kind == 'demolitionist':
        at(mb, -1.0, CY, CZ, 0.0, it_bomb)
        at(mb, -0.6, CY + 0.08, CZ, 0.0, it_bomb, 0.1)
        at(mb, 0.0, CY, CZ, 0.4, it_dynamite)
        at(mb, 0.7, CY, CZ, -0.3, it_dynamite)
        at(mb, 1.25, CY, CZ, 0.0, it_bomb, 0.12)
        if small:
            for x in (-1.0, -0.6, -0.2):
                at(mb, x, SY, S1, 0.0, it_bomb, 0.1)
            cbox(mb, 0.6, SY, S1, 0.6, 0.3, 0.3, 'crate')
    elif kind == 'steam_berserker':
        at(mb, -0.8, 0.5, 0.0, 0.3, it_hammer, 1.3, 0.48, 'pal_steel')
        at(mb, 0.7, 0.5, 0.0, -0.2, it_hammer, 1.2, 0.42, 'pal_carrot')
        with place(mb, T(-0.2, CY, CZ + 0.05) @ R('Y', math.pi / 2) @ R('Z', math.pi / 2) @ T(0, 0, -0.45)):
            it_hammer(mb, 0.9, 0.36, 'pal_steel')
        at(mb, 0.6, CY, CZ, 0.0, it_gauge, 0.12)
        if small:
            at(mb, 1.15, CY, CZ, 0.0, it_valve, 0.1)
    elif kind == 'pneumatic_sniper':
        for i, x in enumerate((-0.9, -0.3, 0.3, 0.9)):
            with place(mb, T(x, 0.62, 0.7) @ R('Y', -math.pi / 2 + 0.08) @ R('X', math.pi / 2)):
                it_rifle(mb, 1.35, True)
        at(mb, -0.3, CY, CZ, 0.1, it_rifle, 1.3, True)
        at(mb, 0.9, CY, CZ, 0.0, it_cartridges)
    elif kind == 'artillery_engineer':
        at(mb, -0.55, CY, CZ, 0.25, it_cannon)
        for i, x in enumerate((0.35, 0.55, 0.75, 0.95, 1.15)):
            at(mb, x, CY, CZ, 0.0, it_shell, 0.05 + 0.01 * (i % 2), 0.24 + 0.04 * (i % 3), 'pal_gold' if i % 2 else 'pal_carrot')
        if small:
            for i, x in enumerate((-1.2, -0.9, -0.6, -0.3, 0.0)):
                at(mb, x, SY, S1, 0.0, it_shell, 0.07, 0.34)
            at(mb, 0.8, SY, S1, 0.0, it_cannon)
    elif kind == 'engineer':
        at(mb, -1.0, CY, CZ, 0.3, it_pistol)
        at(mb, -0.45, CY, CZ, -0.2, it_pistol, 'pal_steel')
        at(mb, 0.25, CY, CZ, 0.0, it_coil, 0.42)
        at(mb, 0.85, CY, CZ, 0.4, it_scroll)
        if small:
            for x in (-1.0, -0.6):
                at(mb, x, SY, S1, 0.0, it_coil, 0.36)
            at(mb, 0.6, SY, S1, 0.1, it_scroll, 0.5)
            at(mb, 0.0, SY, S2, 0.0, it_gauge)
    elif kind == 'constructor':
        at(mb, -0.9, CY, CZ, 0.2, it_scroll, 0.55)
        at(mb, -0.9, CY + 0.12, CZ, -0.1, it_scroll, 0.5, 0.035, 'pal_paper')
        with place(mb, T(-0.1, CY, CZ + 0.002)):
            cbox(mb, 0, 0, 0, 0.6, 0.42, 0.01, 'pal_blueprint')
        at(mb, 0.65, CY, CZ, 0.0, it_gear, 0.18, 10, 'pal_steel', False)
        at(mb, 1.1, CY, CZ, 0.0, it_coil, 0.36)
        if small:
            for x in (-1.1, -0.7, -0.3):
                at(mb, x, SY, S1, 0.0, it_scroll, 0.4, 0.035)
            cbox(mb, 0.6, SY, S1, 0.5, 0.3, 0.3, 'crate')
    elif kind == 'technomancer':
        at(mb, -1.0, CY, CZ, 0.0, it_coil, 0.5)
        at(mb, -0.35, CY, CZ, 0.0, it_gauge, 0.12)
        at(mb, 0.25, CY, CZ, 0.0, it_coil, 0.38)
        at(mb, 0.9, CY, CZ, 0.0, it_cards, 4, 'pal_paper')
        if small:
            for x in (-0.9, -0.3, 0.3):
                at(mb, x, SY, S1, 0.0, it_gauge, 0.09)
    elif kind == 'pressure_sorcerer':
        for i, x in enumerate((-1.1, -0.55, 0.0)):
            at(mb, x, CY, CZ, 0.0, it_gauge, 0.1 + 0.02 * (i % 2))
        at(mb, 0.6, CY, CZ, 0.0, it_valve)
        with place(mb, T(1.15, CY, CZ)):
            lathe(mb, [(0.13, 0.0), (0.14, 0.35), (0.06, 0.45)], 8, strip='copper', u_units=0.12, cap_top=True)
        if small:
            for x in (-1.0, -0.3, 0.4):
                at(mb, x, SY, S1, 0.0, it_valve, 0.09)
    elif kind == 'machine_warlock':
        at(mb, -0.8, CY, CZ, 0.3, it_drone)
        at(mb, 0.4, CY, CZ, -0.2, it_drone, 0.1)
        if small:
            at(mb, -0.6, SY, S1, 0.0, it_drone, 0.09)
            at(mb, 0.5, SY, S2, 0.0, it_drone, 0.09)
        at(mb, 1.15, CY, CZ, 0.0, it_gauge, 0.09)
    elif kind == 'circuit_necro':
        for i, (x, g) in enumerate(((-1.1, 'pal_acid'), (-0.8, 'pal_lime'), (-0.5, 'pal_acid'), (0.0, 'pal_acid'))):
            at(mb, x, CY, CZ, 0.0, it_flask, 0.06, 0.22, g)
        with place(mb, T(0.7, CY, CZ)):
            lathe(mb, [(0.18, 0.0), (0.2, 0.12), (0.19, 0.3), (0.21, 0.32)], 8, strip='iron', u_units=0.16, cap_top=True, cap_cell='pal_acid')
        if small:
            for x in (-1.1, -0.85, -0.6, -0.35, 0.3, 0.55):
                at(mb, x, SY, S1, 0.0, it_flask, 0.05, 0.18, 'pal_acid' if x < 0 else 'pal_lime')
    elif kind == 'overhaul_master':
        at(mb, -1.0, CY, CZ, 0.0, it_gear, 0.22, 12, 'pal_gold')
        at(mb, -0.35, CY, CZ, 0.0, it_gear, 0.15, 8, 'pal_steel')
        with place(mb, T(0.35, CY, CZ)):
            lathe(mb, [(0.1, 0.0), (0.1, 0.3), (0.06, 0.32), (0.03, 0.5)], 8, cell='pal_steel', cap_top=True)
        at(mb, 0.95, CY, CZ, 0.3, it_wrench, 0.5)
        if small:
            for x in (-1.0, -0.4, 0.2, 0.8):
                at(mb, x, SY, S1, 0.0, it_gear, 0.14 + 0.03 * (x > 0), 10, 'pal_gold' if x < 0 else 'pal_steel')
    elif kind == 'protocol_prophet':
        at(mb, -1.0, CY, CZ, 0.1, it_cards, 4)
        at(mb, -0.45, CY, CZ, -0.2, it_cards, 3, 'pal_cream')
        with place(mb, T(0.3, CY, CZ)):
            cbox(mb, 0, 0, 0, 0.36, 0.28, 0.22, 'pal_brown')
            limb(mb, (0, 0, 0.22), (0, 0, 0.75), 0.012, 0.008, 4, cell='pal_gold')
            sphere(mb, (0, 0, 0.78), 0.035, 6, 3, 'glow')
        at(mb, 1.0, CY, CZ, 0.0, it_scroll, 0.4, 0.03, 'pal_paper')
        if small:
            for x in (-1.0, -0.4):
                at(mb, x, SY, S1, 0.0, it_cards, 5)
            at(mb, 0.6, SY, S1, 0.0, it_gauge, 0.1)
    elif kind == 'craftsman':
        at(mb, -0.9, CY, CZ, 0.0, it_anvil, 0.9)
        at(mb, -0.1, CY, CZ, 0.3, it_hammer, 0.5, 0.2)
        at(mb, 0.6, CY, CZ, 0.0, it_toolbox, 'pal_leather')
        if small:
            at(mb, -0.8, SY, S1, 0.0, it_ingots, 'pal_steel', 4)
            at(mb, 0.4, SY, S1, 0.0, it_ingots, 'pal_carrot', 3)
            at(mb, -0.2, SY, S2, 0.0, it_gear, 0.18, 10)
    elif kind == 'salvager':
        at(mb, -0.8, CY, CZ, 0.0, it_scrap, 3)
        at(mb, 0.3, CY, CZ, 0.0, it_scrap, 7)
        cbox(mb, -0.9, 0.45, 0.0, 0.7, 0.6, 0.55, 'crate')
        with place(mb, T(0.9, 0.55, 0.0)):
            it_scrap(mb, 11)
        if small:
            # магнит-подкова на стеллаже
            with place(mb, T(0.0, SY, S1 + 0.25) @ R('X', math.pi / 2)):
                for a in range(6):
                    a0, a1 = math.pi * a / 6, math.pi * (a + 1) / 6
                    limb(mb, (0.16 * math.cos(a0), -0.16 * math.sin(a0), 0), (0.16 * math.cos(a1), -0.16 * math.sin(a1), 0), 0.045, 0.045, 6, cell='pal_red', caps=False)
                for x in (-0.16, 0.16):
                    limb(mb, (x, 0, 0), (x, 0.12, 0), 0.045, 0.045, 6, cell='pal_steel')
    elif kind == 'boiler_smith':
        at(mb, -0.9, CY, CZ, 0.0, it_anvil, 1.0)
        at(mb, -0.1, CY, CZ, 0.0, it_ingots, 'pal_gold', 6)
        at(mb, 0.6, CY, CZ, 0.0, it_helmet)
        at(mb, 1.15, CY, CZ, 0.0, it_ingots, 'pal_steel', 3)
        if small:
            at(mb, -0.5, SY, S1, 0.0, it_shield_round, 0.25, 'emb_boiler_smith')
            at(mb, 0.4, SY, S1, 0.0, it_helmet, 'pal_gold')
    elif kind == 'food':
        at(mb, -1.1, CY, CZ, 0.0, it_basket, 'pal_apple')
        at(mb, -0.6, CY, CZ, 0.0, it_basket, 'pal_cabbage', 0.4, 0.3, 0.16, 0.1, False)
        at(mb, -0.05, CY, CZ, 0.0, it_basket, 'pal_carrot')
        at(mb, 0.55, CY, CZ, 0.0, it_bread)
        at(mb, 1.15, CY, CZ, 0.0, it_cheese)
        if small:
            at(mb, -0.8, SY, S1, 0.0, it_cheese)
            at(mb, 0.2, SY, S1, 0.0, it_fish)
            at(mb, 0.0, SY, S2, 0.0, it_bread)
    elif kind == 'supplies':
        at(mb, -1.0, CY, CZ, 0.0, it_potions)
        at(mb, -0.3, CY, CZ, 0.0, it_cartridges)
        at(mb, 0.4, CY, CZ, 0.0, it_potions)
        at(mb, 1.05, CY, CZ, 0.3, it_bolts, ('pal_burlap', 'pal_cream', 'pal_rope'))
        if small:
            for x in (-1.0, -0.2, 0.6):
                at(mb, x, SY, S1, 0.0, it_potions)
            at(mb, 0.0, SY, S2, 0.0, it_cartridges)


def make_stall(kind):
    style, cloth, drape, roof, gk = STALLS[kind]

    def build(lod):
        mb = MB()
        stall_frame(mb, lod, style, cloth, drape, 'emb_' + kind, roof)
        if lod <= 1:
            goods(mb, gk, lod)
        else:
            # дальний ярус: товар одной цветной «горкой» на прилавке
            cbox(mb, 0, CY, CZ, SW - 0.9, 0.4, 0.18, 'pal_' + drape)
        return mb, [(0, 0.05, SW - 0.1, SD - 0.1, 2.4, 0.0)]
    return build


# ============================================================
#  ФОНТАН ОСНОВАТЕЛЯ (восьмигранник, клумбы, статуя механика-основателя)
# ============================================================
def oct_ring_wall(mb, r, z0, z1, strip, inward=False, seg=8, zref=None):
    ph = math.pi / seg
    pts = [(r * math.cos(ph + 2 * math.pi * k / seg), r * math.sin(ph + 2 * math.pi * k / seg)) for k in range(seg + 1)]
    s = 0.0
    for k in range(seg):
        a, b = pts[k], pts[k + 1]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)
        n = (-mid[0], -mid[1], 0) if inward else mid
        if inward:
            wall_rect(mb, b, a, z0, z1, strip, n, s0=s, zref=z0 if zref is None else zref)
        else:
            wall_rect(mb, a, b, z0, z1, strip, n, s0=s, zref=z0 if zref is None else zref)
        s += math.hypot(b[0] - a[0], b[1] - a[1])


def oct_annulus(mb, r_in, r_out, z, cell=None, strip=None, seg=8, two=False):
    ph = math.pi / seg
    for k in range(seg):
        a0 = ph + 2 * math.pi * k / seg
        a1 = ph + 2 * math.pi * (k + 1) / seg
        pts = [(r_in * math.cos(a0), r_in * math.sin(a0), z), (r_out * math.cos(a0), r_out * math.sin(a0), z),
               (r_out * math.cos(a1), r_out * math.sin(a1), z), (r_in * math.cos(a1), r_in * math.sin(a1), z)]
        if cell:
            uvs = [cuv(cell, 0.5 + 0.5 * p[0] / r_out, 0.5 + 0.5 * p[1] / r_out) for p in pts]
        else:
            w = (r_out - r_in) / STRIPS[strip]['heightM']
            L = 2 * math.pi * r_out / seg / U_SPAN
            uvs = [(k * L, strip_v(strip, 0)), (k * L, strip_v(strip, min(1.0, w))), ((k + 1) * L, strip_v(strip, min(1.0, w))), ((k + 1) * L, strip_v(strip, 0))]
        mb.poly(pts, uvs, (0, 0, 1))


def statue(mb, lod, cell='bronze'):
    """Бронзовый механик-основатель: длинный сюртук, цилиндр с очками, ранец-котёл,
    в поднятой руке — огромный ключ, у ноги — шестерня."""
    B = cell
    seg = 8 if lod == 0 else 6
    # ноги и сапоги
    for x in (-0.13, 0.13):
        limb(mb, (x, 0.0, 0.0), (x * 0.9, 0.0, 0.88), 0.1, 0.12, seg, cell=B, skey='leg')
        cbox(mb, x, -0.05, 0.0, 0.16, 0.3, 0.14, B)
    # сюртук (эллипс в плане), торс, плечи
    with place(mb, S(1.0, 0.78, 1.0)):
        lathe(mb, [(0.36, 0.32), (0.31, 0.6), (0.27, 0.95), (0.29, 1.2), (0.31, 1.42), (0.22, 1.56), (0.08, 1.6)], seg + 2, cell=B, cap_top=False, cap_bot=True, skey='coat')
    limb(mb, (0, 0, 1.55), (0, 0, 1.68), 0.07, 0.07, seg, cell=B)
    sphere(mb, (0, 0, 1.8), 0.14, seg, 5, B)
    # цилиндр с латунной лентой и очками
    with place(mb, T(0, 0, 1.9)):
        lathe(mb, [(0.21, 0.0), (0.21, 0.02), (0.12, 0.03), (0.12, 0.27), (0.13, 0.29)], seg, cell=B, cap_bot=True)
        if lod == 0:
            lathe(mb, [(0.125, 0.05), (0.125, 0.09)], seg, cell='pal_gold', cap_top=False)
            for x in (-0.05, 0.05):
                with place(mb, T(x, -0.12, 0.07) @ R('X', math.pi / 2)):
                    disc(mb, 0.04, 0.03, 6, 'pal_gold', 'glow')
    # правая рука поднята с ключом
    sh_r, el_r, ha_r = (0.33, 0.0, 1.48), (0.46, -0.06, 1.78), (0.44, -0.08, 2.12)
    limb(mb, sh_r, el_r, 0.085, 0.075, seg, cell=B)
    limb(mb, el_r, ha_r, 0.075, 0.06, seg, cell=B)
    sphere(mb, ha_r, 0.075, seg, 4, B)
    with place(mb, T(ha_r[0], ha_r[1], ha_r[2] - 0.25) @ R('Y', -0.12)):
        cbox(mb, 0, 0, 0, 0.07, 0.05, 0.95, B)
        cbox(mb, 0.07, 0, 0.88, 0.07, 0.07, 0.24, B)
        cbox(mb, -0.07, 0, 0.88, 0.07, 0.07, 0.24, B)
        cbox(mb, 0, 0, 0.86, 0.22, 0.07, 0.07, B)
        with place(mb, T(0, 0, 0.0)):
            lathe(mb, [(0.07, -0.05), (0.07, 0.03)], seg, cell=B, cap_bot=True)
    # левая рука опирается на шестерню у ноги
    sh_l, el_l, ha_l = (-0.33, 0.0, 1.48), (-0.42, -0.05, 1.15), (-0.44, -0.12, 0.9)
    limb(mb, sh_l, el_l, 0.085, 0.075, seg, cell=B)
    limb(mb, el_l, ha_l, 0.075, 0.06, seg, cell=B)
    sphere(mb, ha_l, 0.07, seg, 4, B)
    with place(mb, T(-0.55, -0.1, 0.0) @ R('Z', 0.25) @ R('X', math.pi / 2) @ T(0, 0.48, -0.04)):
        gear_flat(mb, 0.48, 0.41, 0.16, 12 if lod == 0 else 8, 0.08, B, 'pal_gold')
    # ранец-котёл и трубки к плечам
    with place(mb, T(0, 0.27, 0.95)):
        lathe(mb, [(0.15, 0.0), (0.17, 0.08), (0.17, 0.5), (0.1, 0.6)], seg, cell=B, cap_top=True, cap_bot=True)
    if lod == 0:
        for x in (-0.12, 0.12):
            limb(mb, (x, 0.3, 1.5), (x * 1.8, 0.08, 1.56), 0.03, 0.03, 5, cell='pal_gold')
        limb(mb, (0, 0.3, 1.55), (0, 0.3, 1.8), 0.035, 0.05, 6, cell=B)


def build_fountain(lod):
    mb = MB()
    seg = 8
    # внешний бортик клумб, клумбы, чаша, вода
    oct_ring_wall(mb, 5.3, -0.9, 0.38, 'stone')
    oct_annulus(mb, 5.0, 5.3, 0.38, strip='stone')
    oct_ring_wall(mb, 5.0, 0.18, 0.38, 'stone', inward=True)
    oct_annulus(mb, 4.05, 5.0, 0.30, cell='flowers')
    oct_ring_wall(mb, 4.05, 0.30, 0.78, 'stone')
    oct_annulus(mb, 3.7, 4.05, 0.78, strip='stone')
    oct_ring_wall(mb, 3.7, 0.55, 0.78, 'stone', inward=True)
    oct_annulus(mb, 1.55, 3.7, 0.58, cell='water')
    if lod == 0:
        # кусты-шары на клумбах между лучами
        for k in range(8):
            a = math.pi / 8 + 2 * math.pi * k / 8 + math.pi / 8
            sphere(mb, (4.5 * math.cos(a), 4.5 * math.sin(a), 0.3), 0.32, 6, 4, 'pal_dark_green')
    # восьмигранный ступенчатый постамент
    with place(mb, R('Z', math.pi / 8)):
        lathe(mb, [(1.55, 0.5), (1.55, 1.15)], 8, strip='stone', u_units=1.2, cap_top=False, phase=0)
    oct_annulus(mb, 1.15, 1.55, 1.15, strip='stone')
    with place(mb, R('Z', math.pi / 8)):
        lathe(mb, [(1.15, 1.15), (1.05, 2.35)], 8, strip='stone', u_units=0.9, cap_top=False)
        lathe(mb, [(1.12, 1.6), (1.12, 1.74)], 8, strip='brass', u_units=0.9, cap_top=False)
        lathe(mb, [(1.25, 2.35), (1.25, 2.55)], 8, strip='brass', u_units=1.0, cap_top=False, cap_bot=True)
    oct_annulus(mb, 0.85, 1.25, 2.55, strip='stone')
    with place(mb, R('Z', math.pi / 8)):
        lathe(mb, [(0.85, 2.55), (0.78, 2.95)], 8, strip='stone', u_units=0.7, cap_top=True, cap_cell='pal_canvas')
    # манометры на гранях и медные рожки-изливы
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        if lod <= 1:
            n = (c, s, 0)
            decal(mb, (1.135 * c, 1.135 * s, 1.95), (-s, c, 0), (0, 0, 1), 0.42, 0.42, 'gauge', n)
        p0 = (1.2 * c, 1.2 * s, 2.15)
        pts = [p0, (1.75 * c, 1.75 * s, 2.25), (2.3 * c, 2.3 * s, 2.0), (2.5 * c, 2.5 * s, 1.72)]
        tube(mb, pts, 0.08, 8 if lod == 0 else 6, 'copper', skey='sp%d' % k)
        if lod <= 1:
            # струя воды
            limb(mb, (2.52 * c, 2.52 * s, 1.68), (2.62 * c, 2.62 * s, 0.58), 0.05, 0.08, 6, cell='water', caps=False)
    # статуя
    with place(mb, T(0, 0, 2.95) @ S(1.3) @ R('Z', 0.0)):
        statue(mb, lod)
    return mb, [(0, 0, 10.6, 10.6, 1.3, -0.9, False, 'cylinder')]


# ============================================================
#  ЗЕЛЁНЫЙ ШАТЁР-ПАВИЛЬОН (общий торг)
# ============================================================
def build_pavilion(lod):
    mb = MB()
    EX, EY, EZ = 5.4, 3.9, 3.05
    RX, RZ = 2.7, 5.2
    for x in (-4.9, 0.0, 4.9):
        for y in (-3.4, 3.4):
            post(mb, x, y, -0.6, EZ, 0.18)
    for y in (-3.4, 3.4):
        beam(mb, (-5.0, y, EZ - 0.08), (5.0, y, EZ - 0.08), 0.16, 0.16)
    for x in (-4.9, 4.9):
        beam(mb, (x, -3.5, EZ - 0.08), (x, 3.5, EZ - 0.08), 0.16, 0.16)
    if lod <= 1:
        for x in (-4.9, 0.0, 4.9):
            beam(mb, (x, -3.4, EZ - 0.12), (x, 0, RZ - 0.25), 0.1, 0.1)
            beam(mb, (x, 3.4, EZ - 0.12), (x, 0, RZ - 0.25), 0.1, 0.1)
    beam(mb, (-RX, 0, RZ - 0.2), (RX, 0, RZ - 0.2), 0.14, 0.14)
    ea = [(-EX, -EY, EZ), (EX, -EY, EZ), (EX, EY, EZ), (-EX, EY, EZ)]
    ridge = [(-RX, 0, RZ), (RX, 0, RZ)]
    roof_face(mb, ea[0], ea[1], ridge[1], ridge[0], 'canvas_green', (0, -1.2, 2.0))
    roof_face(mb, ea[2], ea[3], ridge[0], ridge[1], 'canvas_green', (0, 1.2, 2.0))
    roof_face(mb, ea[1], ea[2], ridge[1], ridge[1], 'canvas_green', (1.2, 0, 2.0))
    roof_face(mb, ea[3], ea[0], ridge[0], ridge[0], 'canvas_green', (-1.2, 0, 2.0))
    # подзор с фестонами по периметру
    scallops(mb, -EX, EX, -EY, EZ + 0.01, 0.34, 'canvas_green', lod)
    scallops(mb, -EX, EX, EY, EZ + 0.01, 0.34, 'canvas_green', lod)
    scallops(mb, -EY, EY, EX, EZ + 0.01, 0.34, 'canvas_green', lod, axis='y')
    scallops(mb, -EY, EY, -EX, EZ + 0.01, 0.34, 'canvas_green', lod, axis='y')
    # латунные навершия конька
    for x in (-RX, RX):
        with place(mb, T(x, 0, RZ)):
            lathe(mb, [(0.1, -0.05), (0.12, 0.1), (0.0, 0.42)], 6, cell='pal_gold', cap_top=False)
    # длинный прилавок с тканями и ящиками
    box(mb, 0, 0.0, 0.0, 6.4, 1.0, 0.9, 'plank', 'plank')
    cbox(mb, 0, 0.0, 0.9, 6.6, 1.15, 0.05, 'pal_brown')
    if lod <= 1:
        cols = ['pal_red', 'pal_blue', 'pal_cream', 'pal_green', 'pal_purple', 'pal_yellow', 'pal_teal', 'pal_white']
        for i in range(8 if lod == 0 else 4):
            x = -2.9 + i * (5.8 / 7 if lod == 0 else 5.8 / 3)
            limb(mb, (x, -0.38, 1.01), (x, 0.38, 1.01), 0.07, 0.07, 6, cell=cols[i % len(cols)])
        for x, y in ((-4.1, 1.6), (-3.4, 2.2), (3.6, 2.1)):
            cbox(mb, x, y, 0.0, 0.7, 0.7, 0.7, 'crate')
        cbox(mb, -3.4, 2.2, 0.7, 0.6, 0.6, 0.55, 'crate')
    # паровой самовар-котёл с трубой сквозь крышу
    sx, sy = 3.6, -1.9
    with place(mb, T(sx, sy, 0.0)):
        lathe(mb, [(0.42, 0.0), (0.48, 0.15), (0.5, 1.0), (0.4, 1.3), (0.16, 1.45)], 10 if lod == 0 else 6, strip='copper', u_units=0.4, cap_top=True)
        if lod <= 1:
            lathe(mb, [(0.52, 0.5), (0.52, 0.62)], 10 if lod == 0 else 6, strip='brass', u_units=0.4, cap_top=False)
    if lod <= 1:
        decal(mb, (sx, sy - 0.505, 0.82), (1, 0, 0), (0, 0, 1), 0.3, 0.3, 'gauge', (0, -1, 0))
    tube(mb, [(sx, sy, 1.42), (sx, sy, 2.6), (sx - 0.6, sy + 0.9, 3.9), (sx - 0.6, sy + 0.9, RZ + 0.9)], 0.09, 8 if lod == 0 else 5, 'copper')
    with place(mb, T(sx - 0.6, sy + 0.9, RZ + 0.88)):
        lathe(mb, [(0.13, 0.0), (0.2, 0.12), (0.0, 0.3)], 6, cell='pal_dark_steel', cap_top=False, cap_bot=True)
    if lod == 0:
        for x in (-2.0, 0.0, 2.0):
            beam(mb, (x, 0, RZ - 0.27), (x, 0, RZ - 0.85), 0.015, 0.015, 'iron')
            lantern(mb, x, 0, RZ - 1.05, 1.0, lod)
    return mb, [(0, 0, 6.5, 1.15, 1.0, 0.0), (sx, sy, 1.1, 1.1, 1.5, 0.0, False, 'cylinder')]


# ============================================================
#  ФАХВЕРКОВЫЕ ДОМА С ЧЕРЕПИЦЕЙ (настоящий каркас: брусья — геометрия поверх штукатурки)
#  Стена делится стойками на пролёты ~1.75 м; раскосы — только в угловых пролётах,
#  окна и дверь — строго посередине свободных пролётов, с перемычкой, подоконником и ставнями.
# ============================================================
SHUTTERS = {'roof_red': 'pal_dark_green', 'roof_blue': 'pal_dark_red', 'roof_green': 'pal_navy'}
BEAM_Y = -0.045          # брусья чуть выступают из штукатурки
BEAM_T = 0.11


def framed_wall(mb, A, B, z0, H, lod, door=False, windows=True, shop=False, shutter='pal_dark_green', bays=None):
    """Стена с фахверком в локальной системе: вдоль +X от 0 до L, наружу −Y."""
    ax, ay = A
    bx, by = B
    L = math.hypot(bx - ax, by - ay)
    ang = math.atan2(by - ay, bx - ax)
    with place(mb, T(ax, ay, 0) @ R('Z', ang)):
        wall_rect(mb, (0, 0), (L, 0), z0, z0 + H, 'plaster', (0, -1, 0), zref=z0)
        n = bays or max(2, int(round(L / 1.75)))
        bw = L / n
        y = BEAM_Y
        # стойки (на LOD2 — только угловые), лежень и верхняя обвязка
        for i in range(n + 1):
            if lod == 2 and 0 < i < n:
                continue
            x = min(max(i * bw, 0.09), L - 0.09)
            post(mb, x, y, z0, z0 + H, 0.18, 'timber', d=BEAM_T)
        for zz in (z0 + 0.09, z0 + H - 0.09):
            beam(mb, (0.0, y, zz), (L, y, zz), BEAM_T, 0.18)
        door_bay = (n // 2) if door else -1
        for i in range(n):
            xc = (i + 0.5) * bw
            braced = (i == 0 or i == n - 1) and n >= 3 and i != door_bay
            if i == door_bay:
                dw = min(1.15, bw - 0.32)
                decal(mb, (xc, -0.012, z0 + 1.06), (1, 0, 0), (0, 0, 1), dw, 2.02, 'door', (0, -1, 0))
                if lod <= 1:
                    beam(mb, (xc - dw / 2 - 0.05, y, z0 + 2.14), (xc + dw / 2 + 0.05, y, z0 + 2.14), BEAM_T, 0.14)
                continue
            if braced:
                if lod <= 1:
                    if i == 0:
                        beam(mb, (0.12, y, z0 + 0.2), (bw - 0.1, y, z0 + H - 0.2), BEAM_T, 0.15)
                    else:
                        beam(mb, (L - 0.12, y, z0 + 0.2), (L - bw + 0.1, y, z0 + H - 0.2), BEAM_T, 0.15)
                continue
            if not windows:
                continue
            big = shop
            ww = min(1.25 if big else 0.92, bw - 0.42)
            wh = 1.35 if big else 1.12
            zc = z0 + (1.35 if big else 1.5)
            decal(mb, (xc, -0.012, zc), (1, 0, 0), (0, 0, 1), ww, wh, 'window', (0, -1, 0))
            if lod <= 1:
                beam(mb, (xc - ww / 2 - 0.08, y, zc - wh / 2 - 0.07), (xc + ww / 2 + 0.08, y, zc - wh / 2 - 0.07), BEAM_T, 0.12)
                beam(mb, (xc - ww / 2 - 0.08, y, zc + wh / 2 + 0.07), (xc + ww / 2 + 0.08, y, zc + wh / 2 + 0.07), BEAM_T, 0.12)
            if lod == 0:
                cbox(mb, xc, -0.1, zc - wh / 2 - 0.16, ww + 0.2, 0.14, 0.05, 'pal_brown', bottom=True)
                if not big:
                    for sx in (-1, 1):
                        cbox(mb, xc + sx * (ww / 2 + ww / 4 + 0.05), -0.085, zc - wh / 2, ww / 2, 0.04, wh, shutter)


def framed_gable(mb, A, B, z, rz, lod):
    """Фронтон: штукатурка, бабка, затяжка, стропильные брусья, слуховое окно."""
    ax, ay = A
    bx, by = B
    L = math.hypot(bx - ax, by - ay)
    ang = math.atan2(by - ay, bx - ax)
    with place(mb, T(ax, ay, 0) @ R('Z', ang)):
        wall_profile(mb, (0, 0), (L, 0), z, [(0.0, z), (L / 2, rz), (L, z)], 'plaster', (0, -1, 0), zref=z)
        y = BEAM_Y
        if lod <= 1:
            beam(mb, (L / 2, y, z + 0.05), (L / 2, y, rz - 0.15), BEAM_T, 0.16)
            zc = z + (rz - z) * 0.42
            xo = (L / 2) * (1 - 0.42)
            beam(mb, (L / 2 - xo + 0.1, y, zc), (L / 2 + xo - 0.1, y, zc), BEAM_T, 0.14)
            beam(mb, (0.15, y, z + 0.1), (L / 2, y, rz - 0.12), BEAM_T, 0.16)
            beam(mb, (L - 0.15, y, z + 0.1), (L / 2, y, rz - 0.12), BEAM_T, 0.16)
            decal(mb, (L / 2 - 0.55, -0.012, z + (rz - z) * 0.2), (1, 0, 0), (0, 0, 1), 0.5, 0.6, 'window', (0, -1, 0))


def house(mb, lod, W, D, roof, storeys=2, jetty=0.3, chimney=True, shop=None, pitch=1.0, door_x=0.0, seed=1):
    shutter = SHUTTERS.get(roof, 'pal_dark_green')
    # каменный цоколь (уходит в землю на 1 м — на склоне дом не висит)
    Z0, Z1 = -1.0, 0.55
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    s = 0.0
    for a, b, n in (((x0, y0), (x1, y0), (0, -1, 0)), ((x1, y0), (x1, y1), (1, 0, 0)),
                    ((x1, y1), (x0, y1), (0, 1, 0)), ((x0, y1), (x0, y0), (-1, 0, 0))):
        wall_rect(mb, a, b, Z0, Z1, 'stone', n, s0=s, zref=Z0)
        s += math.hypot(b[0] - a[0], b[1] - a[1])
    H = 2.6
    z = Z1
    ext = 0.0
    for st in range(storeys):
        e = ext
        xa, xb, ya, yb = x0, x1, y0 - e, y1 + e
        ground = st == 0
        framed_wall(mb, (xa, ya), (xb, ya), z, H, lod, door=ground, shop=bool(shop) and ground, shutter=shutter)
        framed_wall(mb, (xb, ya), (xb, yb), z, H, lod, shutter=shutter)
        framed_wall(mb, (xb, yb), (xa, yb), z, H, lod, shutter=shutter)
        framed_wall(mb, (xa, yb), (xa, ya), z, H, lod, shutter=shutter)
        if st > 0 and e > 0 and lod <= 1:
            # вынос этажа: нижняя обшивка и консоли под каждой стойкой
            n = max(2, int(round(W / 1.75)))
            for yy, sg in ((ya, -1), (yb, 1)):
                pts = [(xa, yy, z), (xb, yy, z), (xb, yy - sg * e, z), (xa, yy - sg * e, z)]
                mb.poly(pts, [(0, strip_v('timber', 0)), (W / U_SPAN, strip_v('timber', 0)), (W / U_SPAN, strip_v('timber', 1)), (0, strip_v('timber', 1))], (0, 0, -1))
                if lod == 0:
                    for k in range(n + 1):
                        bx_ = min(max(xa + k * W / n, xa + 0.1), xb - 0.1)
                        beam(mb, (bx_, yy - sg * e, z - 0.32), (bx_, yy - sg * 0.01, z - 0.02), 0.12, 0.14)
        z += H
        ext += jetty
    ytop0, ytop1 = y0 - (ext - jetty), y1 + (ext - jetty)
    if lod <= 1:
        nb = max(2, int(round(W / 1.75)))
        door_c = x0 + (nb // 2 + 0.5) * W / nb          # крыльцо — ровно под дверью среднего пролёта
        cbox(mb, door_c, y0 - 0.45, Z1 - 0.55, 1.5, 0.9, 0.5, 'pal_canvas')
    # двускатная крыша вдоль X
    ov = 0.45
    half = (ytop1 - ytop0) / 2
    yc = (ytop0 + ytop1) / 2
    rz = z + half * pitch
    ex = W / 2 + ov
    for (ya, sgn) in ((ytop0 - ov, -1), (ytop1 + ov, 1)):
        ez = z - ov * pitch
        E = (-ex, ya, ez) if sgn < 0 else (ex, ya, ez)
        Rd = (1, 0, 0) if sgn < 0 else (-1, 0, 0)
        Ud = (0, yc - ya, rz - ez)
        Ls = math.hypot(yc - ya, rz - ez)
        slope_plane(mb, E, Rd, Ud, 2 * ex, Ls, roof, (0, sgn * (rz - ez), abs(yc - ya)))
        if lod <= 1:
            p0 = Vector(E)
            p1 = p0 + Vector(Rd) * 2 * ex
            u = Vector(Ud).normalized()
            p2, p3 = p1 + u * Ls, p0 + u * Ls
            mb.poly([tuple(p0), tuple(p3), tuple(p2), tuple(p1)],
                    [(0, strip_v('plank', 0)), (0, strip_v('plank', 1)), (2 * ex / U_SPAN, strip_v('plank', 1)), (2 * ex / U_SPAN, strip_v('plank', 0))],
                    (0, -sgn * (rz - ez), -abs(yc - ya)))
            for xx in (-ex, ex):
                beam(mb, (xx, ya, ez), (xx, yc, rz), 0.06, 0.2)
    # фронтоны: правый (наружу +X) и левый (наружу −X)
    framed_gable(mb, (x1, ytop0), (x1, ytop1), z, rz, lod)
    framed_gable(mb, (x0, ytop1), (x0, ytop0), z, rz, lod)
    beam(mb, (-ex - 0.05, yc, rz + 0.04), (ex + 0.05, yc, rz + 0.04), 0.16, 0.12, 'timber')
    if chimney:
        cx = W / 2 - 1.0
        box(mb, cx, yc + 0.6, z - 0.2, 0.7, 0.7, (rz - z) + 1.1, 'stone', 'stone', top_cell='dark')
        if lod == 0:
            limb(mb, (cx, yc + 0.6, rz + 0.9), (cx, yc + 0.6, rz + 1.25), 0.12, 0.12, 6, strip='copper')
    # стимпанк — по делу: водосток-паропровод с манометром в бочку, медный бак на крыше
    if lod <= 1:
        gx, gy = x1 + 0.12, y0 + 0.4
        tube(mb, [(gx - 0.1, gy, z - 0.1), (gx, gy, z - 0.3), (gx, gy, 0.9), (gx + 0.35, gy - 0.1, 0.65)], 0.07, 6, 'copper')
        with place(mb, T(gx + 0.45, gy - 0.1, -0.1)):
            lathe(mb, [(0.3, 0.0), (0.34, 0.4), (0.3, 0.8)], 8, strip='staves', u_units=0.25, cap_top=True, cap_cell='pal_brown')
        decal(mb, (gx + 0.075, gy, 1.5), (0, -1, 0), (0, 0, 1), 0.3, 0.3, 'gauge', (1, 0, 0))
        tx, ty = -W / 2 + 1.3, yc + (ytop1 - yc) * 0.35
        tz = z + (rz - z) * 0.65
        for dx, dy in ((-0.35, -0.35), (0.35, -0.35), (-0.35, 0.35), (0.35, 0.35)):
            beam(mb, (tx + dx, ty + dy, tz - 0.6), (tx + dx, ty + dy, tz + 0.3), 0.06, 0.06, 'iron')
        with place(mb, T(tx, ty, tz + 0.3)):
            lathe(mb, [(0.55, 0.0), (0.6, 0.1), (0.6, 0.95), (0.45, 1.15), (0.12, 1.22)], 10 if lod == 0 else 6, strip='copper', u_units=0.45, cap_top=True, cap_bot=True)
        tube(mb, [(tx + 0.5, ty, tz + 0.6), (tx + 1.1, ty, tz + 0.6), (tx + 1.1, ty - 0.6, rz - 0.2)], 0.06, 6, 'copper', skey='rt')
    # витрина-лавка: тенты над витринами первого этажа (без вывесок)
    if shop:
        cloth = shop[0]
        n = max(2, int(round(W / 1.75)))
        bw = W / n
        for i in range(n):
            if i == n // 2 or (n >= 3 and (i == 0 or i == n - 1)):
                continue
            wx = x0 + (i + 0.5) * bw
            awning(mb, wx - bw / 2 + 0.12, wx + bw / 2 - 0.12, y0 - 0.06, Z1 + 2.3, y0 - 0.95, Z1 + 1.85, cloth, max(lod, 1), sag=0.03, valance=0.2)
    return [(0, 0, W, D + 2 * (ext - jetty), 2.6 * storeys + 0.55, 0.0)]


def make_house(W, D, roof, storeys, shop, seed, door_x=0.0, jetty=0.3, pitch=1.0):
    def build(lod):
        mb = MB()
        cols = house(mb, lod, W, D, roof, storeys, jetty, True, shop, pitch, door_x, seed)
        return mb, cols
    return build


# ============================================================
#  СКЛАД ДЕПО (дощатый сарай на каменном цоколе, ворота, таль)
# ============================================================
def build_warehouse(lod):
    mb = MB()
    W, D, Hh = 12.0, 8.0, 4.2
    Z0, Z1 = -1.0, 0.4
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    for a, b, n in (((x0, y0), (x1, y0), (0, -1, 0)), ((x1, y0), (x1, y1), (1, 0, 0)), ((x1, y1), (x0, y1), (0, 1, 0)), ((x0, y1), (x0, y0), (-1, 0, 0))):
        wall_rect(mb, a, b, Z0, Z1, 'stone', n, zref=Z0)
        wall_rect(mb, a, b, Z1, Z1 + Hh, 'plank', n, zref=Z1)
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (0, y0), (0, y1)):
        post(mb, x + (0.1 if x == x0 else -0.1 if x == x1 else 0), y + (0.1 if y == y0 else -0.1), Z1, Z1 + Hh, 0.22, 'timber', d=0.22)
    # ворота
    decal(mb, (-2.6, y0 - 0.015, Z1 + 1.55), (1, 0, 0), (0, 0, 1), 2.6, 3.1, 'door', (0, -1, 0))
    decal(mb, (2.6, y0 - 0.015, Z1 + 1.55), (1, 0, 0), (0, 0, 1), 2.6, 3.1, 'door', (0, -1, 0))
    for sx in (-1, 1):
        decal(mb, (sx * x1 + sx * 0.015, 0, Z1 + 2.6), (0, sx, 0), (0, 0, 1), 1.0, 0.9, 'window', (sx, 0, 0))
    # двускатная крыша
    ov, pitch = 0.5, 0.75
    z = Z1 + Hh
    rz = z + (D / 2) * pitch
    ex = W / 2 + ov
    for (ya, sgn) in ((y0 - ov, -1), (y1 + ov, 1)):
        ez = z - ov * pitch
        E = (-ex, ya, ez) if sgn < 0 else (ex, ya, ez)
        Rd = (1, 0, 0) if sgn < 0 else (-1, 0, 0)
        Ud = (0, 0 - ya, rz - ez)
        slope_plane(mb, E, Rd, Ud, 2 * ex, math.hypot(ya, rz - ez), 'roof_blue', (0, sgn * (rz - ez), abs(ya)))
    for xx, sx in ((x1, 1), (x0, -1)):
        A, B = ((xx, y0), (xx, y1)) if sx > 0 else ((xx, y1), (xx, y0))
        wall_profile(mb, A, B, z, [(0.0, z), (D / 2, rz), (D, z)], 'plank', (sx, 0, 0), zref=z)
    beam(mb, (-ex, 0, rz + 0.04), (ex, 0, rz + 0.04), 0.18, 0.14, 'timber')
    # таль над воротами и паровой вентилятор на крыше
    if lod <= 1:
        beam(mb, (0, y0 + 0.3, z - 0.2), (0, y0 - 1.6, z - 0.2), 0.16, 0.18)
        with place(mb, T(0, y0 - 1.45, z - 0.55)):
            lathe(mb, [(0.0, 0.0), (0.12, 0.05), (0.12, 0.2), (0.0, 0.25)], 8, cell='pal_dark_steel', cap_top=False)
        limb(mb, (0, y0 - 1.45, z - 0.55), (0, y0 - 1.45, Z1 + 1.2), 0.012, 0.012, 3, cell='pal_rope', caps=False)
        cbox(mb, 0, y0 - 1.45, Z1 + 0.6, 0.7, 0.7, 0.6, 'crate')
        with place(mb, T(3.0, 1.5, rz - 1.0)):
            lathe(mb, [(0.35, 0.0), (0.35, 1.4), (0.5, 1.6), (0.0, 1.8)], 8, strip='copper', u_units=0.3, cap_top=False, cap_bot=True)
    return mb, [(0, 0, W, D, Hh + 0.4, 0.0)]


# ============================================================
#  МОНУМЕНТ: мраморная статуя на ступенчатом постаменте, клумбы, живая изгородь
# ============================================================
def build_monument(lod):
    mb = MB()
    # три ступени-восьмиугольника и площадка с клумбами
    steps = ((5.2, -0.6, 0.25), (4.3, 0.25, 0.5), (3.5, 0.5, 0.75))
    for i, (r, z0, z1) in enumerate(steps):
        oct_ring_wall(mb, r, z0, z1, 'stone')
        r_in = steps[i + 1][0] if i + 1 < len(steps) else 0.0001
        oct_annulus(mb, r_in, r, z1, strip='stone')
    # клумбы по четырём сторонам нижней ступени
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cx, cy = 4.75 * math.cos(a + math.pi / 4), 4.75 * math.sin(a + math.pi / 4)
        with place(mb, T(cx, cy, 0.25) @ R('Z', a + math.pi / 4)):
            box(mb, 0, 0, 0.0, 0.6, 2.6, 0.22, 'stone', 'stone', top_cell='flowers')
    if lod == 0:
        for k in range(8):
            a = math.pi / 8 + k * math.pi / 4
            sphere(mb, (4.65 * math.cos(a), 4.65 * math.sin(a), 0.55), 0.38, 6, 4, 'pal_dark_green')
    # постамент: база, тело, карниз
    box(mb, 0, 0, 0.75, 2.4, 2.4, 0.35, 'stone', 'stone')
    box(mb, 0, 0, 1.1, 1.9, 1.9, 2.3, 'stone', 'stone')
    box(mb, 0, 0, 3.4, 2.3, 2.3, 0.3, 'stone', 'stone')
    box(mb, 0, 0, 3.7, 1.7, 1.7, 0.25, 'stone', 'stone')
    if lod <= 1:
        for sx in (-1, 1):
            for sy in (-1, 1):
                with place(mb, T(sx * 0.82, sy * 0.82, 1.1)):
                    lathe(mb, [(0.13, 0.0), (0.11, 0.25), (0.1, 2.05), (0.14, 2.3)], 8, cell='pal_white', cap_top=False)
    # статуя: белый мрамор
    with place(mb, T(0, 0, 3.95) @ S(1.35)):
        statue(mb, lod, cell='pal_white')
    return mb, [(0, 0, 10.4, 10.4, 1.0, -0.6, False, 'cylinder')]


# ============================================================
#  ЧАСОВАЯ БАШНЯ С ОТКРЫТЫМИ ШЕСТЕРНЯМИ
# ============================================================
def build_clock_tower(lod):
    mb = MB()
    seg = 10 if lod == 0 else 6
    box(mb, 0, 0, -1.0, 3.8, 3.8, 2.0, 'stone', 'stone')
    box(mb, 0, 0, 1.0, 3.2, 3.2, 8.2, 'stone', 'stone')
    if lod <= 1:
        for z in (3.6, 6.2):
            box(mb, 0, 0, z, 3.35, 3.35, 0.2, 'stone', 'stone')
        decal(mb, (0, -1.615, 2.0), (1, 0, 0), (0, 0, 1), 1.3, 2.2, 'door', (0, -1, 0))
    # часовой ярус: латунная обвязка и четыре циферблата
    box(mb, 0, 0, 9.2, 3.6, 3.6, 2.4, 'plaster', 'plaster')
    for zz in (9.2, 11.45):
        box(mb, 0, 0, zz, 3.7, 3.7, 0.15, 'brass', 'brass')
    for k in range(4):
        a = k * math.pi / 2
        n = (math.sin(a), -math.cos(a), 0)
        with place(mb, T(1.81 * n[0], 1.81 * n[1], 10.4) @ R('Z', a) @ R('X', math.pi / 2)):
            disc(mb, 0.95, 0.08, 16 if lod == 0 else 10, 'pal_gold', 'gauge')
    # открытые шестерни по бокам и маятник-паропровод
    if lod <= 1:
        for sx in (-1, 1):
            with place(mb, T(sx * 1.66, 0.6, 7.4) @ R('Z', sx * math.pi / 2) @ R('X', math.pi / 2)):
                gear_flat(mb, 0.85, 0.74, 0.25, 14 if lod == 0 else 10, 0.12, 'pal_gold', 'pal_dark_steel')
            with place(mb, T(sx * 1.66, -0.7, 6.6) @ R('Z', sx * math.pi / 2) @ R('X', math.pi / 2)):
                gear_flat(mb, 0.5, 0.42, 0.16, 10 if lod == 0 else 8, 0.12, 'pal_steel', 'pal_dark_steel')
        tube(mb, [(1.7, -1.2, 0.4), (1.7, -1.2, 8.8), (1.4, -1.5, 9.1)], 0.1, 8 if lod == 0 else 6, 'copper', skey='ct')
        with place(mb, T(1.7, -1.7, 2.0)):
            it_valve(mb, 0.22)
        with place(mb, T(1.7, -1.32, 3.0) @ R('X', math.pi / 2)):
            disc(mb, 0.22, 0.05, 10, 'pal_gold', 'gauge')
    # шатёр: шифер и латунный шпиль с паровыми свистками
    pyramid(mb, 0, 0, 11.6, 4.0, 4.0, 3.2, 'roof_blue')
    limb(mb, (0, 0, 14.6), (0, 0, 16.4), 0.07, 0.03, 6, cell='pal_gold')
    sphere(mb, (0, 0, 14.75), 0.22, 8, 4, 'pal_gold')
    if lod == 0:
        for sx in (-1, 1):
            limb(mb, (sx * 0.9, 0.9, 12.0), (sx * 0.9, 0.9, 13.6), 0.08, 0.08, 6, strip='brass')
            sphere(mb, (sx * 0.9, 0.9, 13.7), 0.12, 6, 3, 'pal_gold')
    return mb, [(0, 0, 3.8, 3.8, 11.0, -1.0)]


# ============================================================
#  ПАРОВОЙ НАСОС НАД КОЛОДЦЕМ, ПАРОПРОВОД НА ОПОРАХ
# ============================================================
def build_steam_pump(lod):
    mb = MB()
    oct_ring_wall(mb, 1.1, -0.6, 0.8, 'stone')
    oct_annulus(mb, 0.85, 1.1, 0.8, strip='stone')
    oct_ring_wall(mb, 0.85, 0.3, 0.8, 'stone', inward=True)
    oct_annulus(mb, 0.0001, 0.85, 0.35, cell='water')
    # рама и насос
    for sx in (-1, 1):
        beam(mb, (sx * 1.0, -0.2, 0.6), (sx * 0.2, -0.2, 2.6), 0.12, 0.12)
        beam(mb, (sx * 1.0, 0.2, 0.6), (sx * 0.2, 0.2, 2.6), 0.12, 0.12)
    beam(mb, (-0.3, 0, 2.6), (0.3, 0, 2.6), 0.5, 0.14)
    with place(mb, T(1.65, 0.0, 0.0)):
        cbox(mb, 0, 0, 0.0, 0.9, 0.9, 0.25, 'pal_dark_steel')
        lathe(mb, [(0.28, 0.25), (0.3, 0.35), (0.3, 1.45), (0.2, 1.6), (0.08, 1.7)], 10 if lod == 0 else 6, strip='copper', u_units=0.3, cap_top=True)
        if lod <= 1:
            for z in (0.6, 1.2):
                with place(mb, T(0, 0, z)):
                    lathe(mb, [(0.32, 0.0), (0.32, 0.08)], 10 if lod == 0 else 6, strip='brass', u_units=0.3, cap_top=False)
            decal(mb, (0, -0.305, 1.0), (1, 0, 0), (0, 0, 1), 0.26, 0.26, 'gauge', (0, -1, 0))
    if lod <= 1:
        with place(mb, T(1.65, 0.38, 1.25) @ R('X', math.pi / 2) @ T(0, 0, -0.05)):
            gear_flat(mb, 0.55, 0.47, 0.18, 12 if lod == 0 else 8, 0.08, 'pal_dark_steel', 'pal_gold')
        beam(mb, (1.65, 0.0, 1.75), (0.0, 0.0, 2.45), 0.06, 0.06, 'iron')
        tube(mb, [(0.0, 0.0, 2.45), (0.0, 0.0, 0.5)], 0.06, 6, 'copper', cap_a=False, skey='pp')
        tube(mb, [(1.35, 0.0, 0.5), (1.0, 0.0, 0.62), (0.6, -0.9, 0.62), (0.6, -1.4, 0.5)], 0.06, 6, 'copper', skey='sp')
        box(mb, 0.6, -1.75, 0.0, 1.4, 0.6, 0.45, 'plank', 'plank', top_cell='water')
    return mb, [(0.5, 0, 3.4, 2.4, 1.2, 0.0)]


def build_pipe_run(lod):
    """Паропровод на низких опорах вдоль улицы (8 м, растягивается по X)."""
    mb = MB()
    L, Hh = 8.0, 0.85
    for x in (-L / 2 + 0.6, L / 2 - 0.6):
        cbox(mb, x, 0, -0.2, 0.5, 0.5, 0.35, 'pal_canvas')
        beam(mb, (x - 0.2, 0, 0.15), (x, 0, Hh - 0.05), 0.08, 0.08, 'iron')
        beam(mb, (x + 0.2, 0, 0.15), (x, 0, Hh - 0.05), 0.08, 0.08, 'iron')
    seg = 8 if lod == 0 else 6
    tube(mb, [(-L / 2, 0, Hh + 0.1), (L / 2, 0, Hh + 0.1)], 0.14, seg, 'copper', skey='pr')
    if lod <= 1:
        for x in (-L / 2 + 0.15, 0.0, L / 2 - 0.15):
            with place(mb, T(x, 0, Hh + 0.1) @ R('Y', math.pi / 2) @ T(0, 0, -0.05)):
                lathe(mb, [(0.2, 0.0), (0.2, 0.1)], seg, strip='brass', u_units=0.2, cap_top=True, cap_bot=True, cap_cell='pal_gold')
        limb(mb, (1.6, 0, Hh + 0.2), (1.6, 0, Hh + 0.45), 0.04, 0.04, 6, cell='pal_gold')
        with place(mb, T(1.6, 0.0, Hh + 0.42) @ R('X', -math.pi / 2)):
            it_valve(mb, 0.14)
    return mb, []


# ============================================================
#  ПАРОВОЙ ФОНАРЬ, ВЫМПЕЛ, ГИРЛЯНДА
# ============================================================
def build_lamp(lod):
    mb = MB()
    seg = 8 if lod == 0 else 6
    box(mb, 0, 0, -0.45, 0.62, 0.62, 0.75, 'stone', 'stone')
    cbox(mb, 0, 0, 0.3, 0.5, 0.5, 0.08, 'pal_dark_steel')
    lathe(mb, [(0.16, 0.38), (0.13, 0.6), (0.09, 0.75), (0.075, 3.55)], seg, strip='iron', u_units=0.12, cap_top=False)
    if lod <= 1:
        for zb in (0.95, 2.3):
            with place(mb, T(0, 0, zb)):
                lathe(mb, [(0.11, 0.0), (0.11, 0.1)], seg, strip='brass', u_units=0.12, cap_top=False)
    # перекладина с двумя фонарями
    z = 3.4
    beam(mb, (-0.75, 0, z), (0.75, 0, z), 0.07, 0.07, 'iron')
    if lod <= 1:
        for sx in (-1, 1):
            beam(mb, (0, 0, z - 0.45), (sx * 0.55, 0, z - 0.03), 0.04, 0.04, 'iron')
    for sx in (-1, 1):
        if lod <= 1:
            beam(mb, (sx * 0.62, 0, z), (sx * 0.62, 0, z - 0.14), 0.02, 0.02, 'iron')
        lantern(mb, sx * 0.62, 0, z - 0.33, 1.05, lod)
    with place(mb, T(0, 0, 3.55)):
        lathe(mb, [(0.1, 0.0), (0.12, 0.08), (0.0, 0.38)], 6, cell='pal_gold', cap_top=False)
    # паровое питание: медная трубка вдоль столба от вентиля у земли, манометр
    if lod <= 1:
        tube(mb, [(0.18, -0.18, 0.38), (0.16, -0.16, 0.55), (0.11, -0.11, 0.9), (0.09, -0.09, 3.3)], 0.025, 5, 'copper', cap_a=False)
        with place(mb, T(0.2, -0.2, 0.38)):
            cbox(mb, 0, 0, 0, 0.16, 0.16, 0.12, 'pal_gold')
    # медный бак давления на столбе и большой манометр (стимпанк читается издалека)
    with place(mb, T(0, 0, 1.05)):
        lathe(mb, [(0.13, 0.0), (0.24, 0.08), (0.26, 0.55), (0.2, 0.68), (0.09, 0.74)], seg, strip='copper', u_units=0.25, cap_top=False, cap_bot=True)
    if lod <= 1:
        with place(mb, T(0, 0, 1.18)):
            lathe(mb, [(0.27, 0.0), (0.27, 0.06)], seg, strip='brass', u_units=0.25, cap_top=False)
        with place(mb, T(0, -0.25, 1.4) @ R('X', math.pi / 2)):
            disc(mb, 0.16, 0.05, 10, 'pal_gold', 'gauge')
    return mb, []


def build_banner(lod):
    mb = MB()
    box(mb, 0, 0, -0.35, 0.36, 0.36, 0.55, 'stone', 'stone')
    lathe(mb, [(0.06, 0.2), (0.045, 5.0)], 6 if lod <= 1 else 4, strip='iron', u_units=0.08, cap_top=False)
    with place(mb, T(0, 0, 5.0)):
        lathe(mb, [(0.06, 0.0), (0.07, 0.06), (0.0, 0.3)], 6, cell='pal_gold', cap_top=False)
    beam(mb, (0, 0, 4.72), (0.95, 0, 4.72), 0.05, 0.05, 'iron')
    # вымпел: полотнище с ласточкиным хвостом, двустороннее
    x0, x1 = 0.1, 0.9
    zt, zb, zn = 4.68, 3.05, 3.4
    pts = [(x0, -0.01, zt), (x1, -0.01, zt), (x1, -0.01, zb), ((x0 + x1) / 2, -0.01, zn), (x0, -0.01, zb)]
    uvs = [cuv('banner', 0, 1), cuv('banner', 1, 1), cuv('banner', 1, 0), cuv('banner', 0.5, (zn - zb) / (zt - zb)), cuv('banner', 0, 0)]
    two_sided(mb, pts, uvs, (0, -1, 0))
    # кольцо для гирлянды
    if lod <= 1:
        cbox(mb, 0, 0, 4.25, 0.12, 0.12, 0.06, 'pal_gold')
    return mb, []


BUNT_SPAN = 8.0
BUNT_Z = 4.28


def build_bunting(lod):
    mb = MB()
    n = 18 if lod == 0 else 9
    sag = 0.65
    cols = ['pal_red', 'pal_yellow', 'pal_blue', 'pal_green', 'pal_white', 'pal_orange']
    L = BUNT_SPAN

    def P(t):
        return (-L / 2 + L * t, 0.0, BUNT_Z - sag * 4 * t * (1 - t))
    rope = [P(i / 10) for i in range(11)]
    tube(mb, rope, 0.012, 3, 'iron', cap_a=False, cap_b=False)
    for k in range(n):
        t0 = (k + 0.15) / n
        t1 = (k + 0.85) / n
        a, b = P(t0), P(t1)
        m = P((t0 + t1) / 2)
        tip = (m[0], m[1], m[2] - 0.38)
        c = cols[k % len(cols)]
        two_sided(mb, [a, b, tip], [cuv(c, 0, 1), cuv(c, 1, 1), cuv(c, 0.5, 0)], (0, -1, 0))
    return mb, []


# ============================================================
#  ЯЩИКИ, БОЧКИ, МЕШКИ, СКАМЬЯ, ТЕЛЕЖКА С КОТЛОМ
# ============================================================
def build_crate(lod):
    mb = MB()
    cbox(mb, 0, 0, 0, 0.8, 0.8, 0.8, 'crate')
    return mb, []


def build_crates_stack(lod):
    mb = MB()
    cbox(mb, -0.42, 0, 0, 0.8, 0.8, 0.8, 'crate')
    with place(mb, T(0.45, 0.05, 0) @ R('Z', 0.2)):
        cbox(mb, 0, 0, 0, 0.75, 0.75, 0.75, 'crate')
    with place(mb, T(-0.3, 0.0, 0.8) @ R('Z', -0.25)):
        cbox(mb, 0, 0, 0, 0.62, 0.62, 0.62, 'crate')
    if lod <= 1:
        with place(mb, T(0.5, -0.05, 0.75) @ S(0.34, 0.24, 0.3)):
            lathe(mb, [(0.9, 0.0), (1.0, 0.4), (0.8, 0.9), (0.2, 1.1), (0.0, 1.15)], 6, cell='pal_burlap', cap_top=False)
    return mb, [(0, 0, 1.7, 0.85, 1.3, 0.0)]


def build_barrel(lod):
    mb = MB()
    seg = 12 if lod == 0 else (8 if lod == 1 else 6)
    lathe(mb, [(0.3, 0.0), (0.36, 0.25), (0.38, 0.45), (0.36, 0.65), (0.3, 0.9)], seg, strip='staves', u_units=0.25,
          cap_top=True, cap_cell='pal_brown')
    return mb, []


def build_sacks(lod):
    mb = MB()
    seg = 7 if lod == 0 else 5
    for i, (x, y, yaw, h) in enumerate(((-0.3, 0, 0.2, 0.62), (0.28, 0.05, -0.3, 0.55), (0.0, 0.32, 0.8, 0.5))):
        with place(mb, T(x, y, 0) @ R('Z', yaw) @ S(1.0, 0.8, 1.0)):
            lathe(mb, [(0.2, 0.0), (0.26, 0.12), (0.25, h * 0.6), (0.16, h * 0.88), (0.05, h), (0.07, h + 0.06)], seg, cell='pal_burlap', cap_top=True, cap_bot=False)
    return mb, []


def build_bench(lod):
    mb = MB()
    for x in (-0.8, 0.8):
        cbox(mb, x, -0.15, 0, 0.07, 0.07, 0.45, 'pal_dark_steel')
        cbox(mb, x, 0.2, 0, 0.07, 0.07, 0.95, 'pal_dark_steel')
        cbox(mb, x, 0.02, 0.4, 0.07, 0.48, 0.05, 'pal_dark_steel', bottom=True)
    for y in ((-0.14, 0.0, 0.14) if lod <= 1 else (0.0,)):
        box(mb, 0, y, 0.45, 1.9, 0.12 if lod <= 1 else 0.4, 0.045, 'plank', 'plank', bottom=True)
    with place(mb, T(0, 0.22, 0.75) @ R('X', -0.15)):
        box(mb, 0, 0, 0, 1.9, 0.04, 0.22, 'plank', 'plank', bottom=True)
    return mb, []


def build_kettle_cart(lod):
    """Тележка-кухня: медный котёл на тагане, труба с колпаком, манометр, два колеса."""
    mb = MB()
    box(mb, 0, 0, 0.45, 1.7, 0.95, 0.12, 'plank', 'plank', bottom=True)
    for x in (-0.75, 0.75):
        for y in (-0.42, 0.42):
            if not (x < 0):
                continue
            cbox(mb, x, y, 0.0, 0.07, 0.07, 0.45, 'pal_brown')
    for y in (-0.55, 0.55):
        with place(mb, T(0.45, y, 0.34) @ R('X', math.pi / 2) @ T(0, 0, -0.03)):
            disc(mb, 0.34, 0.06, 10 if lod == 0 else 6, 'pal_brown', 'pal_leather')
    limb(mb, (-0.85, -0.3, 0.57), (-1.4, -0.32, 0.75), 0.03, 0.03, 5, cell='pal_brown')
    limb(mb, (-0.85, 0.3, 0.57), (-1.4, 0.32, 0.75), 0.03, 0.03, 5, cell='pal_brown')
    with place(mb, T(0.1, 0, 0.57)):
        lathe(mb, [(0.32, 0.0), (0.38, 0.12), (0.4, 0.55), (0.3, 0.72), (0.12, 0.78)], 10 if lod == 0 else 6, strip='copper', u_units=0.3, cap_top=True)
        if lod <= 1:
            lathe(mb, [(0.41, 0.3), (0.41, 0.38)], 10 if lod == 0 else 6, strip='brass', u_units=0.3, cap_top=False)
    tube(mb, [(0.1, 0, 1.33), (0.1, 0, 1.9)], 0.06, 6, 'copper', cap_a=False)
    with place(mb, T(0.1, 0, 1.88)):
        lathe(mb, [(0.08, 0.0), (0.16, 0.08), (0.0, 0.22)], 6, cell='pal_dark_steel', cap_top=False, cap_bot=True)
    if lod <= 1:
        decal(mb, (0.1, -0.405, 0.95), (1, 0, 0), (0, 0, 1), 0.22, 0.22, 'gauge', (0, -1, 0))
        for x in (-0.55, -0.3):
            with place(mb, T(x, -0.15, 0.57)):
                lathe(mb, [(0.09, 0.0), (0.1, 0.12)], 8, cell='pal_cream', cap_top=True, cap_cell='pal_bread')
    return mb, [(0, 0, 1.8, 1.1, 1.3, 0.0)]


# ============================================================
#  СТИМПАНК КРУПНО: котёл с топкой, паровой тягач, трубопровод на козлах
# ============================================================
def build_steam_boiler(lod):
    """Рыночный паровой котёл: клёпаный медный цилиндр, топка с огнём, манометры,
    вентили, дымовая труба с латунной короной, магистрали в землю."""
    mb = MB()
    seg = 14 if lod == 0 else (10 if lod == 1 else 8)
    box(mb, 0, 0, -0.5, 2.6, 2.6, 0.85, 'stone', 'stone')
    cbox(mb, 0, 0, 0.35, 2.2, 2.2, 0.1, 'pal_dark_steel')
    with place(mb, T(0, 0, 0.45)):
        lathe(mb, [(1.05, 0.0), (1.1, 0.12), (1.1, 2.9), (0.95, 3.25), (0.55, 3.5), (0.25, 3.58)], seg, strip='copper', u_units=1.0,
              cap_top=True, cap_cell='pal_dark_steel', skey='bl')
        if lod <= 1:
            for z in (0.5, 1.5, 2.5):
                with place(mb, T(0, 0, z)):
                    lathe(mb, [(1.13, 0.0), (1.13, 0.14)], seg, strip='brass', u_units=1.0, cap_top=False)
    # топка: железная дверца с горящим окном
    cbox(mb, 0, -1.1, 0.5, 0.9, 0.18, 0.8, 'pal_dark_steel')
    decal(mb, (0, -1.195, 0.85), (1, 0, 0), (0, 0, 1), 0.6, 0.38, 'glow', (0, -1, 0))
    # манометры: большой спереди сверху, два по бокам
    for (a, z, r) in ((0.0, 2.3, 0.3), (0.55, 1.6, 0.22), (-0.55, 1.6, 0.22)):
        with place(mb, T(1.12 * math.sin(a), -1.12 * math.cos(a), z) @ R('Z', a) @ R('X', math.pi / 2)):
            disc(mb, r, 0.06, 12 if lod == 0 else 8, 'pal_gold', 'gauge')
    if lod <= 1:
        for sx in (-1, 1):
            with place(mb, T(sx * 1.15, -0.3, 1.0) @ R('Z', sx * math.pi / 2)):
                it_valve(mb, 0.2)
        # магистрали в землю по бокам
        for sx in (-1, 1):
            tube(mb, [(sx * 1.05, 0.4, 1.2), (sx * 1.6, 0.4, 1.2), (sx * 1.9, 0.4, 0.8), (sx * 1.9, 0.4, -0.2)], 0.12,
                 8 if lod == 0 else 6, 'copper', skey='bm%d' % sx)
            with place(mb, T(sx * 1.9, 0.4, 0.35)):
                lathe(mb, [(0.18, 0.0), (0.18, 0.1)], 8, strip='brass', u_units=0.2, cap_top=False)
        # предохранительный клапан-свисток
        limb(mb, (0.45, 0.3, 3.75), (0.45, 0.3, 4.3), 0.05, 0.05, 6, cell='pal_gold')
        sphere(mb, (0.45, 0.3, 4.36), 0.1, 6, 4, 'pal_gold')
    # дымовая труба с короной
    limb(mb, (0, 0, 3.9), (0, 0, 7.2), 0.26, 0.22, seg, strip='iron')
    with place(mb, T(0, 0, 7.1)):
        lathe(mb, [(0.24, 0.0), (0.4, 0.25), (0.42, 0.45), (0.3, 0.5)], seg, cell='pal_gold', cap_top=True, cap_cell='dark')
    if lod == 0:
        # уголь и лопата у топки
        for (x, y) in ((-0.75, -1.45), (-0.45, -1.6), (-0.95, -1.7)):
            sphere(mb, (x, y, 0.1), 0.16, 5, 3, 'pal_black')
        beam(mb, (0.55, -1.5, 0.0), (0.8, -1.3, 1.1), 0.04, 0.04, 'timber')
    return mb, [(0, 0, 2.6, 2.6, 4.0, -0.5, False, 'cylinder')]


def build_steam_wagon(lod):
    """Паровой тягач: котёл на раме, дымовая труба, большие ведущие колёса, маховик, будка."""
    mb = MB()
    seg = 12 if lod == 0 else 8
    cbox(mb, 0, 0, 0.55, 4.0, 1.3, 0.25, 'pal_dark_steel', bottom=True)
    with place(mb, T(-1.1, 0, 1.35) @ R('Y', math.pi / 2)):
        lathe(mb, [(0.0, 0.0), (0.6, 0.02), (0.6, 2.4), (0.62, 2.45), (0.62, 2.9)], seg, strip='copper', u_units=0.6,
              cap_top=True, cap_cell='pal_dark_steel', skey='wb')
    if lod <= 1:
        for x in (-0.6, 0.3, 1.1):
            with place(mb, T(x, 0, 1.35) @ R('Y', math.pi / 2)):
                lathe(mb, [(0.63, 0.0), (0.63, 0.1)], seg, strip='brass', u_units=0.6, cap_top=False)
        sphere(mb, (0.2, 0, 1.98), 0.22, 8, 4, 'pal_gold')
    limb(mb, (1.5, 0, 1.9), (1.5, 0, 3.4), 0.16, 0.18, seg, strip='iron')
    with place(mb, T(1.5, 0, 3.35)):
        lathe(mb, [(0.18, 0.0), (0.32, 0.18), (0.3, 0.3)], seg, cell='pal_gold', cap_top=True, cap_cell='dark')
    for y in (-0.82, 0.82):
        with place(mb, T(-1.35, y, 1.0) @ R('X', math.pi / 2) @ T(0, 0, -0.1)):
            disc(mb, 1.0, 0.2, 16 if lod == 0 else 10, 'pal_dark_steel', 'pal_brown')
            if lod == 0:
                with place(mb, T(0, 0, 0.2 if y < 0 else -0.04)):
                    gear_flat(mb, 0.55, 0.47, 0.18, 10, 0.03, 'pal_gold', 'pal_dark_steel')
        with place(mb, T(1.4, y, 0.5) @ R('X', math.pi / 2) @ T(0, 0, -0.08)):
            disc(mb, 0.5, 0.16, 12 if lod == 0 else 8, 'pal_dark_steel', 'pal_brown')
    if lod <= 1:
        with place(mb, T(-0.3, -0.75, 2.0) @ R('X', math.pi / 2) @ T(0, 0, -0.05)):
            gear_flat(mb, 0.55, 0.47, 0.2, 12 if lod == 0 else 8, 0.1, 'pal_gold', 'pal_dark_steel')
        limb(mb, (-0.3, -0.7, 2.0), (0.5, -0.66, 1.5), 0.04, 0.04, 5, cell='pal_steel')
    for x, y in ((-2.0, -0.6), (-2.0, 0.6), (-1.2, -0.6), (-1.2, 0.6)):
        post(mb, x, y, 0.8, 3.0, 0.08)
    box(mb, -1.6, 0, 3.0, 1.2, 1.5, 0.08, 'plank', 'plank', bottom=True)
    if lod <= 1:
        decal(mb, (-1.16, 0.0, 2.1), (0, 1, 0), (0, 0, 1), 0.4, 0.4, 'gauge', (1, 0, 0))
        cbox(mb, -1.75, 0, 0.8, 0.6, 1.1, 0.5, 'crate')
    return mb, [(0, 0, 4.2, 2.0, 2.4, 0.0)]


def build_pipe_span(lod):
    """Паропровод над проходом: медная труба на двух железных козлах (пролёт 8 м, высота 3.4 м)."""
    mb = MB()
    L, Hh = 8.0, 3.4
    for sx in (-1, 1):
        x = sx * L / 2
        for dy in (-0.45, 0.45):
            beam(mb, (x, dy, -0.3), (x, dy * 0.25, Hh), 0.1, 0.1, 'iron')
        beam(mb, (x, -0.3, 1.2), (x, 0.3, 1.2), 0.07, 0.07, 'iron')
        cbox(mb, x, 0, Hh - 0.05, 0.3, 0.5, 0.1, 'pal_dark_steel', bottom=True)
    seg = 10 if lod == 0 else 6
    tube(mb, [(-L / 2 - 0.4, 0, Hh + 0.2), (L / 2 + 0.4, 0, Hh + 0.2)], 0.16, seg, 'copper', skey='ps')
    if lod <= 1:
        for x in (-2.7, 0.0, 2.7):
            with place(mb, T(x, 0, Hh + 0.2) @ R('Y', math.pi / 2) @ T(0, 0, -0.06)):
                lathe(mb, [(0.22, 0.0), (0.22, 0.12)], seg, strip='brass', u_units=0.25, cap_top=True, cap_bot=True, cap_cell='pal_gold')
        limb(mb, (1.2, 0, Hh + 0.05), (1.2, 0, Hh - 0.35), 0.05, 0.05, 6, cell='pal_gold')
        with place(mb, T(1.2, 0, Hh - 0.75)):
            it_valve(mb, 0.22)
        with place(mb, T(-1.2, -0.17, Hh + 0.2) @ R('X', math.pi / 2)):
            disc(mb, 0.18, 0.05, 10, 'pal_gold', 'gauge')
    return mb, []


# ============================================================
#  СРЕДНЕВЕКОВЫЙ БЫТ: столы с товаром, забор, тележка
# ============================================================
def table_base(mb, w=2.0, d=0.9, h=0.85):
    for x in (-w / 2 + 0.15, w / 2 - 0.15):
        beam(mb, (x, -d / 2 + 0.1, 0.0), (x, 0.0, h - 0.05), 0.07, 0.07)
        beam(mb, (x, d / 2 - 0.1, 0.0), (x, 0.0, h - 0.05), 0.07, 0.07)
    box(mb, 0, 0, h - 0.05, w, d, 0.06, 'plank', 'plank', bottom=True)


def sack(mb, x, y, yaw=0.0, h=0.55):
    with place(mb, T(x, y, 0.0) @ R('Z', yaw) @ S(1.0, 0.8, 1.0)):
        lathe(mb, [(0.2, 0.0), (0.26, 0.12), (0.25, h * 0.6), (0.16, h * 0.88), (0.05, h), (0.07, h + 0.06)], 6, cell='pal_burlap', cap_top=True)


def build_table_produce(lod):
    mb = MB()
    table_base(mb)
    z = 0.86
    if lod <= 1:
        at(mb, -0.6, 0.1, z, 0.1, it_basket, 'pal_apple')
        at(mb, 0.05, -0.1, z, -0.2, it_basket, 'pal_cabbage', 0.4, 0.3, 0.16, 0.1, False)
        at(mb, 0.65, 0.12, z, 0.3, it_basket, 'pal_carrot')
        sack(mb, -1.35, 0.1, 0.3)
        cbox(mb, 1.25, -0.2, 0.0, 0.5, 0.5, 0.45, 'crate')
    else:
        cbox(mb, 0, 0, z, 1.6, 0.6, 0.15, 'pal_apple')
    return mb, []


def build_table_wares(lod):
    mb = MB()
    table_base(mb, 2.2, 0.9)
    z = 0.86
    if lod <= 1:
        with place(mb, T(-0.75, 0.0, z)):
            lathe(mb, [(0.12, 0.0), (0.18, 0.12), (0.17, 0.25), (0.08, 0.3), (0.05, 0.4)], 8, strip='copper', u_units=0.15, cap_top=True)
        with place(mb, T(-0.35, 0.15, z)):
            lathe(mb, [(0.1, 0.0), (0.14, 0.1), (0.12, 0.2), (0.06, 0.24)], 8, cell='pal_gold', cap_top=True)
        at(mb, 0.15, -0.1, z, 0.0, it_gear, 0.15, 10, 'pal_gold', False)
        at(mb, 0.55, 0.1, z, 0.4, it_wrench, 0.45)
        at(mb, 0.85, -0.15, z, 0.0, it_gauge, 0.09)
        at(mb, 0.1, 0.2, z, 0.0, it_cards, 2, 'pal_blueprint')
        cbox(mb, -1.35, 0.1, 0.0, 0.55, 0.55, 0.5, 'crate')
    else:
        cbox(mb, 0, 0, z, 1.8, 0.6, 0.12, 'pal_gold')
    return mb, []


def build_fence(lod):
    """Деревенский забор 3 м: столбы, две жерди, неровный штакетник."""
    mb = MB()
    r = random.Random(77)
    for x in (-1.45, 0.0, 1.45):
        post(mb, x, 0, -0.3, 1.15 + r.uniform(-0.05, 0.08), 0.1)
    for z in (0.35, 0.85):
        beam(mb, (-1.5, 0.06, z), (1.5, 0.06, z + r.uniform(-0.05, 0.05)), 0.06, 0.06)
    if lod <= 1:
        n = 11 if lod == 0 else 6
        for i in range(n):
            x = -1.35 + 2.7 * i / (n - 1)
            h = 0.95 + r.uniform(-0.12, 0.1)
            with place(mb, T(x, 0.11, 0.0) @ R('Y', r.uniform(-0.06, 0.06))):
                cbox(mb, 0, 0, 0.0, 0.11, 0.025, h, 'pal_brown')
    return mb, []


def build_handcart(lod):
    mb = MB()
    box(mb, 0, 0, 0.55, 1.6, 0.95, 0.08, 'plank', 'plank', bottom=True)
    for y in (-0.47, 0.47):
        box(mb, 0, y, 0.63, 1.6, 0.05, 0.32, 'plank', 'plank')
    for y in (-0.6, 0.6):
        with place(mb, T(0.1, y, 0.42) @ R('X', math.pi / 2) @ T(0, 0, -0.04)):
            disc(mb, 0.42, 0.08, 12 if lod == 0 else 8, 'pal_brown', 'pal_leather')
    for y in (-0.35, 0.35):
        beam(mb, (-0.75, y, 0.6), (-1.6, y, 0.85), 0.06, 0.06)
    cbox(mb, -1.45, 0, 0.0, 0.08, 0.08, 0.6, 'pal_brown')
    if lod <= 1:
        for i, (x, y) in enumerate(((0.35, -0.2), (-0.2, 0.2), (0.4, 0.25))):
            with place(mb, T(x, y, 0.63)):
                sack(mb, 0, 0, i * 0.7, 0.45)
        cbox(mb, -0.35, -0.2, 0.63, 0.5, 0.45, 0.4, 'crate')
    return mb, []



# ============================================================
#  Каменная площадь рынка — модель по рельефу (форма: plaza_shape.py, кольцо: market-roads.json)
# ============================================================
PLAZA_LIFT = 0.08          # над землёй: без мерцания с террейном, предметы чуть «утоплены» в камень
_PLAZA = {}


def plaza_ctx():
    if not _PLAZA:
        if HERE not in sys.path:
            sys.path.insert(0, HERE)
        import plaza_shape
        import terrain_uv
        roads = json.load(open(os.path.join(HERE, 'market-roads.json'), encoding='utf-8'))
        _PLAZA['pz'] = plaza_shape.Plaza(roads)
        _PLAZA['tuv'] = terrain_uv.TerrainUV()
        _PLAZA['clip'] = plaza_shape.clip_poly
    return _PLAZA


def plaza_src():
    """Ключ кольца, под которое собрана площадь (layout_market.js сверяет его перед расстановкой)."""
    path = os.path.join(HERE, 'market-roads.json')
    if not os.path.exists(path):
        return {}
    r = json.load(open(path, encoding='utf-8'))
    ring = [x for x in r['roads'] if x['kind'] == 'ring'][0]
    return {'cx': r['C']['x'], 'cz': r['C']['z'], 'r0': ring['pts'][0]}


# Мощение — только фото-текстуры (paving_textures.py): плиты как у дорог автора, брусчатка Poly Haven (CC0).
# Отдельный материал и отдельный узел на каждый вид камня: у GLB-узла с двумя материалами
# GLTFLoader делит меш на подмеши с другими именами, и LOD узлов (_LOD1/_LOD2) теряется.
PAVE_MAT = {'flags': 'mkt_paving_flags', 'setts': 'mkt_paving_cobble'}
PAVE_TILE = {'flags': 5.0, 'setts': 2.6}       # м на повтор текстуры: плиты ~0.4 м, булыжник ~0.27 м


def pave_parts(mbs):
    return [('' if k == 'flags' else '_cobble', mbs[k], PAVE_MAT[k]) for k in ('flags', 'setts') if mbs[k].f]


def pave_grid(mbs, region, split, origin, bbox, lod, lift):
    """Мощение по рельефу: сетка в мировых XZ, клетки на краю отсекаются по region(p) < 0, split(P)
    делит клетку на куски [(многоугольник, 'setts'|'flags')]. UV — в метрах мира / PAVE_TILE
    (текстура повторяется по обеим осям). Вершины в мировых высотах меша террейна + lift(x, z)."""
    import numpy as np
    T = plaza_ctx()['tuv']
    cw = (2.0, 4.0, 8.0)[lod]
    cx, cz = origin
    x0, x1, z0, z1 = bbox
    gx0 = math.floor(x0 / 8.0) * 8.0
    gz0 = math.floor(z0 / 8.0) * 8.0
    nx = int(math.ceil((x1 - gx0) / cw))
    nz = int(math.ceil((z1 - gz0) / cw))
    clip = plaza_ctx()['clip']
    pieces = []
    for j in range(nz):
        za, zb = gz0 + j * cw, gz0 + (j + 1) * cw
        for i in range(nx):
            xa, xb = gx0 + i * cw, gx0 + (i + 1) * cw
            P = clip([(xa, za), (xb, za), (xb, zb), (xa, zb)], region)
            if len(P) < 3:
                continue
            for part, kind in split(P):
                if len(part) >= 3:
                    pieces.append((part, kind))
    pts = sorted({(round(x, 4), round(z, 4)) for part, _ in pieces for (x, z) in part})
    hy = T.heights(np.array([p[0] for p in pts]), np.array([p[1] for p in pts]))
    H = {p: float(y) + lift(p[0], p[1]) for p, y in zip(pts, hy)}
    for part, kind in pieces:
        tile = PAVE_TILE[kind]
        p3 = [(x - cx, -(z - cz), H[(round(x, 4), round(z, 4))]) for (x, z) in part]
        uvs = [((x - gx0) / tile, -(z - gz0) / tile) for (x, z) in part]
        mbs[kind].poly(p3, uvs, outward=(0, 0, 1), smooth=True, skey='plz')


def build_plaza_stone(lod):
    """Плиты внутри кольца (фото-плиты, как у дорог автора), кольцевая улица и круг у фонтана —
    булыжник (фото, Poly Haven CC0); по краю — юбка в землю."""
    import numpy as np
    ctx = plaza_ctx()
    pz, T, clip = ctx['pz'], ctx['tuv'], ctx['clip']
    mbs = {'flags': MB(), 'setts': MB()}
    fo = lambda p: float(pz.field_outer(p[0], p[1]))
    fi = lambda p: float(pz.field_inner(p[0], p[1]))
    ff = lambda p: float(pz.field_fountain(p[0], p[1]))

    def split(P):
        inner = clip(P, fi)
        return [(clip(P, lambda p: -fi(p)), 'setts'), (clip(inner, ff), 'setts'), (clip(inner, lambda p: -ff(p)), 'flags')]
    pave_grid(mbs, fo, split, pz.C, pz.bbox(), lod, lambda x, z: PLAZA_LIFT)
    mb = mbs['setts']
    tile = PAVE_TILE['setts']
    cx, cz = pz.C
    # юбка по краю: камень уходит в землю на 0.3 м — с низкой камеры не видно щели
    n = (720, 360, 180)[lod]
    a = np.linspace(0, 2 * math.pi, n + 1)
    r = pz.outer(a) - 0.03
    ex, ez = cx + r * np.cos(a), cz + r * np.sin(a)
    ey = T.heights(ex, ez)
    s_acc = 0.0
    for i in range(n):
        A = (ex[i], ez[i], ey[i])
        B = (ex[i + 1], ez[i + 1], ey[i + 1])
        L = math.hypot(B[0] - A[0], B[1] - A[1])
        u0, u1 = s_acc / tile, (s_acc + L) / tile
        s_acc += L
        am = (a[i] + a[i + 1]) / 2
        mb.poly([(A[0] - cx, -(A[1] - cz), A[2] - 0.3), (B[0] - cx, -(B[1] - cz), B[2] - 0.3),
                 (B[0] - cx, -(B[1] - cz), B[2] + PLAZA_LIFT), (A[0] - cx, -(A[1] - cz), A[2] + PLAZA_LIFT)],
                [(u0, 0.0), (u1, 0.0), (u1, 0.38 / tile), (u0, 0.38 / tile)],
                outward=(math.cos(am), -math.sin(am), 0))
    return pave_parts(mbs), []


# ============================================================
#  Парк между рынком и нижней дорогой автора
# ============================================================
def park_src():
    path = os.path.join(HERE, 'market-roads.json')
    if not os.path.exists(path):
        return {}
    pk = json.load(open(path, encoding='utf-8')).get('parkPaving')
    return {'ox': pk['c'][0], 'oz': pk['c'][1], 'n': len(pk['paths']), 'p0': pk['paths'][0]['pts'][-1]} if pk else {}


def build_park_paving(lod):
    """Дорожки парка: каменный круг у фонтана (плиты) и дорожки-лучи брусчаткой. Край без юбки —
    у кромки камень опускается до +2 см над землёй и сливается с газоном."""
    ctx = plaza_ctx()
    if 'park' not in ctx:
        import plaza_shape
        roads = json.load(open(os.path.join(HERE, 'market-roads.json'), encoding='utf-8'))
        ctx['park'] = plaza_shape.ParkPaving(roads['parkPaving'])
    pk, clip = ctx['park'], ctx['clip']
    mbs = {'flags': MB(), 'setts': MB()}
    fc = lambda p: float(pk.field_circle(p[0], p[1]))
    fa = lambda p: float(pk.field(p[0], p[1]))

    def split(P):
        return [(clip(P, fc), 'flags'), (clip(P, lambda p: -fc(p)), 'setts')]

    def lift(x, z):
        t = max(0.0, min(1.0, -float(pk.field(x, z)) / 0.6))
        return 0.02 + 0.03 * t * t * (3 - 2 * t)
    pave_grid(mbs, fa, split, pk.c, pk.bbox(), lod, lift)
    return pave_parts(mbs), []


def build_park_fountain(lod):
    """Фонтан парка: двенадцатигранная каменная чаша в кольце клумбы, на постаменте — чугунная колонна
    с тремя чашами-ярусами (латунные ободья, струйки воды), шестерни, медные изливы, латунная корона."""
    mb = MB()
    seg = 12 if lod == 0 else 8
    rs = 16 if lod == 0 else (10 if lod == 1 else 8)
    # клумба в низком бордюре вокруг чаши
    oct_ring_wall(mb, 4.55, -0.5, 0.28, 'stone', seg=seg)
    oct_annulus(mb, 4.3, 4.55, 0.28, strip='stone', seg=seg)
    oct_annulus(mb, 3.65, 4.3, 0.22, cell='flowers', seg=seg)
    # чаша: стенка, широкий камень бортика, вода
    oct_ring_wall(mb, 3.65, 0.2, 0.62, 'stone', seg=seg)
    oct_annulus(mb, 3.2, 3.65, 0.62, strip='stone', seg=seg)
    oct_ring_wall(mb, 3.2, 0.36, 0.62, 'stone', inward=True, seg=seg)
    oct_annulus(mb, 0.95, 3.2, 0.4, cell='water', seg=seg)
    if lod == 0:
        for k in range(6):
            a = 2 * math.pi * k / 6 + math.pi / 6
            sphere(mb, (3.98 * math.cos(a), 3.98 * math.sin(a), 0.25), 0.26, 6, 4, 'pal_dark_green')
    # каменный постамент с медными изливами и манометрами
    with place(mb, R('Z', math.pi / 8)):
        lathe(mb, [(0.95, 0.3), (0.95, 0.82), (0.78, 0.98), (0.62, 1.15)], 8, strip='stone', u_units=1.0, cap_top=True,
              cap_cell='pal_canvas')
        lathe(mb, [(0.97, 0.66), (0.97, 0.76)], 8, strip='brass', u_units=1.0, cap_top=False)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c, sn = math.cos(a), math.sin(a)
        p0 = (0.8 * c, 0.8 * sn, 0.92)
        tube(mb, [p0, (1.3 * c, 1.3 * sn, 1.05), (1.75 * c, 1.75 * sn, 0.92), (1.95 * c, 1.95 * sn, 0.72)], 0.065,
             8 if lod == 0 else 6, 'copper', skey='psp%d' % k)
        if lod <= 1:
            limb(mb, (1.97 * c, 1.97 * sn, 0.69), (2.05 * c, 2.05 * sn, 0.4), 0.04, 0.07, 6, cell='water', caps=False)
            a2 = a + math.pi / 4
            with place(mb, T(0.9 * math.cos(a2), 0.9 * math.sin(a2), 0.42) @ R('Z', a2 + math.pi / 2)):
                it_gauge(mb, 0.1)
    # чугунная колонна с латунными кольцами
    lathe(mb, [(0.3, 1.15), (0.24, 1.6), (0.2, 4.25)], rs, strip='iron', u_units=0.6, cap_top=False)
    for z in (1.4, 2.75, 3.7):
        lathe(mb, [(0.25, z), (0.29, z + 0.05), (0.25, z + 0.1)], rs, strip='brass', u_units=0.5, cap_top=False)
    # три чаши-яруса: чугун снаружи, вода сверху, латунный обод, струйки до яруса ниже
    tiers = [(1.6, 1.95, 0.4), (1.05, 3.1, 2.05), (0.6, 3.98, 3.2)]
    for i, (rb, zb, z_low) in enumerate(tiers):
        prof = [(0.22, zb - 0.32), (rb * 0.55, zb - 0.22), (rb * 0.9, zb - 0.08), (rb, zb)]
        lathe(mb, prof, rs, cell='pal_dark_steel', cap_top=False, skey='pt%d' % i)
        with place(mb, T(0, 0, zb - 0.05)):
            disc(mb, rb * 0.96, 0.02, rs, 'water', 'water')
        lathe(mb, [(rb - 0.03, zb - 0.02), (rb + 0.05, zb + 0.03), (rb - 0.02, zb + 0.06)], rs, strip='brass', u_units=0.8,
              cap_top=False, skey='pr%d' % i)
        if lod <= 1:
            # струйки с обода в ярус ниже (не сплошная завеса — чугун и латунь видны)
            ns = (10, 7, 5)[i] if lod == 0 else (5, 4, 3)[i]
            for q in range(ns):
                a = 2 * math.pi * (q + 0.5 * i) / ns
                c, sn = math.cos(a), math.sin(a)
                limb(mb, ((rb + 0.04) * c, (rb + 0.04) * sn, zb + 0.02), ((rb + 0.2) * c, (rb + 0.2) * sn, z_low + 0.04),
                     0.025, 0.045, 5, cell='water', caps=False, skey='pw%d_%d' % (i, q))
    # шестерни: две на колонне (вертикальные), латунная корона сверху
    for k, (z, r_) in enumerate(((2.45, 0.42), (3.5, 0.3))):
        a = k * math.pi / 2 + 0.4
        with place(mb, T(0.22 * math.cos(a), 0.22 * math.sin(a), z) @ R('Z', a) @ R('Y', math.pi / 2)):
            gear_flat(mb, r_, r_ * 0.82, r_ * 0.35, 10 if lod == 0 else 8, 0.05, 'pal_gold', 'pal_dark_steel')
    with place(mb, T(0, 0, 4.25)):
        gear_flat(mb, 0.46, 0.37, 0.16, 12 if lod == 0 else 8, 0.08, 'pal_gold', 'pal_dark_steel')
    lathe(mb, [(0.12, 4.33), (0.1, 4.6), (0.0, 4.9)], 8, cell='pal_gold', cap_top=False)
    sphere(mb, (0, 0, 4.95), 0.1, 8, 5, 'pal_gold')
    return mb, [(0, 0, 9.1, 9.1, 1.0, -0.5, False, 'cylinder')]


def build_flowerbed(lod):
    """Клумба в каменном бордюре: цветы, в середине куст-шар."""
    mb = MB()
    seg = 12 if lod == 0 else 8
    oct_ring_wall(mb, 1.7, -0.35, 0.3, 'stone', seg=seg)
    oct_annulus(mb, 1.48, 1.7, 0.3, strip='stone', seg=seg)
    oct_ring_wall(mb, 1.48, 0.18, 0.3, 'stone', inward=True, seg=seg)
    oct_annulus(mb, 0.0, 1.48, 0.22, cell='flowers', seg=seg)
    sphere(mb, (0, 0, 0.4), 0.45 if lod == 0 else 0.4, 8 if lod == 0 else 6, 5 if lod == 0 else 4, 'pal_dark_green')
    if lod == 0:
        for k in range(5):
            a = 2 * math.pi * k / 5
            sphere(mb, (0.95 * math.cos(a), 0.95 * math.sin(a), 0.3), 0.2, 6, 4, 'pal_green')
    return mb, []


PIECES = []
for cls in STALLS:
    PIECES.append(('mkt_stall_' + cls, make_stall(cls), {'drawDist': 300, 'lodDist': [40, 95]}))
PIECES += [
    ('mkt_fountain', build_fountain, {'drawDist': 520, 'lodDist': [70, 170]}),
    ('mkt_pavilion', build_pavilion, {'drawDist': 520, 'lodDist': [70, 170]}),
    ('mkt_house_red', make_house(8.0, 6.0, 'roof_red', 2, None, 11, door_x=-1.0), {'drawDist': 700, 'lodDist': [80, 200]}),
    ('mkt_house_blue', make_house(6.5, 5.6, 'roof_blue', 2, ('stripes_blue', 'emb_supplies'), 13, door_x=1.6, jetty=0.25, pitch=1.15), {'drawDist': 700, 'lodDist': [80, 200]}),
    ('mkt_house_green', make_house(11.0, 6.0, 'roof_green', 1, ('stripes_red', 'emb_food'), 17, door_x=0.0, jetty=0.0, pitch=0.9), {'drawDist': 700, 'lodDist': [80, 200]}),
    ('mkt_lamp', build_lamp, {'drawDist': 260, 'lodDist': [40, 100]}),
    ('mkt_banner', build_banner, {'drawDist': 260, 'lodDist': [45, 110], 'shadow': False}),
    ('mkt_bunting', build_bunting, {'drawDist': 180, 'lodDist': [40, 90], 'shadow': False}),
    ('mkt_crate', build_crate, {'drawDist': 150, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_crates_stack', build_crates_stack, {'drawDist': 180, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_barrel', build_barrel, {'drawDist': 150, 'lodDist': [30, 70], 'shadow': False}),
    ('mkt_sacks', build_sacks, {'drawDist': 140, 'lodDist': [30, 70], 'shadow': False}),
    ('mkt_bench', build_bench, {'drawDist': 150, 'lodDist': [30, 70], 'shadow': False}),
    ('mkt_kettle_cart', build_kettle_cart, {'drawDist': 220, 'lodDist': [40, 95]}),
    ('mkt_steam_boiler', build_steam_boiler, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('mkt_steam_wagon', build_steam_wagon, {'drawDist': 320, 'lodDist': [45, 110]}),
    ('mkt_pipe_span', build_pipe_span, {'drawDist': 300, 'lodDist': [45, 110]}),
    ('mkt_table_produce', build_table_produce, {'drawDist': 170, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_table_wares', build_table_wares, {'drawDist': 170, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_fence', build_fence, {'drawDist': 180, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_handcart', build_handcart, {'drawDist': 180, 'lodDist': [35, 80], 'shadow': False}),
    ('mkt_warehouse', build_warehouse, {'drawDist': 700, 'lodDist': [80, 200]}),
    ('mkt_monument', build_monument, {'drawDist': 520, 'lodDist': [70, 170]}),
    ('mkt_clock_tower', build_clock_tower, {'drawDist': 900, 'lodDist': [90, 220]}),
    ('mkt_steam_pump', build_steam_pump, {'drawDist': 260, 'lodDist': [45, 110]}),
    ('mkt_pipe_run', build_pipe_run, {'drawDist': 200, 'lodDist': [40, 90], 'shadow': False}),
    ('mkt_plaza_stone', build_plaza_stone, {'drawDist': 900, 'lodDist': [90, 220], 'shadow': False, 'src': plaza_src()}),
    ('mkt_park_paving', build_park_paving, {'drawDist': 600, 'lodDist': [80, 200], 'shadow': False, 'src': park_src()}),
    ('mkt_park_fountain', build_park_fountain, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('mkt_flowerbed', build_flowerbed, {'drawDist': 200, 'lodDist': [40, 90], 'shadow': False}),
]


# ============================================================
#  Экспорт (как build_kit.py) и превью
# ============================================================
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def make_material(name='mkt_atlas'):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_backface_culling = True
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Roughness'].default_value = 1.0
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def bounds(mb):
    xs = [v[0] for v in mb.v]
    ys = [v[1] for v in mb.v]
    zs = [v[2] for v in mb.v]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def as_parts(geo):
    """Модель — один MB на атласе или список частей [(суффикс узла, MB, материал)]."""
    return geo if isinstance(geo, list) else [('', geo, 'mkt_atlas')]


def export_piece(name, fn, meta, manifest):
    clear_scene()
    builds = [fn(lod) for lod in (0, 1, 2)]
    all0 = MB()
    for _, mb, _ in as_parts(builds[0][0]):
        all0.v += mb.v
    bx0, bx1, by0, by1, bz0, bz1 = bounds(all0)
    ox, oy, oz = (bx0 + bx1) / 2, (by0 + by1) / 2, bz0
    tris = [sum(mb.tris() for _, mb, _ in as_parts(b[0])) for b in builds]
    kept = [0]
    for lod in (1, 2):
        if tris[lod] <= 0.7 * tris[kept[-1]]:
            kept.append(lod)
    objs = []
    for lod in kept:
        for suffix, mb, mat_name in as_parts(builds[lod][0]):
            mb.v = [(v[0] - ox, v[1] - oy, v[2] - oz) for v in mb.v]
            nm = name + suffix if lod == 0 else '%s%s_LOD%d' % (name, suffix, lod)
            objs.append(mb.to_object(nm, make_material(mat_name)))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    out = os.path.join(OUT_DIR, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14, export_yup=True,
    )
    game_cols = []
    for item in builds[0][1]:
        cx, cy, sx, sy, h, z0 = item[:6]
        entry = {'x': round(cx - ox, 3), 'z': round(-(cy - oy), 3), 'w': round(sx, 3), 'd': round(sy, 3),
                 'h': round(h, 3), 'y0': round(z0 - oz, 3)}
        if len(item) > 6 and item[6]:
            entry['walkable'] = True
        if len(item) > 7 and item[7]:
            entry['shape'] = item[7]
        game_cols.append(entry)
    manifest['pieces'][name] = {
        'file': 'market/' + name + '.glb',
        'size': [round(bx1 - bx0, 3), round(bz1 - bz0, 3), round(by1 - by0, 3)],
        'anchorShift': [round(ox, 4), round(oz, 4), round(-oy, 4)],
        'tris': tris, 'lods': kept, 'bytes': os.path.getsize(out), 'colliders': game_cols, **meta,
    }
    print('[market] %-28s tris LOD0/1/2 = %5d / %5d / %5d  LODs %-9s -> %6d bytes' % (name, tris[0], tris[1], tris[2], kept, os.path.getsize(out)))


def preview(names, out_png):
    """Контактный лист LOD0 с текстурой атласа (Workbench) — для проверки на глаз."""
    clear_scene()
    tex_path = os.path.join(ROOT, 'client', 'assets', 'props', 'textures', 'mkt_atlas.webp')
    mat = bpy.data.materials.new('mkt_preview')
    mat.use_nodes = True
    nt = mat.node_tree
    img = bpy.data.images.load(tex_path)
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = img
    tn.interpolation = 'Closest'
    bsdf = nt.nodes.get('Principled BSDF')
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    nt.nodes.active = tn
    fns = {n: f for n, f, _ in PIECES}
    cols = int(math.ceil(math.sqrt(len(names))))
    cell = 0.0
    built = []
    for n in names:
        geo, _ = fns[n](0)
        mb = MB()
        for _, part, _ in as_parts(geo):
            mb.v += [tuple(v) for v in part.v]
            off = len(mb.v) - len(part.v)
            mb.f += [[i + off for i in f] for f in part.f]
            mb.uv += part.uv
            mb.sm += part.sm
        b = bounds(mb)
        cell = max(cell, b[1] - b[0], b[3] - b[2])
        built.append((n, mb, b))
    cell = min(cell, 14.0) + 3.0
    for i, (n, mb, b) in enumerate(built):
        ox = (i % cols) * cell - (b[0] + b[1]) / 2
        oy = -(i // cols) * cell - (b[2] + b[3]) / 2
        mb.v = [(v[0] + ox, v[1] + oy, v[2] - b[4]) for v in mb.v]
        mb.to_object(n, mat)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.display.shading.show_backface_culling = True
    rows = int(math.ceil(len(names) / cols))
    W = cols * cell
    Hh = rows * cell
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = max(W, Hh) * 1.15
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    cx, cy = (cols - 1) * cell / 2, -(rows - 1) * cell / 2
    d = max(W, Hh)
    cam.location = (cx, cy - d * 0.9, d * 0.75)
    cam.rotation_euler = (math.radians(55), 0, 0)
    sc.camera = cam
    sc.render.resolution_x = 1600
    sc.render.resolution_y = int(1600 * min(1.0, (Hh * 0.8 + 6) / W))
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print('[market] preview ->', out_png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    prev = None
    if '--preview' in args:
        i = args.index('--preview')
        prev = args[i + 1]
        args = args[:i] + args[i + 2:]
    only = set(args) if args else None
    if prev:
        names = [n for n, _, _ in PIECES if (not only or n in only)]
        preview(names, prev)
        return
    manifest = {'atlas': 'mkt_atlas.webp', 'dir': 'market', 'pieces': {}}
    if os.path.exists(MANIFEST) and only:
        manifest = json.load(open(MANIFEST, encoding='utf-8'))
    for name, fn, meta in PIECES:
        if only and name not in only:
            continue
        export_piece(name, fn, meta, manifest)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('[market] manifest ->', MANIFEST)


main()
