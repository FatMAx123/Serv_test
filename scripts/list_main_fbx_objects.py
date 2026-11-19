import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_MAIN.fbx")
for o in bpy.data.objects:
    print(f"Object: {o.name}, type: {o.type}")

