# ============================================================
#  SCRIPTS / PRODUCE_DYNAMIC_SHORTS.PY
#  Сверхдинамичный вертикальный монтаж Shorts (1080x1920, 30 FPS)
#  из РЕАЛЬНОГО ЖИВОГО ГЕЙМПЛЕЯ Project Steam!
#  БЕЗ статики, БЕЗ черных полос, БЕЗ кринжа.
# ============================================================
import os
import glob
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FFMPEG = r"C:\ProgramData\miniconda3\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
FRAMES_BASE = os.path.join(REPO, "dynamic_gameplay_frames")
TEMP_VERT_DIR = os.path.join(REPO, "temp_dyn_frames")

OUT_DIR = os.path.join(REPO, "screenshots")
SCRINY_DIR = os.path.join(REPO, "скрины")
OUT_MP4 = os.path.join(OUT_DIR, "01_shorts_живой_геймплей_остров_стали.mp4")
SCRINY_MP4 = os.path.join(SCRINY_DIR, "01_shorts_живой_геймплей_остров_стали.mp4")

# Аудиодорожки
BGM = os.path.join(REPO, "client", "assets", "audio", "bgm", "village_theme.ogg")
SFX_SOULSHOT = os.path.join(REPO, "client", "assets", "audio", "sfx", "soulshot.ogg")
SFX_HIT = os.path.join(REPO, "client", "assets", "audio", "sfx", "hit.ogg")
SFX_CRIT = os.path.join(REPO, "client", "assets", "audio", "sfx", "crit.ogg")
SFX_AURA = os.path.join(REPO, "client", "assets", "audio", "sfx", "aura_burst.ogg")
SFX_LEVELUP = os.path.join(REPO, "client", "assets", "audio", "sfx", "levelup.ogg")
SFX_LOOT = os.path.join(REPO, "client", "assets", "audio", "sfx", "loot.ogg")

WIDTH = 1080
HEIGHT = 1920
FPS = 30

FONT_IMPACT = r"C:\Windows\Fonts\impact.ttf"
FONT_ARIAL_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

def load_fonts():
    try:
        f_title = ImageFont.truetype(FONT_IMPACT, 62)
        f_sub = ImageFont.truetype(FONT_ARIAL_BOLD, 38)
        f_badge = ImageFont.truetype(FONT_ARIAL_BOLD, 28)
        f_cta = ImageFont.truetype(FONT_IMPACT, 74)
        f_cta_sub = ImageFont.truetype(FONT_ARIAL_BOLD, 34)
    except Exception:
        f_title = ImageFont.load_default()
        f_sub = ImageFont.load_default()
        f_badge = ImageFont.load_default()
        f_cta = ImageFont.load_default()
        f_cta_sub = ImageFont.load_default()
    return f_title, f_sub, f_badge, f_cta, f_cta_sub

f_title, f_sub, f_badge, f_cta, f_cta_sub = load_fonts()

def create_title_overlay(top_text, sub_text, badge_text=None, is_final=False):
    """Генерирует чистый киношный оверлей титров."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    w, h = WIDTH, HEIGHT

    if is_final:
        # Финальная плашка с призывом в Telegram
        box_w = 980
        box_h = 440
        bx = (w - box_w) // 2
        by = (h - box_h) // 2 + 120

        # Полупрозрачный темный фон со скруглением
        draw.rounded_rectangle([bx, by, bx + box_w, by + box_h], radius=28, fill=(12, 16, 26, 240), outline=(225, 175, 45), width=4)

        # Заголовок проекта
        t_box = draw.textbbox((0, 0), top_text, font=f_title)
        tw = t_box[2] - t_box[0]
        draw.text(((w - tw) // 2, by + 36), top_text, font=f_title, fill=(255, 215, 80))

        # Неоновая кнопка ссылки на канал
        cta_text = "t.me/ostrov_stali"
        c_box = draw.textbbox((0, 0), cta_text, font=f_cta)
        cw = c_box[2] - c_box[0]
        link_y = by + 140
        draw.rounded_rectangle([(w - cw) // 2 - 32, link_y - 10, (w + cw) // 2 + 32, link_y + 86], radius=18, fill=(28, 44, 68, 245), outline=(100, 195, 255), width=3)
        draw.text(((w - cw) // 2, link_y), cta_text, font=f_cta, fill=(140, 225, 255))

        # Подзаголовок
        s_box = draw.textbbox((0, 0), sub_text, font=f_cta_sub)
        sw = s_box[2] - s_box[0]
        draw.text(((w - sw) // 2, by + 300), sub_text, font=f_cta_sub, fill=(235, 240, 250))

        # Хэштеги
        tag = "#ProjectSteam  #Lineage2  #IndieDev"
        tg_box = draw.textbbox((0, 0), tag, font=f_badge)
        tgw = tg_box[2] - tg_box[0]
        draw.text(((w - tgw) // 2, by + 370), tag, font=f_badge, fill=(145, 165, 190))
        return np.array(img)

    # Верхний бейдж категории
    if badge_text:
        b_box = draw.textbbox((0, 0), badge_text, font=f_badge)
        bw = b_box[2] - b_box[0]
        bx = (w - bw) // 2
        draw.rounded_rectangle([bx - 20, 135, bx + bw + 20, 180], radius=10, fill=(225, 170, 35, 240))
        draw.text((bx, 140), badge_text, font=f_badge, fill=(15, 20, 25))

    # Главный ударный заголовок (верхняя треть)
    t_box = draw.textbbox((0, 0), top_text, font=f_title)
    tw = t_box[2] - t_box[0]
    tx = (w - tw) // 2
    ty = 205 if badge_text else 165

    # Четкая черная обводка для 100% читаемости
    for ox, oy in [(-3, -3), (3, -3), (-3, 3), (3, 3), (0, 4), (4, 0), (-3, 0), (0, -3)]:
        draw.text((tx + ox, ty + oy), top_text, font=f_title, fill=(0, 0, 0, 255))
    draw.text((tx, ty), top_text, font=f_title, fill=(255, 225, 95, 255))

    # Нижняя подпись с контекстом
    s_box = draw.textbbox((0, 0), sub_text, font=f_sub)
    sw = s_box[2] - s_box[0]
    sx = (w - sw) // 2
    sy = 1620

    draw.rounded_rectangle([sx - 24, sy - 12, sx + sw + 24, sy + 58], radius=16, fill=(10, 15, 24, 230), outline=(225, 175, 45, 180), width=2)
    draw.text((sx, sy), sub_text, font=f_sub, fill=(245, 248, 255, 255))

    # Маленькая плашка Telegram внизу
    channel_tag = "Telegram: @ostrov_stali"
    c_box = draw.textbbox((0, 0), channel_tag, font=f_badge)
    cw = c_box[2] - c_box[0]
    draw.text(((w - cw) // 2, 1740), channel_tag, font=f_badge, fill=(160, 190, 225, 255))

    return np.array(img)

def render_frame(cv_img, overlay_rgba):
    """Масштабирует нативный вертикальный 1080p кадр на весь экран без черных полос."""
    orig_h, orig_w = cv_img.shape[:2]
    
    # Прямое масштабирование в 1080x1920 (разница пропорций < 2%, выглядит идеально)
    frame_scaled = cv2.resize(cv_img, (WIDTH, HEIGHT), interpolation=cv2.INTER_LINEAR)

    # Наложение RGBA титров через альфа-канал
    alpha = overlay_rgba[:, :, 3] / 255.0
    alpha_mask = alpha[:, :, np.newaxis]
    overlay_bgr = cv2.cvtColor(overlay_rgba[:, :, :3], cv2.COLOR_RGB2BGR)

    final = (frame_scaled * (1.0 - alpha_mask) + overlay_bgr * alpha_mask).astype(np.uint8)
    return final

def main():
    print("🎬 МОНТАЖ СВЕРХДИНАМИЧНОГО SHORTS ИЗ ЖИВЫХ КАДРОВ...")
    if os.path.exists(TEMP_VERT_DIR):
        for f in glob.glob(os.path.join(TEMP_VERT_DIR, "*.jpg")):
            try: os.unlink(f)
            except: pass
    os.makedirs(TEMP_VERT_DIR, exist_ok=True)
    
    scenes_meta = [
        {
            "dir": "scene1_hero_sprint",
            "badge": "СОЛО-РАЗРАБОТКА + ИИ",
            "title": "ММО В ОДИНОЧКУ В БРАУЗЕРЕ?",
            "sub": "Один разработчик создает 3D мир с ИИ",
            "duration": 2.6
        },
        {
            "dir": "scene2_target_soulshot",
            "badge": "LINEAGE 2 VIBE",
            "title": "АТМОСФЕРА КЛАССИКИ",
            "sub": "Таргет, соулшоты и дух золотого века",
            "duration": 2.2
        },
        {
            "dir": "scene3_combat_crits",
            "badge": "REAL COMBAT",
            "title": "КРИТИЧЕСКИЙ УРОН И БОЙ",
            "sub": "C++ сервер, расчет урона и геодата",
            "duration": 2.8
        },
        {
            "dir": "scene4_levelup_aura",
            "badge": "LEVEL UP",
            "title": "ТОТ САМЫЙ ЗОЛОТОЙ СТОЛБ",
            "sub": "Сияние ауры и знакомый звук победы",
            "duration": 2.8
        },
        {
            "dir": "scene5_hero_showcase",
            "badge": "TELEGRAM КАНАЛ",
            "title": "СЛЕДИ ЗА РАЗРАБОТКОЙ",
            "sub": "Остров Стали · Дневник соло-разработки",
            "duration": 3.4,
            "is_final": True
        }
    ]

    total_frames = 0
    sfx_cues = []
    current_time = 0.0

    print("⚡ Рендеринг вертикальных кадров...")
    for sc_idx, sc in enumerate(scenes_meta):
        sc_dir = os.path.join(FRAMES_BASE, sc["dir"])
        files = sorted(glob.glob(os.path.join(sc_dir, "*.jpg")))
        if not files:
            print(f"⚠️ Папка {sc['dir']} пуста, пропускаем.")
            continue
        
        target_frames = int(sc["duration"] * FPS)
        print(f"  [{sc_idx+1}/{len(scenes_meta)}] {sc['title']} ({target_frames} кадров)...")

        is_fin = sc.get("is_final", False)
        overlay = create_title_overlay(sc["title"], sc["sub"], sc.get("badge"), is_final=is_fin)

        # Расстановка аудиометок под видеоряд
        if sc_idx == 0:
            pass
        elif sc_idx == 1:
            sfx_cues.append((current_time + 0.3, SFX_SOULSHOT))
        elif sc_idx == 2:
            sfx_cues.append((current_time + 0.2, SFX_HIT))
            sfx_cues.append((current_time + 1.2, SFX_CRIT))
            sfx_cues.append((current_time + 2.0, SFX_HIT))
        elif sc_idx == 3:
            sfx_cues.append((current_time + 0.1, SFX_AURA))
            sfx_cues.append((current_time + 0.4, SFX_LEVELUP))
        elif sc_idx == 4:
            sfx_cues.append((current_time + 0.2, SFX_LOOT))

        current_time += sc["duration"]

        for f_idx in range(target_frames):
            src_idx = int((f_idx / target_frames) * len(files))
            src_idx = min(src_idx, len(files) - 1)
            
            frame_bgr = cv2.imread(files[src_idx])
            if frame_bgr is None:
                continue
            
            final_frame = render_frame(frame_bgr, overlay)
            out_name = os.path.join(TEMP_VERT_DIR, f"frame_{total_frames:05d}.jpg")
            cv2.imwrite(out_name, final_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            total_frames += 1

    total_duration = current_time
    print(f"✅ Отрендерено {total_frames} кадров ({total_duration:.2f} сек, {FPS} FPS).")

    # Сведение аудио и видео через FFmpeg
    print("🎵 Сведение музыки, звуковых эффектов и видео...")
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(SCRINY_DIR, exist_ok=True)

    inputs = []
    # 0: Видеоряд из кадров
    inputs.extend(["-framerate", str(FPS), "-i", os.path.join(TEMP_VERT_DIR, "frame_%05d.jpg")])
    # 1: Фоновая музыка
    inputs.extend(["-stream_loop", "-1", "-i", BGM])

    # SFX инпуты
    sfx_filter_chains = []
    for s_idx, (cue_time, sfx_path) in enumerate(sfx_cues):
        if os.path.exists(sfx_path):
            inputs.extend(["-i", sfx_path])
            in_idx = 2 + len(sfx_filter_chains)
            delay_ms = int(cue_time * 1000)
            sfx_filter_chains.append(f"[{in_idx}:a]adelay={delay_ms}|{delay_ms},volume=0.85[sfx{s_idx}]")

    # Фильтр-граф аудио
    filter_parts = []
    # BGM: плавный fade in и fade out, комфортная громкость 0.38
    filter_parts.append(f"[1:a]volume=0.38,afade=t=in:ss=0:d=0.5,afade=t=out:st={total_duration - 1.2}:d=1.2[bgm]")
    
    # Добавляем цепочки задержки звуков
    filter_parts.extend(sfx_filter_chains)

    # Микширование BGM + SFX
    mix_inputs = ["[bgm]"] + [f"[sfx{i}]" for i in range(len(sfx_filter_chains))]
    filter_parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first:dropout_transition=2[aout]")

    full_filter = ";".join(filter_parts)

    cmd = [
        FFMPEG, "-y",
        *inputs,
        "-filter_complex", full_filter,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", f"{total_duration:.2f}",
        OUT_MP4
    ]

    print("⚡ Запуск финального кодирования FFmpeg H.264 / AAC...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("❌ Ошибка сборки FFmpeg:")
        print(res.stderr[-1000:])
        return

    # Дублируем в папку скрины
    if os.path.exists(OUT_MP4):
        import shutil
        shutil.copy2(OUT_MP4, SCRINY_MP4)
        size_mb = os.path.getsize(OUT_MP4) / (1024 * 1024)
        print(f"🎉 ГОТОВО! Ролик смонтирован:")
        print(f"   📹 {OUT_MP4} ({size_mb:.2f} МБ, {total_duration:.1f} сек)")
        print(f"   📹 {SCRINY_MP4}")

    # Очистка временных файлов
    for f in glob.glob(os.path.join(TEMP_VERT_DIR, "*.jpg")):
        try: os.unlink(f)
        except: pass
    try: os.rmdir(TEMP_VERT_DIR)
    except: pass

if __name__ == "__main__":
    main()
