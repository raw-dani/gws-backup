import os
import keyring
from typing import Optional

KEYRING_SERVICE_NAME = "GoogleWorkspaceBackup"

class CredentialVault:
    """
    Hardware and OS-level secure storage abstraction using:
    - Windows Credential Manager
    - macOS Keychain
    - Linux SecretService / Keyring
    """

    @staticmethod
    def set_secret(key: str, secret_value: str) -> None:
        keyring.set_password(KEYRING_SERVICE_NAME, key, secret_value)

    @staticmethod
    def get_secret(key: str) -> Optional[str]:
        return keyring.get_password(KEYRING_SERVICE_NAME, key)

    @staticmethod
    def delete_secret(key: str) -> bool:
        try:
            keyring.delete_password(KEYRING_SERVICE_NAME, key)
            return True
        except Exception:
            return False

    @classmethod
    def save_account_tokens(cls, account_id: str, refresh_token: str) -> None:
        cls.set_secret(f"account_refresh_token_{account_id}", refresh_token)

    @classmethod
    def get_account_refresh_token(cls, account_id: str) -> Optional[str]:
        return cls.get_secret(f"account_refresh_token_{account_id}")

    @classmethod
    def save_account_client_secret(cls, account_id: str, client_secret: str) -> None:
        cls.set_secret(f"account_client_secret_{account_id}", client_secret)

    @classmethod
    def get_account_client_secret(cls, account_id: str) -> Optional[str]:
        return cls.get_secret(f"account_client_secret_{account_id}")

    @classmethod
    def delete_account_tokens(cls, account_id: str) -> bool:
        cls.delete_secret(f"account_client_secret_{account_id}")
        return cls.delete_secret(f"account_refresh_token_{account_id}")

    @classmethod
    def save_encryption_key(cls, account_id: str, key_hex: str) -> None:
        cls.set_secret(f"encryption_key_{account_id}", key_hex)

    @classmethod
    def get_encryption_key(cls, account_id: str) -> Optional[str]:
        return cls.get_secret(f"encryption_key_{account_id}")

