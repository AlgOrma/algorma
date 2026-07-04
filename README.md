# AlgOrma

A personal Data Structures & Algorithms practice tracker with **FSRS spaced
repetition** — track problems, store spoiler-free solutions, study reusable
patterns, and revise problem cards on a schedule. (Flashcards are
feature-flagged off until implemented — see `frontend/src/features.js`.)

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


**Frontend** (http://localhost:5173):

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

## Connecting the frontend to the API

The UI currently keeps its data in `localStorage` (see `frontend/src/App.jsx` +
`src/hooks/useLocalStorage.js`), seeded from `src/data/initialData.js`. The API
returns problems in that same shape, so switching to live data is incremental:

1. Add `VITE_API_URL=http://localhost:8000/api` to `frontend/.env`.
2. Create a small `src/api.js` client (`fetch` wrappers for the endpoints below).
3. Replace the `useLocalStorage('dsa_problems', …)` / `dsa_cards` state with data
   fetched on mount; on save/grade, call the API and use the returned object.

| Frontend action                | API call                                            |
| ------------------------------ | --------------------------------------------------- |
| Load dashboard                 | `GET /stats`, `GET /problems?due=true`, `GET /topics` |
| Load problem bank              | `GET /problems`                                     |
| Save problem (modal)           | `POST /problems`                                    |
| Update / mark complete         | `PATCH /problems/{id}`                              |
| Grade in a revision session    | `POST /problems/{id}/review` `{ grade }`            |
| Flashcards (flagged off)       | `GET /flashcards?due=true`, `POST /flashcards/{id}/review` |
| Templates                      | `GET /templates`                                    |
```
