#!/usr/bin/env python3
"""
=========================================================================
 AI CHATBOT BUILDER — Main Entry Point
=========================================================================
Run with:
    python main.py

This single command starts BOTH the User server and the genuinely separate
Admin server (Part 10) -- as two Flask app instances, each running in its
own background thread inside this one process. There is no second script
to run; `python main.py` alone is the full application.

Optional CLI commands:
    python main.py createadmin      Create/verify the default admin account
    python main.py seed             Re-run database seeding (templates, admin)
"""
import sys
import os
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app_factory import create_app
from backend.config import Config
from database.db import db
from database.health import (
    ensure_database_reachable, DatabaseConnectionError,
    check_database_connection, create_database_if_missing, parse_database_url,
)


def init_database(app):
    d = parse_database_url(Config.SQLALCHEMY_DATABASE_URI)
    print(f"[DB] Connecting to PostgreSQL at {d['host']}:{d['port']}/{d['database']} as '{d['username']}' ...")

    check = check_database_connection(Config.SQLALCHEMY_DATABASE_URI)

    if not check["ok"] and check.get("missing_database"):
        # PostgreSQL is up and the credentials from .env are valid -- the
        # ONLY thing missing is the target database itself. Create it using
        # those SAME .env credentials (via Postgres's built-in `postgres`
        # maintenance database) rather than failing outright. This never
        # touches or drops any other existing database.
        print(f"[DB] Database '{d['database']}' does not exist yet. Creating it now using the "
              f"credentials from .env ...")
        result = create_database_if_missing(Config.SQLALCHEMY_DATABASE_URI)
        if result["created"]:
            print(f"[DB] Created database '{d['database']}'.")
        elif not result["already_existed"]:
            print(f"\n{'=' * 70}\n DATABASE CONNECTION FAILED\n{'=' * 70}", file=sys.stderr)
            print(f"Could not automatically create database '{d['database']}': {result['error']}", file=sys.stderr)
            print(f"Create it manually -- see README.md -> 'Creating the {d['database']} database'.",
                  file=sys.stderr)
            print("=" * 70, file=sys.stderr)
            sys.exit(1)

    # Fail fast with a clear, actionable message if PostgreSQL is still not
    # reachable at this point (server down, wrong password, etc.), instead
    # of letting db.create_all() blow up with a raw psycopg2/SQLAlchemy
    # traceback. This does NOT fall back to SQLite -- it only changes how a
    # real connection failure is reported.
    try:
        ensure_database_reachable(Config.SQLALCHEMY_DATABASE_URI)
    except DatabaseConnectionError as e:
        print(f"\n{e}\n", file=sys.stderr)
        sys.exit(1)

    print("[DB] Connection OK. Creating/verifying tables ...")
    with app.app_context():
        db.create_all()
        from database.migrations import run_additive_migrations
        run_additive_migrations(app)
        from database.seed import run_seed
        run_seed()


def _display_host(host):
    return host if host not in ("0.0.0.0", "", None) else "127.0.0.1"


def _run_app(app, host, port, name):
    """Target for each server's background thread. `use_reloader=False` is
    required -- the Werkzeug reloader forks/re-execs the process, which
    would try to bind both ports twice from two independent processes."""
    try:
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    except Exception as e:
        print(f"\n[{name}] Server crashed: {e}\n", file=sys.stderr)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "createadmin":
        app = create_app(mode="full")
        init_database(app)
        print("Admin account ready.")
        return

    if len(sys.argv) > 1 and sys.argv[1] == "seed":
        app = create_app(mode="full")
        init_database(app)
        print("Database seeded.")
        return

    # Build the two independent Flask app instances (Part 10). Each has its
    # own blueprint set -- the Admin app literally does not have the user
    # panel routes registered, and vice versa -- so there is no dependency
    # between them at the routing level, only the shared PostgreSQL database
    # and shared SECRET_KEY (so a session cookie set by one is valid on the
    # other; @admin_required still re-checks the role on every request no
    # matter which port it arrived on -- Part 14).
    user_app = create_app(mode="user")
    admin_app = create_app(mode="admin")

    # Schema/seed only needs to run once, against either app's context --
    # they share the same `db` engine/metadata.
    init_database(user_app)

    user_host_display = _display_host(Config.HOST)
    admin_host_display = _display_host(Config.ADMIN_HOST)
    user_base_url = f"http://{user_host_display}:{Config.PORT}"
    admin_base_url = f"http://{admin_host_display}:{Config.ADMIN_PORT}"

    user_registered = {rule.rule for rule in user_app.url_map.iter_rules()}
    has_health_route = "/health" in user_registered

    # Direct link to the logged-in dashboard route itself (routers/user_pages.py
    # registers it at /app/dashboard under the "user" blueprint's url_prefix).
    # Printed as a bare, full "http://host:port/path" on its own line -- both
    # VS Code's integrated terminal and most other terminal emulators
    # auto-detect and hyperlink any plain URL that appears in that shape, so
    # these are clickable with no extra formatting needed.
    user_dashboard_url = f"{user_base_url}/app/dashboard"
    admin_panel_url = f"{admin_base_url}/admin"

    print("=" * 70)
    print(" AI CHATBOT BUILDER")
    print("=" * 70)
    print()
    print("[\u2713] PostgreSQL connected")
    print("[\u2713] Database initialized")
    print("[\u2713] Application started successfully")
    print()
    print("USER SERVER:")
    print(f"  {user_base_url}")
    print()
    print("ADMIN SERVER:")
    print(f"  {admin_base_url}")
    print()
    print("USER PANEL:")
    print(f"  {user_dashboard_url}")
    print("  (redirects to /login first if you aren't signed in yet)")
    print()
    print("ADMIN PANEL:")
    print(f"  {admin_panel_url}")
    print(f"  (Admin login: {Config.ADMIN_EMAIL} / see .env ADMIN_PASSWORD — protected by role-based access, "
          f"enforced independently of which server/port is used)")
    if has_health_route:
        print()
        print("HEALTH:")
        print(f"  {user_base_url}/health")
    print()
    _d = parse_database_url(Config.SQLALCHEMY_DATABASE_URI)
    print(f" Database:       PostgreSQL ({_d['host']}:{_d['port']}/{_d['database']}) — connected")
    print(f" Gemini keys:    {len(Config.GEMINI_API_KEYS)} configured")
    print(f" Groq keys:      {len(Config.GROQ_API_KEYS)} configured")
    print(f" Qdrant:         {Config.QDRANT_URL}")
    print(f" Email:          {'configured' if Config.email_configured() else 'NOT configured (dev mode)'}")
    print(f" Google OAuth:   {'configured' if Config.google_oauth_configured() else 'not configured (optional)'}")
    print(f" WhatsApp (plat):{'configured' if Config.twilio_configured() else ' not configured (optional, user-owned per-bot)'}")
    print("=" * 70)

    # Run the Admin server in a background thread and the User server on the
    # main thread (so Ctrl+C / process signals behave normally and a crash
    # in either is visible immediately rather than silently swallowed).
    admin_thread = threading.Thread(
        target=_run_app, args=(admin_app, Config.ADMIN_HOST, Config.ADMIN_PORT, "ADMIN"),
        name="admin-server", daemon=True,
    )
    admin_thread.start()

    _run_app(user_app, Config.HOST, Config.PORT, "USER")


if __name__ == "__main__":
    main()
