import json

def get_finger_bones(path):
    with open(path, 'rb') as f:
        f.seek(12)
        chunk_len = int.from_bytes(f.read(4), 'little')
        f.seek(20)
        gltf = json.loads(f.read(chunk_len).decode('utf-8'))
    nodes = gltf.get('nodes', [])
    res = {}
    for n in nodes:
        name = n.get('name', '')
        if 'RightHand' in name and any(f in name for f in ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']):
            clean_name = name.replace('mixamorig:', '').replace('mixamorig', '')
            res[clean_name] = {'rot': n.get('rotation'), 'trans': n.get('translation')}
    return res

man_bones = get_finger_bones('client/assets/Characters/engi/man/assets/man.glb')
woman_bones = get_finger_bones('client/assets/Characters/engi/Woman/woman.glb')

print(f"{'Bone':20s} | {'Woman rot':35s} | {'Man rot':35s}")
print('-'*95)
for k in sorted(man_bones.keys()):
    w = woman_bones.get(k, {}).get('rot', [])
    w_rot = str([round(x, 3) for x in w]) if w else 'None'
    m = man_bones.get(k, {}).get('rot', [])
    m_rot = str([round(x, 3) for x in m]) if m else 'None'
    print(f"{k:20s} | {w_rot:35s} | {m_rot:35s}")

