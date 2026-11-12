import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r'client/assets/Characters/engi/Woman/animations/Idle.fbx')

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
hand = arm.pose.bones['mixamorig:RightHand']
print("Hand matrix_local:")
print(hand.bone.matrix_local)

for f in ['Thumb', 'Index', 'Middle', 'Pinky']:
    b = arm.pose.bones[f'mixamorig:RightHand{f}1']
    print(f"\n{f}1 bone matrix_local:")
    print(b.bone.matrix_local)
    # Check parent relative matrix
    rel = b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local
    print(f"{f}1 relative to parent {b.parent.name}:")
    print(rel)

