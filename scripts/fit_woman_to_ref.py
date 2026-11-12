"""Fit the female engineer character (woman.blend + GLB exports) to the Lineage 2 Elf reference proportions (180 cm, 8.5 heads)."""

import math
import os
import shutil
import bpy
import mathutils

BASE_DIR = r"D:\games\yandex\лайнэйдж\project-steam1\client\assets\Characters\engi\Woman"
SRC_GLB = os.path.join(BASE_DIR, "woman.glb")
TEX_PATH = os.path.join(BASE_DIR, "Textures", "woman_atlas_2k.webp")
BLEND_OUT = os.path.join(BASE_DIR, "woman.blend")

CHAR_MESH_NAMES = ["Haier", "hands", "Head", "legs", "Shorts", "tors"]
BODY_MESH_NAMES = ["tors", "Shorts", "legs", "hands", "Head"]


def smoothstep(edge0, edge1, x):
    if edge1 == edge0:
        return 0.0 if x < edge0 else 1.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


class PCHIP:
    """Monotonic Fritsch-Carlson cubic Hermite interpolator."""

    def __init__(self, xs, ys):
        self.xs = list(xs)
        self.ys = list(ys)
        n = len(xs)
        h = [xs[i + 1] - xs[i] for i in range(n - 1)]
        delta = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
        d = [0.0] * n
        for i in range(1, n - 1):
            if delta[i - 1] * delta[i] > 0:
                w1 = 2.0 * h[i] + h[i - 1]
                w2 = h[i] + 2.0 * h[i - 1]
                d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
        d[0] = ((2.0 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1])
        if d[0] * delta[0] <= 0:
            d[0] = 0.0
        elif abs(d[0]) > 3.0 * abs(delta[0]):
            d[0] = 3.0 * delta[0]
        d[-1] = ((2.0 * h[-1] + h[-2]) * delta[-1] - h[-1] * delta[-2]) / (h[-1] + h[-2])
        if d[-1] * delta[-1] <= 0:
            d[-1] = 0.0
        elif abs(d[-1]) > 3.0 * abs(delta[-1]):
            d[-1] = 3.0 * delta[-1]
        self.d = d

    def __call__(self, x):
        xs, ys, d = self.xs, self.ys, self.d
        if x <= xs[0]:
            return ys[0] + d[0] * (x - xs[0])
        if x >= xs[-1]:
            return ys[-1] + d[-1] * (x - xs[-1])
        lo, hi = 0, len(xs) - 2
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid - 1
        h = xs[lo + 1] - xs[lo]
        t = (x - xs[lo]) / h
        t2 = t * t
        t3 = t2 * t
        return (
            (2.0 * t3 - 3.0 * t2 + 1.0) * ys[lo]
            + (t3 - 2.0 * t2 + t) * h * d[lo]
            + (-2.0 * t3 + 3.0 * t2) * ys[lo + 1]
            + (t3 - t2) * h * d[lo + 1]
        )


# Reference landmarks (180 cm total, 8.5 heads = ~21 cm head, 105 cm legs)
HEAD_PIVOT = 1.5100
HEAD_PIVOT_NEW = 1.5783
HEAD_SZ = (1.8000 - HEAD_PIVOT_NEW) / (1.7726 - HEAD_PIVOT)

BODY_Z_MAP = PCHIP(
    [0.000, 0.091, 0.539, 0.753, 0.960, 1.062, 1.170, 1.330, 1.426, 1.488, HEAD_PIVOT],
    [0.000, 0.100, 0.520, 0.820, 0.965, 1.074, 1.170, 1.380, 1.488, 1.540, HEAD_PIVOT_NEW],
)


def z_map(z):
    if z <= HEAD_PIVOT:
        return BODY_Z_MAP(z)
    z_lin = HEAD_PIVOT_NEW + (z - HEAD_PIVOT) * HEAD_SZ
    if z < HEAD_PIVOT + 0.015:
        t = smoothstep(HEAD_PIVOT, HEAD_PIVOT + 0.015, z)
        return BODY_Z_MAP(z) * (1.0 - t) + z_lin * t
    return z_lin


def leg_center_xy(z):
    if z >= 0.5387:
        t = max(0.0, min(1.0, (z - 0.5387) / (1.0161 - 0.5387)))
        return (0.1408 + t * (0.0990 - 0.1408), -0.0142 + t * (0.0039 - (-0.0142)))
    if z >= 0.0906:
        t = max(0.0, min(1.0, (z - 0.0906) / (0.5387 - 0.0906)))
        return (0.1810 + t * (0.1408 - 0.1810), 0.0441 + t * (-0.0142 - 0.0441))
    return (0.1810, 0.0441)


def arm_center_yz(ax):
    if ax <= 0.3663:
        t = max(0.0, min(1.0, (ax - 0.1521) / (0.3663 - 0.1521)))
        return (0.0532 + t * (0.0470 - 0.0532), 1.4258 + t * (1.4174 - 1.4258))
    t = max(0.0, min(1.0, (ax - 0.3663) / (0.5648 - 0.3663)))
    return (0.0470 + t * (0.0378 - 0.0470), 1.4174 + t * (1.4201 - 1.4174))


def interp_1d(pts, z):
    if z <= pts[0][0]:
        return pts[0][1]
    if z >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        z0, v0 = pts[i]
        z1, v1 = pts[i + 1]
        if z0 <= z <= z1:
            t = smoothstep(z0, z1, z)
            return v0 + (v1 - v0) * t
    return pts[-1][1]


SX_CENTRAL_PTS = [
    (0.88, 0.90),
    (0.96, 0.90),   # Hips ~92 cm
    (1.06, 0.91),
    (1.17, 0.92),   # Waist ~58 cm
    (1.33, 0.95),   # Bust ~88 cm
    (1.43, 1.03),   # Shoulders ~42 cm
    (1.50, 0.87),   # Neck
    (1.525, 0.86),  # Head
    (1.80, 0.86),
]
SY_FRONT_PTS = [
    (0.88, 0.89),
    (0.96, 0.89),
    (1.06, 0.88),
    (1.17, 0.86),
    (1.33, 0.96),
    (1.43, 0.92),
    (1.50, 0.87),
    (1.525, 0.86),
    (1.80, 0.86),
]
SY_BACK_PTS = [
    (0.88, 0.89),
    (0.96, 0.90),
    (1.06, 0.87),
    (1.17, 0.84),
    (1.33, 0.81),
    (1.43, 0.87),
    (1.50, 0.87),
    (1.525, 0.86),
    (1.80, 0.86),
]
Y_CENTER_PTS = [
    (0.88, 0.015),
    (0.96, 0.015),
    (1.17, 0.008),
    (1.33, 0.005),
    (1.43, 0.035),
    (1.50, 0.045),
    (1.525, 0.010),
    (1.80, 0.010),
]


def deform_point(p, obj_name=""):
    x, y, z = p.x, p.y, p.z
    ax = abs(x)
    sx_sign = 1.0 if x >= 0 else -1.0

    arm_w = smoothstep(0.160, 0.215, ax) * smoothstep(1.31, 1.36, z) * (1.0 - smoothstep(1.48, 1.52, z))
    if obj_name == "hands":
        arm_w = 1.0

    leg_w = (1.0 - smoothstep(0.85, 0.95, z)) * smoothstep(0.01, 0.04, ax)
    if obj_name == "legs":
        leg_w = smoothstep(0.01, 0.04, ax)

    yc = interp_1d(Y_CENTER_PTS, z)
    sxc = interp_1d(SX_CENTRAL_PTS, z)
    syf = interp_1d(SY_FRONT_PTS, z)
    syb = interp_1d(SY_BACK_PTS, z)
    dy = y - yc
    sy_blend = smoothstep(-0.03, 0.03, dy)
    syc = syf * (1.0 - sy_blend) + syb * sy_blend

    x_central = x * sxc
    y_central = yc + dy * syc
    if obj_name == "tors" and z < 1.13 and ax < 0.17:
        hem_t = smoothstep(1.13, 1.03, z)
        x_central = x_central * (1.0 - 0.05 * hem_t)
        y_central = yc + (y_central - yc) * (1.0 - 0.035 * hem_t)

    z_central = z_map(z)

    cx_leg, cy_leg = leg_center_xy(z)
    cx_leg *= sx_sign
    leg_cx_scale = 0.90 + 0.08 * (1.0 - smoothstep(0.09, 0.95, z))
    cx_leg_new = cx_leg * leg_cx_scale
    cy_leg_new = cy_leg * 0.90

    if z >= 0.62:
        rl_x = 0.80
        rl_y = 0.86
        if abs(x - cx_leg) > 0.045:
            rl_x = 0.74
    elif z >= 0.08:
        rl_x = 0.89
        rl_y = 0.90
    else:
        foot_t = smoothstep(0.00, 0.08, z)
        rl_x = 0.95 - 0.06 * foot_t
        rl_y = 0.95 - 0.05 * foot_t

    x_leg = cx_leg_new + (x - cx_leg) * rl_x
    y_leg = cy_leg_new + (y - cy_leg) * rl_y
    z_leg = z_central

    xb = x_central * (1.0 - leg_w) + x_leg * leg_w
    yb = y_central * (1.0 - leg_w) + y_leg * leg_w
    zb = z_central

    if arm_w > 0.0:
        sh_x_old, sh_y_old, sh_z_old = 0.1521 * sx_sign, 0.0532, 1.4258
        sh_yc = interp_1d(Y_CENTER_PTS, sh_z_old)
        sh_sxc = interp_1d(SX_CENTRAL_PTS, sh_z_old)
        sh_syb = interp_1d(SY_BACK_PTS, sh_z_old)
        sh_x_new = sh_x_old * sh_sxc
        sh_y_new = sh_yc + (sh_y_old - sh_yc) * sh_syb
        sh_z_new = z_map(sh_z_old)

        arm_len_scale = 1.09
        if ax <= 0.5648:
            dx_from_sh = ax - 0.1521
            x_arm = sh_x_new + sx_sign * dx_from_sh * arm_len_scale
            cy_a, cz_a = arm_center_yz(ax)
            thick_s = 0.94 - 0.10 * smoothstep(0.152, 0.28, ax)
            y_arm = sh_y_new + (cy_a - sh_y_old) + (y - cy_a) * thick_s
            z_arm = sh_z_new + (cz_a - sh_z_old) + (z - cz_a) * thick_s
        else:
            wrist_x_new = sh_x_new + sx_sign * (0.5648 - 0.1521) * arm_len_scale
            cy_w, cz_w = arm_center_yz(0.5648)
            wrist_y_new = sh_y_new + (cy_w - sh_y_old)
            wrist_z_new = sh_z_new + (cz_w - sh_z_old)
            hand_s = 0.88
            x_arm = wrist_x_new + (x - sx_sign * 0.5648) * hand_s
            y_arm = wrist_y_new + (y - cy_w) * hand_s
            z_arm = wrist_z_new + (z - cz_w) * hand_s

        xb = xb * (1.0 - arm_w) + x_arm * arm_w
        yb = yb * (1.0 - arm_w) + y_arm * arm_w
        zb = zb * (1.0 - arm_w) + z_arm * arm_w

    return mathutils.Vector((xb, yb, zb))


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
    print(f"Importing clean rig + 31 animations from: {SRC_GLB}")
    bpy.ops.import_scene.gltf(filepath=SRC_GLB)

    keep_objs = set(["Armature"] + CHAR_MESH_NAMES)
    for o in list(bpy.data.objects):
        if o.name not in keep_objs:
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

    # Deform all 6 character meshes identically
    for name in CHAR_MESH_NAMES:
        obj = bpy.data.objects[name]
        mw = obj.matrix_world
        mwi = mw.inverted()
        for v in obj.data.vertices:
            v.co = mwi @ deform_point(mw @ v.co, name)
        obj.data.update()

    # Deform all 65 Armature EditBones using the same field
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    amw = arm.matrix_world
    amwi = amw.inverted()
    for eb in arm.data.edit_bones:
        tag = "hands" if ("Hand" in eb.name or "Arm" in eb.name or "ForeArm" in eb.name) else ""
        eb.head = amwi @ deform_point(amw @ eb.head, tag)
        eb.tail = amwi @ deform_point(amw @ eb.tail, tag)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    # 1. Export clean lightweight Draco GLBs (materials/images stripped, matching build_all_31_woman_master.py)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)
    for n in CHAR_MESH_NAMES:
        bpy.data.objects[n].data.materials.clear()

    print("\n--- EXPORTING DRACO GLBs ---")
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
    arm_mod = merged_mesh.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = arm
    select_only([arm, merged_mesh])
    export_draco_glb(os.path.join(BASE_DIR, "woman_merged.glb"), export_anim=True)
    bpy.data.objects.remove(merged_mesh, do_unlink=True)

    # 2. Attach atlas texture & save clean rigged woman.blend for Blender editing/inspection
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

    # Sync GLBs to dist/gm & dist/client if present
    for target in [
        r"D:\games\yandex\лайнэйдж\project-steam1\dist\gm\client\assets\Characters\engi\Woman",
        r"D:\games\yandex\лайнэйдж\project-steam1\dist\client\assets\Characters\engi\Woman",
    ]:
        if os.path.exists(target):
            for fname in ["woman.glb", "woman_body.glb", "woman_merged.glb", "hair.glb"]:
                shutil.copy2(os.path.join(BASE_DIR, fname), os.path.join(target, fname))
            print(f"  -> Synced GLBs to {target}")

    print("\n=== FIT WOMAN TO REF COMPLETED SUCCESSFULLY ===")


if __name__ == "__main__":
    main()

