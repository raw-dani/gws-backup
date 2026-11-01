import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional, Dict, Any
from app.core.database import get_db, AsyncSessionLocal
from app.core.security import verify_session_token
from app.core.config import settings
from app.core.keyring_store import CredentialVault
from app.models.entities import Account, BackupProfile, BackupJob, GmailMessage, DriveFile
from app.schemas.schemas import AccountCreate, AccountResponse, BackupProfileUpdate, BackupJobResponse, OAuthUrlResponse
from app.connectors.google.oauth import GoogleOAuthHandler

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])

# In-memory storage for pending PKCE sessions: state -> {code_verifier, client_id, client_secret}
PENDING_OAUTH_SESSIONS: Dict[str, Dict[str, str]] = {}

@router.get("", response_model=List[AccountResponse], dependencies=[Depends(verify_session_token)])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Account).where(Account.is_active == True).order_by(desc(Account.created_at)))
    return result.scalars().all()

@router.get("/login-url")
async def get_login_url(client_id: Optional[str] = None, client_secret: Optional[str] = None):
    """
    Generates 1-Click Google OAuth URL with local loopback redirect.
    """
    cid = client_id or settings.DEFAULT_GOOGLE_CLIENT_ID
    csec = client_secret or settings.DEFAULT_GOOGLE_CLIENT_SECRET
    
    if not cid:
        raise HTTPException(
            status_code=400,
            detail="Google Client ID is not configured. Please supply one in settings or initial setup."
        )

    redirect_uri = f"http://127.0.0.1:{settings.API_PORT}/api/accounts/callback"
    url, state, verifier = GoogleOAuthHandler.get_authorization_url(cid, redirect_uri)
    
    # Store session state for automatic token exchange
    PENDING_OAUTH_SESSIONS[state] = {
        "verifier": verifier,
        "client_id": cid,
        "client_secret": csec,
        "redirect_uri": redirect_uri
    }
    
    return {"url": url, "state": state}

@router.get("/callback")
async def oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None
):
    """
    Automated Loopback Callback handler hit by Google after user clicks 'Allow'.
    Exchanges tokens automatically and closes browser tab.
    """
    if error:
        return HTMLResponse(content=f"""
            <html><body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: #f87171;">
                <h2>Authentication Cancelled or Failed</h2>
                <p>{error}</p>
                <p>You can close this tab and return to the application.</p>
            </body></html>
        """, status_code=400)

    if not code or not state or state not in PENDING_OAUTH_SESSIONS:
        return HTMLResponse(content="""
            <html><body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: #f87171;">
                <h2>Invalid or Expired OAuth Session</h2>
                <p>Please return to the application and try clicking 'Connect Google Account' again.</p>
            </body></html>
        """, status_code=400)

    oauth_meta = PENDING_OAUTH_SESSIONS.pop(state)
    
    try:
        token_resp = await GoogleOAuthHandler.exchange_code_for_tokens(
            code=code,
            code_verifier=oauth_meta["verifier"],
            client_id=oauth_meta["client_id"],
            client_secret=oauth_meta["client_secret"],
            redirect_uri=oauth_meta["redirect_uri"]
        )

        access_token = token_resp["access_token"]
        refresh_token = token_resp.get("refresh_token")
        profile = await GoogleOAuthHandler.get_user_profile(access_token)
        email = profile["email"]

        async with AsyncSessionLocal() as db:
            stmt = select(Account).where(Account.email == email)
            existing = (await db.execute(stmt)).scalar_one_or_none()

            if existing:
                account = existing
                account.display_name = profile.get("name")
                account.avatar_url = profile.get("picture")
                account.is_active = True
                account.client_id = oauth_meta["client_id"]
            else:
                account = Account(
                    email=email,
                    display_name=profile.get("name"),
                    avatar_url=profile.get("picture"),
                    auth_mode="loopback",
                    client_id=oauth_meta["client_id"]
                )
                db.add(account)
                await db.flush()

                profile_obj = BackupProfile(account_id=account.id)
                db.add(profile_obj)

            if refresh_token:
                CredentialVault.save_account_tokens(account.id, refresh_token)
            if oauth_meta.get("client_secret"):
                CredentialVault.save_account_client_secret(account.id, oauth_meta["client_secret"])

            await db.commit()

        # Success page that notifies user and automatically closes after 2 seconds
        return HTMLResponse(content=f"""
            <html>
            <head><title>Account Connected - Google Workspace Backup</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0b0f19; color: #ffffff;">
                <div style="background-color: #111827; border: 1px solid #10b981; border-radius: 14px; padding: 40px; text-align: center; max-width: 460px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <div style="width: 54px; height: 54px; background-color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <span style="font-size: 28px;">✓</span>
                    </div>
                    <h2 style="margin: 0 0 10px 0; font-size: 22px;">Successfully Connected!</h2>
                    <p style="color: #93c5fd; font-size: 16px; margin: 0 0 16px 0; font-weight: 600;">{email}</p>
                    <p style="color: #94a3b8; font-size: 14px; margin: 0;">Your Google account is now linked. You can close this window and return to the GWS Backup application.</p>
                    <script>
                        setTimeout(() => {{ window.close(); }}, 2500);
                    </script>
                </div>
            </body>
            </html>
        """)
    except Exception as e:
        return HTMLResponse(content=f"""
            <html><body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: #ef4444;">
                <h2>Error Completing Connection</h2>
                <p>{str(e)}</p>
            </body></html>
        """, status_code=500)

@router.get("/{account_id}/profile", dependencies=[Depends(verify_session_token)])
async def get_account_profile(account_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(BackupProfile).where(BackupProfile.account_id == account_id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {
        "id": profile.id,
        "account_id": profile.account_id,
        "backup_gmail": profile.backup_gmail,
        "backup_drive": profile.backup_drive,
        "schedule_interval": profile.schedule_interval or "daily",
        "encryption_enabled": profile.encryption_enabled
    }

@router.put("/{account_id}/profile", dependencies=[Depends(verify_session_token)])
async def update_account_profile(
    account_id: str,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BackupProfile).where(BackupProfile.account_id == account_id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if "schedule_interval" in payload:
        val = payload["schedule_interval"]
        if val in ("5m", "15m", "30m", "1h", "6h", "daily", "manual"):
            profile.schedule_interval = val
    if "backup_gmail" in payload:
        profile.backup_gmail = bool(payload["backup_gmail"])
    if "backup_drive" in payload:
        profile.backup_drive = bool(payload["backup_drive"])

    await db.commit()
    await db.refresh(profile)
    return {
        "message": "Backup profile updated successfully",
        "schedule_interval": profile.schedule_interval,
        "backup_gmail": profile.backup_gmail,
        "backup_drive": profile.backup_drive
    }

@router.delete("/{account_id}", dependencies=[Depends(verify_session_token)])
async def disconnect_account(account_id: str, db: AsyncSession = Depends(get_db)):
    """
    Disconnects the account credentials without deleting previous durable backup data.
    """
    stmt = select(Account).where(Account.id == account_id)
    account = (await db.execute(stmt)).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account.is_active = False
    CredentialVault.delete_account_tokens(account.id)
    await db.commit()
    return {"message": "Account disconnected successfully. Previous backups preserved."}
