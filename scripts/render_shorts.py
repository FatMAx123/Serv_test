# -*- coding: utf-8 -*-
"""
Render professional 1080x1920 vertical shorts for Project Steam: Origins.
Uses cv2, Pillow, numpy, and imageio-ffmpeg.
"""
import os
import sys
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = r"C:\ProgramData\miniconda3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_IMPACT = r"C:\Windows\Fonts\impact.ttf"

WIDTH = 1080
HEIGHT = 1920
FPS = 30

def create_gradient_plate(width, height, top_color, bot_color, corner_radius=18, border_color=(220, 180, 70), border_w=3):
    """Creates a stylish glassmorphic badge with gradient and border."""
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Gradient
    base = Image.new('RGBA', (width, height))
    bdraw = ImageDraw.Draw(base)
    for y in range(height):
        factor = y / float(height)
        r = int(top_color[0] + factor * (bot_color[0] - top_color[0]))
        g = int(top_color[1] + factor * (bot_color[1] - top_color[1]))
        b = int(top_color[2] + factor * (bot_color[2] - top_color[2]))
        a = int(top_color[3] + factor * (bot_color[3] - top_color[3]))
        bdraw.line([(0, y), (width, y)], fill=(r, g, b, a))
        
    mask = Image.new('L', (width, height), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([(0, 0), (width - 1, height - 1)], radius=corner_radius, fill=255)
    
    img.paste(base, (0, 0), mask)
    draw.rounded_rectangle([(1, 1), (width - 2, height - 2)], radius=corner_radius, outline=border_color, width=border_w)
    return img

def render_scene_frame(main_rgb, title_text, sub_text, progress=0.0, zoom_factor=1.0, crop_focus=None):
    """
    Composes a single 1080x1920 frame:
    - Blurred background
    - Zoomed/focused center subject
    - Top header plate
    - Bottom subtitle plate
    - Bottom progress bar
    """
    # 1. Background: blurred fullscreen
    bg_pil = Image.fromarray(main_rgb)
    bg_resized = bg_pil.resize((WIDTH, int(WIDTH * main_rgb.shape[0] / main_rgb.shape[1])), Image.Resampling.BILINEAR)
    if bg_resized.height < HEIGHT:
        bg_resized = bg_pil.resize((int(HEIGHT * main_rgb.shape[1] / main_rgb.shape[0]), HEIGHT), Image.Resampling.BILINEAR)
    
    # Center crop bg to 1080x1920
    left = (bg_resized.width - WIDTH) // 2
    top = (bg_resized.height - HEIGHT) // 2
    bg_crop = bg_resized.crop((left, top, left + WIDTH, top + HEIGHT))
    bg_blurred = bg_crop.filter(ImageFilter.GaussianBlur(radius=28))
    
    # Darken background
    darkener = Image.new('RGBA', (WIDTH, HEIGHT), (10, 15, 20, 160))
    canvas = Image.new('RGBA', (WIDTH, HEIGHT))
    canvas.paste(bg_blurred, (0, 0))
    canvas.alpha_composite(darkener)
    
    # 2. Main content block in center
    h, w, _ = main_rgb.shape
    if crop_focus:
        # crop specific region [ymin_pct, ymax_pct, xmin_pct, xmax_pct]
        y1 = int(h * crop_focus[0])
        y2 = int(h * crop_focus[1])
        x1 = int(w * crop_focus[2])
        x2 = int(w * crop_focus[3])
        content_crop = bg_pil.crop((x1, y1, x2, y2))
    else:
        content_crop = bg_pil
        
    # Apply subtle zoom
    cw, ch = content_crop.size
    target_w = 980
    target_h = int(target_w * ch / cw)
    if target_h > 1050:
        target_h = 1050
        target_w = int(target_h * cw / ch)
        
    scaled_w = int(target_w * zoom_factor)
    scaled_h = int(target_h * zoom_factor)
    content_scaled = content_crop.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    
    # Crop to box
    cx = (scaled_w - target_w) // 2
    cy = (scaled_h - target_h) // 2
    final_content = content_scaled.crop((cx, cy, cx + target_w, cy + target_h))
    
    # Gold border frame around central video
    framed = Image.new('RGBA', (target_w + 12, target_h + 12), (218, 165, 32, 255))
    fdraw = ImageDraw.Draw(framed)
    fdraw.rectangle([(2, 2), (target_w + 9, target_h + 9)], outline=(255, 223, 118), width=3)
    framed.paste(final_content, (6, 6))
    
    pos_x = (WIDTH - framed.width) // 2
    pos_y = 440 + (1050 - framed.height) // 2
    canvas.paste(framed, (pos_x, pos_y))
    
    # 3. Top Title Plate
    top_badge = create_gradient_plate(1000, 230, (22, 28, 38, 240), (12, 16, 22, 245), 24, (230, 185, 60), 4)
    tdraw = ImageDraw.Draw(top_badge)
    font_top = ImageFont.truetype(FONT_IMPACT, 48)
    font_sub_top = ImageFont.truetype(FONT_BOLD, 32)
    
    lines = title_text.split('\n')
    line1 = lines[0] if len(lines) > 0 else ""
    line2 = lines[1] if len(lines) > 1 else ""
    
    # Line 1 (Yellow / Gold)
    bbox1 = tdraw.textbbox((0, 0), line1, font=font_top)
    x1 = (1000 - (bbox1[2] - bbox1[0])) // 2
    tdraw.text((x1, 35), line1, font=font_top, fill=(255, 220, 60), stroke_width=4, stroke_fill=(0, 0, 0))
    
    # Line 2 (White / Orange)
    if line2:
        bbox2 = tdraw.textbbox((0, 0), line2, font=font_sub_top)
        x2 = (1000 - (bbox2[2] - bbox2[0])) // 2
        tdraw.text((x2, 125), line2, font=font_sub_top, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
        
    canvas.alpha_composite(top_badge, (40, 160))
    
    # 4. Bottom Subtitle / Info Plate
    bot_badge = create_gradient_plate(1000, 220, (16, 22, 30, 240), (8, 12, 18, 245), 24, (100, 175, 220), 3)
    bdraw = ImageDraw.Draw(bot_badge)
    font_bot = ImageFont.truetype(FONT_BOLD, 34)
    
    bot_lines = sub_text.split('\n')
    b_y = 35 if len(bot_lines) == 2 else 55
    for b_line in bot_lines:
        b_bbox = bdraw.textbbox((0, 0), b_line, font=font_bot)
        bx = (1000 - (b_bbox[2] - b_bbox[0])) // 2
        bdraw.text((bx, b_y), b_line, font=font_bot, fill=(240, 245, 250), stroke_width=3, stroke_fill=(10, 15, 20))
        b_y += 60
        
    canvas.alpha_composite(bot_badge, (40, 1540))
    
    # 5. Progress Bar at bottom
    p_draw = ImageDraw.Draw(canvas)
    p_draw.rectangle([(0, HEIGHT - 14), (WIDTH, HEIGHT)], fill=(30, 35, 45, 255))
    bar_w = int(WIDTH * progress)
    if bar_w > 0:
        p_draw.rectangle([(0, HEIGHT - 14), (bar_w, HEIGHT)], fill=(240, 190, 50, 255))
        
    return np.array(canvas.convert('RGB'))

def make_shorts_01():
    print("🎬 [SHORTS 1] Rendering: 'Бунт стиралок и кофемашин в браузере'...")
    out_video_silent = os.path.join(REPO_ROOT, "scratch_shorts1_silent.mp4")
    out_final = os.path.join(REPO_ROOT, "screenshots", "01_shorts_бунт_бытовой_техники.mp4")
    out_final_skr = os.path.join(REPO_ROOT, "скрины", "01_shorts_бунт_бытовой_техники.mp4")
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_video_silent, fourcc, FPS, (WIDTH, HEIGHT))
    
    # Media sources
    v1_path = os.path.join(REPO_ROOT, "client", "bandicam 2026-09-29 15-40-41-975.mp4")
    v2_path = os.path.join(REPO_ROOT, "client", "bandicam 2026-09-29 19-08-23-136.mp4")
    menu_img_path = os.path.join(REPO_ROOT, "screenshots", "01_главное_меню.png")
    char_sel_path = os.path.join(REPO_ROOT, "screenshots", "02_выбор_персонажа.png")
    char_cre_path = os.path.join(REPO_ROOT, "screenshots", "03_создание_персонажа.png")
    
    menu_rgb = cv2.cvtColor(cv2.imread(menu_img_path), cv2.COLOR_BGR2RGB)
    char_sel_rgb = cv2.cvtColor(cv2.imread(char_sel_path), cv2.COLOR_BGR2RGB)
    char_cre_rgb = cv2.cvtColor(cv2.imread(char_cre_path), cv2.COLOR_BGR2RGB)
    
    cap1 = cv2.VideoCapture(v1_path)
    cap2 = cv2.VideoCapture(v2_path)
    
    total_frames = int(24 * FPS) # 24 seconds = 720 frames
    
    for f in range(total_frames):
        t = f / FPS
        progress = f / total_frames
        
        # Segment 1 (0 - 4.5s): Hook - Washer Monster (Стиралка-Убийца)
        if t < 4.5:
            # seek around 5 sec in v1
            cap1.set(cv2.CAP_PROP_POS_MSEC, int((4.0 + (t * 0.8)) * 1000))
            ret, frame = cap1.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_rgb
            zoom = 1.0 + (t / 4.5) * 0.12
            # Focus on washer monster (right center of screen)
            crop = [0.15, 0.85, 0.35, 0.85]
            title = "ТОСТЕРЫ И СТИРАЛКИ ОБЪЯВИЛИ ВОЙНУ!\nЗабудьте шаблонных эльфов с посохами"
            sub = "В этой MMO бытовая техника обрела хищный разум!\n«Ур.5 Стиралка-Убийца» вышла на охоту!"
            rendered = render_scene_frame(rgb, title, sub, progress, zoom, crop)
            
        # Segment 2 (4.5 - 9.0s): Main Menu & Steampunk Lore
        elif t < 9.0:
            sub_t = t - 4.5
            zoom = 1.0 + (sub_t / 4.5) * 0.08
            title = "ОСТРОВ ПОЮЩЕЙ СТАЛИ\nНовая 3D MMORPG прямо в браузере!"
            sub = "Дизельпанк-маяк, Первый Котёл и живой мир!\n100% на Three.js без установки клиента!"
            rendered = render_scene_frame(menu_rgb, title, sub, progress, zoom, [0.0, 0.95, 0.1, 0.9])
            
        # Segment 3 (9.0 - 14.0s): Character Select C1 Nostalgia
        elif t < 14.0:
            sub_t = t - 9.0
            zoom = 1.0 + (sub_t / 5.0) * 0.1
            title = "ДУХ LINEAGE 2 C1 В 2026 ГОДУ!\nТот самый пьедестал и заветные статы"
            sub = "Вместо маны — ДАВЛЕНИЕ ПАРА!\nТаргет кликом, честное агро и спойл деталей!"
            rendered = render_scene_frame(char_sel_rgb, title, sub, progress, zoom, [0.05, 0.95, 0.0, 0.85])
            
        # Segment 4 (14.0 - 19.0s): Massive Battle & Chat event
        elif t < 19.0:
            sub_t = t - 14.0
            cap2.set(cv2.CAP_PROP_POS_MSEC, int((3.0 + sub_t) * 1000))
            ret, frame = cap2.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_rgb
            zoom = 1.0 + (sub_t / 5.0) * 0.1
            crop = [0.2, 0.85, 0.25, 0.75]
            title = "ТОЛПА ИГРОКОВ ПРОТИВ КОФЕМАШИНЫ!\nЧат: Прорыв паровой трубы в Заводи!"
            sub = "C++ AVX2 сервер держит тысячи игроков в кадре!\nБез лагов и фризов на стабильных 60 FPS!"
            rendered = render_scene_frame(rgb, title, sub, progress, zoom, crop)
            
        # Segment 5 (19.0 - 24.0s): Call to action
        else:
            sub_t = t - 19.0
            zoom = 1.0 + (sub_t / 5.0) * 0.06
            title = "ИГРАЙ ПРЯМО В БРАУЗЕРЕ!\nНе нужно качать 50 ГБ лаунчера"
            sub = "Переходи по ссылке в описании / шапке канала!\nЗабирай роль «Первопроходца» в Telegram @AindieGus"
            rendered = render_scene_frame(char_cre_rgb, title, sub, progress, zoom, [0.0, 0.95, 0.05, 0.95])
            
        writer.write(cv2.cvtColor(rendered, cv2.COLOR_RGB2BGR))
        if f % 90 == 0:
            print(f"  Frame {f}/{total_frames} ({int(progress*100)}%)...")
            
    cap1.release()
    cap2.release()
    writer.release()
    print("✅ Silent video rendered. Now mixing audio...")
    
    # Audio mix with ffmpeg
    music_path = os.path.join(REPO_ROOT, "client", "assets", "audio", "bgm", "village_theme.ogg")
    crit_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "crit.ogg")
    soulshot_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "soulshot.ogg")
    lvl_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "levelup.ogg")
    
    # Complex filter for music fade + sfx overlay
    # t=0.0 crit, t=4.5 lvl, t=9.0 soulshot, t=14.0 crit, t=19.0 lvl
    cmd = [
        FFMPEG, "-y",
        "-i", out_video_silent,
        "-i", music_path,
        "-i", crit_sfx,
        "-i", lvl_sfx,
        "-i", soulshot_sfx,
        "-filter_complex",
        "[1:a]atrim=0:24,afade=t=in:ss=0:d=1,afade=t=out:st=22.5:d=1.5,volume=0.35[bgm];"
        "[2:a]adelay=100|100,volume=1.2[sfx1];"
        "[3:a]adelay=4500|4500,volume=1.2[sfx2];"
        "[4:a]adelay=9000|9000,volume=1.2[sfx3];"
        "[2:a]adelay=14000|14000,volume=1.2[sfx4];"
        "[3:a]adelay=19000|19000,volume=1.2[sfx5];"
        "[bgm][sfx1][sfx2][sfx3][sfx4][sfx5]amix=inputs=6:duration=first:dropout_transition=2[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "19",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_final
    ]
    
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFMPEG error:", res.stderr)
    else:
        print(f"🎉 Shorts 1 ready: {out_final}")
        # Copy to скрины as well
        import shutil
        shutil.copy2(out_final, out_final_skr)
        print(f"📁 Copied to {out_final_skr}")
        
    if os.path.exists(out_video_silent):
        os.remove(out_video_silent)

def make_shorts_02():
    print("🎬 [SHORTS 2] Rendering: 'Линейка C1 вернулась в браузере'...")
    out_video_silent = os.path.join(REPO_ROOT, "scratch_shorts2_silent.mp4")
    out_final = os.path.join(REPO_ROOT, "screenshots", "02_shorts_ностальгия_lineage2_c1.mp4")
    out_final_skr = os.path.join(REPO_ROOT, "скрины", "02_shorts_ностальгия_lineage2_c1.mp4")
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_video_silent, fourcc, FPS, (WIDTH, HEIGHT))
    
    v1_path = os.path.join(REPO_ROOT, "client", "bandicam 2026-09-29 15-40-41-975.mp4")
    menu_img_path = os.path.join(REPO_ROOT, "screenshots", "01_главное_меню.png")
    char_sel_path = os.path.join(REPO_ROOT, "screenshots", "02_выбор_персонажа.png")
    char_cre_path = os.path.join(REPO_ROOT, "screenshots", "03_создание_персонажа.png")
    
    menu_rgb = cv2.cvtColor(cv2.imread(menu_img_path), cv2.COLOR_BGR2RGB)
    char_sel_rgb = cv2.cvtColor(cv2.imread(char_sel_path), cv2.COLOR_BGR2RGB)
    char_cre_rgb = cv2.cvtColor(cv2.imread(char_cre_path), cv2.COLOR_BGR2RGB)
    
    cap1 = cv2.VideoCapture(v1_path)
    total_frames = int(22 * FPS) # 22 seconds = 660 frames
    
    for f in range(total_frames):
        t = f / FPS
        progress = f / total_frames
        
        # Segment 1 (0 - 5.0s): Close-up on C1 Character Select Stats Window
        if t < 5.0:
            zoom = 1.0 + (t / 5.0) * 0.12
            # Focus strictly on the C1 status panel on the left
            crop = [0.05, 0.55, 0.02, 0.45]
            title = "ОЛДЫ ЗДЕСЬ? УЗНАЛИ ЭТОТ ИНТЕРФЕЙС?\nLineage 2 C1 прямо в твоем браузере!"
            sub = "Lv 1, HP, Удар, Броня, Схемы, Контур, Карма\nИ вместо маны — ДАВЛЕНИЕ ПАРА!"
            rendered = render_scene_frame(char_sel_rgb, title, sub, progress, zoom, crop)
            
        # Segment 2 (5.0 - 10.0s): Character Lineup (Mill, lawn, operators)
        elif t < 10.0:
            sub_t = t - 5.0
            zoom = 1.0 + (sub_t / 5.0) * 0.1
            title = "ВЫБЕРИ СВОЙ КЛАСС И СТИЛЬ!\nОператоры, Инженеры и Мастеровые"
            sub = "Паровые молоты, котловые щиты и калибраторы цепей!\nКастомизация лиц, причесок и телосложения!"
            rendered = render_scene_frame(char_cre_rgb, title, sub, progress, zoom, [0.1, 0.9, 0.1, 0.9])
            
        # Segment 3 (10.0 - 16.0s): Real MMO open world action
        elif t < 16.0:
            sub_t = t - 10.0
            cap1.set(cv2.CAP_PROP_POS_MSEC, int((8.0 + sub_t) * 1000))
            ret, frame = cap1.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_rgb
            zoom = 1.0 + (sub_t / 6.0) * 0.1
            crop = [0.2, 0.85, 0.2, 0.8]
            title = "ОТКРЫТЫЙ МИР И ЖИВЫЕ ИГРОКИ!\nОхота, спойл шестеренок и совместный фарм"
            sub = "Таргет кликом, переагр мобов на танка и бафы пати!\nЧестный хардкор без автобоя и автобега!"
            rendered = render_scene_frame(rgb, title, sub, progress, zoom, crop)
            
        # Segment 4 (16.0 - 22.0s): Main Menu & Call To Action
        else:
            sub_t = t - 16.0
            zoom = 1.0 + (sub_t / 6.0) * 0.08
            title = "ОСТРОВ ПОЮЩЕЙ СТАЛИ: ИСТОКИ\nПервый закрытый тест уже скоро!"
            sub = "Залетай по ссылке в шапке / описании канала!\nЗабирай роль «Первопроходца» в Telegram @AindieGus"
            rendered = render_scene_frame(menu_rgb, title, sub, progress, zoom, [0.05, 0.95, 0.1, 0.9])
            
        writer.write(cv2.cvtColor(rendered, cv2.COLOR_RGB2BGR))
        if f % 90 == 0:
            print(f"  Frame {f}/{total_frames} ({int(progress*100)}%)...")
            
    cap1.release()
    writer.release()
    print("✅ Silent video 2 rendered. Mixing audio...")
    
    music_path = os.path.join(REPO_ROOT, "client", "assets", "audio", "bgm", "village_theme.ogg")
    soulshot_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "soulshot.ogg")
    lvl_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "levelup.ogg")
    crit_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "crit.ogg")
    
    cmd = [
        FFMPEG, "-y",
        "-i", out_video_silent,
        "-i", music_path,
        "-i", soulshot_sfx,
        "-i", lvl_sfx,
        "-i", crit_sfx,
        "-filter_complex",
        "[1:a]atrim=0:22,afade=t=in:ss=0:d=1,afade=t=out:st=20.5:d=1.5,volume=0.35[bgm];"
        "[2:a]adelay=100|100,volume=1.2[sfx1];"
        "[3:a]adelay=5000|5000,volume=1.2[sfx2];"
        "[4:a]adelay=10000|10000,volume=1.2[sfx3];"
        "[3:a]adelay=16000|16000,volume=1.2[sfx4];"
        "[bgm][sfx1][sfx2][sfx3][sfx4]amix=inputs=5:duration=first:dropout_transition=2[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "19",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_final
    ]
    
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFMPEG error:", res.stderr)
    else:
        print(f"🎉 Shorts 2 ready: {out_final}")
        import shutil
        shutil.copy2(out_final, out_final_skr)
        print(f"📁 Copied to {out_final_skr}")
        
    if os.path.exists(out_video_silent):
        os.remove(out_video_silent)

if __name__ == '__main__':
    make_shorts_01()
    print("-" * 50)
    make_shorts_02()
    print("🏁 All Shorts successfully created!")
