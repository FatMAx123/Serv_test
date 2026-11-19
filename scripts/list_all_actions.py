import bpy

print("=== ACTIONS IN эмодзи.fbx ===")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx")
for act in bpy.data.actions:
    print(f"Action: {act.name}, frames: {act.frame_range[0]}..{act.frame_range[1]}")

print("\n=== ACTIONS IN woman.blend ===")
bpy.ops.wm.open_mainfile(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend")
for act in bpy.data.actions:
    print(f"Action: {act.name:25}, frames: {act.frame_range[0]}..{act.frame_range[1]}")

