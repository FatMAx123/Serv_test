# ============================================================
#  SCRIPTS / OPERATORS-TERRITORY / BUILD_KIT.PY
#  Территория операторов: кит руин и главное здание (Бастион операторов).
#
#  Запуск (headless Blender, как scripts/convert-assets.js):
#    "D:\3d\Blernder\blender.exe" -b --factory-startup -P scripts/operators-territory/build_kit.py
#
#  Что делает:
#   - строит процедурно (своя геометрия, без чужих моделей) 12 объектов;
#   - у каждого 3 LOD в одном файле: узлы <имя>, <имя>_LOD1, <имя>_LOD2
#     (world-content.js раскладывает их по ярусам InstancedMesh);
#   - один материал opt_atlas без встроенной картинки: все объекты берут ОДНУ
#     текстуру assets/props/textures/opt_atlas.webp (один файл, одна загрузка в VRAM);
#   - UV — trim sheet из atlas-layout.json: стены режутся на ленты по высоте
#     полосы и тайлятся по U, плотность 128 px/м;
#   - экспорт GLB + Draco (как convert-assets.js) в client/assets/props/operators/;
#   - манифест kit-manifest.json: размеры, треугольники по LOD, коллайдеры
#     (для layout.js — коллизии ставятся по нему, а не на глаз).
#
#  Оси: строим в Blender (Z вверх, фасад смотрит в −Y). glTF переводит в Y-up,
#  фасад в игре смотрит в +Z, коллайдеры в манифесте — уже в осях игры (x, z).
# ============================================================
import bpy
import json
import math
import os
import random
import sys

from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'client', 'assets', 'props', 'operators')
LAYOUT = json.load(open(os.path.join(HERE, 'atlas-layout.json'), encoding='utf-8'))
MANIFEST = os.path.join(HERE, 'kit-manifest.json')

U_SPAN = LAYOUT['uSpanM']          # 8 м на 1.0 по U
STRIPS = LAYOUT['strips']
CELLS = LAYOUT['cells']
EPS = 1e-6


# ============================================================
#  Построитель меша
# ============================================================
def newell(pts):
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(pts)):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


class MB:
    """Полигоны с UV по углам. Плоские грани — свои вершины (жёсткие рёбра),
    гладкие (smooth=True) — общие вершины внутри группы skey."""

    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.sm = []
        self.cache = {}
        self.M = Matrix.Identity(4)

    def vert(self, p, skey=None):
        p = self.M @ Vector(p)
        if skey is not None:
            k = (skey, round(p.x, 4), round(p.y, 4), round(p.z, 4))
            if k in self.cache:
                return self.cache[k]
        self.v.append((p.x, p.y, p.z))
        i = len(self.v) - 1
        if skey is not None:
            self.cache[k] = i
        return i

    def poly(self, pts, uvs, outward=None, smooth=False, skey=None):
        pts = [Vector(p) for p in pts]
        # убрать совпадающие соседние точки (вырожденные углы лент)
        cp, cu = [], []
        for p, t in zip(pts, uvs):
            if cp and (p - cp[-1]).length < 1e-5:
                continue
            cp.append(p)
            cu.append(t)
        if len(cp) > 2 and (cp[0] - cp[-1]).length < 1e-5:
            cp.pop()
            cu.pop()
        if len(cp) < 3:
            return
        n = newell(cp)
        if n.length < 1e-9:
            return
        if outward is not None and n.dot(Vector(outward)) < 0:
            cp = cp[::-1]
            cu = cu[::-1]
        idx = [self.vert(p, skey if smooth else None) for p in cp]
        self.f.append(idx)
        self.uv.append([tuple(t) for t in cu])
        self.sm.append(bool(smooth))

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def to_object(self, name, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        li = 0
        for pi, poly in enumerate(me.polygons):
            for k, loop_index in enumerate(poly.loop_indices):
                uvl.data[loop_index].uv = self.uv[pi][k]
            poly.use_smooth = self.sm[pi]
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ============================================================
#  UV-хелперы trim sheet
# ============================================================
def strip_v(strip, frac):
    st = STRIPS[strip]
    return st['v0'] + (st['v1'] - st['v0']) * max(0.0, min(1.0, frac))


def cell_uv(cell, fu, fv):
    c = CELLS[cell]
    return (c['u0'] + (c['u1'] - c['u0']) * fu, c['v0'] + (c['v1'] - c['v0']) * fv)


def band_index(z, bh, zref=0.0):
    return int(math.floor((z - zref) / bh + 1e-7))


def wall_profile(mb, A, B, z0, profile, strip, outward, s0=0.0, zref=0.0, stretch=False):
    """Вертикальная грань вдоль A→B (точки XY), низ z0, верх — профиль
    [(s, z_top), ...], s от 0 до |AB|. Режется на ленты по высоте полосы;
    точки пересечения профиля с границами лент вставляются — грань без щелей."""
    A = Vector((A[0], A[1], 0.0))
    B = Vector((B[0], B[1], 0.0))
    L = (B - A).length
    d = (B - A) / max(L, EPS)
    bh = STRIPS[strip]['heightM']
    # вставка пересечений
    pts = []
    for i in range(len(profile) - 1):
        s1, h1 = profile[i]
        s2, h2 = profile[i + 1]
        pts.append((s1, h1))
        lo, hi = min(h1, h2), max(h1, h2)
        k = band_index(lo, bh, zref) + 1
        cross = []
        while zref + k * bh < hi - 1e-6:
            zc = zref + k * bh
            t = (zc - h1) / (h2 - h1)
            cross.append((s1 + (s2 - s1) * t, zc))
            k += 1
        cross.sort(key=lambda q: q[0])
        pts.extend(cross)
    pts.append(profile[-1])

    def P(s, z):
        q = A + d * s
        return (q.x, q.y, z)

    for i in range(len(pts) - 1):
        sa, ha = pts[i]
        sb, hb = pts[i + 1]
        if sb - sa < 1e-5:
            continue
        top_lo = min(ha, hb)
        if top_lo <= z0 + 1e-5 and max(ha, hb) <= z0 + 1e-5:
            continue
        K = band_index(top_lo, bh, zref)
        if abs(top_lo - (zref + K * bh)) < 1e-6 and max(ha, hb) > top_lo + 1e-6:
            pass
        kb = band_index(z0, bh, zref)
        ua = (s0 + sa) / U_SPAN
        ub = (s0 + sb) / U_SPAN
        if stretch:
            # одна лента на всю высоту (вертикальные полосы: каннелюры, трубы)
            H = max(ha, hb) - z0
            pts4 = [P(sa, z0), P(sb, z0), P(sb, hb), P(sa, ha)]
            uv4 = [(ua, strip_v(strip, 0)), (ub, strip_v(strip, 0)),
                   (ub, strip_v(strip, (hb - z0) / H)), (ua, strip_v(strip, (ha - z0) / H))]
            mb.poly(pts4, uv4, outward)
            continue
        for k in range(kb, K + 1):
            zb = max(z0, zref + k * bh)
            zt_full = zref + (k + 1) * bh
            if k < K:
                ta = tb = zt_full
            else:
                ta, tb = ha, hb
            if ta <= zb + 1e-6 and tb <= zb + 1e-6:
                continue
            ta = max(ta, zb)
            tb = max(tb, zb)
            base = zref + k * bh
            pts4 = [P(sa, zb), P(sb, zb), P(sb, tb), P(sa, ta)]
            uv4 = [(ua, strip_v(strip, (zb - base) / bh)), (ub, strip_v(strip, (zb - base) / bh)),
                   (ub, strip_v(strip, (tb - base) / bh)), (ua, strip_v(strip, (ta - base) / bh))]
            mb.poly(pts4, uv4, outward)


def wall_rect(mb, A, B, z0, z1, strip, outward, s0=0.0, zref=0.0, stretch=False):
    L = (Vector((B[0], B[1])) - Vector((A[0], A[1]))).length
    wall_profile(mb, A, B, z0, [(0.0, z1), (L, z1)], strip, outward, s0, zref, stretch)


def planar_top(mb, pts, strip=None, cell=None, outward=(0, 0, 1), rot=0.0, scale=1.0, smooth=False):
    """Горизонтальная (или почти) грань: проекция XY в полосу/ячейку."""
    c = math.cos(rot)
    s = math.sin(rot)
    loc = [((p[0] * c - p[1] * s), (p[0] * s + p[1] * c)) for p in pts]
    if strip:
        bh = STRIPS[strip]['heightM']
        vmin = min(q[1] for q in loc)
        vmax = max(q[1] for q in loc)
        span = max(vmax - vmin, 1e-6)
        k = min(1.0, bh / span) * scale
        uvs = [(q[0] * k / U_SPAN, strip_v(strip, (q[1] - vmin) * k / bh)) for q in loc]
    else:
        cc = CELLS[cell]
        umin = min(q[0] for q in loc)
        umax = max(q[0] for q in loc)
        vmin = min(q[1] for q in loc)
        vmax = max(q[1] for q in loc)
        uvs = [cell_uv(cell, (q[0] - umin) / max(umax - umin, 1e-6), (q[1] - vmin) / max(vmax - vmin, 1e-6)) for q in loc]
    mb.poly(pts, uvs, outward, smooth=smooth)


def rect_top(mb, x0, x1, y0, y1, z, strip, outward=(0, 0, 1)):
    """Горизонтальный прямоугольник: ряды высотой в полосу по Y, U = X / 8 м
    (большие площадки не растягивают плиты)."""
    bh = STRIPS[strip]['heightM']
    y = y0
    while y < y1 - 1e-5:
        k = band_index(y, bh)
        yt = min(y1, (k + 1) * bh)
        base = k * bh
        pts = [(x0, y, z), (x1, y, z), (x1, yt, z), (x0, yt, z)]
        uvs = [(x0 / U_SPAN, strip_v(strip, (y - base) / bh)), (x1 / U_SPAN, strip_v(strip, (y - base) / bh)),
               (x1 / U_SPAN, strip_v(strip, (yt - base) / bh)), (x0 / U_SPAN, strip_v(strip, (yt - base) / bh))]
        mb.poly(pts, uvs, outward)
        y = yt


def box(mb, cx, cy, z0, sx, sy, sz, side='stone', top='stone', top_cell=None, bottom=False, zref=0.0,
        top_on=True, sides=(True, True, True, True)):
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z1 = z0 + sz
    s = 0.0
    edges = [((x0, y0), (x1, y0), (0, -1, 0)), ((x1, y0), (x1, y1), (1, 0, 0)),
             ((x1, y1), (x0, y1), (0, 1, 0)), ((x0, y1), (x0, y0), (-1, 0, 0))]
    for i, (a, b, n) in enumerate(edges):
        L = (Vector(b) - Vector(a)).length
        if sides[i]:
            wall_rect(mb, a, b, z0, z1, side, n, s0=s, zref=zref)
        s += L
    if top_on:
        pts = [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        if top_cell:
            planar_top(mb, pts, cell=top_cell)
        else:
            rect_top(mb, x0, x1, y0, y1, z1, top)
    if bottom:
        pts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)]
        planar_top(mb, pts, strip=top, outward=(0, 0, -1))


def cylinder(mb, r0, r1, z0, z1, seg, strip, u_units=None, stretch=True, top=None, bottom=None, top_heights=None,
             top_center=None, phase=0.0, skey='cyl', cap_cell='rough', zref=0.0):
    """Цилиндр/усечённый конус вокруг Z. top/bottom: None | 'flat' | 'jagged' (bottom='flat' ставится автоматически при top='flat').
    top_heights — высоты верхнего кольца по сегментам (скол колонны)."""
    if u_units is None:
        u_units = 2 * math.pi * max(r0, r1) / U_SPAN
    ring = []
    for i in range(seg + 1):
        a = phase + 2 * math.pi * i / seg
        ring.append((math.cos(a), math.sin(a)))
    tops = top_heights if top_heights else [z1] * seg
    tops = list(tops) + [tops[0]]
    zmax = max(tops)
    key = skey + str(id(mb)) + str(r0) + str(z0)
    for i in range(seg):
        (c0, s0), (c1, s1) = ring[i], ring[i + 1]
        ua = u_units * i / seg
        ub = u_units * (i + 1) / seg
        ha, hb = tops[i], tops[i + 1]
        if stretch:
            H = max(zmax - z0, EPS)
            pts = [(r0 * c0, r0 * s0, z0), (r0 * c1, r0 * s1, z0),
                   (r1 * c1, r1 * s1, hb) if not top_heights else (lerp_r(r0, r1, z0, z1, hb) * c1, lerp_r(r0, r1, z0, z1, hb) * s1, hb),
                   (r1 * c0, r1 * s0, ha) if not top_heights else (lerp_r(r0, r1, z0, z1, ha) * c0, lerp_r(r0, r1, z0, z1, ha) * s0, ha)]
            uvs = [(ua, strip_v(strip, 0)), (ub, strip_v(strip, 0)),
                   (ub, strip_v(strip, (hb - z0) / H)), (ua, strip_v(strip, (ha - z0) / H))]
            mid = (c0 + c1) / 2, (s0 + s1) / 2
            mb.poly(pts, uvs, (mid[0], mid[1], 0), smooth=True, skey=key)
        else:
            bh = STRIPS[strip]['heightM']
            z = z0
            while z < max(ha, hb) - 1e-5:
                k = band_index(z, bh, zref)
                zt = min(zref + (k + 1) * bh, min(ha, hb))
                if zt <= z + 1e-5:
                    zt = min(zref + (k + 1) * bh, max(ha, hb))
                ra = lerp_r(r0, r1, z0, z1, z)
                rb = lerp_r(r0, r1, z0, z1, zt)
                base = zref + k * bh
                pts = [(ra * c0, ra * s0, z), (ra * c1, ra * s1, z), (rb * c1, rb * s1, zt), (rb * c0, rb * s0, zt)]
                uvs = [(ua, strip_v(strip, (z - base) / bh)), (ub, strip_v(strip, (z - base) / bh)),
                       (ub, strip_v(strip, (zt - base) / bh)), (ua, strip_v(strip, (zt - base) / bh))]
                mid = (c0 + c1) / 2, (s0 + s1) / 2
                mb.poly(pts, uvs, (mid[0], mid[1], 0), smooth=True, skey=key)
                z = zt
    if top == 'flat':
        pts = [(r1 * ring[i][0], r1 * ring[i][1], z1) for i in range(seg)]
        planar_top(mb, pts, cell=cap_cell)
    elif top == 'ring':
        pass
    elif top == 'jagged':
        cz = top_center if top_center is not None else (min(tops) - 0.05)
        for i in range(seg):
            ha, hb = tops[i], tops[i + 1]
            ra = lerp_r(r0, r1, z0, z1, ha)
            rb = lerp_r(r0, r1, z0, z1, hb)
            pa = (ra * ring[i][0], ra * ring[i][1], ha)
            pb = (rb * ring[i + 1][0], rb * ring[i + 1][1], hb)
            pc = (0.0, 0.0, cz)
            uvs = [cell_uv(cap_cell, 0.5 + 0.5 * ring[i][0], 0.5 + 0.5 * ring[i][1]),
                   cell_uv(cap_cell, 0.5 + 0.5 * ring[i + 1][0], 0.5 + 0.5 * ring[i + 1][1]),
                   cell_uv(cap_cell, 0.5, 0.5)]
            mb.poly([pa, pb, pc], uvs, (0, 0, 1))
    if bottom is None and top in ('flat', 'jagged'):
        bottom = 'flat'
    if bottom == 'flat' and r0 > 1e-5:
        pts_b = [(r0 * ring[i][0], r0 * ring[i][1], z0) for i in range(seg)]
        planar_top(mb, list(reversed(pts_b)), cell=cap_cell, outward=(0, 0, -1))


def annulus(mb, r_out, r_in, z, seg, strip='stone', phase=0.0):
    """Кольцо-полочка (верх ступени базы, когда сверху стоит цилиндр поуже)."""
    for i in range(seg):
        a0 = phase + 2 * math.pi * i / seg
        a1 = phase + 2 * math.pi * (i + 1) / seg
        pts = [(r_in * math.cos(a0), r_in * math.sin(a0), z), (r_out * math.cos(a0), r_out * math.sin(a0), z),
               (r_out * math.cos(a1), r_out * math.sin(a1), z), (r_in * math.cos(a1), r_in * math.sin(a1), z)]
        u0 = 2 * math.pi * r_out * i / seg / U_SPAN
        u1 = 2 * math.pi * r_out * (i + 1) / seg / U_SPAN
        w = (r_out - r_in) / STRIPS[strip]['heightM']
        uvs = [(u0, strip_v(strip, 0)), (u0, strip_v(strip, w)), (u1, strip_v(strip, w)), (u1, strip_v(strip, 0))]
        mb.poly(pts, uvs, (0, 0, 1))


def lerp_r(r0, r1, z0, z1, z):
    if abs(z1 - z0) < EPS:
        return r0
    t = (z - z0) / (z1 - z0)
    return r0 + (r1 - r0) * t


def decal(mb, center, right, up, w, h, cell, outward, fu=(0.0, 1.0), fv=(0.0, 1.0)):
    c = Vector(center)
    r = Vector(right).normalized() * (w / 2)
    u = Vector(up).normalized() * (h / 2)
    pts = [c - r - u, c + r - u, c + r + u, c - r + u]
    uvs = [cell_uv(cell, fu[0], fv[0]), cell_uv(cell, fu[1], fv[0]),
           cell_uv(cell, fu[1], fv[1]), cell_uv(cell, fu[0], fv[1])]
    mb.poly(pts, uvs, outward)


def slope_plane(mb, E, R, U, L_ridge, L_slope, strip, outward, s0=0.0):
    """Скат крыши: E — угол у карниза, R — вдоль конька (ед.), U — вверх по скату (ед.).
    Лентами по скату, чтобы черепица не растягивалась."""
    E = Vector(E)
    R = Vector(R).normalized()
    U = Vector(U).normalized()
    bh = STRIPS[strip]['heightM']
    d = 0.0
    k = 0
    while d < L_slope - 1e-5:
        d1 = min(L_slope, d + bh)
        p0 = E + U * d
        p1 = E + R * L_ridge + U * d
        p2 = E + R * L_ridge + U * d1
        p3 = E + U * d1
        fr = (d1 - d) / bh
        uvs = [(s0 / U_SPAN, strip_v(strip, 0)), ((s0 + L_ridge) / U_SPAN, strip_v(strip, 0)),
               ((s0 + L_ridge) / U_SPAN, strip_v(strip, fr)), (s0 / U_SPAN, strip_v(strip, fr))]
        mb.poly([p0, p1, p2, p3], uvs, outward)
        d = d1
        k += 1


def pyramid(mb, cx, cy, z0, sx, sy, h, strip='slate'):
    """Четырёхскатная шатровая крыша башни; каждый скат — лентами-трапециями."""
    apex = Vector((cx, cy, z0 + h))
    corners = [Vector((cx - sx / 2, cy - sy / 2, z0)), Vector((cx + sx / 2, cy - sy / 2, z0)),
               Vector((cx + sx / 2, cy + sy / 2, z0)), Vector((cx - sx / 2, cy + sy / 2, z0))]
    bh = STRIPS[strip]['heightM']
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        mid = (a + b) / 2
        slope_len = (apex - mid).length
        out = (mid - Vector((cx, cy, z0))).normalized() + Vector((0, 0, 0.6))
        base_len = (b - a).length
        d = 0.0
        while d < slope_len - 1e-5:
            d1 = min(slope_len, d + bh)
            t0 = d / slope_len
            t1 = d1 / slope_len
            a0 = a + (apex - a) * t0
            b0 = b + (apex - b) * t0
            a1 = a + (apex - a) * t1
            b1 = b + (apex - b) * t1
            w0 = base_len * (1 - t0)
            w1 = base_len * (1 - t1)
            c0 = base_len / 2
            uvs = [((c0 - w0 / 2) / U_SPAN, strip_v(strip, 0)), ((c0 + w0 / 2) / U_SPAN, strip_v(strip, 0)),
                   ((c0 + w1 / 2) / U_SPAN, strip_v(strip, (d1 - d) / bh)), ((c0 - w1 / 2) / U_SPAN, strip_v(strip, (d1 - d) / bh))]
            mb.poly([a0, b0, b1, a1], uvs, out)
            d = d1


def cone_spike(mb, cx, cy, z0, r, h, seg=6, strip='brass'):
    for i in range(seg):
        a0 = 2 * math.pi * i / seg
        a1 = 2 * math.pi * (i + 1) / seg
        p0 = (cx + r * math.cos(a0), cy + r * math.sin(a0), z0)
        p1 = (cx + r * math.cos(a1), cy + r * math.sin(a1), z0)
        p2 = (cx, cy, z0 + h)
        u0 = i / seg * 0.1
        u1 = (i + 1) / seg * 0.1
        mb.poly([p0, p1, p2], [(u0, strip_v(strip, 0)), (u1, strip_v(strip, 0)), ((u0 + u1) / 2, strip_v(strip, 1))],
                (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0.3))


def wedge_block(mb, a0, a1, ri, ro, ycen, depth, cx, cz, strip='stone'):
    """Клинчатый камень арки в плоскости XZ (арка вдоль X, толщина по Y)."""
    pi0 = Vector((cx + ri * math.cos(a0), 0, cz + ri * math.sin(a0)))
    pi1 = Vector((cx + ri * math.cos(a1), 0, cz + ri * math.sin(a1)))
    po0 = Vector((cx + ro * math.cos(a0), 0, cz + ro * math.sin(a0)))
    po1 = Vector((cx + ro * math.cos(a1), 0, cz + ro * math.sin(a1)))
    yf = ycen - depth / 2
    yb = ycen + depth / 2

    def at(p, y):
        return (p.x, y, p.z)

    bh = STRIPS[strip]['heightM']
    zmin = min(pi0.z, pi1.z, po0.z, po1.z)

    def uvp(p):
        return (p.x / U_SPAN, strip_v(strip, (p.z - zmin) / bh))

    quad = [pi0, pi1, po1, po0]
    mb.poly([at(p, yf) for p in quad], [uvp(p) for p in quad], (0, -1, 0))
    mb.poly([at(p, yb) for p in quad], [uvp(p) for p in quad], (0, 1, 0))
    # нижняя (интрадос) и верхняя (экстрадос) грани, бока
    am = (a0 + a1) / 2
    for (p, q, n) in ((pi0, pi1, (-math.cos(am), 0, -math.sin(am))), (po0, po1, (math.cos(am), 0, math.sin(am))),
                      (pi0, po0, (math.sin(a0), 0, -math.cos(a0))), (pi1, po1, (-math.sin(a1), 0, math.cos(a1)))):
        L = (q - p).length
        pts = [at(p, yf), at(q, yf), at(q, yb), at(p, yb)]
        uvs = [(0, strip_v(strip, 0)), (L / U_SPAN, strip_v(strip, 0)),
               (L / U_SPAN, strip_v(strip, depth / bh)), (0, strip_v(strip, depth / bh))]
        mb.poly(pts, uvs, n)


def jagged_profile(L, h_lo, h_hi, step, rnd, shape=None):
    """Неровный верх руины: точки через ~step, высоты между h_lo и h_hi."""
    n = max(2, int(round(L / step)))
    prof = []
    for i in range(n + 1):
        s = L * i / n
        t = s / L
        base = shape(t) if shape else 1.0
        h = h_lo + (h_hi - h_lo) * base * rnd.uniform(0.55, 1.0)
        prof.append((s, h))
    return prof


def ruin_wall(mb, length, thick, profile, strip='ruin', z0=0.0, cap='ruin'):
    """Стена-руина вдоль X по центру, толщина по Y; профиль [(s, h)] от −L/2."""
    x0 = -length / 2
    A = (x0, -thick / 2)
    B = (x0 + length, -thick / 2)
    wall_profile(mb, A, B, z0, profile, strip, (0, -1, 0))
    back = [(length - s, h) for (s, h) in reversed(profile)]
    wall_profile(mb, (x0 + length, thick / 2), (x0, thick / 2), z0, back, strip, (0, 1, 0), s0=length)
    # торцы
    wall_rect(mb, (x0, thick / 2), (x0, -thick / 2), z0, profile[0][1], strip, (-1, 0, 0))
    wall_rect(mb, (x0 + length, -thick / 2), (x0 + length, thick / 2), z0, profile[-1][1], strip, (1, 0, 0))
    # верх
    bh = STRIPS[cap]['heightM']
    for i in range(len(profile) - 1):
        sa, ha = profile[i]
        sb, hb = profile[i + 1]
        pts = [(x0 + sa, -thick / 2, ha), (x0 + sb, -thick / 2, hb), (x0 + sb, thick / 2, hb), (x0 + sa, thick / 2, ha)]
        uvs = [(sa / U_SPAN, strip_v(cap, 0)), (sb / U_SPAN, strip_v(cap, 0)),
               (sb / U_SPAN, strip_v(cap, thick / bh)), (sa / U_SPAN, strip_v(cap, thick / bh))]
        mb.poly(pts, uvs, (0, 0, 1))


# ============================================================
#  Объекты кита.  Каждая функция: (lod) -> (MB, colliders)
#  colliders — в осях Blender: (cx, cy, sx, sy, height, z0)
# ============================================================
SEG = {0: 12, 1: 8, 2: 6}


def column_base(mb, lod):
    box(mb, 0, 0, 0, 1.5, 1.5, 0.45, 'stone', 'stone', bottom=True)
    if lod <= 1:
        seg = SEG[lod] + 4
        cylinder(mb, 0.64, 0.64, 0.45, 0.62, seg, 'stone', stretch=False, skey='b1')
        annulus(mb, 0.64, 0.56, 0.62, seg)
        cylinder(mb, 0.56, 0.52, 0.62, 0.76, seg, 'stone', stretch=False, skey='b2')
        annulus(mb, 0.52, 0.47, 0.76, seg)
        return 0.76
    return 0.45


def column_capital(mb, lod, ztop_shaft):
    seg = SEG[lod] + 4 if lod <= 1 else SEG[lod]
    cylinder(mb, 0.42, 0.66, ztop_shaft, ztop_shaft + 0.30, seg, 'stone', stretch=False, skey='cap')
    z = ztop_shaft + 0.30
    box(mb, 0, 0, z, 1.45, 1.45, 0.34, 'frieze', 'stone', bottom=True)
    return z + 0.34


def build_column(lod):
    mb = MB()
    zb = column_base(mb, lod)
    shaft_top = 6.8
    cylinder(mb, 0.48, 0.42, zb, shaft_top, SEG[lod], 'flutes', u_units=0.5, stretch=True, skey='shaft')
    column_capital(mb, lod, shaft_top)
    return mb, [(0, 0, 1.0, 1.0, 7.5, 0.0)]


def broken_shaft(mb, lod, zb, h_mid, rnd, amp=0.45):
    seg = SEG[lod]
    tops = []
    for i in range(seg):
        tops.append(h_mid + rnd.uniform(-amp, amp * 0.8))
    tops[0] = h_mid + amp       # один «зуб» выше остальных
    r_at = lambda z: 0.48 + (0.42 - 0.48) * (z - zb) / (6.8 - zb)
    cylinder(mb, 0.48, r_at(max(tops)), zb, max(tops), seg, 'flutes', u_units=0.5, stretch=True,
             top='jagged', top_heights=tops, top_center=h_mid - 0.15, skey='bshaft')


def build_column_broken(lod):
    mb = MB()
    rnd = random.Random(7)
    zb = column_base(mb, lod)
    broken_shaft(mb, lod, zb, 3.6, rnd)
    return mb, [(0, 0, 1.0, 1.0, 4.2, 0.0)]


def build_column_stump(lod):
    mb = MB()
    rnd = random.Random(11)
    zb = column_base(mb, lod)
    broken_shaft(mb, lod, zb, 1.35, rnd, amp=0.3)
    return mb, [(0, 0, 1.5, 1.5, 1.8, 0.0)]


def build_column_fallen(lod):
    """Три барабана ствола и капитель лежат вдоль X."""
    mb = MB()
    rnd = random.Random(23)
    seg = SEG[lod]
    x = -3.3
    r = 0.46
    for i, L in enumerate((2.0, 1.7, 1.9)):
        roll = rnd.uniform(0, math.pi)
        yaw = rnd.uniform(-0.12, 0.12)
        gap = rnd.uniform(0.05, 0.35)
        M = Matrix.Translation((x + L / 2, rnd.uniform(-0.15, 0.15), r - 0.08)) @ Matrix.Rotation(yaw, 4, 'Z') @ \
            Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(roll, 4, 'Z') @ Matrix.Translation((0, 0, -L / 2))
        mb.M = M
        cylinder(mb, r, r * 0.98, 0, L, seg, 'flutes', u_units=0.5, stretch=True, top='flat', bottom='flat', skey='drum%d' % i)
        x += L + gap
    # капитель на боку, чуть наклонена
    if lod <= 1:
        M = Matrix.Translation((x + 0.5, 0.1, 0.72)) @ Matrix.Rotation(0.18, 4, 'Z') @ Matrix.Rotation(math.pi / 2 + 0.25, 4, 'Y')
        mb.M = M
        box(mb, 0, 0, -0.17, 1.45, 1.45, 0.34, 'frieze', 'stone', bottom=True)
    mb.M = Matrix.Identity(4)
    total = x + 1.2 + 3.3
    return mb, [(0.3, 0, total, 1.3, 1.6, 0.0)]


def build_arch(lod):
    """Руина арки: два пилона, свод из клинчатых камней без копланарных наложений, правая часть обрушена."""
    mb = MB()
    pier = 1.4
    span = 4.2
    cxL = -(span / 2 + pier / 2)
    cxR = span / 2 + pier / 2
    hL = 5.2
    box(mb, cxL, 0, 0, pier, pier, hL, 'stone', 'stone', top_on=False, bottom=True)
    # правый пилон сломан на 3.85 м: ровные ступени разрушенной кладки без острых белых зубьев
    prof = [(0.0, 3.85), (0.65, 3.85), (0.78, 3.40), (1.4, 3.40)]
    wall_profile(mb, (cxR - pier / 2, -pier / 2), (cxR + pier / 2, -pier / 2), 0, prof, 'stone', (0, -1, 0))
    wall_profile(mb, (cxR + pier / 2, pier / 2), (cxR - pier / 2, pier / 2), 0, [(1.4 - s, h) for s, h in reversed(prof)], 'stone', (0, 1, 0))
    wall_rect(mb, (cxR - pier / 2, pier / 2), (cxR - pier / 2, -pier / 2), 0, prof[0][1], 'stone', (-1, 0, 0))
    wall_rect(mb, (cxR + pier / 2, -pier / 2), (cxR + pier / 2, pier / 2), 0, prof[-1][1], 'stone', (1, 0, 0))
    for i in range(len(prof) - 1):
        sa, ha = prof[i]
        sb, hb = prof[i + 1]
        x0 = cxR - pier / 2
        planar_top(mb, [(x0 + sa, -pier / 2, ha), (x0 + sb, -pier / 2, hb), (x0 + sb, pier / 2, hb), (x0 + sa, pier / 2, ha)], strip='flag')
    # импост (карнизный камень) на левом пилоне
    box(mb, cxL, 0, hL, pier + 0.28, pier + 0.28, 0.30, 'frieze', 'stone', bottom=True)
    # свод: 11 клиньев, остаются 0..6 с зазором-рустовкой 0.012 рад (0 перекрытий граней и z-fighting!)
    n = 11 if lod == 0 else 7
    keep = 7 if lod == 0 else 4
    ri = span / 2 + 0.05
    ro = ri + 0.95
    wedge_z = hL + 0.304
    for i in range(keep):
        a0 = math.pi - math.pi * i / n - 0.008
        a1 = math.pi - math.pi * (i + 1) / n + 0.008
        wedge_block(mb, a1, a0, ri, ro, 0.0, pier - 0.14, 0.0, wedge_z)
    # уцелевшая наружная кромка над импостом слева от клиньев (без пересечения со сводом по X и Y!)
    if lod <= 1:
        box(mb, cxL - 0.36, 0, hL + 0.304, 0.66, pier - 0.26, 1.45, 'stone', 'ruin', bottom=True)
    return mb, [(cxL, 0, pier, pier, 7.5, 0.0), (cxR, 0, pier, pier, 4.3, 0.0)]


def build_ruin_long(lod):
    mb = MB()
    rnd = random.Random(41)
    L = 8.0
    shape = lambda t: 0.35 + 0.65 * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.7
    prof = jagged_profile(L, 1.3, 4.6, 0.8 if lod == 0 else 1.6, rnd, shape)
    ruin_wall(mb, L, 0.9, prof)
    return mb, [(0, 0, L, 0.9, 4.6, 0.0)]


def build_ruin_corner(lod):
    """Низкий угол стены: 5 м по X + 3.5 м по Y."""
    mb = MB()
    rnd = random.Random(43)
    T = 0.85
    prof = jagged_profile(5.0, 0.7, 2.6, 0.7 if lod == 0 else 1.4, rnd, lambda t: 0.4 + 0.6 * (1 - t))
    mb.M = Matrix.Translation((0, -1.75, 0))
    ruin_wall(mb, 5.0, T, prof)
    prof2 = jagged_profile(3.5, 0.6, 2.4, 0.7 if lod == 0 else 1.4, rnd, lambda t: 0.5 + 0.5 * (1 - t))
    mb.M = Matrix.Translation((-2.5 + T / 2, 0.0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    ruin_wall(mb, 3.5, T, prof2)
    mb.M = Matrix.Identity(4)
    return mb, [(0, -1.75, 5.0, T, 2.6, 0.0), (-2.5 + T / 2, 0.0, T, 3.5, 2.4, 0.0)]


def chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, strip='ruin', bottom=True):
    mb.M = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    box(mb, 0, 0, -sz / 2, sx, sy, sz, strip, strip, bottom=bottom)
    mb.M = Matrix.Identity(4)


def build_debris(lod):
    """Куча обломков кладки (мелкая декорация — без коллизии)."""
    mb = MB()
    rnd = random.Random(53)
    blocks = [(-0.9, 0.2, 0.28, 1.2, 0.6, 0.56, 0.3, 0.05), (0.4, -0.3, 0.27, 1.1, 0.55, 0.54, -0.5, -0.1),
              (0.2, 0.6, 0.27, 0.9, 0.6, 0.5, 1.2, 0.08), (-0.3, 0.0, 0.78, 1.0, 0.55, 0.5, 0.9, 0.2),
              (1.2, 0.5, 0.25, 0.8, 0.5, 0.5, 0.2, -0.15), (-1.5, -0.6, 0.22, 0.7, 0.5, 0.45, -0.8, 0.1),
              (0.6, 0.1, 0.72, 0.8, 0.45, 0.42, -0.2, -0.25)]
    if lod == 2:
        blocks = blocks[:4]
    for (cx, cy, cz, sx, sy, sz, yaw, tilt) in blocks:
        chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin' if rnd.random() < 0.6 else 'stone')
    return mb, []


def build_block(lod):
    mb = MB()
    box(mb, 0, 0, 0, 1.2, 0.6, 0.55, 'stone', 'ruin')
    return mb, []


def build_slab(lod):
    """Остатки мощения 3×3 м: углублённые тёсаные плиты в тон руин с перекосами (0 парения на склоне)."""
    mb = MB()
    rnd = random.Random(61)
    step = 1.0
    missing = {(0, 2), (2, 0)}
    for i in range(3):
        for j in range(3):
            if (i, j) in missing:
                continue
            cx = -1.0 + i * step + rnd.uniform(-0.05, 0.05)
            cy = -1.0 + j * step + rnd.uniform(-0.05, 0.05)
            h = 0.42 + rnd.uniform(-0.05, 0.06)
            yaw = rnd.uniform(-0.08, 0.08)
            mb.M = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(rnd.uniform(-0.04, 0.04), 4, 'X')
            box(mb, 0, 0, 0, 0.90, 0.90, h, 'stone', 'ruin', sides=(True, True, True, True), bottom=True)
            mb.M = Matrix.Identity(4)
    return mb, []


def build_ruin_tower(lod):
    """Обрушенная дозорная башня L2 (6.4×6.4×11.2 м): уцелевший угловой шпиль стен, обломки балок и торчащие трубы."""
    mb = MB()
    rnd = random.Random(101)
    T = 1.05
    H_CORNER = 11.2
    # Мощный каменный цоколь-подиум (-3.2..+3.2) со ступенькой
    box(mb, 0, 0, 0.0, 6.4, 6.4, 0.95, 'stone', 'flag', bottom=True)
    # Проломленная северная стена (по X, от угла x=-3.2 к x=+3.2, падает с 11.2 до 2.2 м)
    profN = jagged_profile(6.4, 2.2, H_CORNER, 0.9 if lod == 0 else 1.8, rnd, lambda t: (1.0 - t) ** 0.72)
    profN[0] = (0.0, H_CORNER)
    mb.M = Matrix.Translation((0.0, +3.2 - T / 2, 0.90))
    ruin_wall(mb, 6.4, T, profN, strip='stone', cap='ruin')
    # Западная стена (от северного угла вниз на юг с 11.2 до 1.8 м)
    profW = jagged_profile(6.4, 1.8, H_CORNER - 0.3, 0.9 if lod == 0 else 1.8, rnd, lambda t: (1.0 - t) ** 0.68)
    profW[0] = (0.0, H_CORNER)
    mb.M = Matrix.Translation((-3.2 + T / 2, 0.0, 0.90)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    ruin_wall(mb, 6.4, T, profW, strip='stone', cap='ruin')
    # Южный низкий обломок стены
    mb.M = Matrix.Translation((-1.2, -3.2 + T / 2, 0.90))
    ruin_wall(mb, 3.8, T, jagged_profile(3.8, 0.9, 3.2, 0.9, rnd, lambda t: 1.0 - t * 0.7), strip='ruin', cap='ruin')
    mb.M = Matrix.Identity(4)
    if lod <= 1:
        # Угловой контрфорс + карниз на уцелевшем углу
        box(mb, -3.15, 3.15, 0.0, 1.45, 1.45, H_CORNER * 0.88, 'frieze', 'stone', bottom=True)
        # Обломленные деревянные балки 2-го яруса
        for bx, by, rz, len_b in ((-1.1, 2.0, 0.12, 3.6), (-1.9, 1.0, -0.25, 3.2), (-0.4, 2.3, 0.05, 2.4)):
            mb.M = Matrix.Translation((bx, by, 5.4)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(0.18, 4, 'Y')
            box(mb, 0, 0, -0.18, len_b, 0.36, 0.36, 'wood', 'wood', bottom=True)
        # Сорванная паровая магистраль по внутреннему углу башни
        mb.M = Matrix.Translation((-2.05, 2.05, 0.90))
        cylinder(mb, 0.22, 0.22, 0.0, 8.6, 8, 'brass', u_units=0.2, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='twpipe')
        mb.M = Matrix.Translation((-2.05, 2.05, 9.4)) @ Matrix.Rotation(0.55, 4, 'X')
        cylinder(mb, 0.22, 0.20, 0.0, 1.8, 8, 'iron', u_units=0.2, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='twpipe2')
        mb.M = Matrix.Identity(4)
        # Развал камней внутри башни
        for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (
            (0.8, 0.4, 1.15, 1.4, 0.8, 0.6, 0.4, 0.14),
            (1.6, -1.2, 1.10, 1.1, 0.7, 0.55, -0.6, -0.12),
            (-0.6, -1.0, 1.25, 1.5, 0.9, 0.75, 0.8, 0.20),
        ):
            chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
    cols = [
        (0.0, 0.0, 6.4, 6.4, 0.95, 0.0, True),
        (0.0, 3.2 - T / 2, 6.4, T + 0.15, 11.8, 0.0, False),
        (-3.2 + T / 2, 0.0, T + 0.15, 6.4, 11.8, 0.0, False),
        (-1.2, -3.2 + T / 2, 3.8, T + 0.1, 3.6, 0.0, False),
    ]
    return mb, cols


def build_ruin_bridge(lod):
    """Разрушенный акведук / крепостной пролёт (12×4.4×5.4 м): уцелевшая левая пята арки, обрыв свода без z-fighting и торчащие трубы."""
    mb = MB()
    rnd = random.Random(107)
    W_D = 4.2
    # Западный мощный устой + обрушенный свод нависающий в пустоту
    box(mb, -4.1, 0, 0.0, 3.6, W_D, 4.1, 'stone', 'flag', bottom=True)
    box(mb, -4.1, 0, 4.02, 3.76, W_D + 0.24, 0.34, 'frieze', 'flag', bottom=True)
    if lod <= 1:
        # Остатки парапетов моста на левом устое
        box(mb, -4.1, -W_D / 2 + 0.35, 4.38, 3.2, 0.65, 0.95, 'stone', 'ruin', bottom=True)
        box(mb, -4.4, +W_D / 2 - 0.35, 4.38, 2.5, 0.65, 0.85, 'stone', 'ruin', bottom=True)
    # Обломленная арка-свод (клинья начинаются строго снаружи левого устоя, глубина меньше устоя -> 0 z-fighting!)
    n_seg = 12 if lod == 0 else 8
    keep_start = 1
    keep_end = 6 if lod == 0 else 5
    ri, ro = 2.05, 3.05
    for i in range(keep_start, keep_end):
        a0 = math.pi - math.pi * i / n_seg - 0.008
        a1 = math.pi - math.pi * (i + 1) / n_seg + 0.008
        wedge_block(mb, a1, a0, ri, ro, 0.0, W_D - 0.56, -0.15, 1.85)
    # Оторванный восточный устой (ниже и обгрызен!)
    box(mb, +4.2, 0, 0.0, 3.4, W_D, 2.35, 'stone', 'ruin', bottom=True)
    mb.M = Matrix.Translation((+4.2, -W_D / 2 + 0.35, 2.36))
    ruin_wall(mb, 3.3, 0.65, jagged_profile(3.3, 0.5, 1.6, 0.8, rnd, lambda t: t), strip='ruin')
    mb.M = Matrix.Identity(4)
    if lod <= 1:
        # Разорванные бронзовые и железные паровые магистрали, торчащие из обрыва устоя
        for ox_p, oy_p, oz_p, len_p in ((-2.3, -0.7, 3.55, 2.3), (-2.3, +0.9, 3.35, 1.7)):
            mb.M = Matrix.Translation((ox_p, oy_p, oz_p)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            cylinder(mb, 0.24, 0.24, 0.0, len_p, 8, 'brass' if oy_p < 0 else 'iron', u_units=0.2, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='brpipe%s' % oy_p)
        mb.M = Matrix.Identity(4)
        for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (
            (-0.6, 0.5, 0.32, 1.3, 0.9, 0.65, 0.5, 0.15),
            (0.9, -0.8, 0.28, 1.4, 0.8, 0.55, -0.7, -0.2),
            (0.2, 1.3, 0.25, 1.0, 0.7, 0.45, 1.1, 0.1),
        ):
            chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
    cols = [
        (-4.1, 0, 3.6, W_D, 4.9, 0.0, False),
        (+4.2, 0, 3.4, W_D, 2.9, 0.0, False),
    ]
    return mb, cols


def build_ruin_gear_wreck(lod):
    """Гигантская расколотая стимпанк-шестерня (5.2×5.2×4.0 м), вбитая под углом в обломки кладки."""
    mb = MB()
    rnd = random.Random(113)
    # Основание — воронка битого камня
    for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (
        (0.0, 0.0, 0.38, 4.4, 4.4, 0.78, 0.2, 0.06),
        (-1.2, -1.1, 0.55, 1.7, 1.2, 0.75, 0.5, 0.22),
        (1.3, 0.9, 0.52, 1.6, 1.1, 0.70, -0.4, -0.18),
        (-0.8, 1.4, 0.48, 1.5, 1.0, 0.62, 1.2, 0.15),
    ):
        chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
    # Наклонённое спицованное зубчатое колесо-шестерня (настоящий ажурный обод с просветами между спиц!)
    TILT = Matrix.Translation((0.0, 0.0, 1.85)) @ Matrix.Rotation(math.radians(56), 4, 'X') @ Matrix.Rotation(0.3, 4, 'Z')
    n_arc = 12 if lod <= 1 else 8
    R_IN, R_OUT = 1.48, 2.08
    for k in range(n_arc):
        a = (k + 0.5) * (2 * math.pi / n_arc)
        arc_len = (2 * math.pi * ((R_IN + R_OUT) * 0.5) / n_arc) * 1.05
        mb.M = TILT @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation(((R_IN + R_OUT) * 0.5, 0, -0.24))
        box(mb, 0, 0, 0, R_OUT - R_IN, arc_len, 0.48, 'brass', 'iron', bottom=True)
    # Зубья шестерни + 4 мощные спицы + ступица и торчащая ось
    n_teeth = 12 if lod <= 1 else 6
    for k in range(n_teeth):
        a = 2 * math.pi * k / n_teeth
        mb.M = TILT @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((R_OUT + 0.16, 0, -0.21))
        box(mb, 0, 0, 0, 0.40, 0.44, 0.42, 'brass', 'brass', bottom=True)
    for k in range(4):
        mb.M = TILT @ Matrix.Rotation(k * math.pi / 4, 4, 'Z')
        box(mb, 0, 0, -0.18, R_IN * 2.05, 0.34, 0.36, 'iron', 'iron', bottom=True)
    mb.M = TILT
    cylinder(mb, 0.65, 0.65, -0.32, 0.32, 8, 'iron', u_units=0.25, stretch=True, top='flat', skey='g_hub')
    cylinder(mb, 0.34, 0.30, -0.95, 1.55, 8, 'brass', u_units=0.2, stretch=True, top='flat', skey='g_axle')
    mb.M = Matrix.Identity(4)
    return mb, [(0, 0, 4.4, 4.4, 3.8, 0.0)]


def build_ruin_crater(lod):
    """Воронка взрыва / провала кладки (6.8×6.8×1.8 м) с цельным основанием, завалом и обломком кладки."""
    mb = MB()
    rnd = random.Random(127)
    # Обожжённое цельное основание воронки (без дыр и без торчащих тонких палок)
    box(mb, 0, 0, 0.0, 4.8, 4.8, 0.28, 'ruin', 'iron', top_cell='dark', bottom=True)
    n_slab = 10 if lod <= 1 else 6
    for k in range(n_slab):
        a = 2 * math.pi * k / n_slab + rnd.uniform(-0.08, 0.08)
        dist = rnd.uniform(1.95, 2.55)
        tilt = rnd.uniform(0.28, 0.48)
        cx, cy = math.cos(a) * dist, math.sin(a) * dist
        mb.M = Matrix.Translation((cx, cy, 0.34)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-tilt, 4, 'Y')
        box(mb, 0, 0, -0.22, rnd.uniform(1.35, 1.85), rnd.uniform(1.05, 1.45), 0.38, 'ruin', 'flag', bottom=True)
    if lod <= 1:
        # Завал каменных блоков внутри воронки и короткий толстый цокольный патрубок
        chunk(mb, -0.55, 0.35, 0.24, 1.15, 0.92, 0.44, 0.42, 0.16, strip='stone')
        chunk(mb, 0.62, -0.40, 0.22, 0.98, 0.85, 0.38, -0.55, -0.14, strip='ruin')
        mb.M = Matrix.Identity(4)
        box(mb, 0.10, 0.15, 0.20, 1.18, 1.18, 0.34, 'iron', 'iron', top_cell='dark', bottom=True)
        mb.M = Matrix.Translation((0.10, 0.15, 0.48)) @ Matrix.Rotation(0.35, 4, 'Z') @ Matrix.Rotation(0.14, 4, 'X')
        cylinder(mb, 0.38, 0.38, -0.10, 0.48, 8, 'brass', u_units=0.45, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='crp_stub')
    mb.M = Matrix.Identity(4)
    return mb, [(0, 0, 5.4, 5.4, 1.1, 0.0)]


def build_hero_monument(lod):
    """Монумент Героя Операторов (без магии и религии):
    трёхступенчатый каменный подий, постамент с бронзовыми плитами,
    триумфальная арка-шестерня и статуя Героя с паровым молотом и щитом."""
    mb = MB()
    seg = 16 if lod == 0 else (12 if lod == 1 else 8)
    rs = [3.5, 2.8, 2.1]
    z = 0.0
    for k, r in enumerate(rs):
        h = 0.30
        cylinder(mb, r, r, z, z + h, seg, 'stone', stretch=False, skey='hm_st%d' % k, phase=0.1 * k)
        if lod <= 1 and k == 2:
            cylinder(mb, r + 0.06, r + 0.06, z + h - 0.10, z + h, seg, 'brass', u_units=0.25, stretch=True, skey='hm_ring')
        rin = rs[k + 1] if k + 1 < len(rs) else 0.0
        if rin > 0:
            annulus(mb, r, rin, z + h, seg, 'flag')
        else:
            ring = [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z + h) for i in range(seg)]
            planar_top(mb, ring, strip='flag')
        z += h

    # Монументальный постамент с четырьмя пилястрами и мемориальными досками
    box(mb, 0, 0, z, 1.9, 1.9, 0.25, 'frieze', 'stone')
    z += 0.25
    ped_h = 1.65
    box(mb, 0, 0, z, 1.5, 1.5, ped_h, 'stone', 'stone')
    if lod <= 1:
        for sx in (-0.75, 0.75):
            for sy in (-0.75, 0.75):
                box(mb, sx, sy, z, 0.26, 0.26, ped_h, 'frieze', 'brass')
        # Бронзовые мемориальные доски на всех 4 сторонах
        for (c, r, n) in (
            ((0, -0.78, z + ped_h * 0.5), (1, 0, 0), (0, -1, 0)),
            ((0, 0.78, z + ped_h * 0.5), (-1, 0, 0), (0, 1, 0)),
            ((0.78, 0, z + ped_h * 0.5), (0, 1, 0), (1, 0, 0)),
            ((-0.78, 0, z + ped_h * 0.5), (0, -1, 0), (-1, 0, 0)),
        ):
            decal(mb, c, r, (0, 0, 1), 0.92, 1.05, 'plaque', n)
    z += ped_h
    box(mb, 0, 0, z, 1.75, 1.75, 0.28, 'brass', 'brass', bottom=True)
    z += 0.28

    # Триумфальная арка-шестерня за спиной Героя (в плоскости XZ, позади Y = +0.55)
    if lod <= 1:
        r_in, r_out, gy = 1.65, 2.15, 0.55
        cz = z + 1.05
        n_seg = 12 if lod == 0 else 8
        for i in range(n_seg):
            a0 = math.pi * (-0.12 + 1.24 * i / n_seg)
            a1 = math.pi * (-0.12 + 1.24 * (i + 1) / n_seg)
            wedge_block(mb, a0, a1, r_in, r_out, gy, 0.36, 0, cz, strip='iron')
            if lod == 0 and (i % 2 == 0):
                am = (a0 + a1) * 0.5
                tx = (r_out + 0.14) * math.cos(am)
                tz = cz + (r_out + 0.14) * math.sin(am)
                old = mb.M
                mb.M = Matrix.Translation((tx, gy, tz)) @ Matrix.Rotation(am - math.pi / 2, 4, 'Y')
                box(mb, 0, 0, -0.14, 0.24, 0.34, 0.28, 'brass', 'brass', bottom=True)
                mb.M = old

    # Бронзовая статуя Героя Операторов (броня + шлем + ростовой щит + паровой молот)
    def bronze_box(cx, cy, z0, sx, sy, sz):
        box(mb, cx, cy, z0, sx, sy, sz, 'wood', 'wood', top_cell='bronze', bottom=(lod == 0))
        # Перетягиваем грани ящика на cell 'bronze' для статуи (top_cell уже 'bronze', грани чуть сдвинуты? Нет — рисуем прямо!)

    def part(cx, cy, z0, sx, sy, sz, cell='bronze', rot_y=0.0, rot_x=0.0):
        old = mb.M
        M = Matrix.Translation((cx, cy, z0 + sz * 0.5))
        if rot_y:
            M = M @ Matrix.Rotation(rot_y, 4, 'Y')
        if rot_x:
            M = M @ Matrix.Rotation(rot_x, 4, 'X')
        mb.M = M
        hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
        faces = [
            ([(-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz)], (0, -1, 0)),
            ([(hx, hy, -hz), (-hx, hy, -hz), (-hx, hy, hz), (hx, hy, hz)], (0, 1, 0)),
            ([(hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz), (hx, -hy, hz)], (1, 0, 0)),
            ([(-hx, hy, -hz), (-hx, -hy, -hz), (-hx, -hy, hz), (-hx, hy, hz)], (-1, 0, 0)),
            ([(-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)], (0, 0, 1)),
        ]
        for pts, nrm in faces:
            planar_top(mb, pts, cell=cell, outward=nrm)
        mb.M = old

    # Пьедестал статуи
    part(0, 0, z, 1.15, 1.15, 0.22, 'bronze')
    sz = z + 0.22
    # Ноги (поножи)
    part(-0.24, 0, sz, 0.28, 0.30, 1.10, 'bronze')
    part(0.24, 0, sz, 0.28, 0.30, 1.10, 'bronze')
    # Кираса и латные наплечники
    part(0, 0, sz + 1.05, 0.86, 0.46, 0.98, 'bronze')
    part(-0.56, 0, sz + 1.62, 0.38, 0.52, 0.44, 'bronze', rot_y=-0.22)
    part(0.56, 0, sz + 1.62, 0.38, 0.52, 0.44, 'bronze', rot_y=0.22)
    # Забральный шлем с гребнем
    part(0, -0.02, sz + 2.04, 0.42, 0.44, 0.46, 'bronze')
    part(0, 0.04, sz + 2.48, 0.14, 0.46, 0.22, 'bronze')
    if lod <= 1:
        # Левый башенный щит у ноги
        part(-0.66, -0.28, sz + 0.08, 0.18, 0.72, 1.55, 'bronze', rot_y=0.15)
        part(-0.68, -0.28, sz + 0.72, 0.20, 0.34, 0.34, 'emblem')
        # Правая рука и тяжелый паровой молот Оператора на плече/вертикально
        part(0.62, -0.18, sz + 1.15, 0.24, 0.26, 0.72, 'bronze', rot_x=0.35)
        part(0.68, -0.34, sz + 0.15, 0.12, 0.12, 2.35, 'bronze', rot_x=-0.12)
        part(0.68, -0.50, sz + 2.25, 0.44, 0.82, 0.44, 'bronze', rot_x=-0.12)

    return mb, [(0, 0, 2.2, 2.2, 5.8, 0.0)]


def build_lamp(lod):
    """Паровой фонарь операторов: чугунный столб, латунные пояса, светящийся фонарь (тонкий столб — без коллизии)."""
    mb = MB()
    seg = 8 if lod == 0 else 6
    box(mb, 0, 0, 0, 0.7, 0.7, 0.35, 'stone', 'stone')
    cylinder(mb, 0.16, 0.12, 0.35, 3.3, seg, 'iron', u_units=0.15, stretch=True, skey='post')
    if lod <= 1:
        for zb in (0.9, 2.2):
            cylinder(mb, 0.2, 0.2, zb, zb + 0.14, seg, 'brass', u_units=0.15, stretch=True, skey='bd%s' % zb)
    # фонарь: 4 светящиеся грани + латунный каркас
    z0 = 3.3
    box(mb, 0, 0, z0, 0.5, 0.5, 0.08, 'brass', 'brass', bottom=True)
    for (n, c, r) in (((0, -1, 0), (0, -0.2, z0 + 0.38), (1, 0, 0)), ((0, 1, 0), (0, 0.2, z0 + 0.38), (-1, 0, 0)),
                      ((1, 0, 0), (0.2, 0, z0 + 0.38), (0, 1, 0)), ((-1, 0, 0), (-0.2, 0, z0 + 0.38), (0, -1, 0))):
        decal(mb, c, r, (0, 0, 1), 0.4, 0.6, 'glow', n)
    box(mb, 0, 0, z0 + 0.68, 0.56, 0.56, 0.08, 'brass', 'brass', bottom=True)
    pyramid(mb, 0, 0, z0 + 0.76, 0.56, 0.56, 0.45, 'iron')
    return mb, []


# ------------------------------------------------------------
#  Бастион операторов (главное здание)
# ------------------------------------------------------------
PLINTH_TOP = 2.50          # 1.3 м цоколь в земле (под уклон 1.02 м) + 1.2 м над землёй (проходимый пол!)


def window_frame(mb, cx, cy, z0, w, h, normal, lod, cell='arch_window', trim=True):
    n = Vector(normal)
    right = Vector((-n.y, n.x, 0))
    c = Vector((cx, cy, z0 + h / 2)) + n * 0.04
    decal(mb, c, right, (0, 0, 1), w, h, cell, n)
    if lod == 0 and trim:
        # подоконник и сандрик — выступающие камни
        for (zz, hh) in ((z0 - 0.25, 0.25), (z0 + h, 0.3)):
            p = Vector((cx, cy, 0)) + n * 0.2
            mb_box_oriented(mb, p, right, n, zz, w + 0.5, 0.4, hh, 'frieze')


def mb_box_oriented(mb, p, right, n, z0, w, d, h, strip):
    """Ящик, ориентированный по стене (right — вдоль стены, n — наружу)."""
    ang = math.atan2(right.y, right.x)
    old = mb.M
    mb.M = old @ Matrix.Translation((p.x, p.y, 0)) @ Matrix.Rotation(ang, 4, 'Z')
    box(mb, 0, 0, z0, w, d, h, strip, 'stone')
    mb.M = old


def buttress(mb, x_face, y, side, lod):
    """Контрфорс у боковой стены (side = ±1 — наружу по X)."""
    w = 1.3
    d1 = 1.7
    d2 = 1.1
    zb = PLINTH_TOP
    h1 = 5.0
    h2 = 9.6
    cx1 = x_face + side * d1 / 2
    cx2 = x_face + side * d2 / 2
    box(mb, cx1, y, zb, d1, w, h1, 'stone', 'stone', sides=(True, side > 0, True, side < 0))
    if lod <= 1:
        box(mb, cx2, y, zb + h1, d2, w, h2 - h1, 'stone', 'stone', top_on=False, sides=(True, side > 0, True, side < 0))
        # скошенный верх
        xo = x_face + side * d2
        pts = [(x_face, y - w / 2, zb + h2 + 0.6), (xo, y - w / 2, zb + h2), (xo, y + w / 2, zb + h2), (x_face, y + w / 2, zb + h2 + 0.6)]
        planar_top(mb, pts, strip='stone', outward=(side, 0, 1))
        for yy, nn in ((y - w / 2, (0, -1, 0)), (y + w / 2, (0, 1, 0))):
            wall_profile(mb, (x_face, yy) if nn[1] < 0 else (xo, yy), (xo, yy) if nn[1] < 0 else (x_face, yy), zb + h2,
                         [(0, zb + h2 + (0.6 if nn[1] < 0 else 0.0)), (d2, zb + h2 + (0.0 if nn[1] < 0 else 0.6))], 'stone', nn)


def build_bastion(lod):
    mb = MB()
    HW = 9.0                    # наружная полуширина зала (X)
    WALL_T = 1.2                # толщина стен (внутри X в [-7.8..+7.8], Y в [-9.8..+11.8])
    IHW = HW - WALL_T
    YF, YB = -11.0, 13.0        # наружный фасад и задняя стена (Y)
    IYF, IYB = YF + WALL_T, YB - WALL_T
    ZW = PLINTH_TOP + 10.6      # карниз (высота зала 10.6 м)
    RIDGE = ZW + 8.4            # конёк
    OVH = 0.8                   # свес кровли
    TW = 5.4                    # башня (X в [7.9..13.3] — вне зала)
    TX = HW + 1.6               # центр башни по X
    TY = YF - 0.4
    TH = PLINTH_TOP + 18.8      # верх кладки башни

    DW = 2.6                    # полуширина открытого портала (проём 5.2 м)
    DSPRING = PLINTH_TOP + 3.0  # пята арки портала (проход 5.6 м в высоту)
    DHEAD = DSPRING + DW        # 7.6

    # --- цоколь ---
    PX = TX + TW / 2 + 0.4
    PY0, PY1 = TY - TW / 2 - 0.8, YB + 1.6
    PCY = (PY0 + PY1) / 2
    box(mb, 0, PCY, 0, 2 * PX, PY1 - PY0, PLINTH_TOP, 'stone', 'flag')
    if lod <= 1:
        box(mb, 0, PCY, PLINTH_TOP - 0.3, 2 * PX + 0.3, PY1 - PY0 + 0.3, 0.3, 'frieze', 'flag', top_on=False)

    # --- плиточный каменный пол внутри зала (на PLINTH_TOP + 3.5 см против z-fighting) ---
    if lod <= 1:
        ts = 2.6
        for xi in range(6):
            for yi in range(8):
                x0 = -IHW + xi * ts
                y0 = IYF + yi * (IYB - IYF) / 8.0
                x1 = min(IHW, x0 + ts)
                y1 = IYF + (yi + 1) * (IYB - IYF) / 8.0
                pts = [(x0, y0, PLINTH_TOP + 0.035), (x1, y0, PLINTH_TOP + 0.035),
                       (x1, y1, PLINTH_TOP + 0.035), (x0, y1, PLINTH_TOP + 0.035)]
                planar_top(mb, pts, cell='tile_floor')

    # --- возвышение (подиум Командора) в дальней части зала (Y ∈ [6.5..11.4]) ---
    box(mb, 0, 6.1, PLINTH_TOP, 7.2, 0.8, 0.15, 'frieze', 'flag', bottom=True, sides=(True, True, True, True))
    box(mb, 0, 8.95, PLINTH_TOP, 8.8, 4.9, 0.30, 'frieze', 'flag', bottom=True)
    if lod <= 1:
        box(mb, 0, 8.95, PLINTH_TOP + 0.25, 8.9, 5.0, 0.06, 'brass', 'brass', top_on=False)

    # --- боковые и задняя стены (двухслойная кладка: снаружи + внутри) ---
    box(mb, -HW + WALL_T / 2, (IYF + IYB) / 2, PLINTH_TOP, WALL_T, IYB - IYF, ZW - PLINTH_TOP, 'stone', 'stone', top_on=True, bottom=True)
    box(mb, HW - WALL_T / 2, (IYF + IYB) / 2, PLINTH_TOP, WALL_T, IYB - IYF, ZW - PLINTH_TOP, 'stone', 'stone', top_on=True, bottom=True)
    box(mb, 0, (IYB + YB) / 2, PLINTH_TOP, 2 * HW, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=True, bottom=True)

    # --- фасад с ОТКРЫТЫМ арочным порталом (X ∈ [-2.6..+2.6]) ---
    pier_w = HW - DW
    pier_x = DW + pier_w / 2
    box(mb, -pier_x, (YF + IYF) / 2, PLINTH_TOP, pier_w, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=True, bottom=True)
    box(mb, pier_x, (YF + IYF) / 2, PLINTH_TOP, pier_w, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=True, bottom=True)
    # перемычка над входом и свод арки
    box(mb, 0, (YF + IYF) / 2, DHEAD, 2 * DW, WALL_T, ZW - DHEAD, 'stone', 'stone', top_on=False, bottom=True)
    # раскрытые створки тяжелых дубовых ворот, прижатые внутри у откосов
    if lod <= 1:
        for sx in (-1, 1):
            old = mb.M
            ang = -sx * math.radians(78)
            mb.M = Matrix.Translation((sx * (DW - 0.12), IYF + 0.05, 0)) @ Matrix.Rotation(ang, 4, 'Z')
            box(mb, -sx * 1.18, 0.0, PLINTH_TOP, 2.36, 0.18, 4.4, 'wood', 'iron')
            mb.M = old

    # --- фронтоны (снаружи И внутри — чтобы под крышей не было дыр) ---
    for (yy, n, rev) in ((YF, (0, -1, 0), False), (YB, (0, 1, 0), True),
                         (IYF, (0, 1, 0), True), (IYB, (0, -1, 0), False)):
        prof = [(0.0, ZW), (HW, RIDGE), (2 * HW, ZW)]
        A, B = ((-HW, yy), (HW, yy)) if not rev else ((HW, yy), (-HW, yy))
        wall_profile(mb, A, B, ZW, prof, 'stone', n)

    # --- карниз-фриз по периметру ---
    if lod <= 1:
        box(mb, 0, (YF + YB) / 2, ZW - 0.45, 2 * HW + 0.4, (YB - YF) + 0.4, 0.45, 'frieze', 'stone', top_on=True, bottom=True)

    # --- кровля: западный скат целый, восточный частично проломлен над правой башней (стропила видны, зазор без дыры в зал) ---
    run = HW + OVH
    rise = (RIDGE - ZW) * run / HW
    zE = RIDGE - rise
    L_slope = math.hypot(run, rise)
    y0r, y1r = YF - OVH, YB + OVH
    Lr = y1r - y0r
    th = 0.35
    for side in (-1, 1):
        E = Vector((side * run, y0r, zE))
        U = Vector((-side * run, 0, rise)).normalized()
        out = Vector((side * rise, 0, run)).normalized()
        if side < 0:
            slope_plane(mb, E, (0, 1, 0), U, Lr, L_slope, 'slate', out)
        else:
            # Восточный скат: спереди у фасада целый (0..11.2 м), сзади у очага (17.4..Lr) целый, посередине верх проломлен!
            L_front, L_back = 11.2, Lr - 17.6
            slope_plane(mb, E, (0, 1, 0), U, L_front, L_slope, 'slate', out)
            E_back = E + Vector((0, 17.6, 0))
            slope_plane(mb, E_back, (0, 1, 0), U, L_back, L_slope, 'slate', out, s0=17.6)
            # Нижняя уцелевшая полоса черепицы под проломом и оголённые деревянные стропила пролома
            E_br = E + Vector((0, L_front, 0))
            L_br = 17.6 - L_front
            slope_plane(mb, E_br, (0, 1, 0), U, L_br, L_slope * 0.36, 'slate', out, s0=L_front)
            slope_plane(mb, E_br + U * (L_slope * 0.80), (0, 1, 0), U, L_br, L_slope * 0.20, 'slate', out, s0=L_front)
            if lod <= 1:
                for ry in (12.4, 14.3, 16.2):
                    rafter_p = Vector((0, y0r + ry, RIDGE - 0.18))
                    ang_rf = math.atan2(rise, run)
                    old = mb.M
                    mb.M = Matrix.Translation((side * (run * 0.45), y0r + ry, (RIDGE + zE) * 0.5 - 0.14)) @ Matrix.Rotation(side * ang_rf, 4, 'Y')
                    box(mb, 0, 0, -0.14, L_slope * 0.92, 0.24, 0.24, 'wood', 'wood', bottom=True)
                    mb.M = old
        if lod <= 1:
            Ed = E + Vector((0, 0, -th))
            slope_plane(mb, Ed, (0, 1, 0), U, Lr, L_slope, 'wood', -out)
            for yy, nn in ((y0r, (0, -1, 0)), (y1r, (0, 1, 0))):
                top = Vector((0, yy, RIDGE))
                e1 = Vector((side * run, yy, zE))
                pts = [e1, top, top + Vector((0, 0, -th)), e1 + Vector((0, 0, -th))]
                uvs = [(0, strip_v('wood', 0)), (L_slope / U_SPAN, strip_v('wood', 0)),
                       (L_slope / U_SPAN, strip_v('wood', 1)), (0, strip_v('wood', 1))]
                mb.poly(pts, uvs, nn)
            pts = [E, E + Vector((0, Lr, 0)), Ed + Vector((0, Lr, 0)), Ed]
            mb.poly(pts, [(0, strip_v('brass', 1)), (Lr / U_SPAN, strip_v('brass', 1)), (Lr / U_SPAN, strip_v('brass', 0)), (0, strip_v('brass', 0))],
                    (side, 0, 0))
    if lod <= 1:
        for side in (-1, 1):
            p0 = Vector((0, y0r, RIDGE + 0.35))
            p1 = Vector((0, y1r, RIDGE + 0.35))
            q0 = Vector((side * 0.45, y0r, RIDGE - 0.1))
            q1 = Vector((side * 0.45, y1r, RIDGE - 0.1))
            mb.poly([q0, q1, p1, p0], [(0, strip_v('brass', 0)), (Lr / U_SPAN, strip_v('brass', 0)),
                                       (Lr / U_SPAN, strip_v('brass', 1)), (0, strip_v('brass', 1))], (side, 0, 1))
        if lod == 0:
            for k in (0, 1, 2, 5, 6):
                yy = y0r + 1.5 + k * (Lr - 3.0) / 6
                cone_spike(mb, 0, yy, RIDGE + 0.3, 0.12, 0.9, 5)

    # --- ИНТЕРЬЕР: стропильные фермы, внутренние пилястры, котельная печь, трубы и витражи ---
    if lod <= 1:
        # 4 открытые потолочные деревянные фермы со стальными накладками
        for ty in (-6.2, -1.0, 4.2, 9.2):
            box(mb, 0, ty, ZW - 0.3, 2 * IHW, 0.45, 0.55, 'wood', 'wood', bottom=True)
            box(mb, 0, ty, ZW + 0.2, 0.42, 0.45, (RIDGE - ZW) - 0.8, 'wood', 'brass', top_on=False)
            if lod == 0:
                for sx in (-1, 1):
                    box(mb, sx * 3.8, ty, ZW - 0.35, 0.55, 0.52, 0.65, 'iron', 'iron', bottom=True)
        # Пилястры вдоль внутренних стен (вместо глухой коробки — ритм колонн L2)
        for sx in (-1, 1):
            pxi = sx * (IHW - 0.28)
            for py in (-5.5, 0.5, 6.5):
                box(mb, pxi, py, PLINTH_TOP, 0.65, 0.85, ZW - PLINTH_TOP - 0.3, 'stone', 'frieze', bottom=False)
                if lod == 0:
                    box(mb, pxi, py, PLINTH_TOP + 3.8, 0.72, 0.92, 0.30, 'brass', 'brass', top_on=False)
            # Панели интерьера и внутренние светящиеся окна (между пилястрами)
            for py in (-2.5, 3.5, 9.2):
                window_frame(mb, -sx * 0 + sx * IHW, py, PLINTH_TOP + 3.0, 1.5, 4.4, (-sx, 0, 0), lod, trim=False)
            if lod == 0:
                for py in (-7.6, -2.5, 3.5, 9.2):
                    decal(mb, (sx * (IHW - 0.03), py, PLINTH_TOP + 1.3), (0, sx, 0), (0, 0, 1), 2.4, 2.4, 'plaster', (-sx, 0, 0))
        # Внутренние окна и герб на задней стене за Командором
        for x in (-4.8, 4.8):
            window_frame(mb, x, IYB, PLINTH_TOP + 3.2, 1.5, 4.2, (0, -1, 0), lod, trim=False)
        decal(mb, (0, IYB - 0.05, PLINTH_TOP + 5.6), (-1, 0, 0), (0, 0, 1), 2.8, 2.8, 'emblem', (0, -1, 0))
        decal(mb, (0, IYB - 0.05, ZW + 2.8), (-1, 0, 0), (0, 0, 1), 3.8, 3.8, 'gear_window', (0, -1, 0))
        decal(mb, (0, IYF + 0.05, ZW + 2.8), (1, 0, 0), (0, 0, 1), 3.8, 3.8, 'gear_window', (0, 1, 0))

        # Паровой очаг-котел в дальнем правом углу (+X, +Y), связанный с наружной трубой
        bx, by = 6.2, 10.3
        box(mb, bx, by, PLINTH_TOP, 2.1, 2.1, 3.6, 'iron', 'brass')
        box(mb, bx, by, PLINTH_TOP + 3.6, 1.3, 1.3, ZW - (PLINTH_TOP + 3.6) + 1.5, 'iron', 'iron', top_on=False)
        decal(mb, (bx - 1.07, by, PLINTH_TOP + 1.15), (0, 1, 0), (0, 0, 1), 1.0, 1.1, 'glow', (-1, 0, 0))
        decal(mb, (bx, by - 1.07, PLINTH_TOP + 1.15), (1, 0, 0), (0, 0, 1), 1.0, 1.1, 'glow', (0, -1, 0))

    # --- контрфорсы и окна снаружи ---
    ys = [-6.5, -1.5, 3.5, 8.5]
    for side in (-1, 1):
        xf = side * HW
        for y in ys:
            buttress(mb, xf, y, side, lod)
        for y in (-4.0, 1.0, 6.0, 11.0):
            window_frame(mb, xf, y, PLINTH_TOP + 3.0, 1.6, 4.6, (side, 0, 0), lod)
    for x in (-4.8, 4.8):
        window_frame(mb, x, YB, PLINTH_TOP + 3.0, 1.6, 4.6, (0, 1, 0), lod)

    # --- башни: западная уцелела со сколами зубцов, восточная ЧАСТИЧНО РАЗРУШЕНА взрывом ---
    # 1) Западная башня (side = -1): высокая, с шатровой кровлей и сколом части зубцов
    txL = -TX
    box(mb, txL, TY, PLINTH_TOP, TW, TW, TH - PLINTH_TOP, 'stone', 'stone', top_on=(lod == 2))
    if lod <= 1:
        box(mb, txL, TY, TH - 0.5, TW + 0.6, TW + 0.6, 0.5, 'frieze', 'stone', top_on=False)
        box(mb, txL, TY, TH, TW + 0.6, TW + 0.6, 0.45, 'stone', 'flag')
    roof_zL = TH + (0.45 if lod <= 1 else 0.0)
    if lod == 0:
        for k in range(4):
            for idx_t, t in enumerate((-0.36, 0.0, 0.36)):
                if (k == 1 and idx_t == 2) or (k == 2 and idx_t == 0):
                    continue  # выбитые угловые зубцы башни
                w = TW + 0.6
                if k == 0:
                    px, py = txL + t * w, TY - w / 2 + 0.25
                elif k == 1:
                    px, py = txL + w / 2 - 0.25, TY + t * w
                elif k == 2:
                    px, py = txL - t * w, TY + w / 2 - 0.25
                else:
                    px, py = txL - w / 2 + 0.25, TY - t * w
                box(mb, px, py, roof_zL, 0.8, 0.8, 1.0 if idx_t != 1 else 0.72, 'stone', 'ruin')
    pyr = TW - 1.4 if lod == 0 else TW + 0.2
    pyramid(mb, txL, TY, roof_zL + (0.3 if lod == 0 else 0.0), pyr, pyr, 7.2, 'slate')
    if lod <= 1:
        cone_spike(mb, txL, TY, roof_zL + 7.2, 0.18, 2.2, 6)
    for zz in (PLINTH_TOP + 7.2, PLINTH_TOP + 12.6):
        window_frame(mb, txL, TY - TW / 2, zz, 1.2, 3.2, (0, -1, 0), lod)
        window_frame(mb, txL - TW / 2, TY, zz, 1.2, 3.2, (-1, 0, 0), lod)

    # 2) Восточная башня (side = +1): обрушена до ~15 м с рваным изломом кладки, балочными балками и заложенным окном!
    txR = +TX
    TH_BRK = PLINTH_TOP + 10.6
    box(mb, txR, TY, PLINTH_TOP, TW, TW, TH_BRK - PLINTH_TOP, 'stone', 'flag', top_on=True)
    rnd_tw = random.Random(309)
    # 4 рваные обломанные стены верхнего яруса правой башни (выше на левой-задней стороне к центру, обвал справа-спереди!)
    wall_t_brk = 0.85
    half_tw = TW * 0.5
    p_w = jagged_profile(TW, 1.2, 5.4, 0.9 if lod == 0 else 1.8, rnd_tw, lambda t: 1.0 - t * 0.55)
    p_s = jagged_profile(TW, 0.8, 3.4, 0.9 if lod == 0 else 1.8, rnd_tw, lambda t: 1.0 - t * 0.72)
    p_e = jagged_profile(TW, 0.5, 2.6, 0.9 if lod == 0 else 1.8, rnd_tw, lambda t: t * 0.8 + 0.2)
    p_n = jagged_profile(TW, 1.8, 5.8, 0.9 if lod == 0 else 1.8, rnd_tw, lambda t: 0.45 + 0.55 * (1.0 - t))
    old_m = mb.M
    mb.M = Matrix.Translation((txR, TY - half_tw + wall_t_brk * 0.5, TH_BRK))
    ruin_wall(mb, TW, wall_t_brk, p_s, strip='stone', cap='ruin')
    mb.M = Matrix.Translation((txR, TY + half_tw - wall_t_brk * 0.5, TH_BRK)) @ Matrix.Rotation(math.pi, 4, 'Z')
    ruin_wall(mb, TW, wall_t_brk, p_n, strip='stone', cap='ruin')
    mb.M = Matrix.Translation((txR - half_tw + wall_t_brk * 0.5, TY, TH_BRK)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    ruin_wall(mb, TW, wall_t_brk, p_w, strip='stone', cap='ruin')
    mb.M = Matrix.Translation((txR + half_tw - wall_t_brk * 0.5, TY, TH_BRK)) @ Matrix.Rotation(+math.pi / 2, 4, 'Z')
    ruin_wall(mb, TW, wall_t_brk, p_e, strip='ruin', cap='ruin')
    mb.M = old_m
    if lod <= 1:
        # Обломленные деревянные балки перекрытия, покорёженный стояк трубы и завалы в верху башни
        for bx_o, by_o, rz_o, ry_o, len_b in ((-0.7, 0.4, 0.25, 0.28, 3.8), (0.8, -0.5, -0.35, -0.22, 3.1), (0.1, 1.2, 0.85, 0.16, 2.9)):
            old_m = mb.M
            mb.M = Matrix.Translation((txR + bx_o, TY + by_o, TH_BRK + 1.8)) @ Matrix.Rotation(rz_o, 4, 'Z') @ Matrix.Rotation(ry_o, 4, 'Y')
            box(mb, 0, 0, -0.15, len_b, 0.30, 0.30, 'wood', 'wood', bottom=True)
            mb.M = old_m
        old_m = mb.M
        mb.M = Matrix.Translation((txR + 1.1, TY + 1.1, TH_BRK)) @ Matrix.Rotation(-0.35, 4, 'X')
        cylinder(mb, 0.18, 0.18, 0.0, 3.6, 8, 'brass', u_units=0.19, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='tRpipe')
        mb.M = old_m
        for cx_c, cy_c, sx_c, sy_c, sz_c, yaw_c, t_c in (
            (-0.6, -0.4, 1.3, 0.9, 0.7, 0.4, 0.15),
            (0.9, 0.6, 1.1, 0.8, 0.6, -0.7, -0.20),
        ):
            chunk(mb, txR + cx_c, TY + cy_c, TH_BRK + sz_c * 0.5, sx_c, sy_c, sz_c, yaw_c, t_c, 'ruin')
    # Окна целого нижнего яруса правой башни + забитое деревянными балками верхнее окно
    window_frame(mb, txR, TY - TW / 2, PLINTH_TOP + 7.2, 1.2, 3.2, (0, -1, 0), lod)
    window_frame(mb, txR + TW / 2, TY, PLINTH_TOP + 7.2, 1.2, 3.2, (1, 0, 0), lod)
    if lod <= 1:
        for b_ang in (-0.32, 0.32):
            old_m = mb.M
            mb.M = Matrix.Translation((txR, TY - TW / 2 - 0.10, PLINTH_TOP + 8.6)) @ Matrix.Rotation(b_ang, 4, 'Y')
            box(mb, 0, 0, -0.09, 1.85, 0.14, 0.18, 'wood', 'wood', bottom=True)
            mb.M = old_m

    # --- главный вход: клинчатый арочный портал (0 копланарности с фасадом!) ---
    if lod <= 1:
        for sx in (-1, 1):
            box(mb, sx * (DW + 0.45), YF - 0.35, PLINTH_TOP, 0.90, 0.66, DSPRING - PLINTH_TOP, 'stone', 'stone')
        n = 9
        for i in range(n):
            a0 = math.pi * i / n + 0.006
            a1 = math.pi * (i + 1) / n - 0.006
            wedge_block(mb, a0, a1, DW, DW + 0.92, YF - 0.34, 0.72, 0.0, DSPRING)
            if lod == 0:
                wedge_block(mb, a0, a1, DW, DW + 0.72, IYF + 0.16, 0.36, 0.0, DSPRING)
    # герб над порталом и окно-шестерня во фронтоне
    decal(mb, (0, YF - 0.08, DHEAD + 2.1), (1, 0, 0), (0, 0, 1), 2.5, 2.5, 'emblem', (0, -1, 0))
    decal(mb, (0, YF - 0.06, ZW + 2.8), (1, 0, 0), (0, 0, 1), 4.0, 4.0, 'gear_window', (0, -1, 0))
    for x in (-5.2, 5.2):
        window_frame(mb, x, YF, PLINTH_TOP + 3.2, 1.4, 4.2, (0, -1, 0), lod)

    # --- 6 плавных ступеней от каменной террасы двора прямо к порталу (шаг 0.225 м — 100% проходимо, 0 z-fighting!) ---
    stair_w = 8.8
    step_depths = [4.95, 4.10, 3.25, 2.40, 1.55, 0.70]
    for k, depth in enumerate(step_depths):
        top_z = 1.15 + 0.225 * k
        y_front = PY0 - depth
        d_slab = 0.86 if k < 5 else 0.72
        box(mb, 0, y_front + d_slab / 2, 0.0, stair_w, d_slab, top_z,
            'stone', 'flag', bottom=True, sides=(True, True, True, True))
    # парапеты по бокам лестницы (правый угол слегка обломан боем!)
    box(mb, -(stair_w / 2 + 0.44), PY0 - 2.45, 0.0, 0.88, 4.9, PLINTH_TOP + 0.55, 'frieze', 'flag', bottom=True)
    box(mb, +(stair_w / 2 + 0.44), PY0 - 1.95, 0.0, 0.88, 3.9, PLINTH_TOP + 0.42, 'ruin', 'flag', bottom=True)
    if lod <= 1:
        box(mb, -(stair_w / 2 + 0.44), PY0 - 4.55, 0.0, 1.05, 0.95, 2.15, 'stone', 'brass')
        chunk(mb, +(stair_w / 2 + 0.44), PY0 - 4.25, 0.55, 1.05, 1.05, 1.1, 0.15, -0.18, 'ruin')

    # --- наружная паровая обвязка и манометрические узлы на фасаде и флангах Бастиона ---
    if lod <= 1:
        for sx in (-1, 1):
            # невысокие латунные стойки вдоль портала и компактные боковые магистрали на флангах башен
            for px_p, py_p, z0_p, z1_p in (
                (sx * (DW + 0.95), YF - 0.22, PLINTH_TOP, DHEAD + 0.8),
                (sx * (TX + TW / 2 + 0.16), TY + 2.1, PLINTH_TOP, (TH - 5.0) if sx < 0 else (TH_BRK - 1.2)),
            ):
                old = mb.M
                mb.M = Matrix.Translation((px_p, py_p, 0))
                cylinder(mb, 0.13, 0.13, z0_p, z1_p, 6, 'brass', u_units=0.19, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='extpipe%s%s' % (sx, py_p))
                mb.M = old
                if lod == 0:
                    for zc in (z0_p + 1.4, z0_p + 4.4):
                        box(mb, px_p, py_p, zc, 0.32, 0.32, 0.24, 'iron', 'iron')
        # горизонтальный коллектор по боковой стене от котла к залу (+HW)
        old = mb.M
        mb.M = Matrix.Translation((HW + 0.32, 8.2, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        cylinder(mb, 0.22, 0.22, -4.5, 4.5, 8, 'brass', u_units=0.22, stretch=True, skey='sidehdr')
        mb.M = old

    # --- дымовая труба котельной и паропроводы ---
    cx, cy = 5.8, YB - 1.6
    ch_top = RIDGE + 5.2
    box(mb, cx, cy, PLINTH_TOP, 2.6, 2.6, ch_top - PLINTH_TOP, 'stone', 'iron', top_on=False)
    if lod <= 1:
        for zz in (ZW + 1.0, RIDGE - 1.0, ch_top - 1.6):
            box(mb, cx, cy, zz, 2.85, 2.85, 0.4, 'brass', 'brass', top_on=False)
        box(mb, cx, cy, ch_top, 3.0, 3.0, 0.45, 'iron', 'iron', top_on=False)
        planar_top(mb, [(cx - 1.3, cy - 1.3, ch_top + 0.45), (cx + 1.3, cy - 1.3, ch_top + 0.45),
                        (cx + 1.3, cy + 1.3, ch_top + 0.45), (cx - 1.3, cy + 1.3, ch_top + 0.45)], cell='dark')
        for k, (x0, y0) in enumerate(((HW + 0.35, 11.6), (HW + 0.35, 12.2), (-HW - 0.35, 11.8))):
            old = mb.M
            mb.M = Matrix.Translation((x0, y0, 0))
            cylinder(mb, 0.24, 0.24, PLINTH_TOP, ZW + 1.2, 8, 'brass', u_units=0.19, stretch=True, skey='pipe%d' % k)
            mb.M = old
    else:
        box(mb, cx, cy, ch_top, 3.0, 3.0, 0.45, 'iron', 'iron')

    # --- ТОЧНЫЕ КОЛЛАЙДЕРЫ: 6 плавных ступеней + пол зала + подиум + стены с проёмом ---
    cols = []
    for k, depth in enumerate(step_depths):
        top_z = 1.15 + 0.225 * k
        cy_s = PY0 - depth + 0.55
        cols.append((0.0, cy_s, stair_w, 1.20, top_z, 0.0, True))
    cols.extend([
        # Проходимый пол зала + крыльцо (+1.20 м над опорой)
        (0.0, (PY0 + PY1) / 2, 19.2, PY1 - PY0 + 0.4, PLINTH_TOP, 0.0, True),
        # Проходимый подиум Командора в глубине зала (+1.35/+1.50 м)
        (0.0, 6.10, 7.2, 0.90, PLINTH_TOP + 0.15, 0.0, True),
        (0.0, 8.95, 8.8, 4.90, PLINTH_TOP + 0.30, 0.0, True),
        # Боковые парапеты лестницы
        (-(stair_w / 2 + 0.44), PY0 - 2.45, 0.90, 5.0, PLINTH_TOP + 0.6, 0.0, False),
        (+(stair_w / 2 + 0.44), PY0 - 2.45, 0.90, 5.0, PLINTH_TOP + 0.6, 0.0, False),
        # Стены зала (оставляют открытыми проём шириной 5.2 м и весь зал 15.6×21.6 м)
        (-HW + WALL_T / 2, 1.0, WALL_T + 0.4, (YB - YF) + 0.4, 24.0, 0.0, False),
        (+HW - WALL_T / 2, 1.0, WALL_T + 0.4, (YB - YF) + 0.4, 24.0, 0.0, False),
        (0.0, (IYB + YB) / 2, 2 * HW + 0.4, WALL_T + 0.4, 24.0, 0.0, False),
        (-pier_x, (YF + IYF) / 2, pier_w + 0.2, WALL_T + 0.4, 24.0, 0.0, False),
        (+pier_x, (YF + IYF) / 2, pier_w + 0.2, WALL_T + 0.4, 24.0, 0.0, False),
        # Наружные башни и контрфорсный пояс цоколя
        (-TX, TY, TW + 0.2, TW + 0.2, 30.0, 0.0, False),
        (+TX, TY, TW + 0.2, TW + 0.2, 30.0, 0.0, False),
        (-HW - 0.8, 1.0, 1.6, 23.0, PLINTH_TOP + 0.2, 0.0, False),
        (+HW + 0.8, 1.0, 1.6, 23.0, PLINTH_TOP + 0.2, 0.0, False),
        # Котельная печь в дальнем углу зала
        (6.2, 10.3, 2.2, 2.2, 6.0, 0.0, False),
    ])
    return mb, cols


def build_plaza_deck(lod):
    """Ровная каменная терраса плаца/площади 8×8 м без нахлёста на соседние плиты (0 z-fighting)."""
    mb = MB()
    H = 1.80
    box(mb, 0, 0, 0.0, 7.988, 7.988, H - 0.145, 'stone', 'flag', top_on=False, bottom=True)
    box(mb, 0, 0, H - 0.145, 7.996, 7.996, 0.145, 'frieze', 'flag', bottom=True)
    if lod == 0:
        # декоративные латунные заклёпки по углам (+2.4 см над настилом, без копланарности)
        for sx in (-3.6, 3.6):
            for sy in (-3.6, 3.6):
                box(mb, sx, sy, H + 0.002, 0.44, 0.44, 0.024, 'brass', 'brass', bottom=True)
    return mb, [(0, 0, 8.0, 8.0, H, 0.0, True)]


def build_plaza_deck_cracked(lod):
    """Повреждённая плита площади 8×8 м: твёрдая поверхность + расколотые плиты разного тона, трещины 4 см и осколки (0 висящих ножек!)."""
    mb = MB()
    rnd = random.Random(71)
    H = 1.80
    # Твёрдая каменная подоснова всего на 5 см ниже верха — ни один проп или нога персонажа не проваливается!
    box(mb, 0, 0, 0.0, 7.988, 7.988, H - 0.05, 'stone', 'ruin', bottom=True)
    for ix in range(4):
        for iy in range(4):
            cx = -3.0 + ix * 2.0
            cy = -3.0 + iy * 2.0
            is_scar = (ix, iy) in ((1, 0), (2, 1), (0, 3), (3, 2))
            drop = -0.032 if is_scar else (-0.015 if (ix + iy) % 3 == 0 else 0.0)
            top_strip = 'ruin' if is_scar else ('stone' if (ix * 3 + iy) % 4 == 0 else 'flag')
            box(mb, cx, cy, H - 0.14, 1.94, 1.94, 0.14 + drop, 'frieze', top_strip, bottom=True)
            if lod == 0 and is_scar:
                chunk(mb, cx + rnd.uniform(-0.25, 0.25), cy + rnd.uniform(-0.25, 0.25), H - 0.02,
                      0.85, 0.62, 0.08, rnd.uniform(-0.7, 0.7), rnd.uniform(-0.06, 0.06), 'ruin')
    return mb, [(0, 0, 8.0, 8.0, H, 0.0, True)]


def build_plaza_deck_scorched(lod):
    """Выжженная и иссечённая осколками плита 8×8 м с диагональным разломом мозаики и сажей."""
    mb = MB()
    rnd = random.Random(137)
    H = 1.80
    box(mb, 0, 0, 0.0, 7.988, 7.988, H - 0.05, 'stone', 'ruin', bottom=True)
    for ix in range(4):
        for iy in range(4):
            cx = -3.0 + ix * 2.0
            cy = -3.0 + iy * 2.0
            diag = abs(ix - iy) <= 0 or (ix == 2 and iy == 1)
            drop = -0.044 if diag else (-0.018 if (ix + iy) % 2 == 0 else 0.0)
            top_strip = 'ruin' if (ix == iy and ix in (1, 2)) else ('stone' if diag else 'flag')
            box(mb, cx, cy, H - 0.14, 1.93, 1.93, 0.14 + drop, 'stone', top_strip, bottom=True)
            if lod == 0 and diag and (ix + iy) % 2 == 0:
                chunk(mb, cx + rnd.uniform(-0.2, 0.2), cy + rnd.uniform(-0.2, 0.2), H - 0.02,
                      0.82, 0.58, 0.075, rnd.uniform(-0.9, 0.9), rnd.uniform(-0.06, 0.06), 'ruin')
    return mb, [(0, 0, 8.0, 8.0, H, 0.0, True)]


def build_plaza_deck_edge(lod):
    """Обрушенный внешний край террасы 8×8 м: рваный слом кладки, просевшие камни и осыпь вниз."""
    mb = MB()
    rnd = random.Random(89)
    H = 1.80
    # Утопленное рваное основание сохраняет точный центр bbox [-3.99..+3.99] без смещения якоря!
    box(mb, 0, 0, 0.0, 7.98, 7.98, 0.55, 'ruin', 'ruin', bottom=True)
    # Северная/левая половина плиты целее, правая-южная обрушена вниз
    keep = {(0, 0), (1, 0), (0, 1), (1, 1), (0, 2), (1, 2), (2, 0), (2, 1), (0, 3)}
    for ix in range(4):
        for iy in range(4):
            cx = -3.0 + ix * 2.0
            cy = -3.0 + iy * 2.0
            if (ix, iy) in keep:
                h_loc = H - (0.08 if ix == 2 or iy == 3 else 0.0)
                box(mb, cx, cy, 0.45, 1.95, 1.95, h_loc - 0.45, 'stone', 'flag', bottom=True)
            elif lod <= 1:
                tilt = rnd.uniform(-0.22, -0.08)
                old = mb.M
                mb.M = Matrix.Translation((cx, cy, 0.72 + rnd.uniform(-0.18, 0.22))) @ Matrix.Rotation(rnd.uniform(0, 1.2), 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y')
                box(mb, 0, 0, -0.25, 1.65, 1.45, 0.48, 'ruin', 'flag', bottom=True)
                mb.M = old
    return mb, [(0, 0, 8.0, 8.0, H, 0.0, True)]


def build_plaza_steps(lod):
    """Широкая 6-ступенчатая каменная лестница 8×4.2 м (шаг 0.225 м) без компланарного нахлёста."""
    mb = MB()
    W = 7.994
    cols = []
    for k in range(6):
        top_z = 0.675 + 0.225 * k  # 0.675, 0.900, 1.125, 1.350, 1.575, 1.800
        cy = -1.75 + 0.70 * k
        # Каждая ступень 0.715 м со всеми боковыми и нижней гранями — 0 дыр под любым углом
        box(mb, 0, cy, 0.0, W, 0.715, top_z, 'stone', 'flag', bottom=True, sides=(True, True, True, True))
        cols.append((0, cy, 8.0, 1.08, top_z, 0.0, True))
    if lod <= 1:
        for sx in (-1, 1):
            box(mb, sx * 4.42, 0.0, 0.0, 0.836, 4.35, 2.35, 'frieze', 'brass', bottom=True)
    cols.append((-4.42, 0.0, 0.84, 4.35, 2.35, 0.0, False))
    cols.append((+4.42, 0.0, 0.84, 4.35, 2.35, 0.0, False))
    return mb, cols


def build_gate_steps(lod):
    """Пологие широкие входные ступени от уровня земли через южную арку к Tier 2 (шаг 0.225 м, глубокий цоколь)."""
    mb = MB()
    W = 7.994
    cols = []
    # Заглублённый цоколь/порог от -0.35 до +0.28, заходящий вперёд под южную арку (шаг <= 0.14 м от грунта)
    box(mb, 0, -3.15, -0.35, W, 1.40, 0.63, 'stone', 'flag', bottom=True)
    cols.append((0, -3.15, 8.0, 1.60, 0.63, -0.35, True))
    # 9 последовательных ступеней вверх до отметки верхней площадки (z = 2.25, +2.60 м от низа)
    for k in range(9):
        top_z = 0.450 + 0.225 * k
        cy = -2.30 + 0.62 * k
        box(mb, 0, cy, -0.35, W, 0.64, top_z + 0.35, 'stone', 'flag', bottom=True, sides=(True, True, True, True))
        cols.append((0, cy, 8.0, 1.00, top_z + 0.35, -0.35, True))
    if lod <= 1:
        # Низкие каменные бортики только вдоль верхнего марша, не мешают входу под аркой
        for sx in (-1, 1):
            box(mb, sx * 4.42, 0.35, -0.35, 0.836, 4.90, 2.75, 'frieze', 'brass', bottom=True)
    cols.append((-4.42, 0.35, 0.84, 4.90, 2.75, -0.35, False))
    cols.append((+4.42, 0.35, 0.84, 4.90, 2.75, -0.35, False))
    return mb, cols


def build_bastion_parapet(lod):
    """Крепостной парапет L2 4 м: стыкуется с шагом 4.0 м ровно (без 8-см нахлёста и мерцания)."""
    mb = MB()
    SKIRT = 1.40
    WALL_H = 1.15
    box(mb, 0, 0, 0.0, 3.990, 0.92, SKIRT + WALL_H, 'stone', 'frieze', top_on=False, bottom=True)
    box(mb, 0, 0, SKIRT + WALL_H, 3.998, 1.04, 0.18, 'frieze', 'stone', bottom=True)
    if lod <= 1:
        for sx in (-1.35, 0.0, 1.35):
            box(mb, sx, 0, SKIRT + WALL_H + 0.18, 0.85, 0.85, 0.45, 'stone', 'frieze', bottom=True)
        old = mb.M
        mb.M = Matrix.Rotation(math.pi / 2, 4, 'Y')
        cylinder(mb, 0.08, 0.08, -1.94, 1.94, 6, 'iron', u_units=0.15, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='prail')
        mb.M = old
    return mb, [(0, 0, 4.0, 0.95, SKIRT + WALL_H + 0.65, 0.0, False)]


def build_pennant_wall(lod):
    """Двусторонний строгий штандарт-вымпел Операторов: чистая багровая ткань и латунная окантовка (без гербового спама)."""
    mb = MB()
    # Крепление-планка, уходящая в стену/колонну на Y=0
    box(mb, 0, 0.02, 1.40, 0.16, 0.12, 1.35, 'iron', 'iron', bottom=True)
    old = mb.M
    mb.M = Matrix.Translation((0, -0.11, 2.92)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    cylinder(mb, 0.055, 0.055, -0.62, 0.62, 6, 'brass', u_units=0.18, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='pwbar')
    mb.M = old
    # 2D-контур двустороннего объёмного вымпела (Y в [-0.135 .. -0.085], толщина 5 см!)
    y_f, y_b = -0.138, -0.082
    w_half = 0.42
    z_top = 2.86
    z_cut = 0.72
    z_tip = 0.22
    # Верхний прямоугольник полотнища + треугольный клин хвоста (обе стороны)
    u0, u1, v0, v1 = 0.07, 0.17, 0.82, 0.92
    cu0, cv0 = cell_uv('emblem', u0, v0)
    cu1, cv1 = cell_uv('emblem', u1, v1)
    cuM = (cu0 + cu1) * 0.5
    for yy, ny, rev in ((y_f, (0, -1, 0), False), (y_b, (0, 1, 0), True)):
        p_tl = (-w_half, yy, z_top)
        p_tr = (+w_half, yy, z_top)
        p_bl = (-w_half, yy, z_cut)
        p_br = (+w_half, yy, z_cut)
        p_pt = (0.0, yy, z_tip)
        q_rect = [p_bl, p_br, p_tr, p_tl] if not rev else [p_br, p_bl, p_tl, p_tr]
        uv_rect = [(cu0, cv0), (cu1, cv0), (cu1, cv1), (cu0, cv1)]
        mb.poly(q_rect, uv_rect, ny)
        q_tri = [p_pt, p_br, p_bl] if not rev else [p_pt, p_bl, p_br]
        mb.poly(q_tri, [(cuM, cv0), (cu1, cv1), (cu0, cv1)], ny)
    # Торцы ткани, чтобы полотнище было герметичным под любым углом сбоку
    gu0, gv0 = cell_uv('emblem', 0.01, 0.20)
    gu1, gv1 = cell_uv('emblem', 0.03, 0.80)
    guv = [(gu0, gv0), (gu1, gv0), (gu1, gv1), (gu0, gv1)]
    mb.poly([(-w_half, y_b, z_cut), (-w_half, y_f, z_cut), (-w_half, y_f, z_top), (-w_half, y_b, z_top)], guv, (-1, 0, 0))
    mb.poly([(w_half, y_f, z_cut), (w_half, y_b, z_cut), (w_half, y_b, z_top), (w_half, y_f, z_top)], guv, (1, 0, 0))
    mb.poly([(0.0, y_f, z_tip), (0.0, y_b, z_tip), (-w_half, y_b, z_cut), (-w_half, y_f, z_cut)], guv, (-1, 0, -1))
    mb.poly([(w_half, y_f, z_cut), (w_half, y_b, z_cut), (0.0, y_b, z_tip), (0.0, y_f, z_tip)], guv, (1, 0, -1))
    if lod <= 1:
        box(mb, 0, -0.11, z_top - 0.04, 0.92, 0.09, 0.09, 'brass', 'brass', bottom=True)
        for sx in (-1, 1):
            box(mb, sx * w_half, -0.11, z_cut, 0.065, 0.075, z_top - z_cut, 'brass', 'brass', bottom=True)
    return mb, []


def build_banner_wall(lod):
    """Настенное / колонное полотнище Операторов: плотно прилегает к стене, багрово-латунный герб."""
    mb = MB()
    # Задняя несущая крепёжная планка (утопляется в каменную стену/колонну на Y=0)
    box(mb, 0, 0.02, 1.15, 0.24, 0.14, 1.65, 'iron', 'iron', bottom=True)
    # Горизонтальная перекладина-копьё наверху
    old = mb.M
    mb.M = Matrix.Translation((0, -0.10, 2.82)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    cylinder(mb, 0.06, 0.06, -0.92, 0.92, 6, 'brass', u_units=0.18, stretch=True, top='flat', bottom='flat', cap_cell='dark', skey='bwbar')
    mb.M = old
    if lod == 0:
        for sx in (-1, 1):
            box(mb, sx * 0.95, -0.10, 2.82, 0.14, 0.14, 0.14, 'brass', 'brass', bottom=True)
    # Багровое полотнище с гербом Операторов (каркас iron + лицевые/задние декали emblem)
    box(mb, 0, -0.10, 0.45, 1.34, 0.05, 2.30, 'iron', 'iron', bottom=True)
    decal(mb, (0, -0.132, 1.60), (1, 0, 0), (0, 0, 1), 1.26, 2.18, 'emblem', (0, -1, 0))
    decal(mb, (0, -0.068, 1.60), (-1, 0, 0), (0, 0, 1), 1.26, 2.18, 'emblem', (0, 1, 0))
    if lod <= 1:
        # Верхняя и нижняя латунные планки-рамки
        box(mb, 0, -0.10, 2.74, 1.44, 0.09, 0.10, 'brass', 'brass', bottom=True)
        box(mb, 0, -0.10, 0.40, 1.42, 0.08, 0.12, 'brass', 'brass', bottom=True)
        for sx in (-1, 1):
            box(mb, sx * 0.67, -0.10, 0.45, 0.07, 0.08, 2.30, 'brass', 'brass', bottom=True)
    return mb, []


PIECES = [
    ('opt_bastion', build_bastion, {'drawDist': 1000, 'lodDist': [110, 280]}),
    ('opt_plaza_deck', build_plaza_deck, {'drawDist': 560, 'lodDist': [80, 200], 'shadow': False}),
    ('opt_plaza_deck_cracked', build_plaza_deck_cracked, {'drawDist': 560, 'lodDist': [80, 200], 'shadow': False}),
    ('opt_plaza_deck_scorched', build_plaza_deck_scorched, {'drawDist': 560, 'lodDist': [80, 200], 'shadow': False}),
    ('opt_plaza_deck_edge', build_plaza_deck_edge, {'drawDist': 560, 'lodDist': [80, 200], 'shadow': False}),
    ('opt_plaza_steps', build_plaza_steps, {'drawDist': 460, 'lodDist': [70, 170], 'shadow': False}),
    ('opt_gate_steps', build_gate_steps, {'drawDist': 460, 'lodDist': [70, 170], 'shadow': False}),
    ('opt_bastion_parapet', build_bastion_parapet, {'drawDist': 440, 'lodDist': [75, 165]}),
    ('opt_banner_wall', build_banner_wall, {'drawDist': 340, 'lodDist': [80, 180], 'shadow': False}),
    ('opt_pennant_wall', build_pennant_wall, {'drawDist': 340, 'lodDist': [80, 180], 'shadow': False}),
    ('opt_column', build_column, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('opt_column_broken', build_column_broken, {'drawDist': 480, 'lodDist': [55, 140]}),
    ('opt_column_stump', build_column_stump, {'drawDist': 300, 'lodDist': [45, 110]}),
    ('opt_column_fallen', build_column_fallen, {'drawDist': 320, 'lodDist': [45, 110]}),
    ('opt_arch', build_arch, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('opt_ruin_long', build_ruin_long, {'drawDist': 480, 'lodDist': [55, 140]}),
    ('opt_ruin_corner', build_ruin_corner, {'drawDist': 360, 'lodDist': [50, 120]}),
    ('opt_ruin_tower', build_ruin_tower, {'drawDist': 520, 'lodDist': [70, 175]}),
    ('opt_ruin_bridge', build_ruin_bridge, {'drawDist': 520, 'lodDist': [70, 175]}),
    ('opt_ruin_gear_wreck', build_ruin_gear_wreck, {'drawDist': 380, 'lodDist': [60, 145]}),
    ('opt_ruin_crater', build_ruin_crater, {'drawDist': 340, 'lodDist': [55, 130], 'shadow': False}),
    ('opt_debris', build_debris, {'drawDist': 240, 'lodDist': [40, 100], 'shadow': False}),
    ('opt_block', build_block, {'drawDist': 200, 'lodDist': [40, 100], 'shadow': False}),
    ('opt_slab', build_slab, {'drawDist': 200, 'lodDist': [35, 90], 'shadow': False}),
    ('opt_hero_monument', build_hero_monument, {'drawDist': 460, 'lodDist': [65, 160]}),
    ('opt_lamp', build_lamp, {'drawDist': 260, 'lodDist': [40, 100]}),
]

import kit_unique
kit_unique.register_pieces(globals(), PIECES)


# ============================================================
#  Экспорт
# ============================================================
def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def make_material():
    mat = bpy.data.materials.get('opt_atlas') or bpy.data.materials.new('opt_atlas')
    mat.use_backface_culling = True      # glTF doubleSided=false: одна сторона, без двойной заливки
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


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = None
    if '--' in sys.argv:
        args = sys.argv[sys.argv.index('--') + 1:]
        if args:
            only = set(args)
    manifest = {'atlas': 'opt_atlas.webp', 'dir': 'operators', 'pieces': {}}
    if os.path.exists(MANIFEST) and only:
        manifest = json.load(open(MANIFEST, encoding='utf-8'))
    for name, fn, meta in PIECES:
        if only and name not in only:
            continue
        clear_scene()
        mat = make_material()
        builds = []
        for lod in (0, 1, 2):
            mb, cols = fn(lod)
            builds.append((mb, cols))
        # центр по bbox LOD0 (XY) и низ = 0, чтобы нормализация пивота в игре ничего не сдвигала
        bx0, bx1, by0, by1, bz0, bz1 = bounds(builds[0][0])
        ox = (bx0 + bx1) / 2
        oy = (by0 + by1) / 2
        oz = bz0
        objs = []
        tris = [b[0].tris() for b in builds]
        # Ярус LOD — это отдельный InstancedMesh, то есть ещё один draw call (и теневой).
        # Экспортируем ярус, только если он заметно легче предыдущего (≤ 70% треугольников).
        kept = [0]
        for lod in (1, 2):
            if tris[lod] <= 0.7 * tris[kept[-1]]:
                kept.append(lod)
        for lod in kept:
            mb = builds[lod][0]
            mb.v = [(v[0] - ox, v[1] - oy, v[2] - oz) for v in mb.v]
            nm = name if lod == 0 else '%s_LOD%d' % (name, lod)
            ob = mb.to_object(nm, mat)
            objs.append(ob)
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        out = os.path.join(OUT_DIR, name + '.glb')
        bpy.ops.export_scene.gltf(
            filepath=out,
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
        cols = builds[0][1]
        # коллайдеры → оси игры: x = x, z = −y (Blender −Y = игровой +Z)
        game_cols = []
        for item in cols:
            cx, cy, sx, sy, h, z0 = item[:6]
            walk = bool(item[6]) if len(item) > 6 else False
            entry = {'x': round(cx - ox, 3), 'z': round(-(cy - oy), 3), 'w': round(sx, 3), 'd': round(sy, 3),
                     'h': round(h, 3), 'y0': round(z0 - oz, 3)}
            if walk:
                entry['walkable'] = True
            game_cols.append(entry)
        manifest['pieces'][name] = {
            'file': 'operators/' + name + '.glb',
            'size': [round(bx1 - bx0, 3), round(bz1 - bz0, 3), round(by1 - by0, 3)],
            'anchorShift': [round(ox, 4), round(oz, 4), round(-oy, 4)],
            'tris': tris,
            'lods': kept,
            'bytes': os.path.getsize(out),
            'colliders': game_cols,
            **meta,
        }
        print('[kit] %-20s tris LOD0/1/2 = %5d / %5d / %5d  LODs %-9s -> %6d bytes' % (name, tris[0], tris[1], tris[2], kept, os.path.getsize(out)))
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('[kit] manifest ->', MANIFEST)


main()
