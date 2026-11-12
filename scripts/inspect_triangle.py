import bpy

tors = bpy.data.objects["tors"]
head = bpy.data.objects["Head"]

print("\n--- INSPECTING TRIANGLE AT x in [-0.05, 0.0], z in [1.30, 1.36] ---")
for obj_name, obj in [("tors", tors), ("Head", head)]:
    print(f"\nObject {obj_name}:")
    for poly in obj.data.polygons:
        verts = [obj.data.vertices[vi].co for vi in poly.vertices]
        center = sum(verts, bpy.data.objects["tors"].location) / len(verts)
        if -0.05 <= center.x <= 0.01 and 1.29 <= center.z <= 1.36 and center.y < -0.12:
            v_indices = list(poly.vertices)
            print(f"  Poly {poly.index} (verts={v_indices}): center=({center.x:.3f}, {center.y:.3f}, {center.z:.3f})")
            for vi in v_indices:
                v = obj.data.vertices[vi]
                print(f"    v{vi}: co=({v.co.x:+.3f}, {v.co.y:+.3f}, {v.co.z:.3f})")
