# AlgOrma

A personal Data Structures & Algorithms practice tracker with **FSRS spaced
repetition** — track problems, store spoiler-free solutions, study reusable
patterns, and revise problem cards on a schedule. (Flashcards are
feature-flagged off until implemented — see `frontend/src/features.js`.)

> [!IMPORTANT]
> AlgOrma is a **local, single-machine app**: the backend has no authentication
> (profiles are identified by a plain `X-User-Id` header) and CORS is locked to
> localhost. Don't deploy it to the public internet as-is.

## Stack

- **`frontend/`** — React 19 + Vite + Tailwind CSS v4 (oxlint). The UI is built.
- **`backend/`** — FastAPI + SQLModel + SQLite. REST API + FSRS scheduler.

## Run it

**Backend** (http://localhost:8000, docs at `/docs`):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.bootstrap                   # create the DB, run migrations, seed all reference data
uvicorn app.main:app --reload --port 8000
```

> [!NOTE]
> `python -m app.bootstrap` runs every setup step in order — schema migrations plus the topic, LeetCode, and curriculum seeds — and is idempotent, so it's safe to re-run after pulling changes. It's the single source of truth for setup: new migrations/seeds are wired into `app/bootstrap.py`, so this command never changes even as steps are added. Run it again after `git pull` to pick up any new migrations. The individual seeds (`app.seed`, `app.seed_leetcode`, `app.seed_curriculums`) still exist if you want to run just one.


**Frontend** (http://localhost:5199):

```bash
cd frontend
npm install
npm run dev
```

See [`backend/README.md`](backend/README.md) for the full API reference.

## Pre-push checks

A version-controlled git hook in [`.githooks/pre-push`](.githooks/pre-push) runs
on every `git push` and blocks the push if anything fails:

1. **frontend** — `oxlint` (warnings don't block; errors do) + a Vite production build
2. **backend** — `ruff check` (config in `backend/ruff.toml`)

Enable it once per clone, and install the backend dev tool:

```bash
git config core.hooksPath .githooks
pip install -r backend/requirements-dev.txt   # adds ruff (use the backend venv)
```

Bypass in an emergency with `git push --no-verify`.

## Architecture — where data lives

The React app talks to the API for all core data through the client in
[`frontend/src/api.js`](frontend/src/api.js). There's no auth: on first run the
app walks you through creating a profile (`POST /users`), keeps it in
`localStorage`, and sends its id as an `X-User-Id` header on every request.

**Live via the API:** profiles, problems (CRUD + FSRS review grading and
history), the template library (CRUD + drag-reordering), dashboard stats and
the activity heatmap, the LeetCode question catalog (search + one-click import
into your problem bank), and study curriculums.

**Still in `localStorage`:** client-side state only — the current screen and
selected problem (so reloads land where you left off), the theme, the cached
profile object, and the feature-flagged flashcards deck.

The API base URL defaults to `http://localhost:8000/api`; to override it, copy
`frontend/.env.example` to `frontend/.env` and set `VITE_API_URL`.

## License

[MIT](LICENSE)
