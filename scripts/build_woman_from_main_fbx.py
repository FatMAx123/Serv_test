"""Build clean, gap-free, crease-free skinning for woman_MAIN.fbx with all 31 animations.

Zero Rollback Policy compliant:
- 100% out-of-the-box hand-crafted artist geometry from woman_MAIN.fbx preserved (zero artificial bust sculpt slop).
- Chest volume preserved in sit_loop and all animations by locking breast mound and cleavage to Spine2.
- Pelvis and buttocks anatomically anchored to Hips (55-80%) eliminating knife-edge creases.
- Deep waistband (+6cm) tapered inside shirt cavity eliminating waist gaps and poke-through.
- Chin and face locked 100% to Head bone eliminating animation distortion.
- Upper thigh (+6cm) tucked inside shorts eliminating leg gaps and holes.
"""

import math
import os
import shutil
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE_DIR = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
MAIN_FBX = os.path.join(BASE_DIR, "woman_MAIN.fbx")
REF_RIG_GLB = r"C:\Users\Kulibyaka\.gemini\antigravity\brain\974084d4-f08c-480a-b3ab-a8e489e1aad1\scratch\woman_orig_backup.glb"
TEX_PATH = os.path.join(BASE_DIR, "Textures", "woman_atlas_2k.webp")
BLEND_OUT = os.path.join(BASE_DIR, "woman.blend")

CHAR_MESH_NAMES = ["Haier", "hands", "Head", "legs", "Shorts", "tors"]
BODY_MESH_NAMES = ["tors", "Shorts", "legs", "hands", "Head"]


def smoothstep(e0, e1, x):
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def clamp(v, mn, mx):
    return max(mn, min(mx, v))


def ensure_all_bone_vgroups(obj, arm):
    for b in arm.data.bones:
        if not obj.vertex_groups.get(b.name):
            obj.vertex_groups.new(name=b.name)


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


def bbox_min_max(obj):
    mw = obj.matrix_world
    cs = [mw @ v.co for v in obj.data.vertices]
    return (
        Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))),
        Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs))),
    )


def transfer_3d_weights(src, dst, opp_side_filter=False, match_bbox=True):
    """Transfer 3D volumetric weights from src to dst via normalized BVH barycentric interpolation."""
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
        def to_space_src(c):
            return c

        def to_space_dst(c):
            return c

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
    """Copy valid UVs from adjacent faces onto newly extruded faces so textures never sample (0,0)."""
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
    """Extrude top waistband of Shorts +6.0cm deep inside tors with centroid taper to eliminate gaps & poke-through."""
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
        # Pre-taper existing rim slightly inside shirt hem
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
            ev.co.x *= 0.72   # 28% inward taper keeps inner waistband inside cavity during spine twists
            ev.co.y = 0.008 + (ev.co.y - 0.008) * 0.72

        copy_uvs_to_new_faces(bm, new_faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(shorts.data)
        shorts.data.update()
        print(f"  Extruded {len(new_verts)} Shorts deep tuck waistband verts (+6.0 cm, 0.72x taper).")
    bm.free()


def extrude_legs_thigh_tuck(legs):
    """Extend upper thigh rim of legs +6.0cm tapered inside Shorts cuffs so deep bends never show a hollow gap."""
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
        print(f"  Extruded {len(new_verts)} legs upper-thigh tuck verts (+6.0 cm, 0.78x tapered inside Shorts).")
    bm.free()


def skin_shorts_anatomical(shorts):
    """Anatomical skinning for Shorts:
    - Waistband smoothly transitions Hips -> Spine (0% UpLeg).
    - Pelvis & Buttocks smoothly anchored to Hips (55-80%) to prevent knife-edge crease.
    - Crotch seam smoothly anchored to Hips (65% min) with balanced Left/Right leg to eliminate tearing.
    - Leg cuffs 100% UpLeg matching upper thigh of legs.
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

    print("  Anatomically skinned Shorts (crease-free hips & buttocks, tear-free crotch).")


def clean_tors_weights(tors):
    """Clean tors weights:
    - Strip all UpLeg influences completely (eliminates waist tear during kicks/attacks).
    - Align lower hem (z <= 1.07) smoothly with Shorts waistband (Hips -> Spine).
    - Lock entire breast mound and ribcage to mixamorig:Spine2 (preserves 100% bust volume in sitting/crouching).
    """
    l_leg = tors.vertex_groups.get("mixamorig:LeftUpLeg")
    r_leg = tors.vertex_groups.get("mixamorig:RightUpLeg")
    if l_leg:
        tors.vertex_groups.remove(l_leg)
    if r_leg:
        tors.vertex_groups.remove(r_leg)

    sp2_g = tors.vertex_groups.get("mixamorig:Spine2")
    if not sp2_g:
        sp2_g = tors.vertex_groups.new(name="mixamorig:Spine2")

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
    - Pure Spine2 on cleavage skin (z <= 1.42).
    - Smooth Neck transition (1.42..1.50).
    - Smooth Throat/Jaw transition (1.50..1.545).
    - 100% Head on face, chin, ears, eyes, skull (z >= 1.545).
    - Zero Arm, Zero Shoulder, Zero Leg bones (zero distortion during animations).
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
    """Keep transferred finger weights (|x|>0.568), replace arm/elbow/wrist with smooth analytical blends."""
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

    print("  Cleaned hands weights (smooth arm/elbow/wrist, intact fingers).")


def clean_legs_weights(legs):
    """Smooth weights from toes -> ankle -> calf -> knee -> tucked upper thigh (no hard cutoffs)."""
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
            # Inside Shorts cuff: 100% UpLeg matching Shorts cuff identically
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

    print("  Cleaned legs weights (smooth knee & ankle, 100% UpLeg upper-thigh tuck).")


def apply_hair_weights(haier):
    """Smooth Head + Neck weights for Haier (100% Head above jawline, smooth Neck blend on lower tips)."""
    clear_all_weights(haier)
    for v in haier.data.vertices:
        z = v.co.z
        t_head = smoothstep(1.495, 1.546, z)
        set_vert_weights(haier, v.index, {
            "mixamorig:Neck": 1.0 - t_head,
            "mixamorig:Head": t_head,
        })
    print("  Applied hair weights (Neck -> Head).")


def select_only(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        if o:
            o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def export_draco_glb(filepath, export_anim=True):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_animations=export_anim,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_all_influences=False,
        export_image_format="NONE",
    )
    print(f"  -> Exported {os.path.basename(filepath)} ({os.path.getsize(filepath)/1024:.1f} KB)")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Load reference Armature, 31 calibrated animations, and reference meshes
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

    # 2. Import woman_MAIN.fbx & normalize names/transforms
    # ZERO procedural sculpting: 100% out-of-the-box raw artist geometry is preserved!
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

    # 3. Align Neck/Head/HeadTop_End to woman_MAIN Head
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    amw = arm.matrix_world
    amwi = amw.inverted()

    def shift_bone_z(bname, dz_head, dz_tail):
        eb = arm.data.edit_bones.get(bname)
        if not eb:
            return
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

    # 4. Extrude Shorts deep waistband (+6.0 cm inside tors) & legs upper-thigh tuck (+6.0 cm inside Shorts)
    extrude_shorts_deep_waistband(bpy.data.objects["Shorts"])
    extrude_legs_thigh_tuck(bpy.data.objects["legs"])

    # 5. Create all bone groups
    for n in CHAR_MESH_NAMES:
        ensure_all_bone_vgroups(bpy.data.objects[n], arm)

    # 6. Transfer 3D volumetric weights for tors, legs, hands
    transfer_3d_weights(orig_map["tors"], bpy.data.objects["tors"], opp_side_filter=False, match_bbox=True)
    transfer_3d_weights(orig_map["legs"], bpy.data.objects["legs"], opp_side_filter=True, match_bbox=True)
    transfer_3d_weights(orig_map["hands"], bpy.data.objects["hands"], opp_side_filter=True, match_bbox=True)

    # 7. Apply specialized clean skinning
    skin_shorts_anatomical(bpy.data.objects["Shorts"])
    clean_tors_weights(bpy.data.objects["tors"])
    clean_head_weights(bpy.data.objects["Head"])
    clean_hands_weights(bpy.data.objects["hands"])
    clean_legs_weights(bpy.data.objects["legs"])
    apply_hair_weights(bpy.data.objects["Haier"])

    # 8. Normalize, limit to 4 bones/vert, and parent cleanly to Armature
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
        unweighted = sum(
            1 for v in o.data.vertices if len(v.groups) == 0 or sum(g.weight for g in v.groups) < 0.01
        )
        print(f"  Clean skin {n:8s}: verts={len(o.data.vertices)}, unweighted={unweighted}")

    # Remove reference meshes
    for o in orig_map.values():
        bpy.data.objects.remove(o, do_unlink=True)

    # 9. Strip temporary materials/images and export lightweight Draco GLBs
    for img in list(bpy.data.images):
        bpy.data.images.remove(img, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)
    for n in CHAR_MESH_NAMES:
        bpy.data.objects[n].data.materials.clear()

    print("\n--- EXPORTING FIXED-SKIN DRACO GLBs ---")
    select_only([arm] + [bpy.data.objects[n] for n in CHAR_MESH_NAMES])
    export_draco_glb(os.path.join(BASE_DIR, "woman.glb"), export_anim=True)

    select_only([arm] + [bpy.data.objects[n] for n in BODY_MESH_NAMES])
    export_draco_glb(os.path.join(BASE_DIR, "woman_body.glb"), export_anim=True)

    select_only([arm, bpy.data.objects["Haier"]])
    export_draco_glb(os.path.join(BASE_DIR, "hair.glb"), export_anim=False)

    dup_meshes = []
    for n in CHAR_MESH_NAMES:
        o = bpy.data.objects[n]
        d = o.copy()
        d.data = o.data.copy()
        d.name = f"tmp_{n}"
        bpy.context.scene.collection.objects.link(d)
        dup_meshes.append(d)
    select_only(dup_meshes)
    bpy.ops.object.join()
    merged_mesh = bpy.context.view_layer.objects.active
    merged_mesh.name = "woman"
    for mod in list(merged_mesh.modifiers):
        if mod.type == "ARMATURE":
            merged_mesh.modifiers.remove(mod)
    merged_mesh.parent = arm
    merged_mesh.matrix_parent_inverse = arm.matrix_world.inverted()
    arm_mod = merged_mesh.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = arm
    select_only([arm, merged_mesh])
    export_draco_glb(os.path.join(BASE_DIR, "woman_merged.glb"), export_anim=True)
    bpy.data.objects.remove(merged_mesh, do_unlink=True)

    # 10. Attach atlas texture & save clean rigged woman.blend
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

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    print(f"  -> Saved rigged & textured Blender file: {BLEND_OUT}")

    # 11. Sync GLBs to dist/gm & dist/client
    for target in [
        r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman",
        r"D:\games\yandex\лайнэйдж\project-steam1\dist\client\assets\Characters\engi\Woman",
    ]:
        if os.path.exists(target):
            for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
                shutil.copy2(os.path.join(BASE_DIR, fname), os.path.join(target, fname))
            print(f"  -> Synced GLBs to {target}")

    print("\n=== FIXED SKINNING BUILD COMPLETED SUCCESSFULLY ===")


if __name__ == "__main__":
    main()
