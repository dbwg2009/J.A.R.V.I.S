# J.A.R.V.I.S.

> **Just A Rather Very Intelligent System** — A Stark Industries AI assistant, rebuilt as a full-stack PWA on Cloudflare's edge infrastructure.

![PWA](https://img.shields.io/badge/PWA-enabled-00d4ff?style=flat-square)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-f38020?style=flat-square&logo=cloudflare)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=flat-square&logo=cloudflare)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020?style=flat-square&logo=cloudflare)
![License: MIT](https://img.shields.io/badge/License-MIT-00ffaa?style=flat-square)

---

## Features

- 🤖 **AI Chat** — Powered by Claude (claude-sonnet-4) via Anthropic OR GPT-4 via OpenRouter. Flexible LLM switching. Your API keys never touch the browser.
- 🔐 **Multi-user login system** — Session-based authentication with persistent 30-day cookies. Per-user data isolation.
- 👤 **Admin panel** — Create, manage, and delete user accounts. Promote users to admin. All in-UI.
- 🗄️ **Cloudflare D1** — All data (chat history, tasks, settings, users, sessions) persisted in a serverless SQLite database at the edge.
- ✅ **Task manager** — Per-user objective tracking, synced to D1.
- 🏠 **Home panel** — Simulated smart home device controls.
- 🎤 **Voice input** — Web Speech API for hands-free commands.
- 🔊 **Voice output** — British TTS via SpeechSynthesis (prefers Daniel / en-GB voice).
- 🌐 **Web search** — Optional live web search via Anthropic's built-in tool.
- ⚙️ **Per-user settings** — Voice toggle, web search toggle, custom system prompt, LLM provider selection — all saved to D1.
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
                                └── LLM Provider Routing
                                    ├── Anthropic API (if ANTHROPIC_API_KEY set)
                                    └── OpenRouter API (if OPENROUTER_API_KEY set)
```

---

## LLM Provider Support

J.A.R.V.I.S. now supports **multiple LLM providers** for maximum flexibility:

### Anthropic (Claude)
- **Model:** `claude-sonnet-4-20250514`
- **Setup:** Set `ANTHROPIC_API_KEY` as a Cloudflare Worker secret
- **Features:** Built-in web search support

### OpenRouter
- **Model:** `openai/gpt-4-turbo` (configurable)
- **Setup:** Set `OPENROUTER_API_KEY` as a Cloudflare Worker secret
- **Features:** Access to 200+ models via unified API

### Provider Selection
- System defaults to **Anthropic** if both keys are available
- Set `PREFER_OPENROUTER = "true"` in `wrangler.toml` to prioritize OpenRouter
- Users can select their preferred provider in Settings

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — `npm install -g wrangler`
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- **At least one** of:
  - An [Anthropic API key](https://console.anthropic.com/)
  - An [OpenRouter API key](https://openrouter.ai/)

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

### 6. (Optional) Configure provider preference

Edit `wrangler.toml` to set your default provider:

```toml
[env.production]
vars = { PREFER_OPENROUTER = "false" }  # false = Anthropic, true = OpenRouter
```

### 7. Deploy to Cloudflare Pages

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
| `PREFER_OPENROUTER` | `wrangler.toml` vars | Set to `"true"` to prefer OpenRouter when both keys available (default: `"false"`) |
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
        ├── message.js       # POST /api/message (LLM proxy with provider routing)
        ├── tasks.js         # GET/POST/PUT/DELETE /api/tasks
        ├── settings.js      # GET/PUT /api/settings
        ├── chat.js          # GET/POST/DELETE /api/chat
        └── users.js         # GET/POST/PUT/DELETE /api/users (admin)
```

---

## Security notes

- Passwords are hashed with **SHA-256** before storage in D1.
- Session tokens are 32-byte cryptographically random hex strings.
- Sessions expire after **30 days**.
- LLM API keys are stored as **Cloudflare Worker secrets** — never sent to the browser.
- All cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
