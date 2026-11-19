import bpy
import numpy as np

blend_path = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_original_backup_1.blend"
bpy.ops.wm.open_mainfile(filepath=blend_path)
bpy.ops.wm.open_mainfile(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend")

tors = bpy.data.objects['tors']
shorts = bpy.data.objects['Shorts']
arm = bpy.data.objects['Armature']
arm = bpy.data.objects.get("Armature")
tors = bpy.data.objects.get("tors")

print("--- TORS VERTICES NEAR WAIST ---")
tors_waist = [(v.index, v.co.z, v.co.y, v.co.x) for v in tors.data.vertices if v.co.z <= 1.08]
print(f"tors vertices with z <= 1.08: count = {len(tors_waist)}")
for idx, z, y, x in sorted(tors_waist, key=lambda item: item[1]):
    v = tors.data.vertices[idx]
    weights = {tors.vertex_groups[g.group].name: round(g.weight, 3) for g in v.groups}
    print(f"  tors vert {idx}: z={z:.3f}, y={y:.3f}, x={x:.3f} | {weights}")
# In rest pose:
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.transforms_clear()
bpy.context.view_layer.update()

print("\n--- SHORTS VERTICES NEAR WAIST ---")
shorts_waist = [(v.index, v.co.z, v.co.y, v.co.x) for v in shorts.data.vertices if v.co.z >= 0.98]
print(f"Shorts vertices with z >= 0.98: count = {len(shorts_waist)}")
for idx, z, y, x in sorted(shorts_waist, key=lambda item: -item[1]):
    v = shorts.data.vertices[idx]
    weights = {shorts.vertex_groups[g.group].name: round(g.weight, 3) for g in v.groups}
    print(f"  Shorts vert {idx}: z={z:.3f}, y={y:.3f}, x={x:.3f} | {weights}")
# Let's find vertices of tors on the breast mound:
# Breast vertices have Z around 1.28..1.42, Y < -0.08, |X| < 0.16
breast_vidxs = [v.index for v in tors.data.vertices if 1.28 <= v.co.z <= 1.42 and v.co.y < -0.06 and abs(v.co.x) < 0.16]
print(f"Found {len(breast_vidxs)} breast vertices in tors.")

# Check rest coordinates
rest_ys = [tors.data.vertices[i].co.y for i in breast_vidxs]
print(f"Rest Y min (apex): {min(rest_ys):.4f}")

# Check weights of these breast vertices:
print("\nWeights of apex breast vertices (Y < -0.10):")
for i in breast_vidxs:
    v = tors.data.vertices[i]
    if v.co.y < -0.10:
        w_dict = {tors.vertex_groups[g.group].name: round(g.weight, 3) for g in v.groups}
        print(f"  v{i:3d} (x={v.co.x:.3f}, y={v.co.y:.3f}, z={v.co.z:.3f}): {w_dict}")

# Now evaluate in sit_loop:
act_sit = bpy.data.actions.get('sit_loop')
if act_sit:
    arm.animation_data.action = act_sit
    for frame in [0, 30, 60]:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        
        # Get evaluated mesh with armature modifier
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_tors = tors.evaluated_get(depsgraph)
        eval_mesh = eval_tors.to_mesh()
        
        # Bone positions in sit_loop
        spine2_pb = arm.pose.bones.get('mixamorig:Spine2')
        l_sh_pb = arm.pose.bones.get('mixamorig:LeftShoulder')
        r_sh_pb = arm.pose.bones.get('mixamorig:RightShoulder')
        l_arm_pb = arm.pose.bones.get('mixamorig:LeftArm')
        r_arm_pb = arm.pose.bones.get('mixamorig:RightArm')
        
        # Check breast vertices in evaluated mesh
        eval_coords = [eval_mesh.vertices[i].co for i in breast_vidxs]
        eval_ys = [c.y for c in eval_coords]
        
        # In Spine2 local space, how far does the breast protrude forward?
        sp2_mat_inv = spine2_pb.matrix.inverted()
        local_coords = [sp2_mat_inv @ c for c in eval_coords]
        local_ys = [c.y for c in local_coords]
        
        print(f"\nFrame {frame} in sit_loop:")
        print(f"  Evaluated world Y min: {min(eval_ys):.4f}")
        print(f"  Spine2-local Y (breast protrusion): min={min(local_ys):.4f}, max={max(local_ys):.4f}, span={max(local_ys)-min(local_ys):.4f}")
        eval_tors.to_mesh_clear()
