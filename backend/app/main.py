import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, users, fichajes, reports, pause_types, notifications, companies, worker_schedule, work_centers, superadmin_users
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    from migrations.seed import seed
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


@app.get("/health")
async def health():
    return {"status": "ok"}
