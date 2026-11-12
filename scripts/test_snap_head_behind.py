import bpy
from mathutils.bvhtree import BVHTree

tors = bpy.data.objects["tors"]
head = bpy.data.objects["Head"]

tmw = tors.matrix_world
t_verts = [tmw @ v.co for v in tors.data.vertices]
t_polys = [list(p.vertices) for p in tors.data.polygons]
t_bvh = BVHTree.FromPolygons(t_verts, t_polys)

print("\n--- SNAPPING HEAD CHEST VERTICES BEHIND TORS ---")
adjusted = 0
for v in head.data.vertices:
    co = v.co
    # Chest skin region: z in [1.25, 1.45], y < -0.05
    if 1.25 <= co.z <= 1.45 and co.y < -0.05:
        loc, norm, fidx, dist = t_bvh.find_nearest(co)
        if loc is not None:
            # We want Head vertex to be behind tors along Y:
            # In chest front, "behind" means larger Y (towards spine +Y)
            # Ensure co.y >= loc.y + 0.005 (at least 5mm behind tors)
            if co.y < loc.y + 0.005:
                old_y = co.y
                co.y = loc.y + 0.006
                adjusted += 1

head.data.update()
print(f"Adjusted {adjusted} Head chest vertices to stay strictly 6mm behind tors.")

