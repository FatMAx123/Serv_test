# ============================================================
#  SCRIPTS / OPERATORS-TERRITORY / KIT_UNIQUE.PY
#  Уникальные процедурные стимпанк-машины, гладкие трубы (copper/brass/iron)
#  и неповторяющиеся руины Бастиона Операторов — всё на едином opt_atlas.webp.
# ============================================================
import math
import random
from mathutils import Matrix, Vector


def register_pieces(k, pieces_list):
    """Создаёт и регистрирует уникальные стимпанк- и руинные объекты в build_kit.PIECES."""
    MB = k['MB']
    box = k['box']
    cylinder = k['cylinder']
    annulus = k['annulus']
    planar_top = k['planar_top']
    decal = k['decal']
    cone_spike = k['cone_spike']
    wedge_block = k['wedge_block']
    jagged_profile = k['jagged_profile']
    ruin_wall = k['ruin_wall']
    chunk = k['chunk']
    strip_v = k['strip_v']
    wall_rect = k['wall_rect']
    cell_uv = k['cell_uv']

    def elbow_arc(p_corner, dir_in, dir_out, bend_r, steps=7):
        di = Vector(dir_in).normalized()
        do = Vector(dir_out).normalized()
        pc = Vector(p_corner)
        p_start = pc - di * bend_r
        cen = p_start + do * bend_r
        pts = []
        for i in range(steps + 1):
            th = (math.pi * 0.5) * (i / steps)
            pts.append(cen - do * (bend_r * math.cos(th)) + di * (bend_r * math.sin(th)))
        return pts

    def tube(mb, pts, radius, seg, strip='copper', cap_a=True, cap_b=True, skey='tb'):
        """Герметичная гладкая труба без децимации с периодической U-развёрткой вдоль полосы."""
        pts = [Vector(p) for p in pts]
        if len(pts) < 2:
            return
        bh = max(1e-4, k['STRIPS'][strip]['heightM'])
        rings = []
        norms = []
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
            ring = []
            rnrm = []
            for j in range(seg):
                a = 2.0 * math.pi * j / seg
                out_dir = (math.cos(a) * n + math.sin(a) * b).normalized()
                ring.append(tuple(p + radius * out_dir))
                rnrm.append(out_dir)
            rings.append(ring)
            norms.append(rnrm)

        # Треугольная волна по V строго внутри [0.08..0.92] гарантирует 0 протечек через кромки полосы!
        def v_wave(s_dist):
            ph = (s_dist / max(0.35, bh * 1.8)) % 2.0
            tri = ph if ph <= 1.0 else (2.0 - ph)
            return strip_v(strip, 0.08 + 0.84 * tri)

        key = '%s_%d_%s' % (skey, id(mb), round(radius, 3))
        acc = 0.0
        for i in range(len(rings) - 1):
            seg_len = (pts[i + 1] - pts[i]).length
            va = v_wave(acc)
            acc += seg_len
            vb = v_wave(acc)
            rA, rB = rings[i], rings[i + 1]
            nA, nB = norms[i], norms[i + 1]
            for j in range(seg):
                j1 = (j + 1) % seg
                ua = j / float(seg)       # ровно 0..1 по длине полосы (100% периодично по U!)
                ub = (j + 1) / float(seg)
                out = (nA[j] + nA[j1] + nB[j1] + nB[j]) * 0.25
                mb.poly([rA[j], rA[j1], rB[j1], rB[j]],
                        [(ua, va), (ub, va), (ub, vb), (ua, vb)],
                        out, smooth=True, skey=key)
        if cap_a:
            t0 = (pts[0] - pts[1]).normalized()
            planar_top(mb, list(reversed(rings[0])), cell='dark', outward=t0)
        if cap_b:
            t1 = (pts[-1] - pts[-2]).normalized()
            planar_top(mb, rings[-1], cell='dark', outward=t1)

    def flange(mb, pos, axis_dir, radius, thick, seg, strip='brass', skey='fl'):
        d = Vector(axis_dir).normalized() * (thick * 0.5)
        p = Vector(pos)
        tube(mb, [p - d, p + d], radius, seg, strip=strip, cap_a=True, cap_b=True, skey=skey)

    def valve_wheel(mb, pos, axis_dir, r=0.22, strip='brass', skey='vw'):
        d = Vector(axis_dir).normalized()
        p = Vector(pos)
        ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        u = d.cross(ref).normalized()
        v = d.cross(u).normalized()
        seg = 10
        ring_pts = [tuple(p + r * (math.cos(2 * math.pi * i / seg) * u + math.sin(2 * math.pi * i / seg) * v))
                    for i in range(seg)]
        # закрытое кольцо обода вентиля
        ring_pts.append(ring_pts[0])
        tube(mb, ring_pts, 0.032, 6, strip=strip, cap_a=False, cap_b=False, skey=skey)
        tube(mb, [tuple(p - r * u), tuple(p + r * u)], 0.024, 5, strip='iron', skey=skey + 's1')
        tube(mb, [tuple(p - r * v), tuple(p + r * v)], 0.024, 5, strip='iron', skey=skey + 's2')

    # ============================================================
    #  1. СТИМПАНК-МАШИНЫ И ЧИСТЫЕ ТРУБОПРОВОДЫ
    # ============================================================
    def build_steam_boiler_tower(lod):
        """Уникальный вертикальный клёпаный медный паровой котёл с топкой, дымоходом и манометром (0 розовых крыш!)."""
        mb = MB()
        seg = 14 if lod == 0 else (10 if lod == 1 else 8)
        # Ступенчатый каменный цоколь + чугунная топка
        box(mb, 0, 0, 0.0, 3.1, 3.1, 0.55, 'stone', 'flag', bottom=True)
        box(mb, 0, 0, 0.55, 2.35, 2.35, 1.55, 'iron', 'iron', bottom=True)
        decal(mb, (0, -1.19, 1.15), (1, 0, 0), (0, 0, 1), 0.92, 0.86, 'glow', (0, -1, 0))
        # Медный барабан высокого давления с латунными обручами
        cylinder(mb, 1.04, 1.04, 2.10, 4.95, seg, 'copper', stretch=False, skey='sb_body')
        cylinder(mb, 1.04, 0.42, 4.95, 5.55, seg, 'iron', stretch=False, skey='sb_dome')
        cylinder(mb, 0.32, 0.28, 5.55, 6.85, seg, 'iron', stretch=False, top='flat', cap_cell='dark', skey='sb_stack')
        if lod <= 1:
            for zb in (2.25, 3.45, 4.75):
                cylinder(mb, 1.09, 1.09, zb, zb + 0.16, seg, 'brass', stretch=False, skey='sb_r%s' % zb)
            # Боковой медный отвод с вентилем в корпус топки + манометр спереди
            pts_p = [(-1.25, -0.35, 0.55), (-1.25, -0.35, 3.60)] + elbow_arc((-1.25, -0.35, 3.90), (0, 0, 1), (1, 0, 0), 0.30, 5) + [(-0.85, -0.35, 3.90)]
            tube(mb, pts_p, 0.14, 8, 'copper', skey='sb_bp')
            flange(mb, (-1.25, -0.35, 0.62), (0, 0, 1), 0.26, 0.16, 8, 'iron', skey='sb_fl')
            box(mb, 0.45, -1.10, 2.55, 0.58, 0.24, 0.58, 'brass', 'iron', bottom=True)
            decal(mb, (0.45, -1.23, 2.84), (1, 0, 0), (0, 0, 1), 0.44, 0.44, 'gauge', (0, -1, 0))
            if lod == 0:
                valve_wheel(mb, (-1.45, -0.35, 2.15), (-1, 0, 0), 0.22, 'brass', skey='sb_vw')
        return mb, [(0, 0, 2.8, 2.8, 6.6, 0.0)]

    def build_steam_dynamo(lod):
        """Уникальный горизонтальный паровой поршневой генератор с медным кожухом и маховиком."""
        mb = MB()
        seg = 12 if lod <= 1 else 8
        box(mb, 0, 0, 0.0, 3.7, 2.2, 0.45, 'stone', 'flag', bottom=True)
        box(mb, 0, 0, 0.45, 3.1, 1.75, 0.45, 'iron', 'iron', bottom=True)
        # Горизонтальный паровой цилиндр в медном кожухе по X
        old = mb.M
        mb.M = Matrix.Translation((-0.25, 0.0, 1.52)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        cylinder(mb, 0.56, 0.56, -1.25, 1.05, seg, 'copper', stretch=False, top='flat', cap_cell='dark', skey='sd_cyl')
        cylinder(mb, 0.61, 0.61, -1.20, -1.02, seg, 'brass', stretch=False, skey='sd_b1')
        cylinder(mb, 0.61, 0.61, 0.85, 1.02, seg, 'brass', stretch=False, skey='sd_b2')
        mb.M = old
        # Верхний паровой коллекторный колпак
        cylinder(mb, 0.36, 0.36, 1.95, 2.85, seg, 'brass', stretch=False, top='flat', cap_cell='dark', skey='sd_dome')
        # Крупный спицованный маховик на торце +X
        wh_m = Matrix.Translation((1.22, 0.0, 1.52)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        n_arc = 10 if lod <= 1 else 6
        for i in range(n_arc):
            a = 2 * math.pi * i / n_arc
            mb.M = wh_m @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0.88, 0, -0.14))
            box(mb, 0, 0, 0, 0.22, 0.62, 0.28, 'iron', 'iron', bottom=True)
        for i in range(3):
            mb.M = wh_m @ Matrix.Rotation(i * math.pi / 3, 4, 'Z')
            box(mb, 0, 0, -0.10, 1.76, 0.14, 0.20, 'brass', 'brass', bottom=True)
        mb.M = wh_m
        cylinder(mb, 0.28, 0.28, -0.22, 0.22, 8, 'iron', stretch=True, top='flat', skey='sd_hub')
        mb.M = old
        if lod <= 1:
            decal(mb, (-0.25, -0.90, 1.40), (1, 0, 0), (0, 0, 1), 0.44, 0.44, 'gauge', (0, -1, 0))
            pts_out = [(-1.30, 0.32, 0.45), (-1.30, 0.32, 1.52), (-0.95, 0.32, 1.52)]
            tube(mb, pts_out, 0.13, 8, 'copper', skey='sd_in')
        return mb, [(0, 0, 3.6, 2.2, 2.9, 0.0)]

    def build_steam_cistern(lod):
        """Уникальная приподнятая клепаная водонапорно-паровая цистерна на стальных опорах."""
        mb = MB()
        seg = 14 if lod == 0 else (10 if lod == 1 else 8)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(mb, sx * 1.10, sy * 1.10, 0.0, 0.56, 0.56, 0.42, 'stone', 'stone', bottom=True)
                box(mb, sx * 1.05, sy * 1.05, 0.42, 0.28, 0.28, 1.85, 'iron', 'iron', bottom=True)
        box(mb, 0, 0, 2.15, 2.65, 2.65, 0.24, 'iron', 'iron', bottom=True)
        cylinder(mb, 1.18, 1.18, 2.39, 4.45, seg, 'wood', stretch=False, skey='sc_tank')
        cylinder(mb, 1.22, 0.25, 4.45, 5.15, seg, 'copper', stretch=False, top='flat', skey='sc_cap')
        if lod <= 1:
            for zb in (2.55, 3.35, 4.18):
                cylinder(mb, 1.21, 1.21, zb, zb + 0.12, seg, 'brass', stretch=False, skey='sc_b%s' % zb)
        # Толстый центральный медный стояк уходит из дна бака прямо в фундамент
        tube(mb, [(0, 0, 0.0), (0, 0, 2.40)], 0.22, 10, 'copper', skey='sc_pipe')
        flange(mb, (0, 0, 0.14), (0, 0, 1), 0.36, 0.28, 10, 'iron', skey='sc_fl')
        if lod == 0:
            decal(mb, (0, -1.21, 3.35), (1, 0, 0), (0, 0, 1), 0.46, 0.46, 'gauge', (0, -1, 0))
        return mb, [(0, 0, 2.9, 2.9, 4.8, 0.0)]

    def build_forge_hearth(lod):
        """Уникальный стимпанк-горн полевой кузни с горящими углями, центрированным медным зонтом и бочкой закалки."""
        mb = MB()
        box(mb, -0.20, 0, 0.0, 1.95, 1.65, 0.92, 'stone', 'flag', bottom=True)
        box(mb, -0.20, 0, 0.85, 1.30, 1.05, 0.16, 'iron', 'iron', top_cell='dark', bottom=True)
        decal(mb, (-0.20, 0.0, 1.02), (1, 0, 0), (0, 1, 0), 1.05, 0.82, 'glow', (0, 0, 1))
        # Опоры ровно под углы стальной рамы и вытяжного зонта (x = -0.20 ± 0.78, y = ±0.62)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(mb, -0.20 + sx * 0.78, sy * 0.62, 0.90, 0.15, 0.15, 1.20, 'iron', 'iron', bottom=True)
        # Цельная стальная окантовка-юбка зонта (опирается сверху на все 4 стойки, без зазоров)
        box(mb, -0.20, 0.0, 2.02, 1.84, 1.50, 0.12, 'iron', 'iron', top_cell='dark', bottom=True)
        # Центрированный по (-0.20, 0) медный пирамидальный вытяжной зонт + дымоход
        old_m = mb.M
        mb.M = Matrix.Translation((-0.20, 0.0, 0.0)) @ Matrix.Diagonal((1.0, 0.82, 1.0, 1.0))
        cylinder(mb, 1.32, 0.48, 2.12, 2.86, 4, 'copper', phase=math.pi / 4, stretch=False,
                 top='flat', bottom='flat', cap_cell='dark', skey='fh_hood')
        mb.M = old_m
        box(mb, -0.20, 0, 2.78, 0.68, 0.68, 1.14, 'ruin', 'iron', bottom=True)
        # Корыто закалки сбоку от очага
        box(mb, 1.18, 0.05, 0.0, 0.72, 1.18, 0.72, 'wood', 'iron', top_cell='dark', bottom=True)
        if lod <= 1:
            box(mb, 1.18, 0.05, 0.56, 0.78, 1.24, 0.10, 'iron', 'iron', bottom=True)
        return mb, [(0.05, 0, 2.6, 1.9, 3.6, 0.0)]

    def build_steam_brazier(lod):
        """Уникальный кованый латунно-железный треножный светильник полигона (мелкий декор, 0 коллизии)."""
        mb = MB()
        seg = 8 if lod <= 1 else 6
        box(mb, 0, 0, 0.0, 0.64, 0.64, 0.24, 'stone', 'flag', bottom=True)
        cylinder(mb, 0.14, 0.09, 0.24, 1.38, seg, 'iron', stretch=True, skey='sbr_p')
        box(mb, 0, 0, 1.38, 0.42, 0.42, 0.08, 'brass', 'brass', bottom=True)
        for (n, c, r) in (((0, -1, 0), (0, -0.16, 1.62), (1, 0, 0)), ((0, 1, 0), (0, 0.16, 1.62), (-1, 0, 0)),
                          ((1, 0, 0), (0.16, 0, 1.62), (0, 1, 0)), ((-1, 0, 0), (-0.16, 0, 1.62), (0, -1, 0))):
            decal(mb, c, r, (0, 0, 1), 0.30, 0.38, 'glow', n)
        box(mb, 0, 0, 1.82, 0.46, 0.46, 0.08, 'brass', 'brass', bottom=True)
        cylinder(mb, 0.28, 0.04, 1.90, 2.18, seg, 'copper', stretch=False, top='flat', skey='sbr_cap')
        return mb, []

    def build_copper_tanks(lod):
        """Парные клёпаные медные баллоны давления на чугунной раме (мелкий декор, 0 коллизии)."""
        mb = MB()
        seg = 10 if lod <= 1 else 8
        box(mb, 0, 0, 0.0, 1.24, 0.68, 0.18, 'iron', 'iron', bottom=True)
        for sx in (-0.34, +0.34):
            old = mb.M
            mb.M = Matrix.Translation((sx, 0.0, 0.18))
            cylinder(mb, 0.25, 0.25, 0.0, 0.92, seg, 'copper', stretch=False, top='flat', skey='ct_%s' % sx)
            cylinder(mb, 0.27, 0.27, 0.18, 0.28, seg, 'brass', stretch=False, skey='ctb1_%s' % sx)
            cylinder(mb, 0.27, 0.27, 0.70, 0.80, seg, 'brass', stretch=False, skey='ctb2_%s' % sx)
            mb.M = old
        tube(mb, [(-0.34, 0, 1.10), (-0.34, 0, 1.32), (+0.34, 0, 1.32), (+0.34, 0, 1.10)], 0.055, 6, 'brass', skey='ct_top')
        if lod == 0:
            decal(mb, (0, -0.07, 1.32), (1, 0, 0), (0, 0, 1), 0.24, 0.24, 'gauge', (0, -1, 0))
        return mb, []

    def build_pipe_bridge_east(lod):
        """Чистая надземная стимпанк-арка паропровода мастерской (0 децимации, 14-сегментная гладкая медь!)."""
        mb = MB()
        seg = 14 if lod <= 1 else 8
        seg_sub = 10 if lod <= 1 else 6
        rx, top_z, bend = 3.10, 4.65, 0.72
        for sx in (-1, 1):
            box(mb, sx * rx, 0.08, 0.0, 0.88, 0.88, 0.36, 'stone', 'flag', bottom=True)
            flange(mb, (sx * rx, 0, 0.42), (0, 0, 1), 0.32, 0.16, 10, 'iron', skey='pb_b%s' % sx)
        pts_m = (
            [(-rx, 0, 0.32), (-rx, 0, top_z - bend)]
            + elbow_arc((-rx, 0, top_z), (0, 0, 1), (1, 0, 0), bend, 7 if lod <= 1 else 4)
            + elbow_arc((+rx, 0, top_z), (1, 0, 0), (0, 0, -1), bend, 7 if lod <= 1 else 4)
            + [(+rx, 0, 0.32)]
        )
        tube(mb, pts_m, 0.21, seg, 'copper', skey='pb_main')
        pts_s = (
            [(-rx, 0.28, 0.32), (-rx, 0.28, top_z + 0.28 - 0.56)]
            + elbow_arc((-rx, 0.28, top_z + 0.28), (0, 0, 1), (1, 0, 0), 0.56, 5 if lod <= 1 else 3)
            + elbow_arc((+rx, 0.28, top_z + 0.28), (1, 0, 0), (0, 0, -1), 0.56, 5 if lod <= 1 else 3)
            + [(+rx, 0.28, 0.32)]
        )
        tube(mb, pts_s, 0.11, seg_sub, 'brass', skey='pb_sub')
        if lod <= 1:
            for sx in (-1, 1):
                flange(mb, (sx * rx, 0, 1.55), (0, 0, 1), 0.28, 0.16, 10, 'brass', skey='pb_f1%s' % sx)
                flange(mb, (sx * rx, 0, 3.15), (0, 0, 1), 0.28, 0.16, 10, 'brass', skey='pb_f2%s' % sx)
            flange(mb, (0, 0, top_z), (1, 0, 0), 0.31, 0.28, 10, 'iron', skey='pb_mid')
            if lod == 0:
                tube(mb, [(0, 0, top_z), (0, -0.34, top_z)], 0.06, 6, 'brass', skey='pb_vs')
                valve_wheel(mb, (0, -0.35, top_z), (0, -1, 0), 0.22, 'brass', skey='pb_vw')
                box(mb, 0.85, 0.0, top_z - 0.36, 0.44, 0.22, 0.44, 'iron', 'brass', bottom=True)
                decal(mb, (0.85, -0.12, top_z - 0.14), (1, 0, 0), (0, 0, 1), 0.34, 0.34, 'gauge', (0, -1, 0))
        return mb, [(-rx, 0, 0.88, 0.88, 4.5, 0.0), (+rx, 0, 0.88, 0.88, 4.5, 0.0)]

    def build_pipe_wall_manifold(lod):
        """Замкнутый горизонтальный коллектор-паропровод на опорах: оба конца уходят отводами строго в каменную плиту!"""
        mb = MB()
        seg = 12 if lod <= 1 else 8
        rx = 1.95
        bend = 0.42
        for sx in (-1, 1):
            box(mb, sx * rx, 0.0, 0.0, 0.76, 0.84, 0.32, 'stone', 'flag', bottom=True)
            box(mb, sx * 1.05, 0.0, 0.0, 0.46, 0.72, 0.28, 'stone', 'stone', bottom=True)
            tube(mb, [(sx * 1.05, -0.14, 0.24), (sx * 1.05, -0.14, 0.72)], 0.10, 8, 'iron', skey='pm_sp%s' % sx)
        pts_m = (
            [(-rx, -0.14, 0.24), (-rx, -0.14, 0.78 - bend)]
            + elbow_arc((-rx, -0.14, 0.78), (0, 0, 1), (1, 0, 0), bend, 5)
            + elbow_arc((+rx, -0.14, 0.78), (1, 0, 0), (0, 0, -1), bend, 5)
            + [(+rx, -0.14, 0.24)]
        )
        tube(mb, pts_m, 0.20, seg, 'copper', skey='pm_m')
        pts_s = (
            [(-rx, +0.22, 0.24), (-rx, +0.22, 0.58 - 0.26)]
            + elbow_arc((-rx, +0.22, 0.58), (0, 0, 1), (1, 0, 0), 0.26, 4)
            + elbow_arc((+rx, +0.22, 0.58), (1, 0, 0), (0, 0, -1), 0.26, 4)
            + [(+rx, +0.22, 0.24)]
        )
        tube(mb, pts_s, 0.10, 8, 'brass', skey='pm_s')
        if lod <= 1:
            flange(mb, (0, -0.14, 0.78), (1, 0, 0), 0.28, 0.22, 10, 'iron', skey='pm_mid')
            tube(mb, [(0, -0.14, 0.78), (0, -0.14, 1.15)], 0.055, 6, 'brass', skey='pm_vs')
            valve_wheel(mb, (0, -0.14, 1.16), (0, 0, 1), 0.20, 'brass', skey='pm_vw')
            decal(mb, (0.45, -0.35, 0.78), (1, 0, 0), (0, 0, 1), 0.30, 0.30, 'gauge', (0, -1, 0))
        return mb, [(0, 0, 4.4, 0.95, 1.25, 0.0)]

    def build_pipe_ground_riser(lod):
        """Большой BioShock-стояк: тяжёлый каменный воротник (0..0.55м) + гладкая медь 90° строго в стену (+X=2.35)."""
        mb = MB()
        seg = 14 if lod <= 1 else 8
        tz, bend = 2.95, 0.76
        # Заглубляемый каменный оголовок-цоколь в грунте (0..0.58м) -> sink=0.48 надёжно прячет низ на склоне
        box(mb, 0.0, 0.08, 0.0, 1.18, 1.18, 0.62, 'stone', 'flag', bottom=True)
        flange(mb, (0, 0, 0.68), (0, 0, 1), 0.44, 0.20, 12, 'iron', skey='pgr_b')
        pts_m = (
            [(0, 0, 0.55), (0, 0, tz - bend)]
            + elbow_arc((0, 0, tz), (0, 0, 1), (1, 0, 0), bend, 7 if lod <= 1 else 4)
            + [(2.35, 0, tz)]
        )
        tube(mb, pts_m, 0.29, seg, 'copper', skey='pgr_m')
        pts_s = (
            [(0, 0.40, 0.55), (0, 0.40, 2.42 - 0.48)]
            + elbow_arc((0, 0.40, 2.42), (0, 0, 1), (1, 0, 0), 0.48, 5 if lod <= 1 else 3)
            + [(2.35, 0.40, 2.42)]
        )
        tube(mb, pts_s, 0.11, 8, 'brass', skey='pgr_s')
        flange(mb, (2.30, 0.12, tz), (1, 0, 0), 0.44, 0.20, 12, 'iron', skey='pgr_wall')
        if lod <= 1:
            flange(mb, (0, 0, 1.65), (0, 0, 1), 0.37, 0.18, 10, 'brass', skey='pgr_c1')
            flange(mb, (1.42, 0, tz), (1, 0, 0), 0.37, 0.18, 10, 'brass', skey='pgr_c2')
            if lod == 0:
                tube(mb, [(0, 0, 1.65), (0, -0.38, 1.65)], 0.06, 6, 'brass', skey='pgr_vs')
                valve_wheel(mb, (0, -0.39, 1.65), (0, -1, 0), 0.24, 'brass', skey='pgr_vw')
                decal(mb, (0.40, -0.31, 1.65), (1, 0, 0), (0, 0, 1), 0.34, 0.34, 'gauge', (0, -1, 0))
        return mb, [(0, 0, 1.15, 1.15, 3.2, 0.0)]

    def build_pipe_arch_ground(lod):
        """Мощная заземлённая П-дуга на рельефе: глубокие каменные якоря (0..0.78м) полностью исключают парение на склоне!"""
        mb = MB()
        seg = 14 if lod <= 1 else 8
        rx, top_z, bend = 2.40, 4.15, 0.82
        for sx in (-1, 1):
            box(mb, sx * rx, 0.12, 0.0, 1.24, 1.24, 0.78, 'stone', 'flag', bottom=True)
            flange(mb, (sx * rx, 0, 0.84), (0, 0, 1), 0.44, 0.20, 12, 'iron', skey='pag_b%s' % sx)
        pts_m = (
            [(-rx, 0, 0.70), (-rx, 0, top_z - bend)]
            + elbow_arc((-rx, 0, top_z), (0, 0, 1), (1, 0, 0), bend, 7 if lod <= 1 else 4)
            + elbow_arc((+rx, 0, top_z), (1, 0, 0), (0, 0, -1), bend, 7 if lod <= 1 else 4)
            + [(+rx, 0, 0.70)]
        )
        tube(mb, pts_m, 0.30, seg, 'copper', skey='pag_m')
        pts_s = (
            [(-rx - 0.32, 0.38, 0.70), (-rx - 0.32, 0.38, top_z - 0.42 - 0.56)]
            + elbow_arc((-rx - 0.32, 0.38, top_z - 0.42), (0, 0, 1), (1, 0, 0), 0.56, 5 if lod <= 1 else 3)
            + elbow_arc((+rx + 0.32, 0.38, top_z - 0.42), (1, 0, 0), (0, 0, -1), 0.56, 5 if lod <= 1 else 3)
            + [(+rx + 0.32, 0.38, 0.70)]
        )
        tube(mb, pts_s, 0.12, 8, 'brass', skey='pag_s')
        if lod <= 1:
            for sx in (-1, 1):
                flange(mb, (sx * rx, 0, 1.95), (0, 0, 1), 0.39, 0.20, 10, 'brass', skey='pag_f1%s' % sx)
                flange(mb, (sx * rx, 0, 3.05), (0, 0, 1), 0.39, 0.20, 10, 'brass', skey='pag_f2%s' % sx)
            flange(mb, (0, 0, top_z), (1, 0, 0), 0.42, 0.36, 10, 'iron', skey='pag_mid')
            if lod == 0:
                tube(mb, [(0, 0, top_z), (0, -0.44, top_z)], 0.07, 6, 'brass', skey='pag_vs')
                valve_wheel(mb, (0, -0.45, top_z), (0, -1, 0), 0.28, 'brass', skey='pag_vw')
        return mb, [(-rx, 0, 1.2, 1.2, 4.1, 0.0), (+rx, 0, 1.2, 1.2, 4.1, 0.0)]

    # ============================================================
    #  2. УНИКАЛЬНЫЕ РАЗРУШЕННЫЕ ОРИЕНТИРЫ ОКРЕСТНОСТЕЙ (БЕЗ КОПИПАСТА)
    # ============================================================
    def build_ruin_gate_pylon(lod):
        """Уникальные разрушенные внешние сторожевые ворота: два пилона со сквозным проходом и остатком свода."""
        mb = MB()
        rnd = random.Random(401)
        pier = 1.85
        cxL, cxR = -2.85, +2.85
        # Левый мощный пилон со сломанным аркадным верхом
        box(mb, cxL, 0, 0.0, pier + 0.5, pier + 0.5, 0.85, 'stone', 'flag', bottom=True)
        box(mb, cxL, 0, 0.85, pier, pier, 4.4, 'stone', 'frieze', bottom=True)
        if lod <= 1:
            box(mb, cxL, 0, 5.25, pier + 0.32, pier + 0.32, 0.32, 'frieze', 'stone', bottom=True)
            for i in range(4 if lod == 0 else 2):
                a0 = math.pi - math.pi * i / 9.0 - 0.008
                a1 = math.pi - math.pi * (i + 1) / 9.0 + 0.008
                wedge_block(mb, a1, a0, 1.92, 2.78, 0.0, pier - 0.28, 0.0, 5.58)
            box(mb, cxL - 0.45, 0, 5.58, 0.85, pier - 0.25, 1.85, 'ruin', 'ruin', bottom=True)
        # Правый сломанный пилон с рваным зубом и вбитой балкой
        box(mb, cxR, 0, 0.0, pier + 0.4, pier + 0.4, 0.75, 'stone', 'flag', bottom=True)
        mb.M = Matrix.Translation((cxR, 0.0, 0.75))
        ruin_wall(mb, pier, pier, [(0.0, 3.1), (0.6, 2.5), (1.2, 3.6), (pier, 2.2)], strip='ruin', cap='ruin')
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            tube(mb, [(cxL - 0.65, -0.65, 0.5), (cxL - 0.65, -0.65, 6.1)], 0.16, 8, 'copper', skey='rgp_c')
        return mb, [(cxL, 0, pier + 0.3, pier + 0.3, 7.6, 0.0), (cxR, 0, pier + 0.3, pier + 0.3, 4.4, 0.0)]

    def build_ruin_viaduct_east(lod):
        """Уникальный рухнувший восточный виадук: два устоя, обвалившийся в центр каменный пролёт и торчащие трубы."""
        mb = MB()
        rnd = random.Random(419)
        W_D = 3.6
        box(mb, -3.7, 0, 0.0, 3.0, W_D, 4.3, 'stone', 'flag', bottom=True)
        box(mb, +3.7, 0, 0.0, 3.0, W_D, 2.8, 'ruin', 'flag', bottom=True)
        if lod <= 1:
            box(mb, -3.7, 0, 4.3, 3.2, W_D + 0.2, 0.34, 'frieze', 'ruin', bottom=True)
        # Рухнувший в проём наклонный каменный блок перекрытия
        mb.M = Matrix.Translation((-0.3, 0.0, 1.35)) @ Matrix.Rotation(-0.32, 4, 'Y') @ Matrix.Rotation(0.08, 4, 'Z')
        box(mb, 0, 0, -0.55, 3.8, W_D - 0.5, 1.15, 'ruin', 'flag', bottom=True)
        mb.M = Matrix.Identity(4)
        if lod <= 1:
            tube(mb, [(-2.2, -0.8, 3.65), (-0.4, -0.8, 3.65)], 0.22, 8, 'copper', skey='rve_p1')
            tube(mb, [(+2.2, +0.7, 2.35), (+1.0, +0.7, 2.75)], 0.18, 8, 'brass', skey='rve_p2')
        return mb, [(-3.7, 0, 3.0, W_D, 4.7, 0.0), (+3.7, 0, 3.0, W_D, 3.0, 0.0), (-0.3, 0, 3.6, W_D - 0.4, 2.2, 0.0)]

    def build_ruin_foundry_shell(lod):
        """Уникальные руины разрушенной внешней литейной мастерской: Г-стена, дымоход и смятый котёл."""
        mb = MB()
        rnd = random.Random(431)
        # Северная и западная стены из тёмной кладки с проёмами
        mb.M = Matrix.Translation((0.0, +2.2, 0.0))
        ruin_wall(mb, 6.4, 0.95, jagged_profile(6.4, 1.8, 4.6, 0.8 if lod <= 1 else 1.6, rnd, lambda t: 0.4 + 0.6 * (1 - t)), strip='stone')
        mb.M = Matrix.Translation((-2.75, -0.2, 0.0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
        ruin_wall(mb, 4.8, 0.95, jagged_profile(4.8, 1.2, 4.3, 0.8 if lod <= 1 else 1.6, rnd, lambda t: 1.0 - t * 0.65), strip='ruin')
        mb.M = Matrix.Identity(4)
        # Обломанный кирпично-каменный дымоход + вскрытый котёл в углу
        box(mb, -2.2, +1.8, 0.0, 1.6, 1.6, 4.9, 'stone', 'iron', bottom=True)
        if lod <= 1:
            mb.M = Matrix.Translation((+0.9, +0.1, 0.85)) @ Matrix.Rotation(0.26, 4, 'X') @ Matrix.Rotation(0.42, 4, 'Z')
            cylinder(mb, 0.92, 0.88, -1.1, 1.1, 10, 'copper', stretch=False, top='flat', skey='rfs_drum')
            mb.M = Matrix.Identity(4)
            chunk(mb, 1.4, -1.5, 0.35, 1.4, 0.8, 0.65, 0.5, 0.14, 'ruin')
        return mb, [(0.0, 2.2, 6.4, 1.0, 4.6, 0.0), (-2.75, -0.2, 1.0, 4.8, 4.3, 0.0), (+0.9, 0.1, 2.2, 2.2, 1.9, 0.0)]

    def build_ruin_wall_breach(lod):
        """Уникальная пробитая артиллерией крепостная стена (пролом посередине до 0.55 м)."""
        mb = MB()
        rnd = random.Random(443)
        L = 9.0
        prof = jagged_profile(L, 0.55, 4.2, 0.75 if lod <= 1 else 1.5, rnd, lambda t: 0.12 + 0.88 * abs(2.0 * t - 1.0) ** 1.3)
        ruin_wall(mb, L, 1.1, prof, strip='stone', cap='ruin')
        if lod <= 1:
            chunk(mb, 0.2, -0.9, 0.25, 1.5, 0.75, 0.5, 0.3, -0.1, 'ruin')
            chunk(mb, -0.7, +0.8, 0.22, 1.2, 0.65, 0.45, -0.6, 0.12, 'stone')
        return mb, [(-3.1, 0, 2.8, 1.1, 4.2, 0.0), (+3.1, 0, 2.8, 1.1, 4.2, 0.0)]

    def build_ruin_wall_buttress(lod):
        """Уникальная стена с каменными контрфорсами и стальной перемычкой внутри проёма."""
        mb = MB()
        rnd = random.Random(457)
        L = 8.0
        prof = jagged_profile(L, 1.5, 3.8, 0.8 if lod <= 1 else 1.6, rnd, lambda t: 0.55 + 0.45 * math.sin(math.pi * t))
        ruin_wall(mb, L, 1.0, prof, strip='ruin', cap='stone')
        for sx in (-2.2, +2.0):
            box(mb, sx, -0.68, 0.0, 0.95, 0.75, 2.8, 'stone', 'frieze', bottom=True)
        if lod <= 1:
            tube(mb, [(-2.2, -0.68, 2.05), (+2.0, -0.68, 2.05)], 0.11, 8, 'copper', skey='rwb_p')
        return mb, [(0, 0, L, 1.5, 3.8, 0.0)]

    def build_ruin_wall_colonnade(lod):
        """Уникальная руина стены с вмурованными каннелированными колоннами и куском антаблемента."""
        mb = MB()
        rnd = random.Random(461)
        L = 8.2
        ruin_wall(mb, L, 0.95, jagged_profile(L, 1.1, 2.9, 0.9, rnd), strip='stone', cap='ruin')
        cylinder(mb, 0.46, 0.41, 0.0, 4.6, 10 if lod <= 1 else 6, 'flutes', u_units=0.5, stretch=True, top='flat', bottom='flat', skey='rwc_c1')
        cylinder(mb, 0.46, 0.43, 0.0, 3.1, 10 if lod <= 1 else 6, 'flutes', u_units=0.5, stretch=True, top='jagged',
                 top_heights=[2.9, 3.2, 2.8, 3.4, 3.0, 3.1, 2.7, 3.3, 2.9, 3.0][:10 if lod <= 1 else 6], top_center=2.8, skey='rwc_c2')
        box(mb, -2.5, -0.25, 0.0, 1.4, 1.4, 0.45, 'stone', 'stone', bottom=True)
        box(mb, 0.0, 0.0, 4.55, 2.6, 1.35, 0.58, 'frieze', 'stone', bottom=True)
        return mb, [(0, 0, L, 1.4, 5.1, 0.0)]

    def build_ruin_crane_wreck(lod):
        """Уникальный сломанный стимпанк-кран/лебёдка на каменном контргрузе."""
        mb = MB()
        box(mb, 0, 0, 0.0, 2.4, 2.2, 0.95, 'stone', 'flag', bottom=True)
        cylinder(mb, 0.52, 0.52, 0.95, 1.55, 10, 'iron', stretch=False, top='flat', skey='rcw_drum')
        # Наклонённая сломанная деревянно-железная стрела крана
        old = mb.M
        mb.M = Matrix.Translation((0.7, 0.0, 1.45)) @ Matrix.Rotation(-0.62, 4, 'Y')
        box(mb, 1.6, 0.0, -0.18, 3.8, 0.42, 0.42, 'wood', 'iron', bottom=True)
        box(mb, 3.4, 0.0, -0.22, 0.45, 0.52, 0.52, 'brass', 'brass', bottom=True)
        mb.M = old
        if lod <= 1:
            tube(mb, [(0.8, 0.0, 1.35), (0.8, 0.0, 2.85)], 0.10, 6, 'brass', skey='rcw_st')
            chunk(mb, -1.2, 0.9, 0.35, 1.1, 0.7, 0.6, 0.5, 0.1, 'ruin')
        return mb, [(0, 0, 3.2, 2.6, 4.5, 0.0)]

    def build_ruin_boiler_wreck(lod):
        """Уникальный разорванный корпус полевого медного котла среди осколков кладки."""
        mb = MB()
        box(mb, 0, 0, 0.0, 3.8, 3.2, 0.42, 'ruin', 'flag', bottom=True)
        old = mb.M
        mb.M = Matrix.Translation((0.15, 0.0, 1.12)) @ Matrix.Rotation(0.28, 4, 'X') @ Matrix.Rotation(0.35, 4, 'Z')
        cylinder(mb, 0.98, 0.92, -1.25, 1.25, 12 if lod <= 1 else 8, 'copper', stretch=False, top='flat', skey='rbw_t')
        cylinder(mb, 1.03, 1.03, -0.55, -0.40, 10, 'brass', stretch=False, skey='rbw_b1')
        cylinder(mb, 1.03, 1.03, 0.40, 0.55, 10, 'brass', stretch=False, skey='rbw_b2')
        mb.M = old
        if lod <= 1:
            tube(mb, [(-0.5, -0.6, 0.35), (-0.8, -0.9, 2.35)], 0.14, 8, 'copper', skey='rbw_p1')
            tube(mb, [(0.8, 0.4, 0.35), (1.1, 0.6, 1.95)], 0.12, 8, 'brass', skey='rbw_p2')
            chunk(mb, -1.3, 0.9, 0.42, 1.3, 0.8, 0.55, 0.7, -0.18, 'ruin')
        return mb, [(0, 0, 3.8, 3.4, 2.8, 0.0)]

    def build_ruin_rubble_a(lod):
        """Уникальный развал тёсаных блоков и сломанного карниза (0 коллизии)."""
        mb = MB()
        blocks = [(-0.8, 0.3, 0.28, 1.5, 0.8, 0.52, 0.35, 0.08), (0.6, -0.4, 0.26, 1.3, 0.7, 0.48, -0.45, -0.1),
                  (0.0, 0.1, 0.64, 1.2, 0.7, 0.42, 1.1, 0.18), (-1.2, -0.5, 0.20, 0.9, 0.6, 0.4, -0.7, 0.05)]
        for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (blocks[:3] if lod == 2 else blocks):
            chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'stone')
        return mb, []

    def build_ruin_rubble_b(lod):
        """Уникальный развал закопчённой кладки с обрывком латунной трубы (0 коллизии)."""
        mb = MB()
        blocks = [(-0.5, -0.3, 0.25, 1.4, 0.75, 0.48, -0.25, 0.06), (0.8, 0.2, 0.30, 1.1, 0.8, 0.55, 0.85, -0.14),
                  (0.2, -0.6, 0.22, 1.0, 0.6, 0.42, 0.1, 0.12)]
        for (cx, cy, cz, sx, sy, sz, yaw, tilt) in (blocks[:2] if lod == 2 else blocks):
            chunk(mb, cx, cy, cz, sx, sy, sz, yaw, tilt, 'ruin')
        if lod <= 1:
            tube(mb, [(-0.2, 0.1, 0.18), (0.9, 0.5, 0.85)], 0.11, 8, 'brass', skey='rrb_p')
        return mb, []

    # ============================================================
    #  3. ПОЛНОРАЗМЕРНЫЕ ВЕРСТАКИ, КУЗНЯ, ГРУЗЫ И БОЕВЫЕ ОБОЗЫ (ВМЕСТО КУКОЛЬНЫХ ИГРУШЕК!)
    # ============================================================
    def build_heavy_workbench(lod):
        """Полноразмерный тяжёлый верстак мастера (2.85 м, дуб, чугун и латунный манометр)."""
        mb = MB()
        box(mb, 0, 0, 0.88, 2.85, 1.15, 0.14, 'wood', 'wood', bottom=True)
        box(mb, 0, 0, 0.24, 2.45, 0.90, 0.08, 'wood', 'wood', bottom=True)
        for sx in (-1.22, +1.22):
            for sy in (-0.44, +0.44):
                box(mb, sx, sy, 0.0, 0.18, 0.18, 0.88, 'iron', 'iron', bottom=True)
        box(mb, -0.95, -0.58, 0.78, 0.36, 0.24, 0.30, 'iron', 'iron', bottom=True)
        if lod <= 1:
            box(mb, +0.92, +0.34, 1.02, 0.52, 0.34, 0.32, 'copper', 'brass', bottom=True)
            tube(mb, [(+0.68, +0.34, 1.18), (+0.15, +0.34, 1.18), (+0.15, +0.34, 1.02)], 0.055, 6, 'brass', skey='hwb_p')
            decal(mb, (+0.92, +0.16, 1.18), (1, 0, 0), (0, 0, 1), 0.24, 0.24, 'gauge', (0, -1, 0))
            box(mb, -0.25, 0.0, 0.32, 0.85, 0.52, 0.42, 'iron', 'brass', bottom=True)
        return mb, [(0, 0, 2.85, 1.12, 1.10, 0.0)]

    def build_heavy_anvil(lod):
        """Массивная кузнечная наковальня на каменной подложке и окованном дубовом стуле (0 коллизии)."""
        mb = MB()
        box(mb, 0, 0, 0.0, 1.18, 0.88, 0.16, 'stone', 'flag', bottom=True)
        cylinder(mb, 0.38, 0.35, 0.16, 0.62, 10, 'wood', stretch=False, top='flat', cap_cell='dark', skey='ha_st')
        cylinder(mb, 0.39, 0.39, 0.28, 0.36, 10, 'iron', stretch=False, skey='ha_b1')
        box(mb, 0, 0, 0.62, 0.76, 0.36, 0.16, 'iron', 'iron', bottom=True)
        box(mb, -0.08, 0, 0.78, 0.96, 0.32, 0.24, 'iron', 'iron', bottom=True)
        if lod <= 1:
            box(mb, +0.52, 0, 0.84, 0.36, 0.18, 0.16, 'iron', 'iron', bottom=True)
            box(mb, -0.58, 0.48, 0.0, 0.52, 0.52, 0.48, 'wood', 'iron', top_cell='dark', bottom=True)
        return mb, []

    def build_steam_grinder(lod):
        """Полноразмерный приводной точильный станок на чугунной станине с медным краном (0 коллизии)."""
        mb = MB()
        seg = 12 if lod <= 1 else 8
        box(mb, 0, 0, 0.0, 1.48, 0.96, 0.16, 'stone', 'flag', bottom=True)
        box(mb, 0, 0, 0.16, 1.18, 0.72, 0.68, 'iron', 'iron', bottom=True)
        old = mb.M
        mb.M = Matrix.Translation((0.0, 0.0, 0.96)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        cylinder(mb, 0.44, 0.44, -0.14, +0.14, seg, 'ruin', stretch=False, top='flat', skey='sg_wh')
        cylinder(mb, 0.22, 0.22, -0.34, +0.34, 8, 'brass', stretch=False, top='flat', skey='sg_hub')
        mb.M = old
        if lod <= 1:
            tube(mb, [(-0.48, 0.24, 0.16), (-0.48, 0.24, 1.24), (-0.12, 0.24, 1.24)], 0.055, 6, 'copper', skey='sg_p')
            valve_wheel(mb, (-0.48, 0.10, 0.92), (0, -1, 0), 0.14, 'brass', skey='sg_vw')
        return mb, []

    def build_cargo_pallet(lod):
        """Тяжёлый армейский поддон с окованными ящиками, бочками 1.1 м и медным баллоном (0 коллизии)."""
        mb = MB()
        box(mb, 0, 0, 0.0, 2.25, 1.55, 0.16, 'wood', 'wood', bottom=True)
        box(mb, -0.45, -0.18, 0.16, 1.18, 0.82, 0.84, 'wood', 'wood', bottom=True)
        box(mb, -0.45, -0.18, 0.92, 1.24, 0.88, 0.10, 'iron', 'iron', bottom=True)
        cylinder(mb, 0.38, 0.36, 0.16, 1.18, 10 if lod <= 1 else 6, 'wood', stretch=False, top='flat', cap_cell='dark', skey='cp_b1')
        old = mb.M
        mb.M = Matrix.Translation((+0.62, -0.25, 0.16))
        cylinder(mb, 0.38, 0.36, 0.0, 1.12, 10 if lod <= 1 else 6, 'wood', stretch=False, top='flat', cap_cell='dark', skey='cp_b2')
        cylinder(mb, 0.40, 0.40, 0.24, 0.34, 8, 'iron', stretch=False, skey='cp_i1')
        cylinder(mb, 0.40, 0.40, 0.82, 0.92, 8, 'iron', stretch=False, skey='cp_i2')
        mb.M = Matrix.Translation((+0.55, +0.42, 0.16))
        cylinder(mb, 0.26, 0.26, 0.0, 1.15, 8, 'copper', stretch=False, top='flat', cap_cell='dark', skey='cp_keg')
        mb.M = old
        if lod == 0:
            box(mb, -0.55, +0.42, 0.16, 0.78, 0.56, 0.62, 'iron', 'brass', bottom=True)
        return mb, []

    def build_wreck_steam_wagon(lod):
        """Крупный разбитый бронеобоз снабжения с колёсами 1.2 м и развороченным котлом (вместо кукольных тележек!)."""
        mb = MB()
        seg = 12 if lod <= 1 else 8
        old = mb.M
        mb.M = Matrix.Translation((0.0, 0.0, 0.18)) @ Matrix.Rotation(0.11, 4, 'X') @ Matrix.Rotation(-0.07, 4, 'Y')
        box(mb, 0, 0, 0.48, 3.85, 1.85, 0.22, 'wood', 'wood', bottom=True)
        box(mb, 0, +0.86, 0.70, 3.70, 0.14, 0.95, 'wood', 'iron', bottom=True)
        box(mb, -1.78, 0, 0.70, 0.16, 1.80, 1.02, 'iron', 'iron', bottom=True)
        box(mb, +0.6, -0.84, 0.70, 2.20, 0.14, 0.76, 'wood', 'wood', bottom=True)
        for wx in (-1.30, +1.35):
            for wy in (-1.02, +1.02):
                mb.M = Matrix.Translation((wx, wy, 0.56)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
                cylinder(mb, 0.58, 0.58, -0.09, +0.09, seg, 'iron', stretch=False, top='flat', cap_cell='dark', skey='wsw_%s%s' % (wx, wy))
                cylinder(mb, 0.44, 0.44, -0.10, +0.10, seg, 'wood', stretch=False, top='flat', cap_cell='dark', skey='wsww_%s%s' % (wx, wy))
        mb.M = Matrix.Translation((+0.35, 0.10, 1.38)) @ Matrix.Rotation(0.32, 4, 'Y') @ Matrix.Rotation(0.22, 4, 'Z')
        cylinder(mb, 0.52, 0.52, -0.95, +0.95, 10, 'copper', stretch=False, top='flat', cap_cell='dark', skey='wsw_boil')
        cylinder(mb, 0.56, 0.56, -0.45, -0.32, 10, 'brass', stretch=False, skey='wsw_b1')
        mb.M = old
        if lod <= 1:
            box(mb, -0.95, -0.15, 0.72, 1.15, 0.95, 0.75, 'wood', 'iron', bottom=True)
            tube(mb, [(-1.85, -0.5, 0.52), (-2.75, -0.7, 0.18)], 0.08, 6, 'wood', skey='wsw_pole')
        return mb, [(0, 0, 3.9, 2.2, 2.1, 0.0)]

    def build_wreck_caisson(lod):
        """Опрокинутый тяжёлый зарядный ящик-артиллерийский передок на колёсах 1.2 м."""
        mb = MB()
        old = mb.M
        mb.M = Matrix.Translation((0.0, 0.0, 0.14)) @ Matrix.Rotation(-0.22, 4, 'X')
        box(mb, 0, 0, 0.48, 2.35, 1.55, 0.78, 'iron', 'wood', bottom=True)
        for sy in (-0.88, +0.88):
            mb.M = Matrix.Translation((0.0, sy, 0.58)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
            cylinder(mb, 0.62, 0.62, -0.09, +0.09, 10 if lod <= 1 else 6, 'iron', stretch=False, top='flat', cap_cell='dark', skey='wc_w%s' % sy)
        mb.M = old
        if lod <= 1:
            tube(mb, [(+1.1, 0.0, 0.45), (+2.55, +0.18, 0.12)], 0.09, 6, 'wood', skey='wc_t')
            tube(mb, [(-0.4, -0.3, 0.25), (-1.25, -0.85, 0.12)], 0.10, 6, 'brass', skey='wc_s')
        return mb, [(0, 0, 3.0, 1.9, 1.5, 0.0)]

    # ============================================================
    #  4. 10 НОВЫХ МАСШТАБНЫХ РАЗРУШЕНИЙ ДЛЯ ПЛОЩАДИ И ОКРЕСТНОСТЕЙ
    # ============================================================
    def build_plaza_breach(lod):
        """Низкий взрывной пролом на плацу: вздыбленные плиты и порванная медная магистраль (0 коллизии)."""
        mb = MB()
        rnd = random.Random(307)
        box(mb, 0, 0, 0.0, 2.9, 2.7, 0.06, 'ruin', 'ruin', bottom=False)
        ring = [(-1.15, -0.85, 0.15, 1.35, 0.95), (1.15, -0.95, 0.45, 1.25, 1.05),
                (1.25, 0.95, 1.05, 1.40, 0.90), (-1.05, 1.05, 1.75, 1.30, 1.00),
                (0.05, -1.25, 0.65, 1.15, 0.85), (-0.15, 1.25, 2.35, 1.20, 0.92)]
        for i, (cx, cy, yaw, sx, sy) in enumerate(ring if lod <= 1 else ring[:4]):
            chunk(mb, cx, cy, 0.11, sx, sy, 0.22, yaw, rnd.uniform(0.12, 0.24), 'flag' if i % 2 == 0 else 'ruin')
        if lod <= 1:
            tube(mb, [(-1.35, -0.15, 0.04), (-0.35, 0.0, 0.30), (0.30, 0.12, 0.62)], 0.14, 8, 'copper', skey='pb_cut')
            tube(mb, [(+1.30, 0.15, 0.04), (+0.45, -0.1, 0.38)], 0.11, 8, 'brass', skey='pb_cut2')
            flange(mb, (-0.35, 0.0, 0.30), (1, 0.1, 0.3), 0.22, 0.12, 8, 'iron', skey='pb_fl')
        return mb, []

    def build_ruin_smokestack(lod):
        """Уникальная разрушенная восьмигранная каменная дымовая труба завода с поваленным стволом."""
        mb = MB()
        box(mb, 0, 0, 0.0, 3.6, 3.6, 1.15, 'stone', 'flag', bottom=True)
        cylinder(mb, 1.42, 1.18, 1.15, 6.00, 8, 'ruin', stretch=True, top='jagged',
                 top_heights=[5.8, 5.5, 6.0, 5.2, 5.4, 4.9, 5.7, 5.1], top_center=5.0, skey='rss_st')
        if lod <= 1:
            old = mb.M
            mb.M = Matrix.Translation((2.15, 0.25, 0.96)) @ Matrix.Rotation(math.pi / 2 - 0.04, 4, 'Y') @ Matrix.Rotation(0.30, 4, 'Z')
            cylinder(mb, 0.88, 0.82, -1.35, +1.35, 8, 'stone', stretch=True, top='flat', cap_cell='dark', skey='rss_top')
            mb.M = old
            tube(mb, [(-1.55, 0.0, 0.6), (-1.55, 0.0, 4.2)], 0.16, 8, 'iron', skey='rss_pipe')
        return mb, [(0, 0, 3.6, 3.6, 6.6, 0.0)]

    def build_ruin_vault_arch(lod):
        """Массивный ребристый свод и каменный проезд Л2 (замена гладкого серого opt_ruin_vault)."""
        mb = MB()
        pier = 1.65
        cxL, cxR = -2.75, +2.75
        box(mb, cxL, 0, 0.0, pier, 3.4, 3.9, 'stone', 'flag', bottom=True)
        box(mb, cxR, 0, 0.0, pier, 3.4, 3.1, 'ruin', 'ruin', bottom=True)
        box(mb, cxL, 0, 3.9, pier + 0.25, 3.6, 0.32, 'frieze', 'stone', bottom=True)
        n = 9 if lod == 0 else 6
        for i in range(6 if lod == 0 else 4):
            a0 = math.pi - math.pi * i / n - 0.008
            a1 = math.pi - math.pi * (i + 1) / n + 0.008
            wedge_block(mb, a1, a0, 1.95, 2.95, 0.0, 3.1, 0.0, 4.24, strip='ruin')
        if lod <= 1:
            box(mb, cxL - 0.45, 0, 4.24, 0.85, 3.2, 1.65, 'stone', 'ruin', bottom=True)
            chunk(mb, +1.8, -1.5, 0.32, 1.5, 0.9, 0.55, 0.6, -0.14, 'ruin')
        return mb, [(cxL, 0, pier + 0.2, 3.5, 6.1, 0.0), (cxR, 0, pier + 0.2, 3.5, 3.3, 0.0)]

    def build_ruin_barracks_corner(lod):
        """Разбитый Г-образный остов каменной казармы/поста охраны с проёмами и обугленными балками."""
        mb = MB()
        rnd = random.Random(331)
        mb.M = Matrix.Translation((0.0, +2.4, 0.0))
        ruin_wall(mb, 7.6, 1.0, jagged_profile(7.6, 1.6, 5.1, 0.9, rnd, lambda t: 0.45 + 0.55 * (1 - t)), strip='stone')
        mb.M = Matrix.Translation((-3.3, -0.4, 0.0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
        ruin_wall(mb, 6.2, 1.0, jagged_profile(6.2, 1.4, 4.8, 0.9, rnd, lambda t: 1.0 - 0.6 * t), strip='ruin')
        mb.M = Matrix.Identity(4)
        box(mb, -0.8, 0.4, 0.0, 4.4, 3.8, 0.28, 'stone', 'flag', bottom=True)
        if lod <= 1:
            # Угловые стяжки крыши опёрты обоими концами строго в западную и северную каменные стены
            for off in (1.7, 2.8):
                mb.M = Matrix.Translation((-3.15 + off * 0.5, +2.25 - off * 0.5, 2.65)) @ Matrix.Rotation(math.pi / 4, 4, 'Z')
                box(mb, 0.0, 0.0, 0.0, off * 1.48, 0.24, 0.24, 'wood', 'iron', bottom=True)
            mb.M = Matrix.Identity(4)
            chunk(mb, +0.2, +0.1, 0.38, 1.9, 0.32, 0.24, 0.38, 0.04, 'wood')
            chunk(mb, +1.6, -1.1, 0.35, 1.5, 0.9, 0.6, -0.5, 0.14, 'ruin')
        return mb, [(0, 2.4, 7.6, 1.1, 5.1, 0.0), (-3.3, -0.4, 1.1, 6.2, 4.8, 0.0)]

    def build_ruin_aqueduct_pier(lod):
        """Одинокий высокий устой древнего каменного акведука с пятами обвалившихся арок."""
        mb = MB()
        box(mb, 0, 0, 0.0, 3.1, 3.1, 0.65, 'stone', 'flag', bottom=True)
        box(mb, 0, 0, 0.65, 2.45, 2.45, 4.6, 'ruin', 'stone', bottom=True)
        box(mb, 0, 0, 5.25, 2.75, 2.75, 0.36, 'frieze', 'stone', bottom=True)
        if lod <= 1:
            box(mb, 0, 0, 5.61, 2.55, 2.55, 0.35, 'stone', 'stone', bottom=True)
            for sx, k_cnt, a_start, step in ((-2.65, 3, 0.02, +0.28), (+2.65, 2, math.pi - 0.02, -0.28)):
                for i in range(k_cnt):
                    a0 = a_start + step * i
                    a1 = a0 + (0.25 if step > 0 else -0.25)
                    wedge_block(mb, min(a0, a1), max(a0, a1), 1.45, 2.25, -1.1, +1.1, sx, 5.61, strip='stone')
            tube(mb, [(0.0, -1.25, 4.2), (-2.1, -1.25, 3.85)], 0.12, 8, 'copper', skey='rap_p')
        return mb, [(0, 0, 3.0, 3.0, 7.4, 0.0)]

    def build_ruin_turbine_pit(lod):
        """Разбитый каменный колодец паровой турбины со свёрнутыми бронзовыми лопастями ротора."""
        mb = MB()
        seg = 10 if lod <= 1 else 8
        cylinder(mb, 2.5, 2.4, 0.0, 1.05, seg, 'stone', stretch=True, top='flat', cap_cell='dark', skey='rtp_ring')
        cylinder(mb, 1.85, 1.85, 0.95, 1.55, seg, 'ruin', stretch=False, top='jagged',
                 top_heights=[1.8, 1.3, 2.1, 1.4, 1.9, 1.2, 2.0, 1.5, 1.7, 1.3][:seg], top_center=1.2, skey='rtp_lip')
        old = mb.M
        mb.M = Matrix.Translation((0.0, 0.0, 1.18)) @ Matrix.Rotation(0.24, 4, 'X') @ Matrix.Rotation(0.18, 4, 'Y')
        cylinder(mb, 0.45, 0.45, -0.35, 1.05, 8, 'iron', stretch=False, top='flat', skey='rtp_hub')
        for i in range(6):
            mb.M = Matrix.Translation((0.0, 0.0, 1.18)) @ Matrix.Rotation(0.24, 4, 'X') @ Matrix.Rotation(i * math.pi / 3, 4, 'Z')
            box(mb, 0.95, 0.0, 0.12, 1.55, 0.36, 0.14, 'brass', 'bronze' if False else 'brass', bottom=True)
        mb.M = old
        return mb, [(0, 0, 4.6, 4.6, 2.3, 0.0)]

    def build_ruin_watchpost(lod):
        """Развороченный каменный бастионный дозорный пост с обломанными зубцами."""
        mb = MB()
        box(mb, 0, 0, 0.0, 4.5, 4.5, 3.4, 'stone', 'flag', bottom=True)
        box(mb, 0, 0, 3.4, 4.65, 4.65, 0.25, 'frieze', 'flag', bottom=True)
        merlons = [(-1.5, -1.7, 1.1), (+1.5, -1.7, 0.8), (-1.7, +1.5, 1.2), (+1.5, +1.5, 0.5)]
        for mx, my, mh in (merlons if lod <= 1 else merlons[:2]):
            box(mb, mx, my, 3.65, 1.15, 0.95, mh, 'ruin', 'ruin', bottom=True)
        if lod <= 1:
            box(mb, +1.1, +1.2, 3.65, 1.4, 1.4, 0.35, 'iron', 'dark' if False else 'iron', bottom=True)
            chunk(mb, -1.2, -2.5, 0.32, 1.3, 0.8, 0.55, 0.4, -0.1, 'ruin')
        return mb, [(0, 0, 4.5, 4.5, 4.8, 0.0)]

    def build_ruin_bastion_prow(lod):
        """Срезанный артиллерией клиновидный угол внешнего укрепления с косой стеной."""
        mb = MB()
        old = mb.M
        mb.M = Matrix.Rotation(0.45, 4, 'Z')
        box(mb, 0, 0, 0.0, 5.4, 2.4, 3.8, 'stone', 'ruin', bottom=True)
        mb.M = Matrix.Rotation(-0.45, 4, 'Z')
        box(mb, 0.4, -0.6, 0.0, 4.2, 2.2, 2.9, 'ruin', 'stone', bottom=True)
        mb.M = old
        if lod <= 1:
            tube(mb, [(-1.8, -1.2, 2.6), (+1.8, -1.2, 2.4)], 0.16, 8, 'copper', skey='rbp_p')
            chunk(mb, -0.5, -2.1, 0.35, 1.6, 0.95, 0.65, 0.7, 0.12, 'ruin')
        return mb, [(0, 0, 5.6, 3.6, 3.9, 0.0)]

    def build_ruin_pipe_tangle(lod):
        """Вырванный взрывом подземный узел медных труб из взломанного фундамента."""
        mb = MB()
        box(mb, 0, 0, 0.0, 4.2, 2.6, 0.72, 'ruin', 'flag', bottom=True)
        tube(mb, [(-1.4, -0.4, 0.2), (-0.8, -0.3, 2.25), (+0.4, -0.2, 2.45)], 0.24, 10, 'copper', skey='rpt_1')
        tube(mb, [(+1.5, +0.4, 0.2), (+1.0, +0.2, 1.85), (-0.2, +0.5, 1.55)], 0.18, 8, 'brass', skey='rpt_2')
        flange(mb, (-1.1, -0.35, 1.25), (0.3, 0, 1), 0.36, 0.22, 10, 'iron', skey='rpt_fl')
        if lod <= 1:
            chunk(mb, -1.8, +0.9, 0.3, 1.2, 0.85, 0.55, -0.6, 0.16, 'stone')
            chunk(mb, +1.7, -0.8, 0.28, 1.1, 0.75, 0.5, 0.8, -0.14, 'ruin')
        return mb, [(0, 0, 4.2, 2.6, 2.5, 0.0)]

    def build_ruin_archway_fallen(lod):
        """Рухнувший каменный архитрав-перемычка, опёртый обоими краями на барабан колонны и цокольный блок (0 коллизии)."""
        mb = MB()
        old = mb.M
        # Опорный закрытый барабан слева и тёсаный блок справа — перемычка лежит на обоих краях без висения!
        mb.M = Matrix.Translation((-1.15, 0.10, 0.44)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(0.35, 4, 'Z')
        cylinder(mb, 0.45, 0.43, -0.8, +0.8, 10 if lod <= 1 else 6, 'flutes', u_units=0.5, stretch=True, top='flat', bottom='flat', cap_cell='rough', skey='raf_d1')
        mb.M = old
        box(mb, +1.30, -0.10, 0.0, 1.35, 1.18, 0.54, 'ruin', 'stone', bottom=True)
        mb.M = Matrix.Translation((+1.85, +0.95, 0.43)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(-0.65, 4, 'Z')
        cylinder(mb, 0.44, 0.42, -0.65, +0.65, 10 if lod <= 1 else 6, 'flutes', u_units=0.5, stretch=True, top='flat', bottom='flat', cap_cell='rough', skey='raf_d2')
        mb.M = Matrix.Translation((0.05, 0.0, 0.72)) @ Matrix.Rotation(0.085, 4, 'Y') @ Matrix.Rotation(0.08, 4, 'Z')
        box(mb, 0, 0, -0.26, 4.1, 1.20, 0.66, 'frieze', 'stone', bottom=True)
        mb.M = old
        return mb, []

    def build_banner_hang(lod):
        """Двусторонний кованый консольный стяг на колонну (без висящей палки снизу и с герметичным торцом крепления)."""
        mb = MB()
        # Вертикальная крепёжная планка на X ∈ [-0.88 .. -0.72] (уходит на 14 см в ствол колонны)
        box(mb, -0.80, 0.0, 1.15, 0.16, 0.24, 1.22, 'iron', 'iron', bottom=True)
        # Верхняя консольная балка и латунный наконечник
        box(mb, +0.02, 0.0, 2.24, 1.72, 0.12, 0.14, 'iron', 'brass', bottom=True)
        box(mb, +0.84, 0.0, 2.19, 0.16, 0.16, 0.22, 'brass', 'brass', bottom=True)
        # Кованая косая распорка от планки к консоли
        if lod <= 1:
            old = mb.M
            mb.M = Matrix.Translation((-0.44, 0.0, 1.82)) @ Matrix.Rotation(-0.72, 4, 'Y')
            box(mb, 0.0, 0.0, -0.05, 1.05, 0.09, 0.10, 'iron', 'iron', bottom=True)
            mb.M = old
        # Двустороннее багровое полотнище с гербом Операторов (X ∈ [-0.26 .. +0.78], Z ∈ [0.0 .. 2.22])
        cx, w_ban, z_cut, z_top, z_tip = +0.26, 1.04, 0.42, 2.22, 0.0
        box(mb, cx, 0.0, z_cut, w_ban, 0.06, z_top - z_cut, 'iron', 'brass', bottom=True)
        decal(mb, (cx, -0.036, (z_cut + z_top) * 0.5), (1, 0, 0), (0, 0, 1), w_ban - 0.08, (z_top - z_cut) - 0.12, 'emblem', (0, -1, 0))
        decal(mb, (cx, +0.036, (z_cut + z_top) * 0.5), (-1, 0, 0), (0, 0, 1), w_ban - 0.08, (z_top - z_cut) - 0.12, 'emblem', (0, 1, 0))
        # Нижний клин-хвост полотнища (обе стороны + боковые скосы)
        xL, xR = cx - w_ban * 0.5, cx + w_ban * 0.5
        cu0, cv0 = cell_uv('emblem', 0.10, 0.10)
        cu1, cv1 = cell_uv('emblem', 0.90, 0.10)
        cuM = (cu0 + cu1) * 0.5
        cvM = cell_uv('emblem', 0.50, 0.02)[1]
        for yy, ny, rev in ((-0.030, (0, -1, 0), False), (+0.030, (0, 1, 0), True)):
            pts = [(cx, yy, z_tip), (xR, yy, z_cut), (xL, yy, z_cut)] if not rev else [(cx, yy, z_tip), (xL, yy, z_cut), (xR, yy, z_cut)]
            uvs = [(cuM, cvM), (cu1, cv0), (cu0, cv0)] if not rev else [(cuM, cvM), (cu0, cv0), (cu1, cv0)]
            mb.poly(pts, uvs, ny)
        gu0, gv0 = cell_uv('emblem', 0.02, 0.05)
        gu1, gv1 = cell_uv('emblem', 0.06, 0.25)
        guv = [(gu0, gv0), (gu1, gv0), (gu1, gv1), (gu0, gv1)]
        mb.poly([(cx, -0.030, z_tip), (cx, +0.030, z_tip), (xL, +0.030, z_cut), (xL, -0.030, z_cut)], guv, (-1, 0, -1))
        mb.poly([(xR, -0.030, z_cut), (xR, +0.030, z_cut), (cx, +0.030, z_tip), (cx, -0.030, z_tip)], guv, (1, 0, -1))
        if lod <= 1:
            box(mb, cx, 0.0, z_top - 0.04, w_ban + 0.08, 0.09, 0.09, 'brass', 'brass', bottom=True)
            box(mb, cx, 0.0, z_cut - 0.03, w_ban + 0.06, 0.08, 0.07, 'brass', 'brass', bottom=True)
        return mb, []

    pieces_list.extend([
        ('opt_banner_hang', build_banner_hang, {'drawDist': 320, 'lodDist': [95, 160], 'shadow': False}),
        ('opt_steam_boiler_tower', build_steam_boiler_tower, {'drawDist': 420, 'lodDist': [90, 190]}),
        ('opt_steam_dynamo', build_steam_dynamo, {'drawDist': 360, 'lodDist': [80, 170]}),
        ('opt_steam_cistern', build_steam_cistern, {'drawDist': 400, 'lodDist': [85, 180]}),
        ('opt_forge_hearth', build_forge_hearth, {'drawDist': 340, 'lodDist': [75, 160]}),
        ('opt_steam_brazier', build_steam_brazier, {'drawDist': 220, 'lodDist': [55, 120], 'shadow': False}),
        ('opt_copper_tanks', build_copper_tanks, {'drawDist': 220, 'lodDist': [55, 120], 'shadow': False}),
        ('opt_pipe_bridge_east', build_pipe_bridge_east, {'drawDist': 420, 'lodDist': [95, 185]}),
        ('opt_pipe_wall_manifold', build_pipe_wall_manifold, {'drawDist': 340, 'lodDist': [80, 165]}),
        ('opt_pipe_ground_riser', build_pipe_ground_riser, {'drawDist': 380, 'lodDist': [90, 175]}),
        ('opt_pipe_arch_ground', build_pipe_arch_ground, {'drawDist': 420, 'lodDist': [95, 185]}),
        ('opt_ruin_gate_pylon', build_ruin_gate_pylon, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_ruin_viaduct_east', build_ruin_viaduct_east, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_ruin_foundry_shell', build_ruin_foundry_shell, {'drawDist': 480, 'lodDist': [70, 170]}),
        ('opt_ruin_wall_breach', build_ruin_wall_breach, {'drawDist': 480, 'lodDist': [65, 160]}),
        ('opt_ruin_wall_buttress', build_ruin_wall_buttress, {'drawDist': 460, 'lodDist': [60, 150]}),
        ('opt_ruin_wall_colonnade', build_ruin_wall_colonnade, {'drawDist': 480, 'lodDist': [65, 160]}),
        ('opt_ruin_crane_wreck', build_ruin_crane_wreck, {'drawDist': 420, 'lodDist': [65, 150]}),
        ('opt_ruin_boiler_wreck', build_ruin_boiler_wreck, {'drawDist': 380, 'lodDist': [60, 145]}),
        ('opt_ruin_rubble_a', build_ruin_rubble_a, {'drawDist': 240, 'lodDist': [45, 105], 'shadow': False}),
        ('opt_ruin_rubble_b', build_ruin_rubble_b, {'drawDist': 240, 'lodDist': [45, 105], 'shadow': False}),
        ('opt_heavy_workbench', build_heavy_workbench, {'drawDist': 240, 'lodDist': [80, 150]}),
        ('opt_heavy_anvil', build_heavy_anvil, {'drawDist': 220, 'lodDist': [75, 130], 'shadow': False}),
        ('opt_steam_grinder', build_steam_grinder, {'drawDist': 220, 'lodDist': [75, 130], 'shadow': False}),
        ('opt_cargo_pallet', build_cargo_pallet, {'drawDist': 240, 'lodDist': [75, 130], 'shadow': False}),
        ('opt_wreck_steam_wagon', build_wreck_steam_wagon, {'drawDist': 360, 'lodDist': [80, 165]}),
        ('opt_wreck_caisson', build_wreck_caisson, {'drawDist': 340, 'lodDist': [75, 155]}),
        ('opt_plaza_breach', build_plaza_breach, {'drawDist': 320, 'lodDist': [65, 140], 'shadow': False}),
        ('opt_ruin_smokestack', build_ruin_smokestack, {'drawDist': 520, 'lodDist': [80, 185]}),
        ('opt_ruin_vault_arch', build_ruin_vault_arch, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_ruin_barracks_corner', build_ruin_barracks_corner, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_ruin_aqueduct_pier', build_ruin_aqueduct_pier, {'drawDist': 520, 'lodDist': [75, 180]}),
        ('opt_ruin_turbine_pit', build_ruin_turbine_pit, {'drawDist': 440, 'lodDist': [70, 160]}),
        ('opt_ruin_watchpost', build_ruin_watchpost, {'drawDist': 480, 'lodDist': [75, 175]}),
        ('opt_ruin_bastion_prow', build_ruin_bastion_prow, {'drawDist': 480, 'lodDist': [75, 175]}),
        ('opt_ruin_pipe_tangle', build_ruin_pipe_tangle, {'drawDist': 420, 'lodDist': [65, 155]}),
        ('opt_ruin_archway_fallen', build_ruin_archway_fallen, {'drawDist': 340, 'lodDist': [60, 135], 'shadow': False}),
    ])
