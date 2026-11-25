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


def cylinder(mb, r0, r1, z0, z1, seg, strip, u_units=None, stretch=True, top=None, top_heights=None,
             top_center=None, phase=0.0, skey='cyl', cap_cell='rough', zref=0.0):
    """Цилиндр/усечённый конус вокруг Z. top: None | 'flat' | 'jagged'.
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
    box(mb, 0, 0, 0, 1.5, 1.5, 0.45, 'stone', 'stone')
    if lod <= 1:
        seg = SEG[lod] + 4
        cylinder(mb, 0.64, 0.64, 0.45, 0.62, seg, 'stone', stretch=False, skey='b1')
        annulus(mb, 0.64, 0.56, 0.62, seg)
        cylinder(mb, 0.56, 0.52, 0.62, 0.76, seg, 'stone', stretch=False, skey='b2')
        annulus(mb, 0.52, 0.47, 0.76, seg)
        return 0.76
    return 0.45


def column_capital(mb, lod, ztop_shaft):
    if lod <= 1:
        seg = SEG[lod] + 4
        cylinder(mb, 0.42, 0.66, ztop_shaft, ztop_shaft + 0.30, seg, 'stone', stretch=False, skey='cap')
        z = ztop_shaft + 0.30
    else:
        z = ztop_shaft
    box(mb, 0, 0, z, 1.45, 1.45, 0.34, 'frieze', 'stone')
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
        cylinder(mb, r, r * 0.98, 0, L, seg, 'flutes', u_units=0.5, stretch=True, top='flat', skey='drum%d' % i)
        # нижний торец барабана тоже виден (лежит на боку)
        ring = [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), 0.0) for k in range(seg)]
        planar_top(mb, ring, cell='rough', outward=(0, 0, -1))
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
    """Руина арки: два пилона, свод из клинчатых камней, правая часть обрушена."""
    mb = MB()
    rnd = random.Random(31)
    pier = 1.4
    span = 4.2
    cxL = -(span / 2 + pier / 2)
    cxR = span / 2 + pier / 2
    hL = 5.2
    box(mb, cxL, 0, 0, pier, pier, hL, 'stone', 'stone', top_on=False)
    # правый пилон сломан на 3.9 м: неровный верх
    prof = [(0.0, 4.1), (0.35, 3.7), (0.7, 4.3), (1.05, 3.5), (1.4, 3.9)]
    wall_profile(mb, (cxR - pier / 2, -pier / 2), (cxR + pier / 2, -pier / 2), 0, prof, 'stone', (0, -1, 0))
    wall_profile(mb, (cxR + pier / 2, pier / 2), (cxR - pier / 2, pier / 2), 0, [(1.4 - s, h) for s, h in reversed(prof)], 'stone', (0, 1, 0))
    wall_rect(mb, (cxR - pier / 2, pier / 2), (cxR - pier / 2, -pier / 2), 0, prof[0][1], 'stone', (-1, 0, 0))
    wall_rect(mb, (cxR + pier / 2, -pier / 2), (cxR + pier / 2, pier / 2), 0, prof[-1][1], 'stone', (1, 0, 0))
    for i in range(len(prof) - 1):
        sa, ha = prof[i]
        sb, hb = prof[i + 1]
        x0 = cxR - pier / 2
        planar_top(mb, [(x0 + sa, -pier / 2, ha), (x0 + sb, -pier / 2, hb), (x0 + sb, pier / 2, hb), (x0 + sa, pier / 2, ha)], cell='rough')
    # импост (карнизный камень) на левом пилоне
    box(mb, cxL, 0, hL, pier + 0.3, pier + 0.3, 0.3, 'frieze', 'stone')
    # свод: 11 камней, остались 0..6 (слева через замок)
    n = 11 if lod == 0 else 7
    keep = 7 if lod == 0 else 4
    ri = span / 2 + 0.05
    ro = ri + 0.95
    for i in range(keep):
        a0 = math.pi - math.pi * i / n
        a1 = math.pi - math.pi * (i + 1) / n
        wedge_block(mb, a1, a0, ri, ro, 0.0, pier - 0.1, 0.0, hL + 0.3)
    # верхняя кладка над левым пилоном (засыпка пазухи)
    if lod <= 1:
        box(mb, cxL, 0, hL + 0.3, pier, pier - 0.1, 1.9, 'stone', 'ruin')
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


def chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, strip='ruin', bottom=False):
    mb.M = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    box(mb, 0, 0, -sz / 2, sx, sy, sz, strip, strip, bottom=bottom)
    mb.M = Matrix.Identity(4)


def build_debris(lod):
    """Куча обломков кладки."""
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
    return mb, [(0, 0, 3.2, 1.8, 1.6, 0.0)]


def build_block(lod):
    mb = MB()
    box(mb, 0, 0, 0, 1.2, 0.6, 0.55, 'stone', 'ruin')
    return mb, [(0, 0, 1.2, 0.6, 1.4, 0.0)]


def build_slab(lod):
    """Остатки мощения 3×3 м: плиты с перекосами, две выпали."""
    mb = MB()
    rnd = random.Random(61)
    step = 1.0
    missing = {(0, 2), (2, 0)}
    for i in range(3):
        for j in range(3):
            if (i, j) in missing:
                continue
            cx = -1.0 + i * step + rnd.uniform(-0.04, 0.04)
            cy = -1.0 + j * step + rnd.uniform(-0.04, 0.04)
            h = 0.22 + rnd.uniform(-0.05, 0.06)
            yaw = rnd.uniform(-0.06, 0.06)
            mb.M = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(rnd.uniform(-0.03, 0.03), 4, 'X')
            sides = (True, True, True, True) if lod < 2 else (True, False, False, True)
            box(mb, 0, 0, 0, 0.94, 0.94, h, 'stone', 'flag', sides=sides)
            mb.M = Matrix.Identity(4)
    return mb, []


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
    box(mb, 0, 0, z, 1.75, 1.75, 0.28, 'brass', 'brass')
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
    """Паровой фонарь операторов: чугунный столб, латунные пояса, светящийся фонарь."""
    mb = MB()
    seg = 8 if lod == 0 else 6
    box(mb, 0, 0, 0, 0.7, 0.7, 0.35, 'stone', 'stone')
    cylinder(mb, 0.16, 0.12, 0.35, 3.3, seg, 'iron', u_units=0.15, stretch=True, skey='post')
    if lod <= 1:
        for zb in (0.9, 2.2):
            cylinder(mb, 0.2, 0.2, zb, zb + 0.14, seg, 'brass', u_units=0.15, stretch=True, skey='bd%s' % zb)
    # фонарь: 4 светящиеся грани + латунный каркас
    z0 = 3.3
    box(mb, 0, 0, z0, 0.5, 0.5, 0.08, 'brass', 'brass')
    for (n, c, r) in (((0, -1, 0), (0, -0.2, z0 + 0.38), (1, 0, 0)), ((0, 1, 0), (0, 0.2, z0 + 0.38), (-1, 0, 0)),
                      ((1, 0, 0), (0.2, 0, z0 + 0.38), (0, 1, 0)), ((-1, 0, 0), (-0.2, 0, z0 + 0.38), (0, -1, 0))):
        decal(mb, c, r, (0, 0, 1), 0.4, 0.6, 'glow', n)
    box(mb, 0, 0, z0 + 0.68, 0.56, 0.56, 0.08, 'brass', 'brass')
    pyramid(mb, 0, 0, z0 + 0.76, 0.56, 0.56, 0.45, 'iron')
    return mb, [(0, 0, 0.7, 0.7, 3.5, 0.0)]


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

    # --- плиточный каменный пол внутри зала (на PLINTH_TOP) ---
    if lod <= 1:
        ts = 2.6
        for xi in range(6):
            for yi in range(8):
                x0 = -IHW + xi * ts
                y0 = IYF + yi * (IYB - IYF) / 8.0
                x1 = min(IHW, x0 + ts)
                y1 = IYF + (yi + 1) * (IYB - IYF) / 8.0
                pts = [(x0, y0, PLINTH_TOP + 0.008), (x1, y0, PLINTH_TOP + 0.008),
                       (x1, y1, PLINTH_TOP + 0.008), (x0, y1, PLINTH_TOP + 0.008)]
                planar_top(mb, pts, cell='tile_floor')

    # --- возвышение (подиум Командора) в дальней части зала (Y ∈ [6.5..11.4]) ---
    box(mb, 0, 6.1, PLINTH_TOP, 7.2, 0.8, 0.15, 'frieze', 'flag', bottom=False)
    box(mb, 0, 8.95, PLINTH_TOP, 8.8, 4.9, 0.30, 'frieze', 'flag', bottom=False)
    if lod <= 1:
        box(mb, 0, 8.95, PLINTH_TOP + 0.25, 8.9, 5.0, 0.06, 'brass', 'brass', top_on=False)

    # --- боковые и задняя стены (двухслойная кладка: снаружи + внутри) ---
    box(mb, -HW + WALL_T / 2, (IYF + IYB) / 2, PLINTH_TOP, WALL_T, IYB - IYF, ZW - PLINTH_TOP, 'stone', 'stone', top_on=False, bottom=False)
    box(mb, HW - WALL_T / 2, (IYF + IYB) / 2, PLINTH_TOP, WALL_T, IYB - IYF, ZW - PLINTH_TOP, 'stone', 'stone', top_on=False, bottom=False)
    box(mb, 0, (IYB + YB) / 2, PLINTH_TOP, 2 * HW, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=False, bottom=False)

    # --- фасад с ОТКРЫТЫМ арочным порталом (X ∈ [-2.6..+2.6]) ---
    pier_w = HW - DW
    pier_x = DW + pier_w / 2
    box(mb, -pier_x, (YF + IYF) / 2, PLINTH_TOP, pier_w, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=False, bottom=False)
    box(mb, pier_x, (YF + IYF) / 2, PLINTH_TOP, pier_w, WALL_T, ZW - PLINTH_TOP, 'stone', 'stone', top_on=False, bottom=False)
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
        box(mb, 0, (YF + YB) / 2, ZW - 0.45, 2 * HW + 0.4, (YB - YF) + 0.4, 0.45, 'frieze', 'stone', top_on=False, bottom=False)

    # --- кровля: два ската, ленты черепицы; изнутри тёплая обшивка деревом ---
    run = HW + OVH
    rise = (RIDGE - ZW) * run / HW
    zE = RIDGE - rise
    L_slope = math.hypot(run, rise)
    y0r, y1r = YF - OVH, YB + OVH
    Lr = y1r - y0r
    for side in (-1, 1):
        E = Vector((side * run, y0r, zE))
        U = Vector((-side * run, 0, rise)).normalized()
        out = Vector((side * rise, 0, run)).normalized()
        slope_plane(mb, E, (0, 1, 0), U, Lr, L_slope, 'slate', out)
        if lod <= 1:
            th = 0.35
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
            for k in range(7):
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

    # --- башни (вне внутреннего зала: X ∈ [7.9..13.3]) ---
    for side in (-1, 1):
        tx = side * TX
        box(mb, tx, TY, PLINTH_TOP, TW, TW, TH - PLINTH_TOP, 'stone', 'stone', top_on=(lod == 2))
        if lod <= 1:
            box(mb, tx, TY, TH - 0.5, TW + 0.6, TW + 0.6, 0.5, 'frieze', 'stone', top_on=False)
            box(mb, tx, TY, TH, TW + 0.6, TW + 0.6, 0.45, 'stone', 'flag')
        roof_z = TH + (0.45 if lod <= 1 else 0.0)
        if lod == 0:
            for k in range(4):
                for t in (-0.36, 0.0, 0.36):
                    w = TW + 0.6
                    if k == 0:
                        px, py = tx + t * w, TY - w / 2 + 0.25
                    elif k == 1:
                        px, py = tx + w / 2 - 0.25, TY + t * w
                    elif k == 2:
                        px, py = tx - t * w, TY + w / 2 - 0.25
                    else:
                        px, py = tx - w / 2 + 0.25, TY - t * w
                    box(mb, px, py, roof_z, 0.8, 0.8, 1.0, 'stone', 'ruin')
        pyr = TW - 1.4 if lod == 0 else TW + 0.2
        pyramid(mb, tx, TY, roof_z + (0.3 if lod == 0 else 0.0), pyr, pyr, 7.2, 'slate')
        if lod <= 1:
            cone_spike(mb, tx, TY, roof_z + 7.2, 0.18, 2.2, 6)
        for zz in (PLINTH_TOP + 7.2, PLINTH_TOP + 12.6):
            window_frame(mb, tx, TY - TW / 2, zz, 1.2, 3.2, (0, -1, 0), lod)
            window_frame(mb, tx + side * TW / 2, TY, zz, 1.2, 3.2, (side, 0, 0), lod)

    # --- главный вход: клинчатый арочный портал (без заглушки — открытый проём!) ---
    if lod <= 1:
        for sx in (-1, 1):
            box(mb, sx * (DW + 0.45), YF - 0.32, PLINTH_TOP, 0.9, 0.64, DSPRING - PLINTH_TOP, 'stone', 'stone')
        n = 9
        for i in range(n):
            a0 = math.pi * i / n
            a1 = math.pi * (i + 1) / n
            wedge_block(mb, a0, a1, DW, DW + 0.92, YF - 0.32, 0.72, 0.0, DSPRING)
            if lod == 0:
                wedge_block(mb, a0, a1, DW, DW + 0.72, IYF + 0.15, 0.36, 0.0, DSPRING)
    # герб над порталом и окно-шестерня во фронтоне
    decal(mb, (0, YF - 0.08, DHEAD + 2.1), (1, 0, 0), (0, 0, 1), 2.5, 2.5, 'emblem', (0, -1, 0))
    decal(mb, (0, YF - 0.06, ZW + 2.8), (1, 0, 0), (0, 0, 1), 4.0, 4.0, 'gear_window', (0, -1, 0))
    for x in (-5.2, 5.2):
        window_frame(mb, x, YF, PLINTH_TOP + 3.2, 1.4, 4.2, (0, -1, 0), lod)

    # --- ступени к открытому входу (4 широких пологих марша по 0.30 м — полностью проходимы!) ---
    stair_w = 8.4
    for k in range(3):
        depth = 0.80 * (3 - k)
        top_z = 1.60 + 0.30 * k
        box(mb, 0, PY0 - depth / 2, 0.0, stair_w, depth, top_z - 0.0002 * (2 - k),
            'stone', 'flag', sides=(True, True, False, True))
    # парапеты по бокам лестницы
    for sx in (-1, 1):
        box(mb, sx * (stair_w / 2 + 0.42), PY0 - 1.2, 0.0, 0.84, 2.5, PLINTH_TOP + 0.55, 'frieze', 'flag')

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

    # --- ТОЧНЫЕ КОЛЛАЙДЕРЫ: проходимая лестница + проходимый пол зала + стены с открытым проёмом ---
    # Формат: (cx, cy, sx, sy, h, z0, walkable)
    cols = [
        # Проходимые марши лестницы (+0.30 м каждый от уровня земли 1.30 м)
        (0.0, PY0 - 2.00, stair_w, 0.90, 1.60, 0.0, True),
        (0.0, PY0 - 1.20, stair_w, 0.90, 1.90, 0.0, True),
        (0.0, PY0 - 0.40, stair_w, 0.90, 2.20, 0.0, True),
        # Проходимый пол зала + крыльцо (+1.20 м над землёй)
        (0.0, (PY0 + PY1) / 2, 19.2, PY1 - PY0 + 0.4, PLINTH_TOP, 0.0, True),
        # Проходимый подиум Командора в глубине зала (+1.35/+1.50 м)
        (0.0, 6.10, 7.2, 0.90, PLINTH_TOP + 0.15, 0.0, True),
        (0.0, 8.95, 8.8, 4.90, PLINTH_TOP + 0.30, 0.0, True),
        # Боковые парапеты лестницы
        (-(stair_w / 2 + 0.42), PY0 - 1.2, 0.85, 2.6, PLINTH_TOP + 0.6, 0.0, False),
        (+(stair_w / 2 + 0.42), PY0 - 1.2, 0.85, 2.6, PLINTH_TOP + 0.6, 0.0, False),
        # Стены зала (оставляют открытыми проём шириной 5.2 м и весь зал 15.6×21.6 м)
        (-HW + WALL_T / 2, 1.0, WALL_T + 0.4, (YB - YF) + 0.4, 24.0, 0.0, False),
        (+HW - WALL_T / 2, 1.0, WALL_T + 0.4, (YB - YF) + 0.4, 24.0, 0.0, False),
        (0.0, (IYB + YB) / 2, 2 * HW + 0.4, WALL_T + 0.4, 24.0, 0.0, False),
        (-pier_x, (YF + IYF) / 2, pier_w + 0.2, WALL_T + 0.4, 24.0, 0.0, False),
        (+pier_x, (YF + IYF) / 2, pier_w + 0.2, WALL_T + 0.4, 24.0, 0.0, False),
        # Наружные башни и контрфорсный пояс цоколя (вне внутреннего зала)
        (-TX, TY, TW + 0.2, TW + 0.2, 30.0, 0.0, False),
        (+TX, TY, TW + 0.2, TW + 0.2, 30.0, 0.0, False),
        (-HW - 0.8, 1.0, 1.6, 23.0, PLINTH_TOP + 0.2, 0.0, False),
        (+HW + 0.8, 1.0, 1.6, 23.0, PLINTH_TOP + 0.2, 0.0, False),
        # Котельная печь в дальнем углу зала
        (6.2, 10.3, 2.2, 2.2, 6.0, 0.0, False),
    ]
    return mb, cols


PIECES = [
    ('opt_bastion', build_bastion, {'drawDist': 1000, 'lodDist': [110, 280]}),
    ('opt_column', build_column, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('opt_column_broken', build_column_broken, {'drawDist': 480, 'lodDist': [55, 140]}),
    ('opt_column_stump', build_column_stump, {'drawDist': 300, 'lodDist': [45, 110]}),
    ('opt_column_fallen', build_column_fallen, {'drawDist': 320, 'lodDist': [45, 110]}),
    ('opt_arch', build_arch, {'drawDist': 520, 'lodDist': [60, 150]}),
    ('opt_ruin_long', build_ruin_long, {'drawDist': 480, 'lodDist': [55, 140]}),
    ('opt_ruin_corner', build_ruin_corner, {'drawDist': 360, 'lodDist': [50, 120]}),
    ('opt_debris', build_debris, {'drawDist': 240, 'lodDist': [40, 100], 'shadow': False}),
    ('opt_block', build_block, {'drawDist': 200, 'lodDist': [40, 100], 'shadow': False}),
    ('opt_slab', build_slab, {'drawDist': 200, 'lodDist': [35, 90], 'shadow': False}),
    ('opt_hero_monument', build_hero_monument, {'drawDist': 460, 'lodDist': [65, 160]}),
    ('opt_lamp', build_lamp, {'drawDist': 260, 'lodDist': [40, 100]}),
]


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
