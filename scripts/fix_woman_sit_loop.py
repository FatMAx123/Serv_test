# ============================================================
#  fix_woman_sit_loop.py
#  Retargets sit_down, sit_loop, and stand_up correctly for engi woman
#  and re-exports woman.glb with Draco compression.
# ============================================================
import bpy, os, sys, math
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WDIR = os.path.join(ROOT, 'client', 'assets', 'Characters', 'engi', 'Woman')
ANIM_DIR = os.path.join(WDIR, 'animations')
BLEND_PATH = os.path.join(WDIR, 'woman_rigged.blend')
EMOTE_FBX = os.path.join(ANIM_DIR, 'эмодзи.fbx')
OUT_GLB = os.path.join(WDIR, 'woman.glb')
OUT_FPS = 30
HEAD_BONE = 'mixamorig:Head'
HIPS = 'mixamorig:Hips'
IN_PLACE = {'sit_loop'}

def log(*a):
    print('[fix_sit]', *a, flush=True)

# 1. Open rigged blend
bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
arm = bpy.data.objects['Armature']

# 2. Bone rest transforms and hierarchy
tgt_rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
tgt_parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
order = []
def _walk(b):
    order.append(b.name)
    for c in b.children:
        _walk(c)
for b in arm.data.bones:
    if not b.parent:
        _walk(b)
tgt_hips_h = tgt_rest[HIPS].translation.z

def new_action(name):
    # Remove existing action if present
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type='OBJECT', name='Armature')
    layer = act.layers.new('Layer')
    strip = layer.strips.new(type='KEYFRAME')
    cb = strip.channelbag(slot, ensure=True)
    return act, slot, cb

def is_bone_action(a):
    if hasattr(a, 'layers'):
        for layer in a.layers:
            for st in layer.strips:
                for cb in st.channelbags:
                    if any(fc.data_path.startswith('pose.bones') for fc in cb.fcurves):
                        return True
        return False
    return any(fc.data_path.startswith('pose.bones') for fc in a.fcurves)

def retarget(src_arm, src_actions, src_fps, clip_name):
    sc = bpy.context.scene
    for idb, _ in src_actions:
        if idb.animation_data:
            idb.animation_data.action = None
    sc.frame_set(0)
    bpy.context.view_layer.update()
    mw0 = src_arm.matrix_world.copy()
    src_rest_w = {b.name: mw0 @ b.matrix_local for b in src_arm.data.bones}
    src_hips_h = src_rest_w[HIPS].translation.z
    ratio = tgt_hips_h / src_hips_h
    lo, hi = 1e9, -1e9
    for idb, act in src_actions:
        ad = idb.animation_data or idb.animation_data_create()
        ad.action = act
        if act.slots and ad.action_slot is None:
            ad.action_slot = act.slots[0]
        lo = min(lo, act.frame_range[0]); hi = max(hi, act.frame_range[1])
    dur = (hi - lo) / src_fps
    n = int(round(dur * OUT_FPS)) + 1
    src_names = {b.name for b in src_arm.data.bones}
    keys = {bn: [] for bn in order}  # (loc, quat)
    hips_track = []
    for k in range(n):
        f = lo + k * src_fps / OUT_FPS
        fi = int(math.floor(f))
        sc.frame_set(fi, subframe=f - fi)
        mw = src_arm.matrix_world
        pose_t = {}
        for bn in order:
            rt = tgt_rest[bn]
            if bn in src_names:
                pb = src_arm.pose.bones[bn]
                d = (mw @ pb.matrix).to_quaternion() @ src_rest_w[bn].to_quaternion().inverted()
                q_t = d @ rt.to_quaternion()
            else:
                q_t = None
            par = tgt_parent[bn]
            if par is None:
                if bn in src_names:
                    hp = (mw @ src_arm.pose.bones[bn].matrix).translation
                    pos = rt.translation + (hp - src_rest_w[bn].translation) * ratio
                else:
                    pos = rt.translation
                q_t = q_t or rt.to_quaternion()
                P = Matrix.Translation(pos) @ q_t.to_matrix().to_4x4()
                B = rt.inverted() @ P
            else:
                Pp, Rp = pose_t[par], tgt_rest[par]
                base = Pp @ Rp.inverted() @ rt
                if q_t is None:
                    bq = Quaternion()
                else:
                    bq = base.to_quaternion().inverted() @ q_t
                B = Matrix.Translation((0, 0, 0)) @ bq.to_matrix().to_4x4()
                P = base @ B
            pose_t[bn] = P
            loc, rot, _ = B.decompose()
            keys[bn].append((loc, rot))
        hips_track.append(pose_t[HIPS].translation.copy())
    
    # in-place: убрать горизонтальный дрейф
    if clip_name in IN_PLACE and n > 1:
        d0, d1 = hips_track[0], hips_track[-1]
        drift = Vector((d1.x - d0.x, d1.y - d0.y, 0))
        if drift.length > 0.02:
            rt = tgt_rest[HIPS]
            for k in range(n):
                t = k / (n - 1)
                wp = hips_track[k] - drift * t
                q = keys[HIPS][k][1]
                P = Matrix.Translation(wp) @ (rt.to_quaternion() @ q).to_matrix().to_4x4()
                loc, rot, _ = (rt.inverted() @ P).decompose()
                keys[HIPS][k] = (loc, rot)
            log(f'  {clip_name}: removed root drift {drift.length:.3f} m')
            
    # write to action
    act, slot, cb = new_action(clip_name)
    for bn in order:
        seq = keys[bn]
        prev = None
        qs = []
        for _, q in seq:
            q = q.copy()
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            qs.append(q); prev = q
        pbp = f'pose.bones["{bn}"]'
        for i in range(4):
            fc = cb.fcurves.new(pbp + '.rotation_quaternion', index=i, group_name=bn)
            fc.keyframe_points.add(n)
            co = []
            for k in range(n):
                co += [float(k), qs[k][i]]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', [1] * n)  # LINEAR
            fc.update()
        if bn == HIPS:
            for i in range(3):
                fc = cb.fcurves.new(pbp + '.location', index=i, group_name=bn)
                fc.keyframe_points.add(n)
                co = []
                for k in range(n):
                    co += [float(k), seq[k][0][i]]
                fc.keyframe_points.foreach_set('co', co)
                fc.keyframe_points.foreach_set('interpolation', [1] * n)
                fc.update()
    act.use_fake_user = True
    log(f'  retargeted clip {clip_name}: {n} frames, {dur:.2f}s, src_fps={src_fps}, hips_ratio={ratio:.3f}')
    return act, slot

# 3. Import FBX emotions
objs_before = set(bpy.data.objects)
acts_before = set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=EMOTE_FBX, automatic_bone_orientation=False)
src_fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
new_objs = [o for o in bpy.data.objects if o not in objs_before]
new_acts = [a for a in bpy.data.actions if a not in acts_before]

src_arm = next(o for o in new_objs if o.type == 'ARMATURE')
parent = src_arm.parent

def find_emote_actions(acts, cname):
    if cname == 'stand_up':
        arm_act = next(a for a in acts if is_bone_action(a) and 'встаёт' in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'встаёт' in a.name), None)
    elif cname == 'sit_down':
        arm_act = next(a for a in acts if is_bone_action(a) and 'садится' in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'садится' in a.name), None)
    elif cname == 'sit_loop':
        arm_act = next(a for a in acts if is_bone_action(a) and 'скромно сидит' in a.name and 'встаёт' not in a.name and 'садится' not in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and 'скромно сидит' in a.name and 'встаёт' not in a.name and 'садится' not in a.name), None)
    else:
        arm_act = next(a for a in acts if is_bone_action(a) and cname in a.name)
        par_act = next((a for a in acts if not is_bone_action(a) and cname in a.name), None)
    return arm_act, par_act

TARGET_CLIPS = ['stand_up', 'sit_down', 'sit_loop']
updated_clips = {}
for cname in TARGET_CLIPS:
    arm_act, par_act = find_emote_actions(new_acts, cname)
    pair = [(src_arm, arm_act)]
    if parent is not None and par_act is not None:
        pair.append((parent, par_act))
    act, slot = retarget(src_arm, pair, src_fps, cname)
    updated_clips[cname] = (act, slot)

# Cleanup imported FBX objects
for o in new_objs:
    bpy.data.objects.remove(o, do_unlink=True)
for a in new_acts:
    if a.name not in TARGET_CLIPS:
        bpy.data.actions.remove(a)

# 4. Update NLA tracks on Armature
ad = arm.animation_data
if not ad:
    ad = arm.animation_data_create()
ad.action = None

for cname, (act, slot) in updated_clips.items():
    tr = ad.nla_tracks.get(cname)
    if not tr:
        tr = ad.nla_tracks.new()
        tr.name = cname
    for st in list(tr.strips):
        tr.strips.remove(st)
    st = tr.strips.new(act.name, 0, act)
    try:
        st.action_slot = slot
    except Exception:
        pass
    tr.mute = True

for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.scene.frame_set(0)

# Verify Hips location for all three clips
log('--- VERIFICATION ---')
for cname in TARGET_CLIPS:
    act = bpy.data.actions[cname]
    for layer in act.layers:
        for st in layer.strips:
            for cb in st.channelbags:
                for fc in cb.fcurves:
                    if 'Hips' in fc.data_path and 'location' in fc.data_path:
                        vals = [kp.co[1] for kp in fc.keyframe_points]
                        log(f'{cname} -> {fc.data_path}[{fc.array_index}]: count={len(vals)}, min={min(vals):.3f}, max={max(vals):.3f}, start={vals[0]:.3f}, end={vals[-1]:.3f}')

# 5. Export woman.glb
lod0_objs = [bpy.data.objects[n] for n in ('Head', 'tors', 'hands', 'Shorts', 'legs', 'Haier')]

def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)

select_only([arm] + lod0_objs, arm)

log('Exporting woman.glb with Draco compression...')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=True,
    export_apply=False,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials='EXPORT',
    export_image_format='NONE',
    export_skins=True,
    export_all_influences=False,
    export_def_bones=False,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=True,
    export_anim_single_armature=True,
    export_reset_pose_bones=True,
    export_morph=False,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_draco_generic_quantization=12,
)

log('Export completed! File size:', f'{os.path.getsize(OUT_GLB)/1024:.0f} KB')

# 6. Save updated woman_rigged.blend
bpy.ops.wm.save_mainfile()
log('woman_rigged.blend saved successfully.')

