import pytest
import pytest_asyncio
from pathlib import Path
import tempfile
import shutil
from app.storage.provider import LocalFilesystemStorageProvider

@pytest.fixture
def temp_storage_dir():
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)

@pytest.mark.asyncio
async def test_atomic_storage_write_read_cycle(temp_storage_dir):
    provider = LocalFilesystemStorageProvider(temp_storage_dir)
    key = "accounts/test-acc/gmail/messages/2026/10/msg123.eml"
    payload = b"RFC822 MIME raw content with attachments"

    bytes_written = await provider.write_bytes(key, payload)
    assert bytes_written == len(payload)
    assert await provider.exists(key) is True

    read_back = await provider.read(key)
    assert read_back == payload

@pytest.mark.asyncio
async def test_path_traversal_protection(temp_storage_dir):
    provider = LocalFilesystemStorageProvider(temp_storage_dir)
    malicious_key = "../../etc/passwd"

    # Should safely clean the key and not escape base dir
    await provider.write_bytes(malicious_key, b"safe data")
    assert not (temp_storage_dir.parent / "etc/passwd").exists()

