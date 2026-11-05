import bpy
import mathutils
import math
import os
import shutil

print("============================================================")
print("Project Steam: Integrating Authentic Mixamo Rig for Woman")
print("Including 65 Mixamo Bones + 2 Breast Bones + Head Hair Binding")
print("============================================================\n")

base_dir = r"d:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
fbx_rig_path = os.path.join(base_dir, "woman_ing_rig.fbx")
blend_path = os.path.join(base_dir, "woman.blend")
blend_backup_path = os.path.join(base_dir, "woman_original_backup_1.blend")

if not os.path.exists(fbx_rig_path):
    raise FileNotFoundError(f"Rig source FBX not found: {fbx_rig_path}")

# Start clean in Blender
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the authentic Mixamo rig
print(f"Importing Mixamo rigged character: {fbx_rig_path} ...")
bpy.ops.import_scene.fbx(filepath=fbx_rig_path)

# Remove default/foreign non-character objects if any
for name in ['Camera', 'Cube', 'Light']:
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

arm = bpy.data.objects.get('Armature')
if not arm:
    raise RuntimeError("Armature object not found in FBX!")

mesh_names = ['Haier', 'hands', 'Head', 'legs', 'Shorts', 'tors']
for mname in mesh_names:
    if mname not in bpy.data.objects:
        raise RuntimeError(f"Required mesh '{mname}' not found in imported FBX!")

# Apply all transforms to Armature and all meshes (standard 1.0 unit scale, 0 rotation)
for o in bpy.data.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("Transforms applied cleanly (1:1 meter scale).")

# 1. Hair 100% Solid Attachment to mixamorig:Head
haier = bpy.data.objects['Haier']
haier.vertex_groups.clear()
vg_head = haier.vertex_groups.new(name='mixamorig:Head')
vg_head.add(range(len(haier.data.vertices)), 1.0, 'REPLACE')
print(f"Haier: 100% attached to mixamorig:Head ({len(haier.data.vertices)} vertices).")

# 2. Add LeftBreast and RightBreast to Armature
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
spine2 = eb.get('mixamorig:Spine2')
if not spine2:
    raise RuntimeError("mixamorig:Spine2 not found in Armature!")

# Create Breast Bones
if 'mixamorig:LeftBreast' not in eb:
    b_l = eb.new('mixamorig:LeftBreast')
    b_l.head = mathutils.Vector((0.070, -0.015, 1.340))
    b_l.tail = mathutils.Vector((0.085, -0.125, 1.335))
    b_l.parent = spine2

if 'mixamorig:RightBreast' not in eb:
    b_r = eb.new('mixamorig:RightBreast')
    b_r.head = mathutils.Vector((-0.070, -0.015, 1.340))
    b_r.tail = mathutils.Vector((-0.085, -0.125, 1.335))
    b_r.parent = spine2

bpy.ops.object.mode_set(mode='OBJECT')
print(f"Added dedicated LeftBreast & RightBreast bones (Total Armature bones: {len(arm.data.bones)}).")

# 3. Add Breast Weights with smooth spherical falloff to tors
tors = bpy.data.objects['tors']
vg_bl = tors.vertex_groups.get('mixamorig:LeftBreast') or tors.vertex_groups.new(name='mixamorig:LeftBreast')
vg_br = tors.vertex_groups.get('mixamorig:RightBreast') or tors.vertex_groups.new(name='mixamorig:RightBreast')

breast_l_center = mathutils.Vector((0.080, -0.075, 1.340))
breast_r_center = mathutils.Vector((-0.080, -0.075, 1.340))
radius = 0.085

count_l = 0
count_r = 0
for v in tors.data.vertices:
    dl = (v.co - breast_l_center).length
    if dl < radius and v.co.y < 0.0:
        w = 0.85 * (0.5 * (1.0 + math.cos(math.pi * dl / radius)))
        vg_bl.add([v.index], w, 'ADD')
        count_l += 1
    dr = (v.co - breast_r_center).length
    if dr < radius and v.co.y < 0.0:
        w = 0.85 * (0.5 * (1.0 + math.cos(math.pi * dr / radius)))
        vg_br.add([v.index], w, 'ADD')
        count_r += 1

bpy.context.view_layer.objects.active = tors
bpy.ops.object.vertex_group_normalize_all()
bpy.ops.object.vertex_group_limit_total(limit=4)
print(f"Tors: Breast weights painted (Left: {count_l} verts, Right: {count_r} verts), limited to 4 influences.")

# 4. Standardize UV Map Name across all meshes
for mname in mesh_names:
    o = bpy.data.objects[mname]
    if o.data.uv_layers:
        o.data.uv_layers.active.name = 'UVMap'

# 5. Create Realistic Female Idle Pose & Breathing Loop (90 frames @ 30 FPS)
print("Creating authentic feminine idle pose & looping breathing animation...")
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')

# Ensure Armature animation data is initialized
if not arm.animation_data:
    arm.animation_data_create()
action = bpy.data.actions.new(name="idle")
arm.animation_data.action = action

fps = 30
bpy.context.scene.render.fps = fps
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = 90

def key_quat(bone_name, frame, rx, ry, rz):
    pbone = arm.pose.bones.get(bone_name)
    if not pbone:
        return
    pbone.rotation_mode = 'QUATERNION'
    e = mathutils.Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ')
    pbone.rotation_quaternion = e.to_quaternion()
    pbone.keyframe_insert(data_path="rotation_quaternion", frame=frame)

# Base Feminine Idle Pose (Exact 1:1 match with official concept art reference)
idle_base = {
    # Pelvis, Spine, Neck, Head - Perfectly upright and centered
    'mixamorig:Hips': (0.0, 0.0, 0.0),
    'mixamorig:Spine': (0.0, 0.0, 0.0),
    'mixamorig:Spine1': (0.0, 0.0, 0.0),
    'mixamorig:Spine2': (0.0, 0.0, 0.0),
    'mixamorig:Neck': (0.0, 0.0, 0.0),
    'mixamorig:Head': (0.0, 0.0, 0.0),

    # Breasts (natural resting angle)
    'mixamorig:LeftBreast': (0.0, 0.0, 0.0),
    'mixamorig:RightBreast': (0.0, 0.0, 0.0),

    # Legs & Feet (straight down, grounded, feet flared outward ~8°)
    'mixamorig:LeftUpLeg': (0.0, 0.0, 0.0),
    'mixamorig:LeftLeg': (0.0, 0.0, 0.0),
    'mixamorig:LeftFoot': (0.0, 0.0, 8.0),
    'mixamorig:RightUpLeg': (0.0, 0.0, 0.0),
    'mixamorig:RightLeg': (0.0, 0.0, 0.0),
    'mixamorig:RightFoot': (0.0, 0.0, -8.0),

    # Shoulders (relaxed slightly down)
    'mixamorig:LeftShoulder': (0.0, 0.0, -1.0),
    'mixamorig:RightShoulder': (0.0, 0.0, 1.0),

    # Upper Arms (hanging close to torso, ~78.5° down, ~1° forward)
    'mixamorig:LeftArm': (78.5, 0.0, 1.0),
    'mixamorig:RightArm': (78.5, 0.0, -1.0),

    # Forearms (subtle ~5° elbow bend, ~20° inward pronation)
    'mixamorig:LeftForeArm': (5.0, 20.0, 0.0),
    'mixamorig:RightForeArm': (5.0, -20.0, 0.0),

    # Wrists (aligned with forearms)
    'mixamorig:LeftHand': (2.0, 0.0, 0.0),
    'mixamorig:RightHand': (2.0, 0.0, 0.0),
}

# Inhale Peak (Frame 45):
# Natural chest expansion, breast breathing lift (+1.6°), gentle ribcage elevation
idle_inhale = dict(idle_base)
idle_inhale['mixamorig:Spine1'] = (-0.8, 0.0, 0.0)
idle_inhale['mixamorig:Spine2'] = (-1.0, 0.0, 0.0)
idle_inhale['mixamorig:LeftBreast'] = (2.2, 0.2, -0.1)
idle_inhale['mixamorig:RightBreast'] = (2.2, -0.2, 0.1)
idle_inhale['mixamorig:LeftShoulder'] = (0.0, 0.0, -0.6)
idle_inhale['mixamorig:RightShoulder'] = (0.0, 0.0, 0.6)
idle_inhale['mixamorig:LeftArm'] = (78.0, 0.0, 1.0)
idle_inhale['mixamorig:RightArm'] = (78.0, 0.0, -1.0)

# Apply keyframes for main body bones
for bname, (rx, ry, rz) in idle_base.items():
    key_quat(bname, 0, rx, ry, rz)
    key_quat(bname, 90, rx, ry, rz)

for bname, (rx, ry, rz) in idle_inhale.items():
    key_quat(bname, 45, rx, ry, rz)

# Finger curling cascade (Index -> Pinky) matching reference hand posture
splays = [
    ('Index',  6.0, -2.0),
    ('Middle', 8.0,  0.0),
    ('Ring',  10.0,  2.0),
    ('Pinky', 12.0,  4.0)
]
for f in [0, 45, 90]:
    for side in ['Left', 'Right']:
        sign = 1 if side == 'Left' else -1
        # Thumb
        key_quat(f'mixamorig:{side}HandThumb1', f, 8.0, 0.0, sign * 6.0)
        key_quat(f'mixamorig:{side}HandThumb2', f, 8.0, 0.0, 0.0)
        key_quat(f'mixamorig:{side}HandThumb3', f, 6.0, 0.0, 0.0)
        # 4 Fingers
        for finger, curl_x, splay_z in splays:
            key_quat(f'mixamorig:{side}Hand{finger}1', f, curl_x, 0.0, sign * splay_z)
            key_quat(f'mixamorig:{side}Hand{finger}2', f, curl_x * 1.1, 0.0, 0.0)
            key_quat(f'mixamorig:{side}Hand{finger}3', f, curl_x * 0.8, 0.0, 0.0)

# Set timeline to frame 0 so blend opens directly in feminine idle pose
bpy.context.scene.frame_set(0)
bpy.ops.object.mode_set(mode='OBJECT')
print("Successfully generated female idle pose & 90-frame breathing animation loop.")

# 5b. Add Professional Blender Control Shapes (WGTS Helpers) for Pose Mode
print("Adding custom bone shape helpers (WGTS) for Blender Pose Mode...")
wgts_col = bpy.data.collections.get("WGTS")
if not wgts_col:
    wgts_col = bpy.data.collections.new("WGTS")
    bpy.context.scene.collection.children.link(wgts_col)

def create_circle_widget(name, radius=0.15, axis='Z'):
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    verts = []
    edges = []
    num_pts = 16
    for i in range(num_pts):
        angle = 2.0 * math.pi * i / num_pts
        if axis == 'Z':
            verts.append((radius * math.cos(angle), radius * math.sin(angle), 0.0))
        elif axis == 'X':
            verts.append((0.0, radius * math.cos(angle), radius * math.sin(angle)))
        else:
            verts.append((radius * math.cos(angle), 0.0, radius * math.sin(angle)))
        edges.append((i, (i + 1) % num_pts))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    wgts_col.objects.link(obj)
    return obj

def create_box_widget(name, size=0.08):
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    s = size * 0.5
    verts = [
        (-s, -s, -s), (s, -s, -s), (s, s, -s), (-s, s, -s),
        (-s, -s,  s), (s, -s,  s), (s, s,  s), (-s, s,  s)
    ]
    edges = [
        (0,1),(1,2),(2,3),(3,0),
        (4,5),(5,6),(6,7),(7,4),
        (0,4),(1,5),(2,6),(3,7)
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    wgts_col.objects.link(obj)
    return obj

def create_sphere_widget(name, radius=0.06):
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    verts = []
    edges = []
    num_pts = 12
    for plane in ['XY', 'YZ', 'XZ']:
        offset = len(verts)
        for i in range(num_pts):
            angle = 2.0 * math.pi * i / num_pts
            c = radius * math.cos(angle)
            s = radius * math.sin(angle)
            if plane == 'XY': verts.append((c, s, 0.0))
            elif plane == 'YZ': verts.append((0.0, c, s))
            else: verts.append((c, 0.0, s))
            edges.append((offset + i, offset + (i + 1) % num_pts))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    wgts_col.objects.link(obj)
    return obj

w_circle_z = create_circle_widget("WGT_Circle_Z", 0.18, 'Z')
w_circle_y = create_circle_widget("WGT_Circle_Y", 0.14, 'Y')
w_box = create_box_widget("WGT_Box", 0.07)
w_sphere = create_sphere_widget("WGT_Sphere", 0.065)

arm.data.show_bone_custom_shapes = True
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones

mappings = {
    'mixamorig:Hips': (w_circle_z, (1.2, 1.2, 1.2)),
    'mixamorig:Spine2': (w_circle_z, (1.0, 1.0, 1.0)),
    'mixamorig:Neck': (w_circle_y, (0.7, 0.7, 0.7)),
    'mixamorig:Head': (w_circle_z, (0.8, 0.8, 0.8)),
    'mixamorig:LeftBreast': (w_sphere, (0.9, 0.9, 0.9)),
    'mixamorig:RightBreast': (w_sphere, (0.9, 0.9, 0.9)),
    'mixamorig:LeftArm': (w_circle_y, (0.6, 0.6, 0.6)),
    'mixamorig:RightArm': (w_circle_y, (0.6, 0.6, 0.6)),
    'mixamorig:LeftForeArm': (w_circle_y, (0.5, 0.5, 0.5)),
    'mixamorig:RightForeArm': (w_circle_y, (0.5, 0.5, 0.5)),
    'mixamorig:LeftHand': (w_box, (0.8, 0.8, 0.8)),
    'mixamorig:RightHand': (w_box, (0.8, 0.8, 0.8)),
    'mixamorig:LeftUpLeg': (w_circle_y, (0.7, 0.7, 0.7)),
    'mixamorig:RightUpLeg': (w_circle_y, (0.7, 0.7, 0.7)),
    'mixamorig:LeftLeg': (w_circle_y, (0.6, 0.6, 0.6)),
    'mixamorig:RightLeg': (w_circle_y, (0.6, 0.6, 0.6)),
    'mixamorig:LeftFoot': (w_box, (1.0, 1.4, 0.6)),
    'mixamorig:RightFoot': (w_box, (1.0, 1.4, 0.6)),
}

for bname, (shape, scale) in mappings.items():
    b = pb.get(bname)
    if b:
        b.custom_shape = shape
        b.custom_shape_scale_xyz = scale

bpy.ops.object.mode_set(mode='OBJECT')
wgts_col.hide_render = True
wgts_col.hide_viewport = True
print("Added custom bone shape helpers (rings, spheres, boxes) for Blender Pose Mode.")

# 6. Save Blend Files
bpy.ops.wm.save_mainfile(filepath=blend_path)
print(f"Saved primary blend to: {blend_path}")

shutil.copyfile(blend_path, blend_backup_path)
print(f"Updated secondary blend: {blend_backup_path}")

# 7. Export Draco Compressed GLBs & FBX
def select_only(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        if o:
            o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]

def export_draco_glb(filepath, export_anim=True):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_image_format='NONE',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_animations=export_anim,
        export_skins=True,
        export_all_influences=False
    )
    sz = os.path.getsize(filepath) / 1024.0
    print(f"  -> Exported Draco GLB: {os.path.basename(filepath)} ({sz:.1f} KB)")

print("\n--- EXPORTING OPTIMIZED MODELS ---")

# A. woman.glb (Full Model with Hair and Skeleton + Idle Animation)
select_only([arm] + [bpy.data.objects[n] for n in mesh_names])
export_draco_glb(os.path.join(base_dir, "woman.glb"), export_anim=True)

# B. woman_body.glb (Body Only with Skeleton + Idle Animation)
select_only([arm] + [bpy.data.objects[n] for n in ['hands', 'Head', 'legs', 'Shorts', 'tors']])
export_draco_glb(os.path.join(base_dir, "woman_body.glb"), export_anim=True)

# C. hair.glb (Hair Only with Skeleton)
select_only([arm, bpy.data.objects['Haier']])
export_draco_glb(os.path.join(base_dir, "hair.glb"), export_anim=False)

# D. woman_ing.fbx (FBX with Armature)
select_only([arm] + [bpy.data.objects[n] for n in mesh_names])
out_fbx = os.path.join(base_dir, "woman_ing.fbx")
bpy.ops.export_scene.fbx(
    filepath=out_fbx,
    use_selection=True,
    add_leaf_bones=False,
    bake_anim=True
)
print(f"  -> Exported FBX: woman_ing.fbx ({os.path.getsize(out_fbx)/1024.0:.1f} KB)")

# E. woman_merged.glb (Joined Mesh)
dup_meshes = []
for n in mesh_names:
    o = bpy.data.objects[n]
    d = o.copy()
    d.data = o.data.copy()
    d.name = f"tmp_{n}"
    bpy.context.scene.collection.objects.link(d)
    dup_meshes.append(d)

select_only(dup_meshes)
bpy.ops.object.join()
merged_mesh = bpy.context.view_layer.objects.active
merged_mesh.name = "woman"

for mod in list(merged_mesh.modifiers):
    if mod.type == 'ARMATURE':
        merged_mesh.modifiers.remove(mod)
arm_mod = merged_mesh.modifiers.new("Armature", 'ARMATURE')
arm_mod.object = arm

select_only([arm, merged_mesh])
export_draco_glb(os.path.join(base_dir, "woman_merged.glb"), export_anim=True)

# Clean up merged temporary object
bpy.data.objects.remove(merged_mesh, do_unlink=True)

print("\n=== MIXAMO RIG INTEGRATION & EXPORT COMPLETED 100% SUCCESSFULLY ===")

