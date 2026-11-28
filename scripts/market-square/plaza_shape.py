# ============================================================
#  SCRIPTS / MARKET-SQUARE / PLAZA_SHAPE.PY
#  Форма каменной площади рынка (общая для build_market.py и paint_market.py):
#   - внешний край — внешняя кромка кольцевой улицы + рваный край (±0.5 м);
#   - кольцевая улица (брусчатка) — от внутренней кромки кольца до внешнего края;
#   - внутри кольца — крупные плиты, у фонтана — круг брусчатки.
#  Кольцо берётся из market-roads.json (его пишет layout_market.js): 161 точка через равный угол.
# ============================================================
import numpy as np


class Plaza:
    def __init__(self, roads):
        self.C = (roads['C']['x'], roads['C']['z'])
        ring = [r for r in roads['roads'] if r['kind'] == 'ring'][0]
        pts = np.asarray(ring['pts'], np.float64)
        w = np.asarray(ring['w'], np.float64)
        self.r = np.hypot(pts[:, 0] - self.C[0], pts[:, 1] - self.C[1])
        self.w = w
        self.n = len(pts) - 1
        self.fountain = float(roads.get('fountainPatch', 8.6))
        self.r0 = [float(pts[0][0]), float(pts[0][1])]

    def _ring(self, a):
        t = (np.mod(a, 2 * np.pi) / (2 * np.pi)) * self.n
        i = np.clip(np.floor(t).astype(int), 0, self.n - 1)
        f = t - i
        r = self.r[i] * (1 - f) + self.r[i + 1] * f
        w = self.w[i] * (1 - f) + self.w[i + 1] * f
        return r, w

    def outer(self, a):
        """Внешний край площади (м от центра) по углу a = atan2(z−Cz, x−Cx)."""
        r, w = self._ring(a)
        return r + w / 2 + 0.3 + 0.3 * np.sin(13 * a + 1.3) + 0.18 * np.sin(31 * a + 4.1) + 0.1 * np.sin(71 * a + 2.2)

    def inner(self, a):
        """Граница плит и кольцевой брусчатки."""
        r, w = self._ring(a)
        return r - w / 2 + 0.12 * np.sin(17 * a + 0.7) + 0.08 * np.sin(43 * a + 5.0)

    def fountain_r(self, a):
        return self.fountain + 0.2 * np.sin(7 * a + 2.0) + 0.1 * np.sin(19 * a + 1.1)

    def polar(self, x, z):
        dx = np.asarray(x) - self.C[0]
        dz = np.asarray(z) - self.C[1]
        return np.hypot(dx, dz), np.arctan2(dz, dx)

    def edge_dist(self, x, z):
        """>0 — снаружи площади (м до края по радиусу), <0 — на камне."""
        r, a = self.polar(x, z)
        return r - self.outer(a)

    def field_outer(self, x, z):
        r, a = self.polar(x, z)
        return r - self.outer(a)

    def field_inner(self, x, z):
        r, a = self.polar(x, z)
        return r - self.inner(a)

    def field_fountain(self, x, z):
        r, a = self.polar(x, z)
        return r - self.fountain_r(a)

    def bbox(self):
        R = float((self.r + self.w / 2).max()) + 1.0
        return self.C[0] - R, self.C[0] + R, self.C[1] - R, self.C[1] + R


class ParkPaving:
    """Дорожки парка (market-roads.json → parkPaving): каменный круг у фонтана и дорожки-лучи.
    Край чуть гуляет (±0.25 м у круга, ±0.12 м у дорожек)."""

    def __init__(self, pk):
        self.c = (float(pk['c'][0]), float(pk['c'][1]))
        self.R = float(pk['r'])
        self.paths = [(np.asarray(p['pts'], np.float64), float(p['w'])) for p in pk['paths']]

    def field_circle(self, x, z):
        dx, dz = np.asarray(x) - self.c[0], np.asarray(z) - self.c[1]
        a = np.arctan2(dz, dx)
        return np.hypot(dx, dz) - (self.R + 0.25 * np.sin(9 * a + 0.6) + 0.12 * np.sin(23 * a + 2.1))

    def field_paths(self, x, z):
        x = np.asarray(x, np.float64)
        z = np.asarray(z, np.float64)
        best = np.full(x.shape, 1e9)
        wob = 0.12 * np.sin(0.8 * x + 1.7) * np.sin(0.6 * z + 0.4)
        for pts, w in self.paths:
            for i in range(len(pts) - 1):
                ax, az = pts[i]
                bx, bz = pts[i + 1]
                vx, vz = bx - ax, bz - az
                L2 = vx * vx + vz * vz or 1.0
                t = np.clip(((x - ax) * vx + (z - az) * vz) / L2, 0, 1)
                best = np.minimum(best, np.hypot(x - (ax + vx * t), z - (az + vz * t)) - w / 2)
        return best - wob

    def field(self, x, z):
        return np.minimum(self.field_circle(x, z), self.field_paths(x, z))

    def bbox(self):
        xs = [self.c[0] - self.R - 1, self.c[0] + self.R + 1]
        zs = [self.c[1] - self.R - 1, self.c[1] + self.R + 1]
        for pts, w in self.paths:
            xs += [float(pts[:, 0].min()) - w, float(pts[:, 0].max()) + w]
            zs += [float(pts[:, 1].min()) - w, float(pts[:, 1].max()) + w]
        return min(xs), max(xs), min(zs), max(zs)


def clip_poly(poly, f):
    """Отсечь многоугольник [(x, z), ...] по f(точка) < 0 (линейная интерполяция по рёбрам)."""
    out = []
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        fa, fb = f(a), f(b)
        if fa < 0:
            out.append(a)
        if (fa < 0) != (fb < 0):
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def poly_area(p):
    s = 0.0
    for i in range(len(p)):
        x0, z0 = p[i]
        x1, z1 = p[(i + 1) % len(p)]
        s += x0 * z1 - x1 * z0
    return abs(s) / 2

