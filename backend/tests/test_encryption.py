import pytest
import pytest_asyncio
from app.encryption.crypto import EnvelopeEncryption

def test_encryption_and_decryption_cycle():
    key = EnvelopeEncryption.generate_master_key()
    assert len(key) == 32

    payload = b"Hello, Google Workspace Backup confidential payload!"
    encrypted = EnvelopeEncryption.encrypt_data(payload, key)

    assert encrypted != payload
    assert len(encrypted) > len(payload)

    decrypted = EnvelopeEncryption.decrypt_data(encrypted, key)
    assert decrypted == payload

def test_kdf_derivation():
    passphrase = "UltraSecureUserPassphrase123!"
    key1, salt = EnvelopeEncryption.derive_key_from_passphrase(passphrase)
    assert len(key1) == 32

    # Deterministic check with same salt
    key2, _ = EnvelopeEncryption.derive_key_from_passphrase(passphrase, salt=salt)
    assert key1 == key2

def test_tampered_ciphertext_detection():
    key = EnvelopeEncryption.generate_master_key()
    payload = b"Important email message content"
    encrypted = bytearray(EnvelopeEncryption.encrypt_data(payload, key))

    # Tamper with one byte in the middle of ciphertext
    encrypted[15] ^= 0xFF

    with pytest.raises(Exception):
        EnvelopeEncryption.decrypt_data(bytes(encrypted), key)

