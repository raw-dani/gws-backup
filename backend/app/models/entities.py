from datetime import datetime, timezone
import uuid
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, DateTime, Integer, Text, ForeignKey, BigInteger, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # OAuth details
    auth_mode: Mapped[str] = mapped_column(String(32), default="official") # 'official' or 'byoc'
    client_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Refresh tokens and keys are never stored here in plaintext; stored in OS Keyring with key account_{id}
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_authenticated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    backup_profiles: Mapped[List["BackupProfile"]] = relationship("BackupProfile", back_populates="account", cascade="all, delete-orphan")
    jobs: Mapped[List["BackupJob"]] = relationship("BackupJob", back_populates="account")

class BackupProfile(Base):
    __tablename__ = "backup_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    
    # Feature toggles
    backup_gmail: Mapped[bool] = mapped_column(Boolean, default=True)
    backup_drive: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Schedule interval: e.g. '5m', '15m', '30m', '1h', 'daily', 'manual'
    schedule_interval: Mapped[str] = mapped_column(String(32), default="daily")
    
    # Storage and encryption options
    storage_location_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("storage_locations.id"), nullable=True)
    encryption_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Power and network awareness
    pause_on_battery: Mapped[bool] = mapped_column(Boolean, default=True)
    pause_on_metered: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    account: Mapped["Account"] = relationship("Account", back_populates="backup_profiles")
    storage_location: Mapped[Optional["StorageLocation"]] = relationship("StorageLocation")

class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(32), default="local") # 'local', 's3', 'nas'
    config_json: Mapped[str] = mapped_column(Text, default="{}") # Path, bucket, endpoint, etc.
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

class BackupJob(Base):
    __tablename__ = "backup_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    service: Mapped[str] = mapped_column(String(32), nullable=False) # 'gmail' or 'drive'
    job_type: Mapped[str] = mapped_column(String(32), default="incremental") # 'initial' or 'incremental'
    
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True) # pending, running, paused, retrying, completed, failed, cancelled
    items_total: Mapped[int] = mapped_column(Integer, default=0)
    items_processed: Mapped[int] = mapped_column(Integer, default=0)
    bytes_processed: Mapped[int] = mapped_column(BigInteger, default=0)
    
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    account: Mapped["Account"] = relationship("Account", back_populates="jobs")

class GmailMessage(Base):
    __tablename__ = "gmail_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True) # Google Message ID
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    
    sender: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    recipients: Mapped[str] = mapped_column(Text, nullable=False, default="") # JSON list or comma separated
    subject: Mapped[str] = mapped_column(Text, nullable=False, default="")
    internal_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    labels: Mapped[str] = mapped_column(Text, default="[]") # JSON list of labels
    
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False) # EML file relative path
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    is_source_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class DriveFile(Base):
    __tablename__ = "drive_files"

    id: Mapped[str] = mapped_column(String(128), primary_key=True) # Google Drive File ID
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    
    # Ownership & Sharing metadata
    owner_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    owner_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    drive_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True) # Shared Drive ID if applicable
    
    is_folder: Mapped[bool] = mapped_column(Boolean, default=False)
    is_workspace_native: Mapped[bool] = mapped_column(Boolean, default=False)
    export_format: Mapped[Optional[str]] = mapped_column(String(32), nullable=True) # e.g. 'docx', 'xlsx'
    
    storage_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    modified_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_source_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

class SyncCheckpoint(Base):
    __tablename__ = "sync_checkpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    service: Mapped[str] = mapped_column(String(32), nullable=False) # 'gmail' or 'drive'
    
    checkpoint_value: Mapped[str] = mapped_column(String(255), nullable=False) # Gmail historyId or Drive pageToken
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

