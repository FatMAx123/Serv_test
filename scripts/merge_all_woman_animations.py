import bpy
import os
import shutil

print("============================================================")
print("Project Steam: Merge 20 Combat + 11 Emoji Anims into Woman GLB (31 total)")
print("============================================================")

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
woman_glb = os.path.join(base_dir, "woman.glb")
emoji_fbx = os.path.join(base_dir, "animations", "эмодзи.fbx")

EMOJI_MAP = [
    ("afraid", "afraid"),
    ("bow", "bow"),
    ("clap", "clap"),
    ("complain", "complain"),
    ("dance", "dance"),
    ("heart_pose", "heart_pose"),
    ("laugh", "laugh"),
    ("warm_up", "warm_up"),
    ("встаёт", "stand_up"),
    ("садится", "sit_down"),
    ("скромно сидит", "sit_loop")
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Load woman.glb
print(f"Loading existing woman.glb from: {woman_glb}")
bpy.ops.import_scene.gltf(filepath=woman_glb)

arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not arm_objs:
    raise RuntimeError("No armature in woman.glb!")
arm_woman = arm_objs[0]
arm_woman.name = "Armature"
print(f"Base Armature: {arm_woman.name}, bones: {len(arm_woman.data.bones)}")

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for n in char_mesh_names:
    if n in bpy.data.objects:
        m = bpy.data.objects[n]
        print(f"  Found mesh part: {n} ({len(m.data.vertices)} verts)")

COMBAT_ACTIONS = [
    'idle', 'walk', 'fast_run', 'sword_run', 'boxing', 'sword_slash', 'power_up',
    'sword_cast_1', 'sword_cast_2', 'cast_1h', 'attack_1h', 'cast_2h', 'attack_2h',
    'area_attack_1', 'area_attack_2', 'great_sword_cast', 'death_back', 'death_front',
    'death_sword_1', 'death_sword_2'
]

# Keep only the 20 canonical combat actions from woman.glb
for a in list(bpy.data.actions):
    if a.name not in COMBAT_ACTIONS:
        print(f"Purging non-combat action: {a.name}")
        bpy.data.actions.remove(a, do_unlink=True)

# Clean NLA tracks on arm_woman
if arm_woman.animation_data:
    for tr in list(arm_woman.animation_data.nla_tracks):
        arm_woman.animation_data.nla_tracks.remove(tr)
else:
    arm_woman.animation_data_create()

existing_actions = [a for a in bpy.data.actions if a.name in COMBAT_ACTIONS]
print(f"Canonical combat actions retained ({len(existing_actions)}):")
for a in existing_actions:
    print(f"  - {a.name}")
    tr = arm_woman.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, int(a.frame_start), a)

# 2. Import emoji.fbx
print(f"\nImporting emoji animations from: {emoji_fbx}")
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

# Find new actions created by FBX import
all_actions = list(bpy.data.actions)
new_actions = [a for a in all_actions if a not in existing_actions]
print(f"New actions imported: {len(new_actions)}")

stashed_emoji = 0
for act in new_actions:
    # We only care about Armature actions, not ParentNode
    if 'ParentNode' in act.name:
        continue
    
    # Match clean clip name
    matched_id = None
    for key, clip_id in EMOJI_MAP:
        if key in act.name:
            matched_id = clip_id
            break
    
    if not matched_id:
        print(f"  ⚠️ Skipping unmatched action: {act.name}")
        continue
    
    act.name = matched_id
    act.use_fake_user = True
    
    # Add to NLA track on arm_woman
    tr = arm_woman.animation_data.nla_tracks.new()
    tr.name = matched_id
    tr.strips.new(matched_id, int(act.frame_start), act)
    print(f"  ✅ Stashed [{matched_id}] (Frames {int(act.frame_start)}-{int(act.frame_end)})")
    stashed_emoji += 1

print(f"\nTotal stashed emoji actions: {stashed_emoji}")
print(f"Total NLA tracks on Armature: {len(arm_woman.animation_data.nla_tracks)}")

# 3. Cleanup junk objects from FBX import
for o in list(bpy.data.objects):
    if o != arm_woman and o.name not in char_mesh_names:
        print(f"Removing junk object: {o.name} ({o.type})")
        bpy.data.objects.remove(o, do_unlink=True)

# Unset active action so it doesn't mask NLA tracks
arm_woman.animation_data.action = None

# Clear embedded textures/materials to keep GLB ultra-compact
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

print("\n--- EXPORTING OPTIMIZED 31-ANIMATION GLB MODELS ---")

# A. woman.glb (Full Model + 31 animations)
export_objs = [arm_woman] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only + 31 animations)
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([arm_woman] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only)
if 'Haier' in bpy.data.objects:
    select_only([arm_woman, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

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
arm_mod.object = arm_woman

select_only([arm_woman, merged_mesh])
export_draco_glb(os.path.join(base_dir, "woman_merged.glb"), export_anim=True)

bpy.data.objects.remove(merged_mesh, do_unlink=True)

# Sync directly to dist/gm/
gm_dest = r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman"
if os.path.exists(gm_dest):
    print(f"\n--- SYNCING TO LOCAL GM BUILD: {gm_dest} ---")
    for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
        src_f = os.path.join(base_dir, fname)
        dst_f = os.path.join(gm_dest, fname)
        if os.path.exists(src_f):
            shutil.copy2(src_f, dst_f)
            print(f"  ✓ Copied {fname} -> dist/gm ({os.path.getsize(dst_f)/1024:.1f} KB)")

print("\n=== MERGE AND BUILD COMPLETED SUCCESSFULLY ===")
