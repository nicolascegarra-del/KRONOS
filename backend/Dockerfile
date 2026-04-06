FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=8 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD ["gunicorn", "app.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", "--workers", "1", "--bind", "0.0.0.0:8000", "--timeout", "120", "--graceful-timeout", "30", "--keepalive", "5", "--max-requests", "500", "--max-requests-jitter", "100"]
