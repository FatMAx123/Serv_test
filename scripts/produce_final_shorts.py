# -*- coding: utf-8 -*-
"""
PRODUCE_FINAL_SHORTS.PY
Динамичный монтаж Shorts 1080x1920 без пафоса и клише.
Суть: Соло-разработчик создает 3D MMO с помощью ИИ, вдохновляясь золотой эпохой Lineage 2.
Ссылка: t.me/ostrov_stali
"""
import os
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = r"C:\ProgramData\miniconda3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
FONT_TITLE = r"C:\Windows\Fonts\impact.ttf"
FONT_BODY = r"C:\Windows\Fonts\arialbd.ttf"

WIDTH = 1080
HEIGHT = 1920
FPS = 30

def create_glass_card(w, h, bg_top=(18, 22, 30, 240), bg_bot=(10, 14, 20, 245), border_color=(218, 165, 32), border_w=3, radius=20):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    base = Image.new('RGBA', (w, h))
    bdraw = ImageDraw.Draw(base)
    for y in range(h):
        factor = y / float(h)
        r = int(bg_top[0] + factor * (bg_bot[0] - bg_top[0]))
        g = int(bg_top[1] + factor * (bg_bot[1] - bg_top[1]))
        b = int(bg_top[2] + factor * (bg_bot[2] - bg_top[2]))
        a = int(bg_top[3] + factor * (bg_bot[3] - bg_top[3]))
        bdraw.line([(0, y), (w, y)], fill=(r, g, b, a))
        
    mask = Image.new('L', (w, h), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=radius, fill=255)
    
    img.paste(base, (0, 0), mask)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(1, 1), (w - 2, h - 2)], radius=radius, outline=border_color, width=border_w)
    return img

def compose_short_frame(source_frame, title_lines, subtitle_lines, progress, zoom=1.0, crop_box=None):
    """
    Vertical 1080x1920 layout:
    - Fullscreen blurred background
    - Sharp central gameplay window with border & subtle Ken Burns zoom
    - Top card: bold, punchy headline
    - Bottom card: concise story progression
    - Bottom progress indicator
    """
    src_h, src_w, _ = source_frame.shape
    pil_src = Image.fromarray(source_frame)
    
    # 1. Background
    bg_resized = pil_src.resize((WIDTH, int(WIDTH * src_h / src_w)), Image.Resampling.BILINEAR)
    if bg_resized.height < HEIGHT:
        bg_resized = pil_src.resize((int(HEIGHT * src_w / src_h), HEIGHT), Image.Resampling.BILINEAR)
    left = (bg_resized.width - WIDTH) // 2
    top = (bg_resized.height - HEIGHT) // 2
    bg_crop = bg_resized.crop((left, top, left + WIDTH, top + HEIGHT))
    bg_blurred = bg_crop.filter(ImageFilter.GaussianBlur(radius=26))
    
    canvas = Image.new('RGBA', (WIDTH, HEIGHT))
    canvas.paste(bg_blurred, (0, 0))
    darkener = Image.new('RGBA', (WIDTH, HEIGHT), (8, 12, 18, 160))
    canvas.alpha_composite(darkener)
    
    # 2. Gameplay Center Cut
    if crop_box:
        y1 = int(src_h * crop_box[0])
        y2 = int(src_h * crop_box[1])
        x1 = int(src_w * crop_box[2])
        x2 = int(src_w * crop_box[3])
        content = pil_src.crop((x1, y1, x2, y2))
    else:
        content = pil_src
        
    cw, ch = content.size
    target_w = 980
    target_h = int(target_w * ch / cw)
    if target_h > 1050:
        target_h = 1050
        target_w = int(target_h * cw / ch)
        
    scaled_w = int(target_w * zoom)
    scaled_h = int(target_h * zoom)
    content_scaled = content.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    cx = (scaled_w - target_w) // 2
    cy = (scaled_h - target_h) // 2
    final_content = content_scaled.crop((cx, cy, cx + target_w, cy + target_h))
    
    framed = Image.new('RGBA', (target_w + 12, target_h + 12), (218, 165, 32, 255))
    fdraw = ImageDraw.Draw(framed)
    fdraw.rectangle([(2, 2), (target_w + 9, target_h + 9)], outline=(255, 220, 110), width=3)
    framed.paste(final_content, (6, 6))
    
    pos_x = (WIDTH - framed.width) // 2
    pos_y = 440 + (1050 - framed.height) // 2
    canvas.paste(framed, (pos_x, pos_y))
    
    # 3. Top Card
    top_h = 220
    top_badge = create_glass_card(1000, top_h, (20, 26, 36, 240), (10, 14, 20, 245), (235, 180, 50), 4)
    tdraw = ImageDraw.Draw(top_badge)
    f_title = ImageFont.truetype(FONT_TITLE, 50)
    f_sub_title = ImageFont.truetype(FONT_BODY, 32)
    
    if len(title_lines) > 0 and title_lines[0]:
        t_box = tdraw.textbbox((0, 0), title_lines[0], font=f_title)
        tx = (1000 - (t_box[2] - t_box[0])) // 2
        tdraw.text((tx, 32), title_lines[0], font=f_title, fill=(255, 215, 50), stroke_width=4, stroke_fill=(0, 0, 0))
    if len(title_lines) > 1 and title_lines[1]:
        t_box2 = tdraw.textbbox((0, 0), title_lines[1], font=f_sub_title)
        tx2 = (1000 - (t_box2[2] - t_box2[0])) // 2
        tdraw.text((tx2, 125), title_lines[1], font=f_sub_title, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    canvas.alpha_composite(top_badge, (40, 170))
    
    # 4. Bottom Card
    bot_h = 210
    bot_badge = create_glass_card(1000, bot_h, (14, 20, 28, 240), (8, 12, 18, 245), (80, 160, 210), 3)
    bdraw = ImageDraw.Draw(bot_badge)
    f_bot = ImageFont.truetype(FONT_BODY, 34)
    
    y_start = 38 if len(subtitle_lines) == 2 else 58
    for line in subtitle_lines:
        s_box = bdraw.textbbox((0, 0), line, font=f_bot)
        sx = (1000 - (s_box[2] - s_box[0])) // 2
        bdraw.text((sx, y_start), line, font=f_bot, fill=(245, 248, 252), stroke_width=3, stroke_fill=(10, 15, 20))
        y_start += 62
    canvas.alpha_composite(bot_badge, (40, 1550))
    
    # 5. Progress line
    pdraw = ImageDraw.Draw(canvas)
    pdraw.rectangle([(0, HEIGHT - 14), (WIDTH, HEIGHT)], fill=(25, 30, 40, 255))
    bw = int(WIDTH * progress)
    if bw > 0:
        pdraw.rectangle([(0, HEIGHT - 14), (bw, HEIGHT)], fill=(235, 185, 45, 255))
        
    return np.array(canvas.convert('RGB'))

def render_dynamic_solo_shorts():
    print("🎬 Начинаем сборку динамичного Shorts: 'Один человек + ИИ создают MMO'...")
    
    out_silent = os.path.join(REPO_ROOT, "scratch_solo_silent.mp4")
    out_mp4 = os.path.join(REPO_ROOT, "screenshots", "01_shorts_один_человек_и_ии_делают_ммо.mp4")
    out_skr = os.path.join(REPO_ROOT, "скрины", "01_shorts_один_человек_и_ии_делают_ммо.mp4")
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_silent, fourcc, FPS, (WIDTH, HEIGHT))
    
    # Sources
    v_bandicam1 = os.path.join(REPO_ROOT, "client", "bandicam 2026-09-29 15-40-41-975.mp4")
    v_bandicam2 = os.path.join(REPO_ROOT, "client", "bandicam 2026-09-29 19-08-23-136.mp4")
    v_speed_run = os.path.join(REPO_ROOT, "Бег_с_супер_скоростью_20260922210841.mp4")
    
    menu_img = cv2.cvtColor(cv2.imread(os.path.join(REPO_ROOT, "screenshots", "01_главное_меню.png")), cv2.COLOR_BGR2RGB)
    char_sel_img = cv2.cvtColor(cv2.imread(os.path.join(REPO_ROOT, "screenshots", "02_выбор_персонажа.png")), cv2.COLOR_BGR2RGB)
    char_cre_img = cv2.cvtColor(cv2.imread(os.path.join(REPO_ROOT, "screenshots", "03_создание_персонажа.png")), cv2.COLOR_BGR2RGB)
    
    cap1 = cv2.VideoCapture(v_bandicam1)
    cap2 = cv2.VideoCapture(v_bandicam2)
    cap_run = cv2.VideoCapture(v_speed_run)
    
    # Timeline: 21 seconds = 630 frames
    # 7 динамичных сцен по ~3 секунды:
    # 1. 0.0 - 3.0s: Реальный скоростной бег персонажа по миру (Хук: "Один человек и ИИ создают 3D MMO")
    # 2. 3.0 - 6.0s: Кадр Lineage 2 C1 (Пьедестал и окно статов) ("Вдохновлен золотой эпохой Lineage 2")
    # 3. 6.0 - 9.0s: Смена классов / создание (Оператор, Инженер, оружие) ("Разрабатываем классы и боевую систему")
    # 4. 9.0 - 12.0s: Массовый забег в открытом мире ("Сетевой код и сотни игроков на локации")
    # 5. 12.0 - 15.0s: Бой и мобы крупным планом ("Охота, сбор ресурсов и спойл деталей")
    # 6. 15.0 - 18.0s: Главное меню и город ("Игра работает прямо во вкладке браузера")
    # 7. 18.0 - 21.0s: Финал ("Следи за разработкой: t.me/ostrov_stali")
    
    total_frames = 21 * FPS # 630 frames
    
    for f in range(total_frames):
        t = f / FPS
        prog = f / total_frames
        
        # Сцена 1 (0.0 - 3.0s): Скоростной бег
        if t < 3.0:
            sub_t = t
            cap_run.set(cv2.CAP_PROP_POS_MSEC, int(sub_t * 900))
            ret, frame = cap_run.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_img
            zoom = 1.0 + (sub_t / 3.0) * 0.08
            title = ["ДЕЛАЮ 3D MMO В ОДИНОЧКУ", "Разработка с помощью искусственного интеллекта"]
            sub = ["Никаких студий и бюджетов в миллионы $", "Просто один разработчик и нейросети в деле"]
            rendered = compose_short_frame(rgb, title, sub, prog, zoom, [0.1, 0.9, 0.1, 0.9])
            
        # Сцена 2 (3.0 - 6.0s): Пьедестал C1 Lineage 2
        elif t < 6.0:
            sub_t = t - 3.0
            zoom = 1.0 + (sub_t / 3.0) * 0.1
            title = ["ДУХ КЛАССИЧЕСКОЙ LINEAGE 2", "Хроники C1 - C4 в новом прочтении"]
            sub = ["Тот самый пьедестал, статы персонажа", "И вместо маны — давление пара в котлах!"]
            rendered = compose_short_frame(char_sel_img, title, sub, prog, zoom, [0.05, 0.95, 0.05, 0.9])
            
        # Сцена 3 (6.0 - 9.0s): Создание классов
        elif t < 9.0:
            sub_t = t - 6.0
            zoom = 1.0 + (sub_t / 3.0) * 0.08
            title = ["КЛАССЫ И ЭКИПИРОВКА", "Операторы, Инженеры и Мастеровые"]
            sub = ["Паровые молоты, котловые щиты и калибраторы", "Кастомизация лица, причесок и телосложения"]
            rendered = compose_short_frame(char_cre_img, title, sub, prog, zoom, [0.1, 0.9, 0.1, 0.9])
            
        # Сцена 4 (9.0 - 12.0s): Массовый онлайн и мир
        elif t < 12.0:
            sub_t = t - 9.0
            cap2.set(cv2.CAP_PROP_POS_MSEC, int((4.0 + sub_t) * 1000))
            ret, frame = cap2.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_img
            zoom = 1.0 + (sub_t / 3.0) * 0.1
            title = ["ЖИВОЙ ОТКРЫТЫЙ МИР", "Сетевой сервер на C++ для сотен игроков"]
            sub = ["Синхронизация перемещений, событий и чата", "Без задержек и лагов прямо в реальном времени"]
            rendered = compose_short_frame(rgb, title, sub, prog, zoom, [0.2, 0.85, 0.25, 0.75])
            
        # Сцена 5 (12.0 - 15.0s): Охота и монстры
        elif t < 15.0:
            sub_t = t - 12.0
            cap1.set(cv2.CAP_PROP_POS_MSEC, int((5.0 + sub_t) * 1000))
            ret, frame = cap1.read()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ret else menu_img
            zoom = 1.0 + (sub_t / 3.0) * 0.1
            title = ["ОХОТА И СБОР ДЕТАЛЕЙ", "Одичавшие автоматоны за стенами города"]
            sub = ["Классический спойл ценных компонентов", "Крафт оружия и снаряжения в мастерских"]
            rendered = compose_short_frame(rgb, title, sub, prog, zoom, [0.15, 0.85, 0.35, 0.85])
            
        # Сцена 6 (15.0 - 18.0s): Меню и браузер
        elif t < 18.0:
            sub_t = t - 15.0
            zoom = 1.0 + (sub_t / 3.0) * 0.08
            title = ["БЕЗ УСТАНОВОК И ЛАУНЧЕРОВ", "Работает в обычном браузере на Three.js"]
            sub = ["Не нужно скачивать десятки гигабайт", "Открыл вкладку в браузере — и ты уже в игре!"]
            rendered = compose_short_frame(menu_img, title, sub, prog, zoom, [0.05, 0.95, 0.1, 0.9])
            
        # Сцена 7 (18.0 - 21.0s): Финал и Телеграм-канал
        else:
            sub_t = t - 18.0
            zoom = 1.0 + (sub_t / 3.0) * 0.05
            title = ["ОСТРОВ ПОЮЩЕЙ СТАЛИ", "Следи за созданием игры в Telegram!"]
            sub = ["t.me/ostrov_stali", "Набор на закрытые тесты и девлоги тут!"]
            rendered = compose_short_frame(menu_img, title, sub, prog, zoom, [0.15, 0.75, 0.25, 0.75])
            
        writer.write(cv2.cvtColor(rendered, cv2.COLOR_RGB2BGR))
        if f % 90 == 0:
            print(f"  Кадр {f}/{total_frames} ({int(prog*100)}%)...")
            
    cap1.release()
    cap2.release()
    cap_run.release()
    writer.release()
    print("✅ Видеоряд смонтирован. Сводим чистовой звук...")
    
    # Audio
    music_path = os.path.join(REPO_ROOT, "client", "assets", "audio", "bgm", "village_theme.ogg")
    crit_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "crit.ogg")
    soulshot_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "soulshot.ogg")
    lvl_sfx = os.path.join(REPO_ROOT, "client", "assets", "audio", "sfx", "levelup.ogg")
    
    # Audio cuts synchronized with scenes:
    # t=0.0 crit, t=3.0 lvl, t=6.0 soulshot, t=9.0 crit, t=12.0 hit, t=15.0 lvl, t=18.0 soulshot
    cmd = [
        FFMPEG, "-y",
        "-i", out_silent,
        "-i", music_path,
        "-i", crit_sfx,
        "-i", lvl_sfx,
        "-i", soulshot_sfx,
        "-filter_complex",
        "[1:a]atrim=0:21,afade=t=in:ss=0:d=1,afade=t=out:st=19.5:d=1.5,volume=0.38[bgm];"
        "[2:a]adelay=100|100,volume=1.1[s1];"
        "[3:a]adelay=3000|3000,volume=1.1[s2];"
        "[4:a]adelay=6000|6000,volume=1.1[s3];"
        "[2:a]adelay=9000|9000,volume=1.1[s4];"
        "[3:a]adelay=12000|12000,volume=1.1[s5];"
        "[4:a]adelay=15000|15000,volume=1.1[s6];"
        "[3:a]adelay=18000|18000,volume=1.2[s7];"
        "[bgm][s1][s2][s3][s4][s5][s6][s7]amix=inputs=8:duration=first:dropout_transition=2[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_mp4
    ]
    
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFMPEG error:", res.stderr)
    else:
        print(f"🎉 Готово! Итоговый ролик: {out_mp4}")
        import shutil
        shutil.copy2(out_mp4, out_skr)
        print(f"📁 Скопировано в: {out_skr}")
        
    if os.path.exists(out_silent):
        os.remove(out_silent)

if __name__ == '__main__':
    render_dynamic_solo_shorts()
