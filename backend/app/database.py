from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    future=True,
    pool_pre_ping=True,      # test connection before use (prevents stale conn errors)
    pool_size=10,            # max persistent connections
    max_overflow=20,         # extra burst connections allowed
    pool_recycle=1800,       # recycle connections after 30 min (avoids idle timeouts)
    pool_timeout=30,         # raise after 30s waiting for a connection (explicit, avoids silent hangs)
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, checkfirst=True))


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
