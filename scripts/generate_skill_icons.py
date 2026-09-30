"""
PROJECT STEAM: ORIGINS — AAA 4X SUPERSAMPLED SKILL ICON GENERATOR PIPELINE
Generates authentic 64x64 WebP skill icons matching the Lineage 2 / Project Steam C1 aesthetic.
Every icon is rendered at 256x256 with full vector anti-aliasing, rich lighting, shading,
and then downsampled to 64x64 with Lanczos filter and composited with the authentic riveted metallic frame.
"""

import os
import math
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT_SKILLS = os.path.join(ROOT, 'client', 'assets', 'skills')

# 1. Load reference frame overlay
frame_ref_path = os.path.join(CLIENT_SKILLS, 'engineer', 'eng_armor_mastery.webp')
frame_src = Image.open(frame_ref_path).convert('RGBA')

frame_overlay = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
for y in range(64):
    for x in range(64):
        if x < 6 or x >= 58 or y < 6 or y >= 58:
            frame_overlay.putpixel((x, y), frame_src.getpixel((x, y)))
        elif x == 6 or x == 57 or y == 6 or y == 57:
            p = frame_src.getpixel((x, y))
            frame_overlay.putpixel((x, y), (p[0], p[1], p[2], 215))

def create_canvas(bg_theme='dark'):
    """256x256 base canvas with smooth rich background gradient & center ambient glow."""
    im = Image.new('RGBA', (256, 256), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    if bg_theme == 'red':
        c1, c2 = (52, 20, 18), (20, 10, 10)
        glow = (95, 35, 25)
    elif bg_theme == 'blue':
        c1, c2 = (16, 32, 54), (10, 16, 26)
        glow = (30, 60, 95)
    elif bg_theme == 'green':
        c1, c2 = (18, 44, 26), (10, 22, 14)
        glow = (35, 75, 45)
    elif bg_theme == 'gold':
        c1, c2 = (52, 40, 18), (22, 18, 10)
        glow = (95, 70, 30)
    elif bg_theme == 'purple':
        c1, c2 = (42, 20, 52), (20, 12, 26)
        glow = (75, 35, 90)
    elif bg_theme == 'cyan':
        c1, c2 = (18, 48, 54), (10, 22, 28)
        glow = (35, 85, 95)
    else: # dark / brass
        c1, c2 = (30, 25, 22), (15, 13, 12)
        glow = (55, 45, 38)
        
    for y in range(256):
        t = y / 255.0
        r = int(c1[0] * (1 - t) + c2[0] * t)
        g = int(c1[1] * (1 - t) + c2[1] * t)
        b = int(c1[2] * (1 - t) + c2[2] * t)
        d.line([(0, y), (255, y)], fill=(r, g, b, 255))
        
    for r in range(110, 10, -5):
        t = (110 - r) / 100.0
        col = (
            int(c1[0] + (glow[0] - c1[0]) * t),
            int(c1[1] + (glow[1] - c1[1]) * t),
            int(c1[2] + (glow[2] - c1[2]) * t),
            255
        )
        d.ellipse([128 - r, 128 - r, 128 + r, 128 + r], fill=col)
        
    return im

def draw_sparks_256(d, center, count=16, col=(255, 230, 130, 240)):
    cx, cy = center
    import random
    rng = random.Random(cx * 100 + cy)
    for _ in range(count):
        ang = rng.uniform(0, math.pi * 2)
        dist = rng.uniform(20, 90)
        px = int(cx + math.cos(ang) * dist)
        py = int(cy + math.sin(ang) * dist)
        if 28 <= px <= 228 and 28 <= py <= 228:
            sz = rng.randint(2, 4)
            d.ellipse([px - sz, py - sz, px + sz, py + sz], fill=col)

def draw_steam_cloud_256(im, center, radius=48, col=(230, 240, 250, 130)):
    layer = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=col)
    d.ellipse([cx - int(radius*0.7) - 14, cy - int(radius*0.6), cx + int(radius*0.7) - 14, cy + int(radius*0.6)], fill=col)
    d.ellipse([cx - int(radius*0.6) + 16, cy - int(radius*0.7), cx + int(radius*0.6) + 16, cy + int(radius*0.7)], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=8.0))
    im.alpha_composite(layer)

def draw_gear_256(d, cx, cy, r_outer=64, r_inner=34, teeth=8, col=(190, 150, 75), hole_r=16):
    for i in range(teeth):
        ang = i * (2 * math.pi / teeth)
        x1 = cx + math.cos(ang) * (r_outer + 12)
        y1 = cy + math.sin(ang) * (r_outer + 12)
        d.ellipse([x1 - 10, y1 - 10, x1 + 10, y1 + 10], fill=col)
    d.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=col, outline=(240, 200, 120), width=4)
    d.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], fill=(30, 24, 20), outline=(130, 95, 45), width=3)
    if hole_r > 0:
        d.ellipse([cx - hole_r, cy - hole_r, cx + hole_r, cy + hole_r], fill=(16, 12, 10))

def draw_shield_256(d, cx, cy, w=88, h=108, col=(200, 160, 80), inner_col=(115, 85, 45)):
    pts = [
        (cx - w//2, cy - h//2),
        (cx + w//2, cy - h//2),
        (cx + w//2, cy + h//8),
        (cx, cy + h//2),
        (cx - w//2, cy + h//8)
    ]
    s_pts = [(x + 6, y + 6) for x, y in pts]
    d.polygon(s_pts, fill=(15, 12, 10, 160))
    d.polygon(pts, fill=col, outline=(250, 215, 130), width=4)
    in_pts = [
        (cx - w//2 + 10, cy - h//2 + 10),
        (cx + w//2 - 10, cy - h//2 + 10),
        (cx + w//2 - 10, cy + h//8 - 2),
        (cx, cy + h//2 - 12),
        (cx - w//2 + 10, cy + h//8 - 2)
    ]
    d.polygon(in_pts, fill=inner_col, outline=(160, 120, 60), width=2)

def finalize_and_save_256(im_256, rel_path, save_jpg=False):
    im_64 = im_256.resize((64, 64), Image.Resampling.LANCZOS)
    im_64.alpha_composite(frame_overlay)
    
    dest = os.path.join(CLIENT_SKILLS, rel_path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im_64.save(dest, 'WEBP', quality=95)
    
    if save_jpg:
        jpg_path = os.path.splitext(dest)[0] + '.jpg'
        rgb = im_64.convert('RGB')
        rgb.save(jpg_path, 'JPEG', quality=95)
    print("Saved:", rel_path)

# ==============================================================
# 1. SPECIAL / GM SKILLS
# ==============================================================

def make_gm_flash():
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    d.arc([40, 40, 216, 216], start=135, end=405, fill=(150, 110, 50), width=10)
    d.arc([46, 46, 210, 210], start=135, end=405, fill=(80, 55, 25), width=4)
    d.arc([40, 40, 216, 216], start=330, end=405, fill=(230, 45, 25), width=14)
    d.arc([40, 40, 216, 216], start=330, end=405, fill=(255, 120, 80), width=4)
    for i in range(10):
        ang = math.radians(135 + i * 27)
        x1 = 128 + math.cos(ang) * 95
        y1 = 128 + math.sin(ang) * 95
        x2 = 128 + math.cos(ang) * 82
        y2 = 128 + math.sin(ang) * 82
        col = (255, 80, 50) if i >= 7 else (200, 160, 90)
        d.line([(x1, y1), (x2, y2)], fill=col, width=4)

    bolt_pts = [(155, 35), (90, 120), (128, 120), (88, 225), (180, 110), (135, 110)]
    glow_layer = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    gd.polygon(bolt_pts, fill=(255, 200, 50, 140))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(12))
    im.alpha_composite(glow_layer)

    d.polygon([(x + 4, y + 4) for x, y in bolt_pts], fill=(80, 40, 10, 180))
    d.polygon(bolt_pts, fill=(255, 215, 60), outline=(180, 120, 20))
    core_pts = [(152, 45), (98, 116), (130, 116), (102, 205), (168, 114), (133, 114)]
    d.polygon(core_pts, fill=(255, 255, 220))

    d.line([(45, 150), (95, 130), (80, 170)], fill=(120, 220, 255), width=3)
    d.line([(160, 90), (210, 80), (195, 120)], fill=(120, 220, 255), width=3)
    finalize_and_save_256(im, 'special/gm_flash.webp', save_jpg=True)

def make_gm_oneshot():
    im = create_canvas('red')
    d = ImageDraw.Draw(im)
    # Anvil base
    d.polygon([(64, 190), (192, 190), (176, 216), (80, 216)], fill=(110, 95, 85), outline=(180, 150, 135), width=4)
    # Giant warhammer slamming
    # Handle
    d.line([(128, 128), (80, 70)], fill=(130, 85, 50), width=16)
    # Hammer head
    d.polygon([(90, 110), (166, 170), (150, 190), (74, 130)], fill=(245, 195, 60), outline=(255, 230, 140), width=4)
    # Impact shockwaves
    d.arc([60, 100, 196, 220], start=180, end=360, fill=(255, 130, 30), width=8)
    d.arc([36, 80, 220, 240], start=190, end=350, fill=(255, 200, 60), width=6)
    draw_sparks_256(d, (128, 180), count=24, col=(255, 230, 110, 255))
    finalize_and_save_256(im, 'special/gm_oneshot.webp')

def make_gm_resurrect():
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    # Angelic golden wings
    wing_l = [(128, 150), (50, 90), (45, 55), (75, 70), (110, 110)]
    wing_r = [(128, 150), (206, 90), (211, 55), (181, 70), (146, 110)]
    d.polygon([(x + 4, y + 4) for x, y in wing_l], fill=(20, 15, 10, 160))
    d.polygon([(x + 4, y + 4) for x, y in wing_r], fill=(20, 15, 10, 160))
    d.polygon(wing_l, fill=(245, 205, 115), outline=(255, 240, 180), width=3)
    d.polygon(wing_r, fill=(245, 205, 115), outline=(255, 240, 180), width=3)
    # Ankh of life
    d.line([(128, 55), (128, 190)], fill=(255, 245, 200), width=14)
    d.line([(90, 95), (166, 95)], fill=(255, 245, 200), width=14)
    d.ellipse([108, 45, 148, 85], outline=(255, 245, 200), width=12)
    draw_steam_cloud_256(im, (128, 185), radius=40, col=(255, 240, 180, 100))
    draw_sparks_256(d, (128, 95), count=20, col=(255, 250, 210, 255))
    finalize_and_save_256(im, 'special/gm_resurrect.webp')

def make_test_immortal():
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(6):
        ang = i * (math.pi / 3) + math.pi / 6
        pts.append((128 + math.cos(ang) * 78, 128 + math.sin(ang) * 78))
    d.polygon(pts, fill=(80, 60, 25, 190), outline=(255, 220, 90), width=5)
    draw_shield_256(d, 128, 128, w=84, h=104, col=(235, 185, 65), inner_col=(145, 105, 35))
    d.ellipse([38, 38, 218, 218], outline=(100, 220, 255, 190), width=6)
    draw_sparks_256(d, (128, 128), count=16, col=(255, 240, 160, 240))
    finalize_and_save_256(im, 'special/test_immortal.webp')

def make_br_cappuccino():
    im = create_canvas('dark')
    d = ImageDraw.Draw(im)
    # Saucer & cup
    d.ellipse([65, 165, 191, 205], fill=(185, 145, 85), outline=(230, 190, 130), width=4)
    d.rectangle([80, 110, 176, 175], fill=(225, 220, 210), outline=(155, 115, 65), width=4)
    d.arc([155, 120, 200, 165], start=-90, end=90, fill=(225, 220, 210), width=10)
    # Crema & swirl
    d.ellipse([80, 95, 176, 125], fill=(165, 115, 65))
    d.arc([92, 100, 164, 120], start=0, end=270, fill=(245, 225, 185), width=6)
    draw_steam_cloud_256(im, (128, 70), radius=32, col=(245, 235, 215, 130))
    finalize_and_save_256(im, 'special/br_cappuccino_spin.webp')

def make_br_memes():
    # br_skibidi_slam
    im = create_canvas('red')
    d = ImageDraw.Draw(im)
    d.rectangle([100, 48, 156, 136], fill=(175, 135, 75), outline=(235, 195, 125), width=5)
    d.rectangle([76, 136, 180, 184], fill=(125, 105, 95), outline=(195, 165, 135), width=6)
    d.line([(40, 192), (216, 192)], fill=(255, 155, 45), width=10)
    draw_sparks_256(d, (128, 184), count=20)
    finalize_and_save_256(im, 'special/br_skibidi_slam.webp')

    # br_tralala_wave
    im = create_canvas('purple')
    d = ImageDraw.Draw(im)
    d.polygon([(64, 104), (64, 152), (136, 176), (176, 208), (176, 48), (136, 80)], fill=(225, 175, 65), outline=(255, 215, 105), width=5)
    d.arc([144, 48, 216, 208], start=-60, end=60, fill=(100, 220, 255), width=10)
    d.arc([168, 24, 240, 232], start=-60, end=60, fill=(255, 140, 220), width=8)
    finalize_and_save_256(im, 'special/br_tralala_wave.webp')

    # br_bombardiro_dive
    im = create_canvas('dark')
    d = ImageDraw.Draw(im)
    d.polygon([(184, 56), (80, 176), (96, 192), (200, 72)], fill=(165, 125, 65), outline=(215, 175, 95), width=4)
    d.line([(112, 80), (176, 152)], fill=(125, 95, 55), width=14)
    draw_sparks_256(d, (72, 192), count=16, col=(255, 110, 45, 230))
    finalize_and_save_256(im, 'special/br_bombardiro_dive.webp')

    # br_tung_suction
    im = create_canvas('cyan')
    d = ImageDraw.Draw(im)
    for r in range(24, 88, 16):
        d.arc([128 - r, 128 - r, 128 + r, 128 + r], start=r*5, end=r*5 + 240, fill=(80, 210, 245), width=7)
    finalize_and_save_256(im, 'special/br_tung_suction.webp')

# ==============================================================
# 2. OPERATOR SKILLS (client/assets/skills/operator/)
# ==============================================================

def make_operator_skills():
    # op_power_strike (diagonal wrench strike with glowing slash and sparks)
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    # Wrench shadow
    d.line([(68, 196), (188, 68)], fill=(15, 12, 10, 160), width=24)
    # Wrench shaft
    d.line([(64, 192), (184, 64)], fill=(215, 165, 75), width=22)
    d.line([(64, 192), (184, 64)], fill=(255, 220, 140), width=6)
    # Wrench open jaw head
    d.ellipse([160, 40, 208, 88], fill=(215, 165, 75), outline=(255, 220, 140), width=4)
    d.polygon([(170, 40), (208, 40), (184, 76)], fill=(28, 22, 18))
    # Bottom ring
    d.ellipse([44, 172, 84, 212], fill=(215, 165, 75), outline=(255, 220, 140), width=4)
    d.ellipse([54, 182, 74, 202], fill=(28, 22, 18))
    # Glowing kinetic slash arc
    d.arc([40, 40, 216, 216], start=210, end=330, fill=(255, 235, 125), width=14)
    d.arc([56, 56, 200, 200], start=220, end=320, fill=(255, 145, 35), width=7)
    draw_sparks_256(d, (168, 70), count=24)
    finalize_and_save_256(im, 'operator/op_power_strike.webp')

    # op_iron_punch (Detailed hydraulic steam fist with articulated knuckles)
    im = create_canvas('red')
    d = ImageDraw.Draw(im)
    # Arm cylinder & chrome piston rod
    d.rectangle([40, 104, 96, 152], fill=(120, 90, 75), outline=(180, 140, 110), width=4)
    d.rectangle([96, 114, 126, 142], fill=(220, 225, 230), outline=(160, 165, 170), width=3)
    # Wrist plate with steam vents
    d.rectangle([126, 92, 146, 164], fill=(160, 120, 60), outline=(230, 180, 90), width=4)
    # Segmented armored knuckles / clenched fist
    d.polygon([(146, 92), (196, 96), (212, 114), (212, 142), (196, 160), (146, 164)], fill=(215, 165, 75), outline=(255, 215, 130), width=4)
    # Knuckle segment lines
    d.line([(168, 94), (168, 162)], fill=(120, 80, 40), width=4)
    d.line([(190, 96), (190, 160)], fill=(120, 80, 40), width=4)
    # Spiked knuckle guards
    for ky in [106, 128, 150]:
        d.polygon([(212, ky - 6), (226, ky), (212, ky + 6)], fill=(245, 210, 120))
    # Steam jet burst from wrist
    draw_steam_cloud_256(im, (64, 128), radius=36, col=(245, 245, 255, 150))
    draw_sparks_256(d, (216, 128), count=16, col=(255, 220, 100, 240))
    finalize_and_save_256(im, 'operator/op_iron_punch.webp')

    # op_steam_vent (Angled brass nozzle with valve wheel and violent steam plume)
    im = create_canvas('blue')
    d = ImageDraw.Draw(im)
    # Brass elbow pipe
    d.rectangle([100, 150, 156, 216], fill=(175, 125, 65), outline=(235, 185, 95), width=5)
    # Valve wheel on side
    d.line([(68, 180), (100, 180)], fill=(140, 100, 50), width=8)
    d.ellipse([50, 162, 74, 198], outline=(225, 175, 85), width=6)
    # Nozzle flared rim
    d.polygon([(90, 150), (166, 150), (176, 136), (80, 136)], fill=(215, 165, 80), outline=(255, 215, 125), width=4)
    # Violent steam cone erupting upward
    draw_steam_cloud_256(im, (128, 76), radius=56, col=(245, 248, 255, 180))
    draw_steam_cloud_256(im, (96, 96), radius=38, col=(225, 238, 255, 150))
    draw_steam_cloud_256(im, (160, 90), radius=42, col=(225, 238, 255, 150))
    draw_sparks_256(d, (128, 120), count=12, col=(200, 230, 255, 200))
    finalize_and_save_256(im, 'operator/op_steam_vent.webp')

    # op_oil_slick
    im = create_canvas('green')
    d = ImageDraw.Draw(im)
    d.ellipse([56, 144, 200, 200], fill=(22, 28, 30), outline=(65, 185, 145), width=4)
    d.ellipse([80, 152, 176, 192], fill=(38, 55, 50))
    d.arc([72, 152, 184, 192], start=180, end=360, fill=(185, 105, 225), width=6)
    d.polygon([(128, 72), (112, 112), (144, 112)], fill=(32, 38, 40))
    d.ellipse([(108, 100), (148, 132)], fill=(32, 38, 40), outline=(85, 205, 165), width=3)
    finalize_and_save_256(im, 'operator/op_oil_slick.webp')

    # op_emergency_repair
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    draw_gear_256(d, 128, 136, r_outer=60, r_inner=32, teeth=8, col=(185, 145, 65))
    d.polygon([(56, 56), (96, 96), (80, 112), (48, 72)], fill=(145, 115, 85), outline=(205, 165, 115), width=4)
    d.polygon([(96, 96), (128, 120), (112, 96)], fill=(100, 225, 255))
    d.polygon([(100, 96), (120, 112), (108, 96)], fill=(255, 255, 255))
    draw_sparks_256(d, (120, 112), count=24, col=(255, 225, 105, 255))
    finalize_and_save_256(im, 'operator/op_emergency_repair.webp')

    # op_overclock
    im = create_canvas('red')
    d = ImageDraw.Draw(im)
    d.ellipse([56, 56, 200, 200], fill=(38, 28, 22), outline=(205, 155, 75), width=6)
    d.arc([72, 72, 184, 184], start=140, end=400, fill=(165, 135, 85), width=10)
    d.arc([72, 72, 184, 184], start=320, end=400, fill=(245, 55, 35), width=14)
    d.line([(128, 128), (184, 96)], fill=(255, 65, 45), width=10)
    d.ellipse([116, 116, 140, 140], fill=(225, 185, 95))
    draw_steam_cloud_256(im, (192, 80), radius=24, col=(255, 205, 185, 160))
    finalize_and_save_256(im, 'operator/op_overclock.webp')

    # op_scrap_collect
    im = create_canvas('blue')
    d = ImageDraw.Draw(im)
    d.arc([72, 64, 184, 176], start=180, end=360, fill=(225, 65, 55), width=28)
    d.rectangle([72, 120, 100, 152], fill=(225, 225, 235), outline=(155, 155, 165), width=4)
    d.rectangle([156, 120, 184, 152], fill=(225, 225, 235), outline=(155, 155, 165), width=4)
    draw_gear_256(d, 128, 184, r_outer=28, r_inner=12, teeth=6, col=(185, 145, 75), hole_r=8)
    draw_sparks_256(d, (128, 144), count=14, col=(125, 205, 255, 230))
    finalize_and_save_256(im, 'operator/op_scrap_collect.webp')

    # op_weapon_mastery (Crossed wrench and hammer clearly showing both tools)
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    # Hammer layer (bottom)
    # Hammer handle
    d.line([(70, 70), (186, 186)], fill=(130, 85, 50), width=14)
    # Hammer head
    d.polygon([(46, 78), (78, 46), (98, 66), (66, 98)], fill=(195, 145, 60), outline=(245, 205, 120), width=3)
    # Wrench layer (top)
    d.line([(186, 70), (70, 186)], fill=(215, 165, 75), width=16)
    d.line([(186, 70), (70, 186)], fill=(255, 220, 140), width=5)
    # Wrench head
    d.ellipse([166, 50, 206, 90], fill=(215, 165, 75), outline=(255, 220, 140), width=3)
    d.polygon([(178, 50), (206, 50), (188, 76)], fill=(28, 22, 18))
    draw_sparks_256(d, (128, 128), count=14)
    finalize_and_save_256(im, 'operator/op_weapon_mastery.webp')

    # op_armor_mastery
    im = create_canvas('dark')
    d = ImageDraw.Draw(im)
    draw_shield_256(d, 128, 128, w=96, h=112, col=(175, 135, 65), inner_col=(95, 75, 45))
    d.line([(128, 80), (128, 176)], fill=(225, 185, 95), width=8)
    finalize_and_save_256(im, 'operator/op_armor_mastery.webp')

    # op_tough_frame
    im = create_canvas('dark')
    d = ImageDraw.Draw(im)
    d.rectangle([56, 112, 200, 144], fill=(135, 115, 105), outline=(195, 175, 155), width=6)
    d.rectangle([72, 64, 104, 192], fill=(155, 135, 125), outline=(215, 195, 175), width=6)
    d.rectangle([152, 64, 184, 192], fill=(155, 135, 125), outline=(215, 195, 175), width=6)
    for bx, by in [(88, 88), (88, 168), (168, 88), (168, 168), (128, 128)]:
        d.ellipse([bx - 8, by - 8, bx + 8, by + 8], fill=(235, 195, 105))
    finalize_and_save_256(im, 'operator/op_tough_frame.webp')

    # op_quick_hands
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    for offset_x, offset_y in [(-32, 16), (0, 0), (32, -16)]:
        cx, cy = 128 + offset_x, 128 + offset_y
        d.rectangle([cx - 16, cy - 8, cx + 16, cy + 48], fill=(185, 145, 65), outline=(235, 195, 105), width=4)
        d.ellipse([cx - 8, cy - 24, cx + 8, cy - 8], fill=(225, 185, 85))
    d.arc([64, 80, 192, 176], start=0, end=180, fill=(255, 235, 145), width=8)
    finalize_and_save_256(im, 'operator/op_quick_hands.webp')

    # op_sturdy_frame
    im = create_canvas('dark')
    d = ImageDraw.Draw(im)
    d.rectangle([56, 56, 200, 200], fill=(95, 85, 80), outline=(165, 145, 125), width=8)
    d.line([(56, 56), (200, 200)], fill=(145, 125, 105), width=12)
    d.line([(56, 200), (200, 56)], fill=(145, 125, 105), width=12)
    for bx in [72, 128, 184]:
        for by in [72, 128, 184]:
            d.ellipse([bx - 8, by - 8, bx + 8, by + 8], fill=(215, 175, 95))
    finalize_and_save_256(im, 'operator/op_sturdy_frame.webp')

    # op_expertise_d
    im = create_canvas('gold')
    d = ImageDraw.Draw(im)
    draw_gear_256(d, 128, 128, r_outer=72, r_inner=40, teeth=10, col=(185, 140, 60))
    d.polygon([(104, 80), (132, 80), (152, 100), (152, 156), (132, 176), (104, 176)], fill=(250, 220, 125))
    d.polygon([(116, 96), (128, 96), (140, 108), (140, 148), (128, 160), (116, 160)], fill=(42, 32, 18))
    finalize_and_save_256(im, 'operator/op_expertise_d.webp')

# ==============================================================
# 3. ENGINEER SKILLS (client/assets/skills/engineer/)
# ==============================================================

def make_engineer_skills():
    # eng_expertise_d
    im = create_canvas('blue')
    d = ImageDraw.Draw(im)
    d.ellipse([56, 56, 200, 200], outline=(85, 205, 255), width=8)
    d.polygon([(104, 80), (132, 80), (152, 100), (152, 156), (132, 176), (104, 176)], fill=(235, 248, 255))
    d.polygon([(116, 96), (128, 96), (140, 108), (140, 148), (128, 160), (116, 160)], fill=(16, 32, 48))
    d.line([(72, 128), (100, 128)], fill=(85, 205, 255), width=8)
    d.line([(156, 128), (184, 128)], fill=(85, 205, 255), width=8)
    d.line([(128, 56), (128, 76)], fill=(85, 205, 255), width=8)
    d.line([(128, 180), (128, 200)], fill=(85, 205, 255), width=8)
    draw_sparks_256(d, (128, 128), count=16, col=(125, 225, 255, 240))
    finalize_and_save_256(im, 'engineer/eng_expertise_d.webp')

# ==============================================================
# 4. OTHER CLASSES (Mechanic, Destroyer, Gunner, Constructor, Technomancer, Tier-2)
# ==============================================================

def make_class_skills():
    classes_and_skills = {
        'mechanic': [
            ('mech_aggression', 'red', 'wolf_roar'),
            ('mech_shield_bash', 'gold', 'shield_impact'),
            ('mech_defense_aura', 'blue', 'defense_aura'),
            ('mech_steam_wall', 'blue', 'steam_wall'),
            ('mech_repair_beam', 'cyan', 'repair_beam'),
            ('mech_reinforced_edge', 'gold', 'blade_edge'),
            ('mech_hydraulic_slam', 'red', 'hydraulic_slam'),
            ('mech_emergency_shutdown', 'red', 'lever_off'),
            ('mech_pressure_aura', 'gold', 'pressure_aura'),
            ('mech_reinforced_armor', 'dark', 'plate_armor'),
            ('mech_shield_mastery', 'gold', 'shield_mastery'),
            ('mech_threat_generator', 'red', 'siren_beacon'),
            ('mech_last_stand', 'red', 'last_stand'),
            ('mech_steam_reserve', 'cyan', 'steam_tank')
        ],
        'destroyer': [
            ('dest_power_smash', 'red', 'hammer_smash'),
            ('dest_stun_attack', 'gold', 'pommel_stun'),
            ('dest_demolish', 'red', 'wrecking_ball'),
            ('dest_war_cry', 'red', 'war_cry'),
            ('dest_berserker_steam', 'red', 'berserker'),
            ('dest_frag_grenade', 'red', 'grenade'),
            ('dest_vicious_stance', 'red', 'crossed_blades'),
            ('dest_crushing_blow', 'red', 'heavy_cleave'),
            ('dest_chain_detonation', 'red', 'detonation'),
            ('dest_heavy_strikes', 'gold', 'spiked_knuckles'),
            ('dest_critical_mass', 'red', 'reactor_core'),
            ('dest_explosive_expert', 'red', 'dynamite'),
            ('dest_adrenaline', 'gold', 'syringe_inject')
        ],
        'gunner': [
            ('gun_mortal_blow', 'red', 'dagger_strike'),
            ('gun_precision_shot', 'cyan', 'sniper_scope'),
            ('gun_dash', 'blue', 'speed_dash'),
            ('gun_rapid_fire', 'gold', 'gatling_cannon'),
            ('gun_piercing_round', 'cyan', 'piercing_bullet'),
            ('gun_ultimate_evasion', 'blue', 'evasion_phantom'),
            ('gun_smoke_screen', 'dark', 'smoke_cloud'),
            ('gun_explosive_trap', 'red', 'landmine'),
            ('gun_sniper_mode', 'cyan', 'rifle_bipod'),
            ('gun_bullet_storm', 'gold', 'bullet_storm'),
            ('gun_eagle_eye', 'gold', 'eagle_eye'),
            ('gun_deadly_aim', 'cyan', 'laser_aim'),
            ('gun_evasion_protocol', 'blue', 'boot_thrusters'),
            ('gun_overcharge', 'cyan', 'plasma_cartridge')
        ],
        'constructor': [
            ('con_overload', 'cyan', 'overload_blast'),
            ('con_coolant_bolt', 'blue', 'cryo_spike'),
            ('con_steam_nova', 'cyan', 'steam_nova'),
            ('con_surge', 'cyan', 'power_surge'),
            ('con_focus_protocol', 'gold', 'focus_prism'),
            ('con_quick_charge', 'cyan', 'turbocharger'),
            ('con_high_pressure', 'gold', 'pressure_manifold')
        ],
        'technomancer': [
            ('tec_repair', 'green', 'repair_wave'),
            ('tec_group_overhaul', 'green', 'group_heal'),
            ('tec_might', 'gold', 'engine_buff'),
            ('tec_shield', 'cyan', 'energy_shield'),
            ('tec_servo_boost', 'gold', 'servo_boost'),
            ('tec_protocol_buff', 'gold', 'data_scroll'),
            ('tec_protocol_bless', 'gold', 'radiant_glyph'),
            ('tec_battle_repair', 'green', 'fast_repair'),
            ('tec_quick_recovery', 'cyan', 'thermal_flush'),
            ('tec_resist_corrosion', 'green', 'anti_corrode')
        ],
        'boiler_guardian': [
            ('bg_iron_will', 'dark', 'plate_armor'),
            ('bg_drain_strike', 'red', 'hydraulic_slam')
        ],
        'repair_engineer': [
            ('re_mass_repair', 'green', 'group_heal'),
            ('re_fortress_plate', 'dark', 'plate_armor')
        ],
        'demolitionist': [
            ('dem_whirlwind', 'red', 'crossed_blades')
        ],
        'steam_berserker': [
            ('sb_triple_slash', 'red', 'blade_edge')
        ],
        'pneumatic_sniper': [
            ('ps_double_shot', 'cyan', 'sniper_scope')
        ],
        'artillery_engineer': [
            ('ae_mortar', 'red', 'grenade')
        ],
        'pressure_sorcerer': [
            ('pm_pressure_storm', 'cyan', 'steam_nova')
        ],
        'machine_warlock': [
            ('do_deploy_drone', 'gold', 'focus_prism')
        ],
        'circuit_necro': [
            ('cc_corrode', 'green', 'anti_corrode')
        ],
        'overhaul_master': [
            ('om_reboot', 'cyan', 'turbocharger')
        ],
        'protocol_prophet': [
            ('pd_party_protocol', 'gold', 'radiant_glyph')
        ]
    }

    for class_folder, skills in classes_and_skills.items():
        for skill_id, theme, icon_type in skills:
            im = create_canvas(theme)
            d = ImageDraw.Draw(im)
            
            if 'shield' in icon_type or 'defense' in icon_type:
                draw_shield_256(d, 128, 128, w=88, h=108, col=(195, 155, 75), inner_col=(115, 85, 45))
                d.ellipse([104, 104, 152, 152], fill=(235, 195, 95))
            elif 'hammer' in icon_type or 'slam' in icon_type:
                # Handle
                d.line([(128, 128), (80, 70)], fill=(130, 85, 50), width=16)
                d.polygon([(90, 110), (166, 170), (150, 190), (74, 130)], fill=(215, 165, 65), outline=(245, 205, 125), width=3)
                draw_sparks_256(d, (128, 152), count=16)
            elif 'wrench' in icon_type or 'blade' in icon_type:
                d.line([(64, 192), (184, 64)], fill=(205, 155, 65), width=18)
                d.ellipse([160, 40, 208, 88], fill=(205, 155, 65), outline=(245, 205, 125), width=3)
                draw_sparks_256(d, (144, 112), count=12)
            elif 'sniper' in icon_type or 'scope' in icon_type or 'aim' in icon_type:
                d.ellipse([64, 64, 192, 192], outline=(85, 225, 255), width=8)
                d.line([(40, 128), (216, 128)], fill=(85, 225, 255), width=8)
                d.line([(128, 40), (128, 216)], fill=(85, 225, 255), width=8)
                d.ellipse([116, 116, 140, 140], fill=(255, 65, 45))
            elif 'steam' in icon_type or 'cloud' in icon_type or 'nova' in icon_type:
                draw_steam_cloud_256(im, (128, 128), radius=56, col=(225, 238, 255, 160))
                draw_gear_256(d, 128, 128, r_outer=40, r_inner=20, teeth=6, col=(185, 145, 75))
            elif 'repair' in icon_type or 'heal' in icon_type:
                d.line([(72, 184), (184, 72)], fill=(185, 145, 75), width=16)
                d.ellipse([96, 96, 160, 160], outline=(85, 255, 165), width=12)
                d.line([(128, 104), (128, 152)], fill=(85, 255, 165), width=12)
                d.line([(104, 128), (152, 128)], fill=(85, 255, 165), width=12)
            elif 'bolt' in icon_type or 'surge' in icon_type or 'plasma' in icon_type:
                bolt = [(144, 56), (96, 120), (128, 120), (96, 200), (168, 112), (136, 112)]
                d.polygon(bolt, fill=(105, 225, 255), outline=(225, 248, 255), width=3)
                draw_sparks_256(d, (128, 128), count=18, col=(145, 235, 255, 240))
            elif 'grenade' in icon_type or 'detonation' in icon_type:
                d.ellipse([88, 88, 168, 184], fill=(95, 85, 80), outline=(155, 145, 135), width=6)
                d.rectangle([120, 64, 136, 88], fill=(205, 165, 85))
                draw_sparks_256(d, (128, 64), count=14, col=(255, 185, 45, 255))
            elif 'buff' in icon_type or 'glyph' in icon_type or 'scroll' in icon_type:
                draw_gear_256(d, 128, 128, r_outer=64, r_inner=32, teeth=8, col=(225, 185, 85))
                d.line([(128, 64), (128, 192)], fill=(255, 245, 165), width=8)
                d.line([(64, 128), (192, 128)], fill=(255, 245, 165), width=8)
            else: # generic steampunk skill
                draw_gear_256(d, 128, 128, r_outer=56, r_inner=28, teeth=8, col=(195, 155, 75))
                draw_sparks_256(d, (128, 128), count=12)
                
            finalize_and_save_256(im, f'{class_folder}/{skill_id}.webp')

if __name__ == '__main__':
    print("=== Generating 4x Supersampled Special / GM skills ===")
    make_gm_flash()
    make_gm_oneshot()
    make_gm_resurrect()
    make_test_immortal()
    make_br_cappuccino()
    make_br_memes()

    print("=== Generating 4x Supersampled Operator skills ===")
    make_operator_skills()

    print("=== Generating 4x Supersampled Engineer missing skills ===")
    make_engineer_skills()

    print("=== Generating 4x Supersampled All Class skills ===")
    make_class_skills()

    print("ALL 4X SUPERSAMPLED SKILL ICONS GENERATED SUCCESSFULLY!")
