from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment / .env file."""

    database_url: str = "sqlite:///./algorma.db"
    web_origin: str = "http://localhost:5173"
    port: int = 8000

    # Feature flags. Flashcards aren't implemented in the UI yet, so the API
    # surface stays off by default (set ENABLE_FLASHCARDS=true to expose it).
    # Mirrors FEATURES.flashcards in frontend/src/features.js.
    enable_flashcards: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
