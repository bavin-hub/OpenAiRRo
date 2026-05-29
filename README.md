# OpenAiRRo (open source)

**OpenAiRRo** is an **open-source**, minimal desktop web browser built with **Electron**, **React (Vite)**, and a separate **Flask** backend. The shell provides familiar browser chrome (tabs, navigation, omnibox, side panels) and renders pages inside an Electron [`<webview>`](https://www.electronjs.org/docs/latest/api/webview-tag) guest surface.

The project is a **starting point**: the UI covers everyday browsing basics, while the Python API ships with dummy search, streaming AI, and user/auth endpoints you can replace with real providers, databases, and models. **Developers are free to change the backend** (swap Flask for another framework, add persistence, wire cloud services) without being locked into this template’s placeholder logic.

**Deploy the desktop app** on **Linux**, **Windows**, or **macOS** (see [Setup procedure](#setup-procedure) and [App packing](#app-packing-desktop-installers)). The Flask server runs **locally during development** or **in the cloud** for production builds.

> **If you clone this repo:** the desktop client is wired to a **hosted API** at **[https://airro.online](https://airro.online)** — that domain points to an **AWS server** where Flask is deployed. Search, AI chat, and login in a **built/packaged** app call that host, not your machine. To use **your own** backend, change the API URL (see [Configure the API domain](#configure-the-api-domain-required-for-new-developers) below).

---

## What you get

| Layer | Stack | Role |
|-------|--------|------|
| **Client** | Electron + React | Tabs, toolbar, omnibox, `<webview>` browsing, left/right panels, local profile/history/bookmarks |
| **API** | Flask (`backend/`) | Search results, streaming AI chat, user signup/login, chat metadata (stubs today) |

```mermaid
flowchart TB
  subgraph Desktop["User machine (Linux / Windows / macOS)"]
    E[Electron main process]
    UI[React shell in dist/]
    WV["&lt;webview&gt; guest pages"]
    E --> UI
    UI --> WV
    WV --> Sites[Websites users browse]
  end
  subgraph API["Flask backend (local or cloud)"]
    F[main_server.py]
    F --> Search["GET /search"]
    F --> AI["POST /ai/chat"]
    F --> User["/user/*"]
  end
  UI -->|HTTP / HTTPS| F
```

---

## Features

### Browser shell

- **Tabs**: Multiple tabs; **+** to add, **×** to close; the last tab resets to a fresh home state instead of closing the app.
- **Navigation**: Back, forward, reload, stop; omnibox accepts URLs, host-like strings, or plain text (search flow).
- **Web rendering**: `<webview>` loads real sites; shared guest profile (cookies/storage across tabs).
- **New windows**: `https?` links open in a new in-app tab; other schemes go to the system browser (`setWindowOpenHandler` in the main process).
- **Bookmarks**: Star on HTTP(S) pages; list, remove, and clear-all in the left panel (`localStorage`).
- **History**: Navigations and searches recorded; reopen, per-row delete, or clear-all (`browser-nav-history`).
- **Downloads**: Save to the system Downloads folder (or Save As), progress, cancel, and a download shelf.
- **Home + in-app search**: Results overlay above the webview; middle-click / modifier-click opens in a new tab.
- **Shell UX**: Light/dark theme slider, tab strip, loading/error status line, find-in-page, zoom, print preview.
- **External links**: New-window attempts for normal browsing are handed off to the default OS browser where configured.

### Side panel (`src/pages/LeftNavBar.jsx`)

- **»** / **«** to open or collapse.
- **Profile**: Display name and email (saved in `localStorage`).
- **History** and **Theme**: As above.

### AI panel (`src/pages/RightNavBar.jsx`)

- Per-tab chat thread and draft; open/closed state stored per tab.
- **Enter** to send, **Shift+Enter** for a new line; **Stop** aborts the stream for that tab only.
- Requires the Flask backend (or your replacement API) for search and AI.

### Backend (basic functionality today)

The Flask app in `backend/main_server.py` is **stateless** for search and AI: the client sends full context each request; nothing is stored server-side for those routes until you add a database.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health hint / API overview |
| `/search` | GET | JSON `{ query, results }` for omnibox search UI |
| `/ai/chat` | POST | JSON `{ "messages": [...] }` → streaming **plain text** (dummy stream today) |
| `/user/singup` | POST | Signup stub (OTP placeholder) |
| `/user/login` | POST | Login stub (JWT + user + chat list placeholders) |
| `/user/get_full_chat` | POST | Fetch dummy conversation by `chat_id` |

CORS is enabled for local dev. **Replace** dummy pages, streams, and auth with your own search engine, LLM, and user store when you customize the backend.

---

## Configure the API domain (required for new developers)

This project ships with a **default production API base URL**:

| Setting | Current value |
|---------|----------------|
| Domain | **`https://airro.online`** |
| Backend | Flask on an **AWS** instance (DNS for `airro.online` points there) |

The Electron app uses that URL for **`GET /search`**, **`POST /ai/chat`**, and **`/user/*`** when you run a **production build** (`npm run build` + `npm start` or packaged installers). It is **not** your local `backend/` folder unless you change the client to point at localhost.

**If you download or fork the repo**, you will usually want to:

1. **Deploy your own Flask API** (see `backend_deployment.md`) on AWS, another cloud, or your laptop.
2. **Point the browser at your API** instead of `airro.online` by updating these files:

| File | What to change |
|------|----------------|
| `src/searchNavigation.js` | `SEARCH_API_ORIGIN` — set to your API origin, e.g. `https://api.yourdomain.com` (no trailing slash) |
| `index.html` | Content-Security-Policy `connect-src` — add your HTTPS (and dev `http://127.0.0.1:5000` if you still use local Flask) |
| `vite.config.js` | Dev proxy `target` for `/user` — defaults to `http://127.0.0.1:5000` when you run `npm run backend` locally |

Auth and AI panels use `SEARCH_API_ORIGIN` in production (`src/pages/RightNavBar.jsx`, `src/pages/EnterUser.jsx`). In **dev** (`npm run dev`), `/user` requests go through the Vite proxy to localhost; search/AI still use `SEARCH_API_ORIGIN` unless you change that constant to `http://127.0.0.1:5000` while developing against local Flask only.

After edits, rebuild the UI (`npm run build`) before packaging or `npm start`. Rebuild installers if you ship desktop binaries.

You can also run **only** the local stack: set `SEARCH_API_ORIGIN` to `http://127.0.0.1:5000`, run `npm run backend`, and allow that host in `index.html` CSP — no AWS domain required.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** 18+ (20+ recommended) | Includes **npm** |
| **Python 3** + **pip** | Optional for local Flask; packaged app can use cloud API only |
| **Git** | To clone the repo |
| **Linux only** | GTK/NSS and related libs for Electron — see [Electron Linux docs](https://www.electronjs.org/docs/latest/development/build-instructions-linux) |

**Do not commit** `node_modules/`, `dist/`, or `release/` — they are generated locally (see `.gitignore`).

---

## Setup procedure

Run all commands from the **project root** after cloning.

### 1. Clone the repository

```bash
git clone https://github.com/bavin-hub/OpenAiRRo.git
cd OpenAiRRo
```

(Use your fork URL if you cloned a different remote.)

### 2. Install frontend dependencies

```bash
npm install
```

This creates `node_modules/` (including Electron). **Never push `node_modules` to GitHub** — it is large and is recreated with `npm install`.

### 3. Install backend dependencies (optional, for local Flask)

```bash
pip install -r backend/requirements.txt
```

Skip this if you only use the hosted API at `https://airro.online`.

### 4. Configure the API URL (forks / your own server)

Out of the box, production builds call **`https://airro.online`**. To use localhost or your domain, edit `SEARCH_API_ORIGIN` in `src/searchNavigation.js` and update `connect-src` in `index.html` — see [Configure the API domain](#configure-the-api-domain-required-for-new-developers).

### 5. Run in development (recommended first run)

**Terminal 1 — OpenAiRRo UI (Vite + Electron, hot reload):**

```bash
npm run dev
```

- Vite serves the React shell at `http://127.0.0.1:5173`.
- Electron opens when that URL is ready (`VITE_DEV_SERVER_URL`).
- DevTools open for the **shell** window (not each `<webview>` tab).

**Terminal 2 — Local Flask (optional):**

```bash
npm run backend
```

- Listens on `http://127.0.0.1:5000`.
- In dev, `/user/*` is proxied via `vite.config.js`.
- Search/AI use `SEARCH_API_ORIGIN` unless you set it to `http://127.0.0.1:5000`.

### 6. Run a production build locally (smoke test)

```bash
npm run build
npm start
```

`npm run build` writes the React app to `dist/`. `npm start` runs Electron and loads `dist/index.html` (same layout as packaged apps).

---

## Development (quick reference)

| Goal | Command |
|------|---------|
| Dev UI + hot reload | `npm run dev` |
| Local Flask API | `npm run backend` |
| Production UI bundle | `npm run build` |
| Electron + built UI | `npm start` |
| UI only in a browser (no `<webview>`) | `npm run preview` |

---

## Backend (Flask) — run and customize

### Run locally

```bash
pip install -r backend/requirements.txt
npm run backend
# or: python3 backend/main_server.py
```

### Customize for your product

The `backend/` folder is intentionally small and readable:

- Swap **dummy search** (`DUMMY_PAGES`) for a real API (Google Programmable Search, Bing, self-hosted index, etc.).
- Replace **`_stream_dummy_text`** in `/ai/chat` with calls to OpenAI, Anthropic, or your own model — keep the same contract (POST JSON messages, stream UTF-8 plain text) or change the client in `src/searchNavigation.js` to match.
- Implement **real auth**: hash passwords, persist users in PostgreSQL/MySQL, issue JWTs, and remove dummy OTP/tokens in `/user/*`.
- Run behind **Gunicorn** + HTTPS in production; use env vars for secrets (see `backend_deployment.md`).

You may keep Flask or **rewrite the API** in FastAPI, Node, Go, etc. — then set `SEARCH_API_ORIGIN` (or a future `VITE_API_ORIGIN`) to your HTTPS origin as described in `frontend_deployment.md`.

The reference deployment uses **`airro.online` → AWS + Flask**; your fork should use **your** domain after you deploy.

### What the packager does *not* include

**electron-builder** bundles `electron/` and `dist/` only — **not** Python. Packaged apps call whatever URL is baked into `SEARCH_API_ORIGIN` at build time (today `https://airro.online`). Clonees must change that constant (and CSP) before `npm run build` if they rely on their own server instead of the default AWS host.

---

## App packing (desktop installers)

OpenAiRRo uses **electron-builder** (already in `package.json`). Packing **does not** include Python/Flask — the installer only ships `electron/` + `dist/`. API calls use whatever `SEARCH_API_ORIGIN` was set when you ran `npm run build`.

### Before you pack

1. Complete [Setup procedure](#setup-procedure) (`npm install` at minimum).
2. Set `SEARCH_API_ORIGIN` and CSP if you are not using `https://airro.online`.
3. For **`.deb`** builds, set `author`, `homepage`, and `build.linux.maintainer` in `package.json`.

### Packing commands

Run from the project root. Each command runs `vite build` first, then electron-builder.

| Command | What it produces |
|---------|------------------|
| `npm run pack` | **Unpacked** app (fast test, no installer) → `release/linux-unpacked/` on Linux |
| `npm run dist` | Installers for the **current OS** |
| `npm run dist -- --linux AppImage` | Linux **AppImage** |
| `npm run dist -- --linux deb` | Linux **.deb** package |
| `npm run dist -- --win` | Windows **.exe** (run on Windows) |
| `npm run dist -- --mac` | macOS **.dmg** (run on macOS) |

Output directory: **`release/`** (see `build.directories.output` in `package.json`).

Example layout after a Linux `npm run dist`:

```text
release/
├── OpenAiRRo-1.0.0.AppImage
├── OpenAiRRo-1.0.0.deb
├── linux-unpacked/
├── builder-debug.yml
└── builder-effective-config.yaml
```

Filenames use `productName` + `version` from `package.json` (`OpenAiRRo`, `1.0.0`).

### Run the packaged app

**Unpacked (after `npm run pack`):**

```bash
./release/linux-unpacked/openairro
```

(List `release/linux-unpacked/` if the binary name differs.)

**AppImage:**

```bash
chmod +x release/OpenAiRRo-1.0.0.AppImage
./release/OpenAiRRo-1.0.0.AppImage
```

**Debian package:**

```bash
sudo dpkg -i release/OpenAiRRo-1.0.0.deb
sudo apt-get install -f
```

Then launch **OpenAiRRo** from the app menu.

**API for packed builds:** search, AI, and login call **`https://airro.online`** by default. For local-only testing, run `npm run backend` and rebuild after setting `SEARCH_API_ORIGIN` to `http://127.0.0.1:5000`.

More detail: **`package-electron.md`**.

---

## Project structure

| Path | Role |
|------|------|
| `electron/main.js` | Main process: `BrowserWindow`, `<webview>` tag, dev URL vs `dist/index.html`, external `window.open` |
| `electron/preload.cjs` | Preload (`contextBridge`, e.g. `browserMeta`) |
| `index.html` | Vite entry; CSP for the shell page |
| `vite.config.js` | Vite; `base: './'` for `file://` in production |
| `src/App.jsx` | Browser UI: tabs, toolbar, webviews, per-tab AI state |
| `src/pages/LeftNavBar.jsx` | Profile, history, bookmarks, theme |
| `src/pages/RightNavBar.jsx` | AI chat panel |
| `src/searchNavigation.js` | Omnibox, search fetch, AI streaming fetch |
| `backend/main_server.py` | Flask API (search, AI, user routes) |
| `backend/requirements.txt` | Python dependencies |

---

## Security notes

- Shell window: `contextIsolation: true`, `nodeIntegration: false`, preload via `contextBridge`.
- Guest pages in `<webview>` have their own security boundary; loading arbitrary URLs carries real risk.
- Do **not** embed cloud API secrets in the Electron app — only public config (API base URL).
- Tighten CORS from `*` before production; review the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

---

## Troubleshooting

| Symptom | Things to check |
|--------|------------------|
| Blank window in dev | Port `5173` free; Vite “ready” before Electron starts |
| Blank window after `npm run build && npm start` | `dist/index.html` exists; `base: './'` in `vite.config.js` |
| Search / AI / login fails | Default API is `https://airro.online` (AWS); or run local Flask and set `SEARCH_API_ORIGIN` to `http://127.0.0.1:5000`; check CSP in `index.html` allows your origin |
| `<webview>` missing | `webviewTag: true` in `electron/main.js` |
| Linux Electron won’t start | Install GTK/NSS libs per Electron docs |
| Packaged app missing modules | Add any file imported from `main.js` to `build.files` in `package.json` |

---

## Scripts reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Electron with HMR |
| `npm run build` | Production React build → `dist/` |
| `npm start` | Electron only; loads `dist/` |
| `npm run preview` | Preview Vite build in a normal browser (no `<webview>`) |
| `npm run backend` | Flask on `127.0.0.1:5000` |
| `npm run pack` | Build + unpacked electron-builder output |
| `npm run dist` | Build + OS installers |

---

## Further documentation

| Document | Contents |
|----------|----------|
| [`react-electron-setup.md`](react-electron-setup.md) | How React + Vite + Electron are wired (dev vs prod, preload, security baseline) |
| [`package-electron.md`](package-electron.md) | electron-builder config, Linux/Windows/macOS artifacts, checklist |
| [`frontend_deployment.md`](frontend_deployment.md) | Ship the desktop client; point builds at staging/production API URLs |
| [`backend_deployment.md`](backend_deployment.md) | Deploy Flask to cloud (Docker, scaling, HTTPS, observability) |
| [`features.md`](features.md) | Existing features and planned additions |

---

## Customization ideas

- Persist sessions via Electron `session` and webview `partition` attributes.
- Replace `<webview>` with **`BrowserView`** for more main-process control.
- Register custom protocol handlers or a local proxy.
- Enable auto-update (e.g. electron-updater) after you ship installers.

---

## License

MIT — see `package.json`.

---

## Acknowledgments

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Vite](https://vitejs.dev/), and [Flask](https://flask.palletsprojects.com/).
