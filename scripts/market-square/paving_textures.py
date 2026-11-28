# ============================================================
#  SCRIPTS / MARKET-SQUARE / PAVING_TEXTURES.PY
#  Реалистичные текстуры мощения рынка и парка — из фото-текстур проекта (бесшовные):
#   - mkt_paving_flags.webp  ← client/data/textures/town_cobblestone.webp (те же плиты, что у дорог
#     автора по деревне): площадь внутри кольца, круг у фонтана парка;
#   - mkt_paving_cobble.webp ← client/assets/textures/cobblestone_floor_001_diffuse_2k.jpg (Poly Haven, CC0):
#     кольцевая улица, круг у фонтана рынка, дорожки парка.
#  512² (как у пропсов, AGENTS.md 7.2), Lanczos, WebP q82 → client/assets/props/textures/.
#  Никакой процедурной «синтетики»: только фото-текстуры.
#  Запуск: python scripts/market-square/paving_textures.py
# ============================================================
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'client', 'assets', 'props', 'textures')
SOURCES = {
    'mkt_paving_flags': os.path.join(ROOT, 'client', 'data', 'textures', 'town_cobblestone.webp'),
    'mkt_paving_cobble': os.path.join(ROOT, 'client', 'assets', 'textures', 'cobblestone_floor_001_diffuse_2k.jpg'),
}
SIZE = 512


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, src in SOURCES.items():
        if not os.path.exists(src):
            sys.exit('[paving] нет исходной фото-текстуры: ' + src)
        im = Image.open(src).convert('RGB')
        if im.size != (SIZE, SIZE):
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
        dst = os.path.join(OUT, name + '.webp')
        im.save(dst, 'WEBP', quality=82, method=6)
        print('[paving] %s ← %s → %s (%d байт)' % (name, os.path.relpath(src, ROOT), os.path.relpath(dst, ROOT), os.path.getsize(dst)))


if __name__ == '__main__':
    main()
