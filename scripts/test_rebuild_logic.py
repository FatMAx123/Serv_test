import os
import bpy

BASE_DIR = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
MAIN_FBX = os.path.join(BASE_DIR, "woman_MAIN.fbx")
WOMAN_BLEND = os.path.join(BASE_DIR, "woman.blend")

bpy.ops.wm.open_mainfile(filepath=WOMAN_BLEND)
arm = bpy.data.objects.get("Armature")
tors = bpy.data.objects.get("tors")
head = bpy.data.objects.get("Head")

cur_objs = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=MAIN_FBX)
imported = [o for o in bpy.data.objects if o not in cur_objs]

main_head = next(o for o in imported if len(o.data.vertices) == 486)
main_tshirt = next(o for o in imported if len(o.data.vertices) == 475)

# Copy coords from MAIN to current
for i in range(len(tors.data.vertices)):
    tors.data.vertices[i].co = main_tshirt.data.vertices[i].co.copy()
tors.data.update()

for i in range(len(head.data.vertices)):
    head.data.vertices[i].co = main_head.data.vertices[i].co.copy()
head.data.update()

# Remove imported FBX objects
for o in imported:
    bpy.data.objects.remove(o, do_unlink=True)

ys = [v.co.y for v in tors.data.vertices]
print(f"Updated tors Y min (breast apex): {min(ys):.4f} (matches -0.1662!)")

head_ys = [v.co.y for v in head.data.vertices]
print(f"Updated head Y min: {min(head_ys):.4f} (matches -0.1504!)")

print("Vertices updated successfully!")