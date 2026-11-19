import bpy

bpy.ops.wm.open_mainfile(filepath=r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend")

arm = bpy.data.objects.get("Armature")
hands = bpy.data.objects.get("hands")

act = bpy.data.actions.get('sit_loop')
arm.animation_data.action = act

for frame in [0, 30, 60, 90]:
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_hands = hands.evaluated_get(depsgraph)
    mesh = eval_hands.to_mesh()
    min_z = min(v.co.z for v in mesh.vertices) # in world space (Blender Z is up)
    eval_hands.to_mesh_clear()
    print(f"sit_loop frame {frame:2d}: lowest hand vertex Z = {min_z:.4f} m ({min_z*100:.2f} cm)")

