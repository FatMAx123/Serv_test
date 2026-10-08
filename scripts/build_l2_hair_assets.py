"""
Build Production-Ready Lineage 2 Low-Resource Hair System for Project Steam
Input: client/assets/Characters/ras/DJK.fbx
Outputs:
  - hair_ponytail_lod0.glb (Hero, ~1400 tris)
  - hair_ponytail_lod1.glb (Mid, ~700 tris)
  - hair_ponytail_lod2.glb (Far/CCU, ~350 tris)
  - hair_ponytail.fbx (Clean standalone FBX)
  - hair_ponytail_gray.webp (Grayscale atlas for zero-stutter dye system)
  - hair_ponytail_diffuse.webp (Default L2 chestnut anime diffuse)
"""
import bpy
import bmesh
import math
import os
import mathutils

WORKSPACE = r"d:\games\yandex\лайнэйдж\project-steam1"
INPUT_FBX = os.path.join(WORKSPACE, r"client\assets\Characters\ras\DJK.fbx")
OUT_DIR = os.path.join(WORKSPACE, r"client\assets\Characters\ras")
PREVIEW_DIR = r"C:\Users\Kulibyaka\.gemini\antigravity-ide\brain\6d7aa53b-ba2c-4fd7-b95c-9b52f2f6a1d9"

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def build_l2_hair_pipeline():
    reset()
    
    # 1. Import raw DJK.fbx
    bpy.ops.import_scene.fbx(filepath=INPUT_FBX)
    raw_obj = bpy.context.selected_objects[0]
    raw_obj.name = "Hair_Ponytail_LOD0"
    bpy.context.view_layer.objects.active = raw_obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    
    # 2. Geometry hygiene & cleanup
    bm = bmesh.new()
    bm.from_mesh(raw_obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(raw_obj.data)
    bm.free()
    
    # 3. Decimate to LOD0 target (~1400 tris)
    mod_dec0 = raw_obj.modifiers.new(name="Decimate_LOD0", type='DECIMATE')
    mod_dec0.ratio = 0.22
    bpy.ops.object.modifier_apply(modifier="Decimate_LOD0")
    
    # 4. UV Unwrapping
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.03)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    raw_obj.data.shade_smooth()
    wn = raw_obj.modifiers.new(name="WN", type='WEIGHTED_NORMAL')
    wn.keep_sharp = True
    wn.weight = 50
    bpy.ops.object.modifier_apply(modifier="WN")
    
    tris_lod0 = sum(len(p.vertices) - 2 for p in raw_obj.data.polygons)
    verts_lod0 = len(raw_obj.data.vertices)
    print(f"[Pipeline] LOD0 ready: {verts_lod0} verts, {tris_lod0} tris")
    
    # 5. Stylized Lineage 2 Texture Synthesis & Baking
    mat_bake = bpy.data.materials.new(name="L2_Hair_Bake")
    mat_bake.use_nodes = True
    nodes = mat_bake.node_tree.nodes
    links = mat_bake.node_tree.links
    nodes.clear()
    
    out_node = nodes.new("ShaderNodeOutputMaterial")
    emit_node = nodes.new("ShaderNodeEmission")
    links.new(emit_node.outputs["Emission"], out_node.inputs["Surface"])
    
    tex_coord = nodes.new("ShaderNodeTexCoord")
    sep_xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tex_coord.outputs["Generated"], sep_xyz.inputs["Vector"])
    
    # Base gradient (roots ~0.35 to mid ~0.65)
    ramp_base = nodes.new("ShaderNodeValToRGB")
    ramp_base.color_ramp.interpolation = "LINEAR"
    ramp_base.color_ramp.elements[0].position = 0.0
    ramp_base.color_ramp.elements[0].color = (0.38, 0.38, 0.38, 1.0)
    ramp_base.color_ramp.elements[1].position = 0.82
    ramp_base.color_ramp.elements[1].color = (0.65, 0.65, 0.65, 1.0)
    links.new(sep_xyz.outputs["Z"], ramp_base.inputs["Fac"])
    
    # Silky Specular Angel Ring
    ramp_halo = nodes.new("ShaderNodeValToRGB")
    ramp_halo.color_ramp.interpolation = "CARDINAL"
    ramp_halo.color_ramp.elements[0].position = 0.46
    ramp_halo.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_halo.color_ramp.elements[1].position = 0.62
    ramp_halo.color_ramp.elements[1].color = (0.45, 0.45, 0.45, 1.0)
    e_halo2 = ramp_halo.color_ramp.elements.new(0.78)
    e_halo2.color = (0.0, 0.0, 0.0, 1.0)
    links.new(sep_xyz.outputs["Z"], ramp_halo.inputs["Fac"])
    
    # Fine strand fibers
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 75.0
    wave.inputs["Distortion"].default_value = 2.5
    wave.inputs["Detail"].default_value = 1.5
    links.new(tex_coord.outputs["Generated"], wave.inputs["Vector"])
    
    ramp_wave = nodes.new("ShaderNodeValToRGB")
    ramp_wave.color_ramp.elements[0].position = 0.2
    ramp_wave.color_ramp.elements[0].color = (0.92, 0.92, 0.92, 1.0)
    ramp_wave.color_ramp.elements[1].position = 0.8
    ramp_wave.color_ramp.elements[1].color = (1.08, 1.08, 1.08, 1.0)
    links.new(wave.outputs["Color"], ramp_wave.inputs["Fac"])
    
    # Add halo to base
    mix_add = nodes.new("ShaderNodeMix")
    mix_add.data_type = "RGBA"
    mix_add.blend_type = "ADD"
    mix_add.inputs["Factor"].default_value = 1.0
    links.new(ramp_base.outputs["Color"], mix_add.inputs[6])
    links.new(ramp_halo.outputs["Color"], mix_add.inputs[7])
    
    # Multiply strand fibers
    mix_fibers = nodes.new("ShaderNodeMix")
    mix_fibers.data_type = "RGBA"
    mix_fibers.blend_type = "MULTIPLY"
    mix_fibers.inputs["Factor"].default_value = 0.30
    links.new(mix_add.outputs["Result"], mix_fibers.inputs[6])
    links.new(ramp_wave.outputs["Color"], mix_fibers.inputs[7])
    
    # Ambient Occlusion
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.04
    ao_ramp = nodes.new("ShaderNodeValToRGB")
    ao_ramp.color_ramp.elements[0].position = 0.1
    ao_ramp.color_ramp.elements[0].color = (0.60, 0.60, 0.60, 1.0)
    ao_ramp.color_ramp.elements[1].position = 0.9
    ao_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(ao.outputs["AO"], ao_ramp.inputs["Fac"])
    
    mix_ao = nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.blend_type = "MULTIPLY"
    mix_ao.inputs["Factor"].default_value = 0.80
    links.new(mix_fibers.outputs["Result"], mix_ao.inputs[6])
    links.new(ao_ramp.outputs["Color"], mix_ao.inputs[7])
    
    links.new(mix_ao.outputs["Result"], emit_node.inputs["Color"])
    
    raw_obj.data.materials.append(mat_bake)
    
    # Cycles Bake
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.cycles.bake_type = "EMIT"
    
    # Bake Grayscale
    bake_gray = bpy.data.images.new("Hair_Ponytail_Gray", width=1024, height=1024)
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = bake_gray
    nodes.active = tex_node
    tex_node.select = True
    bpy.ops.object.bake(type="EMIT")
    
    gray_webp_path = os.path.join(OUT_DIR, "hair_ponytail_gray.webp")
    bake_gray.filepath_raw = gray_webp_path
    bake_gray.file_format = "WEBP"
    bake_gray.save()
    
    gray_png_path = os.path.join(OUT_DIR, "hair_ponytail_gray.png")
    bake_gray.filepath_raw = gray_png_path
    bake_gray.file_format = "PNG"
    bake_gray.save()
    print("[Pipeline] Grayscale maps saved:", gray_webp_path)
    
    # Bake Diffuse (Chestnut)
    tint_node = nodes.new("ShaderNodeMix")
    tint_node.data_type = "RGBA"
    tint_node.blend_type = "MULTIPLY"
    tint_node.inputs["Factor"].default_value = 1.0
    links.new(mix_ao.outputs["Result"], tint_node.inputs[6])
    tint_node.inputs[7].default_value = (0.80, 0.52, 0.32, 1.0) # L2 Chestnut
    links.new(tint_node.outputs["Result"], emit_node.inputs["Color"])
    
    bake_diff = bpy.data.images.new("Hair_Ponytail_Diffuse", width=1024, height=1024)
    tex_node.image = bake_diff
    bpy.ops.object.bake(type="EMIT")
    
    diff_webp_path = os.path.join(OUT_DIR, "hair_ponytail_diffuse.webp")
    bake_diff.filepath_raw = diff_webp_path
    bake_diff.file_format = "WEBP"
    bake_diff.save()
    
    diff_png_path = os.path.join(OUT_DIR, "hair_ponytail_diffuse.png")
    bake_diff.filepath_raw = diff_png_path
    bake_diff.file_format = "PNG"
    bake_diff.save()
    print("[Pipeline] Diffuse maps saved:", diff_webp_path)
    
    # 6. Production PBR Material (with grayscale texture for Three.js dye system)
    pbr_mat = bpy.data.materials.new(name="M_Hair_Ponytail")
    pbr_mat.use_nodes = True
    pbr_nodes = pbr_mat.node_tree.nodes
    pbr_links = pbr_mat.node_tree.links
    pbr_nodes.clear()
    
    pbr_out = pbr_nodes.new("ShaderNodeOutputMaterial")
    pbr_bsdf = pbr_nodes.new("ShaderNodeBsdfPrincipled")
    pbr_links.new(pbr_bsdf.outputs["BSDF"], pbr_out.inputs["Surface"])
    
    pbr_tex = pbr_nodes.new("ShaderNodeTexImage")
    pbr_tex.image = bake_gray
    pbr_links.new(pbr_tex.outputs["Color"], pbr_bsdf.inputs["Base Color"])
    pbr_bsdf.inputs["Roughness"].default_value = 0.38
    pbr_bsdf.inputs["Specular IOR Level"].default_value = 0.6
    
    raw_obj.data.materials.clear()
    raw_obj.data.materials.append(pbr_mat)
    
    # 7. Standard 1.0 Metric Armature Rigging
    arm_data = bpy.data.armatures.new("Armature")
    arm_obj = bpy.data.objects.new("Armature", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    
    b_hips = arm_data.edit_bones.new("mixamorig:Hips")
    b_hips.head = (0, 0, 0.55); b_hips.tail = (0, 0, 0.70)
    b_spine = arm_data.edit_bones.new("mixamorig:Spine")
    b_spine.head = (0, 0, 0.70); b_spine.tail = (0, 0, 0.85); b_spine.parent = b_hips
    b_neck = arm_data.edit_bones.new("mixamorig:Neck")
    b_neck.head = (0, 0, 0.85); b_neck.tail = (0, 0, 0.96); b_neck.parent = b_spine
    b_head = arm_data.edit_bones.new("mixamorig:Head")
    b_head.head = (0, 0, 0.96); b_head.tail = (0, 0, 1.15); b_head.parent = b_neck
    
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Rig raw_obj (LOD0)
    vg_head0 = raw_obj.vertex_groups.new(name="mixamorig:Head")
    vg_neck0 = raw_obj.vertex_groups.new(name="mixamorig:Neck")
    for bname in ["mixamorig:Hips", "mixamorig:Spine"]:
        raw_obj.vertex_groups.new(name=bname)
        
    for v in raw_obj.data.vertices:
        if v.co.z < 0.94:
            fac = (0.94 - v.co.z) / 0.03
            vg_neck0.add([v.index], min(0.20, fac * 0.20), 'REPLACE')
            vg_head0.add([v.index], max(0.80, 1.0 - fac * 0.20), 'REPLACE')
        else:
            vg_head0.add([v.index], 1.0, 'REPLACE')
            
    arm_mod0 = raw_obj.modifiers.new(name="Armature", type='ARMATURE')
    arm_mod0.object = arm_obj
    raw_obj.parent = arm_obj
    
    # Export LOD0 GLB
    bpy.ops.object.select_all(action='DESELECT')
    raw_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    
    lod0_glb_path = os.path.join(OUT_DIR, "hair_ponytail_lod0.glb")
    bpy.ops.export_scene.gltf(
        filepath=lod0_glb_path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True
    )
    print(f"[Pipeline] Exported LOD0 ({tris_lod0} tris):", lod0_glb_path)
    
    # 8. Create LOD1 (~700 tris)
    raw_obj.modifiers.remove(arm_mod0)
    raw_obj.parent = None
    
    lod1_obj = raw_obj.copy()
    lod1_obj.data = raw_obj.data.copy()
    lod1_obj.name = "Hair_Ponytail_LOD1"
    bpy.context.scene.collection.objects.link(lod1_obj)
    
    bpy.context.view_layer.objects.active = lod1_obj
    mod_dec1 = lod1_obj.modifiers.new(name="Dec1", type='DECIMATE')
    mod_dec1.ratio = 0.50 # 50% reduction
    bpy.ops.object.modifier_apply(modifier="Dec1")
    lod1_obj.data.shade_smooth()
    
    tris_lod1 = sum(len(p.vertices) - 2 for p in lod1_obj.data.polygons)
    print(f"[Pipeline] LOD1 ready: {len(lod1_obj.data.vertices)} verts, {tris_lod1} tris")
    
    arm_mod1 = lod1_obj.modifiers.new(name="Armature", type='ARMATURE')
    arm_mod1.object = arm_obj
    lod1_obj.parent = arm_obj
    
    raw_obj.hide_viewport = True
    raw_obj.hide_render = True
    
    bpy.ops.object.select_all(action='DESELECT')
    lod1_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    
    lod1_glb_path = os.path.join(OUT_DIR, "hair_ponytail_lod1.glb")
    bpy.ops.export_scene.gltf(
        filepath=lod1_glb_path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True
    )
    print(f"[Pipeline] Exported LOD1 ({tris_lod1} tris):", lod1_glb_path)
    
    # 9. Create LOD2 (~350 tris)
    lod2_obj = lod1_obj.copy()
    lod2_obj.data = lod1_obj.data.copy()
    lod2_obj.name = "Hair_Ponytail_LOD2"
    bpy.context.scene.collection.objects.link(lod2_obj)
    lod2_obj.modifiers.remove(lod2_obj.modifiers["Armature"])
    lod2_obj.parent = None
    
    bpy.context.view_layer.objects.active = lod2_obj
    mod_dec2 = lod2_obj.modifiers.new(name="Dec2", type='DECIMATE')
    mod_dec2.ratio = 0.50 # 50% of LOD1 (~350 tris)
    bpy.ops.object.modifier_apply(modifier="Dec2")
    lod2_obj.data.shade_smooth()
    
    tris_lod2 = sum(len(p.vertices) - 2 for p in lod2_obj.data.polygons)
    print(f"[Pipeline] LOD2 ready: {len(lod2_obj.data.vertices)} verts, {tris_lod2} tris")
    
    arm_mod2 = lod2_obj.modifiers.new(name="Armature", type='ARMATURE')
    arm_mod2.object = arm_obj
    lod2_obj.parent = arm_obj
    
    lod1_obj.hide_viewport = True
    lod1_obj.hide_render = True
    
    bpy.ops.object.select_all(action='DESELECT')
    lod2_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    
    lod2_glb_path = os.path.join(OUT_DIR, "hair_ponytail_lod2.glb")
    bpy.ops.export_scene.gltf(
        filepath=lod2_glb_path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True
    )
    print(f"[Pipeline] Exported LOD2 ({tris_lod2} tris):", lod2_glb_path)
    
    # 10. Export Clean FBX version
    bpy.ops.object.select_all(action='DESELECT')
    raw_obj.hide_viewport = False
    raw_obj.select_set(True)
    bpy.context.view_layer.objects.active = raw_obj
    fbx_path = os.path.join(OUT_DIR, "hair_ponytail.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx_path,
        use_selection=True,
        apply_scale_options='FBX_SCALE_ALL',
        mesh_smooth_type='FACE'
    )
    print("[Pipeline] Exported clean FBX:", fbx_path)
    
    # 11. Render Showcase Suite
    render_showcase_suite()

def render_showcase_suite():
    reset()
    lod0_path = os.path.join(OUT_DIR, "hair_ponytail_lod0.glb")
    bpy.ops.import_scene.gltf(filepath=lod0_path)
    
    # Remove any helper icosphere
    for o in list(bpy.context.scene.objects):
        if "Icosphere" in o.name:
            bpy.data.objects.remove(o, do_unlink=True)
            
    hair = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    
    # Material with tint multiplier
    mat = bpy.data.materials.new(name="Showcase_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    
    tex_path = os.path.join(OUT_DIR, "hair_ponytail_gray.png")
    img = bpy.data.images.load(tex_path)
    node_tex = nodes.new("ShaderNodeTexImage")
    node_tex.image = img
    
    tint_mix = nodes.new("ShaderNodeMix")
    tint_mix.data_type = "RGBA"
    tint_mix.blend_type = "MULTIPLY"
    tint_mix.inputs["Factor"].default_value = 1.0
    links.new(node_tex.outputs["Color"], tint_mix.inputs[6])
    links.new(tint_mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Specular IOR Level"].default_value = 0.65
    
    hair.data.materials.clear()
    hair.data.materials.append(mat)
    
    # Target at hair bounds center
    min_c = [min(c[i] for c in hair.bound_box) for i in range(3)]
    max_c = [max(c[i] for c in hair.bound_box) for i in range(3)]
    center = [(min_c[i] + max_c[i]) / 2 for i in range(3)]
    
    target = bpy.data.objects.new("Target", None)
    target.location = (center[0], center[1], center[2])
    bpy.context.scene.collection.objects.link(target)
    
    cam_data = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", object_data=cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    c = cam_obj.constraints.new(type='TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    
    # Studio 3-point Lighting + Ambient
    k_data = bpy.data.lights.new("Key", "SUN")
    k_data.energy = 4.5
    k = bpy.data.objects.new("Key", object_data=k_data)
    bpy.context.scene.collection.objects.link(k)
    k.rotation_euler = (math.radians(45), math.radians(20), math.radians(-30))
    
    f_data = bpy.data.lights.new("Fill", "SUN")
    f_data.energy = 2.5
    f_data.color = (0.78, 0.88, 1.0)
    f = bpy.data.objects.new("Fill", object_data=f_data)
    bpy.context.scene.collection.objects.link(f)
    f.rotation_euler = (math.radians(30), math.radians(-45), math.radians(120))
    
    r_data = bpy.data.lights.new("Rim", "SUN")
    r_data.energy = 3.0
    r_data.color = (1.0, 0.95, 0.85)
    r = bpy.data.objects.new("Rim", object_data=r_data)
    bpy.context.scene.collection.objects.link(r)
    r.rotation_euler = (math.radians(-40), math.radians(10), math.radians(-150))
    
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    
    # 1. Angle: Front 3/4 (Chestnut)
    cam_obj.location = (center[0] + 0.32, center[1] - 0.62, center[2] + 0.12)
    tint_mix.inputs[7].default_value = (0.80, 0.52, 0.32, 1.0)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_chestnut_3quarter.png")
    bpy.ops.render.render(write_still=True)
    
    # 2. Angle: Direct Front (Chestnut)
    cam_obj.location = (center[0], center[1] - 0.68, center[2] + 0.05)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_chestnut_front.png")
    bpy.ops.render.render(write_still=True)
    
    # 3. Angle: Back / Ponytail (Chestnut)
    cam_obj.location = (center[0] + 0.25, center[1] + 0.65, center[2] + 0.10)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_chestnut_back.png")
    bpy.ops.render.render(write_still=True)
    
    # 4. Color: Golden Blonde (L2 Elf / Human Blonde)
    cam_obj.location = (center[0] + 0.32, center[1] - 0.62, center[2] + 0.12)
    tint_mix.inputs[7].default_value = (0.95, 0.80, 0.46, 1.0)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_dye_blonde.png")
    bpy.ops.render.render(write_still=True)
    
    # 5. Color: Raven Black (L2 Dark Knight)
    tint_mix.inputs[7].default_value = (0.28, 0.28, 0.32, 1.0)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_dye_black.png")
    bpy.ops.render.render(write_still=True)
    
    # 6. Color: Crimson Red / Ginger
    tint_mix.inputs[7].default_value = (0.82, 0.30, 0.18, 1.0)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_dye_red.png")
    bpy.ops.render.render(write_still=True)
    
    # 7. Color: Silver / Moon Ash (L2 Light Elf)
    tint_mix.inputs[7].default_value = (0.85, 0.88, 0.96, 1.0)
    bpy.context.scene.render.filepath = os.path.join(PREVIEW_DIR, "showcase_dye_silver.png")
    bpy.ops.render.render(write_still=True)
    
    print("[Pipeline] All showcase renders successfully generated!")

if __name__ == "__main__":
    build_l2_hair_pipeline()
