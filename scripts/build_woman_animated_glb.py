import bpy
import os
import sys
import shutil

print("============================================================")
print("Project Steam: Build Animated Woman GLB from Idle.fbx & FBX Anims")
print("============================================================")

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
anim_dir = os.path.join(base_dir, "animations")
out_dir = base_dir

ANIMATIONS = [
    ("idle", "Idle.fbx"),
    ("walk", "Walk.fbx"),
    ("fast_run", "Fast Run.fbx"),
    ("boxing", "Boxing.fbx"),
    ("sword_slash", "Sword And Shield Slash.fbx"),
    ("sword_run", "Sword And Shield Run.fbx"),
    ("power_up", "Sword And Shield Power Up.fbx"),
    ("sword_cast_1", "Sword And Shield Casting.fbx"),
    ("sword_cast_2", "Sword And Shield Casting (1).fbx"),
    ("cast_1h", "Standing 1H Cast Spell 01.fbx"),
    ("attack_1h", "Standing 1H Magic Attack 03.fbx"),
    ("cast_2h", "Standing 2H Cast Spell 01.fbx"),
    ("attack_2h", "Standing 2H Magic Attack 05.fbx"),
    ("area_attack_1", "Standing 2H Magic Area Attack 01.fbx"),
    ("area_attack_2", "Standing 2H Magic Area Attack 02.fbx"),
    ("great_sword_cast", "Great Sword Casting.fbx"),
    ("death_back", "Flying Back Death.fbx"),
    ("death_front", "Standing React Death Forward.fbx"),
    ("death_sword_1", "Sword And Shield Death.fbx"),
    ("death_sword_2", "Sword And Shield Death (1).fbx")
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Import base rigged model from Idle.fbx
idle_fbx = os.path.join(anim_dir, "Idle.fbx")
print(f"Loading base rigged mesh from: {idle_fbx}")
bpy.ops.import_scene.fbx(filepath=idle_fbx)

arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not arm_objs:
    raise RuntimeError("No armature found in Idle.fbx!")

arm_obj = arm_objs[0]
arm_obj.name = "Armature"
print(f"Base Armature: {arm_obj.name} with {len(arm_obj.data.bones)} bones, scale: {arm_obj.scale}")

# Remove junk objects
for o in list(bpy.data.objects):
    if o.name in ['Cube', 'Camera', 'Light', 'ParentNode']:
        print(f"Removing junk: {o.name}")
        bpy.data.objects.remove(o, do_unlink=True)

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for n in char_mesh_names:
    if n in bpy.data.objects:
        m = bpy.data.objects[n]
        print(f"  Found mesh part: {n} ({len(m.data.vertices)} verts)")

# Setup animation data on main armature
arm_obj.animation_data_create()

# Handle idle action
idle_action = arm_obj.animation_data.action
if idle_action:
    idle_action.name = "idle"
    idle_action.use_fake_user = True
    tr = arm_obj.animation_data.nla_tracks.new()
    tr.name = "idle"
    tr.strips.new("idle", int(idle_action.frame_range[0]), idle_action)
    print("  ✅ Stashed [idle]")

# 2. Import the other 19 animations
print("\n--- IMPORTING OTHER 19 ANIMATIONS ---")
for clip_id, fbx_name in ANIMATIONS[1:]:
    fbx_full = os.path.join(anim_dir, fbx_name)
    if not os.path.exists(fbx_full):
        print(f"⚠️ Warning: File not found: {fbx_name}")
        continue
    
    bpy.ops.import_scene.fbx(filepath=fbx_full)
    
    # Find newly imported armature
    new_arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o != arm_obj]
    if not new_arms:
        print(f"⚠️ No armature in {fbx_name}")
        continue
    
    temp_arm = new_arms[0]
    if not temp_arm.animation_data or not temp_arm.animation_data.action:
        print(f"⚠️ No action in {fbx_name}")
        bpy.data.objects.remove(temp_arm, do_unlink=True)
        continue
    
    act = temp_arm.animation_data.action
    act.name = clip_id
    act.use_fake_user = True
    
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = clip_id
    start_f = int(act.frame_range[0])
    track.strips.new(clip_id, start_f, act)
    
    dur = int(act.frame_range[1] - act.frame_range[0] + 1)
    print(f"  ✅ Stashed [{clip_id}] (Frames {start_f}-{int(act.frame_range[1])}, dur={dur})")
    
    # Delete temporary imported objects from this FBX
    for o in list(bpy.data.objects):
        if o != arm_obj and o.name not in char_mesh_names:
            bpy.data.objects.remove(o, do_unlink=True)

# Unset active action so it doesn't mask NLA tracks
arm_obj.animation_data.action = None

# Clear embedded textures and materials to keep GLB lightweight and fast (<2MB)
for img in list(bpy.data.images):
    bpy.data.images.remove(img, do_unlink=True)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat, do_unlink=True)
for n in char_mesh_names:
    if n in bpy.data.objects:
        bpy.data.objects[n].data.materials.clear()

def select_only(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        if o:
            o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    print(f"Exporting: {os.path.basename(filepath)} (anims={export_anim})...")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_animations=export_anim,
        export_animation_mode='ACTIONS',
        export_skins=True,
        export_all_influences=False,
        export_image_format='NONE'
    )
    sz = os.path.getsize(filepath) / 1024.0
    print(f"  -> Exported Draco GLB: {os.path.basename(filepath)} ({sz:.1f} KB)")

print("\n--- EXPORTING OPTIMIZED GLB MODELS ---")

# A. woman.glb (Full Model + 20 animations)
export_objs = [arm_obj] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(out_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only + 20 animations)
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([arm_obj] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(out_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only)
if 'Haier' in bpy.data.objects:
    select_only([arm_obj, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(out_dir, "hair.glb"), export_anim=False)

# D. woman_merged.glb (Joined Mesh + 20 animations)
dup_meshes = []
for n in char_mesh_names:
    if n in bpy.data.objects:
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
arm_mod.object = arm_obj

select_only([arm_obj, merged_mesh])
export_draco_glb(os.path.join(out_dir, "woman_merged.glb"), export_anim=True)

bpy.data.objects.remove(merged_mesh, do_unlink=True)

# Sync directly to dist/gm/
gm_dest = r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman"
if os.path.exists(gm_dest):
    print(f"\n--- SYNCING TO LOCAL GM BUILD: {gm_dest} ---")
    for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
        src_f = os.path.join(out_dir, fname)
        dst_f = os.path.join(gm_dest, fname)
        if os.path.exists(src_f):
            shutil.copy2(src_f, dst_f)
            print(f"  ✓ Copied {fname} -> dist/gm ({os.path.getsize(dst_f)/1024:.1f} KB)")

print("\n=== BUILD COMPLETED SUCCESSFULLY ===")
