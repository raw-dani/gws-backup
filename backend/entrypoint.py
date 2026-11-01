import os
import sys
from pathlib import Path

# Ensure backend root is on sys.path
backend_root = Path(__file__).parent.resolve()
sys.path.insert(0, str(backend_root))

from app.main import app
import uvicorn
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Google Workspace Backup Background Service")
    parser.add_argument("--port", type=int, default=8000, help="Local loopback port")
    parser.add_argument("--session-token", type=str, default="", help="Dynamic one-time authentication token from desktop host")
    args = parser.parse_args()

    from app.core.config import settings
    if args.session_token:
        settings.SESSION_TOKEN = args.session_token

    uvicorn.run(app, host=settings.API_HOST, port=args.port, log_level="info")

