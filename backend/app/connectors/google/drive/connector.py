import io
import asyncio
import random
from typing import Dict, Any, Optional
from aiolimiter import AsyncLimiter
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

WORKSPACE_EXPORT_FORMATS = {
    "application/vnd.google-apps.document": {
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ext": "docx"
    },
    "application/vnd.google-apps.spreadsheet": {
        "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ext": "xlsx"
    },
    "application/vnd.google-apps.presentation": {
        "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "ext": "pptx"
    }
}

class DriveConnector:
    """
    Google Drive API Connector compliant with Google's Quota policies:
    - Conservative Rate Limiting: 12 req/sec
    - Truncated Exponential Backoff with Jitter for 429/403 rate limits
    - Chunked resumable media download (5MB buffers)
    - Auto-export for Google Workspace native docs
    """
    def __init__(self, access_token: str):
        self.rate_limiter = AsyncLimiter(max_rate=12, time_period=1.0)
        self.creds = Credentials(token=access_token)
        self.service = build("drive", "v3", credentials=self.creds, cache_discovery=False)

    async def _execute_with_backoff(self, request_fn, max_retries: int = 7):
        for attempt in range(max_retries):
            async with self.rate_limiter:
                try:
                    return await asyncio.to_thread(request_fn.execute)
                except HttpError as err:
                    status = err.resp.status
                    reason = err.error_details[0].get("reason", "") if err.error_details else ""
                    if status in (429, 500, 503) or (status == 403 and reason in ("rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded")):
                        if attempt == max_retries - 1:
                            raise
                        backoff = min(60.0, (2 ** attempt) + random.uniform(0.5, 2.0))
                        await asyncio.sleep(backoff)
                        continue
                    raise

    async def list_files_page(self, page_token: Optional[str] = None, page_size: int = 50) -> Dict[str, Any]:
        fields = "nextPageToken, files(id, name, mimeType, parents, size, md5Checksum, modifiedTime, trashed, shortcutDetails, owners, shared, driveId)"
        req = self.service.files().list(
            pageSize=page_size,
            pageToken=page_token,
            fields=fields,
            corpora="allDrives",
            includeItemsFromAllDrives=True,
            supportsAllDrives=True
        )
        return await self._execute_with_backoff(req)

    async def download_file_content(self, file_id: str, mime_type: str) -> Dict[str, Any]:
        for attempt in range(7):
            async with self.rate_limiter:
                try:
                    if mime_type in WORKSPACE_EXPORT_FORMATS:
                        spec = WORKSPACE_EXPORT_FORMATS[mime_type]
                        request = self.service.files().export_media(fileId=file_id, mimeType=spec["mime"])
                        out_buffer = io.BytesIO()
                        downloader = MediaIoBaseDownload(out_buffer, request)
                        done = False
                        while not done:
                            _, done = await asyncio.to_thread(downloader.next_chunk)
                        return {
                            "data": out_buffer.getvalue(),
                            "is_workspace_native": True,
                            "export_format": spec["ext"]
                        }
                    
                    request = self.service.files().get_media(fileId=file_id, supportsAllDrives=True)
                    out_buffer = io.BytesIO()
                    downloader = MediaIoBaseDownload(out_buffer, request, chunksize=1024*1024*5)
                    done = False
                    while not done:
                        _, done = await asyncio.to_thread(downloader.next_chunk)
                    return {
                        "data": out_buffer.getvalue(),
                        "is_workspace_native": False,
                        "export_format": None
                    }
                except HttpError as err:
                    status = err.resp.status
                    reason = err.error_details[0].get("reason", "") if err.error_details else ""
                    if status in (429, 500, 503) or (status == 403 and reason in ("rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded")):
                        if attempt == 6:
                            raise
                        backoff = min(60.0, (2 ** attempt) + random.uniform(0.5, 2.0))
                        await asyncio.sleep(backoff)
                        continue
                    raise
