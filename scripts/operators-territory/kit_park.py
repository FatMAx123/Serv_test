# ============================================================
#  SCRIPTS / OPERATORS-TERRITORY / KIT_PARK.PY
#  «Старый парк механиков» и «Ржавый ручей»: бывший городской парк инженерного
#  квартала, разорённый аварией и восстанием машин, и прорванный водовод у оврага.
#
#  Все объекты — своя процедурная геометрия на ЕДИНОМ opt_atlas.webp
#  (ноль новых текстур, один материал, InstancedMesh в игре), 3 LOD, Draco.
#  Регистрируется из build_kit.py так же, как kit_unique.py.
# ============================================================
import math
import random
from mathutils import Matrix, Vector


def register_pieces(k, pieces_list):
    MB = k['MB']
    box = k['box']
    cylinder = k['cylinder']
    annulus = k['annulus']
    planar_top = k['planar_top']
    decal = k['decal']
    cone_spike = k['cone_spike']
    chunk = k['chunk']
    strip_v = k['strip_v']
    cell_uv = k['cell_uv']
    pyramid = k['pyramid']
    ruin_wall = k['ruin_wall']
    jagged_profile = k['jagged_profile']
    STRIPS = k['STRIPS']
    U_SPAN = k['U_SPAN']

    # ------------------------------------------------------------
    #  Хелперы
    # ------------------------------------------------------------
    def tube(mb, pts, radius, seg, strip='iron', cap_a=True, cap_b=True, skey='tb'):
        """Гладкая труба/пруток по ломаной (U периодична, V — треугольная волна внутри полосы)."""
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
                if t.length < 1e-5:
                    t = (pts[i] - pts[i - 1]).normalized()
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

        key = '%s_%d_%s' % (skey, id(mb), round(radius, 3))
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
                        [(j / seg, va), ((j + 1) / seg, va), ((j + 1) / seg, vb), (j / seg, vb)],
                        out, smooth=True, skey=key)
        if cap_a:
            planar_top(mb, list(reversed(rings[0])), cell='dark', outward=(pts[0] - pts[1]).normalized())
        if cap_b:
            planar_top(mb, rings[-1], cell='dark', outward=(pts[-1] - pts[-2]).normalized())

    def ring_pts(r, seg, phase):
        return [(r * math.cos(phase + 2 * math.pi * i / seg), r * math.sin(phase + 2 * math.pi * i / seg)) for i in range(seg + 1)]

    def ring_wall(mb, r, z0, tops, seg, strip, phase, inward=False):
        """Кольцевая стенка (наружу или внутрь), верх — по вершинам tops[0..seg]."""
        rp = ring_pts(r, seg, phase)
        bh = STRIPS[strip]['heightM']
        circ = 2 * math.pi * r
        for i in range(seg):
            (x0, y0), (x1, y1) = rp[i], rp[i + 1]
            ha, hb = tops[i], tops[(i + 1) % seg] if len(tops) == seg else tops[i + 1]
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            ua, ub = circ * i / seg / U_SPAN, circ * (i + 1) / seg / U_SPAN
            pts = [(x0, y0, z0), (x1, y1, z0), (x1, y1, hb), (x0, y0, ha)]
            uvs = [(ua, strip_v(strip, 0)), (ub, strip_v(strip, 0)),
                   (ub, strip_v(strip, min(1.0, (hb - z0) / bh))), (ua, strip_v(strip, min(1.0, (ha - z0) / bh)))]
            mb.poly(pts, uvs, (-mx, -my, 0) if inward else (mx, my, 0))

    def ring_top(mb, r_in, r_out, tops, seg, strip, phase):
        """Верх кольцевой стенки между r_in и r_out (высоты по вершинам)."""
        pi_ = ring_pts(r_in, seg, phase)
        po = ring_pts(r_out, seg, phase)
        w = (r_out - r_in) / STRIPS[strip]['heightM']
        for i in range(seg):
            ha, hb = tops[i], tops[(i + 1) % seg] if len(tops) == seg else tops[i + 1]
            u0 = 2 * math.pi * r_out * i / seg / U_SPAN
            u1 = 2 * math.pi * r_out * (i + 1) / seg / U_SPAN
            pts = [(pi_[i][0], pi_[i][1], ha), (po[i][0], po[i][1], ha), (po[i + 1][0], po[i + 1][1], hb), (pi_[i + 1][0], pi_[i + 1][1], hb)]
            uvs = [(u0, strip_v(strip, 0)), (u0, strip_v(strip, min(1.0, w))), (u1, strip_v(strip, min(1.0, w))), (u1, strip_v(strip, 0))]
            mb.poly(pts, uvs, (0, 0, 1))

    def clip_y(poly, y, keep_above):
        out = []
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            ina = (a[1] >= y) if keep_above else (a[1] <= y)
            inb = (b[1] >= y) if keep_above else (b[1] <= y)
            if ina:
                out.append(a)
            if ina != inb:
                t = (y - a[1]) / (b[1] - a[1])
                out.append((a[0] + (b[0] - a[0]) * t, y))
        return out

    def banded_top(mb, poly2d, z, strip, outward=(0, 0, 1)):
        """Большая выпуклая горизонтальная грань лентами по высоте полосы (плиты не растягиваются)."""
        bh = STRIPS[strip]['heightM']
        ys = [p[1] for p in poly2d]
        y = min(ys)
        ymax = max(ys)
        while y < ymax - 1e-5:
            kk = math.floor(y / bh + 1e-7)
            yt = min(ymax, (kk + 1) * bh)
            part = clip_y(clip_y(poly2d, y, True), yt, False)
            if len(part) >= 3:
                base = kk * bh
                pts = [(p[0], p[1], z) for p in part]
                uvs = [(p[0] / U_SPAN, strip_v(strip, max(0.0, min(1.0, (p[1] - base) / bh)))) for p in part]
                mb.poly(pts, uvs, outward)
            y = yt

    def gear_xz(mb, r_out, r_root, r_in, teeth, thick, strip='brass', missing=(), spokes=4, hub=0.16, lod=0):
        """Шестерня в плоскости XZ (ось — Y), центр в 0. missing — номера выбитых зубьев."""
        outline = []
        step = 2 * math.pi / teeth
        for i in range(teeth):
            a0 = i * step
            ro = r_root if i in missing else r_out
            for (fa, rr) in ((0.0, r_root), (0.18, ro), (0.47, ro), (0.65, r_root)):
                a = a0 + fa * step
                outline.append((rr * math.cos(a), rr * math.sin(a)))
        inner = []
        for i in range(len(outline)):
            a = math.atan2(outline[i][1], outline[i][0])
            inner.append((r_in * math.cos(a), r_in * math.sin(a)))
        y0, y1 = -thick / 2, thick / 2
        n = len(outline)
        circ = 2 * math.pi * r_out
        for i in range(n):
            j = (i + 1) % n
            (ox0, oz0), (ox1, oz1) = outline[i], outline[j]
            (ix0, iz0), (ix1, iz1) = inner[i], inner[j]
            ua, ub = circ * i / n / U_SPAN, circ * (i + 1) / n / U_SPAN
            r0f = math.hypot(ox0, oz0)
            r1f = math.hypot(ox1, oz1)
            va0 = strip_v(strip, 0.1)
            vo0 = strip_v(strip, min(0.95, 0.1 + (r0f - r_in) / (r_out - r_in) * 0.85))
            vo1 = strip_v(strip, min(0.95, 0.1 + (r1f - r_in) / (r_out - r_in) * 0.85))
            # фасад (−Y) и тыл (+Y)
            mb.poly([(ix0, y0, iz0), (ix1, y0, iz1), (ox1, y0, oz1), (ox0, y0, oz0)],
                    [(ua, va0), (ub, va0), (ub, vo1), (ua, vo0)], (0, -1, 0))
            mb.poly([(ix0, y1, iz0), (ox0, y1, oz0), (ox1, y1, oz1), (ix1, y1, iz1)],
                    [(ua, va0), (ua, vo0), (ub, vo1), (ub, va0)], (0, 1, 0))
            # торец зубьев
            mx, mz = (ox0 + ox1) / 2, (oz0 + oz1) / 2
            mb.poly([(ox0, y0, oz0), (ox1, y0, oz1), (ox1, y1, oz1), (ox0, y1, oz0)],
                    [(ua, strip_v(strip, 0.2)), (ub, strip_v(strip, 0.2)), (ub, strip_v(strip, 0.8)), (ua, strip_v(strip, 0.8))],
                    (mx, 0, mz))
            # внутренний обод (если есть хаб со спицами)
            if r_in > 0.05:
                mx2, mz2 = (ix0 + ix1) / 2, (iz0 + iz1) / 2
                mb.poly([(ix0, y0, iz0), (ix0, y1, iz0), (ix1, y1, iz1), (ix1, y0, iz1)],
                        [(ua, strip_v(strip, 0.2)), (ua, strip_v(strip, 0.8)), (ub, strip_v(strip, 0.8)), (ub, strip_v(strip, 0.2))],
                        (-mx2, 0, -mz2))
        if r_in > 0.05 and lod <= 1:
            old = mb.M
            for s in range(spokes):
                ang = math.pi * s / spokes
                mb.M = old @ Matrix.Rotation(ang, 4, 'Y')
                box(mb, 0, 0, -thick * 0.3, (r_in + 0.04) * 2, thick * 0.55, thick * 0.6, strip, strip, bottom=True)
            mb.M = old @ Matrix.Rotation(math.pi / 2, 4, 'X')
            cylinder(mb, hub, hub, -thick * 0.7, thick * 0.7, 8, strip, u_units=0.2, stretch=True, top='flat', cap_cell='bronze', skey='hub%s' % id(mb))
            mb.M = old

    # ============================================================
    #  1. СУХОЙ ПАРОВОЙ ФОНТАН (центр парка)
    # ============================================================
    def build_park_fountain(lod):
        """Восьмигранная чаша с выбитым краем, латунная колонна с медной чашей, рожки и шестерня-навершие."""
        mb = MB()
        rnd = random.Random(301)
        seg = 8
        ph = math.pi / 8
        R_OUT, R_IN, H = 3.9, 3.5, 0.78
        tops = [H] * (seg + 1)
        tops[2], tops[3] = 0.30, 0.52          # выбитый ударом край чаши
        tops[seg] = tops[0]
        ring_wall(mb, R_OUT, 0.0, tops, seg, 'stone', ph)
        ring_wall(mb, R_IN, 0.16, tops, seg, 'ruin', ph, inward=True)
        ring_top(mb, R_IN, R_OUT, tops, seg, 'flag', ph)
        # сухое дно: мох и разбитые плиты
        floor = [(R_IN * math.cos(ph + 2 * math.pi * i / seg), R_IN * math.sin(ph + 2 * math.pi * i / seg)) for i in range(seg)]
        banded_top(mb, floor, 0.16, 'ruin')
        # пьедестал и латунная колонна
        cylinder(mb, 0.95, 0.88, 0.16, 0.92, seg, 'stone', stretch=False, phase=ph, skey='fp')
        annulus(mb, 0.88, 0.36, 0.92, seg, 'flag', phase=ph)
        cs = 10 if lod == 0 else (8 if lod == 1 else 6)
        cylinder(mb, 0.36, 0.28, 0.92, 3.15, cs, 'brass', u_units=0.3, stretch=True, skey='fcol')
        # средняя медная чаша
        cylinder(mb, 0.34, 1.55, 1.95, 2.32, cs + 2, 'copper', u_units=1.2, stretch=True, skey='fbowl')
        cylinder(mb, 1.58, 1.58, 2.28, 2.40, cs + 2, 'brass', u_units=1.2, stretch=True, skey='frim')
        banded_top(mb, [(1.5 * math.cos(2 * math.pi * i / (cs + 2)), 1.5 * math.sin(2 * math.pi * i / (cs + 2))) for i in range(cs + 2)], 2.36, 'ruin')
        if lod <= 1:
            # рожки-паропроводы (один отломан и лежит в чаше)
            for i, ang in enumerate((0.4, 0.4 + math.pi / 2, 0.4 + math.pi, 0.4 + 3 * math.pi / 2)):
                dx, dy = math.cos(ang), math.sin(ang)
                if i == 2:
                    tube(mb, [(dx * 0.3, dy * 0.3, 2.78), (dx * 0.62, dy * 0.62, 2.88)], 0.07, 6, 'copper', skey='fsp%d' % i)
                    continue
                tube(mb, [(dx * 0.3, dy * 0.3, 2.78), (dx * 0.7, dy * 0.7, 2.92), (dx * 1.1, dy * 1.1, 2.80), (dx * 1.32, dy * 1.32, 2.55)],
                     0.07, 6, 'copper', skey='fsp%d' % i)
            tube(mb, [(-1.9, 1.2, 0.26), (-1.2, 1.9, 0.30), (-0.8, 2.2, 0.27)], 0.07, 6, 'copper', skey='ffallen')
            cylinder(mb, 0.42, 0.42, 3.05, 3.18, cs, 'brass', u_units=0.3, stretch=True, skey='fcollar')
        # навершие: накренённая шестерня с выбитыми зубьями
        mb.M = Matrix.Translation((0.0, 0.0, 4.02)) @ Matrix.Rotation(0.20, 4, 'Y') @ Matrix.Rotation(0.12, 4, 'Z')
        teeth = 12 if lod == 0 else (10 if lod == 1 else 8)
        gear_xz(mb, 0.98, 0.82, 0.52 if lod <= 1 else 0.0, teeth, 0.20, 'brass', missing=(1, 2, 7), lod=lod)
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (
                (1.6, -1.2, 0.34, 0.9, 0.6, 0.36, 0.4, 0.15),
                (-1.1, -2.1, 0.30, 0.7, 0.5, 0.30, -0.6, -0.1),
                (2.3, 2.6, 0.20, 0.8, 0.5, 0.34, 1.1, 0.2),       # обломок края у пролома
                (3.4, 3.3, 0.18, 0.7, 0.45, 0.30, 0.3, -0.25),
            ):
                chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
        return mb, [(0, 0, 2 * R_OUT, 2 * R_OUT, H, 0.0, False, 'cylinder')]

    # ============================================================
    #  2. СКАМЬИ ПАРКА (чугун + доски)
    # ============================================================
    def bench_side(mb, x, lod):
        box(mb, x, -0.20, 0.0, 0.07, 0.07, 0.44, 'iron', 'iron')
        box(mb, x, +0.22, 0.0, 0.07, 0.07, 0.96, 'iron', 'iron')
        box(mb, x, 0.01, 0.40, 0.07, 0.50, 0.05, 'iron', 'iron', bottom=True)
        if lod <= 1:
            box(mb, x, -0.02, 0.62, 0.07, 0.52, 0.05, 'iron', 'iron', bottom=True)
            box(mb, x, -0.24, 0.44, 0.06, 0.06, 0.20, 'iron', 'iron')

    def bench_seat(mb, lod, drop_slat=None, skip_back=None):
        if lod == 2:
            box(mb, 0, 0, 0.45, 1.9, 0.48, 0.05, 'wood', 'wood', bottom=True)
            box(mb, 0, 0.25, 0.58, 1.9, 0.05, 0.34, 'wood', 'wood')
            return
        for i, y in enumerate((-0.16, 0.0, 0.16)):
            if i == drop_slat:
                continue
            box(mb, 0, y, 0.45, 1.92, 0.13, 0.045, 'wood', 'wood', bottom=True)
        old = mb.M
        for i, z in enumerate((0.62, 0.80)):
            if i == skip_back:
                continue
            mb.M = old @ Matrix.Translation((0, 0.25, z)) @ Matrix.Rotation(-0.16, 4, 'X')
            box(mb, 0, 0, 0, 1.92, 0.04, 0.12, 'wood', 'wood', bottom=True)
        mb.M = old

    def build_park_bench(lod):
        """Парковая скамья: кованые боковины, три доски сиденья и спинка (мелкий декор — без коллизии)."""
        mb = MB()
        bench_side(mb, -0.86, lod)
        bench_side(mb, +0.86, lod)
        bench_seat(mb, lod)
        return mb, []

    def build_park_bench_broken(lod):
        """Сломанная скамья: правая боковина выбита, сиденье осело на землю, доска спинки сорвана."""
        mb = MB()
        bench_side(mb, -0.86, lod)
        # осевшее сиденье: поворот вокруг Y у левой боковины
        mb.M = Matrix.Translation((-0.86, 0, 0.0)) @ Matrix.Rotation(0.22, 4, 'Y') @ Matrix.Translation((0.86, 0, 0))
        bench_seat(mb, lod, drop_slat=2, skip_back=0)
        mb.M = Matrix.Identity(4)
        # выбитая боковина лежит рядом
        if lod <= 1:
            mb.M = Matrix.Translation((1.25, 0.05, 0.04)) @ Matrix.Rotation(math.pi / 2 - 0.08, 4, 'Y') @ Matrix.Rotation(0.4, 4, 'X')
            box(mb, 0, 0, -0.035, 0.07, 0.07, 0.94, 'iron', 'iron', bottom=True)
            box(mb, 0, -0.2, -0.035, 0.07, 0.40, 0.07, 'iron', 'iron', bottom=True)
            mb.M = Matrix.Identity(4)
        return mb, []

    # ============================================================
    #  3. ПАРКОВЫЕ ФОНАРИ (кованый «посох» с подвесным фонарём)
    # ============================================================
    def lantern(mb, cx, cy, cz, lit=True, lod=0):
        box(mb, cx, cy, cz - 0.20, 0.30, 0.30, 0.05, 'brass', 'brass', bottom=True)
        cell = 'glow' if lit else 'dark'
        for (n, c, r) in (((0, -1, 0), (cx, cy - 0.13, cz), (1, 0, 0)), ((0, 1, 0), (cx, cy + 0.13, cz), (-1, 0, 0)),
                          ((1, 0, 0), (cx + 0.13, cy, cz), (0, 1, 0)), ((-1, 0, 0), (cx - 0.13, cy, cz), (0, -1, 0))):
            decal(mb, c, r, (0, 0, 1), 0.24, 0.34, cell, n)
        box(mb, cx, cy, cz + 0.17, 0.32, 0.32, 0.05, 'brass', 'brass', bottom=True)
        if lod <= 1:
            pyramid(mb, cx, cy, cz + 0.22, 0.32, 0.32, 0.20, 'iron')

    def lamp_post(mb, lod, z1):
        box(mb, 0, 0, 0, 0.56, 0.56, 0.26, 'stone', 'stone')
        box(mb, 0, 0, 0.26, 0.40, 0.40, 0.24, 'stone', 'flag')
        seg = 8 if lod == 0 else 6
        cylinder(mb, 0.10, 0.075, 0.50, z1, seg, 'iron', u_units=0.15, stretch=True, skey='lp%s' % z1)
        if lod <= 1:
            for zb in (0.62, 1.75):
                if zb < z1:
                    cylinder(mb, 0.13, 0.13, zb, zb + 0.10, seg, 'brass', u_units=0.15, stretch=True, skey='lpb%s' % zb)

    def build_park_lamp(lod):
        """Кованый парковый фонарь-«посох»: столб, латунные пояса, изогнутый кронштейн и подвесной фонарь."""
        mb = MB()
        lamp_post(mb, lod, 3.40)
        tube(mb, [(0, 0, 3.36), (0, 0, 3.70), (0.14, 0, 3.94), (0.42, 0, 4.04), (0.72, 0, 3.96), (0.84, 0, 3.80)],
             0.045, 6 if lod <= 1 else 4, 'iron', cap_a=False, skey='crook')
        box(mb, 0.84, 0, 3.58, 0.03, 0.03, 0.22, 'iron', 'iron')
        lantern(mb, 0.84, 0, 3.36, True, lod)
        return mb, []

    def build_park_lamp_bent(lod):
        """Согнутый фонарь: верх столба завален ударом, фонарь сорван и разбит на земле."""
        mb = MB()
        lamp_post(mb, lod, 1.70)
        mb.M = Matrix.Translation((0, 0, 1.68)) @ Matrix.Rotation(0.62, 4, 'Y')
        seg = 8 if lod == 0 else 6
        cylinder(mb, 0.08, 0.072, 0.0, 1.55, seg, 'iron', u_units=0.15, stretch=True, top='flat', cap_cell='dark', skey='lbend')
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            mb.M = Matrix.Translation((1.35, 0.35, 0.16)) @ Matrix.Rotation(1.2, 4, 'Z') @ Matrix.Rotation(1.35, 4, 'X')
            lantern(mb, 0, 0, 0, False, lod)
            mb.M = Matrix.Identity(4)
        return mb, []

    # ============================================================
    #  4. ЧУГУННАЯ ОГРАДА ПАРКА (секция 4 м: столб слева, цоколь, прутья)
    # ============================================================
    def build_park_fence(lod):
        """Секция кованой ограды: каменный столб с латунным навершием, цоколь, пики и две перекладины."""
        mb = MB()
        box(mb, -2.0, 0, 0.0, 0.50, 0.50, 1.72, 'stone', 'stone', bottom=True)
        box(mb, -2.0, 0, 1.72, 0.62, 0.62, 0.12, 'frieze', 'flag', bottom=True)
        if lod <= 1:
            mb.M = Matrix.Translation((-2.0, 0, 0))
            cylinder(mb, 0.15, 0.12, 1.84, 2.04, 8, 'brass', u_units=0.15, stretch=True, top='flat', cap_cell='bronze', skey='fpfin')
            mb.M = Matrix.Identity(4)
        box(mb, 0.125, 0, 0.0, 3.75, 0.34, 0.38, 'stone', 'flag', bottom=True)
        stepx = (0.22, 0.44, 0.88)[lod]
        x = -1.62
        while x < 1.92:
            box(mb, x, 0, 0.38, 0.035, 0.035, 1.12, 'iron', 'iron')
            if lod == 0:
                cone_spike(mb, x, 0, 1.50, 0.045, 0.13, seg=4, strip='iron')
            x += stepx
        box(mb, 0.125, 0, 1.36, 3.75, 0.05, 0.06, 'iron', 'iron', bottom=True)
        box(mb, 0.125, 0, 0.52, 3.75, 0.05, 0.06, 'iron', 'iron', bottom=True)
        return mb, [(-0.125, 0, 4.25, 0.50, 1.60, 0.0)]

    def build_park_fence_broken(lod):
        """Обрушенная секция ограды: обломанный столб, разбитый цоколь, выгнутые и упавшие прутья (проход!)."""
        mb = MB()
        rnd = random.Random(331)
        mb.M = Matrix.Translation((-2.0, 0, 0))
        ruin_wall(mb, 0.50, 0.50, [(0.0, 0.95), (0.25, 0.72), (0.5, 0.86)], strip='stone')
        mb.M = Matrix.Identity(4)
        box(mb, -1.0, 0, 0.0, 1.55, 0.34, 0.36, 'stone', 'flag', bottom=True)
        box(mb, 1.45, 0, 0.0, 1.10, 0.34, 0.22, 'stone', 'flag', bottom=True)
        # выгнутые прутья у уцелевшего цоколя
        for i, x in enumerate((-1.62, -1.40, -1.18, -0.96, -0.74, -0.52)):
            if lod == 2 and i % 2:
                continue
            mb.M = Matrix.Translation((x, 0, 0.36)) @ Matrix.Rotation(-0.10 - 0.11 * i, 4, 'X') @ Matrix.Rotation(0.05 * i, 4, 'Y')
            box(mb, 0, 0, 0, 0.035, 0.035, 1.10 - 0.06 * i, 'iron', 'iron', bottom=True)
            mb.M = Matrix.Identity(4)
        box(mb, -1.07, 0, 1.36, 1.15, 0.05, 0.06, 'iron', 'iron', bottom=True)
        if lod <= 1:
            # сорванная перекладина с пиками лежит в траве
            mb.M = Matrix.Translation((0.9, -0.55, 0.05)) @ Matrix.Rotation(0.35, 4, 'Z')
            box(mb, 0, 0, 0, 2.2, 0.06, 0.06, 'iron', 'iron', bottom=True)
            for xx in (-0.9, -0.45, 0.0, 0.45, 0.9):
                box(mb, xx, -0.3, 0.02, 0.035, 0.6 + rnd.uniform(-0.15, 0.1), 0.035, 'iron', 'iron', bottom=True)
            mb.M = Matrix.Identity(4)
            for (cx, cy, cz, sx, sy, sz, yaw, tilt) in ((0.35, 0.35, 0.14, 0.5, 0.32, 0.26, 0.5, 0.2), (0.62, -0.3, 0.12, 0.42, 0.3, 0.22, -0.4, -0.15)):
                chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'stone')
        return mb, [(-2.0, 0, 0.50, 0.50, 0.95, 0.0)]

    # ============================================================
    #  5. ВОРОТА ПАРКА (каменные пилоны, кованая арка, сорванные створки)
    # ============================================================
    def build_park_gate(lod):
        """Парадные ворота парка: пилоны с латунными шестернями, кованая арка с табличкой, одна створка висит, вторая сорвана."""
        mb = MB()
        for sx in (-2.75, 2.75):
            box(mb, sx, 0, 0.0, 0.95, 0.95, 3.10, 'stone', 'stone', bottom=True)
            box(mb, sx, 0, 3.10, 1.12, 1.12, 0.16, 'frieze', 'flag', bottom=True)
            box(mb, sx, 0, 0.0, 1.10, 1.10, 0.45, 'stone', 'flag')
            mb.M = Matrix.Translation((sx, 0, 3.72)) @ Matrix.Rotation(0.3 if sx < 0 else -0.5, 4, 'Y')
            gear_xz(mb, 0.44, 0.36, 0.0 if lod == 2 else 0.20, 10 if lod == 0 else 8, 0.12, 'brass', lod=lod)
            mb.M = Matrix.Identity(4)
        # кованая арка: два пояса и решётка между ними
        arcs = []
        for (rz, rr) in ((2.70, 0.0), (2.45, -0.0)):
            pts = []
            n = 10 if lod <= 1 else 6
            for i in range(n + 1):
                t = math.pi * i / n
                pts.append((-2.28 * math.cos(t), 0.0, rz + 0.95 * math.sin(t)))
            arcs.append(pts)
            tube(mb, pts, 0.055, 6 if lod <= 1 else 4, 'iron', skey='garc%s' % rz)
        if lod <= 1:
            for i in range(1, 10, 2):
                a, b = arcs[0][i], arcs[1][i]
                tube(mb, [b, a], 0.03, 4, 'iron', cap_a=False, cap_b=False, skey='gbar%d' % i)
        # табличка на арке (без надписей)
        box(mb, 0, 0, 3.05, 1.0, 0.06, 0.55, 'brass', 'brass', bottom=True)
        decal(mb, (0, -0.035, 3.325), (1, 0, 0), (0, 0, 1), 0.92, 0.48, 'plaque', (0, -1, 0))
        decal(mb, (0, 0.035, 3.325), (-1, 0, 0), (0, 0, 1), 0.92, 0.48, 'plaque', (0, 1, 0))

        def leaf(lod_):
            box(mb, 1.05, 0, 0.12, 2.1, 0.06, 0.07, 'iron', 'iron', bottom=True)
            box(mb, 1.05, 0, 2.15, 2.1, 0.06, 0.07, 'iron', 'iron', bottom=True)
            box(mb, 0.04, 0, 0.12, 0.08, 0.08, 2.10, 'iron', 'iron')
            box(mb, 2.06, 0, 0.12, 0.08, 0.08, 2.10, 'iron', 'iron')
            stp = 0.30 if lod_ == 0 else 0.6
            x = 0.34
            while x < 1.9:
                box(mb, x, 0, 0.19, 0.03, 0.03, 1.96, 'iron', 'iron')
                x += stp
        # левая створка висит распахнутой внутрь парка (+Y)
        mb.M = Matrix.Translation((-2.22, 0.10, 0.0)) @ Matrix.Rotation(1.75, 4, 'Z')
        leaf(lod)
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            # правая створка сорвана и лежит в траве перед воротами
            mb.M = Matrix.Translation((0.35, -1.25, 0.04)) @ Matrix.Rotation(-0.25, 4, 'Z') @ Matrix.Rotation(math.pi / 2 - 0.05, 4, 'X')
            leaf(lod)
            mb.M = Matrix.Identity(4)
        return mb, [(-2.75, 0, 1.10, 1.10, 3.30, 0.0), (2.75, 0, 1.10, 1.10, 3.30, 0.0)]

    # ============================================================
    #  6. ПАВИЛЬОН ОРКЕСТРА (ротонда: платформа, чугунные колонны, рёбра купола)
    # ============================================================
    def build_park_pavilion(lod):
        """Музыкальный павильон: проходимая платформа 0.4 м, 8 чугунных колонн (3 сломаны), рёбра купола и уцелевший медный сегмент кровли, опрокинутый паровой каллиоп."""
        mb = MB()
        rnd = random.Random(361)
        seg = 8
        ph = math.pi / 8
        R_PL, H_PL = 4.6, 0.40
        cylinder(mb, 4.76, R_PL, 0.0, H_PL, seg, 'stone', stretch=False, phase=ph, skey='pvb')
        poly = [(R_PL * math.cos(ph + 2 * math.pi * i / seg), R_PL * math.sin(ph + 2 * math.pi * i / seg)) for i in range(seg)]
        banded_top(mb, poly, H_PL, 'flag')
        RC, ZT = 4.12, 3.95
        cseg = 8 if lod == 0 else 6
        broken = {2: 1.6, 5: 2.5, 6: 1.1}
        col_top = {}
        for i in range(seg):
            a = 2 * math.pi * i / seg
            cx, cy = RC * math.cos(a), RC * math.sin(a)
            mb.M = Matrix.Translation((cx, cy, 0))
            box(mb, 0, 0, H_PL, 0.36, 0.36, 0.22, 'stone', 'flag')
            if i in broken:
                zt = broken[i]
                tops = [zt + rnd.uniform(-0.25, 0.25) for _ in range(cseg)]
                cylinder(mb, 0.13, 0.12, H_PL + 0.22, max(tops), cseg, 'iron', u_units=0.15, stretch=True,
                         top_heights=tops, top='jagged', cap_cell='dark', skey='pvc%d' % i)
            else:
                cylinder(mb, 0.13, 0.11, H_PL + 0.22, ZT, cseg, 'iron', u_units=0.15, stretch=True, skey='pvc%d' % i)
                if lod <= 1:
                    cylinder(mb, 0.19, 0.19, ZT - 0.18, ZT, cseg, 'brass', u_units=0.15, stretch=True, top='flat', cap_cell='bronze', skey='pvk%d' % i)
                col_top[i] = (cx, cy)
            mb.M = Matrix.Identity(4)
        # кольцевая балка над уцелевшими соседними колоннами
        for (i, j) in ((7, 0), (0, 1), (3, 4)):
            if i in col_top and j in col_top:
                (x0, y0), (x1, y1) = col_top[i], col_top[j]
                ang = math.atan2(y1 - y0, x1 - x0)
                L = math.hypot(x1 - x0, y1 - y0)
                mb.M = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, ZT)) @ Matrix.Rotation(ang, 4, 'Z')
                box(mb, 0, 0, 0, L + 0.3, 0.20, 0.20, 'iron', 'iron', bottom=True)
                mb.M = Matrix.Identity(4)
        # рёбра купола (два доходят до венца, остальные обломаны)
        apex_z = 6.05
        rib_len = {0: 1.0, 3: 1.0, 1: 0.55, 4: 0.65, 7: 0.75}
        rs = 7 if lod <= 1 else 4
        for i, frac in rib_len.items():
            if i not in col_top:
                continue
            a = 2 * math.pi * i / seg
            pts = []
            for kk in range(rs + 1):
                t = (kk / rs) * frac
                r = RC * math.cos(t * math.pi / 2)
                pts.append((r * math.cos(a), r * math.sin(a), ZT + 0.2 + (apex_z - ZT - 0.2) * math.sin(t * math.pi / 2)))
            tube(mb, pts, 0.07, 6 if lod <= 1 else 4, 'iron', skey='rib%d' % i)
        cylinder(mb, 0.32, 0.22, apex_z - 0.05, apex_z + 0.22, 8, 'brass', u_units=0.2, stretch=True, top='flat', cap_cell='bronze', skey='apex')
        cone_spike(mb, 0, 0, apex_z + 0.22, 0.12, 0.45, seg=6, strip='brass')
        # уцелевший сектор медной кровли между рёбрами 7 и 0
        if lod <= 1:
            a0, a1 = 2 * math.pi * 7 / seg, 2 * math.pi * 8 / seg
            steps = 4
            for kk in range(steps):
                t0, t1 = 0.06 + kk * 0.17, 0.06 + (kk + 1) * 0.17
                pts = []
                for (t, a) in ((t0, a0), (t0, a1), (t1, a1), (t1, a0)):
                    r = (RC + 0.05) * math.cos(t * math.pi / 2)
                    pts.append((r * math.cos(a), r * math.sin(a), ZT + 0.28 + (apex_z - ZT - 0.2) * math.sin(t * math.pi / 2)))
                uvs = [(0, strip_v('copper', 0.05)), (0.42, strip_v('copper', 0.05)), (0.42, strip_v('copper', 0.95)), (0, strip_v('copper', 0.95))]
                mid_a = (a0 + a1) / 2
                mb.poly(pts, uvs, (math.cos(mid_a), math.sin(mid_a), 0.8))
                mb.poly(list(reversed(pts)), list(reversed(uvs)), (-math.cos(mid_a), -math.sin(mid_a), -0.8))
        # опрокинутый паровой каллиоп (музыкальная машина) в центре
        mb.M = Matrix.Translation((0.4, -0.3, H_PL)) @ Matrix.Rotation(0.5, 4, 'Z') @ Matrix.Rotation(0.12, 4, 'Y')
        box(mb, 0, 0, 0, 1.7, 0.85, 0.72, 'iron', 'brass', bottom=True)
        if lod <= 1:
            decal(mb, (0, -0.43, 0.38), (1, 0, 0), (0, 0, 1), 0.5, 0.5, 'gauge', (0, -1, 0))
        n_p = 7 if lod <= 1 else 4
        for i in range(n_p):
            px = -0.66 + 1.32 * i / (n_p - 1)
            h = 0.6 + 0.8 * math.sin(math.pi * (i + 0.5) / n_p)
            if i == 5:
                h = 0.35
            cylinder(mb, 0.085, 0.085, 0.72, 0.72 + h, 6, 'brass', u_units=0.1, stretch=True, top='flat', cap_cell='dark', skey='pipe%d' % i)
        mb.M = Matrix.Identity(4)
        return mb, [
            (0, 0, 2 * R_PL, 2 * R_PL, H_PL + 0.6, -0.6, True, 'cylinder'),
            (0.4, -0.3, 1.7, 1.0, 1.9, H_PL),
        ]

    # ============================================================
    #  7. ОСТОВ ОРАНЖЕРЕИ (каменный цоколь + чугунный каркас без стёкол)
    # ============================================================
    def build_park_greenhouse(lod):
        """Остов оранжереи 12×6.4 м: цоколь с проходами, чугунные стойки и арки, часть рёбер рухнула, внутри — грядки."""
        mb = MB()
        rnd = random.Random(371)
        LX, HY, HW = 6.0, 3.2, 0.70
        T = 0.36
        # цоколь: фасад (−Y) с проходом в центре, тыл с обрушенным участком, торцы (левый — с проходом)
        segs = [
            ((-LX, -HY), (-0.95, -HY), HW), ((0.95, -HY), (LX, -HY), HW),
            ((LX, HY), (4.4, HY), HW), ((2.1, HY), (-LX, HY), HW),
            ((LX, -HY), (LX, HY), HW),
            ((-LX, HY), (-LX, 0.85), HW), ((-LX, -0.85), (-LX, -HY), HW),
        ]
        cols = []
        for (a, b, h) in segs:
            ax, ay = a
            bx, by = b
            cx, cy = (ax + bx) / 2, (ay + by) / 2
            L = math.hypot(bx - ax, by - ay)
            ang = math.atan2(by - ay, bx - ax)
            mb.M = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(ang, 4, 'Z')
            box(mb, 0, 0, 0.0, L + T, T, h, 'stone', 'flag', bottom=True)
            mb.M = Matrix.Identity(4)
            horiz = abs(math.cos(ang)) > 0.5
            cols.append((cx, cy, (L + T) if horiz else T, T if horiz else (L + T), h, 0.0))
        # обвал тыльного цоколя
        mb.M = Matrix.Translation((3.25, HY, 0))
        ruin_wall(mb, 2.3, T, jagged_profile(2.3, 0.15, 0.45, 0.5, rnd), strip='ruin')
        mb.M = Matrix.Identity(4)
        # стойки и арки каркаса
        ZB, RH = 2.65, 2.05
        rs = 9 if lod == 0 else (6 if lod == 1 else 4)
        tseg = 5 if lod <= 1 else 4
        broken_ribs = {2.0: 0.55, 4.0: 0.0, 6.0: 0.45}
        for x in (-6.0, -4.0, -2.0, 0.0, 2.0, 4.0, 6.0):
            for sy in (-HY, HY):
                if x == 4.0 and sy > 0:
                    continue
                box(mb, x, sy, HW, 0.12, 0.12, ZB - HW, 'iron', 'iron')
            frac = broken_ribs.get(x, 1.0)
            if frac <= 0:
                continue
            pts = []
            n = max(2, int(round(rs * frac)))
            for kk in range(n + 1):
                t = math.pi * (kk / rs)
                pts.append((x, -HY * math.cos(t), ZB + RH * math.sin(t)))
            tube(mb, pts, 0.06, tseg, 'iron', skey='gh%s' % x)
        # конёк и прогоны (обрываются на рухнувшем пролёте)
        tube(mb, [(-6.0, 0, ZB + RH), (1.2, 0, ZB + RH)], 0.06, tseg, 'iron', skey='ridge')
        if lod <= 1:
            for t in (math.pi / 4, 3 * math.pi / 4):
                y, z = -HY * math.cos(t), ZB + RH * math.sin(t)
                tube(mb, [(-6.0, y, z), (0.6 if t < 1 else -1.4, y, z)], 0.045, 4, 'iron', skey='purl%s' % t)
            for sy in (-HY, HY):
                tube(mb, [(-6.0, sy, ZB), (6.0 if sy < 0 else 2.0, sy, ZB)], 0.05, 4, 'iron', skey='eave%s' % sy)
        # грядки внутри (бывшие клумбы): заросли ставит layout.js
        for sy in (-1.85, 1.85):
            box(mb, -0.6, sy, 0.0, 9.6, 1.05, 0.34, 'stone', 'flag', top_cell='bronze', bottom=True)
        if lod <= 1:
            # упавшая арка у обвала
            mb.M = Matrix.Translation((4.2, 0.6, 0.12)) @ Matrix.Rotation(0.3, 4, 'Z') @ Matrix.Rotation(1.35, 4, 'Y')
            pts = [(0, -2.6 * math.cos(math.pi * kk / 6), 1.6 * math.sin(math.pi * kk / 6)) for kk in range(5)]
            tube(mb, pts, 0.06, 4, 'iron', skey='ghfall')
            mb.M = Matrix.Identity(4)
        return mb, cols

    # ============================================================
    #  8. КЛУМБА (каменный бордюр-кольцо, земля; цветы и кусты — layout.js)
    # ============================================================
    def build_park_flowerbed(lod):
        """Круглая клумба Ø4.6 м: каменный бордюр с выбитым участком и земля (мелкий декор — без коллизии)."""
        mb = MB()
        seg = (12, 10, 8)[lod]
        R_OUT, R_IN, H = 2.30, 2.02, 0.30
        tops = [H] * (seg + 1)
        tops[3] = 0.10
        tops[4] = 0.14
        tops[seg] = tops[0]
        ring_wall(mb, R_OUT, 0.0, tops, seg, 'stone', 0.0)
        ring_wall(mb, R_IN, 0.10, tops, seg, 'stone', 0.0, inward=True)
        ring_top(mb, R_IN, R_OUT, tops, seg, 'flag', 0.0)
        planar_top(mb, [(R_IN * math.cos(2 * math.pi * i / seg), R_IN * math.sin(2 * math.pi * i / seg), 0.20) for i in range(seg)], cell='bronze')
        if lod <= 1:
            chunk(mb, 2.55, 1.85, 0.12, 0.55, 0.28, 0.24, 0.6, 0.25, 'stone')
        return mb, []

    # ============================================================
    #  9. ПАРКОВЫЕ ЧАСЫ (чугунная колонна, четыре циферблата — встали в час аварии)
    # ============================================================
    def build_park_clock(lod):
        """Уличные часы: чугунная колонна на постаменте, латунная голова с четырьмя циферблатами и шатровым верхом."""
        mb = MB()
        box(mb, 0, 0, 0, 0.82, 0.82, 0.34, 'stone', 'stone')
        box(mb, 0, 0, 0.34, 0.56, 0.56, 0.56, 'stone', 'flag')
        seg = 8 if lod == 0 else 6
        cylinder(mb, 0.16, 0.13, 0.90, 3.20, seg, 'iron', u_units=0.2, stretch=True, skey='clk')
        if lod <= 1:
            for zb in (1.05, 2.3):
                cylinder(mb, 0.20, 0.20, zb, zb + 0.12, seg, 'brass', u_units=0.2, stretch=True, skey='clkb%s' % zb)
        z0 = 3.20
        box(mb, 0, 0, z0, 0.86, 0.86, 0.80, 'iron', 'brass', bottom=True)
        for (n, c, r) in (((0, -1, 0), (0, -0.44, z0 + 0.40), (1, 0, 0)), ((0, 1, 0), (0, 0.44, z0 + 0.40), (-1, 0, 0)),
                          ((1, 0, 0), (0.44, 0, z0 + 0.40), (0, 1, 0)), ((-1, 0, 0), (-0.44, 0, z0 + 0.40), (0, -1, 0))):
            decal(mb, c, r, (0, 0, 1), 0.66, 0.66, 'gauge', n)
        box(mb, 0, 0, z0 + 0.80, 0.98, 0.98, 0.08, 'brass', 'brass', bottom=True)
        pyramid(mb, 0, 0, z0 + 0.88, 0.98, 0.98, 0.60, 'slate')
        cone_spike(mb, 0, 0, z0 + 1.46, 0.07, 0.36, seg=6, strip='brass')
        return mb, [(0, 0, 0.82, 0.82, 3.0, 0.0, False, 'cylinder')]

    # ============================================================
    #  10. КАМЕННЫЙ ВАЗОН
    # ============================================================
    def build_park_urn(lod):
        """Каменный вазон на постаменте у аллеи (мелкий декор — без коллизии)."""
        mb = MB()
        seg = (10, 8, 6)[lod]
        box(mb, 0, 0, 0, 0.62, 0.62, 0.16, 'stone', 'flag')
        prof = [(0.22, 0.16), (0.15, 0.36), (0.19, 0.44), (0.40, 0.64), (0.45, 0.80)]
        for i in range(len(prof) - 1):
            (r0, z0), (r1, z1) = prof[i], prof[i + 1]
            cylinder(mb, r0, r1, z0, z1, seg, 'stone', u_units=0.3, stretch=True, skey='urn%d' % i)
        annulus(mb, 0.45, 0.38, 0.80, seg, 'flag')
        planar_top(mb, [(0.38 * math.cos(2 * math.pi * i / seg), 0.38 * math.sin(2 * math.pi * i / seg), 0.74) for i in range(seg)], cell='bronze')
        return mb, []

    # ============================================================
    #  11. ПРОРВАННЫЙ ВОДОВОД (исток «Ржавого ручья»)
    # ============================================================
    def build_river_culvert(lod):
        """Подпорная стена оврага с прорванной магистралью водовода: из разорванного раструба бьёт вода ручья."""
        mb = MB()
        rnd = random.Random(381)
        L, TW = 11.0, 1.4
        prof = [(0.0, 2.2), (1.2, 3.1), (3.0, 3.55), (5.5, 3.6), (8.0, 3.5), (9.6, 2.9), (11.0, 1.9)]
        mb.M = Matrix.Translation((0, 0.3, 0))
        ruin_wall(mb, L, TW, prof, strip='ruin')
        mb.M = Matrix.Identity(4)
        # карниз-пояс по фасаду (−Y)
        if lod <= 1:
            box(mb, -0.4, 0.3 - TW / 2 - 0.08, 2.6, 6.8, 0.18, 0.20, 'frieze', 'flag', bottom=True)
        # крылья стены, уходящие в склон
        for sx in (-1, 1):
            # от торца стены назад-наружу в склон (под 50°)
            mb.M = Matrix.Translation((sx * 6.5, 1.5, 0)) @ Matrix.Rotation(sx * 0.876, 4, 'Z')
            shape = (lambda t: 0.5 + 0.5 * t) if sx < 0 else (lambda t: 1.0 - 0.5 * t)
            ruin_wall(mb, 3.2, 1.0, jagged_profile(3.2, 0.9, 2.0, 0.8, rnd, shape), strip='ruin')
            mb.M = Matrix.Identity(4)
        # магистраль Ø1.7 м: из стены вперёд (−Y), рваный раструб
        seg = 12 if lod == 0 else (10 if lod == 1 else 8)
        ZC = 1.30
        mb.M = Matrix.Translation((0.6, 0.4, ZC)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        rim = [2.7 + (0.35 * math.sin(i * 2.3) if i % 3 else -0.45) for i in range(seg)]
        cylinder(mb, 0.86, 0.86, 0.0, max(rim), seg, 'iron', u_units=0.9, stretch=True, top_heights=rim, skey='culv')
        # тёмная глубина трубы
        planar_top(mb, [(0.82 * math.cos(2 * math.pi * i / seg), 0.82 * math.sin(2 * math.pi * i / seg), 2.05) for i in range(seg)], cell='dark')
        if lod <= 1:
            for zb in (0.55, 1.65):
                cylinder(mb, 0.93, 0.93, zb, zb + 0.18, seg, 'copper', u_units=0.9, stretch=True, skey='culvb%s' % zb)
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            # вторая, малая медная труба и вентиль на стене
            mb.M = Matrix.Translation((-3.4, 0.3 - TW / 2, 2.05)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
            cylinder(mb, 0.26, 0.26, 0.0, 0.9, 8, 'copper', u_units=0.3, stretch=True, top='flat', cap_cell='dark', skey='culs')
            mb.M = Matrix.Identity(4)
            # обломки магистрали и кладки у подножия
            mb.M = Matrix.Translation((3.6, -2.4, 0.42)) @ Matrix.Rotation(0.7, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            cylinder(mb, 0.55, 0.55, -1.0, 1.0, 10, 'iron', u_units=0.6, stretch=True, skey='culfr')
            mb.M = Matrix.Identity(4)
            for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (
                (-2.2, -1.6, 0.30, 1.1, 0.7, 0.55, 0.4, 0.15), (-4.0, -1.1, 0.25, 0.9, 0.6, 0.45, -0.5, -0.1),
                (2.0, -2.9, 0.22, 0.8, 0.5, 0.4, 1.0, 0.2), (-0.8, -3.2, 0.2, 0.7, 0.5, 0.36, -0.9, 0.1),
            ):
                chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
        return mb, [
            (0, 0.3, L, TW, 3.4, 0.0),
            (0.6, -0.95, 1.9, 2.7, 2.2, 0.0),
        ]

    # ============================================================
    #  12. ПЕШЕХОДНЫЙ МОСТИК ЧЕРЕЗ РУЧЕЙ (настил на чугунных козлах)
    # ============================================================
    DECK = 3.20

    def build_river_footbridge(lod):
        """Мостик 18 м: дощатый настил на чугунных козлах и каменных устоях, перила с выломанным пролётом. Проходимый настил."""
        mb = MB()
        LEN, WD = 18.0, 2.4
        # устои на берегах
        for sx in (-1, 1):
            box(mb, sx * 8.4, 0, DECK - 1.9, 1.3, 3.0, 1.74, 'stone', 'flag', bottom=True)
        # продольные балки
        for sy in (-0.9, 0.9):
            box(mb, 0, sy, DECK - 0.40, LEN - 0.4, 0.16, 0.24, 'iron', 'iron', bottom=True)
        # настил (продольные доски полосы wood), у правого края — выломанный участок
        box(mb, -1.8, 0, DECK - 0.16, LEN - 3.6, WD, 0.16, 'wood', 'wood', bottom=True)
        box(mb, 7.2, -0.3, DECK - 0.16, 3.6, WD - 0.6, 0.16, 'wood', 'wood', bottom=True)
        if lod <= 1:
            box(mb, 7.2, 0.95, DECK - 0.22, 1.4, 0.5, 0.10, 'wood', 'wood', bottom=True)
        # козлы
        for tx in (-4.5, 0.0, 4.5):
            for sy in (-1.0, 1.0):
                box(mb, tx, sy, 0.0, 0.16, 0.16, DECK - 0.40, 'iron', 'iron')
            box(mb, tx, 0, DECK - 0.62, 0.20, 2.3, 0.22, 'iron', 'iron', bottom=True)
            if lod <= 1:
                mb.M = Matrix.Translation((tx, 0, (DECK - 0.4) * 0.45)) @ Matrix.Rotation(0.95, 4, 'X')
                box(mb, 0, 0, -1.3, 0.1, 0.1, 2.6, 'iron', 'iron', bottom=True)
                mb.M = Matrix.Identity(4)
        # перила
        post_x = [-8.5, -5.6, -2.8, 0.0, 2.8, 5.6, 8.5]
        for sy in (-1.12, 1.12):
            for px in post_x:
                if sy > 0 and px == 5.6:
                    continue
                box(mb, px, sy, DECK, 0.10, 0.10, 1.0, 'wood', 'wood')
            if sy < 0:
                box(mb, 0, sy, DECK + 0.92, 17.1, 0.09, 0.09, 'wood', 'wood', bottom=True)
                if lod <= 1:
                    box(mb, 0, sy, DECK + 0.48, 17.1, 0.06, 0.06, 'wood', 'wood', bottom=True)
            else:
                box(mb, -4.25, sy, DECK + 0.92, 8.6, 0.09, 0.09, 'wood', 'wood', bottom=True)
                if lod <= 1:
                    # сорванный пролёт перил свисает к воде
                    mb.M = Matrix.Translation((5.2, sy + 0.05, DECK + 0.9)) @ Matrix.Rotation(0.75, 4, 'Y')
                    box(mb, 0, 0, -0.05, 2.6, 0.09, 0.09, 'wood', 'wood', bottom=True)
                    mb.M = Matrix.Identity(4)
                box(mb, 8.4, sy, DECK + 0.92, 0.3, 0.09, 0.09, 'wood', 'wood', bottom=True)
        return mb, [(0, 0, LEN + 0.6, WD, 0.6, DECK - 0.6, True)]

    pieces_list.extend([
        ('opt_park_fountain', build_park_fountain, {'drawDist': 420, 'lodDist': [70, 170]}),
        ('opt_park_bench', build_park_bench, {'drawDist': 160, 'lodDist': [40, 90], 'shadow': False}),
        ('opt_park_bench_broken', build_park_bench_broken, {'drawDist': 160, 'lodDist': [40, 90], 'shadow': False}),
        ('opt_park_lamp', build_park_lamp, {'drawDist': 260, 'lodDist': [45, 110]}),
        ('opt_park_lamp_bent', build_park_lamp_bent, {'drawDist': 220, 'lodDist': [45, 110]}),
        ('opt_park_fence', build_park_fence, {'drawDist': 240, 'lodDist': [40, 100], 'shadow': False}),
        ('opt_park_fence_broken', build_park_fence_broken, {'drawDist': 220, 'lodDist': [40, 100], 'shadow': False}),
        ('opt_park_gate', build_park_gate, {'drawDist': 420, 'lodDist': [60, 150]}),
        ('opt_park_pavilion', build_park_pavilion, {'drawDist': 480, 'lodDist': [75, 180]}),
        ('opt_park_greenhouse', build_park_greenhouse, {'drawDist': 460, 'lodDist': [70, 170]}),
        ('opt_park_flowerbed', build_park_flowerbed, {'drawDist': 200, 'lodDist': [45, 100], 'shadow': False}),
        ('opt_park_clock', build_park_clock, {'drawDist': 320, 'lodDist': [55, 130]}),
        ('opt_park_urn', build_park_urn, {'drawDist': 160, 'lodDist': [35, 80], 'shadow': False}),
        ('opt_river_culvert', build_river_culvert, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_river_footbridge', build_river_footbridge, {'drawDist': 420, 'lodDist': [65, 160]}),
    ])
