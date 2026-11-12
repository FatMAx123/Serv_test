import bpy
import os
import shutil

print("============================================================")
print("Project Steam: Export Clean Game-Ready Woman GLB from эмодзи.fbx")
print("============================================================")

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
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

print(f"Loading: {emoji_fbx}")
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not arm_objs:
    raise RuntimeError("No armature in эмодзи.fbx!")
arm = arm_objs[0]
arm.name = "Armature"
print(f"Armature: {arm.name}, bones: {len(arm.data.bones)}, scale: {arm.scale}")

# Unparent from ParentNode if parented
if arm.parent:
    print(f"Unparenting Armature from {arm.parent.name}")
    arm.parent = None
    arm.matrix_world.identity()

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for n in char_mesh_names:
    if n in bpy.data.objects:
        m = bpy.data.objects[n]
        print(f"  Found mesh part: {n} ({len(m.data.vertices)} verts)")

# Clean NLA tracks on arm
if not arm.animation_data:
    arm.animation_data_create()
else:
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)

# Identify and stash the 11 emoji actions
stashed = 0
for act in list(bpy.data.actions):
    if 'ParentNode' in act.name:
        bpy.data.actions.remove(act, do_unlink=True)
        continue
    
    matched_id = None
    for key, clip_id in EMOJI_MAP:
        if key in act.name:
            matched_id = clip_id
            break
    
    if not matched_id:
        print(f"  Skipping non-matching action: {act.name}")
        continue
    
    act.name = matched_id
    act.use_fake_user = True
    
    tr = arm.animation_data.nla_tracks.new()
    tr.name = matched_id
    tr.strips.new(matched_id, int(act.frame_start), act)
    print(f"  ✅ Stashed [{matched_id}] (Frames {int(act.frame_start)}-{int(act.frame_end)})")
    stashed += 1

print(f"\nTotal stashed actions: {stashed}")

# Remove junk objects (ParentNode, etc.)
for o in list(bpy.data.objects):
    if o != arm and o.name not in char_mesh_names:
        print(f"Removing junk: {o.name} ({o.type})")
        bpy.data.objects.remove(o, do_unlink=True)

# Unset active action so NLA tracks are active
arm.animation_data.action = None

# Clear embedded textures/materials so client can assign WebP atlas dynamically
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

print("\n--- EXPORTING OPTIMIZED MODELS ---")

# A. woman.glb (Full Modular 6-part Model)
export_objs = [arm] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only)
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([arm] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only)
if 'Haier' in bpy.data.objects:
    select_only([arm, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

# D. woman_merged.glb (Joined Mesh)
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
arm_mod.object = arm

select_only([arm, merged_mesh])
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

print("\n=== BUILD FROM EMOJI FBX COMPLETED SUCCESSFULLY ===")

