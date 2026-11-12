import json
import struct

with open('client/assets/Characters/engi/man/assets/man.glb', 'rb') as f:
    magic = f.read(4)
    version = int.from_bytes(f.read(4), 'little')
    length = int.from_bytes(f.read(4), 'little')
    chunk_len = int.from_bytes(f.read(4), 'little')
    chunk_type = f.read(4)
    json_bytes = f.read(chunk_len)
    gltf = json.loads(json_bytes.decode('utf-8'))
    
    bin_chunk_len = int.from_bytes(f.read(4), 'little')
    bin_chunk_type = f.read(4)
    bin_data = f.read(bin_chunk_len)

# Find node indices for bones
nodes = gltf.get('nodes', [])
bone_idx_to_name = {}
for i, n in enumerate(nodes):
    name = n.get('name', '')
    if 'RightHand' in name:
        clean = name.replace('mixamorig:', '').replace('mixamorig', '')
        bone_idx_to_name[i] = clean

print('Matching RightHand bones:', bone_idx_to_name)

# Find punch animation (mixamo.com.011)
punch_anim = None
for anim in gltf.get('animations', []):
    if anim.get('name') == 'mixamo.com.011':
        punch_anim = anim
        break

if not punch_anim:
    print('Punch anim not found!')
    exit(1)

channels = punch_anim.get('channels', [])
samplers = punch_anim.get('samplers', [])
accessors = gltf.get('accessors', [])
buffer_views = gltf.get('bufferViews', [])

def read_accessor_vec4(acc_idx):
    acc = accessors[acc_idx]
    bv = buffer_views[acc['bufferView']]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    res = []
    for i in range(count):
        # 4 floats = 16 bytes
        v = struct.unpack_from('<4f', bin_data, offset + i * 16)
        res.append(v)
    return res

punch_fist_quats = {}
for ch in channels:
    target = ch['target']
    node_idx = target.get('node')
    path_type = target.get('path')
    if node_idx in bone_idx_to_name and path_type == 'rotation':
        bone_name = bone_idx_to_name[node_idx]
        sampler = samplers[ch['sampler']]
        output_acc = sampler['output']
        quats = read_accessor_vec4(output_acc)
        # Take the quaternion at the apex of the punch (e.g. frame ~15-20 or average fist)
        # In a punch, the fist is clenched throughout the punch!
        # Let's inspect the quaternion at middle frame:
        mid_quat = quats[len(quats) // 2]
        punch_fist_quats[bone_name] = [round(x, 5) for x in mid_quat]

print('\nEXACT PUNCH FIST QUATERNIONS:')
for b, q in sorted(punch_fist_quats.items()):
    print(f'  {b}: {q},')

