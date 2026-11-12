import bpy
import os
import math

base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
emoji_fbx = os.path.join(base_dir, "animations", "эмодзи.fbx")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]

# Check actions
sit_action = None
for act in bpy.data.actions:
    if 'садится' in act.name:
        sit_action = act
        break

print(f"Action: {sit_action.name}, frames: {sit_action.frame_range}")

# Set action on armature
if not arm.animation_data:
    arm.animation_data_create()
arm.animation_data.action = sit_action

# Let's inspect keyframes and evaluate pose at frames 1, 20, 40, 60, 80, 96
print("\nBONE ROTATIONS (Euler deg) during sit_down:")
pose_bones = arm.pose.bones
check_bones = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:LeftUpLeg', 'mixamorig:RightUpLeg']

for f in [1, 15, 30, 45, 60, 75, 96]:
    bpy.context.scene.frame_set(f)
    print(f"\n--- Frame {f} ---")
    for bname in check_bones:
        pb = pose_bones.get(bname)
        if pb:
            euler = pb.rotation_quaternion.to_euler()
            print(f"  {bname}: rot=({math.degrees(euler.x):.1f}, {math.degrees(euler.y):.1f}, {math.degrees(euler.z):.1f}), pos=({pb.location.x:.3f}, {pb.location.y:.3f}, {pb.location.z:.3f})")

# Let's also check mesh vertex distance between tors bottom and shorts top at frame 45 (mid-sit)
tors = bpy.data.objects.get('tors')
shorts = bpy.data.objects.get('Shorts')

bpy.context.scene.frame_set(45)
dg = bpy.context.evaluated_depsgraph_get()
tors_eval = tors.evaluated_get(dg)
shorts_eval = shorts.evaluated_get(dg)

# Find closest vertices or bounding box
tors_min_z = min(v.co.z for v in tors_eval.data.vertices)
shorts_max_z = max(v.co.z for v in shorts_eval.data.vertices)
print(f"\nEvaluated at Frame 45:")
print(f"  tors lowest Z: {tors_min_z:.4f}")
print(f"  shorts highest Z: {shorts_max_z:.4f}")
print(f"  Gap (tors - shorts): {tors_min_z - shorts_max_z:.4f}")

