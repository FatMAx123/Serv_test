# ============================================================
#  build_man_atlas.py — атлас текстур мужского Engineer (engi/man)
#
#  Запуск (обычный Python + Pillow, ДО build_man_glb.py):
#    python scripts/build_man_atlas.py
#
#  Вход (man/Textures/): main_color.jpg (тело), tshirt_color.png, short_color.jpg,
#                        haier_color.jpg — по одной текстуре на часть (Tripo, 2–4K)
#  Выход (man/Textures/): man_atlas.webp (2048), man_atlas_lod1.webp (1024),
#                         man_atlas_lod2.webp (512)
#  Раскладка 2×2 с полями (edge-extend) против протекания соседей на мипах.
#  Раскладку и поля build_man_glb.py повторяет при перекладке UV — менять вместе.
# ============================================================
import os
import numpy as np
from PIL import Image, features

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(os.path.dirname(HERE), 'client', 'assets', 'Characters', 'engi', 'man', 'Textures')

# часть → (файл, колонка, ряд); ряд 1 = верх атласа (UV v ∈ [0.5, 1])
LAYOUT = {
    'Body':   ('main_color.jpg',   0, 1),
    'Tshirt': ('tshirt_color.png', 1, 1),
    'Shorts': ('short_color.jpg',  0, 0),
    'Hair':   ('haier_color.jpg',  1, 0),
}
PAD_FRAC = 1 / 128          # поле в долях квадранта (8 px при 1024)
SIZES = [('man_atlas.webp', 2048), ('man_atlas_lod1.webp', 1024), ('man_atlas_lod2.webp', 512)]
QUALITY = 82


def build(size):
    q = size // 2
    pad = max(1, round(q * PAD_FRAC))
    inner = q - 2 * pad
    atlas = Image.new('RGB', (size, size))
    for name, (fname, col, row) in LAYOUT.items():
        src = Image.open(os.path.join(TEX, fname)).convert('RGB')
        tile = np.asarray(src.resize((inner, inner), Image.LANCZOS))
        tile = np.pad(tile, ((pad, pad), (pad, pad), (0, 0)), mode='edge')  # поле = продление края
        atlas.paste(Image.fromarray(tile), (col * q, (1 - row) * q))
    return atlas


if __name__ == '__main__':
    assert features.check('webp'), 'Pillow без поддержки WebP'
    for fname, size in SIZES:
        out = os.path.join(TEX, fname)
        build(size).save(out, 'WEBP', quality=QUALITY, method=6)
        print(f'[man_atlas] {fname} {size}x{size} {os.path.getsize(out) / 1024:.0f} KB')
