# AlgOrma

A personal Data Structures & Algorithms practice tracker with **SM-2 spaced
repetition** — track problems, store spoiler-free solutions, study reusable
patterns, and review with problem cards + flashcards on a schedule.

## Stack

- **`frontend/`** — React 19 + Vite + Tailwind CSS v4 (oxlint). The UI is built.
- **`backend/`** — FastAPI + SQLModel + SQLite. REST API + SM-2 scheduler.

## Run it

**Backend** (http://localhost:8000, docs at `/docs`):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed                       # create + seed the SQLite DB
uvicorn app.main:app --reload --port 8000
```

**Frontend** (http://localhost:5173):

```bash
cd frontend
npm install
npm run dev
```

See [`backend/README.md`](backend/README.md) for the full API reference.

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
| Flashcards                     | `GET /flashcards?due=true`, `POST /flashcards/{id}/review` |
| Templates                      | `GET /templates`                                    |
```
