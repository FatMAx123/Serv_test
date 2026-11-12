import bpy
import os

arm = bpy.data.objects["Armature"]
act = bpy.data.actions.get("sit_loop")
if act:
    arm.animation_data.action = act

print("\n--- SIT_LOOP STRETCH REPORT ---")
dg = bpy.context.evaluated_depsgraph_get()
for f in [1, 40, 80]:
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    for o_name in ["tors", "Shorts", "legs", "Head"]:
        o = bpy.data.objects[o_name]
        eval_o = o.evaluated_get(dg)
        max_r = 0.0
        for edge in eval_o.data.edges:
            v1_e = eval_o.data.vertices[edge.vertices[0]].co
            v2_e = eval_o.data.vertices[edge.vertices[1]].co
            l_e = (v1_e - v2_e).length
            v1_r = o.data.vertices[edge.vertices[0]].co
            v2_r = o.data.vertices[edge.vertices[1]].co
            l_r = (v1_r - v2_r).length
            if l_r > 1e-4:
                max_r = max(max_r, l_e / l_r)
        print(f"sit_loop f={f:2d} {o_name:6s} max_stretch={max_r:.2f}x")

# Set up lights
light_data = bpy.data.lights.new("Sun", "SUN")
light_data.energy = 4.0
light_obj = bpy.data.objects.new("Sun", light_data)
light_obj.rotation_euler = (0.7, 0.3, 0.5)
bpy.context.collection.objects.link(light_obj)

fill_data = bpy.data.lights.new("Fill", "SUN")
fill_data.energy = 2.0
fill_obj = bpy.data.objects.new("Fill", fill_data)
fill_obj.rotation_euler = (0.5, -0.6, -1.0)
bpy.context.collection.objects.link(fill_obj)

cam_data = bpy.data.cameras.new("Cam")
cam_obj = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = True

# 1. Matching showroom angle in sit_loop f=40
cam_obj.location = (0.70, -1.30, 0.65)
cam_obj.rotation_euler = (1.30, 0.0, 0.50)
bpy.context.scene.frame_set(40)
bpy.context.view_layer.update()
p1 = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_BUST_sit_user.png'
bpy.context.scene.render.filepath = p1
bpy.ops.render.render(write_still=True)
print(f"Rendered {p1}")

# 2. Side profile in sit_loop f=40
cam_obj.location = (1.40, -0.25, 0.60)
cam_obj.rotation_euler = (1.45, 0.0, 1.70)
p2 = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_BUST_sit_side.png'
bpy.context.scene.render.filepath = p2
bpy.ops.render.render(write_still=True)
print(f"Rendered {p2}")

# 3. Rest pose T-pose profile
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

cam_obj.location = (1.30, -0.15, 1.30)
cam_obj.rotation_euler = (1.57, 0.0, 1.57)
p3 = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_BUST_rest_side.png'
bpy.context.scene.render.filepath = p3
bpy.ops.render.render(write_still=True)
print(f"Rendered {p3}")

