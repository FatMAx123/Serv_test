import bpy
import mathutils
import math
import os
import shutil

print("============================================================")
print("Project Steam: Full Rigging Pipeline for Woman Character")
print("Aligned with character forward direction (-Y)")
print("Including Mixamo Bones, Breast Bones, Weights & Idle Anim")
print("============================================================\n")

blend_path = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend"
backup_path = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_prerig_backup.blend"

# Restore from pristine pre-rig backup if available
if os.path.exists(backup_path):
    print(f"Restoring clean geometry from pre-rig backup: {backup_path}")
    shutil.copyfile(backup_path, blend_path)
    bpy.ops.wm.open_mainfile(filepath=blend_path)
else:
    shutil.copyfile(blend_path, backup_path)
    print(f"Created pre-rig backup: {backup_path}")

# 1. Clean existing armatures and actions
for o in list(bpy.data.objects):
    if o.type == 'ARMATURE':
        bpy.data.objects.remove(o, do_unlink=True)
for arm in list(bpy.data.armatures):
    bpy.data.armatures.remove(arm, do_unlink=True)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act, do_unlink=True)

# 2. Clear existing vertex groups and armature modifiers from meshes
mesh_names = ['tors', 'Shorts', 'legs', 'hands', 'Haier']
for name in mesh_names:
    if name in bpy.data.objects:
        obj = bpy.data.objects[name]
        obj.vertex_groups.clear()
        for mod in list(obj.modifiers):
            if mod.type == 'ARMATURE':
                obj.modifiers.remove(mod)

# 3. Create Armature
arm_data = bpy.data.armatures.new("Armature")
arm_data.display_type = 'OCTAHEDRAL'
arm_obj = bpy.data.objects.new("Armature", arm_data)
arm_obj.show_in_front = True
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

# Central Spine & Head Chain (Forward is -Y, Back is +Y, Up is +Z)
add_bone("mixamorig:Hips", [0.0, 0.025, 0.938], [0.0, 0.015, 1.014])
add_bone("mixamorig:Spine", [0.0, 0.015, 1.014], [0.0, 0.005, 1.148], "mixamorig:Hips")
add_bone("mixamorig:Spine1", [0.0, 0.005, 1.148], [0.0, 0.010, 1.318], "mixamorig:Spine")
add_bone("mixamorig:Spine2", [0.0, 0.010, 1.318], [0.0, 0.015, 1.516], "mixamorig:Spine1")
add_bone("mixamorig:Neck", [0.0, 0.015, 1.516], [0.0, 0.000, 1.589], "mixamorig:Spine2")
add_bone("mixamorig:Head", [0.0, 0.000, 1.589], [0.0, -0.015, 1.783], "mixamorig:Neck")

# Breast Bones (Left and Right) child of Spine2 (Chest)
# Head attaches at chest ribcage (Y ~ -0.025), Tail points forward through breast apex (Y ~ -0.125)
add_bone("mixamorig:LeftBreast", [0.065, -0.025, 1.330], [0.080, -0.125, 1.335], "mixamorig:Spine2")
add_bone("mixamorig:RightBreast", [-0.065, -0.025, 1.330], [-0.080, -0.125, 1.335], "mixamorig:Spine2")

# Legs Left (Knee extends forward to -0.015; Foot/Toe extends forward to -0.045 / -0.135)
add_bone("mixamorig:LeftUpLeg", [0.155, 0.015, 0.865], [0.150, -0.015, 0.525], "mixamorig:Hips")
add_bone("mixamorig:LeftLeg", [0.150, -0.015, 0.525], [0.178, 0.045, 0.110], "mixamorig:LeftUpLeg")
add_bone("mixamorig:LeftFoot", [0.178, 0.045, 0.110], [0.181, -0.045, 0.025], "mixamorig:LeftLeg")
add_bone("mixamorig:LeftToeBase", [0.181, -0.045, 0.025], [0.181, -0.135, 0.015], "mixamorig:LeftFoot")

# Legs Right
add_bone("mixamorig:RightUpLeg", [-0.155, 0.015, 0.865], [-0.150, -0.015, 0.525], "mixamorig:Hips")
add_bone("mixamorig:RightLeg", [-0.150, -0.015, 0.525], [-0.178, 0.045, 0.110], "mixamorig:RightUpLeg")
add_bone("mixamorig:RightFoot", [-0.178, 0.045, 0.110], [-0.181, -0.045, 0.025], "mixamorig:RightLeg")
add_bone("mixamorig:RightToeBase", [-0.181, -0.045, 0.025], [-0.181, -0.135, 0.015], "mixamorig:RightFoot")

# Arms Left (Elbow has natural backward bend to +0.055)
add_bone("mixamorig:LeftShoulder", [0.045, 0.010, 1.443], [0.191, 0.035, 1.443], "mixamorig:Spine2")
add_bone("mixamorig:LeftArm", [0.191, 0.035, 1.443], [0.406, 0.055, 1.416], "mixamorig:LeftShoulder")
add_bone("mixamorig:LeftForeArm", [0.406, 0.055, 1.416], [0.601, 0.035, 1.407], "mixamorig:LeftArm")
add_bone("mixamorig:LeftHand", [0.601, 0.035, 1.407], [0.660, 0.030, 1.415], "mixamorig:LeftForeArm")

# Left Hand Fingers (Thumb forward at -Y, Pinky backward at +Y)
add_bone("mixamorig:LeftHandThumb1", [0.615, 0.010, 1.405], [0.635, -0.015, 1.395], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandThumb2", [0.635, -0.015, 1.395], [0.655, -0.032, 1.390], "mixamorig:LeftHandThumb1")
add_bone("mixamorig:LeftHandThumb3", [0.655, -0.032, 1.390], [0.674, -0.048, 1.389], "mixamorig:LeftHandThumb2")

add_bone("mixamorig:LeftHandIndex1", [0.660, 0.005, 1.415], [0.690, 0.005, 1.425], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandIndex2", [0.690, 0.005, 1.425], [0.720, 0.006, 1.433], "mixamorig:LeftHandIndex1")
add_bone("mixamorig:LeftHandIndex3", [0.720, 0.006, 1.433], [0.749, 0.007, 1.440], "mixamorig:LeftHandIndex2")

add_bone("mixamorig:LeftHandMiddle1", [0.660, 0.025, 1.415], [0.695, 0.030, 1.422], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandMiddle2", [0.695, 0.030, 1.422], [0.725, 0.035, 1.428], "mixamorig:LeftHandMiddle1")
add_bone("mixamorig:LeftHandMiddle3", [0.725, 0.035, 1.428], [0.756, 0.039, 1.435], "mixamorig:LeftHandMiddle2")

add_bone("mixamorig:LeftHandRing1", [0.660, 0.050, 1.410], [0.690, 0.057, 1.412], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandRing2", [0.690, 0.057, 1.412], [0.720, 0.064, 1.414], "mixamorig:LeftHandRing1")
add_bone("mixamorig:LeftHandRing3", [0.720, 0.064, 1.414], [0.750, 0.071, 1.416], "mixamorig:LeftHandRing2")

add_bone("mixamorig:LeftHandPinky1", [0.660, 0.070, 1.405], [0.685, 0.073, 1.406], "mixamorig:LeftHand")
add_bone("mixamorig:LeftHandPinky2", [0.685, 0.073, 1.406], [0.710, 0.077, 1.408], "mixamorig:LeftHandPinky1")
add_bone("mixamorig:LeftHandPinky3", [0.710, 0.077, 1.408], [0.736, 0.080, 1.409], "mixamorig:LeftHandPinky2")

# Arms Right
add_bone("mixamorig:RightShoulder", [-0.045, 0.010, 1.443], [-0.191, 0.035, 1.443], "mixamorig:Spine2")
add_bone("mixamorig:RightArm", [-0.191, 0.035, 1.443], [-0.406, 0.055, 1.416], "mixamorig:RightShoulder")
add_bone("mixamorig:RightForeArm", [-0.406, 0.055, 1.416], [-0.601, 0.035, 1.407], "mixamorig:RightArm")
add_bone("mixamorig:RightHand", [-0.601, 0.035, 1.407], [-0.660, 0.030, 1.415], "mixamorig:RightForeArm")

# Right Hand Fingers
add_bone("mixamorig:RightHandThumb1", [-0.615, 0.010, 1.405], [-0.635, -0.015, 1.395], "mixamorig:RightHand")
add_bone("mixamorig:RightHandThumb2", [-0.635, -0.015, 1.395], [-0.655, -0.032, 1.390], "mixamorig:RightHandThumb1")
add_bone("mixamorig:RightHandThumb3", [-0.655, -0.032, 1.390], [-0.674, -0.048, 1.389], "mixamorig:RightHandThumb2")

add_bone("mixamorig:RightHandIndex1", [-0.660, 0.005, 1.415], [-0.690, 0.005, 1.425], "mixamorig:RightHand")
add_bone("mixamorig:RightHandIndex2", [-0.690, 0.005, 1.425], [-0.720, 0.006, 1.433], "mixamorig:RightHandIndex1")
add_bone("mixamorig:RightHandIndex3", [-0.720, 0.006, 1.433], [-0.749, 0.007, 1.440], "mixamorig:RightHandIndex2")

add_bone("mixamorig:RightHandMiddle1", [-0.660, 0.025, 1.415], [-0.695, 0.030, 1.422], "mixamorig:RightHand")
add_bone("mixamorig:RightHandMiddle2", [-0.695, 0.030, 1.422], [-0.725, 0.035, 1.428], "mixamorig:RightHandMiddle1")
add_bone("mixamorig:RightHandMiddle3", [-0.725, 0.035, 1.428], [-0.756, 0.039, 1.435], "mixamorig:RightHandMiddle2")

add_bone("mixamorig:RightHandRing1", [-0.660, 0.050, 1.410], [-0.690, 0.057, 1.412], "mixamorig:RightHand")
add_bone("mixamorig:RightHandRing2", [-0.690, 0.057, 1.412], [-0.720, 0.064, 1.414], "mixamorig:RightHandRing1")
add_bone("mixamorig:RightHandRing3", [-0.720, 0.064, 1.414], [-0.750, 0.071, 1.416], "mixamorig:RightHandRing2")

add_bone("mixamorig:RightHandPinky1", [-0.660, 0.070, 1.405], [-0.685, 0.073, 1.406], "mixamorig:RightHand")
add_bone("mixamorig:RightHandPinky2", [-0.685, 0.073, 1.406], [-0.710, 0.077, 1.408], "mixamorig:RightHandPinky1")
add_bone("mixamorig:RightHandPinky3", [-0.710, 0.077, 1.408], [-0.736, 0.080, 1.409], "mixamorig:RightHandPinky2")

# Calculate clean bone roll
bpy.ops.armature.calculate_roll(type='GLOBAL_POS_Z')
bpy.ops.object.mode_set(mode='OBJECT')

print(f"Created Armature with {len(arm_data.bones)} bones aligned forward (-Y).")

# 4. Bind Body Meshes with Automatic Weights
for name in ['tors', 'Shorts', 'legs', 'hands']:
    obj = bpy.data.objects[name]
    [o.select_set(False) for o in bpy.data.objects]
    obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    
    # Normalize weights and limit to 4 per vertex for mobile/WebGL performance
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.vertex_group_normalize_all()
    bpy.ops.object.vertex_group_limit_total(limit=4)
    print(f"Successfully bound {name} with automatic heat weights.")

# 5. Bind Haier 100% to mixamorig:Head
haier = bpy.data.objects['Haier']
[o.select_set(False) for o in bpy.data.objects]
haier.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.parent_set(type='ARMATURE')
vg_head = haier.vertex_groups.new(name='mixamorig:Head')
vg_head.add(range(len(haier.data.vertices)), 1.0, 'REPLACE')
print(f"Successfully bound Haier (100% weight to mixamorig:Head).")

# 6. Create Realistic Idle Breathing Animation (Looping, 3.0s = 90 frames @ 30fps)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='POSE')

fps = 30
bpy.context.scene.render.fps = fps
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = 90

def key_rot(bone_name, frame, rx, ry, rz):
    pbone = arm_obj.pose.bones[bone_name]
    pbone.rotation_mode = 'XYZ'
    pbone.rotation_euler = mathutils.Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ')
    pbone.keyframe_insert(data_path="rotation_euler", frame=frame)

# Frame 0: Rest / Exhale
key_rot("mixamorig:Spine1", 0, 0, 0, 0)
key_rot("mixamorig:Spine2", 0, 0, 0, 0)
key_rot("mixamorig:LeftBreast", 0, 0, 0, 0)
key_rot("mixamorig:RightBreast", 0, 0, 0, 0)

# Frame 45: Full Inhale (Spine straightens -0.8 / -1.2 deg, breasts lift +2.5 deg)
key_rot("mixamorig:Spine1", 45, -0.8, 0, 0)
key_rot("mixamorig:Spine2", 45, -1.2, 0, 0)
key_rot("mixamorig:LeftBreast", 45, 2.5, 0.3, -0.2)
key_rot("mixamorig:RightBreast", 45, 2.5, -0.3, 0.2)

# Frame 90: Return to Rest / Seamless loop
key_rot("mixamorig:Spine1", 90, 0, 0, 0)
key_rot("mixamorig:Spine2", 90, 0, 0, 0)
key_rot("mixamorig:LeftBreast", 90, 0, 0, 0)
key_rot("mixamorig:RightBreast", 90, 0, 0, 0)

if arm_obj.animation_data and arm_obj.animation_data.action:
    arm_obj.animation_data.action.name = "idle"

bpy.ops.object.mode_set(mode='OBJECT')
print("Successfully created 'idle' breathing animation with breast dynamics.")

# 7. Save updated woman.blend
bpy.ops.wm.save_mainfile(filepath=blend_path)
print(f"Saved rigged blend to: {blend_path}")

# 8. Export Draco Compressed GLBs & FBX
out_dir = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"

def select_only(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        if o:
            o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_image_format='NONE',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_animations=export_anim,
        export_skins=True,
        export_all_influences=False
    )
    sz = os.path.getsize(filepath) / 1024.0
    print(f"  -> Exported Draco GLB: {os.path.basename(filepath)} ({sz:.1f} KB)")

print("\n--- EXPORTING OPTIMIZED MODELS ---")

# A. woman.glb (Full Model with Hair and Skeleton + Idle Animation)
select_only([arm_obj] + [bpy.data.objects[n] for n in mesh_names])
export_draco_glb(os.path.join(out_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only with Skeleton + Idle Animation)
select_only([arm_obj] + [bpy.data.objects[n] for n in ['tors', 'Shorts', 'legs', 'hands']])
export_draco_glb(os.path.join(out_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only with Skeleton)
select_only([arm_obj, bpy.data.objects['Haier']])
export_draco_glb(os.path.join(out_dir, "hair.glb"), export_anim=False)

# D. woman_ing.fbx (FBX with Armature)
select_only([arm_obj] + [bpy.data.objects[n] for n in mesh_names])
fbx_path = os.path.join(out_dir, "woman_ing.fbx")
bpy.ops.export_scene.fbx(
    filepath=fbx_path,
    use_selection=True,
    add_leaf_bones=False,
    bake_anim=True
)
print(f"  -> Exported FBX: woman_ing.fbx ({os.path.getsize(fbx_path)/1024.0:.1f} KB)")

# E. woman_merged.glb (Joined Mesh)
dup_meshes = []
for n in mesh_names:
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
arm_mod.object = arm_obj

select_only([arm_obj, merged_mesh])
export_draco_glb(os.path.join(out_dir, "woman_merged.glb"), export_anim=True)

# Clean up merged temporary object
bpy.data.objects.remove(merged_mesh, do_unlink=True)

print("\n=== RIGGING & EXPORT COMPLETED 100% SUCCESSFULLY ===")
