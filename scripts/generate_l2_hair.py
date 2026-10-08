import bpy
import bmesh
import math
import os
import mathutils

# Paths
WORKSPACE = r"d:\games\yandex\лайнэйдж\project-steam1"
INPUT_FBX = os.path.join(WORKSPACE, r"client\assets\Characters\ras\DJK.fbx")
WOMAN_FBX = os.path.join(WORKSPACE, r"client\assets\Characters\ras\Woman.fbx")
OUT_DIR = os.path.join(WORKSPACE, r"client\assets\Characters\ras")
PREVIEW_DIR = r"C:\Users\Kulibyaka\.gemini\antigravity-ide\brain\6d7aa53b-ba2c-4fd7-b95c-9b52f2f6a1d9"

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_scene():
    reset_scene()
    bpy.ops.import_scene.fbx(filepath=INPUT_FBX)
    hair_obj = bpy.context.selected_objects[0]
    hair_obj.name = "Hair_Ponytail_LOD0"
    bpy.context.view_layer.objects.active = hair_obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    
    # Clean geometry
    bm = bmesh.new()
    bm.from_mesh(hair_obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Remove loose vertices / degenerate
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(hair_obj.data)
    bm.free()
    
    # Decimate to LOD0 target (~1400 tris)
    mod_dec = hair_obj.modifiers.new(name="Decimate", type='DECIMATE')
    mod_dec.ratio = 0.22
    bpy.ops.object.modifier_apply(modifier="Decimate")
    
    # Smart UV Project
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.03)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Smooth + Weighted Normal
    hair_obj.data.shade_smooth()
    wn = hair_obj.modifiers.new(name="WeightedNormal", type='WEIGHTED_NORMAL')
    wn.keep_sharp = True
    wn.weight = 50
    bpy.ops.object.modifier_apply(modifier="WeightedNormal")
    
    return hair_obj

print("Setup script loaded.")
