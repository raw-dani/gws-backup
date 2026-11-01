import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.entities import Account, BackupProfile, BackupJob
from app.workers.job_worker import BackupJobWorker, active_tasks

logger = logging.getLogger("Scheduler")

class LocalScheduler:
    """
    Automated Local Background Scheduler:
    - Runs periodic background checks (every 60 seconds)
    - Checks configured intervals per account profile: '5m', '15m', '30m', '1h', 'daily'
    - Detects if missed scheduled backup when computer was sleeping/off and triggers catch-up
    - Spawns non-blocking incremental sync workers
    """
    def __init__(self):
        self._running = False
        self._task: asyncio.Task = None

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._scheduler_loop())
            logger.info("Local background scheduler started.")

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _scheduler_loop(self):
        while self._running:
            try:
                await self._evaluate_and_trigger_jobs()
            except Exception as e:
                logger.error(f"Scheduler evaluation error: {e}")
            
            # Wait 60 seconds before next interval check
            await asyncio.sleep(60)

    async def _evaluate_and_trigger_jobs(self):
        async with AsyncSessionLocal() as session:
            # Query all active accounts with their backup profiles
            stmt = select(Account).where(Account.is_active == True)
            accounts = (await session.execute(stmt)).scalars().all()

            now = datetime.now(timezone.utc)

            for account in accounts:
                profile_stmt = select(BackupProfile).where(BackupProfile.account_id == account.id)
                profile = (await session.execute(profile_stmt)).scalar_one_or_none()
                if not profile:
                    continue

                interval_str = profile.schedule_interval or "daily"
                interval_delta = self._parse_interval(interval_str)

                # Check Gmail backup condition
                if profile.backup_gmail:
                    await self._check_and_spawn_job(session, account.id, "gmail", interval_delta, now)

                # Check Drive backup condition
                if profile.backup_drive:
                    await self._check_and_spawn_job(session, account.id, "drive", interval_delta, now)

    def _parse_interval(self, interval_str: str) -> Optional[timedelta]:
        if interval_str == "manual":
            return None
        mapping = {
            "5m": timedelta(minutes=5),
            "15m": timedelta(minutes=15),
            "30m": timedelta(minutes=30),
            "1h": timedelta(hours=1),
            "6h": timedelta(hours=6),
            "daily": timedelta(days=1),
        }
        return mapping.get(interval_str, timedelta(days=1))

    async def _check_and_spawn_job(self, session, account_id: str, service: str, interval: Optional[timedelta], now: datetime):
        if interval is None:
            return  # Manual mode: do not automatically spawn background job
        # Find latest completed or running job
        latest_job_stmt = select(BackupJob).where(
            BackupJob.account_id == account_id,
            BackupJob.service == service
        ).order_by(BackupJob.started_at.desc()).limit(1)

        latest_job = (await session.execute(latest_job_stmt)).scalar_one_or_none()

        # Do not start if a job is already queued or running
        if latest_job and latest_job.status in ("running", "queued"):
            return

        should_run = False
        if not latest_job:
            should_run = True
        else:
            last_run_time = latest_job.completed_at or latest_job.started_at
            if not last_run_time or (now - last_run_time) >= interval:
                should_run = True

        if should_run:
            new_job = BackupJob(
                account_id=account_id,
                service=service,
                job_type="incremental",
                status="queued"
            )
            session.add(new_job)
            await session.commit()
            await session.refresh(new_job)

            # Spawn background worker asynchronously
            worker = BackupJobWorker(new_job.id)
            task = asyncio.create_task(worker.run())
            active_tasks[new_job.id] = task
            logger.info(f"Scheduled automated incremental backup triggered for account={account_id}, service={service}")

scheduler = LocalScheduler()

