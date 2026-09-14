# AI Chatbot Builder

A complete, production-style **No-Code AI Chatbot Builder** SaaS platform. Build, customize, test, and deploy AI-powered chatbots without writing code — with a real drag-and-drop flow builder, a genuine Retrieval-Augmented Generation (RAG) knowledge base backed by Qdrant, an intelligent multi-provider AI router (Gemini + Groq) with automatic fallback, and separate User/Admin panels.

This is a **real, functional application** — every button performs a real backend action, every AI response goes through actual provider APIs (with graceful, honest error handling when providers/keys aren't configured), and all data is stored in PostgreSQL.

---

## 1. Project Overview

AI Chatbot Builder lets non-technical users:

- Design conversational flows visually (drag & drop nodes: triggers, messages, AI, logic, actions)
- Give their bot a personality, knowledge base, and behavior settings
- Upload documents (PDF/DOCX/TXT/URLs/FAQ) that the bot can search via vector search (RAG)
- Test the bot in a live sandbox using the *actual* configured flow and AI
- Deploy to a website widget, connect their own WhatsApp Business API, Telegram bot, generic webhooks, or a REST API
- View real analytics, conversation history, and version history
- Get contextual help from a **local, zero-API-cost AI Guide** (separate from the main chatbot AI)

Admins get a separate panel to manage users, bots, platform AI provider keys, templates, integrations, analytics, and system logs.

---

## 2. Key Features

- 🧩 **No-code visual Bot Builder** — trigger/message/AI/logic/action nodes, drag, connect, undo/redo, auto-save, publish
- 🧠 **AI Router** — automatically classifies each request and selects the best available Gemini/Groq model & key, with health tracking and automatic fallback across keys and providers
- 📚 **Knowledge Base + RAG** — PDF/DOCX/TXT/URL/FAQ ingestion → cleaning → chunking → local ML embeddings → Qdrant vector search, fully isolated per bot
- 🔌 **Integrations** — Website chat widget (real embed code), user-owned WhatsApp (Meta Cloud API), Telegram bot, generic webhook, and a bot-scoped REST API with generated keys
- 📊 **Real analytics** — conversations, messages, response times, popular questions, provider/model usage — all computed from the database, never faked
- 🕓 **Version history** — automatic + manual snapshots, diff/compare, non-destructive restore
- 🧪 **Test mode** — runs your actual flow + AI configuration + knowledge base
- 🛡️ **Security** — hashed passwords, Flask-Login sessions, role-based access control, Fernet-encrypted integration credentials, masked API keys, input/file validation
- 🤖 **Local ML AI Guide** — a TF-IDF/cosine-similarity based assistant that explains the platform's own features without calling any external AI API
- 🎨 **Premium dark/lime glassmorphism UI** with hover tooltips, 3D tilt cards, floating AI assistant, toasts, and skeleton loading states

---

## 3. Architecture

```
AI_Chatbot_Builder/
├── main.py                # Entry point — python main.py
├── .env / .env.example    # All secrets/config (never hardcoded)
├── requirements.txt
│
├── backend/                # Flask app factory, config, extensions
├── database/                # SQLAlchemy db instance + seed data
├── models/                  # All ORM models (Users, Bots, Flows, KB, Integrations, Analytics, Logs...)
├── auth/                    # Password hashing, decorators, security helpers
├── routers/                 # All Flask blueprints (pages + REST APIs)
├── services/                 # Email, crypto (Fernet), logging, KB, versioning
├── ai/                       # AI Router, model registry, provider health, Gemini/Groq adapters
├── rag/                      # Text extraction, chunking, local embeddings, Qdrant service, pipeline
├── chatbot/                  # Flow execution engine + conversation service
├── integrations/             # WhatsApp, Telegram, generic webhook services
├── analytics/                 # Real analytics query service
├── ml/                        # Local ML AI Guide assistant (TF-IDF, zero external API)
├── frontend/
│   ├── templates/             # Jinja2 templates: auth, user panel, admin panel, widget
│   └── static/                # CSS design system + JS (common utils, AI Guide widget)
└── uploads/                   # User-uploaded KB files (per-bot subfolders)
```

Everything is modular: adding a new AI model only requires editing `ai/model_registry.py`; adding a new integration means adding a service in `integrations/` and a router in `routers/integration_api.py`.

---

## 4. Installation

### 4.1 Requirements

- **Python 3.10+** (developed & tested on Python 3.13)
- **PostgreSQL 13+**
- **Qdrant** (local binary, Docker, or Qdrant Cloud) — optional but required for RAG search to actually return results
- pip packages from `requirements.txt`

### 4.2 Install dependencies

```bash
cd AI_Chatbot_Builder
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

---

## 5. Environment Setup (`.env`)

Copy `.env.example` to `.env` and fill in what you have. **Nothing in this list is required for the app to start** — every integration degrades gracefully and tells the user/admin it's "Not Configured" instead of faking success or crashing.

```bash
cp .env.example .env
```

| Variable | Required? | Purpose |
|---|---|---|
| `GEMINI_API_KEY_1/2/3` | optional | Google Gemini keys used by the AI Router (multiple = automatic fallback) |
| `GROQ_API_KEY_1/2/3` | optional | Groq keys used by the AI Router |
| `QDRANT_URL`, `QDRANT_API_KEY` | optional | Vector DB for RAG search. Without it, KB uploads are stored but not searchable |
| `DATABASE_URL` | **required** | PostgreSQL connection string (`postgresql://user:password@host:port/database`). This project **always uses PostgreSQL** — there is no SQLite fallback. If `DATABASE_URL` is missing/wrong or PostgreSQL isn't reachable, `python main.py` prints a clear connection error and exits (see §6) |
| `EMAIL_API_KEY` / `SMTP_*` | optional | Enables email verification & password reset. Without it, accounts auto-verify and password reset shows a clear "not configured" message |
| `GOOGLE_CLIENT_ID/SECRET` | optional | Enables "Continue with Google". Hidden from the UI when unset |
| `TWILIO_*` | optional | Platform-level fallback only — WhatsApp is normally **user-owned per bot** (see §14) |
| `SECRET_KEY`, `JWT_SECRET`, `FERNET_KEY` | **required** for production | Session signing & credential encryption. Sensible dev defaults are provided but **must be changed for real deployments** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | used once | Seeds the default admin account on first run |

---

## 6. PostgreSQL Setup

This project **requires PostgreSQL** — it does not use SQLite, and never falls back to it, even if PostgreSQL is temporarily unreachable. If the database can't be reached, `python main.py` fails fast with a clear message instead of starting in a degraded/fake state (see §6.3).

### 6.1 Linux / macOS

```bash
# create the database (adjust user/password as you like)
sudo -u postgres psql -c "CREATE DATABASE chatbot_builder;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

# confirm PostgreSQL is running
sudo service postgresql status
# start it if it isn't
sudo service postgresql start
```

Set in `.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chatbot_builder
```

Tables are created automatically on first run of `python main.py` (no manual migration step needed for a fresh install). `Flask-Migrate` is wired in for future schema changes.

### 6.2 Windows — exact step-by-step instructions

If you installed PostgreSQL on Windows via the official installer (EDB), it registers itself as a Windows Service and installs the `psql` / `pg_isready` command-line tools under `C:\Program Files\PostgreSQL\<version>\bin`. Open **Command Prompt** or **PowerShell** and run the following (add that `bin` folder to your `PATH`, or `cd` into it first, if `psql`/`pg_isready` aren't recognized).

**Step 1 — Check whether PostgreSQL is running**

```powershell
# Option A: check the Windows service status
sc query postgresql-x64-17
```
(Replace `17` with your installed version, e.g. `postgresql-x64-14`, `postgresql-x64-16`. If you don't know the exact name, open `services.msc` — see Step 2 — and look for a service starting with `postgresql-x64-`.)

Look for `STATE` in the output: `4  RUNNING` means it's up; `1  STOPPED` means it's not.

```powershell
# Option B: check with pg_isready (bundled with PostgreSQL)
pg_isready -h localhost -p 5432
```
`accepting connections` means it's up; `no response` / connection refused means it's down — this is the exact scenario that produces the `psycopg2.OperationalError: Connection refused` error.

**Step 2 — Start the PostgreSQL Windows service**

```powershell
# Using the Services GUI:
#   Win + R  ->  services.msc  ->  find "postgresql-x64-<version>"  ->  right-click  ->  Start

# Or from an elevated (Run as Administrator) Command Prompt / PowerShell:
net start postgresql-x64-17
```
If it's already running you'll see `The requested service has already been started.` — that's fine.

To make sure PostgreSQL always starts automatically after a reboot, in `services.msc` set its **Startup type** to **Automatic**.

**Step 3 — Check that port 5432 is actually listening**

```powershell
netstat -ano | findstr 5432
```
You should see a line like `TCP    0.0.0.0:5432   ...   LISTENING   <PID>`. If nothing is printed, PostgreSQL is not listening on that port (either it's not running, or it was configured on a different port — check `postgresql.conf`'s `port =` setting, and update `DATABASE_URL` in `.env` to match).

**Step 4 — Create the database (if it doesn't exist yet)**

```powershell
# Opens an interactive psql session as the postgres superuser (it will prompt for the password you set during install)
psql -U postgres -h localhost -p 5432

# Inside the psql prompt:
CREATE DATABASE chatbot_builder;
\q
```
Or as a single non-interactive command:
```powershell
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE chatbot_builder;"
```

**Step 4 (Alternative) — Create the database using pgAdmin (GUI, no command line)**

If you installed PostgreSQL on Windows via the official installer, **pgAdmin** was installed alongside it. This is the point-and-click equivalent of Step 4 above — use whichever you prefer, you only need to create the database once.

1. Open **pgAdmin** from the Start menu (e.g. "pgAdmin 4").
2. In the left-hand tree, expand **Servers → PostgreSQL `<version>`**. If prompted, enter the `postgres` user's password (the one you set during installation — this is also the password that must go into `.env` in Step 5).
3. Right-click **Databases** → **Create** → **Database...**
4. In the dialog that opens:
   - **Database**: type `chatbot_builder` exactly (must match the database name in `DATABASE_URL`).
   - **Owner**: select `postgres` (or whichever role you plan to put in `DATABASE_URL`).
   - Leave the other fields (Encoding, Template, Tablespace) at their defaults.
5. Click **Save**. `chatbot_builder` now appears under **Databases** in the tree — that's it, no tables need to be created manually; `python main.py` creates all 19 application tables automatically the first time it connects.
6. To double check it was created correctly, expand **Databases → chatbot_builder** — it should be listed and browsable (it will just be empty of tables until you run the app).

> **Note — you may not even need this step anymore.** As of this version, `python main.py` **automatically creates `chatbot_builder` for you** if it doesn't already exist (using the exact host/port/username/password from your `.env`'s `DATABASE_URL` — it never uses a different credential and never touches any other database). You'll see this in the console output:
> ```
> [DB] Database 'chatbot_builder' does not exist yet. Creating it now using the credentials from .env ...
> [DB] Created database 'chatbot_builder'.
> ```
> Manual creation via `psql` or pgAdmin (Steps 4 above) is still documented here for cases where the `postgres` role you configured doesn't have permission to create databases, or if you simply prefer to create it yourself ahead of time.

**Step 5 — Configure `DATABASE_URL` in `.env`**

Open (or create) the `.env` file in the project root (copy from `.env.example` if it doesn't exist yet) and set:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/chatbot_builder
```
Replace `YOUR_PASSWORD` with the password you set for the `postgres` user during installation. If you used a different port, database name, or username, update the connection string accordingly — every part (`host`, `port`, `database`, `username`, `password`) is independently configurable through this one URL.

**Step 6 — Test the connection before running the app**

```powershell
psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/chatbot_builder" -c "SELECT 1;"
```
A successful run prints:
```
 ?column?
----------
        1
(1 row)
```
If this fails, the app will fail the same way — fix it here first (see §6.3 for what each failure message means).

**Step 7 — Run the app**

```powershell
python main.py
```
You should see:
```
[DB] Connecting to PostgreSQL at localhost:5432/chatbot_builder as 'postgres' ...
[DB] Connection OK. Creating/verifying tables ...
[SEED] Created default admin account: admin@aichatbotbuilder.local / (see .env ADMIN_PASSWORD)
======================================================================
 AI CHATBOT BUILDER — starting
======================================================================
 Database:       PostgreSQL (localhost:5432/chatbot_builder) — connected
...
```
Then open `http://localhost:8000` in your browser.

### 6.3 What happens if PostgreSQL is NOT reachable

`python main.py` performs a real pre-flight connection check (`database/health.py`) before touching the database. If PostgreSQL is down, instead of a huge `psycopg2`/`SQLAlchemy` traceback you will see a short, actionable message and the process exits with a non-zero status (no partial/fake startup):

```
======================================================================
 DATABASE CONNECTION FAILED
======================================================================
PostgreSQL is not running or cannot be reached at localhost:5432.
Start PostgreSQL and verify DATABASE_URL in .env.

Quick checks:
  1. Is PostgreSQL running?      (Windows: services.msc -> 'postgresql-x64-##')
  2. Is it listening on port 5432?  (Windows: netstat -ano | findstr 5432)
  3. Does DATABASE_URL in .env match your local PostgreSQL host/port/user/password?

See README.md -> 'PostgreSQL Setup (Windows)' for exact step-by-step commands.
======================================================================
 DATABASE_URL currently resolves to: postgresql://postgres:***@localhost:5432/chatbot_builder
======================================================================
```

If PostgreSQL **is** reachable but the connection is still rejected (wrong password, database doesn't exist, wrong username), the message is different and tells you that specifically — e.g. `PostgreSQL is reachable at localhost:5432, but the connection was rejected` — so you don't waste time restarting a service that was never the problem.

You can also check database connectivity at any time **while the app is running**, without restarting it:
```
curl http://localhost:8000/health/db
```
Returns `{"status": "ok", ...}` (HTTP 200) when the database is reachable, or `{"status": "error", "message": "...", ...}` (HTTP 503) when it isn't. This endpoint never exposes the password.

**This project does not, and will not, silently fall back to SQLite.** The goal of the pre-flight check is purely to make a real PostgreSQL misconfiguration easy to diagnose — not to avoid using PostgreSQL.

### 6.4 Creating the `chatbot_builder` database (and automatic self-healing)

If PostgreSQL itself is reachable and your username/password are correct, but the specific database named in `DATABASE_URL` doesn't exist yet, you'll see a message like this instead of the generic connection-refused one:

```
======================================================================
 DATABASE CONNECTION FAILED
======================================================================
PostgreSQL is running and authentication succeeded, but the database
"chatbot_builder" does not exist yet on this server.

Create it with (uses the same credentials already in your .env):
  PGPASSWORD="<your DB password>" createdb -h localhost -p 5432 -U postgres chatbot_builder
Or in psql:
  psql -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE chatbot_builder;"

See README.md -> 'Creating the chatbot_builder database' for exact Windows/pgAdmin steps.
======================================================================
```

**In practice you should rarely see this anymore.** `python main.py` now detects this exact situation automatically and creates the database for you before it would otherwise fail — using only the host/port/username/password already present in your `.env`'s `DATABASE_URL` (never a hardcoded credential, and the password itself is never printed to the console). You'll see this in the logs instead:

```
[DB] Database 'chatbot_builder' does not exist yet. Creating it now using the credentials from .env ...
[DB] Created database 'chatbot_builder'.
[DB] Connection OK. Creating/verifying tables ...
```

This only ever creates the one database named in `DATABASE_URL` — it connects to PostgreSQL's own built-in `postgres` maintenance database to issue a single `CREATE DATABASE "chatbot_builder";` statement, and never drops, renames, or modifies any other database on the server (including `postgres`, `template0`, `template1`, or any other project's database that happens to share the same server).

If you'd rather create it yourself ahead of time (e.g. your `postgres` role isn't allowed to create databases, or your DBA wants to provision it manually), you have two options:

**Option A — Windows Command Line (`psql` / `createdb`)**

See **Step 4** in §6.2 above for the exact `psql -c "CREATE DATABASE chatbot_builder;"` command.

**Option B — Windows pgAdmin (GUI)**

See **Step 4 (Alternative)** in §6.2 above:
1. Open pgAdmin → expand **Servers → PostgreSQL `<version>`** (enter the `postgres` password if prompted).
2. Right-click **Databases** → **Create** → **Database...**
3. **Database** field: `chatbot_builder`. **Owner**: `postgres`. Click **Save**.
4. Then run `python main.py` as usual — it will find the database already exists and skip straight to creating/verifying tables.

Either way, the database name, host, port, username, and password always come from `DATABASE_URL` in `.env` — nothing about the database connection is ever hardcoded in the Python source.

---

## 7. Qdrant Setup (for RAG)

Any of these work:

**Option A — Docker (recommended):**
```bash
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

**Option B — local binary** (what this project's sandbox environment used):
```bash
# download the release for your platform from https://github.com/qdrant/qdrant/releases
QDRANT__STORAGE__STORAGE_PATH=./qdrant_storage/storage QDRANT__SERVICE__HTTP_PORT=6333 ./qdrant
```

**Option C — Qdrant Cloud:** set `QDRANT_URL` and `QDRANT_API_KEY` to your cluster's values.

Without Qdrant running, document uploads still succeed and are stored, but their status will show `failed` with a clear message, and RAG search will return no context (the bot still answers using the AI model alone).

---

## 8. Gemini Setup

1. Get a free API key at https://aistudio.google.com/apikey
2. Add it to `.env` as `GEMINI_API_KEY_1` (add `_2`, `_3` for extra fallback keys / higher quota)

## 9. Groq Setup

1. Get a free API key at https://console.groq.com/keys
2. Add it to `.env` as `GROQ_API_KEY_1` (add `_2`, `_3` similarly)

You can also add/manage additional provider keys at runtime from **Admin Panel → API Management** (stored encrypted in the database).

---

## 10. Email Setup (optional)

Set SMTP credentials to enable real verification/reset emails:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=you@gmail.com
```
Without these, new accounts are auto-verified so the app remains fully usable, and "Forgot Password" clearly tells the user email isn't configured instead of pretending to send anything.

---

## 11. Google OAuth Setup (optional)

1. Create OAuth credentials at https://console.cloud.google.com/apis/credentials
2. Set redirect URI to `http://localhost:8000/auth/google/callback` (adjust host/port for your deployment)
3. Add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to `.env`

The "Continue with Google" button only appears when these are set; the app works fully without it.

---

## 12. WhatsApp — User-Owned Integration

The platform does **not** provide a shared WhatsApp number. Each user connects **their own** WhatsApp Business (Meta Cloud API) credentials per bot from **Integrations → WhatsApp**:

- Access Token
- Phone Number ID
- Business Account ID
- Webhook Verify Token

Credentials are encrypted (Fernet) before being stored and are never redisplayed after saving. Users can **Test Connection**, view **status**, and **Disconnect** at any time. If nothing is configured, the rest of the platform is unaffected.

---

## 13. How to Run

```bash
python main.py
```

This will:
1. Create all database tables if they don't exist
2. Seed a default admin account and starter bot templates
3. Start the Flask server on `http://0.0.0.0:8000` (configurable via `HOST`/`PORT` in `.env`)

Visit `http://localhost:8000` in your browser.

---

## 14. How to Create/Access the Admin Account

An admin account is auto-seeded on first run using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults: `admin@aichatbotbuilder.local` / `Admin@12345` — **change this in `.env` before any real deployment**).

You can also (re)run seeding explicitly:
```bash
python main.py seed
```

To promote an existing user to admin, update their role directly in the database:
```sql
UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';
```

---

## 15. How to Test

Manual smoke test flow:
1. Sign up a normal user at `/signup`, confirm redirect to `/app/dashboard`
2. Create a bot from a template, open the **Bot Builder**, drag a few nodes, connect them, **Save**
3. Upload a `.txt`/`.pdf`/`.docx` file in **Knowledge Base** and confirm it reaches `ready` status (requires Qdrant running)
4. Open **Test Bot** and chat — with no AI keys configured you'll see the friendly fallback message (this is intentional, not a bug); add a Gemini/Groq key to `.env` and restart to see real AI answers
5. **Publish** the bot, then check **Deployments** for a real embed code and `/widget/<bot_id>` preview
6. Log in as the seeded admin at `/login`, confirm `/admin/dashboard` shows real counts and provider health

Automated checks live under `tests/` (extend with `pytest` as needed for CI).

---

## 16. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| App exits immediately with "PostgreSQL is not running or cannot be reached at host:port" | PostgreSQL isn't running or isn't listening on that host/port. Follow §6.2 (Windows) or §6.1 (Linux/macOS) to start it, then re-run `python main.py`. This is a deliberate, friendly pre-flight check — not a crash — and the app will not fall back to SQLite |
| App exits with "PostgreSQL is reachable ... but the connection was rejected" | The server is up, but the database doesn't exist yet, or the username/password in `DATABASE_URL` is wrong. See §6 step 4 to create the database, and double-check the credentials in `.env` |
| `curl http://localhost:8000/health/db` returns `status: "error"` | Same as above — read the `message` field it returns for the specific cause |
| AI messages always return "AI provider temporarily unavailable" | No Gemini/Groq keys configured (check `.env` or Admin → API Management), or all configured keys are invalid/rate-limited |
| Knowledge Base documents stuck on `failed` with a Qdrant message | Qdrant isn't running/reachable at `QDRANT_URL` |
| "Email service is not configured" on password reset | Set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` in `.env` |
| Google button missing on login | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` not set — this is expected/optional |
| WhatsApp "Test Connection" fails | Double check Access Token / Phone Number ID are correct and the token hasn't expired |
| 403 on `/admin/*` | The logged-in account's `role` isn't `admin` |

---

## 17. Security Notes

- Passwords are hashed with PBKDF2-SHA256 (Werkzeug), never stored in plain text
- Integration credentials (WhatsApp tokens, webhook secrets, generated API keys) are encrypted at rest with Fernet and never redisplayed after creation
- Admin-configured AI provider keys are masked in the UI and never returned in full after creation
- `.env` is git-ignored; `.env.example` only ever contains placeholders
- All mutating API routes require authentication; admin routes additionally require `role == admin`; bot-scoped routes verify ownership before any read/write
- System logs never contain full API keys or plaintext passwords

---

## 18. Notes on this Build

- The **AI Guide Assistant** (floating 🤖 button + dedicated page) is a separate, local, zero-API-cost NLP system (TF-IDF + cosine similarity over a curated Q&A set in `ml/guide_data.py`). It is intentionally decoupled from the main chatbot AI Router so it never consumes your Gemini/Groq quota.
- Local embeddings for RAG use a scikit-learn `HashingVectorizer`-based pipeline (`rag/embeddings.py`) rather than a large downloaded transformer model, keeping the app lightweight and fully offline-capable for the embedding step, while still producing genuine fixed-length vectors for real cosine-similarity search in Qdrant.
