import os

target_names = [
    "Boxing.fbx", "Fast Run.fbx", "Flying Back Death.fbx", "Idle.fbx",
    "Standing 1H Cast Spell 01.fbx", "Sword And Shield Slash.fbx", "Walk.fbx"
]

print("Searching D:\\games for target FBX files...")
for root, dirs, files in os.walk(r"D:\games"):
    for f in files:
        if f in target_names:
            print(f"FOUND: {os.path.join(root, f)}")

