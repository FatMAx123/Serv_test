# ============================================================
#  SCRIPTS / MARKET-SQUARE / ATLAS_MARKET.PY
#  Рыночная площадь: ОДИН общий атлас текстур на весь набор лавок и пропсов.
#
#  Техника та же, что у кита операторов (scripts/operators-territory/atlas.py):
#  только diffuse, свет и грязь нарисованы в текстуре, полосы тайлятся по U
#  (trim sheet, 1.0 по U = 8 м, 128 px/м), детали — ячейками. Генераторы камня,
#  латуни, меди, железа, манометра, бронзы и свечения берём из atlas.py операторов.
#
#  Выход:
#    client/assets/props/textures/mkt_atlas.webp    (1024×1024, WebP q82)
#    scripts/market-square/atlas-layout.json         (полосы и ячейки в UV Blender)
#
#  Запуск: python scripts/market-square/atlas_market.py [--preview out.png]
#  Всё процедурное и своё: ни одного чужого пикселя, лицензий не требуется.
# ============================================================
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'operators-territory'))
import atlas as opt  # noqa: E402  (генераторы полос и ячеек кита операторов)

pnoise, blur_wrap, lerp, col = opt.pnoise, opt.blur_wrap, opt.lerp, opt.col

OUT_TEX = os.path.join(ROOT, 'client', 'assets', 'props', 'textures', 'mkt_atlas.webp')
OUT_LAYOUT = os.path.join(HERE, 'atlas-layout.json')

SIZE = 1024
PX_PER_M = 128.0          # по U у всех полос
U_SPAN = SIZE / PX_PER_M  # 8 м на 1.0 по U
GUTTER = 4

# ------------------------------------------------------------
#  Классы игры (shared/class-system.js) → цвет вывески и пиктограмма
#  + две общие лавки (снедь, расходники)
# ------------------------------------------------------------
EMBLEMS = [
    # id                  поле        пиктограмма
    ('operator',          '#8a2a1e', 'wrench_gear'),
    ('mechanic',          '#2f4f7a', 'shield_gear'),
    ('destroyer',         '#6e1b16', 'hammer'),
    ('gunner',            '#3d5a2a', 'rifles'),
    ('repair_engineer',   '#2a6a6a', 'wrench_screw'),
    ('boiler_guardian',   '#283c5c', 'shield_flame'),
    ('demolitionist',     '#8a4a14', 'bomb'),
    ('steam_berserker',   '#5a1414', 'hammer_steam'),
    ('pneumatic_sniper',  '#35552e', 'crosshair'),
    ('artillery_engineer', '#5a4a22', 'cannon'),
    ('engineer',          '#1f5f66', 'bolt_gear'),
    ('constructor',       '#24467a', 'dividers'),
    ('technomancer',      '#4a2f6e', 'wave'),
    ('pressure_sorcerer', '#6a5420', 'gauge'),
    ('machine_warlock',   '#1e4e52', 'drone'),
    ('circuit_necro',     '#3a5e1a', 'drop'),
    ('overhaul_master',   '#6a4a1e', 'piston'),
    ('protocol_prophet',  '#2a3a6a', 'antenna'),
    ('craftsman',         '#5a3a1e', 'anvil_hammer'),
    ('salvager',          '#7a3e16', 'magnet'),
    ('boiler_smith',      '#7a2416', 'anvil_flame'),
    ('food',              '#4f6a1e', 'apple'),
    ('supplies',          '#6a1e3a', 'flask'),
]

# Палитра однотонных ячеек 16×16 (товар, флажки, стекло, ткань)
PALETTE = [
    ('cream', '#e8dcbc'), ('canvas', '#d6cba8'), ('green', '#3f7a32'), ('dark_green', '#26502a'),
    ('teal', '#2a8a86'), ('red', '#b02a22'), ('dark_red', '#6e1a16'), ('blue', '#2c5aa0'),
    ('navy', '#1e2e5a'), ('purple', '#5a3a8a'), ('orange', '#d06a1e'), ('yellow', '#e2b83a'),
    ('white', '#efeadc'), ('black', '#1e1a18'), ('brown', '#5a3a22'), ('leather', '#7a4a26'),
    ('bread', '#c48a44'), ('apple', '#c4261e'), ('cabbage', '#7aa83a'), ('carrot', '#e07a22'),
    ('fish', '#9aa6ae'), ('cheese', '#e8c45a'), ('acid', '#7ee04a'), ('glass_blue', '#4ab0e0'),
    ('amber', '#d8902a'), ('blueprint', '#2a5a9a'), ('paper', '#e6dab4'), ('rope', '#a8885a'),
    ('steel', '#8c949c'), ('dark_steel', '#3c4248'), ('gold', '#e0b04a'), ('burlap', '#a48a5a'),
    ('pink', '#d86a8a'), ('lime', '#a8d04a'), ('sky', '#7ab4e0'), ('soil', '#4a3626'),
]


# ------------------------------------------------------------
#  Полосы
# ------------------------------------------------------------
def cobble_strip(h, w, seed, v_ppm):
    """Брусчатка: бесшовная по U и V (полосы-ленты по 1 м кладутся друг к другу).
    Камни — периодическая ячеистая сетка (F1/F2), выпуклость нарисована светом сверху-слева."""
    r = np.random.default_rng(seed)
    wm, hm = w / PX_PER_M, h / v_ppm
    csx, csy = 0.20, 0.20
    nx, ny = int(round(wm / csx)), int(round(hm / csy))
    csx, csy = wm / nx, hm / ny
    jx = r.uniform(0.18, 0.82, size=(ny, nx))
    jy = r.uniform(0.18, 0.82, size=(ny, nx))
    tone = r.uniform(0, 1, size=(ny, nx))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xm = (xx + 0.5) / PX_PER_M
    ym = (yy + 0.5) / v_ppm
    ci = np.floor(xm / csx).astype(np.int32)
    cj = np.floor(ym / csy).astype(np.int32)
    F1 = np.full((h, w), 9.0, np.float32)
    F2 = np.full((h, w), 9.0, np.float32)
    ID = np.zeros((h, w), np.int32)
    DX = np.zeros((h, w), np.float32)
    DY = np.zeros((h, w), np.float32)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            a = ci + di
            b = cj + dj
            am, bm = a % nx, b % ny
            sx = (a + jx[bm, am]) * csx
            sy = (b + jy[bm, am]) * csy
            dx = xm - sx
            dy = (ym - sy) * 1.0
            d = np.sqrt(dx * dx + dy * dy)
            closer = d < F1
            F2 = np.where(closer, F1, np.minimum(F2, d))
            ID = np.where(closer, bm * nx + am, ID)
            DX = np.where(closer, dx, DX)
            DY = np.where(closer, dy, DY)
            F1 = np.where(closer, d, F1)
    edge = F2 - F1
    t = tone.reshape(-1)[ID]
    base = lerp(col('#8e8678'), col('#b3a993'), t[..., None])
    warm = lerp(col('#9a8466'), col('#a8946f'), t[..., None])
    pick = (np.random.default_rng(seed + 3).uniform(0, 1, size=nx * ny)[ID] > 0.62)[..., None]
    out = np.where(pick, warm, base)
    n1 = pnoise(h, w, 2.4, seed + 1)
    n2 = pnoise(h, w, 1.3, seed + 2)
    out = out * (0.86 + 0.22 * n1[..., None])
    # купол камня: светлее к верху-слева, темнее к краю
    rad = np.clip(F1 / (0.55 * min(csx, csy)), 0, 1)
    light = np.clip(-(DX + DY) / (0.55 * min(csx, csy)), -1, 1)
    out = out * (1.04 - 0.22 * rad ** 2)[..., None] * (1 + 0.14 * light)[..., None]
    # швы: песок и земля
    joint = np.clip(1.0 - (edge - 0.008) / 0.016, 0, 1)
    sand = lerp(col('#5a4a36'), col('#6e5c40'), n2[..., None])
    out = out * (1 - joint[..., None]) + sand * joint[..., None]
    # пятна грязи и ржавые потёки (рынок, телеги)
    stains = np.clip((pnoise(h, w, 2.0, seed + 5) - 0.58) * 3.0, 0, 1)
    out *= (1 - 0.28 * stains)[..., None]
    return np.clip(out, 0, 1)


def halftimber_strip(h, w, seed, v_ppm):
    """Фахверк на этаж (2.6 м): побелка, лежень, обвязка, стойки через 1.33 м, раскосы."""
    n1 = pnoise(h, w, 2.2, seed + 1)
    n2 = pnoise(h, w, 1.2, seed + 2)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xm = (xx + 0.5) / PX_PER_M
    zm = (h - yy - 0.5) / v_ppm          # высота от низа этажа
    plaster = lerp(col('#d9cdb0'), col('#ece2c8'), n2[..., None]) * (0.9 + 0.14 * n1[..., None])
    # копоть и брызги у низа стены
    dirt = np.clip(1.0 - zm / 0.9, 0, 1) * (0.5 + 0.5 * pnoise(h, w, 1.8, seed + 4))
    plaster = plaster * (1 - 0.35 * dirt[..., None]) + col('#6a5a42') * 0.35 * dirt[..., None]
    grain = np.sin(xm * 40 + 3 * pnoise(h, w, 1.5, seed + 6) * 6) * 0.5 + 0.5
    wood = lerp(col('#3a2616'), col('#5a3c22'), (grain * 0.6 + 0.2 * n1)[..., None])
    mask = np.zeros((h, w), bool)
    H = h / v_ppm
    mask |= zm < 0.22
    mask |= zm > H - 0.20
    bay = U_SPAN / 6.0
    px = xm % bay
    mask |= (px < 0.09) | (px > bay - 0.09)
    k = np.floor(xm / bay).astype(np.int32) % 6
    fx = px / bay
    fz = np.clip((zm - 0.22) / (H - 0.42), 0, 1)
    brace_a = (np.abs(fx - fz) * bay < 0.10) & ((k == 0) | (k == 3))
    brace_b = (np.abs((1 - fx) - fz) * bay < 0.10) & ((k == 2) | (k == 5))
    mask |= (brace_a | brace_b) & (zm > 0.2) & (zm < H - 0.2)
    out = np.where(mask[..., None], wood, plaster)
    # тень под обвязкой и над лежнем — объём бруса
    sh = (~mask) & ((np.abs(zm - (H - 0.20)) < 0.05) | (np.abs(zm - 0.22) < 0.03))
    out[sh] *= 0.72
    return np.clip(out, 0, 1)


def roof_strip(h, w, seed, v_ppm, base_hex, alt_hex):
    """Черепица: ряды по 0.25 м, плитки 0.2 м со сдвигом, скруглённый низ, тень под рядом."""
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xm = (xx + 0.5) / PX_PER_M
    zm = (h - yy - 0.5) / v_ppm            # вверх по скату
    row_h = 0.25
    rows = int(round((h / v_ppm) / row_h))
    row_h = (h / v_ppm) / rows
    k = np.floor(zm / row_h).astype(np.int32)
    fz = zm / row_h - k                      # 0 у нижнего края ряда
    tw = U_SPAN / 40.0
    u = (xm + (k % 2) * tw * 0.5) / tw
    ti = np.floor(u).astype(np.int32)
    fu = u - ti
    rv = r.uniform(0, 1, size=(rows + 2, 64))
    vv = rv[k % (rows + 2), ti % 64]
    base = col(base_hex)
    alt = col(alt_hex)
    out = base[None, None, :] * (1 - vv[..., None] * 0.55) + alt[None, None, :] * (vv[..., None] * 0.55)
    edge = np.sqrt(np.clip(1 - ((fu - 0.5) * 2) ** 2, 0, 1))
    lip = fz < 0.18 * (1 - edge) + 0.02
    out = out * (0.82 + 0.30 * fz)[..., None]                 # к низу ряда светлее (скат к свету)
    out = out * (0.80 + 0.20 * np.clip(np.minimum(fu, 1 - fu) * 9, 0, 1))[..., None]
    out[lip] *= 0.45
    n1 = pnoise(h, w, 2.4, seed + 1)
    moss = np.clip((pnoise(h, w, 2.2, seed + 2) - 0.66) * 3, 0, 1)
    out = out * (0.86 + 0.22 * n1[..., None])
    out = out * (1 - 0.35 * moss[..., None]) + col('#5a6a34') * 0.35 * moss[..., None]
    return np.clip(out, 0, 1)


def stripes_strip(h, w, seed, a_hex, b_hex, n=22):
    """Полосатый тент: полосы поперёк U, едва заметные складки и выгорание."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ph = (xx / w * n) % 1.0
    a, b = col(a_hex), col(b_hex)
    out = np.where((ph < 0.5)[..., None], a, b)
    soft = np.clip(np.minimum(np.abs(ph - 0.5), np.minimum(ph, 1 - ph)) * 60, 0, 1)
    out = out * (0.93 + 0.07 * soft)[..., None]
    fold = 0.94 + 0.06 * np.cos(ph * 2 * math.pi)
    out *= fold[..., None]
    n1 = pnoise(h, w, 2.0, seed + 1)
    out *= (0.92 + 0.12 * n1)[..., None]
    return np.clip(out, 0, 1)


def canvas_strip(h, w, seed, a_hex, b_hex, panel_m=1.0):
    """Брезент шатра: полотнища с двойным швом, лёгкая складка в каждом."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xm = (xx + 0.5) / PX_PER_M
    n_p = int(round(U_SPAN / panel_m))
    ph = (xm / (U_SPAN / n_p)) % 1.0
    k = np.floor(xm / (U_SPAN / n_p)).astype(np.int32)
    a, b = col(a_hex), col(b_hex)
    tv = (np.random.default_rng(seed).uniform(0, 1, size=64)[k % 64])[..., None]
    out = a * (1 - tv * 0.5) + b * (tv * 0.5)
    out = out * (0.90 + 0.10 * np.sin(ph * math.pi))[..., None]
    seam = (np.abs(ph - 0.02) < 0.012) | (np.abs(ph - 0.05) < 0.010)
    out[seam] *= 0.62
    n1 = pnoise(h, w, 2.2, seed + 1)
    out *= (0.9 + 0.14 * n1)[..., None]
    return np.clip(out, 0, 1)


def plank_strip(h, w, seed, v_ppm):
    """Светлые торговые доски: 2 доски по 0.2 м, волокна, щели, шляпки гвоздей."""
    n1 = pnoise(h, w, 2.0, seed + 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    plank_h = h / 2.0
    k = np.floor(yy / plank_h)
    fy = (yy % plank_h) / plank_h
    grain = np.sin((yy * 0.8 + 5 * np.sin(xx / w * 2 * math.pi * 5 + k * 1.9) + n1 * 12) * 1.3) * 0.5 + 0.5
    tone = np.random.default_rng(seed).uniform(0, 1, size=8)[k.astype(np.int32) % 8][..., None]
    base = lerp(col('#7a5634'), col('#a87c4c'), grain[..., None] * 0.55 + 0.25 * tone)
    out = base * (1.06 - 0.22 * np.abs(fy - 0.45))[..., None]
    gap = (fy < 0.07) | (fy > 0.95)
    out[gap] *= 0.42
    # торцевые стыки досок и гвозди
    seg = (xx / PX_PER_M) % 1.6
    out[(seg < 0.012)] *= 0.5
    for xn in (0.06, 1.54):
        d = np.sqrt(((xx / PX_PER_M) % 1.6 - xn) ** 2 * PX_PER_M ** 2 + (fy * plank_h - plank_h * 0.5) ** 2)
        out[d < 1.6] = col('#3a3632')
    return np.clip(out, 0, 1)


def timber_strip(h, w, seed):
    n1 = pnoise(h, w, 2.0, seed + 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grain = np.sin((yy * 1.2 + 4 * np.sin(xx / w * 2 * math.pi * 7) + n1 * 10) * 1.1) * 0.5 + 0.5
    out = lerp(col('#33241a'), col('#5a3e26'), (grain * 0.6 + 0.2)[..., None])
    fy = yy / max(1, h - 1)
    out *= (1.08 - 0.3 * np.abs(fy - 0.4))[..., None]
    return np.clip(out, 0, 1)


def staves_strip(h, w, seed):
    """Бочка: клёпки вдоль высоты, железные обручи нарисованы (без лишней геометрии).
    Мапится растяжкой: V 0..1 = низ..верх бочки, U — по окружности."""
    n1 = pnoise(h, w, 2.0, seed + 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fv = 1.0 - yy / max(1, h - 1)
    n_st = 64
    ph = (xx / w * n_st) % 1.0
    k = np.floor(xx / w * n_st).astype(np.int32)
    tone = np.random.default_rng(seed).uniform(0, 1, size=n_st)[k % n_st][..., None]
    out = lerp(col('#5e3e22'), col('#8a6036'), tone * 0.7 + 0.15 * n1[..., None])
    out *= (0.82 + 0.22 * np.sin(ph * math.pi))[..., None]
    gap = (ph < 0.06)
    out[gap] *= 0.45
    for c in (0.10, 0.30, 0.70, 0.90):
        band = np.abs(fv - c) < 0.035
        out[band] = (col('#3a3c40') * (0.85 + 0.3 * n1[..., None]))[band]
        hl = np.abs(fv - c - 0.02) < 0.008
        out[hl] = col('#6a6e74')
    return np.clip(out, 0, 1)


# ------------------------------------------------------------
#  Ячейки
# ------------------------------------------------------------
def supersampled(w, h, draw_fn, ss=4, bg=(0, 0, 0, 0)):
    img = Image.new('RGBA', (w * ss, h * ss), bg)
    d = ImageDraw.Draw(img)
    draw_fn(d, ss)
    return img.resize((w, h), Image.LANCZOS)


def rot(pts, ang, cx, cy):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def gear_poly(cx, cy, ro, ri, teeth, phase=0.0):
    pts = []
    for i in range(teeth * 4):
        a = phase + 2 * math.pi * i / (teeth * 4)
        r = ro if (i % 4) in (1, 2) else ri
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def emblem_shapes(kind):
    """Пиктограмма в системе 100×100: список (тип, данные, ширина)."""
    S = []
    P = lambda *a: S.append(a)  # noqa: E731
    if kind == 'wrench_gear':
        P('poly', gear_poly(50, 50, 34, 27, 10))
        P('hole', (50, 50, 12))
        P('poly', rot([(46, 8), (54, 8), (54, 92), (46, 92)], math.radians(40), 50, 50), 'dark')
        P('ring', (50 + 30 * math.cos(math.radians(130)), 50 + 30 * math.sin(math.radians(130)), 11, 6))
    elif kind == 'shield_gear':
        P('poly', [(18, 14), (82, 14), (82, 48), (50, 90), (18, 48)])
        P('poly', gear_poly(50, 44, 20, 15, 8), 'dark')
        P('hole', (50, 44, 6))
    elif kind == 'hammer':
        P('poly', rot([(46, 22), (54, 22), (54, 94), (46, 94)], math.radians(-20), 50, 50))
        P('poly', rot([(24, 8), (76, 8), (76, 32), (24, 32)], math.radians(-20), 50, 50))
    elif kind == 'rifles':
        for a in (35, -35):
            P('poly', rot([(47, 6), (52, 6), (52, 62), (58, 66), (58, 92), (44, 92), (44, 66), (47, 62)], math.radians(a), 50, 50))
    elif kind == 'wrench_screw':
        P('poly', rot([(46, 14), (54, 14), (54, 92), (46, 92)], math.radians(35), 50, 50))
        P('ring', (50 + 34 * math.cos(math.radians(-55 - 90)), 50 + 34 * math.sin(math.radians(-55 - 90)), 11, 6))
        P('poly', rot([(47, 10), (53, 10), (53, 60), (47, 60)], math.radians(-35), 50, 50))
        P('poly', rot([(43, 60), (57, 60), (57, 92), (43, 92)], math.radians(-35), 50, 50))
    elif kind == 'shield_flame':
        P('poly', [(16, 10), (84, 10), (84, 60), (50, 92), (16, 60)])
        P('poly', [(50, 20), (64, 44), (60, 70), (50, 76), (40, 70), (36, 48), (44, 52)], 'dark')
    elif kind == 'bomb':
        P('ellipse', (50, 60, 30, 30))
        P('line', [(64, 34), (72, 20), (80, 16)], 5)
        P('poly', [(84, 4), (87, 13), (96, 14), (88, 19), (91, 28), (84, 22), (77, 27), (80, 18), (73, 13), (82, 12)])
        P('ellipse', (40, 50, 7, 7), 'dark')
    elif kind == 'hammer_steam':
        P('poly', rot([(46, 34), (54, 34), (54, 96), (46, 96)], math.radians(15), 50, 60))
        P('poly', rot([(26, 22), (74, 22), (74, 44), (26, 44)], math.radians(15), 50, 60))
        for (x, y, r) in ((24, 14, 9), (40, 8, 7), (12, 26, 6)):
            P('ellipse', (x, y, r, r))
    elif kind == 'crosshair':
        P('ring', (50, 50, 34, 7))
        P('ring', (50, 50, 12, 5))
        for a, b in (((50, 4), (50, 30)), ((50, 70), (50, 96)), ((4, 50), (30, 50)), ((70, 50), (96, 50))):
            P('line', [a, b], 7)
    elif kind == 'cannon':
        P('poly', rot([(14, 36), (84, 30), (86, 50), (14, 54)], math.radians(-12), 50, 50))
        P('ring', (40, 66, 20, 7))
        P('ellipse', (40, 66, 5, 5))
    elif kind == 'bolt_gear':
        P('poly', gear_poly(50, 50, 40, 33, 10))
        P('hole', (50, 50, 26))
        P('poly', [(56, 18), (34, 54), (48, 54), (42, 84), (66, 44), (52, 44)])
    elif kind == 'dividers':
        P('ellipse', (50, 16, 8, 8))
        P('line', [(50, 16), (24, 90)], 8)
        P('line', [(50, 16), (76, 90)], 8)
        P('line', [(32, 66), (68, 66)], 5)
    elif kind == 'wave':
        P('ring', (50, 50, 40, 6))
        pts = [(14 + i * 1.8, 50 - 22 * math.sin(i * 0.33)) for i in range(41)]
        P('line', pts, 7)
    elif kind == 'gauge':
        P('ring', (50, 52, 38, 8))
        for i in range(7):
            a = math.radians(150 + i * 40)
            P('line', [(50 + 24 * math.cos(a), 52 + 24 * math.sin(a)), (50 + 31 * math.cos(a), 52 + 31 * math.sin(a))], 5)
        P('line', [(50, 52), (72, 32)], 7)
        P('ellipse', (50, 52, 7, 7))
    elif kind == 'drone':
        P('ellipse', (50, 56, 18, 14))
        P('line', [(20, 34), (80, 34)], 6)
        P('line', [(50, 42), (50, 34)], 6)
        P('ellipse', (20, 30, 16, 5))
        P('ellipse', (80, 30, 16, 5))
        P('ellipse', (50, 58, 6, 6), 'dark')
    elif kind == 'drop':
        pts = []
        for i in range(25):
            a = math.pi * 2 * i / 24
            pts.append((50 + 28 * math.sin(a), 62 - 28 * math.cos(a) if math.cos(a) < 0 else 62 - 28 * math.cos(a) * 0.95))
        P('poly', [(50, 8)] + [(50 + 28 * math.cos(math.radians(a)), 62 + 28 * math.sin(math.radians(a))) for a in range(-30, 211, 12)])
        for (x, y, r) in ((78, 20, 6), (86, 36, 4), (22, 26, 5)):
            P('ellipse', (x, y, r, r))
    elif kind == 'piston':
        P('poly', [(30, 10), (70, 10), (70, 54), (30, 54)])
        P('line', [(36, 22), (64, 22)], 4, 'dark')
        P('line', [(36, 34), (64, 34)], 4, 'dark')
        P('line', [(50, 54), (50, 80)], 10)
        P('ring', (50, 84, 11, 6))
    elif kind == 'antenna':
        P('line', [(50, 30), (50, 94)], 8)
        P('line', [(32, 94), (68, 94)], 8)
        P('ellipse', (50, 26, 7, 7))
        for r in (16, 28):
            P('arc', (50, 26, r, 200, 340), 6)
            P('arc', (50, 26, r, 20, 160), 6)
    elif kind == 'anvil_hammer':
        P('poly', [(12, 46), (88, 46), (78, 58), (64, 60), (64, 76), (78, 90), (22, 90), (36, 76), (36, 60), (22, 58)])
        P('poly', rot([(46, 2), (54, 2), (54, 40), (46, 40)], math.radians(-35), 50, 30))
        P('poly', rot([(32, 0), (68, 0), (68, 14), (32, 14)], math.radians(-35), 50, 30))
    elif kind == 'magnet':
        P('arc', (50, 46, 26, 0, 180), 18)
        P('poly', [(15, 16), (33, 16), (33, 48), (15, 48)])
        P('poly', [(67, 16), (85, 16), (85, 48), (67, 48)])
        P('poly', [(15, 14), (33, 14), (33, 24), (15, 24)], 'dark')
        P('poly', [(67, 14), (85, 14), (85, 24), (67, 24)], 'dark')
    elif kind == 'anvil_flame':
        P('poly', [(10, 56), (90, 56), (80, 66), (64, 68), (64, 80), (78, 92), (22, 92), (36, 80), (36, 68), (20, 66)])
        P('poly', [(50, 4), (64, 26), (60, 48), (50, 52), (40, 48), (36, 30), (44, 34)])
    elif kind == 'apple':
        P('ellipse', (50, 58, 32, 30))
        P('line', [(50, 30), (54, 14)], 5)
        P('poly', [(56, 22), (76, 10), (72, 26)])
    elif kind == 'flask':
        P('poly', [(42, 8), (58, 8), (58, 36), (80, 72), (74, 92), (26, 92), (20, 72), (42, 36)])
        P('poly', [(28, 66), (72, 66), (76, 80), (72, 88), (28, 88), (24, 80)], 'dark')
    return S


def cell_emblem(s, field_hex, kind, seed):
    """Вывеска класса: латунная рамка, цветное поле, светлая пиктограмма с тенью."""
    n = pnoise(s, s, 2.0, seed)
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    field = col(field_hex) * (0.86 + 0.2 * n[..., None])
    c = (s - 1) / 2.0
    vign = np.clip(1.0 - (np.sqrt((xx - c) ** 2 + (yy - c) ** 2) / (s * 0.75)) ** 2 * 0.35, 0.6, 1)
    out = field * vign[..., None]
    b = max(3, int(s * 0.07))
    frame = (xx < b) | (xx >= s - b) | (yy < b) | (yy >= s - b)
    hl = np.clip(1 - (xx + yy) / (2 * s), 0, 1)
    out[frame] = (col('#b8923e') * (0.75 + 0.5 * hl[..., None]))[frame]
    inner = (np.abs(xx - b - 1) < 1) | (np.abs(yy - b - 1) < 1) | (np.abs(xx - (s - b - 2)) < 1) | (np.abs(yy - (s - b - 2)) < 1)
    out[inner & ~frame] *= 0.55
    for rx, ry in ((b // 2, b // 2), (s - b // 2 - 1, b // 2), (b // 2, s - b // 2 - 1), (s - b // 2 - 1, s - b // 2 - 1)):
        d = np.sqrt((xx - rx) ** 2 + (yy - ry) ** 2)
        out[d < 1.8] = col('#f0d08a')
    # пиктограмма
    pad = b + 3
    inner_s = s - 2 * pad
    shapes = emblem_shapes(kind)

    def draw(d, ss, color, dark_color, off):
        k = inner_s * ss / 100.0
        ox = (pad + off) * ss
        oy = (pad + off) * ss

        def T(p):
            return (ox + p[0] * k, oy + p[1] * k)
        for sh in shapes:
            typ = sh[0]
            tone = dark_color if (len(sh) > 2 and sh[-1] == 'dark') else color
            if typ == 'poly':
                d.polygon([T(p) for p in sh[1]], fill=tone)
            elif typ == 'hole':
                x, y, r = sh[1]
                d.ellipse([T((x - r, y - r)), T((x + r, y + r))], fill=(0, 0, 0, 0))
            elif typ == 'ellipse':
                x, y, rx, ry = sh[1]
                d.ellipse([T((x - rx, y - ry)), T((x + rx, y + ry))], fill=tone)
            elif typ == 'ring':
                x, y, r, wd = sh[1]
                d.ellipse([T((x - r, y - r)), T((x + r, y + r))], outline=tone, width=max(1, int(wd * k)))
            elif typ == 'line':
                d.line([T(p) for p in sh[1]], fill=tone, width=max(1, int(sh[2] * k)), joint='curve')
            elif typ == 'arc':
                x, y, r, a0, a1 = sh[1]
                d.arc([T((x - r, y - r)), T((x + r, y + r))], a0, a1, fill=tone, width=max(1, int(sh[2] * k)))

    shadow = supersampled(s, s, lambda d, ss: draw(d, ss, (20, 12, 6, 230), (20, 12, 6, 230), 1.2))
    light = supersampled(s, s, lambda d, ss: draw(d, ss, (240, 226, 184, 255), (90, 64, 34, 255), 0.0))
    # «дыры» (hole) вычитаются только в своём слое: рисуем их цветом поля поверх
    base_img = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    base_img.alpha_composite(shadow)
    base_img.alpha_composite(light)
    res = np.asarray(base_img.convert('RGB')).astype(np.float32) / 255.0
    # лёгкая гравировка: блик сверху-слева по пиктограмме
    return np.clip(res, 0, 1)


def cell_water(s, seed):
    n1 = pnoise(s, s, 2.6, seed)
    n2 = pnoise(s, s, 1.6, seed + 1)
    out = lerp(col('#1e4e5a'), col('#3a8a96'), n2[..., None])
    rip = np.clip((np.sin(n1 * 26) - 0.75) * 4, 0, 1)
    out = out * (1 - 0.6 * rip[..., None]) + col('#cfe8e4') * 0.6 * rip[..., None]
    return np.clip(out, 0, 1)


def cell_flowers(s, seed):
    r = np.random.default_rng(seed)
    n1 = pnoise(s, s, 2.4, seed)
    out = lerp(col('#2a4a1e'), col('#5a8a32'), n1[..., None])
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    colors = ['#d83a2a', '#e8c43a', '#a04ac8', '#efe6d8', '#e86a9a', '#3a6ad8']
    for _ in range(int(s * s / 26)):
        x, y = r.uniform(0, s), r.uniform(0, s)
        rad = r.uniform(1.0, 2.2)
        c = col(colors[r.integers(0, len(colors))])
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        m = d < rad
        out[m] = c * (0.85 + 0.3 * (1 - d[m][:, None] / rad))
    return np.clip(out, 0, 1)


def cell_window(wpx, hpx, seed):
    yy, xx = np.mgrid[0:hpx, 0:wpx].astype(np.float32)
    n = pnoise(hpx, wpx, 2.0, seed)
    wood = lerp(col('#3a2616'), col('#5a3c22'), n[..., None])
    out = wood.copy()
    m = 0.14 * wpx
    glass = (xx > m) & (xx < wpx - m) & (yy > m) & (yy < hpx - m * 1.6)
    fy = yy / hpx
    g = lerp(col('#e8b458'), col('#2a2a30'), np.clip(fy * 1.3 + 0.1 * n, 0, 1)[..., None])
    out[glass] = g[glass]
    mull = glass & ((np.abs(xx - wpx / 2) < 1.2) | (np.abs(yy - hpx * 0.42) < 1.2))
    out[mull] = col('#2a1c10')
    sill = yy > hpx - m * 1.4
    out[sill] = col('#6a4a2a')
    box = yy > hpx - m * 0.8
    fl = cell_flowers(max(wpx, hpx), seed + 3)[:hpx, :wpx]
    out[box & (n > 0.35)] = fl[box & (n > 0.35)]
    return np.clip(out, 0, 1)


def cell_door(wpx, hpx, seed):
    yy, xx = np.mgrid[0:hpx, 0:wpx].astype(np.float32)
    n = pnoise(hpx, wpx, 2.0, seed)
    stone = col('#bfb398') * (0.85 + 0.2 * n[..., None])
    out = stone.copy()
    cx = (wpx - 1) / 2.0
    r = wpx * 0.40
    top = r + wpx * 0.08
    door = ((np.abs(xx - cx) < r) & (yy > top)) | (np.sqrt((xx - cx) ** 2 + (yy - top) ** 2) < r)
    pl = (np.floor((xx - cx + r) / (2 * r / 5))).astype(np.int32)
    tone = np.random.default_rng(seed).uniform(0, 1, size=8)[pl % 8]
    wood = lerp(col('#4a2e18'), col('#6e4628'), (tone * 0.7 + 0.2 * n)[..., None])
    out[door] = wood[door]
    gap = door & ((((xx - cx + r) % (2 * r / 5)) < 1.0))
    out[gap] *= 0.5
    for hy in (0.42, 0.78):
        band = door & (np.abs(yy - hpx * hy) < 1.6) & (xx < cx + r * 0.7)
        out[band] = col('#2e3034')
    knob = np.sqrt((xx - cx - r * 0.55) ** 2 + (yy - hpx * 0.62) ** 2) < 2.0
    out[knob] = col('#d0a24a')
    return np.clip(out, 0, 1)


def cell_banner(wpx, hpx, seed):
    """Синий вымпел рынка: золотая кайма, шестерня и ласточкин хвост (низ режет геометрия)."""
    yy, xx = np.mgrid[0:hpx, 0:wpx].astype(np.float32)
    n = pnoise(hpx, wpx, 2.0, seed)
    out = lerp(col('#1c3266'), col('#2c4a8e'), n[..., None])
    out *= (0.88 + 0.16 * np.cos((xx / wpx - 0.5) * 3.0))[..., None]
    b = 3
    border = (xx < b) | (xx >= wpx - b) | (yy < b)
    out[border] = col('#d6a640')
    cx, cy = (wpx - 1) / 2.0, hpx * 0.34
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ang = np.arctan2(yy - cy, xx - cx)
    rr = wpx * 0.30 * (1 + 0.14 * (np.cos(ang * 8) > 0.2))
    gear = (d < rr) & (d > wpx * 0.12)
    out[gear] = col('#e0b04a')
    band = np.abs(yy - hpx * 0.62) < 2
    out[band] = col('#d6a640')
    return np.clip(out, 0, 1)


def cell_crate(s, seed):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    n1 = pnoise(s, s, 2.0, seed)
    k = np.floor(yy / (s / 4))
    grain = np.sin((xx * 0.6 + n1 * 10 + k * 3) * 1.2) * 0.5 + 0.5
    tone = np.random.default_rng(seed).uniform(0, 1, size=8)[k.astype(np.int32) % 8]
    out = lerp(col('#7a5634'), col('#a67a48'), (grain * 0.5 + tone * 0.4)[..., None])
    gap = ((yy % (s / 4)) < 1.2)
    out[gap] *= 0.45
    f = s * 0.12
    frame = (xx < f) | (xx > s - f) | (yy < f) | (yy > s - f)
    brace = np.abs((xx - f) - (s - f - yy)) < f * 0.55
    fw = lerp(col('#5a3c22'), col('#7a5430'), n1[..., None])
    out[frame | brace] = fw[frame | brace]
    edge = frame & ((np.abs(xx - f) < 1) | (np.abs(yy - f) < 1) | (np.abs(xx - (s - f)) < 1) | (np.abs(yy - (s - f)) < 1))
    out[edge] *= 0.55
    for cx, cy in ((f / 2, f / 2), (s - f / 2, f / 2), (f / 2, s - f / 2), (s - f / 2, s - f / 2)):
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        out[d < 1.8] = col('#3a3a3e')
    return np.clip(out, 0, 1)


def cell_swatch(s, hexc, seed):
    n = pnoise(s, s, 2.0, seed)
    return np.clip(col(hexc) * (0.9 + 0.16 * n[..., None]), 0, 1)


# ------------------------------------------------------------
#  Сборка
# ------------------------------------------------------------
def main():
    atlas = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    layout = {'size': SIZE, 'pxPerM': PX_PER_M, 'uSpanM': U_SPAN, 'strips': {}, 'cells': {}, 'emblems': [e[0] for e in EMBLEMS],
              'palette': [p[0] for p in PALETTE]}
    y = [0]

    def put_strip(name, content_px, height_m, gen):
        y0 = y[0]
        y1 = y0 + content_px + 2 * GUTTER
        tile = gen(content_px)
        full = np.concatenate([tile[-GUTTER:], tile, tile[:GUTTER]], axis=0)
        atlas[y0:y1] = full
        layout['strips'][name] = {'v0': 1.0 - (y1 - GUTTER) / SIZE, 'v1': 1.0 - (y0 + GUTTER) / SIZE,
                                  'heightM': height_m, 'px': [y0, y1]}
        y[0] = y1

    put_strip('cobble', 80, 1.0, lambda h: cobble_strip(h, SIZE, 31, h / 1.0))
    put_strip('halftimber', 120, 2.6, lambda h: halftimber_strip(h, SIZE, 37, h / 2.6))
    put_strip('stone', 72, 0.8, lambda h: opt.stone_strip(h, SIZE, 41, '#cdbf9f', ['#d8ccae', '#bfb194', '#d2bf98', '#b9b2a0'], 24, 40, 90, cracks=0.2, grime=0.3, bevel=4, mortar=2))
    put_strip('roof_red', 40, 0.75, lambda h: roof_strip(h, SIZE, 43, h / 0.75, '#9a3a24', '#b8583a'))
    put_strip('roof_blue', 40, 0.75, lambda h: roof_strip(h, SIZE, 47, h / 0.75, '#38486a', '#52648a'))
    put_strip('roof_green', 40, 0.75, lambda h: roof_strip(h, SIZE, 53, h / 0.75, '#3a5a3a', '#567a4a'))
    put_strip('stripes_red', 12, 1.0, lambda h: stripes_strip(h, SIZE, 59, '#b42a22', '#efe6d2'))
    put_strip('stripes_blue', 12, 1.0, lambda h: stripes_strip(h, SIZE, 61, '#2c5aa0', '#efe6d2'))
    put_strip('stripes_teal', 12, 1.0, lambda h: stripes_strip(h, SIZE, 67, '#1e8a86', '#efe6d2'))
    put_strip('canvas_green', 12, 1.0, lambda h: canvas_strip(h, SIZE, 71, '#2e6a2e', '#3e8238'))
    put_strip('canvas_cream', 12, 1.0, lambda h: canvas_strip(h, SIZE, 73, '#ddd0aa', '#ece2c4'))
    put_strip('plank', 40, 0.4, lambda h: plank_strip(h, SIZE, 79, h / 0.4))
    put_strip('timber', 24, 0.25, lambda h: timber_strip(h, SIZE, 83))
    put_strip('brass', 24, 0.2, lambda h: opt.brass_strip(h, SIZE, 89))
    put_strip('copper', 24, 0.25, lambda h: opt.copper_strip(h, SIZE, 97))
    put_strip('iron', 24, 0.25, lambda h: opt.iron_strip(h, SIZE, 101))
    put_strip('staves', 24, 1.0, lambda h: staves_strip(h, SIZE, 103))
    strips_end = y[0]

    def put_cell(name, x, y0, wpx, hpx, gen):
        cw, chh = wpx - 2 * GUTTER, hpx - 2 * GUTTER
        img = gen(cw, chh)
        full = np.pad(img, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge')
        atlas[y0:y0 + hpx, x:x + wpx] = full
        layout['cells'][name] = {
            'u0': (x + GUTTER) / SIZE, 'u1': (x + wpx - GUTTER) / SIZE,
            'v0': 1.0 - (y0 + hpx - GUTTER) / SIZE, 'v1': 1.0 - (y0 + GUTTER) / SIZE,
            'px': [x, y0, wpx, hpx]}

    # гербы классов: ряды по 11 ячеек 88×88
    E = 88
    x, row_y = 0, strips_end
    for i, (cid, field, kind) in enumerate(EMBLEMS):
        if x + E > SIZE:
            x = 0
            row_y += E
        put_cell('emb_' + cid, x, row_y, E, E, lambda w, h, f=field, k=kind, s=i: cell_emblem(h, f, k, 500 + s))
        x += E
    # остаток последнего ряда и следующий ряд высотой 96 — служебные ячейки
    misc = [
        ('glow', 48, lambda w, h: opt.cell_glow(h, 16)[:, :w]),
        ('gauge', 96, lambda w, h: opt.cell_gauge(h, 23)),
        ('water', 96, lambda w, h: cell_water(h, 301)),
        ('flowers', 96, lambda w, h: cell_flowers(h, 303)),
        ('bronze', 64, lambda w, h: opt.cell_bronze(h, 22)[:, :w]),
        ('window', 64, lambda w, h: cell_window(w, h, 307)),
        ('door', 64, lambda w, h: cell_door(w, h, 309)),
        ('banner', 64, lambda w, h: cell_banner(w, h, 311)),
        ('crate', 96, lambda w, h: cell_crate(h, 313)),
        ('dark', 32, lambda w, h: opt.cell_dark(h, 15)[:, :w]),
    ]
    MH = 96
    # служебный ряд начинается после последнего ряда гербов, с x последнего герба
    mrow = row_y
    mx = x
    hrow = SIZE - mrow
    for name, wpx, gen in misc:
        if mx + wpx > SIZE:
            raise SystemExit('служебные ячейки не влезли: ' + name)
        put_cell(name, mx, mrow, wpx, min(MH, hrow), gen)
        mx += wpx
    # палитра 24×24 в оставшемся углу
    SW = 24
    px0 = mx
    cols_n = (SIZE - px0) // SW
    rows_n = min(MH, hrow) // SW
    if cols_n * rows_n < len(PALETTE):
        raise SystemExit('палитра не влезла: %d мест, нужно %d' % (cols_n * rows_n, len(PALETTE)))
    for i, (name, hexc) in enumerate(PALETTE):
        cx = px0 + (i % cols_n) * SW
        cy = mrow + (i // cols_n) * SW
        put_cell('pal_' + name, cx, cy, SW, SW, lambda w, h, c=hexc, s=i: cell_swatch(h, c, 700 + s))
    if mrow + min(MH, hrow) > SIZE:
        raise SystemExit('атлас переполнен по высоте')
    print('[atlas] полосы до %d px, гербы до %d, служебный ряд %d..%d, палитра %d×%d' % (strips_end, row_y + E, mrow, mrow + MH, cols_n, rows_n))

    img = Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')
    os.makedirs(os.path.dirname(OUT_TEX), exist_ok=True)
    img.save(OUT_TEX, 'WEBP', quality=82, method=6)
    with open(OUT_LAYOUT, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)
    print('[atlas] ->', OUT_TEX, os.path.getsize(OUT_TEX), 'bytes')
    if '--preview' in sys.argv:
        img.save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
