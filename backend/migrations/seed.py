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
    """Apply schema changes to existing tables that create_all won't touch."""
    async with engine.begin() as conn:
        # 1. Create any brand-new tables (company, etc.) — skips existing ones
        await conn.run_sync(SQLModel.metadata.create_all)

        # 2. Add company_id column to user table if it doesn't exist yet
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS company_id UUID
            REFERENCES company(id)
        """))
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
                # Assign company if missing (migration helper for existing installations)
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
