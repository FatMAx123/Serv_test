import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.glb")

print(f"Total actions loaded: {len(bpy.data.actions)}")
for action in bpy.data.actions:
    print(f"\n--- Action: {action.name} (users={action.users}) ---")
    # In Blender 5.2, check fcurves or channels or slots
    fcurves = list(action.fcurves) if hasattr(action, 'fcurves') else []
    print(f"  Fcurves count: {len(fcurves)}")
    
    # Look for Armature or Hips location
    for fc in fcurves:
        if 'location' in fc.data_path:
            pts = [round(k.co[1], 4) for k in fc.keyframe_points[:3]]
            print(f"    {fc.data_path}[{fc.array_index}]: len={len(fc.keyframe_points)}, samples={pts}")

