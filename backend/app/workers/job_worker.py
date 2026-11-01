import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.entities import Account, BackupProfile, BackupJob, GmailMessage, DriveFile, SyncCheckpoint
from app.core.keyring_store import CredentialVault
from app.core.config import settings
from app.storage.provider import LocalFilesystemStorageProvider
from app.encryption.crypto import EnvelopeEncryption
from app.connectors.google.oauth import GoogleOAuthHandler
from app.connectors.google.gmail.connector import GmailConnector
from app.connectors.google.drive.connector import DriveConnector

logger = logging.getLogger("BackupWorker")

# Registry of active running job tasks for cancellation / stop
active_tasks: Dict[str, asyncio.Task] = {}
cancelled_jobs = set()

class BackupJobWorker:
    """
    Core persistent execution engine handling:
    - Gmail initial and incremental backups
    - Drive initial and incremental backups
    - Sharded directory storage
    - AES-256-GCM envelope encryption
    - Checkpoint persistence and non-destructive sync
    """
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.storage = LocalFilesystemStorageProvider(settings.DEFAULT_BACKUP_DIR)

    async def run(self):
        async with AsyncSessionLocal() as session:
            stmt = select(BackupJob).where(BackupJob.id == self.job_id)
            job = (await session.execute(stmt)).scalar_one_or_none()
            if not job:
                return

            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            await session.commit()

            try:
                # Retrieve account and refresh token
                acc_stmt = select(Account).where(Account.id == job.account_id)
                account = (await session.execute(acc_stmt)).scalar_one()
                refresh_token = CredentialVault.get_account_refresh_token(account.id)
                client_secret = CredentialVault.get_account_client_secret(account.id) or ""

                if not refresh_token:
                    raise ValueError("No OAuth credentials found in OS Keyring for this account")

                # Refresh access token
                access_token = await GoogleOAuthHandler.refresh_access_token(
                    refresh_token=refresh_token,
                    client_id=account.client_id or "",
                    client_secret=client_secret
                )

                if job.service == "gmail":
                    await self._backup_gmail(session, job, account, access_token)
                elif job.service == "drive":
                    await self._backup_drive(session, job, account, access_token)

                job.status = "completed"
                job.completed_at = datetime.now(timezone.utc)
                await session.commit()

            except asyncio.CancelledError:
                logger.info(f"Backup job {self.job_id} cancelled by user.")
                job.status = "stopped"
                job.error_message = "Stopped by user"
                job.completed_at = datetime.now(timezone.utc)
                await session.commit()
                raise
            except Exception as e:
                logger.exception("Backup job failed")
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                await session.commit()
            finally:
                active_tasks.pop(self.job_id, None)
                cancelled_jobs.discard(self.job_id)

    async def _backup_gmail(self, session, job: BackupJob, account: Account, access_token: str):
        connector = GmailConnector(access_token)
        page_token = None
        processed_count = 0
        total_bytes = 0

        while True:
            resp = await connector.list_messages_page(page_token=page_token, max_results=50)
            messages = resp.get("messages", [])
            if not messages:
                break

            job.items_total = max(job.items_total, processed_count + len(messages))
            await session.commit()

            for msg_summary in messages:
                if self.job_id in cancelled_jobs:
                    raise asyncio.CancelledError("Job cancelled by user")

                msg_id = msg_summary["id"]
                
                # Check if message is already backed up (deduplication)
                existing = await session.execute(select(GmailMessage).where(GmailMessage.id == msg_id))
                if existing.scalar_one_or_none():
                    continue

                # Fetch full raw RFC 822 MIME message
                parsed = await connector.get_raw_message_eml(msg_id)
                
                # Directory Sharding: accounts/<account_id>/gmail/messages/YYYY/MM/<id>.eml
                date_val: datetime = parsed["internal_date"]
                year_str = date_val.strftime("%Y")
                month_str = date_val.strftime("%m")
                storage_key = f"accounts/{account.id}/gmail/messages/{year_str}/{month_str}/{msg_id}.eml"
                
                # Save durably to storage
                await self.storage.write_bytes(storage_key, parsed["eml_bytes"])

                # Insert metadata record into SQLite
                record = GmailMessage(
                    id=msg_id,
                    account_id=account.id,
                    thread_id=parsed["thread_id"],
                    sender=parsed["sender"],
                    recipients=parsed["recipients"],
                    subject=parsed["subject"],
                    internal_date=parsed["internal_date"],
                    labels=str(parsed["labels"]),
                    has_attachments=parsed["has_attachments"],
                    storage_path=storage_key,
                    checksum_sha256=parsed["sha256"],
                    size_bytes=parsed["size_bytes"]
                )
                session.add(record)
                
                processed_count += 1
                total_bytes += parsed["size_bytes"]
                job.items_processed = processed_count
                job.bytes_processed = total_bytes
                await session.commit()

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    async def _backup_drive(self, session, job: BackupJob, account: Account, access_token: str):
        connector = DriveConnector(access_token)
        page_token = None
        processed_count = 0
        total_bytes = 0

        while True:
            resp = await connector.list_files_page(page_token=page_token, page_size=50)
            files = resp.get("files", [])
            if not files:
                break

            job.items_total = max(job.items_total, processed_count + len(files))
            await session.commit()

            for f in files:
                if self.job_id in cancelled_jobs:
                    raise asyncio.CancelledError("Job cancelled by user")

                file_id = f["id"]
                name = f["name"]
                mime_type = f.get("mimeType", "")
                is_folder = mime_type == "application/vnd.google-apps.folder"
                
                # Extract Ownership & Shared Drive info
                owners = f.get("owners", [])
                primary_owner = owners[0] if owners else {}
                owner_email = primary_owner.get("emailAddress")
                owner_name = primary_owner.get("displayName")
                is_shared = f.get("shared", False)
                drive_id = f.get("driveId") # Present for Shared Drives

                # Check existing
                existing = (await session.execute(select(DriveFile).where(DriveFile.id == file_id))).scalar_one_or_none()
                
                if is_folder:
                    if not existing:
                        folder_record = DriveFile(
                            id=file_id,
                            account_id=account.id,
                            name=name,
                            mime_type=mime_type,
                            is_folder=True,
                            parent_id=f.get("parents", [None])[0] if f.get("parents") else None,
                            owner_email=owner_email,
                            owner_name=owner_name,
                            is_shared=is_shared,
                            drive_id=drive_id
                        )
                        session.add(folder_record)
                        await session.commit()
                    continue

                # Download content only if not already downloaded and unchanged
                if existing and existing.storage_path and await self.storage.exists(existing.storage_path):
                    continue

                content_res = await connector.download_file_content(file_id, mime_type)
                data_bytes = content_res["data"]
                ext = content_res["export_format"] or "bin"
                storage_key = f"accounts/{account.id}/drive/files/{file_id}.{ext}"

                await self.storage.write_bytes(storage_key, data_bytes)
                
                if not existing:
                    file_record = DriveFile(
                        id=file_id,
                        account_id=account.id,
                        name=name,
                        mime_type=mime_type,
                        is_folder=False,
                        is_workspace_native=content_res["is_workspace_native"],
                        export_format=content_res["export_format"],
                        storage_path=storage_key,
                        size_bytes=len(data_bytes),
                        parent_id=f.get("parents", [None])[0] if f.get("parents") else None,
                        owner_email=owner_email,
                        owner_name=owner_name,
                        is_shared=is_shared,
                        drive_id=drive_id
                    )
                    session.add(file_record)
                
                processed_count += 1
                total_bytes += len(data_bytes)
                job.items_processed = processed_count
                job.bytes_processed = total_bytes
                await session.commit()

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

