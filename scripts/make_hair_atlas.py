import os
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEX_DIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman', 'Textures')

print('=== 1. Loading 4 hairstyle source textures ===')
# Hair 1: hairstyle_basecolor.jpg (4096x4096 -> 1024x1024)
im_h1 = Image.open(os.path.join(TEX_DIR, 'hairstyle_basecolor.jpg')).convert('RGB')
im_h1 = im_h1.resize((1024, 1024), Image.Resampling.LANCZOS)

# Hair 2: hair2.png (1024x1024)
im_h2 = Image.open(os.path.join(TEX_DIR, 'hair2.png')).convert('RGB')
im_h2 = im_h2.resize((1024, 1024), Image.Resampling.LANCZOS)

# Hair 3: haier3.jpg (4096x4096 -> 1024x1024)
im_h3 = Image.open(os.path.join(TEX_DIR, 'haier3.jpg')).convert('RGB')
im_h3 = im_h3.resize((1024, 1024), Image.Resampling.LANCZOS)

# Hair 4: haier4.jpg (4096x4096 -> 1024x1024)
im_h4 = Image.open(os.path.join(TEX_DIR, 'haier4.jpg')).convert('RGB')
im_h4 = im_h4.resize((1024, 1024), Image.Resampling.LANCZOS)

print('=== 2. Assembling hair_atlas (2048x2048) ===')
# 2x2 grid:
# Top-Left:     Hair 1 (0..1024, 0..1024)       -> local UV: [0.0..0.5, 0.5..1.0]
# Top-Right:    Hair 2 (1024..2048, 0..1024)     -> local UV: [0.5..1.0, 0.5..1.0]
# Bottom-Left:  Hair 3 (0..1024, 1024..2048)     -> local UV: [0.0..0.5, 0.0..0.5]
# Bottom-Right: Hair 4 (1024..2048, 1024..2048) -> local UV: [0.5..1.0, 0.0..0.5]
hair_atlas = Image.new('RGB', (2048, 2048))
hair_atlas.paste(im_h1, (0, 0))
hair_atlas.paste(im_h2, (1024, 0))
hair_atlas.paste(im_h3, (0, 1024))
hair_atlas.paste(im_h4, (1024, 1024))

out_hair_png = os.path.join(TEX_DIR, 'hair_atlas.png')
out_hair_webp = os.path.join(TEX_DIR, 'hair_atlas.webp')
hair_atlas.save(out_hair_png, 'PNG')
hair_atlas.save(out_hair_webp, 'WEBP', quality=85, method=6)
print(f'hair_atlas saved: {out_hair_webp} ({os.path.getsize(out_hair_webp)/1024:.1f} KB)')

print('=== 3. Assembling calibrated hair_atlas_gray (2048x2048) ===')
def calibrate_hair_luma(im, is_hair2=False):
    arr = np.array(im, dtype=np.float32)
    luma = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    if is_hair2:
        # Компрессия резкого спекуляра выше 105
        luma = np.where(luma > 105, 105 + (luma - 105) * 0.35, luma)
        # Подъем темной основы
        luma = np.where(luma > 8, luma * 1.55 + 50, luma)
    else:
        luma = np.where(luma > 8, luma * 1.50 + 45, luma)
    luma = np.clip(luma, 0, 255).astype(np.uint8)
    return Image.fromarray(np.stack([luma, luma, luma], axis=-1), 'RGB')

gray_atlas = Image.new('RGB', (2048, 2048))
gray_atlas.paste(calibrate_hair_luma(im_h1, is_hair2=False), (0, 0))
gray_atlas.paste(calibrate_hair_luma(im_h2, is_hair2=True), (1024, 0))
gray_atlas.paste(calibrate_hair_luma(im_h3, is_hair2=False), (0, 1024))
gray_atlas.paste(calibrate_hair_luma(im_h4, is_hair2=False), (1024, 1024))

out_gray_png = os.path.join(TEX_DIR, 'hair_atlas_gray.png')
out_gray_webp = os.path.join(TEX_DIR, 'hair_atlas_gray.webp')
gray_atlas.save(out_gray_png, 'PNG')
gray_atlas.save(out_gray_webp, 'WEBP', quality=85, method=6)
print(f'hair_atlas_gray saved: {out_gray_webp} ({os.path.getsize(out_gray_webp)/1024:.1f} KB)')

print('=== 4. Embedding hair_atlas into character atlas empty cell ===')
# В woman_atlas (4096x4096) пустая ячейка находится в правом верхнем квадранте:
# x: 2048..4096, y: 0..2048 (размер ровно 2048x2048, UV: [0.5..1.0, 0.5..1.0]).
# Вставляем hair_atlas (2048x2048) ровно в эту пустую ячейку!
body_atlas_png = os.path.join(TEX_DIR, 'woman_atlas.png')
im_body = Image.open(body_atlas_png).convert('RGB')
bw, bh = im_body.size

im_body.paste(hair_atlas, (bw // 2, 0))
im_body.save(body_atlas_png, 'PNG')

out_body_webp_4k = os.path.join(TEX_DIR, 'woman_atlas.webp')
im_body.save(out_body_webp_4k, 'WEBP', quality=85, method=6)

im_body_2k = im_body.resize((2048, 2048), Image.Resampling.LANCZOS)
out_body_webp_2k = os.path.join(TEX_DIR, 'woman_atlas_2k.webp')
im_body_2k.save(out_body_webp_2k, 'WEBP', quality=85, method=6)
print(f'woman_atlas_2k (with hair atlas in top-right cell) saved: {out_body_webp_2k} ({os.path.getsize(out_body_webp_2k)/1024:.1f} KB)')

# Также создаем woman_atlas_gray_2k для окрашивания волос в рамках единого атласа
im_body_gray = im_body.copy()
# Преобразуем всю текстуру в gray или вставляем gray_atlas в ячейку волос
im_body_gray.paste(gray_atlas, (bw // 2, 0))
out_body_gray_2k = os.path.join(TEX_DIR, 'woman_atlas_gray_2k.webp')
im_body_gray_2k = im_body_gray.resize((2048, 2048), Image.Resampling.LANCZOS)
im_body_gray_2k.save(out_body_gray_2k, 'WEBP', quality=85, method=6)
print(f'woman_atlas_gray_2k saved: {out_body_gray_2k} ({os.path.getsize(out_body_gray_2k)/1024:.1f} KB)')

print('=== ALL ATLASES GENERATED SUCCESSFULLY ===')
