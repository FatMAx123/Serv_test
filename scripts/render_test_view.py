import bpy

arm = bpy.data.objects["Armature"]
act = bpy.data.actions.get("sit_loop")
if act:
    arm.animation_data.action = act
bpy.context.scene.frame_set(40)
bpy.context.view_layer.update()

# Render test images of sit_loop from:
# 1. User camera view (matching media_1794504279944_03b910ca.jpg)
# 2. Chest close up profile
# 3. Hip close up
cam_data = bpy.data.cameras.new("TestCam")
cam_obj = bpy.data.objects.new("TestCam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = True

# 1. Matching user view in showroom:
# In showroom: camera is at isometric/front-left angle looking at the character sitting
cam_obj.location = (0.55, -1.25, 0.95)
cam_obj.rotation_euler = (1.25, 0.0, 0.42)
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/test_user_view.png'
bpy.ops.render.render(write_still=True)
print("Rendered test_user_view.png")

