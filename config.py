"""
Central configuration loader for AI Chatbot Builder.
All secrets/config come from environment variables (.env).
"""
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _get_list(*keys):
    vals = []
    for k in keys:
        v = os.getenv(k, "").strip()
        if v:
            vals.append(v)
    return vals


class Config:
    BASE_DIR = BASE_DIR
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
    JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-me")
    FERNET_KEY = os.getenv("FERNET_KEY", "")

    # PostgreSQL only. If DATABASE_URL is missing from .env we still default
    # to a local PostgreSQL connection string (NOT SQLite) so a misconfigured
    # .env fails with a clear "PostgreSQL unreachable" message from
    # database/health.py instead of silently running on a different engine.
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/chatbot_builder",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # pool_pre_ping: SQLAlchemy pings the connection before reuse and
    # transparently reconnects if PostgreSQL restarted -- keeps long-running
    # `python main.py` sessions resilient to a brief DB restart.
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25 MB max upload

    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8000"))
    BASE_URL = os.getenv("BASE_URL", f"http://localhost:{PORT}")

    # Separate Admin server (Part 10). Runs as its own Flask app instance in
    # its own background thread inside the SAME `python main.py` process --
    # not a second script/command. Every admin page/endpoint on this port is
    # still gated by @admin_required (see auth/decorators.py); this port is
    # never an authentication bypass (Part 14).
    ADMIN_HOST = os.getenv("ADMIN_HOST", "0.0.0.0")
    ADMIN_PORT = int(os.getenv("ADMIN_PORT", "7000"))
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = FLASK_ENV != "production"

    # ---- AI Providers ----
    GEMINI_API_KEYS = _get_list("GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3")
    GROQ_API_KEYS = _get_list("GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3")

    # ---- Qdrant ----
    QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")

    # ---- Email ----
    EMAIL_API_KEY = os.getenv("EMAIL_API_KEY", "")
    EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@aichatbotbuilder.local")
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

    # ---- Google OAuth (optional) ----
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # ---- Twilio (optional / platform fallback) ----
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")

    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@aichatbotbuilder.local")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@12345")

    # Local-development convenience ONLY. When explicitly enabled in .env,
    # any unauthenticated visit to the Admin server auto-logs-in as the
    # ADMIN_EMAIL/ADMIN_PASSWORD account above instead of redirecting to the
    # login form -- purely to avoid re-entering credentials while developing.
    # OFF by default; must never be enabled in production. This never
    # bypasses @admin_required's role check -- it only fills in "who is the
    # current user", the same admin account you'd otherwise log in as by
    # hand, and only kicks in for a session that isn't already authenticated
    # as someone else.
    DEV_AUTO_ADMIN_LOGIN = os.getenv("DEV_AUTO_ADMIN_LOGIN", "false").strip().lower() in ("1", "true", "yes")

    @classmethod
    def email_configured(cls):
        return bool(cls.SMTP_HOST and cls.SMTP_USER and cls.SMTP_PASSWORD) or bool(cls.EMAIL_API_KEY)

    @classmethod
    def google_oauth_configured(cls):
        return bool(cls.GOOGLE_CLIENT_ID and cls.GOOGLE_CLIENT_SECRET)

    @classmethod
    def qdrant_configured(cls):
        return bool(cls.QDRANT_URL)

    @classmethod
    def gemini_configured(cls):
        return len(cls.GEMINI_API_KEYS) > 0

    @classmethod
    def groq_configured(cls):
        return len(cls.GROQ_API_KEYS) > 0

    @classmethod
    def twilio_configured(cls):
        return bool(cls.TWILIO_ACCOUNT_SID and cls.TWILIO_AUTH_TOKEN and cls.TWILIO_WHATSAPP_FROM)
