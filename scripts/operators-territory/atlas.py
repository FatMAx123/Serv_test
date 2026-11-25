# ============================================================
#  SCRIPTS / OPERATORS-TERRITORY / ATLAS.PY
#  Территория операторов: один общий атлас текстур на всю локацию.
#
#  Техника — как в L2: только diffuse, свет и грязь нарисованы в самой текстуре
#  (без normal/specular карт), камень тайлится, детали — отдельными ячейками.
#  Атлас устроен как trim sheet: горизонтальные полосы бесшовно повторяются по U
#  (RepeatWrapping), поэтому одна полоса закрывает стену любой длины, а по высоте
#  стену режут на «ленты» под высоту полосы (это делает build_kit.py).
#  Плотность у всех полос одна: 128 px на метр (1.0 по U = 8 м).
#
#  Выход:
#    client/assets/props/textures/opt_atlas.webp   (1024×1024, WebP q82)
#    scripts/operators-territory/atlas-layout.json (полосы и ячейки в UV Blender)
#
#  Запуск: python scripts/operators-territory/atlas.py
#  Всё процедурное и своё: ни одного чужого пикселя, лицензий не требуется.
# ============================================================
import json
import math
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_TEX = os.path.join(ROOT, 'client', 'assets', 'props', 'textures', 'opt_atlas.webp')
OUT_LAYOUT = os.path.join(os.path.dirname(__file__), 'atlas-layout.json')

SIZE = 1024
PX_PER_M = 128.0
GUTTER = 4          # пиксели запаса сверху и снизу полосы (против протекания мипов)

rng_master = np.random.default_rng(20261125)


# ------------------------------------------------------------
#  Бесшовный шум (FFT-фильтрованный белый шум периодичен по обеим осям)
# ------------------------------------------------------------
def pnoise(h, w, beta=2.0, seed=0, lo_cut=2.0):
    r = np.random.default_rng(seed)
    white = r.standard_normal((h, w))
    f = np.fft.fft2(white)
    # частоты в циклах на 1024 px по ОБЕИМ осям — иначе в узкой полосе шум
    # вытягивается вдоль U (полосы «как дерево» на камне)
    fy = np.fft.fftfreq(h)[:, None] * 1024.0
    fx = np.fft.fftfreq(w)[None, :] * 1024.0
    k = np.sqrt(fx * fx + fy * fy)
    k[0, 0] = 1.0
    amp = 1.0 / np.power(np.maximum(k, lo_cut), beta / 2.0)
    amp[0, 0] = 0.0
    out = np.real(np.fft.ifft2(f * amp))
    out -= out.min()
    out /= max(1e-9, out.max())
    return out


def blur_wrap(a, radius):
    """Гауссово размытие с заворотом краёв (сохраняет бесшовность)."""
    if radius <= 0:
        return a
    h, w = a.shape[:2]
    pad = int(radius * 3) + 1
    if a.ndim == 2:
        big = np.pad(a, ((pad, pad), (pad, pad)), mode='wrap')
        img = Image.fromarray(np.clip(big * 255, 0, 255).astype(np.uint8), 'L')
        img = img.filter(ImageFilter.GaussianBlur(radius))
        res = np.asarray(img).astype(np.float32) / 255.0
        return res[pad:pad + h, pad:pad + w]
    return np.stack([blur_wrap(a[..., c], radius) for c in range(a.shape[2])], axis=-1)


def lerp(a, b, t):
    # цвет (3,) и маска (h, w) → (h, w, 3)
    if isinstance(t, np.ndarray) and np.ndim(a) == 1 and t.ndim == 2:
        t = t[..., None]
    return a + (b - a) * t


def col(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def tint(base, amount):
    """Плоский цвет (h, w, 3) с яркостной модуляцией."""
    return base[None, None, :] * amount[..., None]


# ------------------------------------------------------------
#  Кладка: прямоугольные блоки с раствором, нарисованным светом сверху-слева
# ------------------------------------------------------------
def masonry(h, w, course_h, min_w, max_w, seed, mortar=3, bevel=5, jitter=0.0):
    """Возвращает (block_id, edge_light, edge_dark, mortar_mask, per_block_rand)."""
    r = np.random.default_rng(seed)
    ids = np.zeros((h, w), dtype=np.int32)
    light = np.zeros((h, w), dtype=np.float32)
    dark = np.zeros((h, w), dtype=np.float32)
    mort = np.zeros((h, w), dtype=np.float32)
    rand_val = []
    yy, xx = np.mgrid[0:h, 0:w]
    n_courses = int(round(h / course_h))
    bid = 0
    for c in range(n_courses):
        y0 = int(round(c * h / n_courses))
        y1 = int(round((c + 1) * h / n_courses))
        # ширины блоков, сумма = w (бесшовно по U)
        widths = []
        total = 0
        while total < w:
            bw = int(r.integers(min_w, max_w + 1))
            widths.append(bw)
            total += bw
        scale = w / float(total)
        xs = [0]
        for bw in widths:
            xs.append(xs[-1] + bw * scale)
        offset = r.uniform(0, w)
        for i in range(len(widths)):
            a = xs[i] + offset
            b = xs[i + 1] + offset
            # маска блока с заворотом по X
            xa = (xx[y0:y1] - a) % w
            inside = xa < (b - a)
            dx_left = xa
            dx_right = (b - a) - xa
            dy_top = yy[y0:y1] - y0
            dy_bot = (y1 - 1) - yy[y0:y1]
            sub_ids = ids[y0:y1]
            sub_ids[inside] = bid
            # кромки: светлая сверху/слева, тёмная снизу/справа
            dl = np.minimum(dx_left, dy_top)
            dd = np.minimum(dx_right, dy_bot)
            lmask = inside & (dl < bevel + mortar)
            dmask = inside & (dd < bevel + mortar)
            sl = light[y0:y1]
            sd = dark[y0:y1]
            sl[lmask] = np.maximum(sl[lmask], 1.0 - np.clip((dl[lmask] - mortar) / bevel, 0, 1))
            sd[dmask] = np.maximum(sd[dmask], 1.0 - np.clip((dd[dmask] - mortar) / bevel, 0, 1))
            sm = mort[y0:y1]
            mm = inside & ((dx_left < mortar) | (dx_right < mortar) | (dy_top < mortar) | (dy_bot < mortar))
            sm[mm] = 1.0
            rand_val.append(r.uniform(0, 1))
            bid += 1
    return ids, light, dark, mort, np.array(rand_val, dtype=np.float32)


def stone_strip(h, w, seed, base_hex, var_hexes, course_h, min_w, max_w,
                moss=0.0, cracks=0.0, grime=0.35, bevel=6, mortar=3):
    ids, light, dark, mort, rv = masonry(h, w, course_h, min_w, max_w, seed, mortar=mortar, bevel=bevel)
    n1 = pnoise(h, w, 2.2, seed + 1)
    n2 = pnoise(h, w, 1.2, seed + 2)
    n3 = pnoise(h, w, 2.8, seed + 3)
    # сколы кромок: шум «съедает» блок у края — раствор становится неровным
    chip = pnoise(h, w, 1.0, seed + 4)
    edge_zone = np.clip(1.0 - np.minimum(light, 1.0) * 0 - 0, 0, 1)
    near_edge = np.maximum(light, dark)
    chipped = (near_edge > 0.35) & (chip > 0.62)
    mort = np.maximum(mort, chipped.astype(np.float32) * 0.85)
    base = col(base_hex)
    variants = [col(c) for c in var_hexes]
    out = np.zeros((h, w, 3), dtype=np.float32)
    per = rv[ids]
    # цвет блока: смесь базового и одного из вариантов
    vi = (per * len(variants)).astype(np.int32) % len(variants)
    vcol = np.stack([variants[i] for i in range(len(variants))])[vi]
    mix = (np.random.default_rng(seed + 9).uniform(0.25, 0.85, size=len(rv)))[ids]
    out[:] = base[None, None, :] * (1 - mix[..., None]) + vcol * mix[..., None]
    # яркость блока гуляет ±12% — кладка не выглядит штампом
    bright = (np.random.default_rng(seed + 10).uniform(0.88, 1.12, size=len(rv)))[ids]
    out *= bright[..., None]
    # фактура камня + крупные пятна на 8 м (ломают повтор)
    big = pnoise(h, w, 3.2, seed + 12, lo_cut=1.0)
    tex = 0.78 + 0.20 * n1 + 0.14 * (n2 - 0.5) + 0.10 * (n3 - 0.5) + 0.12 * (big - 0.5)
    out *= tex[..., None]
    # объём блока: лёгкий градиент сверху вниз внутри курса (нарисованный свет)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    course = (yy % course_h) / course_h
    out *= (1.06 - 0.12 * course)[..., None]
    # кромки
    out = out * (1 + 0.28 * light[..., None]) * (1 - 0.38 * dark[..., None])
    # раствор
    mcol = base * 0.42
    out = out * (1 - mort[..., None]) + mcol[None, None, :] * (0.85 + 0.3 * n3[..., None]) * mort[..., None]
    # грязь в швах и пятна
    stains = np.clip((pnoise(h, w, 2.0, seed + 5) - 0.55) * 3.0, 0, 1)
    out *= (1 - grime * 0.45 * stains)[..., None]
    if cracks > 0:
        cr = pnoise(h, w, 1.6, seed + 7)
        line = np.exp(-((cr - 0.5) ** 2) / 0.00012)
        line *= np.clip((pnoise(h, w, 2.0, seed + 8) - 0.45) * 4, 0, 1)
        out *= (1 - cracks * 0.55 * line)[..., None]
    if moss > 0:
        m = pnoise(h, w, 2.4, seed + 11)
        # мох сидит на верхних кромках блоков и в швах
        top_bias = np.clip(1.0 - course * 2.2, 0, 1)
        mask = np.clip((m - 0.48) * 4.0, 0, 1) * np.clip(top_bias * 0.8 + mort * 0.8 + 0.15, 0, 1)
        mcol2 = lerp(col('#4b6a2c'), col('#6f8a3a'), n2)
        out = out * (1 - moss * mask[..., None]) + mcol2 * (moss * mask[..., None]) * (0.75 + 0.35 * n1[..., None])
    return np.clip(out, 0, 1)


def flutes_strip(h, w, seed, n_flutes):
    n1 = pnoise(h, w, 2.4, seed + 1)
    n2 = pnoise(h, w, 1.4, seed + 2)
    xx = np.mgrid[0:h, 0:w][1].astype(np.float32)
    ph = (xx / w * n_flutes) % 1.0
    # профиль каннелюры: вогнутость с тенью справа и светом слева
    groove = np.sin(ph * math.pi)          # 0 на ребре, 1 в центре канавки
    shade = 0.80 + 0.30 * np.cos(ph * 2 * math.pi + 0.9)
    fillet = (np.minimum(ph, 1 - ph) < 0.06).astype(np.float32)
    base = lerp(col('#c9bea6'), col('#ddd3bb'), n2)
    out = base * (0.82 + 0.18 * n1[..., None])
    out *= (shade * (0.92 + 0.08 * (1 - groove)))[..., None]
    out *= (1 + 0.16 * fillet)[..., None]
    stains = np.clip((pnoise(h, w, 1.8, seed + 5) - 0.6) * 3.0, 0, 1)
    out *= (1 - 0.25 * stains)[..., None]
    return np.clip(out, 0, 1)


def slate_strip(h, w, seed, rows):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w, 3), dtype=np.float32)
    n1 = pnoise(h, w, 2.4, seed + 1)
    n2 = pnoise(h, w, 1.2, seed + 2)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    row_h = h / rows
    base = col('#4a5868')
    alt = col('#5c6a78')
    green = col('#5d7a6c')
    for k in range(rows):
        y0 = k * row_h
        tile_w = w / 32.0
        off = (k % 2) * tile_w * 0.5
        u = ((xx - off) % w) / tile_w
        ti = np.floor(u).astype(np.int32)
        fu = u - ti
        fy = (yy - y0) / row_h
        inrow = (fy >= 0) & (fy < 1)
        # закруглённый низ чешуйки
        edge = np.sqrt(np.clip(1 - ((fu - 0.5) * 2) ** 2, 0, 1))
        bottom = 0.72 + 0.28 * edge
        tile_mask = inrow & (fy < bottom)
        rv = np.random.default_rng(seed + k).uniform(0, 1, size=40)
        vv = rv[ti % 40]
        c = base[None, None, :] * (1 - vv[..., None] * 0.6) + alt[None, None, :] * (vv[..., None] * 0.6)
        c = c * (1.12 - 0.35 * fy[..., None])          # каждая чешуйка темнеет к низу
        side = np.minimum(fu, 1 - fu)
        c *= (0.78 + 0.22 * np.clip(side * 8, 0, 1))[..., None]
        gm = np.clip((n2 - 0.62) * 3, 0, 1)
        c = c * (1 - 0.45 * gm[..., None]) + green * 0.45 * gm[..., None]
        out[tile_mask] = c[tile_mask]
        # тень под нижней кромкой ряда выше
        shadow = inrow & (fy >= bottom)
        out[shadow] = (base * 0.35)[None, :]
    out *= (0.86 + 0.2 * n1)[..., None]
    return np.clip(out, 0, 1)


def brass_strip(h, w, seed):
    n1 = pnoise(h, w, 2.2, seed + 1)
    n2 = pnoise(h, w, 1.3, seed + 2)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fy = yy / (h - 1)
    base = lerp(col('#a2742e'), col('#c99a45'), n2)
    # выпуклая полоса: блик в верхней трети, тень у краёв
    prof = 0.72 + 0.45 * np.exp(-((fy - 0.33) ** 2) / 0.02) - 0.25 * (np.abs(fy - 0.5) > 0.42)
    out = base * (prof * (0.85 + 0.2 * n1))[..., None]
    # заклёпки
    pitch = w / 24.0
    cx = (np.floor(xx / pitch) + 0.5) * pitch
    d = np.sqrt((xx - cx) ** 2 + ((yy - h * 0.5) * 1.0) ** 2)
    rv = h * 0.16
    rivet = d < rv
    hl = np.clip(1 - np.sqrt((xx - cx + rv * 0.35) ** 2 + (yy - h * 0.5 + rv * 0.35) ** 2) / rv, 0, 1)
    out[rivet] = (lerp(col('#8a6024'), col('#f2d18a'), hl[..., None]))[rivet]
    ring = (d >= rv) & (d < rv + 1.6)
    out[ring] *= 0.55
    # патина
    pat = np.clip((pnoise(h, w, 2.0, seed + 5) - 0.6) * 3.0, 0, 1)
    out = out * (1 - 0.5 * pat[..., None]) + col('#4e8a74') * 0.5 * pat[..., None]
    return np.clip(out, 0, 1)


def iron_strip(h, w, seed):
    n1 = pnoise(h, w, 2.2, seed + 1)
    n2 = pnoise(h, w, 1.4, seed + 2)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = lerp(col('#3a3d42'), col('#4c4f55'), n2)
    out = base * (0.82 + 0.3 * n1)[..., None]
    plate_w = w / 8.0
    u = (xx % plate_w)
    seam = (u < 2) | (u > plate_w - 2)
    out[seam] *= 0.45
    hl = (u >= 2) & (u < 5)
    out[hl] *= 1.25
    # заклёпки по краям плит и сверху/снизу
    pitch = h / 4.0
    for cxp in (6.0, plate_w - 6.0):
        cx = np.floor(xx / plate_w) * plate_w + cxp
        cy = (np.floor(yy / pitch) + 0.5) * pitch
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        m = d < 2.6
        out[m] = (col('#9a9ea4') * (1.15 - d[m][:, None] / 3.0))
    for cyp in (5.0, h - 5.0):
        cx = (np.floor(xx / 12.0) + 0.5) * 12.0
        d = np.sqrt((xx - cx) ** 2 + (yy - cyp) ** 2)
        m = d < 2.2
        out[m] = (col('#9a9ea4') * (1.1 - d[m][:, None] / 3.0))
    # ржавые потёки вниз
    rust = pnoise(h, w, 1.6, seed + 6)
    streak = blur_wrap(np.clip((rust - 0.62) * 3, 0, 1), 1.0)
    streak = np.clip(streak * (0.4 + 0.8 * (yy / h)), 0, 1)
    out = out * (1 - 0.6 * streak[..., None]) + col('#7a4424') * 0.6 * streak[..., None]
    return np.clip(out, 0, 1)


def wood_strip(h, w, seed):
    n1 = pnoise(h, w, 2.0, seed + 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    plank_h = h / 2.0
    k = np.floor(yy / plank_h)
    fy = (yy % plank_h) / plank_h
    grain = np.sin((yy * 0.9 + 6 * np.sin(xx / w * 2 * math.pi * 3 + k * 1.7) + n1 * 14) * 1.4) * 0.5 + 0.5
    base = lerp(col('#4a3320'), col('#6b4a2c'), grain[..., None] * 0.6 + 0.2)
    out = base * (1.08 - 0.25 * np.abs(fy - 0.45))[..., None]
    gap = (fy < 0.06) | (fy > 0.95)
    out[gap] *= 0.4
    return np.clip(out, 0, 1)


def frieze_strip(h, w, seed):
    """Карниз: валик сверху, полка, ряд шестерёнок-розеток, валик снизу."""
    n1 = pnoise(h, w, 2.4, seed + 1)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fy = yy / (h - 1)
    base = col('#cbbfa4') * (0.84 + 0.2 * n1)[..., None]
    out = base.copy()
    # валики
    for c0, c1 in ((0.0, 0.18), (0.82, 1.0)):
        m = (fy >= c0) & (fy < c1)
        t = (fy - c0) / (c1 - c0)
        out[m] *= (0.75 + 0.45 * np.sin(t[m] * math.pi))[:, None]
    # розетки-шестерни
    pitch = w / 16.0
    cx = (np.floor(xx / pitch) + 0.5) * pitch
    cy = h * 0.5
    dx = xx - cx
    dy = yy - cy
    d = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    rad = h * 0.27 * (1 + 0.14 * (np.cos(ang * 8) > 0.2))
    gear = d < rad
    hl = np.clip(-(dx + dy) / (rad + 1e-3), -1, 1)
    out[gear] = (col('#d8ccb0') * (0.9 + 0.25 * hl[..., None]))[gear]
    hub = d < h * 0.09
    out[hub] *= 0.55
    rim = (d >= rad) & (d < rad + 1.5)
    out[rim] *= 0.6
    return np.clip(out, 0, 1)


def flag_strip(h, w, seed):
    """Плиты мощения: неровные прямоугольники, швы с землёй и травой."""
    r = np.random.default_rng(seed)
    ids, light, dark, mort, rv = masonry(h, w, h / 2.0, 60, 150, seed, mortar=3, bevel=5)
    n1 = pnoise(h, w, 2.2, seed + 1)
    n2 = pnoise(h, w, 1.3, seed + 2)
    base = lerp(col('#a49a86'), col('#bdb39c'), rv[ids][..., None])
    out = base * (0.82 + 0.25 * n1)[..., None]
    out = out * (1 + 0.18 * light[..., None]) * (1 - 0.3 * dark[..., None])
    soil = lerp(col('#4f4330'), col('#4f6a2e'), np.clip((n2 - 0.4) * 2, 0, 1)[..., None])
    out = out * (1 - mort[..., None]) + soil * mort[..., None]
    stains = np.clip((pnoise(h, w, 2.0, seed + 5) - 0.55) * 3.0, 0, 1)
    out *= (1 - 0.3 * stains)[..., None]
    return np.clip(out, 0, 1)


# ------------------------------------------------------------
#  Ячейки-декали (не тайлятся)
# ------------------------------------------------------------
def cell_gear_window(s, seed):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2.0
    dx, dy = xx - c, yy - c
    d = np.sqrt(dx * dx + dy * dy) / c
    ang = np.arctan2(dy, dx)
    stone = col('#bfb398') * (0.85 + 0.2 * pnoise(s, s, 2.2, seed)[..., None])
    out = stone.copy()
    # каменное кольцо
    ring = (d > 0.80) & (d <= 1.0)
    out[ring] *= (0.85 + 0.25 * np.cos(ang[ring] + 2.3))[:, None]
    # витраж: тёплое стекло
    glass = d <= 0.80
    gcol = lerp(col('#f2b04a'), col('#7a3a14'), np.clip(d, 0, 1)[..., None])
    out[glass] = gcol[glass]
    # латунные спицы и зубчатый обод
    spokes = (np.abs(np.sin(ang * 4)) < 0.10) & (d < 0.78) & (d > 0.16)
    teeth_r = 0.78 + 0.05 * (np.cos(ang * 16) > 0)
    rim = (d > 0.70) & (d < teeth_r)
    hub = d < 0.18
    brass = col('#b58a3c') * (0.8 + 0.35 * np.clip(-(dx + dy) / c, -1, 1))[..., None]
    for m in (spokes, rim, hub):
        out[m] = brass[m]
    return np.clip(out, 0, 1)


def cell_arch_window(wpx, hpx, seed):
    yy, xx = np.mgrid[0:hpx, 0:wpx].astype(np.float32)
    stone = col('#bfb398') * (0.85 + 0.2 * pnoise(hpx, wpx, 2.2, seed)[..., None])
    out = stone.copy()
    cx = (wpx - 1) / 2.0
    r = wpx * 0.40
    top = r + wpx * 0.10
    inside = (np.abs(xx - cx) < r) & (yy > top - r * 0.0)
    arch = np.sqrt((xx - cx) ** 2 + (yy - top) ** 2) < r
    opening = (inside | arch) & (yy < hpx - wpx * 0.12)
    fy = yy / hpx
    glass = lerp(col('#e2a447'), col('#5a2a10'), np.clip(fy * 1.1, 0, 1)[..., None])
    out[opening] = glass[opening]
    # переплёт
    mull = opening & ((np.abs(xx - cx) < 1.2) | (np.abs((yy - top) % (hpx * 0.18)) < 1.0))
    out[mull] = col('#2c2620')
    # откос: тень слева/сверху внутри проёма
    edge = opening & ((np.abs(xx - cx) > r - 2.5))
    out[edge] *= 0.6
    return np.clip(out, 0, 1)


def cell_emblem(s, seed):
    """Герб операторов: красный щит, молот и шестерня (своё, не L2)."""
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2.0
    out = np.zeros((s, s, 3), dtype=np.float32)
    cloth = lerp(col('#7a1a16'), col('#a42a20'), pnoise(s, s, 2.0, seed)[..., None])
    out[:] = cloth
    # кайма
    border = (xx < 4) | (xx > s - 5) | (yy < 4) | (yy > s - 5)
    out[border] = col('#c79a44')
    dx, dy = xx - c, yy - c * 0.95
    d = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    gear_r = s * 0.30 * (1 + 0.13 * (np.cos(ang * 10) > 0.1))
    gear = (d < gear_r) & (d > s * 0.17)
    out[gear] = col('#d9b25c')
    hub = d < s * 0.08
    out[hub] = col('#d9b25c')
    # молот: рукоять по диагонали и боёк
    t = (dx - dy) / math.sqrt(2)
    n = (dx + dy) / math.sqrt(2)
    handle = (np.abs(n) < s * 0.035) & (np.abs(t) < s * 0.36)
    head = (np.abs(t + s * 0.27) < s * 0.07) & (np.abs(n) < s * 0.16)
    out[handle] = col('#3a2a1c')
    out[head] = col('#9aa0a6')
    return np.clip(out, 0, 1)


def cell_gate(s, seed):
    """Ворота: двойная окованная дверь под аркой (своё)."""
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    stone = col('#b9ad92') * (0.85 + 0.2 * pnoise(s, s, 2.2, seed)[..., None])
    out = stone.copy()
    cx = (s - 1) / 2.0
    r = s * 0.40
    top = r + s * 0.06
    rect = (np.abs(xx - cx) < r) & (yy > top)
    arch = np.sqrt((xx - cx) ** 2 + (yy - top) ** 2) < r
    door = rect | arch
    wood = lerp(col('#3a2616'), col('#5a3a20'), (np.sin(xx * 1.3 + pnoise(s, s, 1.5, seed + 3) * 6) * 0.5 + 0.5)[..., None])
    out[door] = wood[door]
    # оковка: горизонтальные полосы и центральный шов
    bands = door & (np.abs(((yy - top) % (s * 0.22)) - s * 0.11) > s * 0.085)
    out[bands] = col('#3d4046')
    seam = door & (np.abs(xx - cx) < 1.5)
    out[seam] = col('#1e1a16')
    # латунные кольца-ручки
    for sx in (-1, 1):
        d = np.sqrt((xx - cx - sx * s * 0.09) ** 2 + (yy - s * 0.62) ** 2)
        ring = (d > s * 0.035) & (d < s * 0.055)
        out[ring] = col('#c79a44')
    # клинчатые камни арки
    vous = (np.sqrt((xx - cx) ** 2 + (yy - top) ** 2) >= r) & (np.sqrt((xx - cx) ** 2 + (yy - top) ** 2) < r + s * 0.07) & (yy < top + 1)
    ang = np.arctan2(yy - top, xx - cx)
    out[vous] *= (0.82 + 0.25 * (np.abs(np.sin(ang[vous] * 9)) > 0.15))[:, None]
    return np.clip(out, 0, 1)


def cell_dark(s, seed):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    n = pnoise(s, s, 2.0, seed)
    out = lerp(col('#1a1612'), col('#3a3026'), (n * 0.6 + (yy / s) * 0.4)[..., None])
    return np.clip(out, 0, 1)


def cell_glow(s, seed):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    c = (s - 1) / 2.0
    d = np.sqrt((xx - c) ** 2 + (yy - c) ** 2) / c
    out = lerp(col('#fff2c4'), col('#e07a1c'), np.clip(d, 0, 1)[..., None])
    return np.clip(out, 0, 1)


def cell_rough(s, seed):
    """Свежий скол камня (верх сломанных колонн)."""
    n1 = pnoise(s, s, 2.6, seed)
    n2 = pnoise(s, s, 1.5, seed + 1)
    out = lerp(col('#a89e88'), col('#d4cab2'), n1[..., None]) * (0.8 + 0.3 * n2[..., None])
    return np.clip(out, 0, 1)


def cell_plaque(s, seed):
    """Бронзовая мемориальная плита Монумента Героя (без магии и религии)."""
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    n = pnoise(s, s, 1.9, seed)
    out = lerp(col('#3d3222'), col('#665232'), n[..., None])
    b = max(3, int(s * 0.08))
    frame = (xx < b) | (xx >= s - b) | (yy < b) | (yy >= s - b)
    out[frame] = col('#b89242') * (0.85 + 0.25 * n[frame][..., None])
    # Клепки по рамке
    for rx in (b // 2, s - b // 2 - 1):
        for ry in range(b, s - b + 1, max(8, s // 5)):
            d = np.sqrt((xx - rx) ** 2 + (yy - ry) ** 2)
            out[d < 2.2] = col('#e0be6e')
    # Гравёрные строки и эмблема-шестерня вверху
    cx = (s - 1) / 2.0
    d_cog = np.sqrt((xx - cx) ** 2 + (yy - s * 0.28) ** 2)
    ang = np.arctan2(yy - s * 0.28, xx - cx)
    ring = (d_cog > s * 0.08) & (d_cog < s * 0.14 * (1 + 0.15 * (np.cos(ang * 8) > 0)))
    out[ring] = col('#c8a24a')
    for row_y in (0.48, 0.60, 0.72, 0.82):
        line = (np.abs(yy - s * row_y) < 2.0) & (np.abs(xx - cx) < s * 0.30)
        out[line] = col('#a88740')
    return np.clip(out, 0, 1)


def cell_plaster(s, seed):
    """Тёплая интерьерная кладка/штукатурка с деревянной нижней панелью."""
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    n1 = pnoise(s, s, 2.2, seed)
    n2 = pnoise(s, s, 1.4, seed + 2)
    wall_c = lerp(col('#9c907b'), col('#b7aa92'), n1[..., None]) * (0.88 + 0.18 * n2[..., None])
    wainscot = yy > s * 0.72
    plank = col('#523922') * (0.85 + 0.25 * np.sin(xx * 0.45 + n2 * 3.0)[..., None] * 0.5)
    out = np.where(wainscot[..., None], plank, wall_c)
    rail = np.abs(yy - s * 0.72) < 2.2
    out[rail] = col('#3a2716')
    return np.clip(out, 0, 1)


def cell_tile_floor(s, seed):
    """Шлифованные каменные плиты зала Бастиона с латунными стыками."""
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    n = pnoise(s, s, 2.1, seed)
    half = s / 2.0
    chk = (((xx // half) + (yy // half)) % 2) > 0.5
    base = np.where(chk[..., None], col('#8a8272'), col('#746d5f'))
    out = base * (0.88 + 0.22 * n[..., None])
    seam = (np.abs(xx % half) < 1.6) | (np.abs(yy % half) < 1.6)
    out[seam] = col('#4c4438')
    return np.clip(out, 0, 1)


def cell_bronze(s, seed):
    """Патинированная бронза статуи Героя и паровых доспехов."""
    n1 = pnoise(s, s, 2.0, seed)
    n2 = pnoise(s, s, 1.5, seed + 4)
    out = lerp(col('#52402b'), col('#8f6f44'), n1[..., None])
    pat = n2 > 0.65
    out[pat] = lerp(out[pat], col('#4a6658'), 0.35)
    return np.clip(out, 0, 1)


# ------------------------------------------------------------
#  Сборка атласа
# ------------------------------------------------------------
def main():
    atlas = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    layout = {'size': SIZE, 'pxPerM': PX_PER_M, 'uSpanM': SIZE / PX_PER_M, 'strips': {}, 'cells': {}}

    def put_strip(name, y0, y1, gen):
        """Полоса y0..y1 (строки картинки сверху вниз). Содержимое тайлится по
        вертикали, поэтому запас сверху/снизу — продолжение того же рисунка."""
        h = y1 - y0
        content = h - 2 * GUTTER
        tile = gen(content)
        full = np.concatenate([tile[-GUTTER:], tile, tile[:GUTTER]], axis=0)
        atlas[y0:y1] = full
        # UV Blender: v растёт снизу вверх
        v_top = 1.0 - (y0 + GUTTER) / SIZE
        v_bot = 1.0 - (y1 - GUTTER) / SIZE
        layout['strips'][name] = {'v0': v_bot, 'v1': v_top, 'heightM': content / PX_PER_M, 'px': [y0, y1]}

    put_strip('stone', 0, 224, lambda h: stone_strip(h, SIZE, 101, '#c2b59a', ['#cfc3a6', '#b3a68b', '#c8b48e', '#aaa290'], 72, 120, 230, cracks=0.4, grime=0.35, bevel=7))
    put_strip('ruin', 224, 384, lambda h: stone_strip(h, SIZE, 202, '#9f9a8a', ['#8f8a7a', '#aaa38f', '#958d78', '#7f7c70'], 76, 110, 210, moss=0.75, cracks=0.9, grime=0.6, bevel=6))
    put_strip('flutes', 384, 480, lambda h: flutes_strip(h, SIZE, 303, 24))
    put_strip('slate', 480, 608, lambda h: slate_strip(h, SIZE, 404, 4))
    put_strip('brass', 608, 656, lambda h: brass_strip(h, SIZE, 505))
    put_strip('iron', 656, 736, lambda h: iron_strip(h, SIZE, 606))
    put_strip('wood', 736, 784, lambda h: wood_strip(h, SIZE, 707))
    put_strip('frieze', 784, 832, lambda h: frieze_strip(h, SIZE, 808))
    put_strip('flag', 832, 928, lambda h: flag_strip(h, SIZE, 909))

    # Ряд ячеек 96 px: (имя, ширина, генератор)
    y0, y1 = 928, 1024
    cells = [
        ('gear_window', 96, lambda w, h: cell_gear_window(h, 11)),
        ('arch_window', 48, lambda w, h: cell_arch_window(w, h, 12)),
        ('gate', 96, lambda w, h: cell_gate(h, 13)),
        ('emblem', 96, lambda w, h: cell_emblem(h, 14)),
        ('dark', 48, lambda w, h: cell_dark(h, 15)[:, :w]),
        ('glow', 48, lambda w, h: cell_glow(h, 16)[:, :w]),
        ('rough', 96, lambda w, h: cell_rough(h, 17)),
        ('plaque', 96, lambda w, h: cell_plaque(h, 19)),
        ('plaster', 96, lambda w, h: cell_plaster(h, 20)),
        ('tile_floor', 96, lambda w, h: cell_tile_floor(h, 21)),
        ('bronze', 96, lambda w, h: cell_bronze(h, 22)),
    ]
    x = 0
    for name, wpx, gen in cells:
        cw = wpx - 2 * GUTTER
        chh = (y1 - y0) - 2 * GUTTER
        img = gen(cw, chh)
        # запас вокруг ячейки = растянутый край (без протекания соседей)
        full = np.pad(img, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge')
        atlas[y0:y1, x:x + wpx] = full
        layout['cells'][name] = {
            'u0': (x + GUTTER) / SIZE, 'u1': (x + wpx - GUTTER) / SIZE,
            'v0': 1.0 - (y1 - GUTTER) / SIZE, 'v1': 1.0 - (y0 + GUTTER) / SIZE,
            'px': [x, y0, wpx, y1 - y0]
        }
        x += wpx
    # остаток ряда — тот же скол камня (не пустота)
    if x < SIZE:
        rest = cell_rough(SIZE - x, 18)
        atlas[y0:y1, x:SIZE] = np.resize(rest, (y1 - y0, SIZE - x, 3))

    img = Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')
    os.makedirs(os.path.dirname(OUT_TEX), exist_ok=True)
    img.save(OUT_TEX, 'WEBP', quality=82, method=6)
    with open(OUT_LAYOUT, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)
    print('atlas ->', OUT_TEX, os.path.getsize(OUT_TEX), 'bytes')
    print('layout ->', OUT_LAYOUT)


if __name__ == '__main__':
    main()
