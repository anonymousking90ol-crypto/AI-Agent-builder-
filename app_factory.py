"""
Flask application factory for AI Chatbot Builder.
"""
import os
from flask import Flask, render_template, jsonify, request, current_app
from flask_login import current_user, login_user

from backend.config import Config
from backend.extensions import login_manager, cors
from database.db import db, migrate


def create_app(mode="full"):
    """
    Build a Flask app instance.

    `mode` controls which blueprints get registered (Part 10 -- genuinely
    separate Admin/User servers, run as two threads inside one
    `python main.py` process):

      - "full"  (default): every blueprint, on one app. Used by the test
                 suite and any single-process/dev-only invocation so
                 existing tests keep working unchanged.
      - "user":  the public site + logged-in user panel (auth, dashboard,
                 bot builder, KB, integrations, analytics, settings, ...).
                 Deliberately excludes the admin blueprints entirely -- the
                 admin UI/API simply does not exist on this app, it isn't
                 merely hidden.
      - "admin": ONLY auth (so an admin can log in directly on this port)
                 plus the admin panel pages and admin API. Every route here
                 still goes through @admin_required (see
                 auth/decorators.py) -- this port is never an auth bypass.

    Both "user" and "admin" apps share the same SQLAlchemy `db`, the same
    Flask-Login `login_manager`/user loader, and the same Config.SECRET_KEY,
    so a session cookie is valid on both ports (cookies are not port-scoped
    by browsers) -- an admin who is already logged in on the User server is
    also recognized as logged in when they open the Admin server, without
    re-entering credentials, while non-admins are still rejected by
    @admin_required on every admin route regardless of which port they use.
    """
    if mode not in ("full", "user", "admin"):
        raise ValueError(f"Invalid app mode: {mode!r}")

    app = Flask(
        __name__,
        template_folder=os.path.join(Config.BASE_DIR, "frontend", "templates"),
        static_folder=os.path.join(Config.BASE_DIR, "frontend", "static"),
    )
    app.config.from_object(Config)
    app.config["SERVER_MODE"] = mode

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(os.path.join(Config.BASE_DIR, "instance"), exist_ok=True)

    db.init_app(app)
    if mode in ("full", "user"):
        # Flask-Migrate only needs to be attached to one app instance --
        # attaching it to both would just register the same `flask db ...`
        # CLI commands twice against the same app.extensions dict.
        migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login_page"
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    from models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(user_id)

    # ---------------- Register blueprints ----------------
    from routers.auth_routes import auth_bp
    app.register_blueprint(auth_bp)

    if mode in ("full", "user"):
        from routers.user_pages import user_bp
        from routers.bot_api import bot_api
        from routers.kb_api import kb_api
        from routers.integration_api import integration_api
        from routers.public_api import public_api
        from routers.conversation_api import conversation_api
        from routers.analytics_api import analytics_api
        from routers.template_api import template_api
        from routers.guide_api import guide_api
        from routers.settings_api import settings_api
        from routers.wizard_api import wizard_api

        app.register_blueprint(user_bp)
        app.register_blueprint(bot_api)
        app.register_blueprint(kb_api)
        app.register_blueprint(integration_api)
        app.register_blueprint(public_api)
        app.register_blueprint(conversation_api)
        app.register_blueprint(analytics_api)
        app.register_blueprint(template_api)
        app.register_blueprint(guide_api)
        app.register_blueprint(settings_api)
        app.register_blueprint(wizard_api)

    if mode in ("full", "admin"):
        from routers.admin_pages import admin_bp
        from routers.admin_api import admin_api

        app.register_blueprint(admin_bp)
        app.register_blueprint(admin_api)

    has_admin = mode in ("full", "admin")
    has_user = mode in ("full", "user")

    if mode in ("full", "admin") and Config.DEV_AUTO_ADMIN_LOGIN:
        @app.before_request
        def _dev_auto_admin_login():
            """Local-development convenience ONLY (opt-in via .env
            DEV_AUTO_ADMIN_LOGIN=true, OFF by default -- see backend/config.py).
            If nobody is logged in yet on the Admin server, transparently log
            in as the .env ADMIN_EMAIL/ADMIN_PASSWORD account instead of
            bouncing to the login form -- avoids re-entering credentials on
            every restart while developing. Does NOT touch @admin_required's
            role check and does NOT override an already-authenticated session
            (e.g. a different admin who deliberately logged in), so it can
            never be used to escalate a non-admin session. Also hard-disabled
            whenever Flask's own TESTING flag is set -- the automated test
            suite deliberately exercises "unauthenticated request" scenarios
            against real HTTP routes, and this dev-only convenience must
            never silently defeat those checks even if a developer's local
            .env happens to have the flag on while running pytest."""
            if current_app.testing:
                return
            if current_user.is_authenticated:
                return
            from models import User
            admin_user = User.query.filter_by(email=Config.ADMIN_EMAIL).first()
            if admin_user and admin_user.is_admin() and not admin_user.is_blocked:
                login_user(admin_user)

    # ---------------- Root & health ----------------
    @app.get("/")
    def index():
        from flask import redirect, url_for, abort as _abort
        if current_user.is_authenticated:
            if current_user.is_admin() and has_admin:
                return redirect(url_for("admin.dashboard"))
            if has_user:
                return redirect(url_for("user.dashboard"))
            # Admin-only server ("admin" mode) reached by a non-admin who is
            # already logged in elsewhere -- reject, never silently expose
            # anything or bounce them into a panel that doesn't exist here.
            _abort(403)
        return redirect(url_for("auth.login_page"))

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "app": "AI Chatbot Builder"})

    @app.get("/health/db")
    def health_db():
        """Live database connectivity check -- safe to call anytime,
        never exposes credentials, only whether PostgreSQL is reachable."""
        from database.health import check_database_connection
        check = check_database_connection(Config.SQLALCHEMY_DATABASE_URI)
        d = check["details"]
        payload = {
            "status": "ok" if check["ok"] else "error",
            "engine": check["engine"],
            "host": d["host"],
            "port": d["port"],
            "database": d["database"],
        }
        if not check["ok"]:
            payload["error"] = check["error"]
            payload["port_reachable"] = check["port_reachable"]
            payload["message"] = (
                f"PostgreSQL is not running or cannot be reached at {d['host']}:{d['port']}. "
                "Start PostgreSQL and verify DATABASE_URL in .env."
                if check["port_reachable"] is False else
                "PostgreSQL is reachable but rejected the connection. Check the database name, "
                "username and password in DATABASE_URL."
            )
        return jsonify(payload), (200 if check["ok"] else 503)

    # ---------------- Error handlers ----------------
    @app.errorhandler(401)
    def unauthorized(e):
        """Fixes the confusing raw Werkzeug "401 Unauthorized" page that
        used to render for any not-logged-in visit to an @admin_required or
        @login_required page (e.g. GET /admin). There is no HTTP Basic Auth
        anywhere in this app -- Werkzeug's default 401 handler just happens
        to look like a browser Basic Auth prompt. A page visit now redirects
        to the normal login screen (same UX as the rest of the app); an API
        call still gets a clean JSON 401."""
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Authentication required"}), 401
        from flask import redirect, url_for
        return redirect(url_for("auth.login_page"))

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Not found"}), 404
        return render_template("errors/404.html"), 404

    @app.errorhandler(403)
    def forbidden(e):
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Forbidden"}), 403
        return render_template("errors/403.html"), 403

    @app.errorhandler(500)
    def server_error(e):
        if request.path.startswith("/api/"):
            return jsonify({"success": False, "error": "Internal server error. Please try again."}), 500
        return render_template("errors/500.html"), 500

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"success": False, "error": "File too large."}), 413

    return app
