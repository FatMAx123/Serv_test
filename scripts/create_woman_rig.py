import bpy
import mathutils
import numpy as np

print("=== STARTING WOMAN RIG CREATION ===")

# 1. Clean existing armatures if any
for o in list(bpy.data.objects):
    if o.type == 'ARMATURE':
        bpy.data.objects.remove(o, do_unlink=True)
for arm in list(bpy.data.armatures):
    bpy.data.armatures.remove(arm, do_unlink=True)

# 2. Create new Armature
arm_data = bpy.data.armatures.new("Armature")
arm_data.display_type = 'OCTAHEDRAL'
arm_obj = bpy.data.objects.new("Armature", arm_data)
bpy.context.scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
arm_obj.select_set(True)

bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones

def add_bone(name, head, tail, parent_name=None):
    b = eb.new(name)
    b.head = mathutils.Vector(head)
    b.tail = mathutils.Vector(tail)
    if parent_name and parent_name in eb:
        b.parent = eb[parent_name]
    return b

# Central Spine & Head Chain
add_bone("mixamorig:Hips", [0.0, 0.007, 0.938], [0.0, 0.011, 1.014])
add_bone("mixamorig:Spine", [0.0, 0.011, 1.014], [0.0, 0.018, 1.148], "mixamorig:Hips")
add_bone("mixamorig:Spine1", [0.0, 0.018, 1.148], [0.0, 0.000, 1.318], "mixamorig:Spine")
add_bone("mixamorig:Spine2", [0.0, 0.000, 1.318], [0.0, 0.020, 1.516], "mixamorig:Spine1")
add_bone("mixamorig:Neck", [0.0, 0.020, 1.516], [0.0, 0.000, 1.589], "mixamorig:Spine2")
add_bone("mixamorig:Head", [0.0, 0.000, 1.589], [0.0, 0.000, 1.783], "mixamorig:Neck")

# Breast Bones (Left and Right) child of Spine2 (Chest)
# Head is placed near the ribcage/base, tail points forward through the breast apex
add_bone("mixamorig:LeftBreast", [0.065, 0.045, 1.365], [0.085, 0.155, 1.380], "mixamorig:Spine2")
add_bone("mixamorig:RightBreast", [-0.065, 0.045, 1.365], [-0.085, 0.155, 1.380], "mixamorig:Spine2")

# Legs Left
add_bone("mixamorig:LeftUpLeg", [0.168, -0.007, 0.865], [0.148, -0.009, 0.532], "mixamorig:Hips")
add_bone("mixamorig:LeftLeg", [0.148, -0.009, 0.532], [0.178, 0.045, 0.110], "mixamorig:LeftUpLeg")
add_bone("mixamorig:LeftFoot", [0.178, 0.045, 0.110], [0.181, 0.078, 0.018], "mixamorig:LeftLeg")
add_bone("mixamorig:LeftToeBase", [0.181, 0.078, 0.018], [0.181, 0.160, 0.018], "mixamorig:LeftFoot")

# Legs Right
add_bone("mixamorig:RightUpLeg", [-0.168, -0.007, 0.865], [-0.148, -0.009, 0.532], "mixamorig:Hips")
add_bone("mixamorig:RightLeg", [-0.148, -0.009, 0.532], [-0.178, 0.045, 0.110], "mixamorig:RightUpLeg")
add_bone("mixamorig:RightFoot", [-0.178, 0.045, 0.110], [-0.181, 0.078, 0.018], "mixamorig:RightLeg")
add_bone("mixamorig:RightToeBase", [-0.181, 0.078, 0.018], [-0.181, 0.160, 0.018], "mixamorig:RightFoot")

# Arms Left
add_bone("mixamorig:LeftShoulder", [0.045, 0.020, 1.443], [0.191, 0.051, 1.443], "mixamorig:Spine2")
add_bone("mixamorig:LeftArm", [0.191, 0.051, 1.443], [0.406, 0.043, 1.416], "mixamorig:LeftShoulder")
add_bone("mixamorig:LeftForeArm", [0.406, 0.043, 1.416], [0.601, 0.020, 1.407], "mixamorig:LeftArm")
add_bone("mixamorig:LeftHand", [0.601, 0.020, 1.407], [0.660, 0.020, 1.407], "mixamorig:LeftForeArm")

# Left Hand Fingers
add_bone("mixamorig:LeftHandThumb1", [0.615, 0.050, 1.405], [0.635, 0.070, 1.405], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandThumb2", [0.635, 0.070, 1.405], [0.655, 0.085, 1.405], "mixamorig:LeftHandThumb1")
add_bone("mixamorig:LeftHandThumb3", [0.655, 0.085, 1.405], [0.675, 0.100, 1.405], "mixamorig:LeftHandThumb2")

add_bone("mixamorig:LeftHandIndex1", [0.660, 0.040, 1.415], [0.690, 0.040, 1.415], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandIndex2", [0.690, 0.040, 1.415], [0.720, 0.040, 1.415], "mixamorig:LeftHandIndex1")
add_bone("mixamorig:LeftHandIndex3", [0.720, 0.040, 1.415], [0.750, 0.040, 1.415], "mixamorig:LeftHandIndex2")

add_bone("mixamorig:LeftHandMiddle1", [0.660, 0.020, 1.415], [0.695, 0.020, 1.415], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandMiddle2", [0.695, 0.020, 1.415], [0.725, 0.020, 1.415], "mixamorig:LeftHandMiddle1")
add_bone("mixamorig:LeftHandMiddle3", [0.725, 0.020, 1.415], [0.755, 0.020, 1.415], "mixamorig:LeftHandMiddle2")

add_bone("mixamorig:LeftHandRing1", [0.660, 0.000, 1.410], [0.690, 0.000, 1.410], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandRing2", [0.690, 0.000, 1.410], [0.720, 0.000, 1.410], "mixamorig:LeftHandRing1")
add_bone("mixamorig:LeftHandRing3", [0.720, 0.000, 1.410], [0.750, 0.000, 1.410], "mixamorig:LeftHandRing2")

add_bone("mixamorig:LeftHandPinky1", [0.660, -0.020, 1.405], [0.685, -0.020, 1.405], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandPinky2", [0.685, -0.020, 1.405], [0.710, -0.020, 1.405], "mixamorig:LeftHandPinky1")
add_bone("mixamorig:LeftHandPinky3", [0.710, -0.020, 1.405], [0.735, -0.020, 1.405], "mixamorig:LeftHandPinky2")

# Arms Right
add_bone("mixamorig:RightShoulder", [-0.045, 0.020, 1.443], [-0.191, 0.051, 1.443], "mixamorig:Spine2")
add_bone("mixamorig:RightArm", [-0.191, 0.051, 1.443], [-0.406, 0.043, 1.416], "mixamorig:RightShoulder")
add_bone("mixamorig:RightForeArm", [-0.406, 0.043, 1.416], [-0.601, 0.020, 1.407], "mixamorig:RightArm")
add_bone("mixamorig:RightHand", [-0.601, 0.020, 1.407], [-0.660, 0.020, 1.407], "mixamorig:RightForeArm")

# Right Hand Fingers
add_bone("mixamorig:RightHandThumb1", [-0.615, 0.050, 1.405], [-0.635, 0.070, 1.405], "mixamorig:RightHand")
add_bone("mixamorig:RightHandThumb2", [-0.635, 0.070, 1.405], [-0.655, 0.085, 1.405], "mixamorig:RightHandThumb1")
add_bone("mixamorig:RightHandThumb3", [-0.655, 0.085, 1.405], [-0.675, 0.100, 1.405], "mixamorig:RightHandThumb2")

add_bone("mixamorig:RightHandIndex1", [-0.660, 0.040, 1.415], [-0.690, 0.040, 1.415], "mixamorig:RightHand")
add_bone("mixamorig:RightHandIndex2", [-0.690, 0.040, 1.415], [-0.720, 0.040, 1.415], "mixamorig:RightHandIndex1")
add_bone("mixamorig:RightHandIndex3", [-0.720, 0.040, 1.415], [-0.750, 0.040, 1.415], "mixamorig:RightHandIndex2")

add_bone("mixamorig:RightHandMiddle1", [-0.660, 0.020, 1.415], [-0.695, 0.020, 1.415], "mixamorig:RightHand")
add_bone("mixamorig:RightHandMiddle2", [-0.695, 0.020, 1.415], [-0.725, 0.020, 1.415], "mixamorig:RightHandMiddle1")
add_bone("mixamorig:RightHandMiddle3", [-0.725, 0.020, 1.415], [-0.755, 0.020, 1.415], "mixamorig:RightHandMiddle2")

add_bone("mixamorig:RightHandRing1", [-0.660, 0.000, 1.410], [-0.690, 0.000, 1.410], "mixamorig:RightHand")
add_bone("mixamorig:RightHandRing2", [-0.690, 0.000, 1.410], [-0.720, 0.000, 1.410], "mixamorig:RightHandRing1")
add_bone("mixamorig:RightHandRing3", [-0.720, 0.000, 1.410], [-0.750, 0.000, 1.410], "mixamorig:RightHandRing2")

add_bone("mixamorig:RightHandPinky1", [-0.660, -0.020, 1.405], [-0.685, -0.020, 1.405], "mixamorig:RightHand")
add_bone("mixamorig:RightHandPinky2", [-0.685, -0.020, 1.405], [-0.710, -0.020, 1.405], "mixamorig:RightHandPinky1")
add_bone("mixamorig:RightHandPinky3", [-0.710, -0.020, 1.405], [-0.735, -0.020, 1.405], "mixamorig:RightHandPinky2")

bpy.ops.object.mode_set(mode='OBJECT')

print(f"Created Armature with {len(arm_data.bones)} bones, including mixamorig:LeftBreast and mixamorig:RightBreast.")

