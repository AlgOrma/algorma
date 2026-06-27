# AlgOrma — Backend (FastAPI)

REST API for the AlgOrma DSA tracker. **FastAPI + SQLModel + SQLite**, with an
SM-2 spaced-repetition scheduler shared by problem reviews and flashcards.

Data is **per-user** (no authentication): each request is scoped to the current
profile, resolved from an `X-User-Id` header. A fresh install has an **empty
users table** — the first profile is created through onboarding (`POST /users`),
and user-scoped endpoints require the header (there is no default profile).
Problems and flashcards belong to a user; topics, patterns, and templates are a
shared global bank. Spaced-repetition state lives in its own per-user `Revision`
table (one row per item), kept separate from the content rows and ready to swap
SM-2 for FSRS later.

## Layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router wiring, DB init on startup
│   ├── config.py        # settings from .env (pydantic-settings)
│   ├── db.py            # engine + session dependency
│   ├── deps.py          # get_current_user (requires X-User-Id header → User)
│   ├── models.py        # tables: User, Topic, Pattern, Problem, Template, Flashcard, Revision, ReviewLog
│   ├── revisions.py     # get-or-create helpers for per-user SRS state
│   ├── schemas.py       # request bodies (camelCase, matches the frontend)
│   ├── srs.py           # SM-2 scheduler (swappable for FSRS later)
│   ├── serialize.py     # emits the exact JSON shape the React frontend reads
│   ├── seed.py          # seeds global reference data only (topics + templates)
│   └── routers/         # users, problems, topics, templates, flashcards, stats
├── requirements.txt
└── .env.example
```

## Setup

Run everything from the `backend/` directory.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# create the SQLite DB + seed global reference data (topics + templates)
python -m app.seed

# seed or incrementally reseed LeetCode questions (idempotent, does not wipe user data)
python -m app.seed_leetcode

# run the API with reload (http://localhost:8000, docs at /docs)
uvicorn app.main:app --reload --port 8000
```

Tables are auto-created on app startup, so the seed steps are optional — they
cache the shared topics, template library, and LeetCode questions pool. Users,
problems, and flashcards are created at runtime through the app.

## API

Base URL: `http://localhost:8000/api` · Interactive docs at `/docs`.

All routes except `/health` and `/users` (create/list) are scoped to the current
user and **require** an `X-User-Id: <id>` header (the id returned by
`POST /users`). Requests without it get `400 Missing X-User-Id header`.

| Method | Path                     | Description                                   |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/health`                | liveness check                                |
| GET    | `/users`                 | list profiles (for a future switcher)         |
| POST   | `/users`                 | create a profile → returns `id`               |
| GET    | `/users/me`              | the current profile (from `X-User-Id`)        |
| PATCH  | `/users/me`              | update name / email / timezone / dailyGoal / bio |
| GET    | `/stats`                 | dashboard summary (solved, due, streak, …)    |
| GET    | `/topics`                | topics with `pct` / `frac` mastery (per-user) |
| GET    | `/templates`             | pattern library (global)                      |
| GET    | `/problems`              | list; filters: `topic,difficulty,status,due`  |
| POST   | `/problems`              | create                                        |
| GET    | `/problems/{id}`         | one problem                                   |
| PATCH  | `/problems/{id}`         | update fields / status / patterns             |
| DELETE | `/problems/{id}`         | delete                                        |
| POST   | `/problems/{id}/review`  | body `{ "grade": "Good" }` → reschedule (SM-2)|
| GET    | `/flashcards`            | list; filter: `due`                           |
| POST   | `/flashcards/{id}/review`| body `{ "grade": "Good" }` → reschedule (SM-2)|

`grade` ∈ `Again | Hard | Good | Easy`. Creating a problem auto-creates its
`Revision` (SRS) row; grading reads/updates that row and appends a `ReviewLog`.

## Frontend contract

`serialize.py` returns problems in the exact shape `frontend/src/data/initialData.js`
uses (`exIn`, `exOut`, `due`, `created`, `lastRevised`, `nextLabel`, `nextColor`,
`dueMeta`, `revisions`, `patterns`, `topic` as a name), plus raw fields
(`dueAt`, `easeFactor`, …) for future client-side formatting. That makes the swap
from `useLocalStorage` to `fetch` close to drop-in — see the repo root README for
the wiring steps.
