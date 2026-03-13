import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

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

    # Email and user preference columns
    async with engine.begin() as conn:
        await conn.execute(text(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS monthly_report_enabled BOOLEAN DEFAULT false'
        ))
        await conn.execute(text(
            'ALTER TABLE email_config ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company(id)'
        ))

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


async def _monthly_report_loop() -> None:
    """Background task: send monthly fichaje summary on the 1st of each month."""
    await asyncio.sleep(60)
    last_sent_month: tuple | None = None
    while True:
        try:
            now = datetime.utcnow()
            if now.day == 1 and last_sent_month != (now.year, now.month):
                await _send_monthly_reports(now)
                last_sent_month = (now.year, now.month)
        except Exception as exc:
            print(f"[monthly-report] Error: {exc}")
        await asyncio.sleep(3600)


async def _send_monthly_reports(now: "datetime") -> None:
    from calendar import monthrange
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.user import User, UserRole
    from app.models.fichaje import Fichaje, FichajeStatus
    from app.routers.settings import _get_email_config
    from app.services.email_service import send_monthly_report_email

    # Compute previous month range
    first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if first_of_this.month == 1:
        prev_year, prev_month = first_of_this.year - 1, 12
    else:
        prev_year, prev_month = first_of_this.year, first_of_this.month - 1
    _, last_day = monthrange(prev_year, prev_month)
    month_start = first_of_this.replace(year=prev_year, month=prev_month, day=1)
    month_end = first_of_this.replace(year=prev_year, month=prev_month, day=last_day,
                                      hour=23, minute=59, second=59)
    month_label = month_start.strftime("%B %Y")

    async with AsyncSessionLocal() as session:
        workers_result = await session.execute(
            select(User).where(
                User.role == UserRole.worker,
                User.is_active == True,
                User.monthly_report_enabled == True,
            )
        )
        workers = workers_result.scalars().all()

        for worker in workers:
            fichajes_result = await session.execute(
                select(Fichaje).where(
                    Fichaje.user_id == worker.id,
                    Fichaje.start_time >= month_start,
                    Fichaje.start_time <= month_end,
                    Fichaje.is_deleted == False,
                ).order_by(Fichaje.start_time)
            )
            fichajes = fichajes_result.scalars().all()

            rows = []
            for f in fichajes:
                rows.append({
                    "date": f.start_time.strftime("%d/%m/%Y") if f.start_time else "",
                    "start": f.start_time.strftime("%H:%M") if f.start_time else "",
                    "end": f.end_time.strftime("%H:%M") if f.end_time else "—",
                    "total": f"{f.total_minutes // 60}h {f.total_minutes % 60}min" if f.total_minutes else "—",
                })

            config = await _get_email_config(session, worker.company_id)
            try:
                await send_monthly_report_email(config, worker.email, worker.full_name, month_label, rows)
                print(f"[monthly-report] Sent to {worker.email}")
            except Exception as exc:
                print(f"[monthly-report] Failed for {worker.email}: {exc}")


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
    from app.database import init_db, engine
    # register new models so SQLModel.metadata knows about their tables
    import app.models.fichajeeditlog  # noqa: F401
    import app.models.adminaccesslog  # noqa: F401
    import app.models.absence  # noqa: F401
    import app.models.password_reset  # noqa: F401

    # Pre-migration: drop email_config if it still uses the old integer PK
    # so init_db() can recreate it with the new UUID PK + company_id schema.
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            result = await conn.execute(text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name='email_config' AND column_name='id'"
            ))
            row = result.fetchone()
            if row and row[0] in ("integer", "bigint", "smallint"):
                await conn.execute(text("DROP TABLE email_config"))
                print("[migration] Dropped old email_config (integer PK → UUID PK)")
    except Exception as _e:
        print(f"[migration] email_config pre-check skipped: {_e}")

    await init_db()
    await _run_column_migrations()
    await seed()
    task = asyncio.create_task(_auto_close_loop())
    monthly_task = asyncio.create_task(_monthly_report_loop())
    yield
    task.cancel()
    monthly_task.cancel()
    for t in (task, monthly_task):
        try:
            await t
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
