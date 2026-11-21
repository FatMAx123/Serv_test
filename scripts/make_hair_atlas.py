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

print('=== 3. Embedding hair_atlas into character atlas empty cell ===')
# В основном атласе (2048x2048) пустая ячейка находится в правом верхнем квадранте:
# x: 1024..2048, y: 0..1024 (размер 1024x1024, UV: [0.5..1.0, 0.5..1.0]).
main_path = os.path.join(TEX_DIR, 'Main.webp')
im_body = Image.open(main_path).convert('RGB')
bw, bh = im_body.size

# Вставляем hair_atlas в правый верхний квадрант
hair_atlas_resized = hair_atlas.resize((bw // 2, bh // 2), Image.Resampling.LANCZOS)
im_body.paste(hair_atlas_resized, (bw // 2, 0))

# Сохраняем ТОЛЬКО основной атлас (Main.webp) и его оптимизированные LOD-версии (lod1, lod2)
out_main = os.path.join(TEX_DIR, 'Main.webp')
im_body.save(out_main, 'WEBP', quality=85, method=6)
print(f'Main.webp saved: {out_main} ({os.path.getsize(out_main)/1024:.1f} KB)')

main_lod1 = im_body.resize((1024, 1024), Image.Resampling.LANCZOS)
out_lod1 = os.path.join(TEX_DIR, 'Main_lod1.webp')
main_lod1.save(out_lod1, 'WEBP', quality=85, method=6)
print(f'Main_lod1.webp saved: {out_lod1} ({os.path.getsize(out_lod1)/1024:.1f} KB)')

main_lod2 = im_body.resize((512, 512), Image.Resampling.LANCZOS)
out_lod2 = os.path.join(TEX_DIR, 'Main_lod2.webp')
main_lod2.save(out_lod2, 'WEBP', quality=85, method=6)
print(f'Main_lod2.webp saved: {out_lod2} ({os.path.getsize(out_lod2)/1024:.1f} KB)')

print('=== ALL MAIN & LOD ATLASES GENERATED SUCCESSFULLY ===')
