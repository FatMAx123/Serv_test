import bpy

blend_path = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend"
bpy.ops.wm.open_mainfile(filepath=blend_path)

print("--- SCALING ALL HIPS LOCATION FCURVES BY 0.01 ---")
for act in bpy.data.actions:
    scaled_count = 0
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if 'Hips' in fc.data_path and 'location' in fc.data_path:
                        pts = [kp.co[1] for kp in fc.keyframe_points]
                        # Check if values are in centimeters (abs max > 2.0)
                        max_abs = max(abs(min(pts)), abs(max(pts)))
                        if max_abs > 1.5:
                            for kp in fc.keyframe_points:
                                kp.co[1] *= 0.01
                                kp.handle_left[1] *= 0.01
                                kp.handle_right[1] *= 0.01
                            scaled_count += len(fc.keyframe_points)
    
    # Print result for action
    hips_ranges = []
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if 'Hips' in fc.data_path and 'location' in fc.data_path:
                        pts = [kp.co[1] for kp in fc.keyframe_points]
                        hips_ranges.append(f"[{fc.array_index}]: {min(pts):.3f}..{max(pts):.3f}")
    if hips_ranges:
        print(f"{act.name:20}: scaled {scaled_count} pts -> {hips_ranges}")

bpy.ops.wm.save_mainfile()
print("\nSaved woman.blend with properly scaled Hips locations (METERS).")

