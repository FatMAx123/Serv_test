import bpy
import os
import mathutils

emoji_fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
tors = bpy.data.objects['tors']
shorts = bpy.data.objects['Shorts']

print("\n=== APPLYING WEIGHT FIXES ===")

def get_or_create_vg(obj, name):
    vg = obj.vertex_groups.get(name)
    if not vg:
        vg = obj.vertex_groups.new(name=name)
    return vg

# 1. FIX TORS
# Remove leg weights from tors completely, ensure lower rim blends Hips and Spine cleanly
vg_hips_t = get_or_create_vg(tors, 'mixamorig:Hips')
vg_spine_t = get_or_create_vg(tors, 'mixamorig:Spine')
vg_lleg_t = tors.vertex_groups.get('mixamorig:LeftUpLeg')
vg_rleg_t = tors.vertex_groups.get('mixamorig:RightUpLeg')

min_zt = min(v.co.z for v in tors.data.vertices) # in local coords
max_zt = max(v.co.z for v in tors.data.vertices)
print(f"tors local Z range: [{min_zt:.4f}, {max_zt:.4f}]")

for v in tors.data.vertices:
    # Remove any stray leg weights
    if vg_lleg_t: vg_lleg_t.remove([v.index])
    if vg_rleg_t: vg_rleg_t.remove([v.index])
    
    # In bottom 15% of tors (waist hem):
    if v.co.z < min_zt + 0.05:
        # t from 0 (very bottom) to 1 (0.05m up)
        t = (v.co.z - min_zt) / 0.05
        # at bottom: 50% Hips, 50% Spine
        # at top of hem: original / predominantly Spine
        target_hips = (1.0 - t) * 0.55
        target_spine = 1.0 - target_hips
        vg_hips_t.add([v.index], target_hips, 'REPLACE')
        vg_spine_t.add([v.index], target_spine, 'REPLACE')

# 2. FIX SHORTS
# Ensure groups exist
vg_hips_s = get_or_create_vg(shorts, 'mixamorig:Hips')
vg_spine_s = get_or_create_vg(shorts, 'mixamorig:Spine')
vg_lleg_s = get_or_create_vg(shorts, 'mixamorig:LeftUpLeg')
vg_rleg_s = get_or_create_vg(shorts, 'mixamorig:RightUpLeg')

min_zs = min(v.co.z for v in shorts.data.vertices)
max_zs = max(v.co.z for v in shorts.data.vertices)
h_s = max_zs - min_zs
print(f"shorts local Z range: [{min_zs:.4f}, {max_zs:.4f}], height={h_s:.4f}")

for v in shorts.data.vertices:
    z_rel = (v.co.z - min_zs) / h_s # 0 at bottom legs, 1 at top waistband
    x = v.co.x # left (+) vs right (-) in local space
    
    # Clear existing weights on these 4 main bones
    vg_hips_s.remove([v.index])
    vg_spine_s.remove([v.index])
    vg_lleg_s.remove([v.index])
    vg_rleg_s.remove([v.index])
    
    if z_rel >= 0.75:
        # Waistband zone: NO LEG WEIGHTS!
        # z_rel from 0.75 to 1.0
        t = (z_rel - 0.75) / 0.25 # 0 to 1
        # Match bottom of tors:
        # at very top (t=1): 50% Hips, 50% Spine
        # at lower waistband (t=0): 80% Hips, 20% Spine
        w_spine = 0.20 + 0.30 * t
        w_hips = 1.0 - w_spine
        vg_hips_s.add([v.index], w_hips, 'REPLACE')
        vg_spine_s.add([v.index], w_spine, 'REPLACE')
    
    elif z_rel >= 0.35:
        # Mid pelvis & buttocks zone:
        # z_rel from 0.35 to 0.75
        t = (z_rel - 0.35) / 0.40 # 0 (hip crease) to 1 (lower waist)
        w_hips = 0.55 + 0.35 * t # 0.55 at bottom to 0.90 at top
        w_leg_total = 1.0 - w_hips
        
        # distribute leg weight to left OR right based on X
        # smoothly cross-fade around X=0
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
        # Lower shorts / leg cuffs:
        # z_rel from 0 to 0.35
        t = z_rel / 0.35 # 0 to 1
        w_hips = 0.15 * t # 0.0 at cuff to 0.15 at mid
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

print("✅ Weight remapping applied.")

# Now test during sit_down animation!
sit_action = [a for a in bpy.data.actions if 'садится' in a.name][0]
arm.animation_data_create()
arm.animation_data.action = sit_action

# Let's find boundary waist vertices
def get_boundary_verts(obj, max_z=None, min_z=None):
    edge_poly_count = {}
    for poly in obj.data.polygons:
        for ek in poly.edge_keys:
            edge_poly_count[ek] = edge_poly_count.get(ek, 0) + 1
    b_verts = set()
    for (v1, v2), c in edge_poly_count.items():
        if c == 1:
            b_verts.add(v1)
            b_verts.add(v2)
    filtered = []
    for idx in b_verts:
        z = (obj.matrix_world @ obj.data.vertices[idx].co).z
        if max_z is not None and z > max_z: continue
        if min_z is not None and z < min_z: continue
        filtered.append(idx)
    return filtered

tors_waist = get_boundary_verts(tors, max_z=0.58)
shorts_waist = get_boundary_verts(shorts, min_z=0.58)

print("\n--- EVALUATING GAP ACROSS FRAMES AFTER FIX ---")
max_dist_found = 0
for frame in range(1, 97, 5):
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    t_eval = tors.evaluated_get(dg)
    s_eval = shorts.evaluated_get(dg)
    
    t_coords = [t_eval.matrix_world @ t_eval.data.vertices[idx].co for idx in tors_waist]
    s_coords = [s_eval.matrix_world @ s_eval.data.vertices[idx].co for idx in shorts_waist]
    
    # Check max distance between corresponding back vertices
    min_yt = min(c.y for c in t_coords)
    back_t = [c for c in t_coords if c.y == min_yt][0]
    closest_s = min(s_coords, key=lambda sc: (sc - back_t).length)
    dist = (back_t - closest_s).length
    z_diff = back_t.z - closest_s.z
    if dist > max_dist_found: max_dist_found = dist
    print(f"Frame {frame:02d}: dist={dist*100:.2f} cm (Z-diff={z_diff*100:.2f} cm, back_t.y={back_t.y:.3f}, s.y={closest_s.y:.3f})")

print(f"\nMax distance between back waist seam: {max_dist_found*100:.2f} cm")

