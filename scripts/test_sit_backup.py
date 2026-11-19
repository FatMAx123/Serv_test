import bpy
import os

BLEND_PATH = os.path.abspath(r'client/assets/Characters/engi/Woman/woman_original_backup_1.blend')
ANIMS_PATH = os.path.abspath(r'client/assets/Characters/engi/Woman/woman.blend')

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
arm = bpy.data.objects['Armature']
head = bpy.data.objects['Head']
tors = bpy.data.objects['tors']

# Fix chin in Head (only the actual chin / jaw: z >= 1.505, y < -0.02)
vg_head = head.vertex_groups.get('mixamorig:Head')
for v in head.data.vertices:
    if v.co.y <= -0.02 and v.co.z >= 1.505:
        for vg in head.vertex_groups:
            if vg != vg_head:
                try: vg.remove([v.index])
                except: pass
        vg_head.add([v.index], 1.0, 'REPLACE')

# Tuck lower chest of Head 4mm backward (y += 0.004) so it stays safely under shirt fabric
for v in head.data.vertices:
    if v.co.z <= 1.42:
        v.co.y += 0.004

# Remove rogue shoulder/arm weights from chest on tors
vg_sp2 = tors.vertex_groups.get('mixamorig:Spine2')
for v in tors.data.vertices:
    if 1.25 <= v.co.z <= 1.45 and v.co.y < -0.05 and abs(v.co.x) < 0.16:
        for bname in ['mixamorig:LeftShoulder', 'mixamorig:RightShoulder', 'mixamorig:LeftArm', 'mixamorig:RightArm']:
            vg = tors.vertex_groups.get(bname)
            if vg:
                try:
                    w = vg.weight(v.index)
                    if w > 1e-4:
                        vg.remove([v.index])
                        cur_sp2 = 0.0
                        try: cur_sp2 = vg_sp2.weight(v.index)
                        except: pass
                        vg_sp2.add([v.index], cur_sp2 + w, 'REPLACE')
                except: pass

with bpy.data.libraries.load(ANIMS_PATH) as (df, dt):
    dt.actions = [a for a in df.actions if a == 'sit_loop']

act = bpy.data.actions.get('sit_loop')
arm.animation_data.action = act
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()

hm = head.evaluated_get(deps).to_mesh()
tm = tors.evaluated_get(deps).to_mesh()

# Check for any clipping between head and tors below the neck (z in [0.20, 0.40])
clipping_count = 0
for i, hv in enumerate(head.data.vertices):
    if hv.co.z <= 1.42:
        h_eval = hm.vertices[i].co
        # Find nearest FRONT tors vertex in XZ evaluated
        front_tors = [tv for tv in tm.vertices if tv.co.y < -0.30]
        if not front_tors: continue
        nearest_t = min(front_tors, key=lambda tv: (tv.co.x - h_eval.x)**2 + (tv.co.z - h_eval.z)**2)
        # In sit_loop evaluated, forward is -y.
        # If h_eval.y < nearest_t.co.y - 0.002, then head is in front of tors (clipping)
        if h_eval.y < nearest_t.co.y - 0.002:
            clipping_count += 1
            print(f"Clipping vert {i} (rest_z={hv.co.z:.3f}): h_eval.y={h_eval.y:.4f} vs tors_y={nearest_t.co.y:.4f} (diff={(nearest_t.co.y - h_eval.y)*100:.2f} cm)")

if clipping_count == 0:
    print("🎉 ZERO CLIPPING! All Head chest vertices are safely inside Tors in sit_loop!")
else:
    print(f"⚠️ Found {clipping_count} clipping vertices.")