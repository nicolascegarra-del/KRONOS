from datetime import datetime
from typing import Optional

from app.models.fichaje import Fichaje
from app.models.pausa import Pausa
from app.models.user import User


def calculate_pause_minutes(pausas: list[Pausa]) -> int:
    """Sum of all completed pause durations in minutes."""
    total = 0
    for p in pausas:
        if p.end_time is not None:
            delta = p.end_time - p.start_time
            total += int(delta.total_seconds() / 60)
    return total


def calculate_total_minutes(fichaje: Fichaje, pausas: list[Pausa]) -> int:
    """Net worked minutes = (end - start) - sum(pause durations)."""
    end = fichaje.end_time if fichaje.end_time is not None else datetime.utcnow()
    start = fichaje.start_time
    gross = int((end - start).total_seconds() / 60)
    return max(0, gross - calculate_pause_minutes(pausas))


def calculate_late_minutes(user: User, fichaje: Fichaje) -> int:
    """Minutes after scheduled_start the worker clocked in. 0 if on time."""
    if user.scheduled_start is None:
        return 0

    # Strip tzinfo if present — DB stores naive UTC; tests may pass tz-aware datetimes
    start = fichaje.start_time.replace(tzinfo=None)
    scheduled_dt = datetime.combine(start.date(), user.scheduled_start)
    diff = int((start - scheduled_dt).total_seconds() / 60)
    return max(0, diff)
