# ============================================================
#  SCRIPTS / MARKET-SQUARE / PAINT_MARKET.PY
#  Кисть террейна для рыночной площади (по разрешению автора, только внутри контура зоны):
#   - брусчатка (слой 0) — кривое кольцо и выходы из market-roads.json, площадка у фонтана;
#     кромки мягкие и рваные, камень местами стёрт до земли;
#   - утоптанная земля (слой 2 лесная подстилка + слой 3 песок) внутри кольца, тёмные тропы к фонтану;
#   - трава (слой 1) за кольцом и редкими пятнами внутри.
#  Карта покраски — 1024², ~3.6 м на пиксель: кромки получаются естественно размытыми.
#  Каждая точка считается по 4×4 подвыборкам; к краю зоны покраска плавно сходит на нет,
#  за контуром ничего не меняется. Тайлинг слоёв — как у кисти автора (трава 435, земля 523,
#  песок 430), брусчатка мельче (1100), чтобы камни были в рост человека, а не плиты.
#
#  Пишет client/data/terrain-paint-{1,2}.png и shared/terrain-paint-{1,2}.png (как редактор),
#  перед первой записью кладёт копии в data/terrain-backups/*.pre-market.png.
#  Запуск: python scripts/market-square/paint_market.py [--preview out.png]
# ============================================================
import json
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ROADS = json.load(open(os.path.join(HERE, 'market-roads.json'), encoding='utf-8'))
MIN_X, MAX_X = -1892.6082763671875, 1838.1767578125
MIN_Z, MAX_Z = -1918.204345703125, 1827.108642578125
W, H = MAX_X - MIN_X, MAX_Z - MIN_Z
FILES = [os.path.join(ROOT, d, 'terrain-paint-%d.png' % k) for k in (1, 2) for d in ('client/data', 'shared')]
TILE = {0: 1100.0, 1: 434.7, 2: 523.3, 3: 430.0}
TB = {k: int(round((v - 10.0) / 1190.0 * 255.0)) for k, v in TILE.items()}


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class VNoise:
    """Шум значений на сетке шага L (м), билинейно, детерминированный."""

    def __init__(self, L, seed):
        self.L = L
        self.g = np.random.default_rng(seed).uniform(0, 1, size=(512, 512))

    def __call__(self, x, z):
        fx = (x - MIN_X) / self.L
        fz = (z - MIN_Z) / self.L
        i0 = np.floor(fx).astype(int)
        j0 = np.floor(fz).astype(int)
        tx = fx - i0
        tz = fz - j0
        tx = tx * tx * (3 - 2 * tx)
        tz = tz * tz * (3 - 2 * tz)
        g = self.g
        a = g[j0 % 512, i0 % 512] * (1 - tx) + g[j0 % 512, (i0 + 1) % 512] * tx
        b = g[(j0 + 1) % 512, i0 % 512] * (1 - tx) + g[(j0 + 1) % 512, (i0 + 1) % 512] * tx
        return a * (1 - tz) + b * tz


def fbm(x, z, base, seed):
    return 0.55 * VNoise(base, seed)(x, z) + 0.3 * VNoise(base / 2.3, seed + 1)(x, z) + 0.15 * VNoise(base / 5.1, seed + 2)(x, z)


def road_edge(road, x, z):
    """Расстояние до кромки полилинии с переменной шириной (<0 — на дороге)."""
    pts = np.array(road['pts'], dtype=np.float64)
    ws = np.array(road['w'], dtype=np.float64)
    best = np.full(x.shape, 1e9)
    for i in range(len(pts) - 1):
        ax, az = pts[i]
        bx, bz = pts[i + 1]
        vx, vz = bx - ax, bz - az
        L2 = vx * vx + vz * vz or 1.0
        t = np.clip(((x - ax) * vx + (z - az) * vz) / L2, 0, 1)
        d = np.hypot(x - (ax + vx * t), z - (az + vz * t))
        w = ws[i] + (ws[i + 1] - ws[i]) * t
        best = np.minimum(best, d - w / 2)
    return best


def in_poly(poly, x, z):
    c = np.zeros(x.shape, bool)
    n = len(poly)
    for i in range(n):
        xi, zi = poly[i]
        xj, zj = poly[i - 1]
        cond = ((zi > z) != (zj > z)) & (x < (xj - xi) * (z - zi) / ((zj - zi) or 1e-9) + xi)
        c ^= cond
    return c


def edge_dist(poly, x, z):
    best = np.full(x.shape, 1e9)
    for i in range(len(poly)):
        ax, az = poly[i - 1]
        bx, bz = poly[i]
        vx, vz = bx - ax, bz - az
        t = np.clip(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1)
        best = np.minimum(best, np.hypot(x - (ax + vx * t), z - (az + vz * t)))
    return best


def weights(x, z):
    C = ROADS['C']
    zone = ROADS['zone']
    r = np.hypot(x - C['x'], z - C['z'])
    inside = in_poly(zone, x, z)
    fz = np.where(inside, smooth(0.0, 14.0, edge_dist(zone, x, z)), 0.0)
    n1 = fbm(x, z, 14.0, 11)
    n2 = fbm(x, z, 9.0, 21)
    n3 = fbm(x, z, 11.0, 31)
    nh = VNoise(3.5, 41)(x, z)
    nw = fbm(x, z, 6.0, 51)
    # брусчатка: дороги с рваной кромкой и площадка у фонтана
    e = np.full(x.shape, 1e9)
    for rd in ROADS['roads']:
        e = np.minimum(e, road_edge(rd, x, z))
    e = e + (nw - 0.5) * 2.4
    cob = 1.0 - smooth(-1.2, 1.4, e)
    ef = r - (ROADS['fountainPatch'] + (nw - 0.5) * 2.6)
    cob = np.maximum(cob, (1.0 - smooth(-1.0, 1.2, ef)) * 0.9)
    cob = cob * (0.86 + 0.14 * n3)
    cob = np.where(nh > 0.82, cob * 0.55, cob)         # камень местами стёрт до земли
    # тропы к фонтану
    et = np.full(x.shape, 1e9)
    for tr in ROADS['tracks']:
        et = np.minimum(et, road_edge(tr, x, z))
    track = (1.0 - smooth(-0.8, 1.8, et + (nw - 0.5) * 1.5)) * 0.8
    # где кончается площадь: внешняя кромка кольца
    ring = [rd for rd in ROADS['roads'] if rd['kind'] == 'ring'][0]
    ang = np.arctan2(z - C['z'], x - C['x'])
    rp = np.array(ring['pts'])
    ring_r = np.hypot(rp[:, 0] - C['x'], rp[:, 1] - C['z'])
    ring_w = np.array(ring['w'])
    k = ((ang % (2 * np.pi)) / (2 * np.pi) * (len(rp) - 1)).astype(int)
    outer = ring_r[k] + ring_w[k] / 2
    grass = smooth(outer + 0.5, outer + 7.0, r + (n1 - 0.5) * 6.0) * (0.15 + 0.85 * smooth(0.38, 0.62, n2))   # пятнами, с проплешинами земли
    grass = np.maximum(grass, np.where((n3 > 0.74) & (r > 11), 0.45 * smooth(0.74, 0.86, n3), 0.0))   # редкие пятна внутри
    # утоптанная земля: песок и лесная подстилка вперемешку, тропы темнее
    forest = 0.55 + 0.35 * n2 + track
    sand = 0.3 + 0.3 * (1 - n1)
    w0 = cob
    rem = 1.0 - w0
    w1 = grass * rem
    rem2 = rem - w1
    share = forest / (forest + sand)
    w2 = rem2 * share
    w3 = rem2 * (1 - share)
    return np.stack([w0, w1, w2, w3], -1), fz


def main():
    N = 1024
    zone = np.array(ROADS['zone'])
    xs = (zone[:, 0] - MIN_X) / W * (N - 1)
    ys = (1 - (zone[:, 1] - MIN_Z) / H) * (N - 1)
    px0, px1 = int(math.floor(xs.min())) - 1, int(math.ceil(xs.max())) + 2
    py0, py1 = int(math.floor(ys.min())) - 1, int(math.ceil(ys.max())) + 2
    PY, PX = np.mgrid[py0:py1, px0:px1].astype(np.float64)
    acc = np.zeros(PX.shape + (4,))
    accf = np.zeros(PX.shape)
    SS = 4
    for sy in range(SS):
        for sx in range(SS):
            ox = (sx + 0.5) / SS - 0.5
            oy = (sy + 0.5) / SS - 0.5
            x = MIN_X + (PX + ox) / (N - 1) * W
            z = MIN_Z + (1 - (PY + oy) / (N - 1)) * H
            w, f = weights(x, z)
            acc += w
            accf += f
    acc /= SS * SS
    accf /= SS * SS

    bdir = os.path.join(ROOT, 'data', 'terrain-backups')
    os.makedirs(bdir, exist_ok=True)
    for k in (1, 2):
        src = os.path.join(ROOT, 'shared', 'terrain-paint-%d.png' % k)
        dst = os.path.join(bdir, 'terrain-paint-%d.pre-market.png' % k)
        if not os.path.exists(dst):
            shutil.copyfile(src, dst)
    p1 = np.asarray(Image.open(os.path.join(ROOT, 'shared', 'terrain-paint-1.png')).convert('RGBA')).astype(np.float64)
    p2 = np.asarray(Image.open(os.path.join(ROOT, 'shared', 'terrain-paint-2.png')).convert('RGBA')).copy()
    sub = p1[py0:py1, px0:px1] / 255.0
    f = accf[..., None]
    new = sub * (1 - f) + acc * f
    p1[py0:py1, px0:px1] = np.clip(new * 255.0 + 0.5, 0, 255)
    s2 = p2[py0:py1, px0:px1]
    for ch in range(4):
        m = (accf > 0.001) & (acc[..., ch] * accf > 0.002)
        s2[..., ch][m] = TB[ch]
    p2[py0:py1, px0:px1] = s2
    out1 = Image.fromarray(p1.astype(np.uint8), 'RGBA')
    out2 = Image.fromarray(p2.astype(np.uint8), 'RGBA')
    for d in ('client/data', 'shared'):
        out1.save(os.path.join(ROOT, d, 'terrain-paint-1.png'), optimize=True)
        out2.save(os.path.join(ROOT, d, 'terrain-paint-2.png'), optimize=True)
    tot = (acc * f).sum(-1)
    print('[paint] область %d×%d пикс. (≈%.0f×%.0f м), закрашено %d пикс.; брусчатка %.0f, трава %.0f, земля %.0f, песок %.0f пикс.-экв.' % (
        px1 - px0, py1 - py0, (px1 - px0) * W / N, (py1 - py0) * H / N, int((tot > 0.05).sum()),
        (acc[..., 0] * accf).sum(), (acc[..., 1] * accf).sum(), (acc[..., 2] * accf).sum(), (acc[..., 3] * accf).sum()))
    print('[paint] → client/data/terrain-paint-{1,2}.png и shared/terrain-paint-{1,2}.png; бэкап: data/terrain-backups/*.pre-market.png')
    if '--preview' in sys.argv:
        cols = np.array([[150, 150, 150], [80, 150, 60], [95, 70, 45], [200, 170, 110]], dtype=np.float64)
        img = (acc[..., :, None] * cols[None, None]).sum(2) * f + np.array([60, 60, 60]) * (1 - f)
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize(((px1 - px0) * 8, (py1 - py0) * 8), Image.NEAREST).save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
