import bpy
import os
import glob

weapons_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\weapons"
fbx_files = [
    "novice.fbx",
    "magic_mace.fbx",
    "atuba_mace.fbx",
    "demon_staff.fbx",
    "tears_fairy.fbx",
    "apprentice_wand.fbx"
]

print("==========================================================")
print("WEAPONS FBX GEOMETRY AND AXIS ANALYSIS (BLENDER)")
print("==========================================================")

for fname in fbx_files:
    fpath = os.path.join(weapons_dir, fname)
    if not os.path.exists(fpath):
        print(f"File not found: {fname}")
        continue
    
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fpath)
    
    # Remove lights, camera, cube
    for o in list(bpy.data.objects):
        if o.name in ['Cube', 'Camera', 'Light'] or o.type not in ['MESH', 'EMPTY']:
            bpy.data.objects.remove(o, do_unlink=True)
            
    mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
    if not mesh_objs:
        print(f"{fname}: NO MESHES FOUND")
        continue
        
    print(f"\n>>> Weapon: {fname}")
    for m in mesh_objs:
        # Compute bounding box in object space
        bb = m.bound_box
        min_x = min(p[0] for p in bb)
        max_x = max(p[0] for p in bb)
        min_y = min(p[1] for p in bb)
        max_y = max(p[1] for p in bb)
        min_z = min(p[2] for p in bb)
        max_z = max(p[2] for p in bb)
        
        dim_x = max_x - min_x
        dim_y = max_y - min_y
        dim_z = max_z - min_z
        
        print(f"  Mesh: {m.name} | Verts: {len(m.data.vertices)}")
        print(f"  Bounds X: [{min_x:7.2f}, {max_x:7.2f}] -> Size: {dim_x:7.2f}")
        print(f"  Bounds Y: [{min_y:7.2f}, {max_y:7.2f}] -> Size: {dim_y:7.2f}")
        print(f"  Bounds Z: [{min_z:7.2f}, {max_z:7.2f}] -> Size: {dim_z:7.2f}")
        
        # Determine long axis
        axes = [('X', dim_x, min_x, max_x), ('Y', dim_y, min_y, max_y), ('Z', dim_z, min_z, max_z)]
        axes.sort(key=lambda a: a[1], reverse=True)
        long_axis = axes[0][0]
        long_len = axes[0][1]
        a_min = axes[0][2]
        a_max = axes[0][3]
        
        # Determine which end is thick (head) and which end is thin (handle)
        idx = 0 if long_axis == 'X' else (1 if long_axis == 'Y' else 2)
        min_rads, max_rads = [], []
        for v in m.data.vertices:
            pos = v.co
            val = pos[idx]
            frac = (val - a_min) / max(0.001, long_len)
            r = (pos[(idx+1)%3]**2 + pos[(idx+2)%3]**2)**0.5
            if frac < 0.25:
                min_rads.append(r)
            elif frac > 0.75:
                max_rads.append(r)
                
        avg_min_r = sum(min_rads) / max(1, len(min_rads))
        avg_max_r = sum(max_rads) / max(1, len(max_rads))
        
        head = f"+{long_axis}" if avg_max_r > avg_min_r else f"-{long_axis}"
        handle = f"-{long_axis}" if avg_max_r > avg_min_r else f"+{long_axis}"
        
        print(f"  --> Long Axis: {long_axis} (Length={long_len:.2f})")
        print(f"  --> HEAD is at: {head} (avg_r={max(avg_min_r, avg_max_r):.2f})")
        print(f"  --> HANDLE is at: {handle} (avg_r={min(avg_min_r, avg_max_r):.2f})")

