# React + Electron setup

How to set up a **React (Vite)** UI with an **Electron** shell, matching this project’s layout.

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** (or compatible package manager)

On Linux, you may need extra libraries for Electron — see [Electron Linux docs](https://www.electronjs.org/docs/latest/development/build-instructions-linux).

---

## 1. Create the React app (Vite)

From an empty folder:

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install
```

Or use this repo’s structure: React source in `src/`, Vite entry in `index.html`.

---

## 2. Install Electron and dev tooling

```bash
npm install --save-dev electron concurrently wait-on
```

| Package | Purpose |
|---------|---------|
| `electron` | Desktop runtime |
| `concurrently` | Run Vite and Electron together in dev |
| `wait-on` | Wait for Vite to be ready before starting Electron |

---

## 3. Project layout

```
my-app/
├── electron/
│   ├── main.js          # Main process (app lifecycle, BrowserWindow)
│   └── preload.cjs      # Preload script (CommonJS; bridges IPC to React)
├── src/                 # React app
│   ├── main.jsx
│   └── App.jsx
├── index.html           # Vite HTML entry
├── vite.config.js
└── package.json
```

---

## 4. Configure `package.json`

Set Electron’s entry point and dev scripts:

```json
{
  "main": "electron/main.js",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"vite\" \"wait-on http://127.0.0.1:5173 && VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .\"",
    "build": "vite build",
    "start": "electron ."
  }
}
```

- **`"main"`** — Electron loads this file on startup.
- **`"type": "module"`** — allows ES modules in `electron/main.js`.
- **`dev`** — starts Vite, waits for port 5173, then launches Electron with `VITE_DEV_SERVER_URL` set.
- **`build`** — production React bundle → `dist/`.
- **`start`** — runs Electron against the built `dist/` (no Vite dev server).

---

## 5. Configure Vite (`vite.config.js`)

**Critical:** use relative asset paths so production works when Electron loads `dist/index.html` via `file://`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

Optional: proxy API routes to a local backend during dev:

```js
server: {
  proxy: {
    '/user': { target: 'http://127.0.0.1:5000', changeOrigin: true },
  },
},
```

---

## 6. Main process (`electron/main.js`)

Minimal pattern:

```js
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

**Dev vs prod loading:**

| Mode | How the shell loads |
|------|---------------------|
| Dev | `win.loadURL(VITE_DEV_SERVER_URL)` → Vite HMR |
| Prod | `win.loadFile('../dist/index.html')` → static bundle |

If `main.js` imports files from `src/` (e.g. `featureFlags.js`), those files must also be included when packaging — see `package-electron.md`.

---

## 7. Preload script (`electron/preload.cjs`)

Use **CommonJS** (`.cjs`) so it works with `contextIsolation` without exposing Node to React:

```js
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('browserMeta', {
  platform: process.platform,
})
```

React reads this as `window.browserMeta`. Use `ipcRenderer` via the preload bridge for main↔renderer communication — never enable `nodeIntegration` in the renderer.

---

## 8. Security baseline

Recommended defaults for the shell window:

- `contextIsolation: true`
- `nodeIntegration: false`
- Preload uses `contextBridge`, not raw `window` assignment
- CSP meta tag on `index.html` for the shell page (guest content in `<webview>` has its own rules)

See the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

---

## 9. Development workflow

```bash
npm install
npm run dev
```

1. Vite serves React at `http://127.0.0.1:5173`.
2. Electron opens that URL (hot reload for UI changes).
3. DevTools can open automatically for the shell window.

---

## 10. Test production build locally (before packaging)

```bash
npm run build
npm start
```

Electron loads `dist/index.html` — same path the packaged app uses. If the window is blank, check that `dist/` exists and `vite.config.js` has `base: './'`.

---

## Scripts reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Electron with HMR |
| `npm run build` | Build React UI to `dist/` |
| `npm start` | Electron only, loads `dist/` |
| `npm run preview` | Preview Vite build in a normal browser (no Electron) |

---

## Optional: local Flask backend

This browser also uses a separate Flask API for search/AI. That is **not** part of Electron setup — run it in another terminal:

```bash
pip install -r backend/requirements.txt
npm run backend
```

The React shell calls `http://127.0.0.1:5000` (or a Vite proxy in dev). Packaging is covered in `package-electron.md`.
