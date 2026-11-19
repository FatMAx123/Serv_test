import bpy

arm = bpy.data.objects['Armature']
tors = bpy.data.objects['tors']

act = bpy.data.actions.get('sit_loop')
arm.animation_data.action = act
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
tm = tors.evaluated_get(deps).to_mesh()

# In rest pose:
# Left breast peak is vert 324 (x=0.061, y=-0.166, z=1.293)
# Right breast peak is vert 184 (x=-0.061, y=-0.166, z=1.293)
# Left back opposite vert 324 is vert 97 (x=0.060, y=0.100, z=1.293 approx)
# Right back opposite vert 184 is vert 55 (x=-0.060, y=0.100, z=1.293 approx)

# Measure 3D distance between front and back in sit_loop
v_lp = tm.vertices[324].co
v_rp = tm.vertices[184].co

# Find nearest back vertices on tors evaluated
back_verts = [v.co for v in tm.vertices if tors.data.vertices[v.index].co.y > 0.05 and 1.25 < tors.data.vertices[v.index].co.z < 1.35]

min_d_l = min([(v_lp - bv).length for bv in back_verts])
min_d_r = min([(v_rp - bv).length for bv in back_verts])

print(f"Left chest thickness in sit_loop: {min_d_l*100:.2f} cm")
print(f"Right chest thickness in sit_loop: {min_d_r*100:.2f} cm")

