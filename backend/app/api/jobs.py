import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
from app.core.database import get_db
from app.core.security import verify_session_token
from app.models.entities import BackupJob, Account
from app.schemas.schemas import BackupJobResponse
from app.workers.job_worker import BackupJobWorker, active_tasks, cancelled_jobs

router = APIRouter(prefix="/api/jobs", tags=["Jobs"], dependencies=[Depends(verify_session_token)])

@router.get("", response_model=List[BackupJobResponse])
async def list_jobs(account_id: str = None, db: AsyncSession = Depends(get_db)):
    stmt = select(BackupJob).order_by(desc(BackupJob.started_at))
    if account_id:
        stmt = stmt.where(BackupJob.account_id == account_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/trigger", response_model=BackupJobResponse)
async def trigger_job(
    account_id: str,
    service: str, # 'gmail' or 'drive'
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    account = (await db.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    job = BackupJob(
        account_id=account.id,
        service=service,
        job_type="incremental",
        status="queued"
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Launch local worker task
    worker = BackupJobWorker(job.id)
    task = asyncio.create_task(worker.run())
    active_tasks[job.id] = task

    return job

@router.post("/{job_id}/stop")
async def stop_job(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(BackupJob).where(BackupJob.id == job_id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in ("running", "queued"):
        return {"message": f"Job is already {job.status}"}

    cancelled_jobs.add(job_id)
    task = active_tasks.get(job_id)
    if task and not task.done():
        task.cancel()

    job.status = "stopped"
    job.error_message = "Stopped by user"
    await db.commit()
    await db.refresh(job)

    return {"message": "Job stop requested successfully", "job_id": job_id, "status": job.status}

