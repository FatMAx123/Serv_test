# ============================================================
#  SCRIPTS / PRODUCE_LIVE_GAMEPLAY_SHORTS.PY
#  Сверхбыстрый вертикальный монтаж Shorts (1080x1920, 30 FPS)
#  из РЕАЛЬНОГО ЖИВОГО ГЕЙМПЛЕЯ Project Steam!
# ============================================================
import os
import glob
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FFMPEG = r"C:\ProgramData\miniconda3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
FRAMES_BASE = os.path.join(REPO, "live_gameplay_frames")
TEMP_VERT_DIR = os.path.join(REPO, "temp_vert_frames")

OUT_DIR = os.path.join(REPO, "screenshots")
SCRINY_DIR = os.path.join(REPO, "скрины")
OUT_MP4 = os.path.join(OUT_DIR, "01_shorts_живой_геймплей_остров_стали.mp4")
SCRINY_MP4 = os.path.join(SCRINY_DIR, "01_shorts_живой_геймплей_остров_стали.mp4")

# Аудиодорожки
BGM = os.path.join(REPO, "client", "assets", "audio", "bgm", "village_theme.ogg")
SFX_CRIT = os.path.join(REPO, "client", "assets", "audio", "sfx", "crit.ogg")
SFX_SOULSHOT = os.path.join(REPO, "client", "assets", "audio", "sfx", "soulshot.ogg")
SFX_LEVELUP = os.path.join(REPO, "client", "assets", "audio", "sfx", "levelup.ogg")
SFX_COIN = os.path.join(REPO, "client", "assets", "audio", "sfx", "pickup_crystal.ogg")

WIDTH = 1080
HEIGHT = 1920
FPS = 30

FONT_IMPACT = r"C:\Windows\Fonts\impact.ttf"
FONT_ARIAL_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

def load_fonts():
    try:
        f_title = ImageFont.truetype(FONT_IMPACT, 58)
        f_sub = ImageFont.truetype(FONT_ARIAL_BOLD, 36)
        f_badge = ImageFont.truetype(FONT_ARIAL_BOLD, 28)
        f_cta = ImageFont.truetype(FONT_IMPACT, 72)
    except Exception:
        f_title = ImageFont.load_default()
        f_sub = ImageFont.load_default()
        f_badge = ImageFont.load_default()
        f_cta = ImageFont.load_default()
    return f_title, f_sub, f_badge, f_cta

f_title, f_sub, f_badge, f_cta = load_fonts()

def create_title_overlay(top_text, sub_text, badge_text=None, is_final=False):
    """Генерирует оверлей титров один раз на сцену."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    w, h = WIDTH, HEIGHT

    if is_final:
        box_w = 960
        box_h = 440
        bx = (w - box_w) // 2
        by = (h - box_h) // 2
        
        draw.rounded_rectangle([bx, by, bx + box_w, by + box_h], radius=24, fill=(14, 18, 28, 240), outline=(230, 175, 45), width=4)
        
        t_box = draw.textbbox((0, 0), top_text, font=f_title)
        tw = t_box[2] - t_box[0]
        draw.text(((w - tw) // 2, by + 40), top_text, font=f_title, fill=(255, 215, 80))
        
        cta_text = "t.me/ostrov_stali"
        c_box = draw.textbbox((0, 0), cta_text, font=f_cta)
        cw = c_box[2] - c_box[0]
        link_y = by + 145
        draw.rounded_rectangle([(w - cw) // 2 - 30, link_y - 12, (w + cw) // 2 + 30, link_y + 88], radius=16, fill=(35, 48, 70, 245), outline=(100, 180, 255), width=3)
        draw.text(((w - cw) // 2, link_y), cta_text, font=f_cta, fill=(130, 215, 255))
        
        s_box = draw.textbbox((0, 0), sub_text, font=f_sub)
        sw = s_box[2] - s_box[0]
        draw.text(((w - sw) // 2, by + 310), sub_text, font=f_sub, fill=(225, 230, 240))
        
        tag = "#ProjectSteam #Lineage2 #IndieDev"
        tg_box = draw.textbbox((0, 0), tag, font=f_badge)
        tgw = tg_box[2] - tg_box[0]
        draw.text(((w - tgw) // 2, by + 375), tag, font=f_badge, fill=(140, 155, 175))
        return np.array(img)

    if badge_text:
        b_box = draw.textbbox((0, 0), badge_text, font=f_badge)
        bw = b_box[2] - b_box[0]
        bx = (w - bw) // 2
        draw.rounded_rectangle([bx - 18, 140, bx + bw + 18, 185], radius=10, fill=(218, 165, 32, 230))
        draw.text((bx, 145), badge_text, font=f_badge, fill=(15, 20, 25))

    t_box = draw.textbbox((0, 0), top_text, font=f_title)
    tw = t_box[2] - t_box[0]
    tx = (w - tw) // 2
    ty = 210 if badge_text else 170

    for ox, oy in [(-3, -3), (3, -3), (-3, 3), (3, 3), (0, 4), (4, 0)]:
        draw.text((tx + ox, ty + oy), top_text, font=f_title, fill=(0, 0, 0, 255))
    draw.text((tx, ty), top_text, font=f_title, fill=(255, 225, 95, 255))

    s_box = draw.textbbox((0, 0), sub_text, font=f_sub)
    sw = s_box[2] - s_box[0]
    sx = (w - sw) // 2
    sy = 1620

    draw.rounded_rectangle([sx - 24, sy - 10, sx + sw + 24, sy + 55], radius=14, fill=(10, 15, 22, 235), outline=(218, 165, 32, 160), width=2)
    draw.text((sx, sy), sub_text, font=f_sub, fill=(240, 245, 255, 255))

    channel_tag = "Telegram: @ostrov_stali"
    c_box = draw.textbbox((0, 0), channel_tag, font=f_badge)
    cw = c_box[2] - c_box[0]
    draw.text(((w - cw) // 2, 1740), channel_tag, font=f_badge, fill=(160, 180, 205, 255))

    return np.array(img)

# Базовый металлический фон
BASE_CANVAS = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
for y in range(HEIGHT):
    factor = abs(y - HEIGHT // 2) / (HEIGHT // 2)
    val_b = int(24 - factor * 12)
    val_g = int(19 - factor * 9)
    val_r = int(14 - factor * 7)
    BASE_CANVAS[y, :] = [val_b, val_g, val_r]

def render_vertical_frame(cv_img, overlay_rgba):
    """Сверхбыстро вписывает 1080px кадр по центру холста (менее 1 мс)."""
    orig_h, orig_w = cv_img.shape[:2]
    out = BASE_CANVAS.copy()

    fg_scale = WIDTH / orig_w
    fg_h = int(orig_h * fg_scale)
    fg = cv2.resize(cv_img, (WIDTH, fg_h), interpolation=cv2.INTER_LINEAR)

    fg_top = (HEIGHT - fg_h) // 2
    out[fg_top:fg_top + fg_h, 0:WIDTH] = fg

    cv2.line(out, (0, fg_top), (WIDTH, fg_top), (32, 165, 218), 3)
    cv2.line(out, (0, fg_top + fg_h), (WIDTH, fg_top + fg_h), (32, 165, 218), 3)

    alpha = overlay_rgba[:, :, 3] / 255.0
    alpha_mask = alpha[:, :, np.newaxis]
    overlay_bgr = cv2.cvtColor(overlay_rgba[:, :, :3], cv2.COLOR_RGB2BGR)

    final = (out * (1.0 - alpha_mask) + overlay_bgr * alpha_mask).astype(np.uint8)
    return final

def main():
    print("🎬 СБОРКА И МОНТАЖ SHORTS ИЗ ЖИВЫХ КАДРОВ...")
    if os.path.exists(TEMP_VERT_DIR):
        for f in glob.glob(os.path.join(TEMP_VERT_DIR, "*.jpg")):
            try: os.unlink(f)
            except: pass
    os.makedirs(TEMP_VERT_DIR, exist_ok=True)
    
    scenes_meta = [
        {
            "dir": "scene1_hero_cinematic",
            "badge": "SOLO DEV + AI",
            "title": "ММО В БРАУЗЕРЕ В ОДИНОЧКУ",
            "sub": "Один разработчик создает 3D MMO с ИИ",
            "duration": 3.4
        },
        {
            "dir": "scene2_hero_running",
            "badge": "LINEAGE 2 SPIRIT",
            "title": "ВДОХНОВЛЕНО ЗОЛОТЫМ ВЕКОМ",
            "sub": "Деревня, форты и классический дух L2",
            "duration": 3.4
        },
        {
            "dir": "scene3_hero_combat",
            "badge": "REAL COMBAT",
            "title": "ТАРГЕТ И СОУЛШОТЫ",
            "sub": "Честные бои, урон и физика геодаты",
            "duration": 3.2
        },
        {
            "dir": "scene4_hero_levelup",
            "badge": "LEVEL UP & VFX",
            "title": "СИЯНИЕ АУРЫ И ПРОГРЕСС",
            "sub": "Собственный движок C++ и Three.js",
            "duration": 3.2
        },
        {
            "dir": "scene5_char_select",
            "badge": "CHRONICLE 1",
            "title": "ТА САМАЯ АТМОСФЕРА 2000-Х",
            "sub": "Пьедестал выбора героя и система классов",
            "duration": 3.2
        },
        {
            "dir": "scene6_char_create",
            "badge": "NO DOWNLOAD",
            "title": "ЗАПУСК В ОДИН КЛИК",
            "sub": "Без скачивания тяжелых клиентов",
            "duration": 2.8
        },
        {
            "dir": "scene1_hero_cinematic",
            "badge": "TELEGRAM КАНАЛ",
            "title": "СЛЕДИ ЗА РАЗРАБОТКОЙ",
            "sub": "Остров Стали · Дневник соло-разработки",
            "duration": 3.2,
            "is_final": True
        }
    ]

    total_frames = 0
    sfx_cues = []
    current_time = 0.0

    print("⚡ Быстрый рендеринг вертикальных кадров...")
    for sc_idx, sc in enumerate(scenes_meta):
        sc_dir = os.path.join(FRAMES_BASE, sc["dir"])
        files = sorted(glob.glob(os.path.join(sc_dir, "*.jpg")))
        if not files:
            continue
        
        target_frames = int(sc["duration"] * FPS)
        print(f"  [{sc_idx+1}/{len(scenes_meta)}] {sc['title']} ({target_frames} кадров)...")

        is_fin = sc.get("is_final", False)
        overlay = create_title_overlay(sc["title"], sc["sub"], sc.get("badge"), is_final=is_fin)

        if sc_idx == 0:
            sfx_cues.append((current_time, SFX_COIN))
        elif sc_idx == 2:
            sfx_cues.append((current_time + 0.3, SFX_SOULSHOT))
            sfx_cues.append((current_time + 1.2, SFX_CRIT))
        elif sc_idx == 3:
            sfx_cues.append((current_time + 0.2, SFX_LEVELUP))
        elif sc_idx == 6:
            sfx_cues.append((current_time, SFX_LEVELUP))

        current_time += sc["duration"]

        for f_idx in range(target_frames):
            src_idx = int((f_idx / target_frames) * len(files))
            src_idx = min(src_idx, len(files) - 1)
            
            frame_bgr = cv2.imread(files[src_idx])
            if frame_bgr is None:
                continue
            
            final_frame = render_vertical_frame(frame_bgr, overlay)
            out_name = os.path.join(TEMP_VERT_DIR, f"frame_{total_frames:05d}.jpg")
            cv2.imwrite(out_name, final_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            total_frames += 1

    total_duration = total_frames / FPS
    print(f"✅ Отрендерено {total_frames} кадров ({total_duration:.1f} сек)!")

    # Кодирование видеопотока через FFmpeg напрямую из папки
    tmp_video = os.path.join(OUT_DIR, "temp_video_stream.mp4")
    if os.path.exists(tmp_video):
        try: os.unlink(tmp_video)
        except: pass

    print("🚀 Сборка MP4 через FFmpeg...")
    cmd_enc = [
        FFMPEG, "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(TEMP_VERT_DIR, "frame_%05d.jpg"),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        tmp_video
    ]
    subprocess.run(cmd_enc, check=True)

    # Сведение аудио (музыка + SFX)
    print("🎵 Сведение аудио (village_theme.ogg + SFX)...")
    audio_inputs = ["-i", tmp_video, "-i", BGM]
    filter_parts = [
        f"[1:a]aloop=loop=-1:size=2e+09,atrim=0:{total_duration},volume=0.45,afade=t=in:st=0:d=1.0,afade=t=out:st={total_duration-1.5}:d=1.5[bgm]"
    ]
    mix_sources = ["[bgm]"]

    sfx_files = [SFX_COIN, SFX_SOULSHOT, SFX_CRIT, SFX_LEVELUP]
    sfx_map = {}
    for sf in sfx_files:
        if os.path.exists(sf):
            audio_inputs.extend(["-i", sf])
            sfx_map[sf] = len(audio_inputs) // 2 - 1

    sfx_idx = 0
    for cue_time, cue_file in sfx_cues:
        if cue_file in sfx_map:
            inp_id = sfx_map[cue_file]
            delay_ms = int(cue_time * 1000)
            tag = f"sfx{sfx_idx}"
            filter_parts.append(f"[{inp_id}:a]adelay={delay_ms}|{delay_ms},volume=0.85[{tag}]")
            mix_sources.append(f"[{tag}]")
            sfx_idx += 1

    filter_complex = ";".join(filter_parts) + f";{''.join(mix_sources)}amix=inputs={len(mix_sources)}:duration=first:dropout_transition=2[aout]"

    cmd_mux = [
        FFMPEG, "-y",
        *audio_inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        OUT_MP4
    ]

    mux_res = subprocess.run(cmd_mux, capture_output=True, text=True)
    if mux_res.returncode != 0:
        print("Fallback на BGM...")
        cmd_fallback = [
            FFMPEG, "-y",
            "-i", tmp_video,
            "-i", BGM,
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            OUT_MP4
        ]
        subprocess.run(cmd_fallback, check=True)

    if os.path.exists(OUT_MP4):
        import shutil
        shutil.copy2(OUT_MP4, SCRINY_MP4)
        size_mb = os.path.getsize(OUT_MP4) / (1024 * 1024)
        print(f"\n🎉 SHORTS ИЗ ЖИВОГО ГЕЙМПЛЕЯ УСПЕШНО ГОТОВ:")
        print(f"  📁 {OUT_MP4} ({size_mb:.2f} МБ)")
        print(f"  📁 {SCRINY_MP4}")

    # Очистка временных файлов
    try: os.unlink(tmp_video)
    except: pass
    for f in glob.glob(os.path.join(TEMP_VERT_DIR, "*.jpg")):
        try: os.unlink(f)
        except: pass
    try: os.rmdir(TEMP_VERT_DIR)
    except: pass

if __name__ == "__main__":
    main()
