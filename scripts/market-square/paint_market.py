# ============================================================
#  SCRIPTS / MARKET-SQUARE / PAINT_MARKET.PY
#  Кисть террейна для района рынка (по разрешению автора, только внутри контура района):
#   - брусчатка (слой 0) — улицы рынка из market-roads.json и площадь монумента;
#     кромка чёткая (полоса перехода ~2 м), чтобы камень не расползался под дома;
#   - каменная площадь внутри кольца — модель mkt_plaza_stone, под ней не красим; вокруг неё —
#     узкий пыльный ореол (подстилка + песок), чтобы камень не лежал наклейкой;
#   - ровная утоптанная земля (слой 2 подстилка, немного песка и травы) по всему району, без дыр:
#     в грунте террейна светлые прожилки, шейдер рисует на них каменную деталь, и сверху они
#     читаются как лишние дороги поперёк рынка — заливка их гасит;
#   - пятна травы (слой 1) в садах, далеко от улиц; газон парка (дорожки парка — модель mkt_park_paving).
#  К краю района заливка мягко сходит на нет в полосе ~12 м; улицы доходят до дорог автора.
#
#  ВАЖНО: игра кладёт карту покраски по UV-развёртке меша террейна, а не по мировой сетке
#  (terrain_uv.py) — каждый пиксель карты переводится в мир через треугольники меша.
#  Карта 1024², ~3.6 м на пиксель; каждый пиксель — 4×4 подвыборки.
#
#  Тайлинг слоёв — как у кисти автора (трава 435, земля 523, песок 430, брусчатка 285): стыков с его дорогами не видно.
#  Дороги автора не затираются: покраска рынка только дополняет незакрашенное.
#  В прямоугольнике рынка рисуется поверх карты до рынка (бэкап data/terrain-backups/*.pre-market.png),
#  поэтому запуск можно повторять; прямоугольник прошлого запуска — paint-rect.json.
#
#  Запуск:
#    python scripts/market-square/paint_market.py                 покраска (+ visible-cobble.json для раскладки)
#    python scripts/market-square/paint_market.py --mask          маска дорог автора → village-roads-mask.json
#    python scripts/market-square/paint_market.py --check f.json  самопроверка: объекты (из layout_market.js) не на брусчатке
#    python scripts/market-square/paint_market.py --map out.png [plan.json]   план сверху: видимая покраска, площадь, объекты
# ============================================================
import json
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
import terrain_uv as tuv  # noqa: E402
from plaza_shape import Plaza  # noqa: E402

_TUV = []


def TUV():
    if not _TUV:
        _TUV.append(tuv.TerrainUV())
    return _TUV[0]


N = tuv.N
MASK_BOX = (-90.0, 240.0, -270.0, 90.0)        # весь район рынка с запасом (x0, x1, z0, z1)
ROADS_PATH = os.path.join(HERE, 'market-roads.json')
ROADS = json.load(open(ROADS_PATH, encoding='utf-8')) if os.path.exists(ROADS_PATH) else None
MIN_X, MIN_Z = -1892.6082763671875, -1918.204345703125
TILE = {0: 285.0, 1: 434.7, 2: 523.3, 3: 430.0}   # брусчатка — как у дорог автора по деревне
TB = {k: int(round((v - 10.0) / 1190.0 * 255.0)) for k, v in TILE.items()}
BACKUP = os.path.join(ROOT, 'data', 'terrain-backups')
RECT_PATH = os.path.join(HERE, 'paint-rect.json')
# покраска рынка до перехода на UV меша (лежала на 45 м южнее) — восстанавливается из бэкапа
LEGACY_RECT = (505, 577, 486, 548)                 # столбцы px0..px1, строки py0..py1
VIS_MAX = 0.16                                     # самопроверка: видимая брусчатка под объектом не больше этого (центр улицы ≈0.9)


smooth = tuv.smooth


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
    """Веса слоёв (0..1, уже с силой) и маска района. Сумма < 0.6: шейдер террейна смешивает покраску
    с родным грунтом (blendFactor = smoothstep(0.01, 0.6, сумма)), поэтому улицы как у автора, а не ярче."""
    zone = ROADS['zone']
    plaza = Plaza(ROADS)
    inside = in_poly(zone, x, z)
    ne = fbm(x, z, 18.0, 61)
    # край района: заливка сходит на нет в полосе ~12 м внутри контура, граница гуляет на ±3 м
    fz = np.where(inside, smooth(0.0, 12.0, edge_dist(zone, x, z) + (ne - 0.5) * 6.0), 0.0)
    n1 = fbm(x, z, 16.0, 11)
    n2 = fbm(x, z, 14.0, 21)
    n3 = fbm(x, z, 11.0, 31)
    nw = fbm(x, z, 7.0, 51)
    pe = plaza.edge_dist(x, z)                        # >0 — снаружи каменной площади
    # улицы: чёткая кромка (переход ~2 м), кромка чуть гуляет; под камнем площади не красим
    e = np.full(x.shape, 1e9)
    for rd in ROADS['roads']:
        if rd['kind'] != 'ring':
            e = np.minimum(e, road_edge(rd, x, z))
    e = e + (nw - 0.5) * 1.2
    cob = 1.0 - smooth(-1.0, 0.8, e)
    for q in ROADS.get('squares', []):
        eq = np.hypot(x - q['x'], z - q['z']) - (q['r'] + (nw - 0.5) * 1.0)
        cob = np.maximum(cob, (1.0 - smooth(-1.0, 0.8, eq)) * 0.95)
    cob = cob * (0.88 + 0.12 * n3) * smooth(-1.5, -0.3, pe)
    # пыльный ореол вокруг камня площади: узкий (~4 м), чтобы камень не лежал наклейкой
    halo = (1.0 - smooth(0.0, 4.0, pe + (nw - 0.5) * 1.5)) * smooth(-1.5, -0.3, pe)
    # ровная утоптанная земля по всему району: в грунте террейна есть светлые прожилки, шейдер рисует
    # на них каменную деталь — сверху они читаются как лишние дороги. Сплошная подстилка их гасит;
    # дыр от шума нет (просветы тоже выглядят дорогами), сила лишь слегка дышит.
    fill = 0.5 * (0.93 + 0.07 * n3)
    out_t = smooth(4.0, 16.0, pe + (n1 - 0.5) * 8.0)
    grass = out_t * smooth(0.5, 0.68, n2) * smooth(3.0, 7.0, e)       # пятна травы в садах, не у улиц
    sand = 0.12 + 0.3 * halo
    gshare = 0.08 + 0.5 * grass
    if ROADS.get('park'):
        # газон парка: трава почти сплошняком, край мягкий (±1.5 м)
        pin = in_poly(ROADS['park'], x, z)
        pd = edge_dist(ROADS['park'], x, z)
        pd = np.where(pin, pd, -pd)
        gshare = np.maximum(gshare, 0.82 * smooth(-3.0, 5.0, pd + (n1 - 0.5) * 3.0))
    a0 = cob * 0.55                       # улицы плотные: на сетке 3.6 м 8-метровая улица иначе бледнеет
    rest = np.clip(fill - a0, 0.0, None)
    a1 = rest * gshare
    a3 = rest * sand * (1.0 - gshare)
    a2 = rest - a1 - a3
    w = np.stack([a0, a1, a2, a3], -1) * smooth(-1.5, -0.3, pe)[..., None]
    # улицы не гаснут у края района: доходят до дорог автора (их концы заходят в его брусчатку);
    # дорога к мастеру телепорта заходит в его зону на ~20 м и там сходит на нет
    out_d = np.where(inside, 0.0, edge_dist(zone, x, z))
    for rd in ROADS['roads']:
        if rd['kind'] == 'ring':
            continue
        et = road_edge(rd, x, z) + (nw - 0.5) * 1.2
        st = 1.0 - smooth(-1.0, 0.8, et)
        if rd['kind'] == 'tp':
            st = st * (1.0 - smooth(12.0, 24.0, out_d))
        fz = np.maximum(fz, st)
    return np.nan_to_num(w), np.nan_to_num(fz)


def load_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def write_mask():
    """Маска брусчатки автора (карта до рынка, слой 0 ≥ 20 из 255 — с мягкими краями) в клетках 1 м
    над районом рынка. Карта читается так, как её кладёт игра: по UV меша террейна."""
    base = load_rgba(os.path.join(BACKUP, 'terrain-paint-1.pre-market.png')).astype(np.float64)
    x0, x1, z0, z1 = MASK_BOX
    cell = 1.0
    nx, nz = int((x1 - x0) / cell), int((z1 - z0) / cell)
    xs = x0 + (np.arange(nx) + 0.5) * cell
    zs = z0 + (np.arange(nz) + 0.5) * cell
    U, V = TUV().world_grid_uv(xs, zs)
    v = tuv.sample(base[..., 0], U, V)
    road = (v >= 20) & np.isfinite(U)
    rows = [''.join('1' if b else '0' for b in row) for row in road]
    with open(os.path.join(HERE, 'village-roads-mask.json'), 'w', encoding='utf-8') as fh:
        json.dump({'x0': x0, 'z0': z0, 'cell': cell, 'nx': nx, 'nz': nz,
                   'source': 'terrain-paint-1 (до рынка) R>=20, по UV меша террейна', 'rows': rows}, fh)
    print('[paint] маска дорог автора: %d×%d клеток по %.0f м, дорога %d клеток → scripts/market-square/village-roads-mask.json' % (nx, nz, cell, int(road.sum())))


VIS_PATH = os.path.join(HERE, 'visible-cobble.json')


def write_vis(p1=None):
    """Сетка 1 м над районом: видимая брусчатка (своя и автора) так, как её рисует шейдер, — максимум
    по 4 подвыборкам клетки, 0..255. Раскладка по ней не ставит объекты на камень (layout_market.js)."""
    if p1 is None:
        p1 = load_rgba(os.path.join(ROOT, 'shared', 'terrain-paint-1.png')).astype(np.float64)
    x0, x1, z0, z1 = MASK_BOX
    nx, nz = int(x1 - x0), int(z1 - z0)
    xs = x0 + (np.arange(2 * nx) + 0.5) * 0.5
    zs = z0 + (np.arange(2 * nz) + 0.5) * 0.5
    U, V = TUV().world_grid_uv(xs, zs)
    vis = tuv.visible_layers(p1, U, V)[..., 0]
    vis = np.where(np.isfinite(U), vis, 0.0).reshape(nz, 2, nx, 2).max(axis=(1, 3))
    q = np.clip(np.round(vis * 255.0), 0, 255).astype(np.uint8)
    import base64
    with open(VIS_PATH, 'w', encoding='utf-8') as fh:
        json.dump({'x0': x0, 'z0': z0, 'cell': 1.0, 'nx': nx, 'nz': nz,
                   'source': 'видимая брусчатка (доля слоя 0 × blendFactor) по UV меша террейна, 0..255',
                   'data': base64.b64encode(q.tobytes()).decode('ascii')}, fh)
    print('[paint] видимая брусчатка: %d×%d клеток по 1 м, ≥0.1 у %d клеток → scripts/market-square/visible-cobble.json' % (nx, nz, int((vis >= 0.1).sum())))


def union(a, b):
    return (min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3]))


def main():
    # прямоугольник пикселей, который покрывает район (через UV меша)
    zone = np.array(ROADS['zone'] + [p for rd in ROADS['roads'] for p in rd['pts']])
    x0, z0 = zone.min(0) - 30.0
    x1, z1 = zone.max(0) + 30.0
    xs = np.linspace(x0, x1, 80)
    zs = np.linspace(z0, z1, 80)
    U, V = TUV().world_grid_uv(xs, zs)
    rect = TUV().px_rect(U, V, pad=1)
    px0, px1, py0, py1 = rect
    ss = 4
    X, Z = TUV().pixel_world(px0, px1, py0, py1, ss)
    ok = np.isfinite(X)
    Xs, Zs = np.where(ok, X, 0.0), np.where(ok, Z, 0.0)
    w, f = weights(Xs, Zs)
    w = np.where(ok[..., None], w, 0.0)
    f = np.where(ok, f, 0.0)
    h, wd = py1 - py0, px1 - px0
    acc = w.reshape(h, ss, wd, ss, 4).mean(axis=(1, 3))
    accf = f.reshape(h, ss, wd, ss).mean(axis=(1, 3))

    os.makedirs(BACKUP, exist_ok=True)
    for k in (1, 2):
        src = os.path.join(ROOT, 'shared', 'terrain-paint-%d.png' % k)
        dst = os.path.join(BACKUP, 'terrain-paint-%d.pre-market.png' % k)
        if not os.path.exists(dst):
            shutil.copyfile(src, dst)
    p1 = load_rgba(os.path.join(ROOT, 'shared', 'terrain-paint-1.png')).astype(np.float64)
    p2 = load_rgba(os.path.join(ROOT, 'shared', 'terrain-paint-2.png')).copy()
    b1 = load_rgba(os.path.join(BACKUP, 'terrain-paint-1.pre-market.png')).astype(np.float64)
    b2 = load_rgba(os.path.join(BACKUP, 'terrain-paint-2.pre-market.png'))
    # прошлая покраска рынка (и старая, сдвинутая) → обратно к карте до рынка; потом рисуем заново
    prev = LEGACY_RECT
    if os.path.exists(RECT_PATH):
        prev = union(prev, tuple(json.load(open(RECT_PATH, encoding='utf-8'))['rect']))
    rr = union(prev, rect)
    p1[rr[2]:rr[3], rr[0]:rr[1]] = b1[rr[2]:rr[3], rr[0]:rr[1]]
    p2[rr[2]:rr[3], rr[0]:rr[1]] = b2[rr[2]:rr[3], rr[0]:rr[1]]
    sub = p1[py0:py1, px0:px1] / 255.0
    fa = accf[..., None]
    # покраска автора (дороги по деревне) остаётся как есть, рынок лишь дополняет незакрашенное:
    # на его брусчатке (сумма ≥ 0.25) не добавляем ничего, на её мягком краю — понемногу
    free = np.clip(1.0 - sub.sum(-1, keepdims=True) / 0.25, 0.0, 1.0)
    new = sub + acc * fa * free
    p1[py0:py1, px0:px1] = np.clip(new * 255.0 + 0.5, 0, 255)
    s2 = p2[py0:py1, px0:px1]
    for ch in range(4):
        m = (accf > 0.001) & (acc[..., ch] * accf * free[..., 0] > 0.001) & (sub[..., ch] < 0.004)
        s2[..., ch][m] = TB[ch]
    p2[py0:py1, px0:px1] = s2
    out1 = Image.fromarray(p1.astype(np.uint8), 'RGBA')
    out2 = Image.fromarray(p2.astype(np.uint8), 'RGBA')
    for d in ('client/data', 'shared'):
        out1.save(os.path.join(ROOT, d, 'terrain-paint-1.png'), optimize=True)
        out2.save(os.path.join(ROOT, d, 'terrain-paint-2.png'), optimize=True)
    write_vis(p1.astype(np.uint8).astype(np.float64))
    with open(RECT_PATH, 'w', encoding='utf-8') as fh:
        json.dump({'rect': list(rect), 'note': 'px0, px1, py0, py1 — прямоугольник последней покраски рынка (UV меша)'}, fh)
    tot = (acc * fa).sum(-1)
    print('[paint] пиксели %d..%d × %d..%d (восстановлено из бэкапа %d..%d × %d..%d), закрашено %d пикс.; брусчатка %.0f, трава %.0f, земля %.0f, песок %.0f пикс.-экв.' % (
        px0, px1, py0, py1, rr[0], rr[1], rr[2], rr[3], int((tot > 0.05).sum()),
        (acc[..., 0] * accf).sum(), (acc[..., 1] * accf).sum(), (acc[..., 2] * accf).sum(), (acc[..., 3] * accf).sum()))
    print('[paint] → client/data/terrain-paint-{1,2}.png и shared/terrain-paint-{1,2}.png; бэкап: data/terrain-backups/*.pre-market.png')


def footprint_points(it, step=0.7):
    hx, hz = it['w'] / 2, it['d'] / 2
    nx = max(1, int(math.ceil(2 * hx / step)))
    nz = max(1, int(math.ceil(2 * hz / step)))
    lx, lz = np.meshgrid(np.linspace(-hx, hx, nx + 1), np.linspace(-hz, hz, nz + 1))
    c, s = math.cos(it['ry']), math.sin(it['ry'])
    return it['x'] + lx * c + lz * s, it['z'] - lx * s + lz * c


def check(path):
    """Каждый объект — сетка точек по пятну; видимая брусчатка (шейдер: доля слоя × blendFactor) ≤ VIS_MAX."""
    items = json.load(open(path, encoding='utf-8'))['items']
    p1 = load_rgba(os.path.join(ROOT, 'shared', 'terrain-paint-1.png')).astype(np.float64)
    xs, zs, owner = [], [], []
    for k, it in enumerate(items):
        x, z = footprint_points(it)
        xs.append(x.ravel())
        zs.append(z.ravel())
        owner.append(np.full(x.size, k))
    X, Z, O = np.concatenate(xs), np.concatenate(zs), np.concatenate(owner)
    U, V = TUV().world_to_uv(X, Z)
    vis = tuv.visible_layers(p1, U, V)[..., 0]
    worst = np.zeros(len(items))
    np.maximum.at(worst, O, vis)
    bad = [(items[k], worst[k]) for k in np.argsort(-worst) if worst[k] > VIS_MAX]
    print('[check] объектов %d, точек %d; видимая брусчатка под объектами: макс %.3f, порог %.2f' % (len(items), X.size, worst.max() if len(items) else 0, VIS_MAX))
    if bad:
        by = {}
        for it, v in bad:
            by.setdefault(it['m'], []).append((it, v))
        for m, lst in sorted(by.items(), key=lambda kv: -len(kv[1])):
            print('[check] ! %-28s ×%d: %s' % (m, len(lst), ', '.join('%s (%.0f,%.0f) %.2f' % (it['id'], it['x'], it['z'], v) for it, v in lst[:4])))
        print('[check] ! на брусчатке %d объектов' % len(bad))
        sys.exit(1)
    print('[check] ок: ни один объект не стоит на брусчатке')


def plan_map(out, plan=None):
    """План сверху (север вверху, 2 пикс./м): видимая покраска по UV меша, каменная площадь, объекты."""
    x0, x1, z0, z1 = -60.0, 215.0, -175.0, 70.0
    cell = 0.5
    xs = x0 + (np.arange(int((x1 - x0) / cell)) + 0.5) * cell
    zs = z0 + (np.arange(int((z1 - z0) / cell)) + 0.5) * cell
    U, V = TUV().world_grid_uv(xs, zs)
    p1 = load_rgba(os.path.join(ROOT, 'shared', 'terrain-paint-1.png')).astype(np.float64)
    vis = tuv.visible_layers(p1, U, V)
    base = np.array([66, 92, 56], np.float64)
    cols = np.array([[196, 190, 178], [92, 140, 64], [104, 80, 56], [176, 152, 108]], np.float64)
    img = base * (1 - vis.sum(-1, keepdims=True)) + (vis[..., :, None] * cols).sum(-2)
    if ROADS:
        pz = Plaza(ROADS)
        X, Z = np.meshgrid(xs, zs)
        on = pz.field_outer(X, Z) < 0
        flags = on & (pz.field_inner(X, Z) < 0) & (pz.field_fountain(X, Z) >= 0)
        img[on] = [150, 146, 138]
        img[flags] = [172, 166, 150]
        if ROADS.get('parkPaving'):
            from plaza_shape import ParkPaving
            img[ParkPaving(ROADS['parkPaving']).field(X, Z) < 0] = [172, 166, 150]
    im = Image.fromarray(np.clip(img[::-1], 0, 255).astype(np.uint8), 'RGB')
    dr = ImageDraw.Draw(im)
    H = im.height

    def P(x, z):
        return ((x - x0) / cell, H - (z - z0) / cell)
    if ROADS:
        dr.line([P(*p) for p in ROADS['zone'] + ROADS['zone'][:1]], fill=(250, 220, 40), width=1)
        if ROADS.get('park'):
            dr.line([P(*p) for p in ROADS['park'] + ROADS['park'][:1]], fill=(120, 230, 120), width=1)
    if plan:
        for it in json.load(open(plan, encoding='utf-8'))['props']:
            m = it.get('m', '')
            if it.get('f'):
                x, y = P(it['x'], it['z'])
                r = 2.2 if m.startswith('tree') else 1.2
                dr.ellipse([x - r, y - r, x + r, y + r], fill=(30, 110, 30))
                continue
            if m in ('mkt_plaza_stone', 'mkt_park_paving', 'mkt_bunting', 'airship'):
                continue
            hx, hz = it['w'] / 2, it['d'] / 2
            c, s = math.cos(it['ry']), math.sin(it['ry'])
            pts = [P(it['x'] + a * hx * c + b * hz * s, it['z'] - a * hx * s + b * hz * c) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            col = (60, 90, 220) if 'house' in m or 'warehouse' in m else (230, 140, 30) if 'stall' in m or 'pavilion' in m else (240, 220, 60)
            dr.polygon(pts, fill=col, outline=(20, 20, 20))
    im.save(out)
    print('[map] →', out, im.size)


if __name__ == '__main__':
    if '--mask' in sys.argv:
        write_mask()
    elif '--check' in sys.argv:
        check(sys.argv[sys.argv.index('--check') + 1])
    elif '--map' in sys.argv:
        i = sys.argv.index('--map')
        plan_map(sys.argv[i + 1], sys.argv[i + 2] if len(sys.argv) > i + 2 else None)
    else:
        main()
