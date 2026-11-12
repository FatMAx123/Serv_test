import bpy
import os
import mathutils

emoji_fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

tors = bpy.data.objects['tors']
shorts = bpy.data.objects['Shorts']

# Get world matrix coordinates of all vertices
tors_mw = tors.matrix_world
shorts_mw = shorts.matrix_world

tors_v_world = [tors_mw @ v.co for v in tors.data.vertices]
shorts_v_world = [shorts_mw @ v.co for v in shorts.data.vertices]

# Find lowest vertices of tors
min_z_tors = min(v.z for v in tors_v_world)
max_z_shorts = max(v.z for v in shorts_v_world)

print(f"tors Z range: [{min_z_tors:.4f}, {max(v.z for v in tors_v_world):.4f}]")
print(f"shorts Z range: [{min(v.z for v in shorts_v_world):.4f}, {max_z_shorts:.4f}]")
print(f"Overlap range: [{min_z_tors:.4f}, {max_z_shorts:.4f}] (overlap height = {max_z_shorts - min_z_tors:.4f} m)")

# Let's inspect the boundary loops
# A boundary edge is an edge with only 1 polygon attached
def get_boundary_verts(obj):
    edge_poly_count = {}
    for poly in obj.data.polygons:
        for ek in poly.edge_keys:
            edge_poly_count[ek] = edge_poly_count.get(ek, 0) + 1
    
    boundary_edges = [ek for ek, c in edge_poly_count.items() if c == 1]
    b_verts = set()
    for v1, v2 in boundary_edges:
        b_verts.add(v1)
        b_verts.add(v2)
    return b_verts

tors_bverts = get_boundary_verts(tors)
shorts_bverts = get_boundary_verts(shorts)

# Filter to waist boundary (lowest boundary for tors, highest for shorts)
tors_waist_bverts = [v_idx for v_idx in tors_bverts if tors_v_world[v_idx].z < min_z_tors + 0.04]
shorts_waist_bverts = [v_idx for v_idx in shorts_bverts if shorts_v_world[v_idx].z > max_z_shorts - 0.04]

print(f"tors waist boundary vertices count: {len(tors_waist_bverts)}")
print(f"shorts waist boundary vertices count: {len(shorts_waist_bverts)}")

# Print some coordinates
print("\ntors waist boundary sample (x, y, z):")
for idx in tors_waist_bverts[:5]:
    c = tors_v_world[idx]
    print(f"  v{idx}: ({c.x:.4f}, {c.y:.4f}, {c.z:.4f})")

print("\nshorts waist boundary sample (x, y, z):")
for idx in shorts_waist_bverts[:5]:
    c = shorts_v_world[idx]
    print(f"  v{idx}: ({c.x:.4f}, {c.y:.4f}, {c.z:.4f})")

