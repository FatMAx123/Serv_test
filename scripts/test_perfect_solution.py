import bpy
import os
import math
import shutil
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE_DIR = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
MAIN_FBX = os.path.join(BASE_DIR, "woman_MAIN.fbx")
REF_RIG_GLB = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\974084d4-f08c-480a-b3ab-a8e489e1aad1\scratch\woman_orig_backup.glb"
TEX_PATH = os.path.join(BASE_DIR, "Textures", "woman_atlas_2k.webp")
SCRATCH = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\974084d4-f08c-480a-b3ab-a8e489e1aad1\scratch"

CHAR_MESH_NAMES = ["Haier", "hands", "Head", "legs", "Shorts", "tors"]

def smoothstep(e0, e1, x):
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)

def clear_all_weights(obj, vert_indices=None):
    if vert_indices is None:
        vert_indices = [v.index for v in obj.data.vertices]
    for vg in obj.vertex_groups:
        vg.remove(vert_indices)

def set_vert_weights(obj, vidx, weights_dict):
    total = sum(w for w in weights_dict.values() if w > 1e-5)
    if total <= 1e-6:
        return
    for bname, w in weights_dict.items():
        if w > 1e-5:
            vg = obj.vertex_groups.get(bname)
            if not vg:
                vg = obj.vertex_groups.new(name=bname)
            vg.add([vidx], w / total, "REPLACE")

def ensure_all_bone_vgroups(obj, arm):
    for b in arm.data.bones:
        if not obj.vertex_groups.get(b.name):
            obj.vertex_groups.new(name=b.name)

def bbox_min_max(obj):
    mw = obj.matrix_world
    cs = [mw @ v.co for v in obj.data.vertices]
    return (
        Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))),
        Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs))),
    )

def transfer_3d_weights(src, dst, opp_side_filter=False, match_bbox=True):
    clear_all_weights(dst)
    smw = src.matrix_world
    dmw = dst.matrix_world

    if match_bbox:
        smin, smax = bbox_min_max(src)
        sspan = smax - smin
        dmin, dmax = bbox_min_max(dst)
        dspan = dmax - dmin

        def to_space_src(c):
            return Vector((
                (c.x - smin.x) / max(1e-5, sspan.x),
                (c.y - smin.y) / max(1e-5, sspan.y),
                (c.z - smin.z) / max(1e-5, sspan.z),
            ))

        def to_space_dst(c):
            return Vector((
                (c.x - dmin.x) / max(1e-5, dspan.x),
                (c.y - dmin.y) / max(1e-5, dspan.y),
                (c.z - dmin.z) / max(1e-5, dspan.z),
            ))
    else:
        def to_space_src(c): return c
        def to_space_dst(c): return c

    s_verts = [to_space_src(smw @ v.co) for v in src.data.vertices]
    s_polys = [list(p.vertices) for p in src.data.polygons]
    bvh = BVHTree.FromPolygons(s_verts, s_polys)
    sv_names = {g.index: g.name for g in src.vertex_groups}
    s_weights = [{sv_names[g.group]: g.weight for g in v.groups if g.weight > 1e-4} for v in src.data.vertices]

    for v in dst.data.vertices:
        wc = dmw @ v.co
        pt = to_space_dst(wc)
        loc, _norm, fidx, _dist = bvh.find_nearest(pt)
        if fidx is None:
            continue
        w_acc = {}
        for svi in s_polys[fidx]:
            d = (s_verts[svi] - loc).length
            inv = 1.0 / max(1e-6, d * d + 1e-6)
            for bn, bw in s_weights[svi].items():
                if opp_side_filter:
                    opp = "Right" if wc.x >= 0 else "Left"
                    if opp in bn:
                        continue
                w_acc[bn] = w_acc.get(bn, 0.0) + inv * bw
        if w_acc:
            set_vert_weights(dst, v.index, w_acc)

def copy_uvs_to_new_faces(bm, new_faces):
    uv_layer = bm.loops.layers.uv.active
    if not uv_layer or not new_faces:
        return
    new_set = set(new_faces)
    for f in new_faces:
        for loop in f.loops:
            uv_found = None
            for lf in loop.vert.link_faces:
                if lf not in new_set:
                    for ll in lf.loops:
                        if ll.vert == loop.vert:
                            uv_found = ll[uv_layer].uv.copy()
                            break
                if uv_found is not None:
                    break
            if uv_found is None:
                for e in loop.vert.link_edges:
                    ov = e.other_vert(loop.vert)
                    for lf in ov.link_faces:
                        if lf not in new_set:
                            for ll in lf.loops:
                                if ll.vert == ov:
                                    uv_found = ll[uv_layer].uv.copy()
                                    break
                        if uv_found is not None:
                            break
                    if uv_found is not None:
                        break
            if uv_found is not None:
                loop[uv_layer].uv = uv_found

def extrude_shorts_deep_waistband(shorts):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(shorts.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    max_z = max(v.co.z for v in bm.verts)
    top_edges = [
        e for e in bm.edges
        if e.is_boundary and e.verts[0].co.z > max_z - 0.030 and e.verts[1].co.z > max_z - 0.030
    ]
    if top_edges:
        for v in bm.verts:
            if v.co.z > 1.005:
                t_in = smoothstep(1.005, 1.043, v.co.z)
                s = 1.0 - 0.16 * t_in
                v.co.x *= s
                v.co.y = 0.008 + (v.co.y - 0.008) * s
        ext = bmesh.ops.extrude_edge_only(bm, edges=top_edges)
        new_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        new_faces = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMFace)]
        for ev in new_verts:
            ev.co.z += 0.060  # +6.0 cm deep tuck inside shirt
            ev.co.x *= 0.72
            ev.co.y = 0.008 + (ev.co.y - 0.008) * 0.72
        copy_uvs_to_new_faces(bm, new_faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(shorts.data)
        shorts.data.update()
        print(f"  Extruded {len(new_verts)} Shorts deep tuck waistband verts (+6.0 cm).")
    bm.free()

def extrude_legs_thigh_tuck(legs):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(legs.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    top_edges = [
        e for e in bm.edges
        if e.is_boundary and e.verts[0].co.z > 0.625 and e.verts[1].co.z > 0.625
    ]
    if top_edges:
        for v in bm.verts:
            if v.co.z > 0.638:
                sign_x = 1.0 if v.co.x >= 0 else -1.0
                cx = sign_x * 0.125
                cy = -0.008
                t_rim = smoothstep(0.638, 0.651, v.co.z)
                s = 1.0 - 0.07 * t_rim
                v.co.x = cx + (v.co.x - cx) * s
                v.co.y = cy + (v.co.y - cy) * s
        ext = bmesh.ops.extrude_edge_only(bm, edges=top_edges)
        new_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        new_faces = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMFace)]
        for ev in new_verts:
            sign_x = 1.0 if ev.co.x >= 0 else -1.0
            cx = sign_x * 0.122
            cy = -0.006
            ev.co.z += 0.060  # +6.0 cm tapered deep inside shorts cuff
            ev.co.x = cx + (ev.co.x - cx) * 0.78
            ev.co.y = cy + (ev.co.y - cy) * 0.78
        copy_uvs_to_new_faces(bm, new_faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(legs.data)
        legs.data.update()
        print(f"  Extruded {len(new_verts)} legs upper-thigh tuck verts (+6.0 cm).")
    bm.free()

def skin_shorts_anatomical(shorts):
    """Anatomical skinning for Shorts:
    - Waistband smoothly transitions Hips -> Spine.
    - Pelvis & Buttocks smoothly anchored to Hips to prevent knife-edge crease.
    - Crotch seam smoothly anchored to Hips (65%) to prevent tearing.
    - Leg cuffs 100% UpLeg.
    """
    clear_all_weights(shorts)
    for v in shorts.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        ax = abs(x)
        side = "Left" if x >= 0 else "Right"
        opp = "Right" if side == "Left" else "Left"

        # 1. Waistband tuck zone (z >= 0.99)
        if z >= 0.99:
            t_sp = smoothstep(0.99, 1.07, z)
            set_vert_weights(shorts, v.index, {
                "mixamorig:Hips": 1.0 - t_sp,
                "mixamorig:Spine": t_sp,
            })
            continue

        # 2. Main pelvis / thighs (z < 0.99)
        is_back = (y > 0.0)
        z_hip_top = 0.98 if is_back else 0.94
        z_leg_bot = 0.69 if is_back else 0.74

        t_leg = smoothstep(z_hip_top, z_leg_bot, z)

        # Flank adjustment
        if ax > 0.14:
            t_leg *= smoothstep(0.99, 0.82, z)

        # Crotch / inseam zone (ax < 0.07, z in [0.70, 0.92])
        if ax < 0.07 and 0.70 <= z <= 0.92:
            f_center = 1.0 - smoothstep(0.01, 0.07, ax)
            min_hips = 0.65 * f_center
            w_hips = max(1.0 - t_leg, min_hips)
            w_leg_total = 1.0 - w_hips
            t_side = smoothstep(-0.045, +0.045, x)
            set_vert_weights(shorts, v.index, {
                "mixamorig:Hips": w_hips,
                "mixamorig:LeftUpLeg": w_leg_total * t_side,
                "mixamorig:RightUpLeg": w_leg_total * (1.0 - t_side),
            })
            continue

        w_hips = 1.0 - t_leg
        w_leg = t_leg

        if ax >= 0.045:
            set_vert_weights(shorts, v.index, {
                "mixamorig:Hips": w_hips,
                f"mixamorig:{side}UpLeg": w_leg,
            })
        else:
            t_side = smoothstep(-0.045, +0.045, x)
            set_vert_weights(shorts, v.index, {
                "mixamorig:Hips": w_hips,
                "mixamorig:LeftUpLeg": w_leg * t_side,
                "mixamorig:RightUpLeg": w_leg * (1.0 - t_side),
            })

def clean_tors_weights(tors):
    """Clean tors weights:
    - Strip all UpLeg influences completely (eliminates waist tear during kicks/attacks).
    - Align lower hem (z <= 1.07) smoothly with Shorts waistband (Hips -> Spine).
    - Lock entire breast mound and ribcage to mixamorig:Spine2.
    """
    l_leg = tors.vertex_groups.get("mixamorig:LeftUpLeg")
    r_leg = tors.vertex_groups.get("mixamorig:RightUpLeg")
    if l_leg: tors.vertex_groups.remove(l_leg)
    if r_leg: tors.vertex_groups.remove(r_leg)

    sp2_g = tors.vertex_groups.get("mixamorig:Spine2")
    if not sp2_g: sp2_g = tors.vertex_groups.new(name="mixamorig:Spine2")

    for v in tors.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        
        # 1. Lower hem: match Shorts waistband exactly
        if z <= 1.07:
            t_sp = smoothstep(1.00, 1.07, z)
            set_vert_weights(tors, v.index, {
                "mixamorig:Hips": 1.0 - t_sp,
                "mixamorig:Spine": t_sp,
            })
            continue

        # 2. Breast mound & ribcage front: solid Spine2
        if 1.21 <= z <= 1.44 and y < -0.05 and abs(x) < 0.17:
            t_lower = smoothstep(1.20, 1.24, z)
            target_sp2 = 0.92 + 0.08 * t_lower
            weights = {tors.vertex_groups[g.group].name: g.weight for g in v.groups}
            cur_sp2 = weights.get("mixamorig:Spine2", 0.0)
            if cur_sp2 < target_sp2:
                scale = (1.0 - target_sp2) / max(1e-4, (1.0 - cur_sp2))
                for g in v.groups:
                    if g.group != sp2_g.index:
                        g.weight *= scale
                sp2_g.add([v.index], target_sp2, "REPLACE")

    print("  Cleaned tors lower hem (zero UpLeg) and locked breast mound to Spine2.")

def clean_head_weights(head):
    """Clean Head weights:
    - Pure Spine2 on cleavage (z <= 1.42).
    - Smooth Neck transition (1.42..1.50).
    - 100% Head on face and chin (z >= 1.50).
    - Zero Arm, Zero Shoulder, Zero Leg bones.
    """
    clear_all_weights(head)
    for v in head.data.vertices:
        z = v.co.z
        if z <= 1.42:
            # Cleavage skin: 100% Spine2 locked with shirt
            set_vert_weights(head, v.index, {"mixamorig:Spine2": 1.0})
        elif z <= 1.50:
            # Neck: smooth Spine2 -> Neck
            t_neck = smoothstep(1.42, 1.50, z)
            set_vert_weights(head, v.index, {
                "mixamorig:Spine2": 1.0 - t_neck,
                "mixamorig:Neck": t_neck,
            })
        elif z <= 1.545:
            # Jawline / throat: smooth Neck -> Head
            t_head = smoothstep(1.50, 1.545, z)
            set_vert_weights(head, v.index, {
                "mixamorig:Neck": 1.0 - t_head,
                "mixamorig:Head": t_head,
            })
        else:
            # Face, chin, ears, eyes: 100% Head
            set_vert_weights(head, v.index, {"mixamorig:Head": 1.0})
    print("  Cleaned Head weights (analytical Spine2 -> Neck -> Head, zero distortion).")

def clean_hands_weights(hands):
    vg_names = {vg.index: vg.name for vg in hands.vertex_groups}
    for v in hands.data.vertices:
        x = v.co.x
        ax = abs(x)
        side = "Left" if x >= 0 else "Right"
        opp = "Right" if side == "Left" else "Left"

        if ax <= 0.568:
            clear_all_weights(hands, [v.index])
            t_arm_fore = smoothstep(0.295, 0.435, ax)
            t_fore_hand = smoothstep(0.515, 0.585, ax)
            w_arm = 1.0 - t_arm_fore
            w_fore = t_arm_fore * (1.0 - t_fore_hand)
            w_hand = t_arm_fore * t_fore_hand
            set_vert_weights(hands, v.index, {
                f"mixamorig:{side}Arm": w_arm,
                f"mixamorig:{side}ForeArm": w_fore,
                f"mixamorig:{side}Hand": w_hand,
            })
        else:
            kept = {}
            for g in v.groups:
                bn = vg_names[g.group]
                if opp in bn:
                    continue
                if "Hand" in bn or "ForeArm" in bn:
                    kept[bn] = g.weight
            clear_all_weights(hands, [v.index])
            if not kept:
                kept[f"mixamorig:{side}Hand"] = 1.0
            set_vert_weights(hands, v.index, kept)

def clean_legs_weights(legs):
    vg_names = {vg.index: vg.name for vg in legs.vertex_groups}
    for v in legs.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        side = "Left" if x >= 0 else "Right"
        opp = "Right" if side == "Left" else "Left"

        kept_foot = {}
        for g in v.groups:
            bn = vg_names[g.group]
            if opp in bn:
                continue
            if any(k in bn for k in ("Leg", "Foot", "Toe")):
                kept_foot[bn] = g.weight
        tot_kf = sum(kept_foot.values())
        if tot_kf > 1e-5:
            kept_foot = {k: val / tot_kf for k, val in kept_foot.items()}
        else:
            kept_foot = {f"mixamorig:{side}Foot": 1.0}

        clear_all_weights(legs, [v.index])

        if z >= 0.610:
            set_vert_weights(legs, v.index, {f"mixamorig:{side}UpLeg": 1.0})
        else:
            t_up_leg = smoothstep(0.605, 0.445, z)
            w_upleg = 1.0 - t_up_leg
            w_leg_upper = t_up_leg

            t_above_ankle = smoothstep(0.105, 0.185, z)
            out = {
                f"mixamorig:{side}UpLeg": w_upleg,
                f"mixamorig:{side}Leg": w_leg_upper * t_above_ankle,
            }
            w_foot_blend = w_leg_upper * (1.0 - t_above_ankle)
            for bn, fw in kept_foot.items():
                out[bn] = out.get(bn, 0.0) + w_foot_blend * fw
            set_vert_weights(legs, v.index, out)

def apply_hair_weights(haier):
    clear_all_weights(haier)
    for v in haier.data.vertices:
        z = v.co.z
        t_head = smoothstep(1.495, 1.546, z)
        set_vert_weights(haier, v.index, {
            "mixamorig:Neck": 1.0 - t_head,
            "mixamorig:Head": t_head,
        })

def run_test_build():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.import_scene.gltf(filepath=REF_RIG_GLB)
    keep_orig = set(["Armature"] + CHAR_MESH_NAMES)
    for o in list(bpy.data.objects):
        if o.name not in keep_orig:
            bpy.data.objects.remove(o, do_unlink=True)

    arm = bpy.data.objects["Armature"]
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in arm.animation_data.nla_tracks:
            tr.mute = True
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    orig_map = {}
    for n in CHAR_MESH_NAMES:
        o = bpy.data.objects[n]
        o.name = f"ORIG_{n}"
        orig_map[n] = o

    bpy.ops.import_scene.fbx(filepath=MAIN_FBX)
    bpy.data.objects["tors"].name = "Head"
    bpy.data.objects["tors.001"].name = "tors"

    for n in CHAR_MESH_NAMES:
        o = bpy.data.objects[n]
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.select_set(False)
        o.vertex_groups.clear()
        for md in list(o.modifiers):
            if md.type == "ARMATURE":
                o.modifiers.remove(md)

    # ZERO procedural sculpting: 100% out-of-the-box raw artist geometry!

    # Align Neck/Head bones
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    amw = arm.matrix_world
    amwi = amw.inverted()

    def shift_bone_z(bname, dz_head, dz_tail):
        eb = arm.data.edit_bones.get(bname)
        if not eb: return
        hw = amw @ eb.head
        hw.z += dz_head
        eb.head = amwi @ hw
        tw = amw @ eb.tail
        tw.z += dz_tail
        eb.tail = amwi @ tw

    shift_bone_z("mixamorig:Neck", 0.015, 0.018)
    shift_bone_z("mixamorig:Head", 0.020, 0.018)
    shift_bone_z("mixamorig:HeadTop_End", 0.016, 0.016)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    # Extrude Shorts deep waistband (+6 cm) & legs thigh tuck (+6 cm)
    extrude_shorts_deep_waistband(bpy.data.objects["Shorts"])
    extrude_legs_thigh_tuck(bpy.data.objects["legs"])

    for n in CHAR_MESH_NAMES:
        ensure_all_bone_vgroups(bpy.data.objects[n], arm)

    # 3D weight transfer for tors, legs, hands
    transfer_3d_weights(orig_map["tors"], bpy.data.objects["tors"], opp_side_filter=False, match_bbox=True)
    transfer_3d_weights(orig_map["legs"], bpy.data.objects["legs"], opp_side_filter=True, match_bbox=True)
    transfer_3d_weights(orig_map["hands"], bpy.data.objects["hands"], opp_side_filter=True, match_bbox=True)

    # Apply clean specialized weights:
    skin_shorts_anatomical(bpy.data.objects["Shorts"])
    clean_tors_weights(bpy.data.objects["tors"])
    clean_head_weights(bpy.data.objects["Head"])
    clean_hands_weights(bpy.data.objects["hands"])
    clean_legs_weights(bpy.data.objects["legs"])
    apply_hair_weights(bpy.data.objects["Haier"])

    # Normalize & limit 4 bones/vert
    for n in CHAR_MESH_NAMES:
        o = bpy.data.objects[n]
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

        o.parent = arm
        o.matrix_parent_inverse = arm.matrix_world.inverted()
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = arm

    for o in orig_map.values():
        bpy.data.objects.remove(o, do_unlink=True)

    # Attach atlas texture
    if os.path.exists(TEX_PATH):
        img = bpy.data.images.load(TEX_PATH)
        mat = bpy.data.materials.new("WomanAtlas")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tn.image = img
        mat.node_tree.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        for n in CHAR_MESH_NAMES:
            bpy.data.objects[n].data.materials.append(mat)

    # Render verification shots:
    light_data = bpy.data.lights.new("Sun", "SUN")
    light_data.energy = 3.5
    light_obj = bpy.data.objects.new("Sun", light_data)
    light_obj.rotation_euler = (0.7, 0.3, 0.5)
    bpy.context.collection.objects.link(light_obj)

    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 2.0
    fill_obj = bpy.data.objects.new("Fill", fill_data)
    fill_obj.rotation_euler = (0.5, -0.6, -1.0)
    bpy.context.collection.objects.link(fill_obj)

    cam_data = bpy.data.cameras.new("Cam")
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    bpy.context.scene.render.resolution_x = 960
    bpy.context.scene.render.resolution_y = 540
    bpy.context.scene.render.film_transparent = True

    # VIEW 1: sit_loop frame 40 - Chest closeup
    act_sit = bpy.data.actions.get("sit_loop")
    if act_sit:
        arm.animation_data.action = act_sit
    bpy.context.scene.frame_set(40)
    bpy.context.view_layer.update()

    sp2 = arm.pose.bones["mixamorig:Spine2"]
    chest_pos = arm.matrix_world @ sp2.head
    cam_obj.location = Vector((chest_pos.x - 0.45, chest_pos.y - 0.95, chest_pos.z + 0.15))
    direction = chest_pos - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    p1 = os.path.join(SCRATCH, "verif2_sit_chest_match.png")
    bpy.context.scene.render.filepath = p1
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {p1}")

    # VIEW 2: sit_loop frame 40 - Side view of hips and legs
    hips = arm.pose.bones["mixamorig:Hips"]
    hpos = arm.matrix_world @ hips.head
    cam_obj.location = Vector((hpos.x - 1.1, hpos.y - 0.7, hpos.z + 0.35))
    direction = hpos - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    p2 = os.path.join(SCRATCH, "verif2_sit_hips_side.png")
    bpy.context.scene.render.filepath = p2
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {p2}")

    # VIEW 3: attack_1h frame 30 - Waist check
    act_atk = bpy.data.actions.get("attack_1h")
    if act_atk:
        arm.animation_data.action = act_atk
    bpy.context.scene.frame_set(30)
    bpy.context.view_layer.update()

    hpos_atk = arm.matrix_world @ hips.head
    cam_obj.location = Vector((hpos_atk.x - 1.2, hpos_atk.y - 0.9, hpos_atk.z + 0.2))
    direction = hpos_atk - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    p3 = os.path.join(SCRATCH, "verif2_attack_waist.png")
    bpy.context.scene.render.filepath = p3
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {p3}")

if __name__ == "__main__":
    run_test_build()
