from datetime import datetime, time, timezone
from uuid import uuid4

import pytest

from app.models.fichaje import Fichaje, FichajeStatus
from app.models.pausa import Pausa
from app.models.user import User, UserRole
from app.services.hours import (
    calculate_total_minutes,
    calculate_late_minutes,
    calculate_pause_minutes,
)


def make_fichaje(start: datetime, end: datetime | None = None) -> Fichaje:
    return Fichaje(
        id=uuid4(),
        user_id=uuid4(),
        start_time=start,
        end_time=end,
        status=FichajeStatus.active,
    )


def make_pausa(start: datetime, end: datetime | None, comment: str = "break") -> Pausa:
    f_id = uuid4()
    return Pausa(
        id=uuid4(),
        fichaje_id=f_id,
        start_time=start,
        end_time=end,
        comment=comment,
    )


def make_worker(scheduled_start: time | None = time(9, 0)) -> User:
    return User(
        id=uuid4(),
        email="w@test.com",
        full_name="Test Worker",
        hashed_password="x",
        role=UserRole.worker,
        scheduled_start=scheduled_start,
    )


def dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2024, 1, 15, hour, minute, tzinfo=timezone.utc)


class TestCalculateTotalMinutes:
    def test_no_pauses(self):
        f = make_fichaje(dt(9), dt(17))
        assert calculate_total_minutes(f, []) == 480

    def test_with_one_pause(self):
        f = make_fichaje(dt(9), dt(17))
        p = make_pausa(dt(12), dt(13))  # 60 min pause
        assert calculate_total_minutes(f, [p]) == 420

    def test_with_multiple_pauses(self):
        f = make_fichaje(dt(9), dt(17))
        p1 = make_pausa(dt(10), dt(10, 15))  # 15 min
        p2 = make_pausa(dt(12), dt(12, 30))  # 30 min
        assert calculate_total_minutes(f, [p1, p2]) == 435

    def test_open_pause_not_counted(self):
        f = make_fichaje(dt(9), dt(17))
        p = make_pausa(dt(12), None)  # open pause
        assert calculate_total_minutes(f, [p]) == 480

    def test_result_non_negative(self):
        f = make_fichaje(dt(9), dt(9, 5))
        p = make_pausa(dt(9), dt(9, 30))  # pause longer than shift
        result = calculate_total_minutes(f, [p])
        assert result >= 0


class TestCalculateLateMinutes:
    def test_on_time(self):
        f = make_fichaje(dt(9, 0))
        w = make_worker(time(9, 0))
        assert calculate_late_minutes(w, f) == 0

    def test_early(self):
        f = make_fichaje(dt(8, 45))
        w = make_worker(time(9, 0))
        assert calculate_late_minutes(w, f) == 0

    def test_late_by_15_minutes(self):
        f = make_fichaje(dt(9, 15))
        w = make_worker(time(9, 0))
        assert calculate_late_minutes(w, f) == 15

    def test_late_by_1_hour(self):
        f = make_fichaje(dt(10, 0))
        w = make_worker(time(9, 0))
        assert calculate_late_minutes(w, f) == 60

    def test_no_scheduled_start(self):
        f = make_fichaje(dt(11, 0))
        w = make_worker(scheduled_start=None)
        assert calculate_late_minutes(w, f) == 0


class TestCalculatePauseMinutes:
    def test_no_pausas(self):
        assert calculate_pause_minutes([]) == 0

    def test_one_pause(self):
        p = make_pausa(dt(12), dt(12, 30))
        assert calculate_pause_minutes([p]) == 30

    def test_open_pause_ignored(self):
        p = make_pausa(dt(12), None)
        assert calculate_pause_minutes([p]) == 0
