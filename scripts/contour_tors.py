import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath='d:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx')

tors = [o for o in bpy.data.objects if "tors.001" in o.name][0]

print("\n--- FRONT CONTOUR (min Y for each Z band) ---")
for z_band in [1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40]:
    vs = [v for v in tors.data.vertices if abs(v.co.z - z_band) < 0.025 and abs(v.co.x) < 0.12]
    if vs:
        min_y = min(v.co.y for v in vs)
        front_v = [v for v in vs if v.co.y == min_y][0]
        # also find sternum (min |x|)
        sternum_v = min(vs, key=lambda v: abs(v.co.x))
        print(f"Z={z_band:.2f}: min_y={min_y:.3f} (at x={front_v.co.x:+.3f}) | sternum_y={sternum_v.co.y:.3f} (at x={sternum_v.co.x:+.3f})")

