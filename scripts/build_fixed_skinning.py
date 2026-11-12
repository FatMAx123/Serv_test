import bpy
import os
import shutil
import bmesh
import mathutils

print("============================================================")
print("Project Steam: Build Fixed Skinning & Anti-Hole Mesh for Woman")
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
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
arm.name = "Armature"
if arm.parent:
    arm.parent = None
    arm.matrix_world.identity()

char_mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']

# Clean NLA tracks
if not arm.animation_data:
    arm.animation_data_create()
else:
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)

# Stash actions
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
    if not matched_id: continue
    
    act.name = matched_id
    act.use_fake_user = True
    tr = arm.animation_data.nla_tracks.new()
    tr.name = matched_id
    tr.strips.new(matched_id, int(act.frame_start), act)
    stashed += 1

print(f"Stashed {stashed} clean actions.")

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

# ─── 1. GEOMETRY ENHANCEMENT: EXTEND SHORTS WAISTBAND (TUCK-IN COLLAR) ───
shorts = bpy.data.objects['Shorts']
bm = bmesh.new()
bm.from_mesh(shorts.data)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()

# Find boundary edges of the top waistband
max_z_s = max(v.co.z for v in bm.verts)
top_boundary_edges = [e for e in bm.edges if e.is_boundary and e.verts[0].co.z > max_z_s - 0.04 and e.verts[1].co.z > max_z_s - 0.04]
print(f"Found {len(top_boundary_edges)} top boundary edges on Shorts.")

# Extrude waistband upward by 0.020 m (2.0 cm) slightly scaled inward by 2% to fit snugly inside torso
ext = bmesh.ops.extrude_edge_only(bm, edges=top_boundary_edges)
extruded_geom = ext['geom']
extruded_verts = [g for g in extruded_geom if isinstance(g, bmesh.types.BMVert)]

for ev in extruded_verts:
    ev.co.z += 0.020 # 2 cm upward overlap
    ev.co.x *= 0.985 # slightly snug
    ev.co.y *= 0.985

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(shorts.data)
bm.free()
shorts.data.update()
print(f"✅ Extruded {len(extruded_verts)} waist vertices upward (+2.0 cm tuck-in collar).")

# ─── 2. PROFESSIONAL WEIGHT REMAPPING ─────────────────────────
tors = bpy.data.objects['tors']

def get_or_create_vg(obj, name):
    vg = obj.vertex_groups.get(name)
    if not vg:
        vg = obj.vertex_groups.new(name=name)
    return vg

# A. Clean TORS weights
vg_hips_t = get_or_create_vg(tors, 'mixamorig:Hips')
vg_spine_t = get_or_create_vg(tors, 'mixamorig:Spine')
vg_lleg_t = tors.vertex_groups.get('mixamorig:LeftUpLeg')
vg_rleg_t = tors.vertex_groups.get('mixamorig:RightUpLeg')

min_zt = min(v.co.z for v in tors.data.vertices)

for v in tors.data.vertices:
    # Strip any nonsensical leg weights on the t-shirt
    if vg_lleg_t: vg_lleg_t.remove([v.index])
    if vg_rleg_t: vg_rleg_t.remove([v.index])
    
    # Smooth lower waist hem
    if v.co.z < min_zt + 0.06:
        t = (v.co.z - min_zt) / 0.06
        w_hips = (1.0 - t) * 0.50
        w_spine = 1.0 - w_hips
        vg_hips_t.add([v.index], w_hips, 'REPLACE')
        vg_spine_t.add([v.index], w_spine, 'REPLACE')

# B. Clean SHORTS weights
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
    
    # Remove existing on these 4
    vg_hips_s.remove([v.index])
    vg_spine_s.remove([v.index])
    vg_lleg_s.remove([v.index])
    vg_rleg_s.remove([v.index])
    
    if z_rel >= 0.70:
        # Waistband + extruded tuck-in: strictly Hips + Spine, ZERO leg weights!
        t = (z_rel - 0.70) / 0.30
        w_spine = 0.20 + 0.30 * t
        w_hips = 1.0 - w_spine
        vg_hips_s.add([v.index], w_hips, 'REPLACE')
        vg_spine_s.add([v.index], w_spine, 'REPLACE')
    
    elif z_rel >= 0.35:
        # Pelvis & Buttocks: Hips dominates to prevent collapsing/pinching!
        t = (z_rel - 0.35) / 0.35
        w_hips = 0.60 + 0.30 * t # 60% at bottom to 90% at top
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
        # Lower leg openings
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

# ─── 3. EXPORT CLEAN DRACO GLB MODELS ─────────────────────────
def select_only(objs):
    for o in bpy.data.objects: o.select_set(False)
    for o in objs:
        if o: o.select_set(True)
    if objs: bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    print(f"Exporting: {os.path.basename(filepath)}...")
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
    print(f"  -> {os.path.basename(filepath)} ({sz:.1f} KB)")

# A. Modular woman.glb
export_objs = [arm] + [bpy.data.objects[n] for n in char_mesh_names if n in bpy.data.objects]
select_only(export_objs)
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb
body_mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Head']
select_only([arm] + [bpy.data.objects[n] for n in body_mesh_names if n in bpy.data.objects])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb
if 'Haier' in bpy.data.objects:
    select_only([arm, bpy.data.objects['Haier']])
    export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

# D. woman_merged.glb
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
    print(f"\n--- SYNCING TO DIST/GM ---")
    for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
        src_f = os.path.join(base_dir, fname)
        dst_f = os.path.join(gm_dest, fname)
        if os.path.exists(src_f):
            shutil.copy2(src_f, dst_f)
            print(f"  ✓ Copied {fname} -> dist/gm ({os.path.getsize(dst_f)/1024:.1f} KB)")

print("\n=== BUILD FIXED SKINNING COMPLETED SUCCESSFULLY ===")

