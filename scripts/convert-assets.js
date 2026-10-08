// ============================================================
//  SCRIPTS / CONVERT-ASSETS.JS
//  Автоматизированный конвейер 3D-ассетов Project Steam:
//  1. Конвертация FBX -> GLB с Draco-компрессией (через Blender 5.2)
//  2. Оптимизация текстур в Lineage-подобный WebP формат (max 1024x1024, 82% quality)
// ============================================================
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Пути к системным утилитам
const BLENDER_CANDIDATES = [
  'D:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe'
];

let BLENDER_PATH = BLENDER_CANDIDATES.find(p => fs.existsSync(p));

const PYTHON_CANDIDATES = [
  'C:\\ProgramData\\miniconda3\\python.exe',
  'C:\\Python314\\python.exe',
  'python'
];

let PYTHON_PATH = PYTHON_CANDIDATES.find(p => {
  if (p === 'python') return true;
  return fs.existsSync(p);
}) || 'python';

console.log('============================================================');
console.log('🎮 [CONVERT-ASSETS] 3D & Texture Pipeline (Lineage Style / Draco)');
console.log('============================================================\n');

if (!BLENDER_PATH) {
  console.error('❌ Ошибка: Blender не найден ни по одному из стандартных путей!');
  process.exit(1);
}

console.log(`🔧 Blender: ${BLENDER_PATH}`);
console.log(`🐍 Python:  ${PYTHON_PATH}\n`);

/**
 * Конвертирует единичный FBX в Draco GLB
 */
function convertFbxToGlb(fbxPath, outGlbPath, options = {}) {
  const isRigid = options.isRigid !== false; // true для оружия и пропсов (без анимаций)
  const animFlag = isRigid ? 'export_animations=False' : 'export_animations=True';
  
  const pyScript = `
import bpy
import os

bpy.ops.wm.read_factory_settings(use_empty=True)

fbx_file = r"${fbxPath.replace(/\\/g, '/')}"
glb_file = r"${outGlbPath.replace(/\\/g, '/')}"

try:
    bpy.ops.import_scene.fbx(filepath=fbx_file)
except Exception as e:
    print(f"ERROR_IMPORT: {e}")
    exit(1)

# Применяем трансформации и нормали
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except:
            pass

# Экспорт glTF 2.0 / GLB с Draco компрессией
try:
    bpy.ops.export_scene.gltf(
        filepath=glb_file,
        export_format='GLB',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_apply=True,
        ${animFlag}
    )
    print("SUCCESS_EXPORT")
except Exception as e:
    print(f"ERROR_EXPORT: {e}")
    exit(1)
`;

  const tmpPy = path.join(ROOT, 'scratch', 'temp_convert.py');
  const scratchDir = path.dirname(tmpPy);
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(tmpPy, pyScript, 'utf8');

  try {
    const cmd = `"${BLENDER_PATH}" --factory-startup -b --python "${tmpPy}"`;
    const res = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (fs.existsSync(tmpPy)) fs.unlinkSync(tmpPy);

    if (fs.existsSync(outGlbPath)) {
      const origSize = fs.statSync(fbxPath).size;
      const newSize = fs.statSync(outGlbPath).size;
      const ratio = ((1 - newSize / origSize) * 100).toFixed(1);
      console.log(`  ✓ GLB создан: ${path.basename(outGlbPath)}`);
      console.log(`    ${(origSize / 1024 / 1024).toFixed(2)} MB  →  ${(newSize / 1024 / 1024).toFixed(2)} MB  (Сжатие: -${ratio}%)\n`);
      return true;
    }
  } catch (err) {
    if (fs.existsSync(tmpPy)) fs.unlinkSync(tmpPy);
    console.error(`  ❌ Ошибка конвертации ${path.basename(fbxPath)}:`, err.message);
  }
  return false;
}

/**
 * Оптимизирует текстуру в Lineage-стиль (WebP, max 1024x1024, quality 82)
 */
function optimizeTexture(srcTexPath, outWebpPath, maxDim = 1024) {
  const pyCode = `
import sys
from PIL import Image

src = r"${srcTexPath.replace(/\\/g, '/')}"
dst = r"${outWebpPath.replace(/\\/g, '/')}"
max_dim = ${maxDim}

try:
    with Image.open(src) as img:
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA' if 'A' in img.mode else 'RGB')
            
        w, h = img.size
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
        img.save(dst, 'WEBP', quality=82, method=6)
        print("SUCCESS_TEX")
except Exception as e:
    print(f"ERROR_TEX: {e}")
    sys.exit(1)
`;

  const tmpTexPy = path.join(ROOT, 'scratch', 'temp_tex.py');
  fs.writeFileSync(tmpTexPy, pyCode, 'utf8');

  try {
    const res = execSync(`"${PYTHON_PATH}" "${tmpTexPy}"`, { encoding: 'utf8', stdio: 'pipe' });
    if (fs.existsSync(tmpTexPy)) fs.unlinkSync(tmpTexPy);

    if (fs.existsSync(outWebpPath)) {
      const origSize = fs.statSync(srcTexPath).size;
      const newSize = fs.statSync(outWebpPath).size;
      const ratio = ((1 - newSize / origSize) * 100).toFixed(1);
      console.log(`  ✓ Текстура WebP: ${path.basename(outWebpPath)} (${(origSize/1024).toFixed(0)}KB → ${(newSize/1024).toFixed(0)}KB, -${ratio}%)\n`);
      return true;
    }
  } catch (e) {
    if (fs.existsSync(tmpTexPy)) fs.unlinkSync(tmpTexPy);
    console.warn(`  ⚠️ Не удалось конвертировать текстуру ${path.basename(srcTexPath)}: ${e.message}`);
  }
  return false;
}

// ============================================================
// CLI Обработка аргументов
// ============================================================
const args = process.argv.slice(2);
if (args.length > 0) {
  const target = path.resolve(ROOT, args[0]);
  if (!fs.existsSync(target)) {
    console.error(`❌ Целевой файл или папка не существует: ${target}`);
    process.exit(1);
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const ext = path.extname(target).toLowerCase();
    if (ext === '.fbx') {
      const outGlb = path.join(path.dirname(target), path.parse(target).name + '.glb');
      console.log(`🔄 Конвертация модели: ${path.basename(target)}`);
      convertFbxToGlb(target, outGlb);
    } else if (['.png', '.jpg', '.jpeg', '.tga', '.bmp'].includes(ext)) {
      const outWebp = path.join(path.dirname(target), path.parse(target).name + '.webp');
      console.log(`🎨 Оптимизация текстуры: ${path.basename(target)}`);
      optimizeTexture(target, outWebp);
    }
  } else if (stat.isDirectory()) {
    console.log(`📂 Пакетная обработка директории: ${target}\n`);
    for (const f of fs.readdirSync(target)) {
      const p = path.join(target, f);
      if (f.endsWith('.fbx')) {
        const outGlb = path.join(target, path.parse(f).name + '.glb');
        console.log(`🔄 [FBX->GLB] ${f}`);
        convertFbxToGlb(p, outGlb);
      } else if (/\.(png|jpe?g|tga|bmp)$/i.test(f)) {
        const outWebp = path.join(target, path.parse(f).name + '.webp');
        if (!fs.existsSync(outWebp)) {
          optimizeTexture(p, outWebp);
        }
      }
    }
  }
} else {
  // Запуск по умолчанию: проверяем каталог оружия
  console.log('🔍 Режим по умолчанию: конвертация оружия из assets/weapons/models/');
  const wpDir = path.join(ROOT, 'client', 'assets', 'weapons', 'models');
  if (fs.existsSync(wpDir)) {
    const files = fs.readdirSync(wpDir).filter(f => f.endsWith('.fbx'));
    console.log(`Найдено FBX моделей оружия: ${files.length}\n`);
    for (const f of files) {
      const glbName = path.parse(f).name + '.glb';
      const glbPath = path.join(wpDir, glbName);
      if (!fs.existsSync(glbPath)) {
        console.log(`📦 Конвертация: ${f} -> ${glbName}`);
        convertFbxToGlb(path.join(wpDir, f), glbPath);
      } else {
        console.log(`  ✓ ${glbName} уже существует (пропуск)`);
      }
    }
  }
}

console.log('✨ [CONVERT-ASSETS] Обработка ассетов завершена!');
