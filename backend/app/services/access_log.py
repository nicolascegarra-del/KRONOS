from uuid import UUID


async def log_admin_access(admin_id: UUID, action: str, details: str | None = None) -> None:
    """Fire-and-forget: write an AdminAccessLog row using a fresh session."""
    try:
        from app.database import AsyncSessionLocal
        from app.models.adminaccesslog import AdminAccessLog
        async with AsyncSessionLocal() as s:
            log = AdminAccessLog(admin_id=admin_id, action=action, details=details)
            s.add(log)
            await s.commit()
    except Exception:
        pass
