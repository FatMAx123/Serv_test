import bpy
import os
import mathutils

emoji_fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
tors = bpy.data.objects['tors']
shorts = bpy.data.objects['Shorts']

# Get boundary loops
def get_boundary_verts(obj, max_z=None, min_z=None):
    edge_poly_count = {}
    for poly in obj.data.polygons:
        for ek in poly.edge_keys:
            edge_poly_count[ek] = edge_poly_count.get(ek, 0) + 1
    b_verts = set()
    for (v1, v2), c in edge_poly_count.items():
        if c == 1:
            b_verts.add(v1)
            b_verts.add(v2)
    filtered = []
    for idx in b_verts:
        z = (obj.matrix_world @ obj.data.vertices[idx].co).z
        if max_z is not None and z > max_z: continue
        if min_z is not None and z < min_z: continue
        filtered.append(idx)
    return filtered

tors_waist = get_boundary_verts(tors, max_z=0.58)
shorts_waist = get_boundary_verts(shorts, min_z=0.58)

print(f"tors waist verts: {len(tors_waist)}, shorts waist verts: {len(shorts_waist)}")

# Let's inspect weights of these specific waist boundary verts!
print("\n--- TORS WAIST BORDER VERTEX WEIGHTS ---")
vg_tors = {vg.index: vg.name for vg in tors.vertex_groups}
for v_idx in tors_waist[:6]:
    v = tors.data.vertices[v_idx]
    w_str = ", ".join([f"{vg_tors.get(g.group, g.group)}: {g.weight:.2f}" for g in v.groups])
    print(f"  tors v{v_idx}: {w_str}")

print("\n--- SHORTS WAIST BORDER VERTEX WEIGHTS ---")
vg_shorts = {vg.index: vg.name for vg in shorts.vertex_groups}
for v_idx in shorts_waist[:6]:
    v = shorts.data.vertices[v_idx]
    w_str = ", ".join([f"{vg_shorts.get(g.group, g.group)}: {g.weight:.2f}" for g in v.groups])
    print(f"  shorts v{v_idx}: {w_str}")

# Now let's play 'садится' and check coordinates of the BACK waist vertices (negative Y is back in Mixamo)
sit_action = [a for a in bpy.data.actions if 'садится' in a.name][0]
arm.animation_data_create()
arm.animation_data.action = sit_action

# Find back-most vertex on tors and shorts
# In Blender, +Y is back or -Y is back? Let's check rest pose coordinates:
# spine is at y=0, chest is +y or -y?
print("\nRest pose bounding box centers:")
print("tors center:", sum((v.co for v in tors.data.vertices), mathutils.Vector()) / len(tors.data.vertices))

for frame in [1, 20, 35, 45, 60, 96]:
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    t_eval = tors.evaluated_get(dg)
    s_eval = shorts.evaluated_get(dg)
    
    # World coords of waist verts
    t_coords = [t_eval.matrix_world @ t_eval.data.vertices[idx].co for idx in tors_waist]
    s_coords = [s_eval.matrix_world @ s_eval.data.vertices[idx].co for idx in shorts_waist]
    
    # Sort by Y (front to back)
    # min Y is back or max Y is back? Let's print min and max Y and Z
    min_yt = min(c.y for c in t_coords)
    min_ys = min(c.y for c in s_coords)
    max_yt = max(c.y for c in t_coords)
    max_ys = max(c.y for c in s_coords)
    
    # Let's find minimum distance between any tors waist vert and shorts waist vert
    # or specifically at the back
    back_t = [c for c in t_coords if c.y == min_yt][0]
    # find closest s_coord
    closest_s = min(s_coords, key=lambda sc: (sc - back_t).length)
    dist = (back_t - closest_s).length
    print(f"Frame {frame:02d}: back tors=({back_t.x:.3f}, {back_t.y:.3f}, {back_t.z:.3f}), closest shorts=({closest_s.x:.3f}, {closest_s.y:.3f}, {closest_s.z:.3f}), dist={dist:.4f} m (Z-diff={back_t.z - closest_s.z:.4f})")
