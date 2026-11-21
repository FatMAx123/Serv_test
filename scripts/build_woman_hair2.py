# ============================================================
#  build_woman_hair2.py — генерация hair2.glb (Draco) для Woman
#
#  Запуск:
#    "D:\3d\Blernder\blender.exe" -b --factory-startup --python scripts/build_woman_hair2.py
# ============================================================
import bpy, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
ANIM_DIR = os.path.join(WDIR, 'animations')
HAIR2_FBX = os.path.join(WDIR, 'hair2.fbx')
SKIN_SRC_FBX = os.path.join(ANIM_DIR, 'Idle.fbx')
OUT_GLB = os.path.join(WDIR, 'hair2.glb')
HEAD_BONE = 'mixamorig:Head'

def log(*a):
    print('[hair2]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Загружаем скелет из Idle.fbx
bpy.ops.import_scene.fbx(filepath=SKIN_SRC_FBX, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.name = 'Armature'
arm.data.name = 'Armature'
if arm.animation_data:
    arm.animation_data.action = None

# Удаляем исходные меши из Idle.fbx
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# Применяем трансформации к скелету
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
arm.data.pose_position = 'POSE'

# 2. Загружаем hair2.fbx
before_hair = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=HAIR2_FBX)
new_objs = [o for o in bpy.data.objects if o not in before_hair]

# Находим меш причёски (tripo_node_391370e7 или любой другой MESH)
hair_mesh = None
for o in new_objs:
    if o.type == 'MESH' and o.name.startswith('tripo_node'):
        hair_mesh = o
    elif o.type == 'MESH' and 'Cube' not in o.name:
        hair_mesh = o

if not hair_mesh:
    # Фоллбек: первый не-куб меш
    hair_mesh = next(o for o in new_objs if o.type == 'MESH')

log('Found hair mesh:', hair_mesh.name, 'verts:', len(hair_mesh.data.vertices))

# Удаляем мусорные объекты из hair2.fbx (Camera, Light, Cube)
for o in new_objs:
    if o != hair_mesh:
        bpy.data.objects.remove(o, do_unlink=True)

# Называем меш единообразно
hair_mesh.name = 'Haier'
hair_mesh.data.name = 'Haier'

# Применяем трансформации меша
bpy.ops.object.select_all(action='DESELECT')
hair_mesh.select_set(True)
bpy.context.view_layer.objects.active = hair_mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 3. Привязка к скелету и кости mixamorig:Head
hair_mesh.parent = arm
hair_mesh.matrix_parent_inverse = Matrix.Identity(4)
m = hair_mesh.modifiers.new('Armature', 'ARMATURE')
m.object = arm

# Очищаем старые группы вершин и добавляем жесткую привязку к голове
hair_mesh.vertex_groups.clear()
g = hair_mesh.vertex_groups.new(name=HEAD_BONE)
g.add(list(range(len(hair_mesh.data.vertices))), 1.0, 'REPLACE')

# Материал
mat_name = 'hair2_mat'
mat = bpy.data.materials.get(mat_name)
if not mat:
    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
hair_mesh.data.materials.clear()
hair_mesh.data.materials.append(mat)

# 4. Экспорт в GLB с Draco сжатием
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
hair_mesh.select_set(True)
bpy.context.view_layer.objects.active = arm

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
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

size_kb = os.path.getsize(OUT_GLB) / 1024
tris_count = sum(len(p.vertices) - 2 for p in hair_mesh.data.polygons)
log(f'EXPORT SUCCESS: {OUT_GLB} ({size_kb:.1f} KB, {tris_count} tris)')
