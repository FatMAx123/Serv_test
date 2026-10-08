"""
Updated Studio Setup with Expanded Cyclorama, Flawless Framing, and Multi-Camera Rigs
"""
import bpy
import math
from mathutils import Vector

def setup_studio():
    # 1. Clean existing studio objects
    for obj in list(bpy.data.objects):
        if obj.type in {'LIGHT', 'CAMERA'}:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith(('Studio_', 'Light_', 'Cam_')):
            bpy.data.objects.remove(obj, do_unlink=True)

    # 2. Identify character objects
    char_objs = [
        bpy.data.objects.get(name) for name in 
        ['New_Empty_Mesh.002', 'New_Empty_Mesh.003', 'New_Empty_Mesh.004', 'New_Empty_Mesh.005']
    ]
    char_objs = [o for o in char_objs if o is not None]
    
    if not char_objs:
        o1 = bpy.data.objects.get('New_Empty_Mesh.001')
        if o1:
            char_objs = [o1]

    for o in bpy.data.objects:
        if o in char_objs:
            o.hide_render = False
            o.hide_viewport = False
        elif o.type == 'MESH':
            o.hide_render = True
            o.hide_viewport = True

    # Compute bounding box
    all_verts = []
    for o in char_objs:
        for c in o.bound_box:
            all_verts.append(o.matrix_world @ Vector(c))
    
    min_z = min(v.z for v in all_verts)
    max_z = max(v.z for v in all_verts)
    min_x = min(v.x for v in all_verts)
    max_x = max(v.x for v in all_verts)
    min_y = min(v.y for v in all_verts)
    max_y = max(v.y for v in all_verts)
    
    center = Vector(((min_x + max_x) * 0.5, (min_y + max_y) * 0.5, (min_z + max_z) * 0.5))
    height = max_z - min_z
    print(f"[Studio] Character center: {center}, height: {height:.2f}m, bounds: Z[{min_z:.2f}..{max_z:.2f}]")

    # 3. Create Generous Seamless Cyclorama Backdrop (No seams, no black borders)
    mesh_cyc = bpy.data.meshes.new("Studio_Cyclorama_Mesh")
    obj_cyc = bpy.data.objects.new("Studio_Cyclorama", mesh_cyc)
    bpy.context.collection.objects.link(obj_cyc)

    w = 12.0 # Extra wide to guarantee 100% coverage
    d_front = 4.0 # Front floor
    d_back = 4.5 # Back wall
    h_back = 5.0 # High back wall
    radius = 2.0
    steps = 24

    profile = []
    profile.append((-d_front, min_z - 0.005))
    profile.append((d_back - radius, min_z - 0.005))
    
    for i in range(steps + 1):
        angle = (math.pi * 0.5) * (i / steps)
        y = (d_back - radius) + radius * math.sin(angle)
        z = (min_z - 0.005) + radius * (1.0 - math.cos(angle))
        profile.append((y, z))
        
    profile.append((d_back, min_z + h_back))

    verts = []
    faces = []
    num_p = len(profile)
    for p in profile:
        verts.append((-w * 0.5, p[0], p[1]))
    for p in profile:
        verts.append((w * 0.5, p[0], p[1]))

    for i in range(num_p - 1):
        faces.append([i, i + 1, num_p + i + 1, num_p + i])

    mesh_cyc.from_pydata(verts, [], faces)
    mesh_cyc.update()
    
    for poly in mesh_cyc.polygons:
        poly.use_smooth = True

    # Backdrop Material: Deep Sleek Studio Dark Slate Gradient
    mat_cyc = bpy.data.materials.new(name="Studio_Backdrop_Mat")
    mat_cyc.use_nodes = True
    bsdf_cyc = next(n for n in mat_cyc.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf_cyc.inputs['Base Color'].default_value = (0.04, 0.042, 0.048, 1.0)
    bsdf_cyc.inputs['Roughness'].default_value = 0.88
    bsdf_cyc.inputs['Specular IOR Level'].default_value = 0.2
    obj_cyc.data.materials.append(mat_cyc)

    # 4. Studio Pedestal (Smooth beveled base)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.75,
        depth=0.025,
        location=(center.x, center.y, min_z - 0.012),
        vertices=64
    )
    pedestal = bpy.context.active_object
    pedestal.name = "Studio_Pedestal"
    
    mat_ped = bpy.data.materials.new(name="Studio_Pedestal_Mat")
    mat_ped.use_nodes = True
    bsdf_ped = next(n for n in mat_ped.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf_ped.inputs['Base Color'].default_value = (0.028, 0.03, 0.035, 1.0)
    bsdf_ped.inputs['Roughness'].default_value = 0.6
    pedestal.data.materials.append(mat_ped)

    # 5. Studio Aim Targets
    aim_target_body = bpy.data.objects.new("Studio_AimTarget", None)
    aim_target_body.location = (center.x, center.y, center.z + 0.05)
    bpy.context.collection.objects.link(aim_target_body)

    aim_target_head = bpy.data.objects.new("Studio_AimHead", None)
    aim_target_head.location = (center.x, center.y, max_z - 0.16)
    bpy.context.collection.objects.link(aim_target_head)

    def add_light(name, ltype, loc, power, size_x, size_y, color, track_obj=aim_target_body):
        ldata = bpy.data.lights.new(name=name, type=ltype)
        ldata.energy = power
        ldata.color = color
        if ltype == 'AREA':
            ldata.shape = 'RECTANGLE'
            ldata.size = size_x
            ldata.size_y = size_y
        lobj = bpy.data.objects.new(name=name, object_data=ldata)
        lobj.location = loc
        bpy.context.collection.objects.link(lobj)
        if track_obj:
            c = lobj.constraints.new(type='TRACK_TO')
            c.target = track_obj
            c.track_axis = 'TRACK_NEGATIVE_Z'
            c.up_axis = 'UP_Y'
        return lobj

    # 5-Point Studio Lighting:
    # 1. Key Light (Soft, flattering key at 32 deg)
    add_light(
        "Light_Key", 'AREA',
        loc=(center.x + 1.4, center.y - 2.0, center.z + 0.9),
        power=125.0, size_x=1.3, size_y=1.8,
        color=(1.0, 0.97, 0.92)
    )

    # 2. Fill Light (Cool ambient softbox at -40 deg)
    add_light(
        "Light_Fill", 'AREA',
        loc=(center.x - 1.6, center.y - 1.8, center.z + 0.6),
        power=50.0, size_x=2.0, size_y=2.0,
        color=(0.88, 0.93, 1.0)
    )

    # 3. Rim Light Left (Sharp silhouette pop)
    add_light(
        "Light_Rim_Left", 'AREA',
        loc=(center.x - 1.2, center.y + 1.5, center.z + 0.9),
        power=150.0, size_x=0.45, size_y=1.8,
        color=(0.95, 0.98, 1.0)
    )

    # 4. Rim Light Right (Right hair/shoulder contour)
    add_light(
        "Light_Rim_Right", 'AREA',
        loc=(center.x + 1.2, center.y + 1.4, center.z + 0.8),
        power=110.0, size_x=0.45, size_y=1.6,
        color=(1.0, 0.96, 0.93)
    )

    # 5. Overhead Softbox (Top-down ambient)
    add_light(
        "Light_Top_Softbox", 'AREA',
        loc=(center.x, center.y - 0.3, center.z + 2.0),
        power=35.0, size_x=2.4, size_y=2.4,
        color=(0.96, 0.96, 1.0)
    )

    # 6. Subtle Ground Bounce (Lifts shoe / floor contact shadows)
    add_light(
        "Light_Ground_Bounce", 'AREA',
        loc=(center.x + 0.5, center.y - 1.1, min_z - 0.2),
        power=20.0, size_x=1.2, size_y=1.2,
        color=(0.92, 0.94, 0.98)
    )

    # 6. Cameras Setup
    # A. Beauty 3/4 Full Body Camera (Framed with perfect head-to-toe headroom)
    cam_data_34 = bpy.data.cameras.new("Cam_Beauty_34_Data")
    cam_data_34.lens = 75 # 75mm studio portrait lens
    cam_data_34.sensor_width = 36
    cam_obj_34 = bpy.data.objects.new("Cam_Beauty_34", cam_data_34)
    dist_34 = 2.85 # Pulled back slightly for full head-to-toe framing
    cam_angle_rad = math.radians(-16)
    cam_obj_34.location = (
        center.x + dist_34 * math.sin(cam_angle_rad),
        center.y - dist_34 * math.cos(cam_angle_rad),
        center.z + 0.05
    )
    c34 = cam_obj_34.constraints.new(type='TRACK_TO')
    c34.target = aim_target_body
    c34.track_axis = 'TRACK_NEGATIVE_Z'
    c34.up_axis = 'UP_Y'
    bpy.context.collection.objects.link(cam_obj_34)

    # B. Front Full Body Camera
    cam_data_front = bpy.data.cameras.new("Cam_Front_Data")
    cam_data_front.lens = 75
    cam_data_front.sensor_width = 36
    cam_obj_front = bpy.data.objects.new("Cam_Front", cam_data_front)
    cam_obj_front.location = (center.x, center.y - dist_34, center.z + 0.05)
    c_f = cam_obj_front.constraints.new(type='TRACK_TO')
    c_f.target = aim_target_body
    c_f.track_axis = 'TRACK_NEGATIVE_Z'
    c_f.up_axis = 'UP_Y'
    bpy.context.collection.objects.link(cam_obj_front)

    # C. Portrait Close-Up Camera (Waist & Face)
    cam_data_portrait = bpy.data.cameras.new("Cam_Portrait_Data")
    cam_data_portrait.lens = 90
    cam_data_portrait.sensor_width = 36
    cam_obj_portrait = bpy.data.objects.new("Cam_Portrait", cam_data_portrait)
    dist_p = 1.65
    cam_obj_portrait.location = (
        center.x + dist_p * math.sin(math.radians(-10)),
        center.y - dist_p * math.cos(math.radians(-10)),
        max_z - 0.16
    )
    c_p = cam_obj_portrait.constraints.new(type='TRACK_TO')
    c_p.target = aim_target_head
    c_p.track_axis = 'TRACK_NEGATIVE_Z'
    c_p.up_axis = 'UP_Y'
    bpy.context.collection.objects.link(cam_obj_portrait)

    # Set default camera
    bpy.context.scene.camera = cam_obj_34

    # 7. World Environment
    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("Studio_World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg_node = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg_node:
        bg_node.inputs['Color'].default_value = (0.015, 0.016, 0.02, 1.0)
        bg_node.inputs['Strength'].default_value = 0.2

    # 8. Cycles Ultra Settings & AgX Color Management
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles
    cycles.device = 'CPU'
    cycles.samples = 160
    cycles.use_adaptive_sampling = True
    cycles.adaptive_threshold = 0.012
    cycles.use_denoising = True
    cycles.denoiser = 'OPENIMAGEDENOISE'
    cycles.max_bounces = 8
    cycles.diffuse_bounces = 4
    cycles.glossy_bounces = 4
    cycles.transmission_bounces = 6
    cycles.caustics_reflective = False
    cycles.caustics_refractive = False

    # Resolution: 1600 x 2000 (4:5 Golden Portrait)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 2000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '8'

    # Color Management: AgX with punchy rich contrast
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        scene.view_settings.look = 'AgX - High Contrast'

    print("[Studio] Advanced studio setup complete!")
    return char_objs, cam_obj_34, cam_obj_front, cam_obj_portrait

if __name__ == "__main__":
    setup_studio()
