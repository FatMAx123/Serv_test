#!/usr/bin/env python3
# ============================================================
#  SCRIPTS / OPERATORS-TERRITORY / ROAD_MASK.PY
#  Маска дорог, нарисованных автором на террейне — по ней раскладка (layout.js)
#  НИЧЕГО не ставит на дорогу: ни пропсы, ни деревья, ни кусты, ни траву.
#
#  Источники (только чтение, ничего не перерисовывается):
#   • client/data/textures/terr_light.webp — запечённый цвет террейна: грунтовые дороги
#     красно-бурые (R − G ≥ порога), трава зелёная (R ≈ G). Строка = v·N (как на карте M).
#   • client/data/terrain-paint-1.png — слой 0 (брусчатка) покраски редактора.
#     Строка = (1 − v)·N (DataTexture без flipY, тот же vMapUv в шейдере).
#
#  Пишет scripts/operators-territory/road-mask.json: сетка CELL м, биты base64,
#  и road-mask.png — обзор для проверки глазами.
#  Запуск: python scripts/operators-territory/road_mask.py
# ============================================================
import base64, json, os, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MIN_X, MAX_X = -1892.6082763671875, 1838.1767578125
MIN_Z, MAX_Z = -1918.204345703125, 1827.108642578125
W, H = MAX_X - MIN_X, MAX_Z - MIN_Z

X0, X1, Z0, Z1, CELL = -120.0, 720.0, -120.0, 840.0, 2.0
RED_MIN = 16          # R − G на сглаженном цвете: дорога
PAINT_MIN = 40        # вес слоя брусчатки
MIN_BLOB_M2 = 260     # мелкие рыжие пятна почвы — не дорога

tl = Image.open(os.path.join(ROOT, 'client', 'data', 'textures', 'terr_light.webp')).convert('RGB')
tl = tl.filter(ImageFilter.BoxBlur(2))
TN = tl.size[0]
T = tl.load()
pt = Image.open(os.path.join(ROOT, 'client', 'data', 'terrain-paint-1.png')).convert('RGBA')
PN = pt.size[0]
P = pt.load()


def clamp(v, n):
    return 0 if v < 0 else (n - 1 if v >= n else v)


def is_road(x, z):
    u, v = (x - MIN_X) / W, (z - MIN_Z) / H
    r, g, _ = T[clamp(int(u * TN), TN), clamp(int(v * TN), TN)]
    if r - g >= RED_MIN:
        return True
    return P[clamp(int(u * PN), PN), clamp(int((1 - v) * PN), PN)][0] >= PAINT_MIN


NX, NZ = int((X1 - X0) / CELL), int((Z1 - Z0) / CELL)
grid = bytearray(NX * NZ)
for j in range(NZ):
    z = Z0 + (j + 0.5) * CELL
    for i in range(NX):
        if is_road(X0 + (i + 0.5) * CELL, z):
            grid[j * NX + i] = 1

# убрать мелкие пятна (связность 8)
seen = bytearray(NX * NZ)
min_cells = int(MIN_BLOB_M2 / (CELL * CELL))
removed = 0
for k in range(NX * NZ):
    if not grid[k] or seen[k]:
        continue
    stack, comp = [k], []
    seen[k] = 1
    while stack:
        c = stack.pop()
        comp.append(c)
        ci, cj = c % NX, c // NX
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                ni, nj = ci + di, cj + dj
                if 0 <= ni < NX and 0 <= nj < NZ:
                    n = nj * NX + ni
                    if grid[n] and not seen[n]:
                        seen[n] = 1
                        stack.append(n)
    if len(comp) < min_cells:
        for c in comp:
            grid[c] = 0
        removed += 1

bits = bytearray((NX * NZ + 7) // 8)
for k in range(NX * NZ):
    if grid[k]:
        bits[k >> 3] |= 1 << (k & 7)
out = {'x0': X0, 'z0': Z0, 'cell': CELL, 'nx': NX, 'nz': NZ,
       'source': 'terr_light R-G>=%d | terrain-paint-1 R>=%d' % (RED_MIN, PAINT_MIN),
       'bits': base64.b64encode(bytes(bits)).decode('ascii')}
with open(os.path.join(HERE, 'road-mask.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
on = sum(grid)
print('[road-mask] %dx%d клеток по %.0f м, дорога %d клеток (%.0f м²), убрано пятен %d' % (NX, NZ, CELL, on, on * CELL * CELL, removed))

# обзор: terr_light в ориентации карты + маска полупрозрачно
if '--png' in sys.argv:
    S = 1
    img = Image.new('RGB', (NX * S, NZ * S))
    d = ImageDraw.Draw(img)
    src = Image.open(os.path.join(ROOT, 'client', 'data', 'textures', 'terr_light.webp')).convert('RGB').load()
    for j in range(NZ):
        z = Z0 + (j + 0.5) * CELL
        for i in range(NX):
            x = X0 + (i + 0.5) * CELL
            u, v = (x - MIN_X) / W, (z - MIN_Z) / H
            r, g, b = src[clamp(int(u * TN), TN), clamp(int(v * TN), TN)]
            if grid[j * NX + i]:
                r, g, b = (r + 255) // 2, g // 2, (b + 255) // 2
            img.putpixel((i, j), (r, g, b))
    for gx in range(-100, 721, 100):
        i = (gx - X0) / CELL
        d.line([(i, 0), (i, NZ)], fill=(255, 255, 255))
        d.text((i + 2, 2), str(gx), fill=(255, 255, 0))
    for gz in range(-100, 841, 100):
        j = (gz - Z0) / CELL
        d.line([(0, j), (NX, j)], fill=(255, 255, 255))
        d.text((2, j + 2), str(gz), fill=(255, 255, 0))
    img = img.resize((NX * 2, NZ * 2), Image.NEAREST)
    img.save(sys.argv[sys.argv.index('--png') + 1])
