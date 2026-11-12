import json

with open('client/assets/Characters/engi/man/assets/man.glb', 'rb') as f:
    f.seek(12)
    chunk_len = int.from_bytes(f.read(4), 'little')
    f.seek(20)
    gltf = json.loads(f.read(chunk_len).decode('utf-8'))

animations = gltf.get('animations', [])
print('Total animations in man.glb:', len(animations))
for anim in animations:
    name = anim.get('name', '')
    channels = anim.get('channels', [])
    finger_channels = [c for c in channels if any(f in str(c) for f in ['Index', 'Thumb', 'Middle'])]
    print(f'Anim: {name}, total channels: {len(channels)}')

# Let's inspect the punch attack animation in man.glb (mixamo.com.011) or walk (mixamo.com.002)
# In a punch animation, the hand IS CLENCHED INTO A FIST!
# Let's find the punch animation and read the exact quaternions for all 15 finger bones!
for anim in animations:
    if '011' in anim.get('name', '') or 'punch' in anim.get('name', '').lower() or 'attack' in anim.get('name', '').lower():
        print('FOUND PUNCH ANIMATION:', anim.get('name'))

