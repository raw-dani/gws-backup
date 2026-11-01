import os
import secrets
import hashlib
import base64
from urllib.parse import urlencode
from typing import Dict, Any, Tuple
import httpx
from app.core.config import settings

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

# Least-privilege scopes
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

class GoogleOAuthHandler:
    @staticmethod
    def generate_pkce() -> Tuple[str, str]:
        """Generates PKCE code_verifier and code_challenge (S256)."""
        verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        challenge = base64.urlsafe_b64encode(digest).decode("utf-8").replace("=", "")
        return verifier, challenge

    @classmethod
    def get_authorization_url(cls, client_id: str, redirect_uri: str) -> Tuple[str, str, str]:
        """Creates secure authorization URL with PKCE and state."""
        verifier, challenge = cls.generate_pkce()
        state = secrets.token_urlsafe(32)
        
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        url = f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"
        return url, state, verifier

    @classmethod
    async def exchange_code_for_tokens(
        cls,
        code: str,
        code_verifier: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str
    ) -> Dict[str, Any]:
        """Exchanges auth code for tokens with PKCE validation."""
        payload = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(GOOGLE_TOKEN_ENDPOINT, data=payload)
            if res.status_code != 200:
                raise ValueError(f"OAuth token exchange failed: {res.text}")
            return res.json()

    @classmethod
    async def refresh_access_token(cls, refresh_token: str, client_id: str, client_secret: str) -> str:
        """Refreshes expired access token."""
        payload = {
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(GOOGLE_TOKEN_ENDPOINT, data=payload)
            if res.status_code != 200:
                raise ValueError(f"Token refresh failed: {res.text}")
            data = res.json()
            return data["access_token"]

    @classmethod
    async def get_user_profile(cls, access_token: str) -> Dict[str, Any]:
        """Fetches basic profile information (email, name, picture)."""
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient() as client:
            res = await client.get(GOOGLE_USERINFO_ENDPOINT, headers=headers)
            if res.status_code != 200:
                raise ValueError("Failed to retrieve user profile")
            return res.json()

