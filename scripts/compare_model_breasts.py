import bpy

files = [
    ("backup_1", r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_original_backup_1.blend"),
    ("woman_MAIN.fbx", r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_MAIN.fbx"),
]

for label, path in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=path)
    elif path.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path)
    
    # Find tors
    tors_objs = [o for o in bpy.data.objects if 'tors' in o.name]
    if not tors_objs:
        print(f"{label}: NO tors found")
        continue
    tors = tors_objs[0]
    
    # Measure breast vertices Y projection in rest pose
    # In rest pose: front-most chest vertices
    front_chest = [v.co for v in tors.data.vertices if 1.25 <= v.co.z <= 1.40 and v.co.y < 0]
    if front_chest:
        min_y = min(p.y for p in front_chest)
        print(f"{label}: tors verts={len(tors.data.vertices)}, front-most chest Y={min_y:.4f} m")
    else:
        print(f"{label}: no front chest verts")
        
    # Check breast bones in armature
    arm_objs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if arm_objs:
        arm = arm_objs[0]
        for bname in ['mixamorig:RightBreast', 'mixamorig:LeftBreast', 'RightBreast', 'LeftBreast']:
            b = arm.data.bones.get(bname)
            if b:
                print(f"  {label} bone {b.name}: head={b.head}, length={b.length:.4f}")

