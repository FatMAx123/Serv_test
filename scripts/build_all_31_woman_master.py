import bpy
import os
import sys
import shutil
import mathutils

print("======================================================================")
print("Project Steam: Master 31-Animation Build (20 Combat + 11 Retargeted Emoji)")
print("======================================================================")

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
anim_dir = os.path.join(base_dir, "animations")
out_dir = base_dir

COMBAT_ANIMATIONS = [
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

EMOJI_ANIMATIONS = [
    ("afraid", lambda n: 'afraid' in n),
    ("bow", lambda n: 'bow' in n),
    ("clap", lambda n: 'clap' in n),
    ("complain", lambda n: 'complain' in n),
    ("dance", lambda n: 'dance' in n),
    ("heart_pose", lambda n: 'heart_pose' in n),
    ("laugh", lambda n: 'laugh' in n),
    ("warm_up", lambda n: 'warm_up' in n),
    ("stand_up", lambda n: 'встаёт' in n),
    ("sit_down", lambda n: 'садится' in n),
    ("sit_loop", lambda n: 'скромно сидит' in n and 'встаёт' not in n and 'садится' not in n)
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Load canonical base rigged mesh from Idle.fbx
idle_fbx = os.path.join(anim_dir, "Idle.fbx")
print(f"Loading canonical base rigged mesh from: {idle_fbx}")
bpy.ops.import_scene.fbx(filepath=idle_fbx)

arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not arm_objs:
    raise RuntimeError("No armature found in Idle.fbx!")

armA = arm_objs[0]
armA.name = "Armature"
print(f"Master Armature: {armA.name} with {len(armA.data.bones)} bones, scale: {armA.scale}")

# Remove junk objects
for o in list(bpy.data.objects):
    if o.name in ['Cube', 'Camera', 'Light', 'ParentNode']:
        bpy.data.objects.remove(o, do_unlink=True)

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for n in char_mesh_names:
    if n in bpy.data.objects:
        m = bpy.data.objects[n]
        print(f"  Found mesh part: {n} ({len(m.data.vertices)} verts)")

armA.animation_data_create()

# Handle idle action
idle_action = armA.animation_data.action
if idle_action:
    idle_action.name = "idle"
    idle_action.use_fake_user = True
    tr = armA.animation_data.nla_tracks.new()
    tr.name = "idle"
    tr.strips.new("idle", int(idle_action.frame_range[0]), idle_action)
    print("  ✅ Stashed [idle]")

# 2. Import other 19 combat animations
print("\n--- IMPORTING OTHER 19 COMBAT ANIMATIONS ---")
for clip_id, fbx_name in COMBAT_ANIMATIONS[1:]:
    fbx_full = os.path.join(anim_dir, fbx_name)
    if not os.path.exists(fbx_full):
        print(f"⚠️ Warning: File not found: {fbx_name}")
        continue
    
    bpy.ops.import_scene.fbx(filepath=fbx_full)
    new_arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o != armA]
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
    
    track = armA.animation_data.nla_tracks.new()
    track.name = clip_id
    start_f = int(act.frame_range[0])
    track.strips.new(clip_id, start_f, act)
    dur = int(act.frame_range[1] - act.frame_range[0] + 1)
    print(f"  ✅ Stashed [{clip_id}] (Frames {start_f}-{int(act.frame_range[1])}, dur={dur})")
    
    for o in list(bpy.data.objects):
        if o != armA and o.name not in char_mesh_names:
            bpy.data.objects.remove(o, do_unlink=True)

# 3. Import эмодзи.fbx and retarget 11 social/emoji actions
emoji_fbx = os.path.join(anim_dir, "эмодзи.fbx")
print(f"\n--- RETARGETING 11 EMOJI ACTIONS FROM {emoji_fbx} ---")
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

new_arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o != armA]
if not new_arms:
    raise RuntimeError("No armature found in эмодзи.fbx!")

armB = new_arms[0]
armB.name = "ArmEmoji"
if armB.parent:
    armB.parent = None

# Clear action on ArmB to obtain its neutral rest matrices
armB.animation_data.action = None
bpy.context.view_layer.update()

restA = {pb.name: (armA.matrix_world @ pb.bone.matrix_local).to_3x3() for pb in armA.pose.bones}
restB_inv = {pb.name: (armB.matrix_world @ pb.bone.matrix_local).to_3x3().inverted() for pb in armB.pose.bones if pb.name in restA}

restA_hips_pos = (armA.matrix_world @ armA.pose.bones['mixamorig:Hips'].bone.matrix_local).translation.copy()
restB_hips_pos = (armB.matrix_world @ armB.pose.bones['mixamorig:Hips'].bone.matrix_local).translation.copy()
ratio = 1.033 / max(0.1, restB_hips_pos.z)

def get_depth(b):
    d = 0
    p = b.parent
    while p:
        d += 1
        p = p.parent
    return d

sorted_bones = sorted(armA.pose.bones, key=lambda pb: get_depth(pb.bone))

# Find emoji actions with strict 1:1 predicate matching
for clip_id, predicate in EMOJI_ANIMATIONS:
    matched_acts = [a for a in bpy.data.actions if 'Armature' in a.name and predicate(a.name)]
    if not matched_acts:
        print(f"⚠️ Could not find action for '{clip_id}' in эмодзи.fbx")
        continue
    
    actB = matched_acts[0]
    f_start = int(actB.frame_range[0])
    f_end = int(actB.frame_range[1])
    dur = f_end - f_start + 1
    
    new_act = bpy.data.actions.new(name=clip_id)
    new_act.use_fake_user = True
    armA.animation_data.action = new_act
    armB.animation_data.action = actB
    
    print(f"  Retargeting [{clip_id}] from '{actB.name}' (Frames {f_start}-{f_end}, dur={dur})...")
    
    for f in range(f_start, f_end + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        
        world_rot_cache = {}
        for pbA in sorted_bones:
            pbB = armB.pose.bones.get(pbA.name)
            if not pbB or pbA.name not in restB_inv:
                continue
            
            currB = (armB.matrix_world @ pbB.matrix).to_3x3()
            delta = currB @ restB_inv[pbA.name]
            targetA_rot = delta @ restA[pbA.name]
            world_rot_cache[pbA.name] = targetA_rot
            
            if pbA.parent:
                parent_world_rot = world_rot_cache[pbA.parent.name]
                rest_local = pbA.parent.bone.matrix_local.to_3x3().inverted() @ pbA.bone.matrix_local.to_3x3()
                L = parent_world_rot.inverted() @ targetA_rot
                rel = rest_local.inverted() @ L
            else:
                arm_rot = armA.matrix_world.to_3x3()
                rest_local = pbA.bone.matrix_local.to_3x3()
                L = arm_rot.inverted() @ targetA_rot
                rel = rest_local.inverted() @ L
                
                # Precise mathematical Hips world -> local translation
                posB = (armB.matrix_world @ pbB.matrix).translation
                dispB = posB - restB_hips_pos
                target_pos_world = restA_hips_pos + dispB * ratio
                target_local = armA.matrix_world.inverted() @ target_pos_world
                pbA.location = target_local - pbA.bone.matrix_local.translation
                pbA.keyframe_insert(data_path="location", frame=f)
            
            pbA.rotation_quaternion = rel.to_quaternion()
            pbA.keyframe_insert(data_path="rotation_quaternion", frame=f)
    
    # Stash newly retargeted action onto NLA track
    track = armA.animation_data.nla_tracks.new()
    track.name = clip_id
    track.strips.new(clip_id, f_start, new_act)
    print(f"  ✅ Stashed [{clip_id}]")

# Unset active action
armA.animation_data.action = None

# Delete ArmB and all non-main objects
for o in list(bpy.data.objects):
    if o != armA and o.name not in char_mesh_names:
        bpy.data.objects.remove(o, do_unlink=True)

# Clean up raw emoji actions from bpy.data.actions so only the 31 actions remain
expected_names = set([c[0] for c in COMBAT_ANIMATIONS] + [c[0] for c in EMOJI_ANIMATIONS])
for act in list(bpy.data.actions):
    if act.name not in expected_names:
        bpy.data.actions.remove(act, do_unlink=True)

total_tracks = len(armA.animation_data.nla_tracks)
total_actions = len(bpy.data.actions)
print(f"\nTotal NLA animation tracks on Armature: {total_tracks} (Expected 31)")
print(f"Total Actions in scene: {total_actions} (Expected 31)")

# Clear embedded textures/materials to keep GLBs ultra lightweight
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
    print(f"Exporting Draco GLB: {os.path.basename(filepath)} (anims={export_anim})...")
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
    print(f"  -> Successfully Exported: {os.path.basename(filepath)} ({sz:.1f} KB)")

print("\n--- EXPORTING OPTIMIZED 31-ANIMATION GLB MODELS ---")

# A. woman.glb (Modular 6 meshes + 31 animations)
export_objs = [armA] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(out_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only, No Hair + 31 animations)
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([armA] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(out_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only, Static)
if 'Haier' in bpy.data.objects:
    select_only([armA, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(out_dir, "hair.glb"), export_anim=False)

# D. woman_merged.glb (Joined Mesh + 31 animations)
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
arm_mod.object = armA

select_only([armA, merged_mesh])
export_draco_glb(os.path.join(out_dir, "woman_merged.glb"), export_anim=True)

bpy.data.objects.remove(merged_mesh, do_unlink=True)

# Synchronize directly to local GM build and dist/client
targets = [
    r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman",
    r"D:\games\yandex\лайнэйдж\project-steam1\dist\client\assets\Characters\engi\Woman"
]

for t in targets:
    if os.path.exists(t):
        print(f"\n--- SYNCING TO {t} ---")
        for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
            src_f = os.path.join(out_dir, fname)
            dst_f = os.path.join(t, fname)
            if os.path.exists(src_f):
                shutil.copy2(src_f, dst_f)
                print(f"  ✓ Copied {fname} ({os.path.getsize(dst_f)/1024:.1f} KB)")

print("\n=== MASTER 31-ANIMATION BUILD COMPLETED SUCCESSFULLY ===")
