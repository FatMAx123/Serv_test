import bpy

fbx_path = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\Idle.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
act = arm.animation_data.action

fcurves = []
for l in act.layers:
    for st in l.strips:
        for cb in st.channelbags:
            for fc in cb.fcurves:
                fcurves.append(fc)

print(f"Action {act.name}: {len(fcurves)} fcurves, range={act.frame_range}")

# Check keyframe values for Hips location
for fc in fcurves:
    if 'Hips' in fc.data_path and 'location' in fc.data_path:
        vals = [kp.co[1] for kp in fc.keyframe_points]
        print(f"Hips location[{fc.array_index}]: min={min(vals):.3f}, max={max(vals):.3f}")

# Check rotation of Spine/Spine1/Spine2/Head
for bname in ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']:
    fcs = [fc for fc in fcurves if bname in fc.data_path and 'rotation' in fc.data_path]
    print(f"Bone {bname} rotation fcurves: {len(fcs)}")