import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, users, fichajes, reports, pause_types, notifications, companies, worker_schedule, work_centers, superadmin_users, invoice_config, worker_export, access_logs, absence
from app.routers import settings as settings_router

app_settings = get_settings()

_AUTO_CLOSE_INTERVAL = 300  # check every 5 minutes


async def _auto_close_loop() -> None:
    """Background task: close fichajes open longer than configured hours."""
    await asyncio.sleep(60)  # wait for DB to be ready
    while True:
        try:
            from sqlalchemy import select
            from app.database import AsyncSessionLocal
            from app.models.app_settings import AppSettings
            from app.routers.fichajes import _close_open_fichajes

            async with AsyncSessionLocal() as session:
                result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
                cfg = result.scalar_one_or_none()
                if cfg and cfg.auto_close_enabled and cfg.auto_close_hours > 0:
                    closed = await _close_open_fichajes(session, max_hours=cfg.auto_close_hours)
                    if closed:
                        print(f"[auto-close] Closed {closed} fichaje(s) open > {cfg.auto_close_hours}h")
        except Exception as exc:
            print(f"[auto-close] Error: {exc}")
        await asyncio.sleep(_AUTO_CLOSE_INTERVAL)


async def _run_column_migrations() -> None:
    """Add new columns to existing tables without dropping data (idempotent)."""
    from sqlalchemy import text
    from app.database import engine
    async with engine.begin() as conn:
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS modalidad VARCHAR'
        ))
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS edit_comment TEXT'
        ))
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS last_edited_by_id UUID REFERENCES "user"(id)'
        ))
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS dni VARCHAR'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS geo_consent BOOLEAN'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS geo_consent_date TIMESTAMP'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS privacy_notice_accepted BOOLEAN'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS privacy_notice_date TIMESTAMP'
        ))
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS rest_violation BOOLEAN'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS scheduled_end TIME'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS work_center_id UUID REFERENCES work_center(id)'
        ))
        # Workers already using the app are assumed to have implicitly consented
        await conn.execute(text(
            "UPDATE \"user\" SET geo_consent = true, geo_consent_date = NOW() "
            "WHERE role = 'worker' AND geo_consent IS NULL"
        ))
        # Performance indexes (idempotent)
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_fichaje_user_id ON fichaje (user_id)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_fichaje_status ON fichaje (status)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_fichaje_start_time ON fichaje (start_time)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_user_company_id ON "user" (company_id)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_user_role ON "user" (role)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_admin_access_log_admin_id ON admin_access_log (admin_id)'
        ))
        await conn.execute(text(
            'CREATE INDEX IF NOT EXISTS ix_admin_access_log_accessed_at ON admin_access_log (accessed_at)'
        ))
        await conn.execute(text(
            'ALTER TABLE company ADD COLUMN IF NOT EXISTS logo_url TEXT'
        ))
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS vacation_days INTEGER DEFAULT 22'
        ))
        await conn.execute(text(
            'ALTER TABLE company ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT true'
        ))
        await conn.execute(text(
            'ALTER TABLE company ADD COLUMN IF NOT EXISTS vacation_enabled BOOLEAN DEFAULT true'
        ))
        # (worker_schedule year/day_of_week constraint block removed — columns no longer exist)

    # Soft-delete columns for fichaje — isolated block so a failure here never rolls back other migrations
    async with engine.begin() as conn:
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false'
        ))
        await conn.execute(text(
            'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP'
        ))

    # worker_schedule: migrate from (year, day_of_week) → schedule_date
    # Each step in its own engine.begin() so a failure never aborts the whole transaction.
    for _sql in [
        "ALTER TABLE worker_schedule ADD COLUMN IF NOT EXISTS schedule_date DATE",
        "DELETE FROM worker_schedule WHERE schedule_date IS NULL",
        "ALTER TABLE worker_schedule DROP CONSTRAINT IF EXISTS uq_worker_schedule_user_year_day",
        "ALTER TABLE worker_schedule DROP COLUMN IF EXISTS year",
        "ALTER TABLE worker_schedule DROP COLUMN IF EXISTS day_of_week",
    ]:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(_sql))
        except Exception:
            pass
    # Add new unique constraint (DO $$ cannot run inside a regular transaction on some PG versions)
    try:
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT").execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'uq_worker_schedule_user_date'
                    ) THEN
                        ALTER TABLE worker_schedule
                        ADD CONSTRAINT uq_worker_schedule_user_date
                        UNIQUE (user_id, schedule_date);
                    END IF;
                END $$;
            """))
    except Exception:
        pass


_DEFAULT_SECRET = "change-me-in-production-very-secret-key"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if production is running with the default insecure secret key
    if app_settings.APP_ENV == "production" and app_settings.SECRET_KEY == _DEFAULT_SECRET:
        raise RuntimeError(
            "FATAL: SECRET_KEY is still the default value. "
            "Set SECRET_KEY to a strong random string in your production .env file."
        )

    from migrations.seed import seed
    from app.database import init_db
    # register new models so SQLModel.metadata knows about their tables
    import app.models.fichajeeditlog  # noqa: F401
    import app.models.adminaccesslog  # noqa: F401
    import app.models.absence  # noqa: F401
    await init_db()
    await _run_column_migrations()
    await seed()
    task = asyncio.create_task(_auto_close_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Fichajes API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(fichajes.router)
app.include_router(reports.router)
app.include_router(pause_types.router)
app.include_router(settings_router.router)
app.include_router(notifications.router)
app.include_router(companies.router)
app.include_router(worker_schedule.router)
app.include_router(work_centers.router)
app.include_router(superadmin_users.router)
app.include_router(invoice_config.router)
app.include_router(worker_export.router)
app.include_router(access_logs.router)
app.include_router(absence.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
