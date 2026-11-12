import bpy
import os
import math

REF_RIG_GLB = 'd:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_ref_rig.glb'
MAIN_FBX = 'd:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx'
CHAR_MESH_NAMES = ["Haier", "Head", "tors", "Shorts", "hands", "legs"]

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def clamp(v, mn, mx):
    return max(mn, min(mx, v))

def sculpt_lineage_bust(tors, head):
    print("  Applying enhanced Lineage 2 female breast sculpt (~88 cm bust)...")
    for obj in [tors, head]:
        if not obj:
            continue
        for v in obj.data.vertices:
            x, y, z = v.co.x, v.co.y, v.co.z
            # Chest front region: z in [1.20, 1.40], y < -0.06, |x| < 0.17
            if z < 1.20 or z > 1.41 or y > -0.06 or abs(x) > 0.18:
                continue
            
            # Left and right breast apexes at x = +/-0.068, z = 1.295
            dl = math.sqrt((x - 0.068) ** 2 + ((z - 1.295) * 1.05) ** 2)
            dr = math.sqrt((x + 0.068) ** 2 + ((z - 1.295) * 1.05) ** 2)
            d_min = min(dl, dr)
            
            R = 0.108  # 10.8 cm radius of breast dome
            if d_min < R:
                # Spherical cap dome
                t = 1.0 - (d_min / R) ** 2
                dome = math.sqrt(max(0.0, t))
                
                # Forward projection: 6.2 cm at apex
                dy = -0.062 * dome
                
                # Outward fullness
                dx = (0.010 if x > 0 else -0.010) * dome * (1.0 - smoothstep(0.04, 0.09, abs(x)))
                
                # Upward lift/perk (natural Lineage 2 contour)
                dz = +0.014 * dome * (1.0 - smoothstep(1.27, 1.35, z))
                
                # Cleavage cleft definition: between breasts (|x| < 0.032), indent cleavage inward
                if abs(x) < 0.035:
                    cleft = math.cos(clamp(abs(x) / 0.035, 0.0, 1.0) * math.pi * 0.5) ** 2
                    dy += 0.028 * cleft * dome
                
                v.co.x += dx
                v.co.y += dy
                v.co.z += dz
        obj.data.update()

def stabilize_breast_weights(tors):
    print("  Stabilizing breast weights to mixamorig:Spine2...")
    sp2_g = tors.vertex_groups.get("mixamorig:Spine2")
    if not sp2_g:
        return
    for v in tors.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Breast core: z in [1.23, 1.37], y < -0.10, |x| < 0.16
        if 1.23 <= z <= 1.37 and y < -0.10 and abs(x) < 0.16:
            # Distance from apex
            dl = math.sqrt((x - 0.068) ** 2 + ((z - 1.295) * 1.05) ** 2)
            dr = math.sqrt((x + 0.068) ** 2 + ((z - 1.295) * 1.05) ** 2)
            d_min = min(dl, dr)
            if d_min < 0.10:
                # Strong Spine2 lock (0.85 to 1.0) to prevent animation crushing
                factor = 1.0 - smoothstep(0.0, 0.10, d_min)
                target_sp2 = 0.85 + 0.15 * factor
                
                # Find current Spine2 weight
                cur_sp2 = 0.0
                for g in v.groups:
                    if g.group == sp2_g.index:
                        cur_sp2 = g.weight
                        break
                if cur_sp2 < target_sp2:
                    # Blend to target_sp2, taking weight mostly from Spine1/Spine
                    scale = (1.0 - target_sp2) / max(1e-4, (1.0 - cur_sp2))
                    for g in v.groups:
                        if g.group != sp2_g.index:
                            gn = tors.vertex_groups[g.group].name
                            if "Spine" in gn or "Hips" in gn:
                                g.weight *= scale
                    sp2_g.add([v.index], target_sp2, 'REPLACE')

def fix_crotch_weights(shorts):
    print("  Fixing crotch/inseam weights to mixamorig:Hips...")
    hips_g = shorts.vertex_groups.get("mixamorig:Hips")
    if not hips_g:
        return
    for v in shorts.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        # Central crotch seam: |x| < 0.030, z in [0.80, 0.92], y in [-0.08, 0.08]
        if abs(x) < 0.030 and 0.80 <= z <= 0.92:
            center_factor = 1.0 - smoothstep(0.005, 0.030, abs(x))
            target_hips = 0.75 * center_factor
            if target_hips > 0.05:
                # Get current hips
                cur_hips = 0.0
                for g in v.groups:
                    if g.group == hips_g.index:
                        cur_hips = g.weight
                        break
                if cur_hips < target_hips:
                    scale = (1.0 - target_hips) / max(1e-4, (1.0 - cur_hips))
                    for g in v.groups:
                        if g.group != hips_g.index:
                            g.weight *= scale
                    hips_g.add([v.index], target_hips, 'REPLACE')

# Main test runner
bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils
addon_utils.enable("io_scene_gltf2", default_set=False)

bpy.ops.import_scene.gltf(filepath=REF_RIG_GLB)
keep_orig = set(["Armature"] + CHAR_MESH_NAMES)
for o in list(bpy.data.objects):
    if o.name not in keep_orig:
        bpy.data.objects.remove(o, do_unlink=True)

arm = bpy.data.objects["Armature"]
if arm.animation_data:
    arm.animation_data.action = None
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)
bpy.context.view_layer.update()

orig_map = {}
for n in CHAR_MESH_NAMES:
    o = bpy.data.objects[n]
    o.name = f"ORIG_{n}"
    orig_map[n] = o

bpy.ops.import_scene.fbx(filepath=MAIN_FBX)
bpy.data.objects["tors"].name = "Head"
bpy.data.objects["tors.001"].name = "tors"

for n in CHAR_MESH_NAMES:
    o = bpy.data.objects[n]
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)
    o.vertex_groups.clear()
    for md in list(o.modifiers):
        if md.type == "ARMATURE":
            o.modifiers.remove(md)

# Import build functions from build_woman_from_main_fbx
import sys
sys.path.append('d:/games/yandex/лайнэйдж/project-steam1/scripts')
from build_woman_from_main_fbx import (
    extrude_shorts_tuck_collar, extrude_legs_thigh_tuck,
    ensure_all_bone_vgroups, transfer_3d_weights,
    clean_head_from_tors, sync_seam_overlap_weights, apply_hair_weights
)

# 1. Sculpt bust
sculpt_lineage_bust(bpy.data.objects["tors"], bpy.data.objects["Head"])

# 2. Shift head bones
amw = arm.matrix_world
amwi = amw.inverted()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
def shift_bone_z(bname, dz_head, dz_tail):
    eb = arm.data.edit_bones.get(bname)
    if not eb: return
    hw = amw @ eb.head; hw.z += dz_head; eb.head = amwi @ hw
    tw = amw @ eb.tail; tw.z += dz_tail; eb.tail = amwi @ tw
shift_bone_z("mixamorig:Neck", 0.015, 0.018)
shift_bone_z("mixamorig:Head", 0.020, 0.018)
shift_bone_z("mixamorig:HeadTop_End", 0.016, 0.016)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()

# 3. Extrusions
extrude_shorts_tuck_collar(bpy.data.objects["Shorts"])
extrude_legs_thigh_tuck(bpy.data.objects["legs"])

# 4. Weight groups & 3D transfer
for n in CHAR_MESH_NAMES:
    ensure_all_bone_vgroups(bpy.data.objects[n], arm)

transfer_3d_weights(orig_map["tors"], bpy.data.objects["tors"], opp_side_filter=False, match_bbox=True)
transfer_3d_weights(orig_map["Shorts"], bpy.data.objects["Shorts"], opp_side_filter=False, match_bbox=True)
transfer_3d_weights(orig_map["legs"], bpy.data.objects["legs"], opp_side_filter=True, match_bbox=True)
transfer_3d_weights(orig_map["hands"], bpy.data.objects["hands"], opp_side_filter=True, match_bbox=True)
transfer_3d_weights(orig_map["Head"], bpy.data.objects["Head"], opp_side_filter=False, match_bbox=True)

# 5. Stabilize breasts and crotch
stabilize_breast_weights(bpy.data.objects["tors"])
fix_crotch_weights(bpy.data.objects["Shorts"])

# 6. Seam syncing
clean_head_from_tors(bpy.data.objects["Head"], bpy.data.objects["tors"])
sync_seam_overlap_weights(bpy.data.objects["Shorts"], bpy.data.objects["tors"], 1.005, 1.065, opp_side_filter=False)
sync_seam_overlap_weights(bpy.data.objects["legs"], bpy.data.objects["Shorts"], 0.615, 0.645, opp_side_filter=True)
apply_hair_weights(bpy.data.objects["Haier"])

# 7. Normalize & limit to 4
for n in CHAR_MESH_NAMES:
    o = bpy.data.objects[n]
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
    md = o.modifiers.new("Armature", "ARMATURE")
    md.object = arm

# Check stretch in sit_loop
act = bpy.data.actions.get("sit_loop")
arm.animation_data.action = act
for f in [1, 40]:
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for o_name in ["tors", "Shorts", "legs", "Head"]:
        eval_o = bpy.data.objects[o_name].evaluated_get(dg)
        max_r = 0.0
        for edge in eval_o.data.edges:
            v1_e = eval_o.data.vertices[edge.vertices[0]].co
            v2_e = eval_o.data.vertices[edge.vertices[1]].co
            l_e = (v1_e - v2_e).length
            v1_r = bpy.data.objects[o_name].data.vertices[edge.vertices[0]].co
            v2_r = bpy.data.objects[o_name].data.vertices[edge.vertices[1]].co
            l_r = (v1_r - v2_r).length
            if l_r > 1e-4:
                max_r = max(max_r, l_e / l_r)
        print(f"sit_loop f={f} {o_name} max_stretch={max_r:.2f}x")

# Setup lighting & camera for visual inspection
# Create sun light
light_data = bpy.data.lights.new("Sun", "SUN")
light_data.energy = 3.5
light_obj = bpy.data.objects.new("Sun", light_data)
light_obj.rotation_euler = (0.8, 0.2, 0.6)
bpy.context.collection.objects.link(light_obj)

# Create key fill light
fill_data = bpy.data.lights.new("Fill", "SUN")
fill_data.energy = 1.5
fill_obj = bpy.data.objects.new("Fill", fill_data)
fill_obj.rotation_euler = (0.4, -0.8, -1.2)
bpy.context.collection.objects.link(fill_obj)

cam_data = bpy.data.cameras.new("InspectCam")
cam_obj = bpy.data.objects.new("InspectCam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = True

# Match user angle in showroom
cam_obj.location = (0.75, -1.35, 0.70)
cam_obj.rotation_euler = (1.30, 0.0, 0.52)
bpy.context.scene.frame_set(40)
bpy.context.view_layer.update()
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_sit_user.png'
bpy.ops.render.render(write_still=True)
print("Saved diag_PERFECT_sit_user.png")

# Side profile of sit_loop
cam_obj.location = (1.50, -0.20, 0.65)
cam_obj.rotation_euler = (1.45, 0.0, 1.70)
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_sit_side.png'
bpy.ops.render.render(write_still=True)
print("Saved diag_PERFECT_sit_side.png")

# Rest pose T-pose side profile
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

cam_obj.location = (1.50, -0.20, 1.30)
cam_obj.rotation_euler = (1.57, 0.0, 1.57)
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_rest_profile.png'
bpy.ops.render.render(write_still=True)
print("Saved diag_PERFECT_rest_profile.png")
