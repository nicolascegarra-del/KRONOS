import io
import csv
from typing import BinaryIO

import pandas as pd


CSV_TEMPLATE_HEADERS = ["email", "full_name", "password", "scheduled_start"]
CSV_TEMPLATE_EXAMPLE = [
    ["worker1@company.com", "Worker One", "Pass1234!", "09:00"],
    ["worker2@company.com", "Worker Two", "Pass1234!", "08:30"],
]


def generate_csv_template() -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_TEMPLATE_HEADERS)
    writer.writerows(CSV_TEMPLATE_EXAMPLE)
    return output.getvalue().encode("utf-8")


def parse_workers_csv(file_content: bytes) -> list[dict]:
    """Parse CSV or Excel file, return list of dicts with worker data."""
    # Try Excel first, fall back to CSV
    try:
        df = pd.read_excel(io.BytesIO(file_content))
    except Exception:
        df = pd.read_csv(io.BytesIO(file_content))

    required = {"email", "full_name", "password"}
    missing = required - set(df.columns.str.lower())
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df.columns = df.columns.str.lower()
    workers = []
    for _, row in df.iterrows():
        scheduled_start = None
        if "scheduled_start" in df.columns and pd.notna(row.get("scheduled_start")):
            try:
                from datetime import time
                parts = str(row["scheduled_start"]).split(":")
                scheduled_start = time(int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                scheduled_start = None

        workers.append(
            {
                "email": str(row["email"]).strip(),
                "full_name": str(row["full_name"]).strip(),
                "password": str(row["password"]).strip(),
                "scheduled_start": scheduled_start,
            }
        )
    return workers
