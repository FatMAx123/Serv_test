# ============================================================
#  build_all_hairs_atlas.py — сборка 4 причесок Woman под единый атлас
#
#  Запуск:
#    "D:\3d\Blernder\blender.exe" -b --factory-startup --python scripts/build_all_hairs_atlas.py
# ============================================================
import bpy, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
ANIM_DIR = os.path.join(WDIR, 'animations')
SKIN_SRC_FBX = os.path.join(ANIM_DIR, 'Idle.fbx')
HEAD_BONE = 'mixamorig:Head'

def log(*a):
    print('[hair-builder]', *a, flush=True)

def load_armature():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SKIN_SRC_FBX, automatic_bone_orientation=False)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.name = 'Armature'
    arm.data.name = 'Armature'
    if arm.animation_data:
        arm.animation_data.action = None
    # Удаляем меши из Idle
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arm.data.pose_position = 'POSE'
    return arm

def bind_to_head(mesh_obj, arm):
    mesh_obj.parent = arm
    mesh_obj.matrix_parent_inverse = Matrix.Identity(4)
    m = mesh_obj.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    mesh_obj.vertex_groups.clear()
    g = mesh_obj.vertex_groups.new(name=HEAD_BONE)
    g.add(list(range(len(mesh_obj.data.vertices))), 1.0, 'REPLACE')

def export_draco_glb(path, objs, arm):
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_skins=True,
        export_all_influences=False,
        export_def_bones=False,
        export_animations=False,
        export_morph=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_generic_quantization=12,
    )
    sz = os.path.getsize(path) / 1024
    log(f'EXPORT OK: {os.path.basename(path)} ({sz:.1f} KB)')

# ────────────────────────────────────────────────────────────
# 1. Сборка Hair 1 (из woman_MAIN.fbx) -> Quadrant 1 (Top-Left: [0..0.5, 0.5..1.0])
# ────────────────────────────────────────────────────────────
log('=== Building Hair 1 ===')
arm = load_armature()
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=os.path.join(WDIR, 'woman_MAIN.fbx'))
new_objs = [o for o in bpy.data.objects if o not in before]
h1 = next(o for o in new_objs if o.type == 'MESH' and o.name == 'Haier')
for o in new_objs:
    if o != h1:
        bpy.data.objects.remove(o, do_unlink=True)

h1.name = 'Haier'
h1.data.name = 'Haier'
bpy.ops.object.select_all(action='DESELECT')
h1.select_set(True)
bpy.context.view_layer.objects.active = h1
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Ремаппинг UV: оригинальные UV в woman_atlas были U: 0.5..1.0, V: 0.125..1.0
# Назначаем строго в Top-Left: U in [0.0..0.5], V in [0.5..1.0]
uv_layer = h1.data.uv_layers.active
for d in uv_layer.data:
    u, v = d.uv
    un = max(0.0, min(1.0, (u - 0.5) * 2.0))
    if v >= 0.5:
        vn = (v - 0.5) * 2.0
    else:
        vn = max(0.0, min(0.3, v * 0.6))
    d.uv = (un * 0.5, 0.5 + vn * 0.5)

bind_to_head(h1, arm)
export_draco_glb(os.path.join(WDIR, 'hair.glb'), [h1], arm)

# ────────────────────────────────────────────────────────────
# 2. Сборка Hair 2 (из hair2.glb) -> Quadrant 2 (Top-Right: [0.5..1.0, 0.5..1.0])
# ────────────────────────────────────────────────────────────
log('=== Building Hair 2 ===')
arm = load_armature()
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(WDIR, 'hair2.glb'))
new_objs = [o for o in bpy.data.objects if o not in before]
h2 = next(o for o in new_objs if o.type == 'MESH')
for o in new_objs:
    if o != h2:
        bpy.data.objects.remove(o, do_unlink=True)

h2.name = 'Haier'
h2.data.name = 'Haier'
bpy.ops.object.select_all(action='DESELECT')
h2.select_set(True)
bpy.context.view_layer.objects.active = h2
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

uv_layer = h2.data.uv_layers.active
min_u = min(d.uv[0] for d in uv_layer.data)
min_v = min(d.uv[1] for d in uv_layer.data)
# Если еще не ремаплен в Top-Right:
if min_u < 0.45 or min_v < 0.45:
    for d in uv_layer.data:
        u, v = d.uv
        d.uv = (0.5 + u * 0.5, 0.5 + v * 0.5)

bind_to_head(h2, arm)
export_draco_glb(os.path.join(WDIR, 'hair2.glb'), [h2], arm)

# ────────────────────────────────────────────────────────────
# 3. Сборка Hair 3 (из hair3.fbx) -> Quadrant 3 (Bottom-Left: [0.0..0.5, 0.0..0.5])
# ────────────────────────────────────────────────────────────
log('=== Building Hair 3 ===')
arm = load_armature()
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=os.path.join(WDIR, 'hair3.fbx'))
new_objs = [o for o in bpy.data.objects if o not in before]
h3 = next(o for o in new_objs if o.type == 'MESH')
for o in new_objs:
    if o != h3:
        bpy.data.objects.remove(o, do_unlink=True)

h3.name = 'Haier'
h3.data.name = 'Haier'
bpy.ops.object.select_all(action='DESELECT')
h3.select_set(True)
bpy.context.view_layer.objects.active = h3
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Ремаппинг UV: оригинальные UV 0..1 -> Bottom-Left: u' = u*0.5, v' = v*0.5
uv_layer = h3.data.uv_layers.active
for d in uv_layer.data:
    u, v = d.uv
    d.uv = (u * 0.5, v * 0.5)

bind_to_head(h3, arm)
export_draco_glb(os.path.join(WDIR, 'hair3.glb'), [h3], arm)

# ────────────────────────────────────────────────────────────
# 4. Сборка Hair 4 (из hair4.fbx) -> Quadrant 4 (Bottom-Right: [0.5..1.0, 0.0..0.5])
# ────────────────────────────────────────────────────────────
log('=== Building Hair 4 ===')
arm = load_armature()
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=os.path.join(WDIR, 'hair4.fbx'))
new_objs = [o for o in bpy.data.objects if o not in before]
h4 = next(o for o in new_objs if o.type == 'MESH')
for o in new_objs:
    if o != h4:
        bpy.data.objects.remove(o, do_unlink=True)

h4.name = 'Haier'
h4.data.name = 'Haier'
bpy.ops.object.select_all(action='DESELECT')
h4.select_set(True)
bpy.context.view_layer.objects.active = h4
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Ремаппинг UV: оригинальные UV 0..1 -> Bottom-Right: u' = 0.5 + u*0.5, v' = v*0.5
uv_layer = h4.data.uv_layers.active
for d in uv_layer.data:
    u, v = d.uv
    d.uv = (0.5 + u * 0.5, v * 0.5)

bind_to_head(h4, arm)
export_draco_glb(os.path.join(WDIR, 'hair4.glb'), [h4], arm)

log('=== ALL 4 HAIRS EXPORTED TO DRACO GLB WITH ATLAS UVS ===')
