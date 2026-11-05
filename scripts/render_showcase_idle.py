import bpy
import mathutils
import math
import os

blend_path = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend"
art_dir = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\6ccde42e-302c-409d-beb0-32002ed89b3a"

bpy.ops.wm.open_mainfile(filepath=blend_path)

# Set up Camera
cam_data = bpy.data.cameras.new('ShowcaseCam')
cam_obj = bpy.data.objects.new('ShowcaseCam', cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Set up 3-point lighting
sun_key = bpy.data.lights.new('KeySun', 'SUN')
sun_key.energy = 3.5
obj_key = bpy.data.objects.new('KeySun', sun_key)
bpy.context.scene.collection.objects.link(obj_key)
obj_key.rotation_euler = (math.radians(50), math.radians(15), math.radians(-30))

sun_fill = bpy.data.lights.new('FillSun', 'SUN')
sun_fill.energy = 1.5
obj_fill = bpy.data.objects.new('FillSun', sun_fill)
bpy.context.scene.collection.objects.link(obj_fill)
obj_fill.rotation_euler = (math.radians(45), math.radians(-20), math.radians(60))

sun_rim = bpy.data.lights.new('RimSun', 'SUN')
sun_rim.energy = 2.0
obj_rim = bpy.data.objects.new('RimSun', sun_rim)
bpy.context.scene.collection.objects.link(obj_rim)
obj_rim.rotation_euler = (math.radians(-40), math.radians(10), math.radians(170))

bpy.context.scene.render.resolution_x = 720
bpy.context.scene.render.resolution_y = 1080

# 1. Front View - Frame 0 (Base Idle Stance)
cam_obj.location = (0, -3.8, 1.05)
cam_obj.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.frame_set(0)
out_front = os.path.join(art_dir, "woman_idle_front_frame0.png")
bpy.context.scene.render.filepath = out_front
bpy.ops.render.render(write_still=True)
print("Rendered:", out_front)

# 2. Perspective 3/4 View - Frame 45 (Inhale Peak)
cam_obj.location = (1.8, -3.2, 1.15)
cam_obj.rotation_euler = (math.radians(82), 0, math.radians(28))
bpy.context.scene.frame_set(45)
out_34 = os.path.join(art_dir, "woman_idle_34_frame45.png")
bpy.context.scene.render.filepath = out_34
bpy.ops.render.render(write_still=True)
print("Rendered:", out_34)
