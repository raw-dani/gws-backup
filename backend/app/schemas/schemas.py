from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class AccountBase(BaseModel):
    email: EmailStr
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    auth_mode: str = "official" # 'official' or 'byoc'
    client_id: Optional[str] = None

class AccountCreate(AccountBase):
    client_secret: Optional[str] = None
    auth_code: Optional[str] = None
    redirect_uri: Optional[str] = None
    code_verifier: Optional[str] = None

class AccountResponse(AccountBase):
    id: str
    is_active: bool
    last_authenticated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class BackupProfileUpdate(BaseModel):
    backup_gmail: Optional[bool] = None
    backup_drive: Optional[bool] = None
    schedule_interval: Optional[str] = None
    encryption_enabled: Optional[bool] = None
    pause_on_battery: Optional[bool] = None
    pause_on_metered: Optional[bool] = None

class BackupJobResponse(BaseModel):
    id: str
    account_id: str
    service: str
    job_type: str
    status: str
    items_total: int
    items_processed: int
    bytes_processed: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True

class OAuthUrlResponse(BaseModel):
    authorization_url: str
    state: str
    code_verifier: str

class SystemHealthResponse(BaseModel):
    status: str
    version: str
    database_ok: bool
    active_jobs: int
    storage_dir: str

