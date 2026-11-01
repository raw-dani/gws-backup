from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api import accounts, jobs, search
from app.scheduler.manager import scheduler
from app.schemas.schemas import SystemHealthResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and SQLite WAL pragma mode
    await init_db()
    # Start persistent local background scheduler
    scheduler.start()
    yield
    # Stop scheduler on shutdown
    scheduler.stop()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# CORS restricted to loopback Tauri origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(jobs.router)
app.include_router(search.router)

@app.get("/health", response_model=SystemHealthResponse)
async def health_check():
    return SystemHealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        database_ok=True,
        active_jobs=0,
        storage_dir=str(settings.DEFAULT_BACKUP_DIR)
    )

if __name__ == "__main__":
    import uvicorn
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--session-token", type=str, default="")
    args = parser.parse_args()

    if args.session_token:
        settings.SESSION_TOKEN = args.session_token

    uvicorn.run(app, host=settings.API_HOST, port=args.port, log_level="info")

