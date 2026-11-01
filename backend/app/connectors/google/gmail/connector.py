import email
from email import policy
from email.parser import BytesParser
import hashlib
import asyncio
import random
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import base64
from aiolimiter import AsyncLimiter
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

class GmailConnector:
    """
    Gmail API Connector compliant with Google's strict Quota & Usage Policies:
    - Conservative Rate Limiting: 20 req/sec to prevent 'Units per minute per user' exhaustion (Total Query Cost: 5 units per messages.get)
    - Full Exponential Backoff with Jitter for HTTP 429 and 403 rateLimitExceeded
    - Raw RFC 822 MIME (.eml) streaming ingestion
    """
    def __init__(self, access_token: str):
        # Google limit: 250 units/sec, messages.get (format=raw) costs 5 units.
        # 15 requests per second * 5 = 75 units/sec (very safe under Google limits)
        self.rate_limiter = AsyncLimiter(max_rate=15, time_period=1.0)
        self.creds = Credentials(token=access_token)
        self.service = build("gmail", "v1", credentials=self.creds, cache_discovery=False)

    async def _execute_with_backoff(self, request_fn, max_retries: int = 7):
        """
        Executes Google API request with Truncated Exponential Backoff + Full Jitter.
        Specifically handles 429 and 403 rateLimitExceeded without crashing the job.
        """
        for attempt in range(max_retries):
            async with self.rate_limiter:
                try:
                    # Run synchronous googleapiclient call in threadpool
                    return await asyncio.to_thread(request_fn.execute)
                except HttpError as err:
                    status = err.resp.status
                    reason = err.error_details[0].get("reason", "") if err.error_details else ""
                    
                    if status in (429, 500, 503) or (status == 403 and reason in ("rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded")):
                        if attempt == max_retries - 1:
                            raise
                        # Exponential backoff with jitter: min(60, 2^attempt + jitter)
                        backoff = min(60.0, (2 ** attempt) + random.uniform(0.5, 2.0))
                        await asyncio.sleep(backoff)
                        continue
                    raise

    async def list_messages_page(self, page_token: Optional[str] = None, max_results: int = 50) -> Dict[str, Any]:
        req = self.service.users().messages().list(
            userId="me",
            pageToken=page_token,
            maxResults=max_results,
            includeSpamTrash=False
        )
        return await self._execute_with_backoff(req)

    async def get_raw_message_eml(self, message_id: str) -> Dict[str, Any]:
        req = self.service.users().messages().get(
            userId="me",
            id=message_id,
            format="raw"
        )
        raw_data = await self._execute_with_backoff(req)

        raw_str = raw_data.get("raw", "")
        eml_bytes = base64.urlsafe_b64decode(raw_str.encode("ASCII"))
        
        # Parse headers for database metadata indexing and FTS
        msg = BytesParser(policy=policy.default).parsebytes(eml_bytes)
        sender = str(msg.get("From", ""))
        recipients = str(msg.get("To", ""))
        subject = str(msg.get("Subject", ""))
        
        body_text = ""
        try:
            body = msg.get_body(preferencelist=('plain', 'html'))
            if body:
                body_text = body.get_content()
        except Exception:
            body_text = ""

        internal_date_ms = int(raw_data.get("internalDate", 0))
        internal_date = datetime.fromtimestamp(internal_date_ms / 1000.0, tz=timezone.utc)
        sha256 = hashlib.sha256(eml_bytes).hexdigest()

        return {
            "id": message_id,
            "thread_id": raw_data.get("threadId"),
            "labels": raw_data.get("labelIds", []),
            "sender": sender,
            "recipients": recipients,
            "subject": subject,
            "internal_date": internal_date,
            "eml_bytes": eml_bytes,
            "sha256": sha256,
            "size_bytes": len(eml_bytes),
            "body_snippet": body_text[:2000],
            "has_attachments": any(part.is_attachment() for part in msg.iter_attachments())
        }
