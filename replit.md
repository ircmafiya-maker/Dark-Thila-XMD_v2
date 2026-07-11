# Dark Thila X MD — WhatsApp Bot

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces (v10)
- **Node.js version**: 20
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 with Socket.IO
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Build**: esbuild (ESM bundle)
- **Bot library**: @whiskeysockets/baileys

## Structure

```text
/
├── artifacts/
│   ├── api-server/         # Express API server + WhatsApp Bot Manager
│   └── dark-thila-bot/     # React + Vite dashboard frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   └── db/                 # Drizzle ORM schema + DB connection
├── railway.toml            # Railway deploy config
├── nixpacks.toml           # Railway Nixpacks build phases
├── Procfile                # Heroku start command
├── app.json                # Heroku app metadata + env vars
├── .env.example            # Environment variable template
└── package.json            # Root package + heroku-postbuild script
```

---

## 🚀 Deploy කරන විදිය (Deployment Guide)

> ⚠️ **Session persistence ගැන වැදගත් දෙයක්:**
> Railway/Heroku වල filesystem ephemeral (redeploy කළාම wipe වෙනවා).
> WhatsApp session rescan ගලවගන්න **`MONGODB_URI`** set කරන්නම ඕන.
> MongoDB Atlas free tier (512MB) හොඳට ඇති.

---

### 🔑 Environment Variables (Required/Optional)

| Variable | Required | Description |
|---|---|---|
| `PORT` | Auto | Railway/Heroku automatically set this — **don't set manually** |
| `NODE_ENV` | ✅ Yes | Must be `production` |
| `JWT_SECRET` | ✅ Yes | Long random string for dashboard login tokens |
| `MONGODB_URI` | ⚠️ Strongly recommended | MongoDB Atlas URI — keeps WhatsApp sessions across redeploys |
| `DATABASE_URL` | Optional | PostgreSQL URI for user store |
| `GEMINI_API_KEY` | Optional | Google AI Studio key for `.ai` command |
| `SESSION_SECRET` | Optional | Express session secret (defaults to JWT_SECRET) |
| `LOG_LEVEL` | Optional | `info` (default) / `debug` / `warn` |

**JWT_SECRET generate කරන විදිය:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 🚂 Railway Deploy

#### Step 1 — GitHub repo connect කරන්න
1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Repo select කරන්න → Railway auto-detect කරනවා `railway.toml` + `nixpacks.toml`

#### Step 2 — Environment variables add කරන්න
Railway dashboard → **Variables** tab → Add:

```
NODE_ENV=production
JWT_SECRET=<your-random-secret>
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dark-thila?retryWrites=true&w=majority
GEMINI_API_KEY=AIza...          (optional)
DATABASE_URL=postgresql://...   (optional)
```

#### Step 3 — Deploy
- **Deploy** button click කරන්න
- Build log: `pnpm install` → frontend build → backend build
- Start: `pnpm --filter @workspace/api-server run start`
- Health check: `GET /api/healthz`

#### Step 4 — Bot session connect කරන්න
1. Railway-assigned URL open කරන්න (e.g. `https://dark-thila-xxx.up.railway.app`)
2. Dashboard login → **New Session** → QR scan / pairing code

#### Railway Free Tier Note
- Free tier: 500 hours/month — bot idle වෙලා sleep වෙයි
- Always-on ඕනනම් **Hobby plan** ($5/mo) use කරන්න
- Session MongoDB-backed නම්, redeploy කළාත් reconnect වෙනවා

---

### 🟣 Heroku Deploy

#### Step 1 — Heroku CLI install + login
```bash
# Install Heroku CLI (https://devcenter.heroku.com/articles/heroku-cli)
heroku login
```

#### Step 2 — App create කරන්න
```bash
heroku create dark-thila-bot
# or with a custom name:
heroku create your-app-name
```

#### Step 3 — Environment variables set කරන්න
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
heroku config:set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/dark-thila?retryWrites=true&w=majority"

# Optional
heroku config:set GEMINI_API_KEY="AIza..."
heroku config:set DATABASE_URL="postgresql://..."
```

#### Step 4 — Deploy
```bash
git push heroku main
```

Heroku flow:
1. Detects pnpm (via `pnpm-lock.yaml` + `packageManager` field)
2. Runs `pnpm install` (devDeps included)
3. Runs `heroku-postbuild` script → builds frontend + backend
4. Starts via `Procfile`: `pnpm --filter @workspace/api-server run start`

#### Step 5 — Bot session connect කරන්න
```bash
heroku open
```
Dashboard open වෙනවා → **New Session** → QR / pairing code

#### Heroku Add-ons (Optional)
```bash
# PostgreSQL (free tier)
heroku addons:create heroku-postgresql:essential-0

# This auto-sets DATABASE_URL
```

> **Note:** Heroku's Eco dynos sleep after 30 min of inactivity.
> Bot keeps itself alive via the built-in 4-min self-ping keepalive.
> But sleep ගිහිල්ල reconnect වෙන්න MongoDB session ඕන.

---

### 🍃 MongoDB Atlas Setup (Session Persistence)

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → **Free Account**
2. **Create a Cluster** → Free tier (M0 Sandbox)
3. **Database Access** → Add user (username + password)
4. **Network Access** → Add IP: `0.0.0.0/0` (allow all — needed for Railway/Heroku)
5. **Connect** → **Connect your application** → Copy URI:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/dark-thila?retryWrites=true&w=majority
   ```
6. Set as `MONGODB_URI` env var on Railway/Heroku

---

### 🔄 Build Flow (Reference)

```
pnpm install --frozen-lockfile
    ↓
pnpm --filter @workspace/dark-thila-bot run build
  → artifacts/dark-thila-bot/dist/public/   (static files)
    ↓
pnpm --filter @workspace/api-server run build
  → artifacts/api-server/dist/index.mjs     (bundled server)
    ↓
NODE_ENV=production node dist/index.mjs
  → serves /api/* (bot API)
  → serves /* (frontend static files from dark-thila-bot/dist/public)
```

---

## Architecture

- **Frontend**: React + Vite at `/` — dark dashboard for managing bot sessions
- **Backend**: Express + Socket.IO at `/api` — WhatsApp bot sessions via Baileys
- **Real-time**: Socket.IO at `/api/socket.io` — live QR / session status

### Bot Session Flow

1. Dashboard → **New Session** (POST `/api/connect`)
2. Backend creates Baileys WebSocket per session
3. QR code / pairing code → frontend via Socket.IO
4. User scans QR or enters pairing code
5. Session connected → bot handles commands

### Sessions on disk

```
artifacts/api-server/sessions/<sessionId>/
├── meta.json          # phone, owner, logo, settings
├── auth.db            # SQLite Baileys auth (fallback only)
├── ping-image.jpg     # Custom card image (.setpingimg)
├── ai-memory/         # Per-user AI conversation history
└── ...                # contacts, group settings, etc.
```

**MongoDB auth state**: If `MONGODB_URI` is set, Baileys creds + signal keys
go to MongoDB (`bot_creds` + `bot_keys` collections). Sessions survive redeploys.
Falls back to SQLite if unset.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/connect` | Create session `{ sessionId, phoneNumber, method }` |
| `POST` | `/api/disconnect` | Remove session `{ sessionId }` |
| `GET` | `/api/sessions/:id` | Get session status |
| `GET` | `/api/sessions/:id/settings` | Get session settings |
| `PATCH` | `/api/sessions/:id/settings` | Update session settings |

---

## TypeScript & Build

Every lib package extends `tsconfig.base.json` (`composite: true`).

- **Typecheck from root**: `pnpm run typecheck`
- **Build all**: `pnpm run build` (typecheck → build all packages)
- **Deploy build**: `pnpm run heroku-postbuild` (no typecheck — frontend + backend only)
- Bot JS files in `src/bot/` are plain ES modules (not compiled by tsc)

---

## Key Dependencies

### api-server
- `@whiskeysockets/baileys` — WhatsApp Web API
- `socket.io` — Real-time events
- `better-sqlite3` — SQLite auth state fallback
- `mongodb` — MongoDB auth state (persistent)
- `qrcode` — QR code generation
- `axios` — HTTP for download commands
- `@distube/ytdl-core` — YouTube downloads
- `ffmpeg-static` — Audio/video conversion

### dark-thila-bot (frontend)
- `socket.io-client` — Real-time bot status
- `@workspace/api-client-react` — Generated React Query hooks

---

## User Preferences

- Sinhala/Singlish responses preferred
- WhatsApp message style formatting (╭─ ╰──)
