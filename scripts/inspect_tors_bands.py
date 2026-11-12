import bpy
import os

emoji_fbx = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\animations\эмодзи.fbx"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

tors = bpy.data.objects['tors']
vg_map = {vg.index: vg.name for vg in tors.vertex_groups}

zs = [(tors.matrix_world @ v.co).z for v in tors.data.vertices]
min_z, max_z = min(zs), max(zs)
print(f"tors Z: min={min_z:.4f}, max={max_z:.4f}, total verts={len(tors.data.vertices)}")

bands = 5
for b in range(bands):
    z_low = min_z + b * (max_z - min_z) / bands
    z_high = z_low + (max_z - min_z) / bands
    b_verts = [v for v in tors.data.vertices if z_low <= (tors.matrix_world @ v.co).z < z_high or (b == bands - 1 and (tors.matrix_world @ v.co).z >= z_high)]
    
    weights = {}
    for v in b_verts:
        for g in v.groups:
            bname = vg_map.get(g.group, 'unknown')
            weights[bname] = weights.get(bname, 0) + g.weight
    total_w = sum(weights.values()) or 1.0
    print(f"\nBand {b} (Z [{z_low:.3f}..{z_high:.3f}], {len(b_verts)} verts):")
    for bname, w in sorted(weights.items(), key=lambda x: -x[1])[:5]:
        print(f"  {bname}: {w/len(b_verts):.3f} ({(w/total_w)*100:.1f}%)")

