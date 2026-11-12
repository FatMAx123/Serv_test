import bpy
import os
import shutil
import bmesh
import mathutils

print("============================================================")
print("Project Steam: Merge ALL 31 Animations (20 Combat + 11 Emoji)")
print("============================================================")

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
combat_glb = r"D:\games\yandex\лайнэйдж\project-steam1\dist\client\assets\Characters\engi\Woman\woman.glb"
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

COMBAT_ACTIONS = [
    'idle', 'walk', 'fast_run', 'sword_run', 'boxing', 'sword_slash', 'power_up',
    'sword_cast_1', 'sword_cast_2', 'cast_1h', 'attack_1h', 'cast_2h', 'attack_2h',
    'area_attack_1', 'area_attack_2', 'great_sword_cast', 'death_back', 'death_front',
    'death_sword_1', 'death_sword_2'
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Load the 20 combat actions from dist/client woman.glb
print(f"Loading 20 combat actions from: {combat_glb}")
bpy.ops.import_scene.gltf(filepath=combat_glb)

# Collect combat actions
combat_actions_loaded = {}
for a in list(bpy.data.actions):
    if a.name in COMBAT_ACTIONS:
        a.use_fake_user = True
        combat_actions_loaded[a.name] = a
        print(f"  ✓ Preserved combat action: {a.name} ({a.frame_range[0]:.0f}..{a.frame_range[1]:.0f})")

print(f"Total combat actions preserved: {len(combat_actions_loaded)}/20")

# Delete objects from gltf import to keep scene clean
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# 2. Import base mesh and armature from эмодзи.fbx (has true meter scale)
print(f"\nLoading base mesh and emoji actions from: {emoji_fbx}")
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
arm.name = "Armature"
if arm.parent:
    arm.parent = None
    arm.matrix_world.identity()

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']

# Collect emoji actions
emoji_actions_loaded = {}
for act in list(bpy.data.actions):
    if 'ParentNode' in act.name:
        bpy.data.actions.remove(act, do_unlink=True)
        continue
    
    matched_id = None
    for key, clip_id in EMOJI_MAP:
        if key in act.name:
            matched_id = clip_id
            break
    if not matched_id: continue
    
    act.name = matched_id
    act.use_fake_user = True
    emoji_actions_loaded[matched_id] = act
    print(f"  ✓ Preserved emoji action: {matched_id} ({act.frame_range[0]:.0f}..{act.frame_range[1]:.0f})")

print(f"Total emoji actions preserved: {len(emoji_actions_loaded)}/11")

# Clean existing NLA tracks on main armature
if not arm.animation_data:
    arm.animation_data_create()
else:
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)

# 3. Stash ALL 31 actions onto Armature NLA tracks
all_actions = {}
all_actions.update(combat_actions_loaded)
all_actions.update(emoji_actions_loaded)

print(f"\n--- STASHING ALL {len(all_actions)} ACTIONS ---")
for clip_name, act in all_actions.items():
    tr = arm.animation_data.nla_tracks.new()
    tr.name = clip_name
    tr.strips.new(clip_name, int(act.frame_start), act)
    print(f"  ✅ Stashed NLA track: [{clip_name}]")

# Remove junk objects
for o in list(bpy.data.objects):
    if o != arm and o.name not in char_mesh_names:
        bpy.data.objects.remove(o, do_unlink=True)

arm.animation_data.action = None

# Clear materials
for img in list(bpy.data.images): bpy.data.images.remove(img, do_unlink=True)
for mat in list(bpy.data.materials): bpy.data.materials.remove(mat, do_unlink=True)
for n in char_mesh_names:
    if n in bpy.data.objects:
        bpy.data.objects[n].data.materials.clear()

# ─── 4. GEOMETRY ENHANCEMENT: EXTEND SHORTS WAISTBAND (+2.0 cm collar) ───
shorts = bpy.data.objects['Shorts']
bm = bmesh.new()
bm.from_mesh(shorts.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()

max_z_s = max(v.co.z for v in bm.verts)
top_boundary_edges = [e for e in bm.edges if e.is_boundary and e.verts[0].co.z > max_z_s - 0.04 and e.verts[1].co.z > max_z_s - 0.04]
print(f"\nFound {len(top_boundary_edges)} top boundary edges on Shorts.")

ext = bmesh.ops.extrude_edge_only(bm, edges=top_boundary_edges)
extruded_verts = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]

for ev in extruded_verts:
    ev.co.z += 0.020
    ev.co.x *= 0.985
    ev.co.y *= 0.985

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(shorts.data)
bm.free()
shorts.data.update()
print(f"✅ Extruded {len(extruded_verts)} waist vertices upward (+2.0 cm tuck-in collar).")

# ─── 5. ROBUST ANTI-TEAR SKINNING ─────────────────────────────
tors = bpy.data.objects['tors']

def get_or_create_vg(obj, name):
    vg = obj.vertex_groups.get(name)
    if not vg:
        vg = obj.vertex_groups.new(name=name)
    return vg

# Clean TORS weights
vg_hips_t = get_or_create_vg(tors, 'mixamorig:Hips')
vg_spine_t = get_or_create_vg(tors, 'mixamorig:Spine')
vg_lleg_t = tors.vertex_groups.get('mixamorig:LeftUpLeg')
vg_rleg_t = tors.vertex_groups.get('mixamorig:RightUpLeg')

min_zt = min(v.co.z for v in tors.data.vertices)

for v in tors.data.vertices:
    if vg_lleg_t: vg_lleg_t.remove([v.index])
    if vg_rleg_t: vg_rleg_t.remove([v.index])
    if v.co.z < min_zt + 0.06:
        t = (v.co.z - min_zt) / 0.06
        w_hips = (1.0 - t) * 0.50
        w_spine = 1.0 - w_hips
        vg_hips_t.add([v.index], w_hips, 'REPLACE')
        vg_spine_t.add([v.index], w_spine, 'REPLACE')

# Clean SHORTS weights
vg_hips_s = get_or_create_vg(shorts, 'mixamorig:Hips')
vg_spine_s = get_or_create_vg(shorts, 'mixamorig:Spine')
vg_lleg_s = get_or_create_vg(shorts, 'mixamorig:LeftUpLeg')
vg_rleg_s = get_or_create_vg(shorts, 'mixamorig:RightUpLeg')

min_zs = min(v.co.z for v in shorts.data.vertices)
max_zs = max(v.co.z for v in shorts.data.vertices)
h_s = max_zs - min_zs

for v in shorts.data.vertices:
    z_rel = (v.co.z - min_zs) / h_s
    x = v.co.x
    
    vg_hips_s.remove([v.index])
    vg_spine_s.remove([v.index])
    vg_lleg_s.remove([v.index])
    vg_rleg_s.remove([v.index])
    
    if z_rel >= 0.70:
        t = (z_rel - 0.70) / 0.30
        w_spine = 0.20 + 0.30 * t
        w_hips = 1.0 - w_spine
        vg_hips_s.add([v.index], w_hips, 'REPLACE')
        vg_spine_s.add([v.index], w_spine, 'REPLACE')
    
    elif z_rel >= 0.35:
        t = (z_rel - 0.35) / 0.35
        w_hips = 0.60 + 0.30 * t
        w_leg_total = 1.0 - w_hips
        if x > 0.01:
            w_left = w_leg_total
            w_right = 0.0
        elif x < -0.01:
            w_left = 0.0
            w_right = w_leg_total
        else:
            blend = (x + 0.01) / 0.02
            w_left = w_leg_total * blend
            w_right = w_leg_total * (1.0 - blend)
        
        vg_hips_s.add([v.index], w_hips, 'REPLACE')
        if w_left > 0.001: vg_lleg_s.add([v.index], w_left, 'REPLACE')
        if w_right > 0.001: vg_rleg_s.add([v.index], w_right, 'REPLACE')
    
    else:
        t = z_rel / 0.35
        w_hips = 0.15 * t
        w_leg_total = 1.0 - w_hips
        if x > 0.01:
            w_left = w_leg_total
            w_right = 0.0
        elif x < -0.01:
            w_left = 0.0
            w_right = w_leg_total
        else:
            blend = (x + 0.01) / 0.02
            w_left = w_leg_total * blend
            w_right = w_leg_total * (1.0 - blend)
        
        if w_hips > 0.001: vg_hips_s.add([v.index], w_hips, 'REPLACE')
        if w_left > 0.001: vg_lleg_s.add([v.index], w_left, 'REPLACE')
        if w_right > 0.001: vg_rleg_s.add([v.index], w_right, 'REPLACE')

print("✅ Applied robust skin weights on tors and Shorts.")

# ─── 6. EXPORT ALL OPTIMIZED DRACO GLB MODELS ─────────────────
def select_only(objs):
    for o in bpy.data.objects: o.select_set(False)
    for o in objs:
        if o: o.select_set(True)
    if objs: bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    print(f"\nExporting: {os.path.basename(filepath)} (anims={export_anim})...")
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
    print(f"  -> Exported: {os.path.basename(filepath)} ({sz:.1f} KB)")

# A. Modular woman.glb (ALL 31 ACTIONS)
export_objs = [arm] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (ALL 31 ACTIONS)
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([arm] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (No anims)
if 'Haier' in bpy.data.objects:
    select_only([arm, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

# D. woman_merged.glb (ALL 31 ACTIONS)
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

# Sync directly to dist/gm
gm_dest = r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman"
if os.path.exists(gm_dest):
    print(f"\n--- SYNCING TO DIST/GM: {gm_dest} ---")
    for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
        src_f = os.path.join(base_dir, fname)
        dst_f = os.path.join(gm_dest, fname)
        if os.path.exists(src_f):
            shutil.copy2(src_f, dst_f)
            print(f"  ✓ Copied {fname} -> dist/gm ({os.path.getsize(dst_f)/1024:.1f} KB)")

# Also sync to dist/client as backup
dist_client_dest = r"D:\games\yandex\лайнэйдж\project-steam1\dist\client\assets\Characters\engi\Woman"
if os.path.exists(dist_client_dest):
    print(f"\n--- SYNCING TO DIST/CLIENT: {dist_client_dest} ---")
    for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
        src_f = os.path.join(base_dir, fname)
        dst_f = os.path.join(dist_client_dest, fname)
        if os.path.exists(src_f):
            shutil.copy2(src_f, dst_f)
            print(f"  ✓ Copied {fname} -> dist/client ({os.path.getsize(dst_f)/1024:.1f} KB)")

print("\n=== MERGE ALL 31 ANIMATIONS COMPLETED SUCCESSFULLY ===")

