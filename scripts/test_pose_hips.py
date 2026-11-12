import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=r"client/assets/Characters/engi/Woman/animations/эмодзи.fbx")

arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
print("Armature:", arm.name)

hips_bone = arm.pose.bones.get('mixamorig:Hips') or arm.pose.bones.get('Hips')
print("Hips bone:", hips_bone.name if hips_bone else None)

actions = [a for a in bpy.data.actions if 'сидит' in a.name or 'садится' in a.name or 'встаёт' in a.name]
for act in actions:
    print(f"\n==========================================")
    print(f"Action: {act.name} (frames {act.frame_range[0]} to {act.frame_range[1]})")
    arm.animation_data.action = act
    for f in [int(act.frame_range[0]), int((act.frame_range[0] + act.frame_range[1]) / 2), int(act.frame_range[1])]:
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        world_mat = arm.matrix_world @ hips_bone.matrix
        loc = hips_bone.location
        print(f"  Frame {f:3d} -> Hips World Pos: Z={world_mat.translation.z:.3f}, Y={world_mat.translation.y:.3f}, X={world_mat.translation.x:.3f} | Local loc: ({loc.x:.3f}, {loc.y:.3f}, {loc.z:.3f})")

