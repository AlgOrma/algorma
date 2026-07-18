from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment / .env file."""

    database_url: str = "sqlite:///./algorma.db"

    # Extra allowed CORS origin, for a deployed (non-localhost) frontend.
    # Any localhost port is already accepted via the regex in main.py, so
    # local dev works regardless of this value. The API port itself comes
    # from the uvicorn --port flag, not from settings.
    web_origin: str = "http://localhost:5199"

    # Feature flags. Flashcards aren't implemented in the UI yet, so the API
    # surface stays off by default (set ENABLE_FLASHCARDS=true to expose it).
    # Mirrors FEATURES.flashcards in frontend/src/features.js.
    enable_flashcards: bool = False

    # --- Authentication (AUTH_DESIGN.md) ---
    # Set true on any HTTPS deployment so the session cookie is Secure.
    cookie_secure: bool = False
    # Server-side sliding session lifetime; also the "remember me" cookie age.
    session_ttl_days: int = 30
    # false → /api/auth/register (and OAuth signups) return an error, turning
    # the instance invite-only. Existing accounts keep working.
    allow_registration: bool = True
    # Where OAuth round-trips land back (also the ?error= redirect target).
    frontend_url: str = "http://localhost:5199"
    # Signs the short-lived OAuth handshake cookie (Authlib state/PKCE).
    # Unset → a fresh secret per process: fine for email/password-only, but
    # set it explicitly when OAuth runs with more than one worker.
    session_secret: str = ""
    # An OAuth provider's SSO button appears iff both of its values are set.
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
