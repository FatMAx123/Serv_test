import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath='d:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman_MAIN.fbx')

# Attach texture
tex_path = 'd:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/Textures/woman_atlas_2k.webp'
img = bpy.data.images.load(tex_path)
mat = bpy.data.materials.new("Mat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
tn.image = img
mat.node_tree.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])

for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat)

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

cam_data = bpy.data.cameras.new("Cam")
cam_obj = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 540
bpy.context.scene.render.film_transparent = True

# 1. 3/4 chest view
cam_obj.location = (0.60, -1.10, 1.35)
cam_obj.rotation_euler = (1.50, 0.0, 0.50)
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/raw_main_fbx_34.png'
bpy.ops.render.render(write_still=True)
print("Rendered raw_main_fbx_34.png")

# 2. Side profile
cam_obj.location = (1.20, -0.10, 1.35)
cam_obj.rotation_euler = (1.57, 0.0, 1.57)
bpy.context.scene.render.filepath = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/974084d4-f08c-480a-b3ab-a8e489e1aad1/scratch/raw_main_fbx_side.png'
bpy.ops.render.render(write_still=True)
print("Rendered raw_main_fbx_side.png")

