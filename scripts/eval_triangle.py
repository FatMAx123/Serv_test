import bpy

arm = bpy.data.objects["Armature"]
act = bpy.data.actions.get("sit_loop")
if act:
    arm.animation_data.action = act
bpy.context.scene.frame_set(40)
bpy.context.view_layer.update()

dg = bpy.context.evaluated_depsgraph_get()
tors = bpy.data.objects["tors"].evaluated_get(dg)
head = bpy.data.objects["Head"].evaluated_get(dg)

print("\n--- EVALUATED SIT_LOOP F=40 COORDS ---")
print("tors v20, v22, v194, v195, v196:")
for vi in [20, 22, 194, 195, 196]:
    print(f"  tors v{vi}: {tors.data.vertices[vi].co}")
    # print bone weights
    w = {bpy.data.objects["tors"].vertex_groups[g.group].name.replace('mixamorig:',''): g.weight for g in bpy.data.objects["tors"].data.vertices[vi].groups if g.weight > 0.05}
    print(f"    weights: {w}")

print("\nHead v3, v4, v5, v8, v62:")
for vi in [3, 4, 5, 8, 62]:
    print(f"  Head v{vi}: {head.data.vertices[vi].co}")
    w = {bpy.data.objects["Head"].vertex_groups[g.group].name.replace('mixamorig:',''): g.weight for g in bpy.data.objects["Head"].data.vertices[vi].groups if g.weight > 0.05}
    print(f"    weights: {w}")

