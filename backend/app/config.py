from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment / .env file."""

    database_url: str = "sqlite:///./algorma.db"

    # Extra allowed CORS origin, for a deployed (non-localhost) frontend.
    # Any localhost port is already accepted via the regex in main.py, so
    # local dev works regardless of this value. The API port itself comes
    # from the uvicorn --port flag, not from settings.
    web_origin: str = "http://localhost:5199"

    # Feature flags. Flashcards ship enabled by default now; set
    # ENABLE_FLASHCARDS=false to hide the API surface.
    # Mirrors FEATURES.flashcards in frontend/src/features.js.
    enable_flashcards: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
