from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, desc
from typing import List, Optional
from datetime import datetime
import email
from email import policy
import html
from app.core.database import get_db
from app.core.security import verify_session_token
from app.core.config import settings
from app.models.entities import GmailMessage, DriveFile
from app.storage.provider import LocalFilesystemStorageProvider

router = APIRouter(prefix="/api/search", tags=["Search"], dependencies=[Depends(verify_session_token)])

storage = LocalFilesystemStorageProvider(settings.DEFAULT_BACKUP_DIR)

@router.get("/gmail")
async def search_gmail(
    query: Optional[str] = Query(None),
    account_id: Optional[str] = None,
    folder_type: Optional[str] = None, # 'all', 'inbox', 'sent'
    has_attachments_only: bool = False,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(GmailMessage).order_by(desc(GmailMessage.internal_date))
    if account_id:
        stmt = stmt.where(GmailMessage.account_id == account_id)
    if folder_type == "inbox":
        stmt = stmt.where(GmailMessage.labels.ilike("%INBOX%"))
    elif folder_type == "sent":
        stmt = stmt.where(GmailMessage.labels.ilike("%SENT%"))
    if has_attachments_only:
        stmt = stmt.where(GmailMessage.has_attachments == True)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            stmt = stmt.where(GmailMessage.internal_date >= start_dt)
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            # If date only (YYYY-MM-DD), expand to end of that day 23:59:59
            if len(end_date) == 10:
                end_dt = datetime.fromisoformat(f"{end_date}T23:59:59+00:00")
            stmt = stmt.where(GmailMessage.internal_date <= end_dt)
        except Exception:
            pass
        
    if query and query.strip():
        search_pattern = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                GmailMessage.subject.ilike(search_pattern),
                GmailMessage.sender.ilike(search_pattern),
                GmailMessage.recipients.ilike(search_pattern)
            )
        )

    stmt = stmt.limit(limit)
    results = (await db.execute(stmt)).scalars().all()
    return results

@router.get("/gmail/{message_id}/view")
async def view_gmail_message(
    message_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(GmailMessage).where(GmailMessage.id == message_id)
    msg = (await db.execute(stmt)).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Email message not found in database")

    if not await storage.exists(msg.storage_path):
        raise HTTPException(status_code=404, detail="Email file not found on local storage disk")

    eml_bytes = await storage.read(msg.storage_path)
    parsed_msg = email.message_from_bytes(eml_bytes, policy=policy.default)

    # Extract text and html body
    body_text = ""
    body_html = ""
    attachments = []

    if parsed_msg.is_multipart():
        for part in parsed_msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))

            if "attachment" in disposition.lower():
                attachments.append({
                    "filename": part.get_filename() or "attachment",
                    "content_type": content_type,
                    "size": len(part.get_payload(decode=True) or b"")
                })
            elif content_type == "text/plain" and not body_text:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    body_text = payload.decode(charset, errors="replace")
            elif content_type == "text/html" and not body_html:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    body_html = payload.decode(charset, errors="replace")
    else:
        content_type = parsed_msg.get_content_type()
        payload = parsed_msg.get_payload(decode=True)
        if payload:
            charset = parsed_msg.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if content_type == "text/html":
                body_html = decoded
            else:
                body_text = decoded

    return {
        "id": msg.id,
        "account_id": msg.account_id,
        "subject": msg.subject or parsed_msg.get("Subject", "(No Subject)"),
        "sender": msg.sender or parsed_msg.get("From", ""),
        "recipients": msg.recipients or parsed_msg.get("To", ""),
        "cc": parsed_msg.get("Cc", ""),
        "date": msg.internal_date.isoformat() if msg.internal_date else str(parsed_msg.get("Date", "")),
        "body_html": body_html,
        "body_text": body_text,
        "attachments": attachments,
        "storage_path": msg.storage_path,
        "size_bytes": msg.size_bytes
    }

@router.get("/gmail/{message_id}/raw")
async def download_raw_eml(
    message_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(GmailMessage).where(GmailMessage.id == message_id)
    msg = (await db.execute(stmt)).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Email message not found")

    if not await storage.exists(msg.storage_path):
        raise HTTPException(status_code=404, detail="Email file not found on disk")

    eml_bytes = await storage.read(msg.storage_path)
    clean_filename = f"{msg.id}.eml"
    return Response(
        content=eml_bytes,
        media_type="message/rfc822",
        headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
    )

@router.get("/drive/tree")
async def get_drive_tree(
    account_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(DriveFile).order_by(DriveFile.is_folder.desc(), DriveFile.name.asc())
    if account_id:
        stmt = stmt.where(DriveFile.account_id == account_id)
        
    files = (await db.execute(stmt)).scalars().all()
    
    # Return flat list with parent-child structure so client can render tree or folder navigation
    return [
        {
            "id": f.id,
            "account_id": f.account_id,
            "name": f.name,
            "mime_type": f.mime_type,
            "parent_id": f.parent_id,
            "is_folder": f.is_folder,
            "is_workspace_native": f.is_workspace_native,
            "export_format": f.export_format,
            "storage_path": f.storage_path,
            "size_bytes": f.size_bytes,
            "owner_email": f.owner_email,
            "owner_name": f.owner_name,
            "is_shared": f.is_shared,
            "drive_id": f.drive_id,
            "created_at": f.created_at.isoformat() if f.created_at else None
        }
        for f in files
    ]

@router.get("/drive/{file_id}/download")
async def download_drive_file(
    file_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(DriveFile).where(DriveFile.id == file_id)
    file_record = (await db.execute(stmt)).scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="Drive file record not found")

    if not file_record.storage_path or not await storage.exists(file_record.storage_path):
        raise HTTPException(status_code=404, detail="File content not found on local disk")

    data_bytes = await storage.read(file_record.storage_path)
    clean_filename = file_record.name
    if file_record.export_format and not clean_filename.endswith(f".{file_record.export_format}"):
        clean_filename += f".{file_record.export_format}"

    return Response(
        content=data_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{clean_filename}"'}
    )

