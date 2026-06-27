# AlgOrma — Backend (FastAPI)

REST API for the AlgOrma DSA tracker. **FastAPI + SQLModel + SQLite**, with an
SM-2 spaced-repetition scheduler shared by problem reviews and flashcards.

## Layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router wiring, DB init on startup
│   ├── config.py        # settings from .env (pydantic-settings)
│   ├── db.py            # engine + session dependency
│   ├── models.py        # SQLModel tables: Topic, Pattern, Problem, Template, Flashcard, ReviewLog
│   ├── schemas.py       # request bodies (camelCase, matches the frontend)
│   ├── srs.py           # SM-2 scheduler
│   ├── serialize.py     # emits the exact JSON shape the React frontend reads
│   ├── seed.py          # seeds the frontend's initialData.js content
│   └── routers/         # problems, topics, templates, flashcards, stats
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

# create + seed the SQLite database (also creates tables)
python -m app.seed

# run the API with reload (http://localhost:8000, docs at /docs)
uvicorn app.main:app --reload --port 8000
```

Tables are also auto-created on app startup, so the seed step is optional if you
just want an empty DB.

## API

Base URL: `http://localhost:8000/api` · Interactive docs at `/docs`.

| Method | Path                     | Description                                   |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/health`                | liveness check                                |
| GET    | `/stats`                 | dashboard summary (solved, due, streak, …)    |
| GET    | `/topics`                | topics with `pct` / `frac` mastery            |
| GET    | `/templates`             | pattern library                               |
| GET    | `/problems`              | list; filters: `topic,difficulty,status,due`  |
| POST   | `/problems`              | create                                        |
| GET    | `/problems/{id}`         | one problem                                   |
| PATCH  | `/problems/{id}`         | update fields / status / patterns             |
| DELETE | `/problems/{id}`         | delete                                        |
| POST   | `/problems/{id}/review`  | body `{ "grade": "Good" }` → reschedule (SM-2)|
| GET    | `/flashcards`            | list; filter: `due`                           |
| POST   | `/flashcards/{id}/review`| body `{ "grade": "Good" }` → reschedule (SM-2)|

`grade` ∈ `Again | Hard | Good | Easy`.

## Frontend contract

`serialize.py` returns problems in the exact shape `frontend/src/data/initialData.js`
uses (`exIn`, `exOut`, `due`, `created`, `lastRevised`, `nextLabel`, `nextColor`,
`dueMeta`, `revisions`, `patterns`, `topic` as a name), plus raw fields
(`dueAt`, `easeFactor`, …) for future client-side formatting. That makes the swap
from `useLocalStorage` to `fetch` close to drop-in — see the repo root README for
the wiring steps.
