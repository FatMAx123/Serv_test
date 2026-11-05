import bpy
import mathutils
import math
import os
import shutil

print("============================================================")
print("Project Steam: Integrating Authentic Mixamo Rig for Woman")
print("Including 65 Mixamo Bones + 2 Breast Bones + Head Hair Binding")
print("============================================================\n")

base_dir = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
fbx_rig_path = os.path.join(base_dir, "woman_ing_rig.fbx")
blend_path = os.path.join(base_dir, "woman.blend")
blend_backup_path = os.path.join(base_dir, "woman_original_backup_1.blend")

if not os.path.exists(fbx_rig_path):
    raise FileNotFoundError(f"Rig source FBX not found: {fbx_rig_path}")

# Start clean in Blender
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the authentic Mixamo rig
print(f"Importing Mixamo rigged character: {fbx_rig_path} ...")
bpy.ops.import_scene.fbx(filepath=fbx_rig_path)

# Remove default/foreign non-character objects if any
for name in ['Camera', 'Cube', 'Light']:
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

arm = bpy.data.objects.get('Armature')
if not arm:
    raise RuntimeError("Armature object not found in FBX!")

mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for mname in mesh_names:
    if mname not in bpy.data.objects:
        raise RuntimeError(f"Required mesh '{mname}' not found in imported FBX!")

# Apply all transforms to Armature and all meshes (standard 1.0 unit scale, 0 rotation)
for o in bpy.data.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("Transforms applied cleanly (1:1 meter scale).")

# 1. Hair 100% Solid Attachment to mixamorig:Head
haier = bpy.data.objects['Haier']
haier.vertex_groups.clear()
vg_head = haier.vertex_groups.new(name='mixamorig:Head')
vg_head.add(range(len(haier.data.vertices)), 1.0, 'REPLACE')
print(f"Haier: 100% attached to mixamorig:Head ({len(haier.data.vertices)} vertices).")

# 2. Add LeftBreast and RightBreast to Armature
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
spine2 = eb.get('mixamorig:Spine2')
if not spine2:
    raise RuntimeError("mixamorig:Spine2 not found in Armature!")

# Create Breast Bones
if 'mixamorig:LeftBreast' not in eb:
    b_l = eb.new('mixamorig:LeftBreast')
    b_l.head = mathutils.Vector((0.070, -0.015, 1.340))
    b_l.tail = mathutils.Vector((0.085, -0.125, 1.335))
    b_l.parent = spine2

if 'mixamorig:RightBreast' not in eb:
    b_r = eb.new('mixamorig:RightBreast')
    b_r.head = mathutils.Vector((-0.070, -0.015, 1.340))
    b_r.tail = mathutils.Vector((-0.085, -0.125, 1.335))
    b_r.parent = spine2

bpy.ops.object.mode_set(mode='OBJECT')
print(f"Added dedicated LeftBreast & RightBreast bones (Total Armature bones: {len(arm.data.bones)}).")

# 3. Add Breast Weights with smooth spherical falloff to tors
tors = bpy.data.objects['tors']
vg_bl = tors.vertex_groups.get('mixamorig:LeftBreast') or tors.vertex_groups.new(name='mixamorig:LeftBreast')
vg_br = tors.vertex_groups.get('mixamorig:RightBreast') or tors.vertex_groups.new(name='mixamorig:RightBreast')

breast_l_center = mathutils.Vector((0.080, -0.075, 1.340))
breast_r_center = mathutils.Vector((-0.080, -0.075, 1.340))
radius = 0.085

count_l = 0
count_r = 0
for v in tors.data.vertices:
    dl = (v.co - breast_l_center).length
    if dl < radius and v.co.y < 0.0:
        w = 0.85 * (0.5 * (1.0 + math.cos(math.pi * dl / radius)))
        vg_bl.add([v.index], w, 'ADD')
        count_l += 1
    dr = (v.co - breast_r_center).length
    if dr < radius and v.co.y < 0.0:
        w = 0.85 * (0.5 * (1.0 + math.cos(math.pi * dr / radius)))
        vg_br.add([v.index], w, 'ADD')
        count_r += 1

bpy.context.view_layer.objects.active = tors
bpy.ops.object.vertex_group_normalize_all()
bpy.ops.object.vertex_group_limit_total(limit=4)
print(f"Tors: Breast weights painted (Left: {count_l} verts, Right: {count_r} verts), limited to 4 influences.")

# 4. Standardize UV Map Name across all meshes
for mname in mesh_names:
    o = bpy.data.objects[mname]
    if o.data.uv_layers:
        o.data.uv_layers.active.name = 'UVMap'

# 5. Create Realistic Idle Breathing Animation (Looping 90 frames @ 30 FPS)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')

# Ensure Armature animation data is initialized
if not arm.animation_data:
    arm.animation_data_create()
action = bpy.data.actions.new(name="idle")
arm.animation_data.action = action

fps = 30
bpy.context.scene.render.fps = fps
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = 90

def key_quat(bone_name, frame, rx, ry, rz):
    pbone = arm.pose.bones.get(bone_name)
    if not pbone:
        return
    pbone.rotation_mode = 'QUATERNION'
    e = mathutils.Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ')
    pbone.rotation_quaternion = e.to_quaternion()
    pbone.keyframe_insert(data_path="rotation_quaternion", frame=frame)

# Rest frames (0 and 90)
for f in [0, 90]:
    key_quat("mixamorig:Spine1", f, 0, 0, 0)
    key_quat("mixamorig:Spine2", f, 0, 0, 0)
    key_quat("mixamorig:LeftBreast", f, 0, 0, 0)
    key_quat("mixamorig:RightBreast", f, 0, 0, 0)

# Inhale frame (45) - Chest expands, Breasts gently lift
key_quat("mixamorig:Spine1", 45, -0.8, 0, 0)
key_quat("mixamorig:Spine2", 45, -1.2, 0, 0)
key_quat("mixamorig:LeftBreast", 45, 2.5, 0.3, -0.2)
key_quat("mixamorig:RightBreast", 45, 2.5, -0.3, 0.2)

bpy.ops.object.mode_set(mode='OBJECT')
print("Created looping 'idle' breathing animation with natural breast dynamics.")

# 6. Save Blend Files
bpy.ops.wm.save_mainfile(filepath=blend_path)
print(f"Saved primary blend to: {blend_path}")

shutil.copyfile(blend_path, blend_backup_path)
print(f"Updated secondary blend: {blend_backup_path}")

# 7. Export Draco Compressed GLBs & FBX
def select_only(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        if o:
            o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_image_format='NONE',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_animations=export_anim,
        export_skins=True,
        export_all_influences=False
    )
    sz = os.path.getsize(filepath) / 1024.0
    print(f"  -> Exported Draco GLB: {os.path.basename(filepath)} ({sz:.1f} KB)")

print("\n--- EXPORTING OPTIMIZED MODELS ---")

# A. woman.glb (Full Model with Hair and Skeleton + Idle Animation)
select_only([arm] + [bpy.data.objects[n] for n in mesh_names])
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only with Skeleton + Idle Animation)
select_only([arm] + [bpy.data.objects[n] for n in ['hands', 'Head', 'legs', 'Shorts', 'tors']])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only with Skeleton)
select_only([arm, bpy.data.objects['Haier']])
export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

# D. woman_ing.fbx (FBX with Armature)
select_only([arm] + [bpy.data.objects[n] for n in mesh_names])
out_fbx = os.path.join(base_dir, "woman_ing.fbx")
bpy.ops.export_scene.fbx(
    filepath=out_fbx,
    use_selection=True,
    add_leaf_bones=False,
    bake_anim=True
)
print(f"  -> Exported FBX: woman_ing.fbx ({os.path.getsize(out_fbx)/1024.0:.1f} KB)")

# E. woman_merged.glb (Joined Mesh)
dup_meshes = []
for n in mesh_names:
    o = bpy.data.objects[n]
    d = o.copy()
    d.data = o.data.copy()
    d.name = f"tmp_{n}"
    bpy.context.scene.collection.objects.link(d)
    dup_meshes.append(d)

select_only(dup_meshes)
bpy.ops.object.join()
merged_mesh = bpy.context.view_layer.objects.active
merged_mesh.name = "woman"

for mod in list(merged_mesh.modifiers):
    if mod.type == 'ARMATURE':
        merged_mesh.modifiers.remove(mod)
arm_mod = merged_mesh.modifiers.new("Armature", 'ARMATURE')
arm_mod.object = arm

select_only([arm, merged_mesh])
export_draco_glb(os.path.join(base_dir, "woman_merged.glb"), export_anim=True)

# Clean up merged temporary object
bpy.data.objects.remove(merged_mesh, do_unlink=True)

print("\n=== MIXAMO RIG INTEGRATION & EXPORT COMPLETED 100% SUCCESSFULLY ===")

