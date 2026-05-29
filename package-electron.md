# Package Electron as a desktop app

How to turn this React + Electron project into installable artifacts (`.AppImage`, `.deb`, etc.) using **electron-builder**.

Assumes you already have the app set up — see `react-electron-setup.md`.

---

## Prerequisites

- React + Electron project working locally (`npm run dev`, `npm run build && npm start`)
- **electron-builder** installed:

```bash
npm install --save-dev electron-builder
```

---

## 1. Add `build` config in `package.json`

Add a top-level `"build"` section (sibling to `"scripts"`, not inside it):

```json
"build": {
  "appId": "com.basicwebbrowser.app",
  "productName": "OpenAiRRo",
  "files": [
    "electron/**/*",
    "dist/**/*",
    "src/featureFlags.js",
    "package.json"
  ],
  "directories": {
    "output": "release"
  },
  "linux": {
    "maintainer": "Your Name <you@example.com>"
  }
}
```

| Field | Purpose |
|-------|---------|
| `appId` | Unique app ID (reverse-DNS). Stable across versions; used for updates and OS install paths. |
| `productName` | Human-readable name on installers and menus. |
| `files` | What gets bundled. Must include anything `electron/main.js` imports (e.g. `src/featureFlags.js`). **Do not** include `backend/`. |
| `directories.output` | Where installers are written (`release/`). Keeps Vite’s `dist/` separate. |
| `linux.maintainer` | **Required for `.deb`** — name and email of package maintainer. |

Also set npm metadata (required for `.deb`):

```json
"author": "Your Name <you@example.com>",
"homepage": "https://example.com/your-app"
```

---

## 2. Add npm scripts

In `"scripts"`:

```json
"pack": "npm run build && electron-builder --dir",
"dist": "npm run build && electron-builder"
```

| Script | What it does |
|--------|----------------|
| `npm run pack` | Builds React → `dist/`, then outputs an **unpacked** app folder (quick local test, no installer). |
| `npm run dist` | Builds React → `dist/`, then creates **full installers** for your OS. |

---

## 3. Build

Always run from the project root.

**Unpacked (fast test):**

```bash
npm run pack
```

Output: `release/linux-unpacked/` (on Linux). Run the binary inside that folder.

**AppImage (Linux):**

```bash
npm run dist -- --linux AppImage
```

**Debian package (Linux):**

```bash
npm run dist -- --linux deb
```

Requires `author`, `homepage`, and `linux.maintainer` in `package.json`. If any are missing, electron-builder fails with metadata errors.

**Other targets:**

```bash
npm run dist -- --win    # Windows .exe (build on Windows)
npm run dist -- --mac    # macOS .dmg (build on macOS)
```

Cross-compiling Windows/macOS installers from Linux is limited — use CI or native machines for those platforms.

---

## 4. Where files are saved

Installers and unpacked builds go to **`release/`** (configured in `build.directories.output`).

Examples after a successful Linux build:

```
release/
├── OpenAiRRo-1.0.0.AppImage
├── OpenAiRRo-1.0.0.deb
├── linux-unpacked/          # unpacked app (used internally + for `npm run pack`)
├── builder-debug.yml
└── builder-effective-config.yaml
```

Exact filenames follow `productName` + `version` from `package.json`.

---

## 5. Run the packaged app

**AppImage:**

```bash
chmod +x "release/OpenAiRRo-1.0.0.AppImage"
./release/OpenAiRRo-1.0.0.AppImage
```

**Unpacked:**

```bash
./release/linux-unpacked/openairro
```

(Binary name may vary — list `release/linux-unpacked/` to confirm.)

**`.deb` install:**

```bash
sudo dpkg -i "release/OpenAiRRo-1.0.0.deb"
sudo apt-get install -f   # if dependency errors
```

Then launch from the app menu or terminal.

---

## 6. Local Flask backend (optional)

The packager **does not** bundle or start Flask. For search/AI during local testing, run the backend separately:

```bash
npm run backend
```

The packaged app still calls `http://127.0.0.1:5000` with the current code. Start Flask before using those features.

---

## 7. What gets bundled vs excluded

**Included:**

- `electron/` — main process, preload scripts
- `dist/` — Vite production build of the React UI
- Any extra files imported by `main.js` (e.g. `src/featureFlags.js`)
- Electron runtime (added automatically by electron-builder)

**Excluded:**

- `backend/` — Flask runs on your machine or in the cloud, not inside the installer
- `src/` (except files explicitly listed in `files`)
- Dev dependencies and source maps (unless configured otherwise)

---

## 8. Checklist before shipping

1. `npm run build` succeeds and `dist/index.html` exists.
2. `vite.config.js` has `base: './'` (required for `file://` loading).
3. `npm start` opens the app correctly (prod mode smoke test).
4. `npm run pack` or `npm run dist` completes without errors.
5. Installed/packaged app opens and UI loads.
6. API URL points to the right backend (localhost for dev, cloud URL for production).
7. `author`, `homepage`, and `linux.maintainer` set for `.deb` builds.

---

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank window after install | Run `npm run build` first; verify `dist/` exists and `base: './'` in Vite config. |
| `.deb` build fails on metadata | Set `homepage`, `author` (with email), and `build.linux.maintainer`. |
| App starts but search/AI fails | Start Flask (`npm run backend`) or point API URL at your cloud server. |
| Module not found on startup | Add any file imported from `main.js` to `build.files`. |
| Linux Electron won’t start | Install GTK/NSS libs per [Electron Linux docs](https://www.electronjs.org/docs/latest/development/build-instructions-linux). |

---

## Quick reference

```bash
# Setup (once)
npm install --save-dev electron-builder
# + add "build" block and "pack"/"dist" scripts to package.json

# Unpacked test build
npm run pack

# Linux installers
npm run dist -- --linux AppImage
npm run dist -- --linux deb

# Run (with Flask for full features)
npm run backend          # terminal 1
./release/linux-unpacked/openairro   # terminal 2
```

For cloud deployment of the browser + remote API, see `frontend_deployment.md` and `backend_deployment.md`.
