# ============================================================
#  build_woman_faces.py — варианты лица женского Engineer (атлас Main.webp)
#
#  Запуск: python scripts/build_woman_faces.py
#  Вход:  Woman/Textures/Main.webp (2048, лицо в патче 220×250 @ x200 y380)
#  Выход: Woman/Textures/Main_face2.webp — «Сапфир & смоки» (синие глаза, ягодные губы)
#         Woman/Textures/Main_face3.webp — «Изумруд & рубин» (зелёные глаза, рубиновые губы)
#  face1 = сам Main.webp. Алгоритм и параметры — как в шоуруме
#  (applyFaceCustomization): радужка перекрашивается с сохранением зрачка и
#  бликов, губы — по цветовому признаку губ с плавным краем. В игре лицо —
#  готовая текстура, общая для всех игроков с этим лицом (без canvas на игрока).
# ============================================================
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(os.path.dirname(HERE), 'client', 'assets', 'Characters', 'engi', 'Woman', 'Textures')
PATCH = (200, 380, 220, 250)          # x, y, w, h в пикселях атласа 2048
EYES = [(158, 56), (158, 204)]        # центры радужек в патче
R_IRIS = 20.5
LIP_C, LIP_R = (49.0, 130.0), (13.5, 35.0)
PRESETS = {
    'Main_face2.webp': dict(eye=(0.58, 0.85, 0.95), lip=(0.94, 0.80, 0.85), lip_k=0.80),
    'Main_face3.webp': dict(eye=(0.36, 0.85, 0.95), lip=(0.995, 0.88, 0.88), lip_k=0.85),
}
QUALITY = 88


def rgb_to_hsv(rgb):
    r, g, b = [rgb[..., i] / 255.0 for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b); d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-9
    rm = nz & (mx == r); gm = nz & (mx == g) & ~rm; bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h / 6.0
    s = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    choices = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    out = np.zeros(h.shape + (3,))
    for k, (a, b, c) in enumerate(choices):
        m = i == k
        out[m, 0], out[m, 1], out[m, 2] = a[m], b[m], c[m]
    return np.round(out * 255)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def recolor(patch, eye, lip, lip_k):
    out = patch.astype(np.float64)
    hgt, wid = patch.shape[:2]
    yy, xx = np.mgrid[0:hgt, 0:wid].astype(np.float64)
    h, s, v = rgb_to_hsv(patch.astype(np.float64))
    # 1. радужка: зрачок (тёмное) и блики (светлое ненасыщенное) не трогаем
    for cx, cy in EYES:
        dist = np.hypot(xx - cx, yy - cy)
        m = (dist <= R_IRIS) & ~((v < 0.14) | ((v > 0.85) & (s < 0.30)))
        fv = np.minimum(1.0, eye[2] * (0.35 + 0.65 * (v / 0.65)))
        nrgb = hsv_to_rgb(np.full_like(v, eye[0]), np.full_like(v, eye[1]), fv)
        feather = np.clip((R_IRIS - dist) / 1.5, 0, 1)[..., None] * m[..., None]
        out = (1 - feather) * out + feather * nrgb
    # 2. губы: краснее кожи (ниже g/r, больше r-g), мягкий эллипс
    r, g = patch[..., 0].astype(np.float64), patch[..., 1].astype(np.float64)
    d = np.hypot((xx - LIP_C[0]) / LIP_R[0], (yy - LIP_C[1]) / LIP_R[1])
    weight = smoothstep(0.70, 0.63, g / np.maximum(1, r)) * smoothstep(58.0, 70.0, r - g) * smoothstep(1.0, 0.75, d)
    weight = np.where(d < 1.0, weight, 0.0)
    fv = np.minimum(1.0, lip[2] * (0.35 + 0.65 * (v / 0.80)))
    nrgb = hsv_to_rgb(np.full_like(v, lip[0]), np.full_like(v, lip[1]), fv)
    blend = (weight * lip_k)[..., None]
    out = (1 - blend) * out + blend * nrgb
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


if __name__ == '__main__':
    base = Image.open(os.path.join(TEX, 'Main.webp')).convert('RGB')
    assert base.size == (2048, 2048), base.size
    arr = np.asarray(base).copy()
    x, y, w, h = PATCH
    for fname, p in PRESETS.items():
        img = arr.copy()
        img[y:y + h, x:x + w] = recolor(arr[y:y + h, x:x + w], p['eye'], p['lip'], p['lip_k'])
        out = os.path.join(TEX, fname)
        Image.fromarray(img).save(out, 'WEBP', quality=QUALITY, method=6)
        print(f'[faces] {fname} {os.path.getsize(out) / 1024:.0f} KB')
