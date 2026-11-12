from PIL import Image, ImageDraw, ImageFont
import os

candidates = [
    'thumb_wom',
    'thumb_inv_y',
    'thumb_rest_tuck',
    'thumb_clasp1',
    'thumb_clasp2',
    'thumb_clasp3',
    'thumb_clasp4',
    'thumb_clasp5'
]

# We will crop the hand area from front and side:
# Image size is 1600x1000
# The hand is around center-ish
# Let's crop x: 500..1100, y: 300..900 (600x600)
crop_box = (500, 300, 1100, 900)

rows = len(candidates)
cols = 2 # front, side
thumb_w = 400
thumb_h = 400

grid = Image.new('RGB', (cols * thumb_w, rows * thumb_h), (20, 20, 25))
draw = ImageDraw.Draw(grid)

for r, name in enumerate(candidates):
    front_path = f'screenshots/fist_{name}_front.png'
    side_path = f'screenshots/fist_{name}_side.png'
    
    if os.path.exists(front_path):
        im_front = Image.open(front_path).crop(crop_box).resize((thumb_w, thumb_h))
        grid.paste(im_front, (0, r * thumb_h))
        draw.text((10, r * thumb_h + 10), f'{name} - Front', fill=(255, 255, 0))
        
    if os.path.exists(side_path):
        im_side = Image.open(side_path).crop(crop_box).resize((thumb_w, thumb_h))
        grid.paste(im_side, (thumb_w, r * thumb_h))
        draw.text((thumb_w + 10, r * thumb_h + 10), f'{name} - Side', fill=(255, 255, 0))

out_path = 'screenshots/man_thumb_candidates_grid.png'
grid.save(out_path)
print(f'Saved comparison grid to {out_path}')

