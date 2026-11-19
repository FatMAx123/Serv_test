import bpy

fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_MAIN.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)

orig = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman_original_backup_1.blend"

print("--- woman_MAIN.fbx meshes ---")
for o in bpy.data.objects:
    if o.type == 'MESH':
        print(f"Mesh: {o.name}, verts={len(o.data.vertices)}, faces={len(o.data.polygons)}")

# Compare vertex positions between woman_MAIN.fbx tors.001 and backup_1 tors
fbx_tors = bpy.data.objects.get("tors.001")
fbx_head = bpy.data.objects.get("tors")

with bpy.data.libraries.load(orig) as (df, dt):
    dt.objects = ['Head', 'tors']

orig_head = dt.objects[0]
orig_tors = dt.objects[1]

# Measure breast apex in fbx_tors vs orig_tors
# Find front-most vertex in fbx_tors
min_y_fbx = min(v.co.y for v in fbx_tors.data.vertices)
min_y_orig = min(v.co.y for v in orig_tors.data.vertices)

print(f"\nFront-most Y in fbx_tors (shirt): {min_y_fbx:.4f} m")
print(f"Front-most Y in orig_tors (shirt): {min_y_orig:.4f} m")
print(f"Bust projection increase: {(min_y_orig - min_y_fbx)*100:.2f} cm fuller!")

# Also check fbx_head vs orig_head
min_y_fbx_head = min(v.co.y for v in fbx_head.data.vertices if v.co.z <= 1.40)
min_y_orig_head = min(v.co.y for v in orig_head.data.vertices if v.co.z <= 1.40)
print(f"Front-most Y in fbx_head chest: {min_y_fbx_head:.4f} m")
print(f"Front-most Y in orig_head chest: {min_y_orig_head:.4f} m")
print(f"Clearance between fbx shirt and fbx head: {(min_y_fbx_head - min_y_fbx)*100:.2f} cm (shirt is in front of head!)")

