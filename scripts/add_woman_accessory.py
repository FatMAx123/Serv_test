# ============================================================
#  add_woman_accessory.py
#  Separates Accessory (заколки, бантики, серьги с жемчужинами)
#  from Haier, sets clean topology and exports woman.glb
# ============================================================
import bpy, bmesh, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
BLEND_PATH = os.path.join(WDIR, 'woman_rigged.blend')
OUT_GLB = os.path.join(WDIR, 'woman.glb')
HEAD_BONE = 'mixamorig:Head'

def log(*a):
    print('[accessory]', *a, flush=True)

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
arm = bpy.data.objects['Armature']
haier = bpy.data.objects.get('Haier')
if not haier:
    raise RuntimeError('Haier object not found in blend file!')

# 1. Check if Accessory already exists
acc = bpy.data.objects.get('Accessory')
if acc:
    log('Accessory already exists, removing old instance...')
    bpy.data.objects.remove(acc, do_unlink=True)

# 2. Duplicate Haier mesh data for Accessory
acc_mesh = haier.data.copy()
acc_mesh.name = 'Accessory'
acc = bpy.data.objects.new('Accessory', acc_mesh)
bpy.context.scene.collection.objects.link(acc)

# In Accessory, keep only faces with UV V < 0.4 (ornaments), delete hair strands (UV V >= 0.4)
bm_acc = bmesh.new()
bm_acc.from_mesh(acc_mesh)
uv_layer_acc = bm_acc.loops.layers.uv.active

faces_hair = [f for f in bm_acc.faces if any(l[uv_layer_acc].uv.y >= 0.4 for l in f.loops)]
bmesh.ops.delete(bm_acc, geom=faces_hair, context='FACES')
bm_acc.to_mesh(acc_mesh)
bm_acc.free()
acc_mesh.update()

# Also clean Haier: remove ornament faces (UV V < 0.4) so Haier only contains hair strands
bm_hair = bmesh.new()
bm_hair.from_mesh(haier.data)
uv_layer_hair = bm_hair.loops.layers.uv.active

faces_ornaments = [f for f in bm_hair.faces if any(l[uv_layer_hair].uv.y < 0.4 for l in f.loops)]
bmesh.ops.delete(bm_hair, geom=faces_ornaments, context='FACES')
bm_hair.to_mesh(haier.data)
bm_hair.free()
haier.data.update()

# 3. Configure Accessory parenting and rigging
acc.parent = arm
acc.matrix_parent_inverse = arm.matrix_world.inverted()
# Armature modifier
for m in list(acc.modifiers):
    acc.modifiers.remove(m)
mod = acc.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

# Vertex group: mixamorig:Head
acc.vertex_groups.clear()
vg = acc.vertex_groups.new(name=HEAD_BONE)
vg.add(list(range(len(acc.data.vertices))), 1.0, 'REPLACE')

# Material: woman_atlas
mat_body = bpy.data.materials.get('woman_atlas')
if mat_body:
    acc.data.materials.clear()
    acc.data.materials.append(mat_body)

log(f'Accessory created: {len(acc.data.vertices)} verts, {len(acc.data.polygons)} polys')
log(f'Haier cleaned: {len(haier.data.vertices)} verts, {len(haier.data.polygons)} polys')

# 4. Prepare export objects
body_parts = ['Head', 'tors', 'hands', 'Shorts', 'legs', 'Accessory', 'Haier']
lod0_objs = [bpy.data.objects[n] for n in body_parts if n in bpy.data.objects]
log('LOD0 export objects:', [o.name for o in lod0_objs])

bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in lod0_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm

log('Exporting woman.glb with Draco compression...')
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
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=True,
    export_anim_single_armature=True,
    export_reset_pose_bones=True,
    export_morph=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_draco_generic_quantization=12,
)

log('Export completed! File size:', f'{os.path.getsize(OUT_GLB)/1024:.0f} KB')

# 5. Save blend
bpy.ops.wm.save_mainfile()
log('woman_rigged.blend saved successfully.')

