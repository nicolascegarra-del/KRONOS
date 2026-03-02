"""
Seed script: creates admin@test.com and worker@test.com if they don't exist,
and seeds the default pause types.
Run via: python -m migrations.seed
Or called automatically from lifespan in main.py.
"""
import asyncio
from datetime import time

from sqlalchemy import select
from sqlmodel import SQLModel

from app.database import engine, AsyncSessionLocal
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

SEED_USERS = [
    {
        "email": "admin@test.com",
        "full_name": "Admin User",
        "password": "Admin1234!",
        "role": UserRole.admin,
        "scheduled_start": None,
    },
    {
        "email": "worker@test.com",
        "full_name": "Worker User",
        "password": "Worker1234!",
        "role": UserRole.worker,
        "scheduled_start": time(9, 0),
    },
]


async def seed() -> None:
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async with AsyncSessionLocal() as session:
        for data in SEED_USERS:
            result = await session.execute(
                select(User).where(User.email == data["email"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                print(f"[seed] User {data['email']} already exists, skipping.")
                continue

            user = User(
                email=data["email"],
                full_name=data["full_name"],
                hashed_password=hash_password(data["password"]),
                role=data["role"],
                scheduled_start=data["scheduled_start"],
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
