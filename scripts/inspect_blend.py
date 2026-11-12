import bpy
import os

woman_blend = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend"
bpy.ops.wm.open_mainfile(filepath=woman_blend)

print("\n=== OBJECTS IN woman.blend ===")
for o in bpy.data.objects:
    print(f"Object: {o.name} ({o.type}), parent: {o.parent.name if o.parent else 'None'}")
    if o.type == 'MESH':
        print(f"  verts: {len(o.data.vertices)}, vgroups: {[vg.name for vg in o.vertex_groups][:5]}")

