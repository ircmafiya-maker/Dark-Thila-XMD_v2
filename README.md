<div align="center">

# 🤖 Dark Thila X MD

**Multi-user WhatsApp Bot** with a dark dashboard UI  
Built on [Baileys](https://github.com/WhiskeySockets/Baileys) · Express · React · Socket.IO

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange)](https://pnpm.io)
[![License](https://img.shields.io/badge/license-MIT-blue)](#-license)

</div>

---

## ✨ Features

- 🔐 Multi-session WhatsApp bot (QR + pairing code)
- 🎨 Dark hacker-aesthetic dashboard (React + Vite)
- 🤖 AI chat via Gemini + Pollinations fallback
- 📥 YouTube / TikTok / Facebook downloader
- 👥 Group admin tools (kick, add, promote, demote)
- 📡 Real-time session status via Socket.IO
- 🗄️ MongoDB session persistence (survives redeploys)

---

## 🏗️ Architecture

```
pnpm monorepo
├── artifacts/
│   ├── api-server/          # Express 5 + Socket.IO + Baileys bot manager
│   │   ├── src/bot/         # WhatsApp command handlers (ES modules)
│   │   ├── src/routes/      # REST API routes
│   │   ├── sessions/        # Per-session data & SQLite auth (fallback)
│   │   └── assets/          # Default bot images
│   └── dark-thila-bot/      # React + Vite dashboard
│       └── src/             # Pages, components, hooks
├── lib/
│   ├── api-zod/             # Zod validation schemas
│   ├── api-client-react/    # Generated React Query hooks
│   └── db/                  # Drizzle ORM schema + DB connection
├── railway.toml             # Railway deploy config
├── nixpacks.toml            # Railway Nixpacks build phases
├── Procfile                 # Heroku start command
├── app.json                 # Heroku app metadata + env vars
└── .env.example             # Environment variable template
```

**Session flow:**
1. Dashboard → **New Session** → `POST /api/connect`
2. Baileys creates a WebSocket per session
3. QR code / pairing code emitted to the frontend via Socket.IO
4. User scans on WhatsApp → session connects
5. Bot handles commands; sessions persist in MongoDB

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | ✅ | Must be `production` on cloud deploys |
| `JWT_SECRET` | ✅ | Long random string for dashboard login tokens |
| `MONGODB_URI` | ⚠️ Strongly recommended | MongoDB Atlas URI — keeps WhatsApp sessions across redeploys |
| `DATABASE_URL` | Optional | PostgreSQL URI for user/login store |
| `GEMINI_API_KEY` | Optional | Google AI Studio key for `.ai` command |
| `SESSION_SECRET` | Optional | Express session secret (defaults to `JWT_SECRET`) |
| `LOG_LEVEL` | Optional | `info` (default) / `debug` / `warn` |
| `PORT` | Auto | Set automatically by Railway/Heroku — **don't set manually** |

> **`MONGODB_URI` is strongly recommended** on any cloud platform.  
> Without it, WhatsApp sessions are wiped on every redeploy.  
> Get a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).

Generate `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy `.env.example` → `.env` and fill in values for local dev.

---

## 🛠️ Local Development

**Requirements:** Node ≥ 20, pnpm ≥ 10

```bash
# Install dependencies
pnpm install

# Copy env template
cp .env.example .env
# → Fill in JWT_SECRET at minimum

# Start dev servers (in separate terminals)
pnpm --filter @workspace/dark-thila-bot run dev   # Frontend :5173
pnpm --filter @workspace/api-server run dev        # Backend  :8080
```

Open `http://localhost:5173` → Dashboard.

---

## 📦 Build

```bash
# Full build (typecheck + all packages)
pnpm run build

# Deploy build only (no typecheck — used by Heroku/Railway)
pnpm run heroku-postbuild
```

Build flow:
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
  → serves /api/*  (bot REST API + Socket.IO)
  → serves /*      (frontend static files)
```

---

## 🚀 Deploy

### Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

1. **Fork** this repo → connect to [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Railway auto-detects `railway.toml` + `nixpacks.toml`
3. Add environment variables in the **Variables** tab:
   ```
   NODE_ENV=production
   JWT_SECRET=<your-random-secret>
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dark-thila?retryWrites=true&w=majority
   GEMINI_API_KEY=AIza...        (optional)
   DATABASE_URL=postgresql://... (optional)
   ```
4. Click **Deploy** — build log: install → frontend build → backend build
5. Open the Railway URL → Dashboard → **New Session** → QR / pairing code

> **Free tier note:** 500 hrs/month; bot sleeps when idle. Use Hobby plan ($5/mo) for always-on.  
> With MongoDB-backed sessions, reconnection is automatic after sleep/redeploy.

### Heroku

```bash
heroku create your-app-name
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
heroku config:set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/dark-thila?retryWrites=true&w=majority"
git push heroku main
heroku open
```

Heroku flow: detects pnpm → `pnpm install` → runs `heroku-postbuild` → starts via `Procfile`.

> Eco dynos sleep after 30 min of inactivity. The bot has a built-in 4-min self-ping keepalive,  
> but MongoDB session is required to reconnect after a sleep cycle.

---

## 🍃 MongoDB Atlas Setup

1. [Create free cluster](https://www.mongodb.com/cloud/atlas) (M0 Sandbox)
2. **Database Access** → Add user (username + password)
3. **Network Access** → Allow all IPs: `0.0.0.0/0`
4. **Connect** → **Connect your application** → copy URI:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/dark-thila?retryWrites=true&w=majority
   ```
5. Set as `MONGODB_URI` on Railway / Heroku

---

## 🌐 API Endpoints

**Public** (no token required):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `POST` | `/api/auth/register` | Register a new dashboard user |
| `POST` | `/api/auth/login` | Login → returns JWT |

**Protected** (require `Authorization: Bearer <token>`):

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/connect` | Create session `{ sessionId, phoneNumber, method }` |
| `POST` | `/api/disconnect` | Remove session `{ sessionId }` |
| `GET` | `/api/status/:sessionId` | Get session status |
| `POST` | `/api/sessions/:sessionId/reconnect` | Reconnect a session |
| `GET` | `/api/sessions/:sessionId/settings` | Get session settings |
| `PATCH` | `/api/sessions/:sessionId/settings` | Update session settings |
| `PATCH` | `/api/sessions/:sessionId/logo-url` | Set bot logo via URL |
| `POST` | `/api/pair/qr` | Request QR code for session |
| `POST` | `/api/pair/code` | Request pairing code for session |
| `GET` | `/api/pair/status/:sessionId` | Poll pair/connect status |
| `DELETE` | `/api/pair/cancel/:sessionId` | Cancel pending pairing |

Real-time events (QR codes, session status) are delivered via Socket.IO at `/api/socket.io`.

---

## 💾 Session Storage

Each session stores data locally at `artifacts/api-server/sessions/<sessionId>/`:

```
sessions/<sessionId>/
├── meta.json          # phone, owner, logo, settings
├── auth.db            # SQLite Baileys auth (fallback when no MongoDB)
├── ping-image.jpg     # Custom card image (.setpingimg)
├── ai-memory/         # Per-user AI conversation history
└── ...                # contacts, group settings, etc.
```

When `MONGODB_URI` is set, Baileys credentials and signal keys are stored in MongoDB (`bot_creds` + `bot_keys` collections), surviving redeploys. Falls back to SQLite if unset.

---

## 🤖 Bot Commands

| Command | Description | Who |
|---|---|---|
| `.menu` | Show all commands | Everyone |
| `.alive` | Bot uptime & status | Everyone |
| `.ping` | Response speed test | Everyone |
| `.ai [msg]` | AI chat (Gemini / Pollinations) | Everyone |
| `.fbdl [url]` | Download Facebook video | Everyone |
| `.ttdl [url]` | Download TikTok video | Everyone |
| `.song [name]` | Download YouTube audio | Everyone |
| `.kick @user` | Remove from group | Owner + Group admin |
| `.add [number]` | Add to group | Owner + Group admin |
| `.promote @user` | Make admin | Owner + Group admin |
| `.demote @user` | Remove admin | Owner + Group admin |
| `.bc [msg]` | Broadcast to all groups | Owner only |
| `.setlogo [url]` | Change bot logo | Owner only |
| `.setpingimg [url]` | Change ping card image | Owner only |

---

## 📋 Tech Stack

| Layer | Tech |
|---|---|
| Bot | @whiskeysockets/baileys |
| Backend | Express 5, Socket.IO, Pino |
| Frontend | React, Vite, TailwindCSS |
| Auth | JWT, bcrypt |
| Database | PostgreSQL + Drizzle ORM |
| Session store | MongoDB (Baileys auth state) |
| AI | Google Gemini + Pollinations |
| Media | yt-dlp, ffmpeg-static, @distube/ytdl-core |
| Build | esbuild, TypeScript 5.9 |
| Monorepo | pnpm workspaces |

---

## 🔧 Troubleshooting

**Bot disconnects after redeploy**  
→ Set `MONGODB_URI`. Without it, auth state is in SQLite which is wiped on redeploy.

**QR not showing on dashboard**  
→ Check Socket.IO connection. The frontend must reach `/api/socket.io` on the same origin.

**`.ai` command not working**  
→ Set `GEMINI_API_KEY`. Without it the bot falls back to Pollinations (free, no key needed, but slower).

**Build fails on Railway/Heroku**  
→ Ensure `NODE_ENV=production` is set before deploy. Check build logs for missing deps.

**Admin commands (.kick, .promote) not working**  
→ The bot's WhatsApp number must be a group admin. Check it has admin privileges in the group.

---

## 📄 License

MIT © Dark Thila
