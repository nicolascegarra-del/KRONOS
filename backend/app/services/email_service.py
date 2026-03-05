import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.models.email_config import EmailConfig


async def send_email(config: EmailConfig, to: str, subject: str, body_html: str) -> None:
    """Send an email using the stored SMTP configuration (runs in a thread)."""

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{config.from_name} <{config.from_email}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

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
        server.quit()

    await asyncio.to_thread(_send)
