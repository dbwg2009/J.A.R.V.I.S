# J.A.R.V.I.S.

> **Just A Rather Very Intelligent System** — A Stark Industries AI assistant, rebuilt as a full-stack PWA on Cloudflare's edge infrastructure.

![PWA](https://img.shields.io/badge/PWA-enabled-00d4ff?style=flat-square)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-f38020?style=flat-square&logo=cloudflare)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square&logo=cloudflare)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020?style=flat-square&logo=cloudflare)
![License: MIT](https://img.shields.io/badge/License-MIT-00ffaa?style=flat-square)

---

## Features

- 🤖 **AI Chat with streaming** — Powered by Claude (`claude-sonnet-4-6`) via Anthropic OR OpenRouter. Replies stream in token-by-token. Your API keys never touch the browser.
- 🛠️ **JARVIS can act, not just talk** — Server-side tool use lets it manage your tasks ("Jarvis, remind me to buy milk"), switch home devices ("turn off the lab lights"), and check the weather, all by voice or text.
- 🎤 **Voice input** — Web Speech API with live interim results and clear error feedback.
- 🗣️ **Wake word** — Toggle WAKE WORD and just say *"Jarvis"* to start talking, movie-style.
- 🔁 **Conversation mode** — Toggle AUTO and the mic reopens after each spoken reply for hands-free back-and-forth.
- 🔊 **Voice output** — Google Cloud Text-to-Speech with a British neural voice (JARVIS-like). Tap the arc reactor to silence him.
- 🌤️ **Environment panel** — Live local weather on the HOME tab via Open-Meteo (no API key needed).
- 🔐 **Multi-user login system** — Salted PBKDF2 password hashing, login rate limiting, 30-day sessions, per-user data isolation.
- 👤 **Admin panel** — Create, manage, and delete user accounts. Promote users to admin. All in-UI.
- 🗄️ **Cloudflare D1** — All data (chat history, tasks, devices, settings, users, sessions) persisted in a serverless SQLite database at the edge.
- ✅ **Task manager** — Per-user objective tracking, synced to D1 (and editable by JARVIS).
- 🏠 **Home panel** — Smart home device tiles, persisted per-user and controllable by voice.
- 🌐 **Web search** — Optional live web search via Anthropic's built-in tool.
- ⚙️ **Per-user settings** — Voice toggle, web search toggle, custom system prompt — all saved to D1.
- 📱 **Installable PWA** — Works offline, installable on mobile and desktop.

---

## Architecture

```
Browser (PWA)
    │
    ├── Static assets ──► Cloudflare Pages (CDN)
    │
    └── /api/* requests ──► Cloudflare Pages Functions (Workers)
                                │
                                ├── Session auth (cookie → D1 lookup)
                                ├── D1 Database (users, sessions, tasks, settings, chat)
                                ├── LLM Provider Routing
                                │   ├── Anthropic API (if ANTHROPIC_API_KEY set)
                                │   └── OpenRouter API (if OPENROUTER_API_KEY set)
                                └── Google Cloud Text-to-Speech (if GOOGLE_CLOUD_TTS_API_KEY set)
```

---

## LLM Provider Support

J.A.R.V.I.S. now supports **multiple LLM providers** for maximum flexibility:

### Anthropic (Claude)
- **Model:** `claude-sonnet-4-6` by default — override with the `CHAT_MODEL` environment variable
- **Setup:** Set `ANTHROPIC_API_KEY` as a Cloudflare Worker secret
- **Features:** Streaming replies, tool use (tasks, devices, weather), built-in web search support

### OpenRouter
- **Model:** `openrouter/auto:free` (configurable)
- **Setup:** Set `OPENROUTER_API_KEY` as a Cloudflare Worker secret
- **Features:** Access to 200+ models via unified API

### Provider Selection
- System defaults to **Anthropic** if both keys are available
- Set `PREFER_OPENROUTER = "true"` in `wrangler.toml` to prioritize OpenRouter
- Users can select their preferred provider in Settings

---

## Google Cloud Text-to-Speech

J.A.R.V.I.S. uses **Google Cloud Text-to-Speech** for natural, sophisticated speech synthesis with a British neural voice that sounds like JARVIS from Iron Man.

### Features
- **Neural voice:** `en-GB-Neural2-C` — Male, professional British accent
- **Natural prosody:** Adjustable pitch and speaking rate
- **Free tier:** 500,000 characters/month (plenty for a personal assistant)
- **Authenticated:** Only authenticated users can trigger TTS

### Setup Instructions

#### 1. Create a Google Cloud project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Library**
4. Search for **"Cloud Text-to-Speech API"**
5. Click **Enable**

#### 2. Create a service account key
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in the details (name, description optional)
4. Click **Create and Continue**
5. Grant the role **Basic** → **Editor** (or more restrictively, create a custom role with `texttospeech.googleapis.com` permissions)
6. Click **Continue** → **Done**
7. Find your new service account in the list and click it
8. Go to the **Keys** tab
9. Click **Add Key** → **Create new key**
10. Choose **JSON** and click **Create**
11. A JSON file will download — save it securely

#### 3. Extract the API key
The JSON file contains a `private_key` field. You need to extract just the API key string:

```bash
# On macOS/Linux:
cat /path/to/your/service-account-key.json | jq -r '.private_key'
```

Or, open the JSON file and copy the value of the `"private_key"` field (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers).

#### 4. Set the secret in Cloudflare Workers

```bash
wrangler pages secret put GOOGLE_CLOUD_TTS_API_KEY
```

Paste the full private key (with BEGIN/END markers) when prompted.

#### 5. Verify it's working
Once deployed, enable voice output in the app settings and send a message. You should hear the JARVIS-like British voice respond.

### Pricing
- **Free:** 500,000 characters/month per project
- **Paid:** $16 per 1 million characters after free tier
- [Google Cloud Pricing](https://cloud.google.com/text-to-speech/pricing)

### API Endpoint
The app calls `POST /api/tts` which proxies to Google Cloud's `text:synthesize` endpoint:
- Returns audio as base64-encoded MP3
- Supports custom language codes, pitch, and speaking rate
- Only accessible to authenticated users

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — `npm install -g wrangler`
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- **At least one** of:
  - An [Anthropic API key](https://console.anthropic.com/)
  - An [OpenRouter API key](https://openrouter.ai/)
- *(Optional but recommended)* A [Google Cloud service account key](https://cloud.google.com/docs/authentication/application-default-credentials) for TTS

### 1. Clone the repository

```bash
git clone https://github.com/dbwg2009/J.A.R.V.I.S.git
cd J.A.R.V.I.S.
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create the D1 database

```bash
wrangler d1 create jarvis-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "jarvis-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 4. Run the database schema

```bash
wrangler d1 execute jarvis-db --file=schema.sql
```

This creates all tables and inserts the default admin account:
- **Username:** `admin`
- **Password:** `password`

> ⚠️ Change the admin password immediately after first login via Settings → Change Password.

### 5. Set your LLM API keys as secrets

**For Anthropic:**
```bash
wrangler pages secret put ANTHROPIC_API_KEY
```

**For OpenRouter:**
```bash
wrangler pages secret put OPENROUTER_API_KEY
```

Paste your keys when prompted. These are stored securely and never exposed to the browser.

> 💡 You only need to set **one** API key minimum, but can set both for flexibility.

### 6. (Optional) Set your Google Cloud TTS API key

If you want voice output with the JARVIS voice:

```bash
wrangler pages secret put GOOGLE_CLOUD_TTS_API_KEY
```

Paste your service account private key (with BEGIN/END markers) when prompted.

> 💡 If not set, the app will fall back gracefully without voice output.

### 7. (Optional) Configure provider preference

Edit `wrangler.toml` to set your default provider:

```toml
[env.production]
vars = { PREFER_OPENROUTER = "false" }  # false = Anthropic, true = OpenRouter
```

### 8. Deploy to Cloudflare Pages

```bash
wrangler pages deploy .
```

Or connect this repository to Cloudflare Pages via the dashboard for automatic deployments on push.

### Local development

```bash
wrangler pages dev . --d1=DB=jarvis-db
```

---

## Default credentials

| Username | Password | Role  |
|----------|----------|-------|
| `admin`  | `password` | Admin |

**Change these immediately after deployment.**

---

## Environment variables / secrets

| Name | Where to set | Description |
|------|-------------|-------------|
| `ANTHROPIC_API_KEY` | Wrangler secret / Pages dashboard | Your Anthropic API key (optional if using OpenRouter) |
| `OPENROUTER_API_KEY` | Wrangler secret / Pages dashboard | Your OpenRouter API key (optional if using Anthropic) |
| `GOOGLE_CLOUD_TTS_API_KEY` | Wrangler secret / Pages dashboard | Your Google Cloud service account private key (optional for voice output) |
| `PREFER_OPENROUTER` | `wrangler.toml` vars | Set to `"true"` to prefer OpenRouter when both keys available (default: `"false"`) |
| `CHAT_MODEL` | `wrangler.toml` vars | Anthropic model id for chat (default: `claude-sonnet-4-6`) |
| `DB` | `wrangler.toml` D1 binding | Auto-configured — do not change |

---

## Project structure

```
J.A.R.V.I.S./
├── index.html              # Full PWA frontend (React via CDN)
├── sw.js                   # Service worker (offline caching)
├── manifest.json           # PWA manifest
├── icon.svg                # App icon
├── schema.sql              # D1 database schema + seed data
├── wrangler.toml           # Cloudflare configuration
├── _headers                # Cloudflare Pages HTTP headers
├── _redirects              # SPA routing fallback
├── LICENSE                 # MIT licence
├── CONTRIBUTING.md         # Contribution guidelines
└── functions/
    ├── _middleware.js       # CORS middleware
    └── api/
        ├── _auth.js         # Shared auth helpers (hashing, sessions, cookies)
        ├── login.js         # POST /api/login
        ├── logout.js        # POST /api/logout
        ├── me.js            # GET  /api/me
        ├── message.js       # POST /api/message (streaming LLM proxy + tool use)
        ├── tts.js           # POST /api/tts (Google Cloud Text-to-Speech proxy)
        ├── tasks.js         # GET/POST/PUT/DELETE /api/tasks
        ├── devices.js       # GET/PUT /api/devices (home devices)
        ├── _devices.js      # Shared device helpers (lazy table + seed)
        ├── settings.js      # GET/PUT /api/settings
        ├── chat.js          # GET/POST/DELETE /api/chat
        └── users.js         # GET/POST/PUT/DELETE /api/users (admin)
```

---

## Security notes

- Passwords are hashed with **salted PBKDF2-SHA256 (100k iterations)**; legacy SHA-256 hashes upgrade automatically on the next login.
- Login is **rate limited**: 5 failed attempts per username/IP within 15 minutes locks the account for 15 minutes.
- Accounts still using the default password get a persistent warning banner after login.
- Session tokens are 32-byte cryptographically random hex strings.
- Sessions expire after **30 days**; expired sessions are pruned automatically.
- LLM API keys are stored as **Cloudflare Worker secrets** — never sent to the browser.
- Google Cloud API keys are stored as **Cloudflare Worker secrets** — never sent to the browser.
- All cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`.
- Text-to-speech only works for authenticated users.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
