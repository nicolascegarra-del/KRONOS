import json
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/fichajes"

    # JWT
    SECRET_KEY: str = "change-me-in-production-very-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — accepts JSON array OR comma-separated string
    # e.g. CORS_ORIGINS=https://kronos.klyp.es
    # e.g. CORS_ORIGINS=https://kronos.klyp.es,https://admin.kronos.klyp.es
    # e.g. CORS_ORIGINS=["https://kronos.klyp.es"]
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # App
    APP_ENV: str = "development"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [o.strip() for o in v.split(",") if o.strip()]
        return v  # type: ignore[return-value]


@lru_cache
def get_settings() -> Settings:
    return Settings()
