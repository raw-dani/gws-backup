import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Google Workspace Backup"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    
    # Security & API Handshake
    SESSION_TOKEN: str = ""
    API_PORT: int = 8000
    API_HOST: str = "127.0.0.1"
    
    # Default OAuth Client Configuration (can be overridden via ENV or BYOC UI)
    DEFAULT_GOOGLE_CLIENT_ID: str = ""
    DEFAULT_GOOGLE_CLIENT_SECRET: str = ""
    
    # Storage and Database paths
    APP_DATA_DIR: Path = Path.home() / ".google_workspace_backup"
    
    @property
    def DATABASE_URL(self) -> str:
        db_path = self.APP_DATA_DIR / "app.db"
        return f"sqlite+aiosqlite:///{db_path}"

    @property
    def DEFAULT_BACKUP_DIR(self) -> Path:
        return self.APP_DATA_DIR / "backups"

    model_config = SettingsConfigDict(
        env_prefix="GWB_",
        case_sensitive=False
    )

settings = Settings()
settings.APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.DEFAULT_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
