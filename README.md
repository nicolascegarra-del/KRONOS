# Fichajes — Worker Time Tracking PWA

Mobile-first PWA for worker shift management. Workers can clock in/out and add pauses. Admins manage users and view hours reports.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + SQLModel + PostgreSQL |
| Frontend | Next.js 14 + Tailwind CSS + Shadcn/ui |
| Auth | JWT (access token in memory, refresh token in HttpOnly cookie) |
| Deployment | Docker + Docker Compose / Coolify |

---

## Quick Start (Docker)

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your passwords and secret key

# 2. Build and start all services
docker-compose up --build

# Services:
#   Frontend → http://localhost:3000
#   Backend  → http://localhost:8000
#   API docs → http://localhost:8000/docs
```

### Default seed users

| Email | Password | Role |
|---|---|---|
| admin@test.com | Admin1234! | admin |
| worker@test.com | Worker1234! | worker |

---

## Development (hot reload)

The `docker-compose.override.yml` is applied automatically in development:

```bash
docker-compose up
```

Or run services individually:

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
FICHAJES/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan (seed on startup)
│   │   ├── config.py            # Pydantic Settings
│   │   ├── database.py          # Async SQLAlchemy engine
│   │   ├── dependencies.py      # JWT auth dependencies
│   │   ├── models/              # SQLModel ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # API route handlers
│   │   └── services/            # Business logic (auth, hours, import/export)
│   ├── migrations/seed.py       # Creates seed users idempotently
│   └── tests/                   # Pytest test suite
├── frontend/
│   ├── app/
│   │   ├── login/               # Login page
│   │   ├── worker/              # Worker shell + dashboard + history
│   │   └── admin/               # Admin shell + dashboard + users + reports
│   ├── components/              # Shared UI components
│   ├── lib/                     # API client, auth helpers, utils
│   ├── store/                   # Zustand auth store
│   └── e2e/                     # Playwright E2E tests
└── docker-compose.yml
```

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/login | Public | Login, returns JWT + sets refresh cookie |
| POST | /auth/refresh | Cookie | Refresh access token |
| POST | /auth/logout | Auth | Clear refresh cookie |
| GET | /users | Admin | List all users |
| POST | /users | Admin | Create user |
| PUT | /users/{id} | Admin | Update user |
| DELETE | /users/{id} | Admin | Deactivate user |
| GET | /users/template | Admin | Download CSV import template |
| POST | /users/import | Admin | Import users from CSV/Excel |
| POST | /fichajes/start | Worker | Clock in |
| POST | /fichajes/end | Worker | Clock out (computes totals) |
| POST | /fichajes/pause | Worker | Start pause (comment required) |
| POST | /fichajes/resume | Worker | End pause |
| GET | /fichajes/active | Worker | Current active fichaje |
| GET | /fichajes/me | Worker | Personal history |
| GET | /reports/hours | Admin | Hours per worker with date range |
| GET | /reports/alerts | Admin | Workers who started late |

---

## Testing

### Backend (Pytest)
```bash
cd backend
pip install -r requirements.txt
pytest
```

### Frontend E2E (Playwright)
```bash
cd frontend
npm install
npx playwright install
npx playwright test
```

---

## Deployment on Coolify

1. Push repository to GitHub/GitLab
2. Create a new Compose-based service in Coolify
3. Point to your repository and `docker-compose.yml`
4. Set environment variables from `.env.example`
5. Deploy — Coolify handles TLS, domains, and restarts

---

## PWA

- Add to Home Screen on iOS/Android for native-like experience
- Offline shell cached by service worker (via next-pwa)
- Icons at `/public/icons/icon-192.png` and `icon-512.png` (add your own)
