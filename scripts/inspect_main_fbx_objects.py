import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath='d:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx')

# Let's inspect objects in woman_MAIN.fbx
for o in bpy.data.objects:
    print(f"Object: {o.name}, type: {o.type}")
    if o.type == 'MESH':
        print(f"  verts: {len(o.data.vertices)}, bounds: X=[{min(v.co.x for v in o.data.vertices):.3f}, {max(v.co.x for v in o.data.vertices):.3f}], Y=[{min(v.co.y for v in o.data.vertices):.3f}, {max(v.co.y for v in o.data.vertices):.3f}], Z=[{min(v.co.z for v in o.data.vertices):.3f}, {max(v.co.z for v in o.data.vertices):.3f}]")

