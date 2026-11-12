import bpy
from mathutils import Vector, Matrix

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'client/assets/Characters/engi/Woman/animations/Idle.fbx')

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
hand = arm.pose.bones.get('mixamorig:RightHand')

print("=== RIGHT HAND BONES & LOCAL AXES ===")
print("Hand world translation:", (arm.matrix_world @ hand.matrix).translation)
print("Hand bone length:", hand.bone.length)

finger_names = ['mixamorig:RightHandThumb', 'mixamorig:RightHandIndex', 'mixamorig:RightHandMiddle', 'mixamorig:RightHandRing', 'mixamorig:RightHandPinky']

for fn in finger_names:
    print(f"\nFinger {fn}:")
    for j in range(1, 4):
        bname = f"{fn}{j}"
        b = arm.pose.bones.get(bname)
        if b:
            # Let's inspect bone local orientation: X, Y, Z axes of the bone
            m = b.bone.matrix_local
            print(f"  {bname}: length={b.bone.length:.4f}")
            print(f"    head = {b.bone.head_local}")
            print(f"    tail = {b.bone.tail_local}")
            # Which axis points from head to tail? In Blender it's +Y.
            # Which axis is the hinge (curling) axis?
            # When finger curls in human anatomy:
            # For Index1 -> Index2: the joint rotates around an axis perpendicular to the finger and palm.

