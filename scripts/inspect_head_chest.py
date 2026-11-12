import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath='d:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx')

head = [o for o in bpy.data.objects if o.name == "tors"][0]
print("\n--- HEAD MESH CHEST/NECK VERTICES ---")
head_verts = [v for v in head.data.vertices if 1.25 <= v.co.z <= 1.45 and v.co.y < -0.05]
print("Head vertices in z=[1.25, 1.45]:", len(head_verts))
head_verts.sort(key=lambda v: v.co.z)
for v in head_verts:
    print(f"  v{v.index}: x={v.co.x:+.3f}, y={v.co.y:+.3f}, z={v.co.z:.3f}")

