import os
import io
import hashlib
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List
from pathlib import Path
import aiofiles
import aiofiles.os

class StorageProvider(ABC):
    @abstractmethod
    async def write(self, key: str, stream: AsyncGenerator[bytes, None]) -> int:
        """Writes streaming bytes to destination key. Returns total bytes written."""
        pass

    @abstractmethod
    async def write_bytes(self, key: str, data: bytes) -> int:
        """Writes atomic buffer to destination key."""
        pass

    @abstractmethod
    async def read(self, key: str) -> bytes:
        """Reads all bytes for the given key."""
        pass

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Checks if key exists in storage."""
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """Deletes key from storage."""
        pass

    @abstractmethod
    async def list(self, prefix: str) -> List[str]:
        """Lists all keys matching the prefix."""
        pass

class LocalFilesystemStorageProvider(StorageProvider):
    def __init__(self, base_directory: Path):
        self.base_dir = Path(base_directory)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, key: str) -> Path:
        # Prevent path traversal vulnerabilities
        clean_key = Path(key).as_posix().lstrip("/").replace("../", "")
        dest = (self.base_dir / clean_key).resolve()
        if not str(dest).startswith(str(self.base_dir.resolve())):
            raise ValueError(f"Path traversal detected: {key}")
        return dest

    async def write(self, key: str, stream: AsyncGenerator[bytes, None]) -> int:
        dest_path = self._resolve_path(key)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temporary file first for atomic commit
        tmp_path = dest_path.with_suffix(dest_path.suffix + ".tmp")
        total_bytes = 0
        
        async with aiofiles.open(tmp_path, "wb") as f:
            async for chunk in stream:
                if chunk:
                    await f.write(chunk)
                    total_bytes += len(chunk)
                    
        # Atomic rename
        if await aiofiles.os.path.exists(dest_path):
            await aiofiles.os.remove(dest_path)
        await aiofiles.os.rename(tmp_path, dest_path)
        return total_bytes

    async def write_bytes(self, key: str, data: bytes) -> int:
        async def _generator():
            yield data
        return await self.write(key, _generator())

    async def read(self, key: str) -> bytes:
        dest_path = self._resolve_path(key)
        if not await aiofiles.os.path.exists(dest_path):
            raise FileNotFoundError(f"Storage object not found: {key}")
        async with aiofiles.open(dest_path, "rb") as f:
            return await f.read()

    async def exists(self, key: str) -> bool:
        dest_path = self._resolve_path(key)
        return await aiofiles.os.path.exists(dest_path)

    async def delete(self, key: str) -> bool:
        dest_path = self._resolve_path(key)
        if await aiofiles.os.path.exists(dest_path):
            await aiofiles.os.remove(dest_path)
            return True
        return False

    async def list(self, prefix: str) -> List[str]:
        target_dir = self._resolve_path(prefix)
        if not await aiofiles.os.path.exists(target_dir):
            return []
        
        matches = []
        for root, _, files in os.walk(target_dir):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(self.base_dir).as_posix()
                matches.append(rel_path)
        return matches

