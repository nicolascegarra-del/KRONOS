import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, Cookie, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import get_current_user
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

REFRESH_COOKIE = "refresh_token"


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No existe ninguna cuenta con ese email",
        )

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Contraseña incorrecta",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada",
        )

    access_token = create_access_token(user.id, user.role, user.full_name, user.geo_consent, user.privacy_notice_accepted, user.company_id)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        secure=settings.APP_ENV == "production",
    )

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    session: AsyncSession = Depends(get_session),
    refresh_token: str = Cookie(default=None, alias=REFRESH_COOKIE),
):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await session.execute(select(User).where(User.id == UUID(payload["sub"])))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access = create_access_token(user.id, user.role, user.full_name, user.geo_consent, user.privacy_notice_accepted, user.company_id)
    new_refresh = create_refresh_token(user.id)

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=new_refresh,
        httponly=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        secure=settings.APP_ENV == "production",
    )

    return TokenResponse(access_token=new_access)


@router.post("/logout")
async def logout(
    response: Response,
    _current_user: User = Depends(get_current_user),
):
    response.delete_cookie(REFRESH_COOKIE)
    return {"message": "Logged out"}


# ── Password reset ─────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """Always returns 200 to avoid leaking whether an email is registered."""
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        token_value = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token_value,
            expires_at=expires,
        )
        session.add(reset_token)
        await session.commit()

        reset_link = f"{settings.APP_URL}/reset-password?token={token_value}"
        import asyncio
        asyncio.create_task(_fire_password_reset_email(user, reset_link))

    return {"message": "Si existe esa cuenta, recibirás un email con instrucciones."}


async def _fire_password_reset_email(user: User, reset_link: str) -> None:
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_password_reset_email

        async with AsyncSessionLocal() as session:
            config = await _get_email_config(session, user.company_id)
        await send_password_reset_email(config, user.email, user.full_name, reset_link)
    except Exception as exc:
        print(f"[forgot-password-email] Error: {exc}")


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token)
    )
    token_row = result.scalar_one_or_none()

    now = datetime.utcnow()

    if not token_row or token_row.used_at is not None or token_row.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace no es válido o ha caducado.",
        )

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La contraseña debe tener al menos 8 caracteres",
        )

    user_result = await session.execute(select(User).where(User.id == token_row.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario no encontrado")

    user.hashed_password = hash_password(body.new_password)
    token_row.used_at = now
    session.add(user)
    session.add(token_row)
    await session.commit()

    return {"message": "Contraseña actualizada correctamente."}
