import bpy
from mathutils import Vector

arm = bpy.data.objects["Armature"]
act = bpy.data.actions.get("sit_loop")
if act:
    arm.animation_data.action = act
bpy.context.scene.frame_set(40)
bpy.context.view_layer.update()

sp2 = arm.pose.bones["mixamorig:Spine2"]
chest_pos = arm.matrix_world @ sp2.head
print(f"Chest pos at f=40: {chest_pos}")

# Setup camera
cam_data = bpy.data.cameras.new("UserCam")
cam_obj = bpy.data.objects.new("UserCam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Setup lights
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

bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = True

# 1. User view in screenshot media_1794504279944_03b910ca.jpg
cam_obj.location = Vector((chest_pos.x - 0.45, chest_pos.y - 0.95, chest_pos.z + 0.15))
direction = chest_pos - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

p1 = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_sit_user_match.png'
bpy.context.scene.render.filepath = p1
bpy.ops.render.render(write_still=True)
print(f"Rendered {p1}")

# 2. Full body sitting view
cam_obj.location = Vector((chest_pos.x - 0.90, chest_pos.y - 1.60, chest_pos.z + 0.35))
direction = (chest_pos + Vector((0, 0, -0.2))) - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

p2 = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/diag_PERFECT_sit_full_body.png'
bpy.context.scene.render.filepath = p2
bpy.ops.render.render(write_still=True)
print(f"Rendered {p2}")
