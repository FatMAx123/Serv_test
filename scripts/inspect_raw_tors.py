import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath='d:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx')

# Find tors object
tors = None
for o in bpy.data.objects:
    if "tors.001" in o.name:
        tors = o
        break

print("\n--- RAW TORS IN WOMAN_MAIN.FBX ---")
print("Tors vertices count:", len(tors.data.vertices))

# Find bounding box in chest region: z in [1.20, 1.40]
chest_verts = [v.co for v in tors.data.vertices if 1.20 <= v.co.z <= 1.40]
print(f"Chest vertices count in z=[1.20, 1.40]: {len(chest_verts)}")
min_y = min(v.y for v in chest_verts)
max_y = max(v.y for v in chest_verts)
min_x = min(v.x for v in chest_verts)
max_x = max(v.x for v in chest_verts)
print(f"Chest bounds: X=[{min_x:.3f}, {max_x:.3f}], Y=[{min_y:.3f}, {max_y:.3f}]")

# Check vertices on front (y < -0.10)
front_verts = [v for v in tors.data.vertices if 1.20 <= v.co.z <= 1.40 and v.co.y < -0.10]
print(f"Front chest vertices (y < -0.10): {len(front_verts)}")
# Sort by y (most forward)
front_verts.sort(key=lambda v: v.co.y)
for v in front_verts[:15]:
    print(f"  v{v.index}: x={v.co.x:+.3f}, y={v.co.y:+.3f}, z={v.co.z:.3f}")

