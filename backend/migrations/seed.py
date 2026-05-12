"""
Seed script: creates superadmin, demo company, admin, and worker if they don't exist,
and seeds the default pause types.
Run via: python -m migrations.seed
Or called automatically from lifespan in main.py.
"""
import asyncio
from datetime import time

from sqlalchemy import select, text
from sqlmodel import SQLModel

from app.database import engine, AsyncSessionLocal
from app.models.company import Company
from app.models.user import User, UserRole
from app.models.pausa_tipo import PausaTipo
from app.models.worker_schedule import WorkerSchedule  # noqa: F401 — ensures table is created
from app.models.work_center import WorkCenter  # noqa: F401 — ensures table is created
from app.models.invoice_config import InvoiceConfig  # noqa: F401 — ensures table is created
from app.services.auth import hash_password


DEFAULT_PAUSE_TYPES = [
    "Almuerzo",
    "Comida",
    "Visita Médica",
    "Accidente",
    "Descanso",
    "Otros",
]

DEMO_COMPANY = {"name": "Demo Company", "max_workers": 50}

SEED_USERS = [
    {
        "email": "superadmin@test.com",
        "full_name": "Super Admin",
        "password": "Super1234!",
        "role": UserRole.superadmin,
        "scheduled_start": None,
        "company": None,  # superadmin has no company
    },
    {
        "email": "admin@test.com",
        "full_name": "Admin User",
        "password": "Admin1234!",
        "role": UserRole.admin,
        "scheduled_start": None,
        "company": "demo",
    },
    {
        "email": "worker@test.com",
        "full_name": "Worker User",
        "password": "Worker1234!",
        "role": UserRole.worker,
        "scheduled_start": time(9, 0),
        "company": "demo",
    },
]


async def run_migrations() -> None:
    """
    Apply schema changes to existing tables that create_all won't touch.
    Safe to run multiple times (idempotent). Each step is individually
    guarded so a single failure never prevents the app from starting.
    """
    is_postgres = "postgresql" in str(engine.url)

    if is_postgres:
        # PostgreSQL stores Python enums as native ENUM types.
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction,
        # so we use AUTOCOMMIT isolation level.
        # lock_timeout prevents an indefinite hang if another session holds
        # an exclusive lock on the type (e.g. lingering connections on redeploy).
        try:
            async with engine.execution_options(isolation_level="AUTOCOMMIT").connect() as conn:
                await conn.execute(text("SET lock_timeout = '5s'"))
                await conn.execute(
                    text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'superadmin'")
                )
                print("[migrate] userrole enum updated.")
        except Exception as exc:
            print(f"[migrate] SKIP userrole enum ({exc.__class__.__name__}): {exc}")

    # Create new tables (company, etc.) — skips tables that already exist
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, checkfirst=True))
    except Exception as exc:
        print(f"[migrate] SKIP create_all ({exc.__class__.__name__}): {exc}")

    if is_postgres:
        _pg_migrations = [
            # user columns
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company(id)',
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS vacation_days_type VARCHAR NOT NULL DEFAULT \'laborales\'',
            # fichaje geo columns
            "ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS start_lat DOUBLE PRECISION",
            "ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS start_lng DOUBLE PRECISION",
            "ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS end_lat DOUBLE PRECISION",
            "ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS end_lng DOUBLE PRECISION",
            "ALTER TABLE fichaje ADD COLUMN IF NOT EXISTS out_of_range BOOLEAN",
            # pausa geo columns
            "ALTER TABLE pausa ADD COLUMN IF NOT EXISTS start_lat DOUBLE PRECISION",
            "ALTER TABLE pausa ADD COLUMN IF NOT EXISTS start_lng DOUBLE PRECISION",
            "ALTER TABLE pausa ADD COLUMN IF NOT EXISTS end_lat DOUBLE PRECISION",
            "ALTER TABLE pausa ADD COLUMN IF NOT EXISTS end_lng DOUBLE PRECISION",
            # app_settings columns
            "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_close_enabled BOOLEAN DEFAULT FALSE",
            "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_close_hours INTEGER DEFAULT 12",
            # company columns
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS geo_enabled BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS nif VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS address VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS city VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS postal_code VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS phone VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS billing_email VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS subscription_price DOUBLE PRECISION",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS subscription_discount DOUBLE PRECISION DEFAULT 0",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP",
            "ALTER TABLE company ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMP",
        ]
        for _sql in _pg_migrations:
            try:
                async with engine.begin() as conn:
                    await conn.execute(text(_sql))
            except Exception as exc:
                print(f"[migrate] SKIP ({exc.__class__.__name__}): {_sql[:80]}")

    print("[migrate] Schema up to date.")


async def seed() -> None:
    await run_migrations()

    async with AsyncSessionLocal() as session:
        # Ensure Demo Company exists
        result = await session.execute(
            select(Company).where(Company.name == DEMO_COMPANY["name"])
        )
        demo_company = result.scalar_one_or_none()
        if not demo_company:
            demo_company = Company(
                name=DEMO_COMPANY["name"],
                max_workers=DEMO_COMPANY["max_workers"],
            )
            session.add(demo_company)
            await session.flush()
            print(f"[seed] Created company: {DEMO_COMPANY['name']}")
        else:
            print(f"[seed] Company '{DEMO_COMPANY['name']}' already exists, skipping.")

        # Seed users
        for data in SEED_USERS:
            result = await session.execute(
                select(User).where(User.email == data["email"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                # Assign company if missing (migration helper for existing installs)
                if existing.company_id is None and data["company"] == "demo":
                    existing.company_id = demo_company.id
                    session.add(existing)
                    print(f"[seed] Assigned company to existing user: {data['email']}")
                else:
                    print(f"[seed] User {data['email']} already exists, skipping.")
                continue

            company_id = demo_company.id if data["company"] == "demo" else None
            user = User(
                email=data["email"],
                full_name=data["full_name"],
                hashed_password=hash_password(data["password"]),
                role=data["role"],
                scheduled_start=data["scheduled_start"],
                company_id=company_id,
            )
            session.add(user)
            print(f"[seed] Created user: {data['email']}")

        await session.commit()

    # Seed default pause types
    async with AsyncSessionLocal() as session:
        for name in DEFAULT_PAUSE_TYPES:
            result = await session.execute(
                select(PausaTipo).where(PausaTipo.name == name)
            )
            if not result.scalar_one_or_none():
                session.add(PausaTipo(name=name))
                print(f"[seed] Created pause type: {name}")
            else:
                print(f"[seed] Pause type '{name}' already exists, skipping.")
        await session.commit()

    print("[seed] Done.")


if __name__ == "__main__":
    asyncio.run(seed())
