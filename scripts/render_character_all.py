"""
Full Multi-Angle Beauty and Clay+Wireframe Studio Rendering Pipeline
"""
import bpy
import os
import sys
import shutil
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
from studio_setup import setup_studio

OUTPUT_DIR = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\ras\renders"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_clay_wireframe_material():
    mat = bpy.data.materials.new(name="Mat_Clay_Wireframe")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type='ShaderNodeOutputMaterial')
    out_node.location = (600, 0)

    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.location = (300, 0)
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Specular IOR Level'].default_value = 0.35

    # Wireframe Node (Clean 1-pixel uniform wireframe across all distances)
    wire = nodes.new(type='ShaderNodeWireframe')
    wire.location = (-300, 100)
    wire.use_pixel_size = True
    wire.inputs['Size'].default_value = 1.0

    # Mix Color Node (Clay vs Dark Wire)
    mix = nodes.new(type='ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.location = (0, 100)
    links.new(wire.outputs['Fac'], mix.inputs['Factor'])
    # Color A: Warm Sculptor Clay Grey
    mix.inputs[6].default_value = (0.58, 0.56, 0.53, 1.0)
    # Color B: Crisp Dark Charcoal Wire
    mix.inputs[7].default_value = (0.015, 0.018, 0.022, 1.0)

    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])
    return mat

def run_pipeline():
    # 1. Setup Studio
    char_objs, cam_34, cam_front, cam_portrait = setup_studio()

    # 2. Store original materials
    orig_materials = {}
    for o in char_objs:
        orig_materials[o] = [slot.material for slot in o.material_slots]

    # 3. Create Clay Wireframe Material
    clay_wire_mat = create_clay_wireframe_material()

    scene = bpy.context.scene
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 2000
    scene.cycles.samples = 160

    # 4. Render Shots Queue
    shots = [
        (cam_34, "01_beauty_34_fullbody.png", False, "Beauty 3/4 Full Body"),
        (cam_34, "02_wireframe_34_fullbody.png", True, "Wireframe / Topology 3/4 Full Body"),
        (cam_portrait, "03_beauty_portrait.png", False, "Beauty Portrait Close-Up"),
        (cam_portrait, "04_wireframe_portrait.png", True, "Wireframe / Topology Portrait Close-Up"),
        (cam_front, "05_beauty_front_fullbody.png", False, "Beauty Frontal Full Body"),
        (cam_front, "06_wireframe_front_fullbody.png", True, "Wireframe / Topology Frontal Full Body"),
    ]

    for cam, fname, is_wire, desc in shots:
        print(f"\n========================================================")
        print(f"RENDERING: {desc} -> {fname}")
        print(f"========================================================")
        scene.camera = cam

        if is_wire:
            for o in char_objs:
                for slot in o.material_slots:
                    slot.material = clay_wire_mat
        else:
            for o in char_objs:
                orig_mats = orig_materials[o]
                for i, slot in enumerate(o.material_slots):
                    if i < len(orig_mats):
                        slot.material = orig_mats[i]

        out_path = os.path.join(OUTPUT_DIR, fname)
        scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        print(f"SUCCESS: Rendered {fname} (Size: {os.path.getsize(out_path)} bytes)")

    # 5. Restore original materials
    for o in char_objs:
        orig_mats = orig_materials[o]
        for i, slot in enumerate(o.material_slots):
            if i < len(orig_mats):
                slot.material = orig_mats[i]

    # Set active camera back to Beauty 3/4
    scene.camera = cam_34

    # 6. Save prepared studio scene
    studio_blend = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\ras\wom_studio.blend"
    bpy.ops.wm.save_as_mainfile(filepath=studio_blend)
    print(f"\n[Studio] Saved studio scene: {studio_blend}")

    # 7. Backup and update wom.blend so user can open either file
    original_blend = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\ras\wom.blend"
    backup_blend = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\ras\wom_original_backup.blend"
    if not os.path.exists(backup_blend) and os.path.exists(original_blend):
        shutil.copy2(original_blend, backup_blend)
        print(f"[Studio] Backed up original file to: {backup_blend}")

if __name__ == "__main__":
    run_pipeline()
