import bpy

arm = bpy.data.objects["Armature"]
shorts = bpy.data.objects["Shorts"]
legs = bpy.data.objects["legs"]

act = bpy.data.actions.get("sit_loop")
if act:
    arm.animation_data.action = act

for o_name in ["Shorts", "legs"]:
    o = bpy.data.objects[o_name]
    for frame in [1, 40]:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        eval_o = o.evaluated_get(dg)
        eval_mesh = eval_o.data
        
        stretched_edges = []
        for edge in eval_mesh.edges:
            v1_eval = eval_mesh.vertices[edge.vertices[0]].co
            v2_eval = eval_mesh.vertices[edge.vertices[1]].co
            len_eval = (v1_eval - v2_eval).length
            
            v1_rest = o.data.vertices[edge.vertices[0]].co
            v2_rest = o.data.vertices[edge.vertices[1]].co
            len_rest = (v1_rest - v2_rest).length
            
            if len_rest > 1e-4:
                ratio = len_eval / len_rest
                if ratio > 2.0:
                    stretched_edges.append((ratio, edge.vertices[0], edge.vertices[1], v1_rest, v2_rest))
        
        stretched_edges.sort(key=lambda x: -x[0])
        print(f"\n--- {o_name} FRAME {frame} STRETCHED EDGES (>2.0x): {len(stretched_edges)} ---")
        for r, v1_i, v2_i, v1, v2 in stretched_edges[:5]:
            print(f"Ratio {r:.2f}x: v{v1_i} (z={v1.z:.3f}, y={v1.y:.3f}, x={v1.x:.3f}) <-> v{v2_i} (z={v2.z:.3f}, y={v2.y:.3f}, x={v2.x:.3f})")
            w1 = {o.vertex_groups[g.group].name.replace('mixamorig:',''): g.weight for g in o.data.vertices[v1_i].groups if g.weight > 0.05}
            w2 = {o.vertex_groups[g.group].name.replace('mixamorig:',''): g.weight for g in o.data.vertices[v2_i].groups if g.weight > 0.05}
            print(f"    v1: {w1}")
            print(f"    v2: {w2}")

