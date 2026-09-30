---
name: itch-downloader
description: Automated downloading of free game assets and 3D models from itch.io (CC0/CC-BY). Bypasses 'Name your own price' donation modals, extracts CSRF and upload IDs, retrieves signed Cloudflare R2 CDN download links, unpacks ZIP/RAR archives, and records attribution credits.
---

# itch.io Game Asset Downloader

Comprehensive workflow and automated tooling for downloading free game assets (3D models, textures, audio, sprites) from [itch.io](https://itch.io).

itch.io does not offer a public asset API and utilizes CSRF tokens, single-use JWT download tokens, and Cloudflare R2 storage. This skill provides both a **one-command automated CLI script** and the **under-the-hood HTTP protocol** for programmatic execution.

---

## 1. Automated Quick Start (Recommended)

The skill includes a dedicated automation script at `scripts/itch_dl.py`.

### List available uploads on an itch.io page:
```bash
python D:/.agents/skills/itch-downloader/scripts/itch_dl.py "https://AUTHOR.itch.io/GAME-OR-ASSET" --list
```

### Download and extract all assets to a target directory:
```bash
python D:/.agents/skills/itch-downloader/scripts/itch_dl.py "https://AUTHOR.itch.io/GAME-OR-ASSET" --dest "assets/models/pack_name" --extract
```

### Download specific files by name filter:
```bash
python D:/.agents/skills/itch-downloader/scripts/itch_dl.py "https://AUTHOR.itch.io/GAME-OR-ASSET" --dest "assets/textures" --extract --filter "128x128"
```

---

## 2. Under The Hood: The itch.io Download Protocol

If downloading manually or through custom pipelines, follow this exact sequence:

```
                  +-------------------------------------+
                  | 1. POST /download_url (Bypass PWYW)  |
                  +------------------+------------------+
                                     | returns JWT download token URL
                                     v
                  +-------------------------------------+
                  | 2. GET Download Token Page          |
                  |    - Extract CSRF token             |
                  |    - Extract data-upload_id="..."   |
                  +------------------+------------------+
                                     |
                                     v
                  +-------------------------------------+
                  | 3. POST /file/{upload_id}           |
                  |    - Header: Referer: <token_url>   |
                  |    - Body: csrf_token=<token>       |
                  |    - Header: Cookie jar             |
                  +------------------+------------------+
                                     | returns {"url": "https://...r2.cloudflarestorage.com/..."}
                                     v
                  +-------------------------------------+
                  | 4. GET Signed Cloudflare R2 CDN URL |
                  |    (Valid for ~60 seconds)          |
                  +------------------+------------------+
                                     |
                                     v
                  +-------------------------------------+
                  | 5. Verify & Extract Archive         |
                  +-------------------------------------+
```

### Step 2.1 — Bypass "Name your own price" Donation Modal
Many free packs on itch.io display a donation modal ("Support the author" / "Pay what you want").
Making a POST request to `/download_url` generates the authenticated download token:
```bash
curl.exe -s -A "Mozilla/5.0" -X POST "https://AUTHOR.itch.io/GAME/download_url"
# Returns JSON: {"url": "https://AUTHOR.itch.io/GAME/download/<JWT_TOKEN>"}
```

### Step 2.2 — Parse the Download Chooser Page
Fetch the token URL while saving cookies:
```bash
curl.exe -s -A "Mozilla/5.0" -c cookies.txt "https://AUTHOR.itch.io/GAME/download/<JWT_TOKEN>" -o chooser.html
```
Extract the **CSRF token** and **Upload IDs**:
- **CSRF Token**: search `name="csrf_token" value="([^"]+)"`
- **Upload IDs**: search `data-upload_id="(\d+)"`
- **File Names**: search `class="name"[^>]*>([^<]+)<`

### Step 2.3 — Request the Signed CDN Download Link
Make a POST request to `/file/{upload_id}?source=game_download`:
```bash
curl.exe -s -b cookies.txt -A "Mozilla/5.0" \
  -e "https://AUTHOR.itch.io/GAME/download/<JWT_TOKEN>" \
  -d "csrf_token=<CSRF_TOKEN>" \
  "https://AUTHOR.itch.io/GAME/file/<UPLOAD_ID>?source=game_download"
# Returns: {"url": "https://itchio-mirror....r2.cloudflarestorage.com/upload2/..."}
```

### Step 2.4 — Download the File from CDN
The signed CDN URL is temporary (~60 seconds). Download it immediately:
```bash
curl.exe -L -A "Mozilla/5.0" -o package.zip "<SIGNED_CDN_URL>"
```

### Step 2.5 — Magic Byte Verification
Check the downloaded file header to ensure you didn't accidentally save an error HTML page:
- **ZIP**: `50 4B 03 04` (`PK..`)
- **RAR**: `52 61 72 21` (`Rar!`)
- **7z**: `37 7A BC AF` (`7z..`)
- *If starts with `3C 21` (`<!DOCTYPE`), the token expired or was rejected.*

---

## 3. Archive Extraction (ZIP & RAR)

- **ZIP**: Extract using Python's `zipfile` module:
  ```python
  import zipfile
  with zipfile.ZipFile("pack.zip", "r") as z:
      z.extractall("dest_folder")
  ```
- **RAR**: Windows 10/11 includes `tar.exe` (bsdtar/libarchive) which natively unpacks RAR:
  ```bash
  tar.exe -xf pack.rar -C dest_folder/
  ```

---

## 4. Asset Ingestion & Licensing Standards

1. **Verify License**:
   - Check the asset page for **CC0 1.0 (Public Domain)**, **MIT**, or **CC-BY 4.0**.
   - Avoid non-commercial (CC-BY-NC) or "no redistribution" packs if packaging for commercial stores (e.g. Yandex Games).
2. **Preserve Attribution**:
   - Always copy the author's `License.txt` / `README.txt` into the asset destination directory.
   - Append the asset name, author, license type, and itch.io URL to `assets/CREDITS.md`.
3. **Godot Engine Integration**:
   - Place assets in `res://assets/<category>/<pack_name>/`.
   - Run Godot headless re-import so all textures, materials, and models generate `.import` metadata:
     ```bash
     D:\Godot\Godot_console.exe --headless --path . --editor --quit
     ```
   - For retro / PSX textures: set `texture_filter = 0` (Nearest) or `TEXTURE_FILTER_NEAREST_WITH_MIPMAPS` on materials.

---

## 5. Fallback: Browser Subagent

If itch.io displays Cloudflare Turnstile verification or requires interactive captcha:
1. Use the Antigravity `browser_subagent` tool.
2. Navigate to the itch.io URL.
3. Click `Download Now` -> `No thanks, just take me to the downloads`.
4. Capture the direct download link from the network tab or download the file directly through the browser.