import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, List, Dict, Any

from app.models.email_config import EmailConfig


async def send_email(config: EmailConfig, to: str, subject: str, body_html: str) -> None:
    """Send an email using the stored SMTP configuration (runs in a thread)."""

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{config.from_name} <{config.from_email}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

        server = None
        try:
            if config.use_tls:
                server = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=10)

            if config.smtp_user and config.smtp_password:
                server.login(config.smtp_user, config.smtp_password)

            server.sendmail(config.from_email, to, msg.as_string())
        finally:
            if server:
                try:
                    server.quit()
                except Exception:
                    pass

    await asyncio.to_thread(_send)


async def send_welcome_email(
    config: Optional[EmailConfig],
    to_email: str,
    full_name: str,
    password: str,
    app_url: str,
) -> None:
    if not config or not config.smtp_host:
        return
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1e293b">Bienvenido/a a Fichajes</h2>
      <p>Hola <strong>{full_name}</strong>,</p>
      <p>Tu cuenta ha sido creada. Aquí tienes tus credenciales de acceso:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email:</td><td><strong>{to_email}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Contraseña:</td><td><strong>{password}</strong></td></tr>
      </table>
      <p>
        <a href="{app_url}/login" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Iniciar sesión
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Por seguridad te recomendamos cambiar tu contraseña tras el primer acceso.
      </p>
    </div>
    """
    await send_email(config, to_email, "Bienvenido/a a Fichajes — tus credenciales de acceso", html)


async def send_password_reset_email(
    config: Optional[EmailConfig],
    to_email: str,
    full_name: str,
    reset_link: str,
) -> None:
    if not config or not config.smtp_host:
        return
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1e293b">Recuperar contraseña</h2>
      <p>Hola <strong>{full_name}</strong>,</p>
      <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>
        <a href="{reset_link}" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Restablecer contraseña
        </a>
      </p>
      <p style="color:#64748b;font-size:13px">Este enlace caduca en <strong>1 hora</strong>.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Si no solicitaste este cambio, puedes ignorar este mensaje.
      </p>
    </div>
    """
    await send_email(config, to_email, "Restablecer contraseña — Fichajes", html)


async def send_admin_password_reset_email(
    config: Optional[EmailConfig],
    to_email: str,
    full_name: str,
    new_password: str,
    app_url: str,
) -> None:
    if not config or not config.smtp_host:
        return
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1e293b">Tu contraseña ha sido restablecida</h2>
      <p>Hola <strong>{full_name}</strong>,</p>
      <p>Un administrador ha restablecido tu contraseña. Tu nueva contraseña temporal es:</p>
      <p style="font-size:18px;font-weight:700;letter-spacing:2px;background:#f1f5f9;padding:12px 16px;border-radius:6px;display:inline-block">
        {new_password}
      </p>
      <p>
        <a href="{app_url}/login" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Iniciar sesión
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Por seguridad te recomendamos cambiar tu contraseña tras iniciar sesión.
      </p>
    </div>
    """
    await send_email(config, to_email, "Tu contraseña ha sido restablecida — Fichajes", html)


async def send_fichaje_code_email(
    config: Optional[EmailConfig],
    to_email: str,
    full_name: str,
    code: str,
    company_name: Optional[str] = None,
) -> None:
    """Envía al trabajador su código de fichaje para la pantalla tablet/kiosco."""
    if not config or not config.smtp_host:
        return
    company_line = f" en <strong>{company_name}</strong>" if company_name else ""
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1e293b">Tu código de fichaje</h2>
      <p>Hola <strong>{full_name}</strong>,</p>
      <p>Este es tu código personal para fichar entrada y salida en la pantalla tablet{company_line}:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:8px;background:#f1f5f9;padding:16px 24px;border-radius:8px;display:inline-block;text-align:center">
        {code}
      </p>
      <p style="color:#64748b;font-size:13px">
        Introduce este código en la tablet: si no tienes la jornada iniciada registrará tu <strong>entrada</strong>;
        si ya la tienes iniciada registrará tu <strong>salida</strong>.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        No compartas este código con nadie. Si crees que alguien lo conoce, avisa a tu responsable para cambiarlo.
      </p>
    </div>
    """
    await send_email(config, to_email, "Tu código de fichaje — Fichajes", html)


async def send_monthly_report_email(
    config: Optional[EmailConfig],
    to_email: str,
    full_name: str,
    month_label: str,
    fichajes_rows: List[Dict[str, Any]],
) -> None:
    if not config or not config.smtp_host:
        return

    rows_html = ""
    for f in fichajes_rows:
        rows_html += (
            f"<tr>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{f.get('date','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{f.get('start','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{f.get('end','—')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #e2e8f0'>{f.get('total','—')}</td>"
            f"</tr>"
        )

    html = f"""
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
      <h2 style="color:#1e293b">Resumen de fichajes — {month_label}</h2>
      <p>Hola <strong>{full_name}</strong>, aquí tienes tu resumen de fichajes de <strong>{month_label}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="text-align:left;padding:8px 10px">Fecha</th>
            <th style="text-align:left;padding:8px 10px">Entrada</th>
            <th style="text-align:left;padding:8px 10px">Salida</th>
            <th style="text-align:left;padding:8px 10px">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows_html if rows_html else "<tr><td colspan='4' style='padding:12px 10px;color:#94a3b8'>Sin fichajes este mes</td></tr>"}
        </tbody>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Puedes desactivar este resumen en tu perfil.
      </p>
    </div>
    """
    await send_email(config, to_email, f"Resumen de fichajes {month_label} — Fichajes", html)
