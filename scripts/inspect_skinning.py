import bpy
import os

blender_exe = r"D:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
base_dir = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
emoji_fbx = os.path.join(base_dir, "animations", "эмодзи.fbx")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=emoji_fbx)

print("\n=== MESH OBJECTS ===")
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        print(f"Mesh: {obj.name}, verts: {len(obj.data.vertices)}, bounds: {obj.dimensions}")
        vgroups = [vg.name for vg in obj.vertex_groups]
        print(f"  Vertex groups ({len(vgroups)}): {vgroups[:8]}...")

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
print(f"\nArmature: {arm.name}, bones: {len(arm.data.bones)}")

# Check tors and Shorts vertex weights near waist
tors = bpy.data.objects.get('tors')
shorts = bpy.data.objects.get('Shorts')

def analyze_mesh_waist(obj, name):
    if not obj:
        print(f"Object {name} not found!")
        return
    vg_map = {vg.index: vg.name for vg in obj.vertex_groups}
    
    # Find min/max Z in local space (Z is height)
    zs = [v.co.z for v in obj.data.vertices]
    min_z, max_z = min(zs), max(zs)
    print(f"\nAnalysis for {name}: Z range [{min_z:.4f}, {max_z:.4f}]")
    
    # Vertices near waist: for tors, lowest 15%; for shorts, highest 15%
    if name == 'tors':
        waist_verts = [v for v in obj.data.vertices if v.co.z < min_z + 0.08]
    else:
        waist_verts = [v for v in obj.data.vertices if v.co.z > max_z - 0.08]
    
    print(f"  Waist boundary vertices count: {len(waist_verts)}")
    
    # Bone influence distribution in waist verts
    bone_weights = {}
    for v in waist_verts:
        for g in v.groups:
            bname = vg_map.get(g.group, 'unknown')
            bone_weights[bname] = bone_weights.get(bname, 0) + g.weight
    
    total_w = sum(bone_weights.values()) or 1.0
    print(f"  Bone weight distribution at waist:")
    for bname, w in sorted(bone_weights.items(), key=lambda x: -x[1])[:6]:
        print(f"    {bname}: {w/len(waist_verts):.3f} ({(w/total_w)*100:.1f}%)")

analyze_mesh_waist(tors, 'tors')
analyze_mesh_waist(shorts, 'Shorts')

# Check actions and frame ranges
print("\n=== ACTIONS ===")
for act in bpy.data.actions:
    if 'садится' in act.name or 'встаёт' in act.name or 'сидит' in act.name:
        print(f"Action: {act.name}, frames: {act.frame_range}")

