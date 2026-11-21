# ============================================================
#  rebuild_all_with_accessory.py
#  Разделение украшений (Accessory) и волос (hair1..hair4)
#
#  1. Accessory (украшения/заколка/серьги из woman_MAIN.fbx):
#     - UV U in [0.875..1.000], V in [0.125..0.250]
#     - Текстура берется с атласа персонажа (woman_atlas_2k.webp)
#     - Встраивается в woman.glb как часть персонажа на кости mixamorig:Head
#     - Не красится краской для волос!
#
#  2. hair.glb (Hair 1):
#     - Только пряди волос (UV V >= 0.5 из woman_MAIN.fbx, без украшений)
#     - UV маппинг в квадрант Hair 1: U in [0.50..0.75], V in [0.75..1.00]
#
#  3. hair2.glb, hair3.glb, hair4.glb:
#     - Чистые прически без лишних мешей (удален Icosphere)
#     - Размещены в своих суб-ячейках единого атласа волос
# ============================================================
import bpy, os, sys, shutil
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
ANIM_DIR = os.path.join(WDIR, 'animations')
MAIN_FBX = os.path.join(WDIR, 'woman_MAIN.fbx')
SKIN_SRC_FBX = os.path.join(ANIM_DIR, 'Idle.fbx')
WOMAN_GLB = os.path.join(WDIR, 'woman.glb')
HEAD_BONE = 'mixamorig:Head'

def log(*a):
    print('[acc-builder]', *a, flush=True)

def get_clean_material(name='woman_atlas'):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
    return mat

def load_armature():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SKIN_SRC_FBX, automatic_bone_orientation=False)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.name = 'Armature'
    arm.data.name = 'Armature'
    if arm.animation_data:
        arm.animation_data.action = None
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

def export_draco_glb(path, objs, arm, animations=False):
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
        export_animations=animations,
        export_animation_mode='ACTIONS' if animations else 'ACTIVE_ACTIONS',
        export_force_sampling=True if animations else False,
        export_frame_step=1,
        export_optimize_animation_size=True if animations else False,
        export_anim_single_armature=True if animations else False,
        export_reset_pose_bones=True if animations else False,
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
# 1. Сборка woman.glb: Body (Head, tors, Shorts, legs, hands) + Accessory (украшения)
#    Старая Haier удаляется (волосы теперь полностью модульные),
#    Accessory берет текстуру с woman_atlas_2k.webp!
# ────────────────────────────────────────────────────────────
log('=== 1. Rebuilding woman.glb with Accessory (ornaments) ===')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=WOMAN_GLB)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')

# Удаляем старый Haier и мусорный Icosphere
for o in list(bpy.data.objects):
    if o.type == 'MESH' and (o.name in ('Haier', 'Icosphere') or o.name.startswith('Icosphere')):
        bpy.data.objects.remove(o, do_unlink=True)

# Проверяем, есть ли уже Accessory в woman.glb
has_acc = any(o.type == 'MESH' and o.name == 'Accessory' for o in bpy.data.objects)
if not has_acc:
    # Импортируем woman_MAIN.fbx для извлечения украшений
    before_fbx = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=MAIN_FBX)
    fbx_objs = [o for o in bpy.data.objects if o not in before_fbx]
    raw_haier = next(o for o in fbx_objs if o.type == 'MESH' and o.name == 'Haier')

    # Оставляем только украшения (UV V < 0.4)
    bm = bmesh.new()
    bm.from_mesh(raw_haier.data)
    uv_layer = bm.loops.layers.uv.active

    faces_hair = [f for f in bm.faces if any(l[uv_layer].uv.y >= 0.4 for l in f.loops)]
    bmesh.ops.delete(bm, geom=faces_hair, context='FACES')
    bm.to_mesh(raw_haier.data)
    bm.free()
    raw_haier.data.update()

    raw_haier.name = 'Accessory'
    raw_haier.data.name = 'Accessory'

    # Удаляем остальные объекты из fbx
    for o in fbx_objs:
        if o != raw_haier:
            bpy.data.objects.remove(o, do_unlink=True)

    # Привязываем Accessory к arm / mixamorig:Head
    bind_to_head(raw_haier, arm)

mat_body = get_clean_material('woman_atlas')
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_body)

body_meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Icosphere')]
log(f'Final body meshes in woman.glb: {[m.name for m in body_meshes]}')
export_draco_glb(WOMAN_GLB, body_meshes, arm, animations=True)

# ────────────────────────────────────────────────────────────
# 2. Сборка hair.glb (Hair 1) — ТОЛЬКО ПРЯДИ ВОЛОС (без украшений)
# ────────────────────────────────────────────────────────────
log('=== 2. Rebuilding hair.glb (Hair 1 - strands only) ===')
arm = load_armature()
mat_h1 = get_clean_material('hair_mat')
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=MAIN_FBX)
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

# Удаляем украшения (UV V < 0.4), оставляем только пряди волос (UV V >= 0.4)
bm = bmesh.new()
bm.from_mesh(h1.data)
uv_layer = bm.loops.layers.uv.active

faces_ornaments = [f for f in bm.faces if any(l[uv_layer].uv.y < 0.4 for l in f.loops)]
bmesh.ops.delete(bm, geom=faces_ornaments, context='FACES')

# Ремаппинг UV прядей волос в квадрант Hair 1: [0.50..0.75, 0.75..1.00]
for face in bm.faces:
    for loop in face.loops:
        u, v = loop[uv_layer].uv
        un = max(0.0, min(1.0, (u - 0.5) * 2.0))
        vn = max(0.0, min(1.0, (v - 0.5) * 2.0))
        loop[uv_layer].uv = (0.50 + un * 0.25, 0.75 + vn * 0.25)

bm.to_mesh(h1.data)
bm.free()
h1.data.update()

bind_to_head(h1, arm)
h1.data.materials.clear()
h1.data.materials.append(mat_h1)

hair1_out = os.path.join(WDIR, 'hair.glb')
export_draco_glb(hair1_out, [h1], arm, animations=False)
shutil.copyfile(hair1_out, os.path.join(WDIR, 'hair1.glb'))

# ────────────────────────────────────────────────────────────
# 3. Сборка hair2.glb (Hair 2) — чистка Icosphere, UV [0.75..1.00, 0.75..1.00]
# ────────────────────────────────────────────────────────────
log('=== 3. Rebuilding hair2.glb (Hair 2) ===')
arm = load_armature()
mat_h2 = get_clean_material('hair2_mat')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(WDIR, 'hair2.glb'))
new_objs = [o for o in bpy.data.objects if o not in before]
h2 = next(o for o in new_objs if o.type == 'MESH' and o.name != 'Icosphere')
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
max_u = max(d.uv[0] for d in uv_layer.data)
min_v = min(d.uv[1] for d in uv_layer.data)
max_v = max(d.uv[1] for d in uv_layer.data)

for d in uv_layer.data:
    u, v = d.uv
    if min_u >= 0.70 and min_v >= 0.70:
        un = (u - 0.75) * 4.0
        vn = (v - 0.75) * 4.0
    elif min_u >= 0.45 and max_u >= 0.95 and min_v >= 0.45 and max_v >= 0.95:
        un = (u - 0.5) * 2.0
        vn = (v - 0.5) * 2.0
    else:
        un = u
        vn = v
    un = max(0.0, min(1.0, un))
    vn = max(0.0, min(1.0, vn))
    d.uv = (0.75 + un * 0.25, 0.75 + vn * 0.25)

bind_to_head(h2, arm)
h2.data.materials.clear()
h2.data.materials.append(mat_h2)
export_draco_glb(os.path.join(WDIR, 'hair2.glb'), [h2], arm, animations=False)

# ────────────────────────────────────────────────────────────
# 4. Сборка hair3.glb (Hair 3) — UV [0.50..0.75, 0.50..0.75]
# ────────────────────────────────────────────────────────────
log('=== 4. Rebuilding hair3.glb (Hair 3) ===')
arm = load_armature()
mat_h3 = get_clean_material('hair3_mat')
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

uv_layer = h3.data.uv_layers.active
for d in uv_layer.data:
    u, v = d.uv
    un = max(0.0, min(1.0, u))
    vn = max(0.0, min(1.0, v))
    d.uv = (0.50 + un * 0.25, 0.50 + vn * 0.25)

bind_to_head(h3, arm)
h3.data.materials.clear()
h3.data.materials.append(mat_h3)
export_draco_glb(os.path.join(WDIR, 'hair3.glb'), [h3], arm, animations=False)

# ────────────────────────────────────────────────────────────
# 5. Сборка hair4.glb (Hair 4) — UV [0.75..1.00, 0.50..0.75]
# ────────────────────────────────────────────────────────────
log('=== 5. Rebuilding hair4.glb (Hair 4) ===')
arm = load_armature()
mat_h4 = get_clean_material('hair4_mat')
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

uv_layer = h4.data.uv_layers.active
for d in uv_layer.data:
    u, v = d.uv
    un = max(0.0, min(1.0, u))
    vn = max(0.0, min(1.0, v))
    d.uv = (0.75 + un * 0.25, 0.50 + vn * 0.25)

bind_to_head(h4, arm)
h4.data.materials.clear()
h4.data.materials.append(mat_h4)
export_draco_glb(os.path.join(WDIR, 'hair4.glb'), [h4], arm, animations=False)

log('=== ALL MODELS REBUILT: ACCESSORY SEPARATED & HAIRSTYLES CALIBRATED ===')
