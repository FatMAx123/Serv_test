import bpy

blend = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman\woman.blend"
bpy.ops.wm.open_mainfile(filepath=blend)

for aname in ['sit_down', 'sit_loop', 'stand_up']:
    act = bpy.data.actions.get(aname)
    print(f"\nAction: {aname}")
    for l in act.layers:
        for st in l.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if 'Hips' in fc.data_path and 'location' in fc.data_path:
                        pts = list(fc.keyframe_points)
                        print(f"  {fc.data_path}[{fc.array_index}] keys: {len(pts)}")
                        for kp in pts[::20]:
                            print(f"    f={kp.co[0]:.1f}: val={kp.co[1]:.4f}")
                        last_kp = pts[-1]
                        print(f"    f={last_kp.co[0]:.1f}: val={last_kp.co[1]:.4f}")