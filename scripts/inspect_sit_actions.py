import bpy
import os

emoji_fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

actions = [a for a in bpy.data.actions if 'садится' in a.name or 'встаёт' in a.name or 'сидит' in a.name]
for act in actions:
    print(f"\nAction: {act.name}")
    print(f"  Frame range: {act.frame_range}")
    # Inspect fcurves
    fcurves_by_bone = {}
    if hasattr(act, 'fcurves'):
        for fc in act.fcurves:
            bone = fc.data_path.split('"')[1] if '"' in fc.data_path else fc.data_path
            fcurves_by_bone[bone] = fcurves_by_bone.get(bone, 0) + 1
        print(f"  Bones animated ({len(fcurves_by_bone)}): {list(fcurves_by_bone.keys())[:8]}...")
    else:
        print("  New Blender 5.2 slotted action")

