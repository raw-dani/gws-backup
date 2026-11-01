import os
import base64
from typing import Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

class EnvelopeEncryption:
    """
    AES-256-GCM envelope encryption engine with Argon2id Key Derivation Function (KDF).
    Never writes plaintext encryption keys to persistent database storage.
    """

    @staticmethod
    def generate_master_key() -> bytes:
        """Generates a high-entropy 256-bit (32 bytes) master key."""
        return AESGCM.generate_key(bit_length=256)

    @staticmethod
    def derive_key_from_passphrase(passphrase: str, salt: bytes = None) -> Tuple[bytes, bytes]:
        """Derives a strong 256-bit key from a user passphrase using Argon2id."""
        if salt is None:
            salt = os.urandom(16)
        
        kdf = Argon2id(
            salt=salt,
            length=32,
            iterations=2,
            lanes=4,
            memory_cost=64 * 1024 # 64MB memory cost
        )
        key = kdf.derive(passphrase.encode("utf-8"))
        return key, salt

    @staticmethod
    def encrypt_data(data: bytes, key: bytes, associated_data: bytes = b"") -> bytes:
        """
        Encrypts raw payload using AES-256-GCM.
        Returns: 12-byte Nonce + Ciphertext with 16-byte Auth Tag appended.
        """
        aesgcm = AESGCM(key)
        nonce = os.urandom(12) # 96-bit unique IV/Nonce
        ciphertext = aesgcm.encrypt(nonce, data, associated_data)
        return nonce + ciphertext

    @staticmethod
    def decrypt_data(payload: bytes, key: bytes, associated_data: bytes = b"") -> bytes:
        """
        Decrypts AES-256-GCM payload.
        Verifies integrity tag before returning decrypted bytes.
        """
        if len(payload) < 28: # 12 bytes nonce + 16 bytes auth tag
            raise ValueError("Invalid payload: shorter than minimum AES-GCM envelope length")
        
        nonce = payload[:12]
        ciphertext = payload[12:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, associated_data)

