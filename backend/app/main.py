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
    """Add new columns to existing tables without dropping data (idempotent).

    Each statement runs in its own transaction so a single failure never
    prevents the rest of the migrations — or the app — from starting.
    """
    from sqlalchemy import text
    from app.database import engine

    _migrations = [
        # fichaje columns
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS modalidad VARCHAR',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS edit_comment TEXT',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS last_edited_by_id UUID REFERENCES "user"(id)',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS rest_violation BOOLEAN',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP',
        # user columns
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS dni VARCHAR',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS geo_consent BOOLEAN',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS geo_consent_date TIMESTAMP',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS privacy_notice_accepted BOOLEAN',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS privacy_notice_date TIMESTAMP',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS scheduled_end TIME',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS work_center_id UUID REFERENCES work_center(id)',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS vacation_days INTEGER DEFAULT 22',
        'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS monthly_report_enabled BOOLEAN DEFAULT false',
        # company columns
        'ALTER TABLE company ADD COLUMN IF NOT EXISTS logo_url TEXT',
        'ALTER TABLE company ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT true',
        'ALTER TABLE company ADD COLUMN IF NOT EXISTS vacation_enabled BOOLEAN DEFAULT true',
        # email_config columns (table created fresh via init_db after pre-migration drop if needed)
        'ALTER TABLE email_config ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company(id)',
        # data backfill — safe to repeat (WHERE clause is idempotent)
        "UPDATE \"user\" SET geo_consent = true, geo_consent_date = NOW() WHERE role = 'worker' AND geo_consent IS NULL",
        # performance indexes
        'CREATE INDEX IF NOT EXISTS ix_fichaje_user_id ON fichaje (user_id)',
        'CREATE INDEX IF NOT EXISTS ix_fichaje_status ON fichaje (status)',
        'CREATE INDEX IF NOT EXISTS ix_fichaje_start_time ON fichaje (start_time)',
        'CREATE INDEX IF NOT EXISTS ix_user_company_id ON "user" (company_id)',
        'CREATE INDEX IF NOT EXISTS ix_user_role ON "user" (role)',
        'CREATE INDEX IF NOT EXISTS ix_admin_access_log_admin_id ON admin_access_log (admin_id)',
        'CREATE INDEX IF NOT EXISTS ix_admin_access_log_accessed_at ON admin_access_log (accessed_at)',
        'CREATE INDEX IF NOT EXISTS ix_fichaje_is_deleted_start ON fichaje (is_deleted, start_time DESC)',
        'CREATE INDEX IF NOT EXISTS ix_fichaje_user_status ON fichaje (user_id, status, start_time DESC)',
        'CREATE INDEX IF NOT EXISTS ix_worker_schedule_user_date ON worker_schedule (user_id, schedule_date)',
        # worker_schedule: migrate from (year, day_of_week) → schedule_date
        'ALTER TABLE worker_schedule ADD COLUMN IF NOT EXISTS schedule_date DATE',
        'DELETE FROM worker_schedule WHERE schedule_date IS NULL',
        'ALTER TABLE worker_schedule DROP CONSTRAINT IF EXISTS uq_worker_schedule_user_year_day',
        'ALTER TABLE worker_schedule DROP COLUMN IF EXISTS year',
        'ALTER TABLE worker_schedule DROP COLUMN IF EXISTS day_of_week',
    ]

    for _sql in _migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(_sql))
        except Exception as exc:
            # Log but never crash — a migration that already ran or is not needed
            # on this DB version should not stop the app from starting.
            print(f"[migrate] SKIP ({exc.__class__.__name__}): {_sql[:80]}")

    # worker_schedule unique constraint — must run outside a transaction on some PG versions
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
    except Exception as exc:
        print(f"[migrate] SKIP worker_schedule unique constraint: {exc}")


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

        async def _send_one(worker):
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

        tasks = [_send_one(w) for w in workers]
        await asyncio.gather(*tasks, return_exceptions=True)


async def _cleanup_loop() -> None:
    """Background task: purge stale DB rows daily to prevent unbounded table growth.

    Without cleanup, password_reset_token and admin_access_log grow forever.
    Large tables → slow queries → connections held longer → pool exhaustion → app crashes.
    """
    await asyncio.sleep(120)  # let startup settle first
    while True:
        try:
            from sqlalchemy import text, delete as sa_delete
            from app.database import AsyncSessionLocal
            from app.models.password_reset import PasswordResetToken
            from app.models.adminaccesslog import AdminAccessLog
            from datetime import timedelta

            async with AsyncSessionLocal() as session:
                cutoff_tokens = datetime.utcnow() - timedelta(hours=24)
                result = await session.execute(
                    sa_delete(PasswordResetToken).where(
                        PasswordResetToken.expires_at < cutoff_tokens
                    )
                )
                deleted_tokens = result.rowcount

                cutoff_logs = datetime.utcnow() - timedelta(days=90)
                result = await session.execute(
                    sa_delete(AdminAccessLog).where(
                        AdminAccessLog.accessed_at < cutoff_logs
                    )
                )
                deleted_logs = result.rowcount

                await session.commit()

            if deleted_tokens or deleted_logs:
                print(f"[cleanup] Removed {deleted_tokens} expired tokens, {deleted_logs} old access logs")
        except Exception as exc:
            print(f"[cleanup] Error: {exc}")
        await asyncio.sleep(86400)  # run once per day


_DEFAULT_SECRET = "change-me-in-production-very-secret-key"


async def _do_startup() -> None:
    """
    Run all DB migrations and seed data as a background task.
    Running this in the background (instead of blocking the lifespan before yield)
    means the HTTP server — and the /health endpoint — starts immediately,
    so the Docker health check passes even when migrations take a long time
    (e.g. creating indexes on large production tables for the first time).
    """
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

    try:
        await init_db()
    except Exception as exc:
        print(f"[startup] init_db failed: {exc}")

    await _run_column_migrations()

    try:
        await seed()
    except Exception as exc:
        print(f"[startup] seed failed: {exc}")

    print("[startup] DB initialization complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if production is running with the default insecure secret key
    if app_settings.APP_ENV == "production" and app_settings.SECRET_KEY == _DEFAULT_SECRET:
        raise RuntimeError(
            "FATAL: SECRET_KEY is still the default value. "
            "Set SECRET_KEY to a strong random string in your production .env file."
        )

    # Run migrations in background so the HTTP server (and /health) starts immediately.
    # This prevents the Docker health check from timing out when index creation
    # or other heavy migrations run for the first time on a production database.
    startup_task = asyncio.create_task(_do_startup())
    task = asyncio.create_task(_auto_close_loop())
    monthly_task = asyncio.create_task(_monthly_report_loop())
    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    startup_task.cancel()
    task.cancel()
    monthly_task.cancel()
    cleanup_task.cancel()
    for t in (startup_task, task, monthly_task, cleanup_task):
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
    """Liveness check: verifies the HTTP server AND the DB connection are up."""
    from sqlalchemy import text
    from app.database import engine
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        from fastapi import Response
        import json
        return Response(
            content=json.dumps({"status": "error", "detail": "database unreachable"}),
            status_code=503,
            media_type="application/json",
        )
    return {"status": "ok"}
