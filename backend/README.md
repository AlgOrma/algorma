# AlgOrma — Backend (FastAPI)

REST API for the AlgOrma DSA tracker. **FastAPI + SQLModel + SQLite**, with an
FSRS spaced-repetition scheduler shared by problem reviews and flashcards.

Data is **per-user** (no authentication): each request is scoped to the current
profile, resolved from an `X-User-Id` header. A fresh install has an **empty
users table** — the first profile is created through onboarding (`POST /users`),
and user-scoped endpoints require the header (there is no default profile).
Problems, flashcards, and the template library belong to a user (each new
profile gets its own editable copy of the starter templates); topics,
problem-pattern tags, and the LeetCode question catalog are shared global
reference data; curriculums are seeded global lists plus any the user creates.
Spaced-repetition state lives in its own per-user `Revision` table (one row per
item), kept separate from the content rows. Rows scheduled by the old SM-2 code
migrate to FSRS automatically on their next grade (their `ReviewLog` history is
replayed).

## Layout

```
backend/
├── app/
│   ├── main.py          # FastAPI app, CORS, router wiring, DB init on startup
│   ├── config.py        # settings from .env (pydantic-settings)
│   ├── db.py            # engine + session dependency
│   ├── deps.py          # get_current_user (requires X-User-Id header → User)
│   ├── models.py        # tables: User, Topic, Pattern, Problem (+ approaches), TemplatePattern/Variation, Flashcard, Revision, ReviewLog, LeetCodeQuestion, Curriculum
│   ├── revisions.py     # per-user SRS state: get-or-create + grading (incl. SM-2 → FSRS replay)
│   ├── schemas.py       # request bodies (camelCase, matches the frontend)
│   ├── srs.py           # FSRS scheduler (py-fsrs) + per-grade interval previews
│   ├── serialize.py     # emits the exact JSON shape the React frontend reads
│   ├── seed.py          # seeds global topics + holds the per-user starter template library
│   ├── bootstrap.py     # `python -m app.bootstrap`: run migrations + all seeds in order
│   └── routers/         # users, problems, topics, templates, flashcards, stats, leetcode_questions, leetcode_sync, curriculums
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

# one command: create the DB, run schema migrations, and seed all reference data
# (topics, LeetCode questions, and study curriculums). Idempotent — safe to re-run.
python -m app.bootstrap

# run the API with reload (http://localhost:8000, docs at /docs)
uvicorn app.main:app --reload --port 8000
```

> [!NOTE]
> `app.bootstrap` is the single source of truth for setup: it runs the schema
> migrations and every seed in order. **Adding a new migration or seed?** Wire it
> into `run()` in [`app/bootstrap.py`](app/bootstrap.py) — the setup command stays
> `python -m app.bootstrap`, so this README (and everyone's install flow) never
> needs to change. Re-run it after `git pull` to apply new migrations. The
> individual seeds still exist (`app.seed`, `app.seed_leetcode`,
> `app.seed_curriculums`) if you need to run just one.

Tables and schema migrations are also applied automatically on app startup, so
the API is usable even without seeding — the seeds just cache the shared topics,
template library, LeetCode pool, and curriculums. Users, problems, and flashcards
are created at runtime through the app.

If you start the API before seeding, startup prints a clear, non-blocking warning
telling you to run `python -m app.bootstrap` — so you don't have to know about the
command in advance:

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  Setup incomplete: no topics, LeetCode questions, study curriculums found.
  The schema is migrated, but reference data has not been seeded.
  Run this once (idempotent, safe to re-run):
      python -m app.bootstrap
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

## Database & migrations

There's no Alembic. Setup has two layers, both idempotent and both driven by
`app.bootstrap` (so you never run steps individually or update this README when
you add one):

1. **Schema migrations** — structural changes (`CREATE TABLE`, `ALTER TABLE`,
   backfills). They live in `init_db()` in [`app/db.py`](app/db.py) and run
   automatically **on every app startup** (via `main.py`'s lifespan) and at the
   start of `bootstrap`. Each is guarded by a column/table check, so re-running
   is a no-op on an already-migrated database.
2. **Reference-data seeds** — content, not structure: topics
   ([`seed.py`](app/seed.py)), the LeetCode catalog
   ([`seed_leetcode.py`](app/seed_leetcode.py)), and curriculums
   ([`seed_curriculums.py`](app/seed_curriculums.py)). Each exposes an idempotent
   `run()`. The last two fetch from GitHub, so they need network.

`bootstrap` runs the schema migrations, then all three seeds, in order.

### Adding a migration or seed

- **New schema change:** add an idempotent block to `init_db()` in `db.py`, guarded
  by an existence check (see the `checklist_progress` / `leetcode_id` examples). It
  applies on the next app startup or `bootstrap` run — nothing else to wire up.
- **New seed:** add a module with a `run()` and register it in `run()` in
  [`app/bootstrap.py`](app/bootstrap.py).

Either way the setup command stays `python -m app.bootstrap`, so **this README
never changes**. To apply new migrations after `git pull`, just re-run
`python -m app.bootstrap` (or, for schema-only changes, simply start the server).

## API

Base URL: `http://localhost:8000/api` · Interactive docs at `/docs`.

All routes are scoped to the current user and **require** an `X-User-Id: <id>`
header (the id returned by `POST /users`), except `/health`, `/users`
(create/list), and the read-only LeetCode catalog (`GET /leetcode-questions`,
`GET /leetcode-questions/{id}`). Requests without it get
`400 Missing X-User-Id header`.

| Method | Path                     | Description                                   |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/health`                | liveness check                                |
| GET    | `/users`                 | list profiles (profile recovery / future switcher) |
| POST   | `/users`                 | create a profile → returns `id`               |
| GET    | `/users/me`              | the current profile (from `X-User-Id`)        |
| PATCH  | `/users/me`              | update name / email / timezone / dailyGoal / bio |
| GET    | `/stats`                 | dashboard summary (solved, due, streak, …); `tzOffset` buckets days in local time |
| GET    | `/stats/activity`        | daily review counts for the heatmap; params: `weeks`, `tzOffset` |
| GET    | `/topics`                | topics with `pct` / `frac` mastery (per-user) |
| GET    | `/templates`             | the user's template library (patterns → variations) |
| POST   | `/templates`             | create a pattern                              |
| PATCH  | `/templates/{id}`        | update a pattern / its variations             |
| DELETE | `/templates/{id}`        | delete a pattern                              |
| POST   | `/templates/reorder`     | persist a new pattern order (`{ ids }`, top-to-bottom) |
| POST   | `/templates/{id}/variations/reorder` | reorder variations within a pattern |
| GET    | `/problems`              | list; filters: `topic,difficulty,status,due`  |
| POST   | `/problems`              | create                                        |
| GET    | `/problems/{id}`         | one problem                                   |
| PATCH  | `/problems/{id}`         | update fields / status / patterns             |
| DELETE | `/problems/{id}`         | delete                                        |
| POST   | `/problems/{id}/review`  | body `{ "grade": "Good" }` → reschedule (FSRS)|
| GET    | `/problems/{id}/reviews` | grading history, oldest first                 |
| GET    | `/leetcode-questions`    | search the catalog; filters: `q,difficulty,tag,curriculum` + `page,limit` |
| GET    | `/leetcode-questions/{id}` | one catalog question                        |
| POST   | `/leetcode-questions/{id}/import` | import it into your problem bank     |
| POST   | `/leetcode/sync`         | sync solved LeetCode problems into the bank as `Done` (see below) |
| GET    | `/curriculums`           | global curriculums + the user's own           |
| POST   | `/curriculums`           | create a curriculum (always user-owned)       |
| GET    | `/curriculums/{id_or_slug}` | one curriculum with its questions          |
| DELETE | `/curriculums/{id}`      | delete (own curriculums only)                 |
| POST   | `/curriculums/{id}/questions` | add catalog questions (`{ questionIds }`)|
| DELETE | `/curriculums/{id}/questions/{leetcodeId}` | remove one question         |
| GET    | `/flashcards`            | list; filter: `due` *(feature-flagged)*       |
| POST   | `/flashcards/{id}/review`| body `{ "grade": "Good" }` *(feature-flagged)*|

`grade` ∈ `Again | Hard | Good | Easy`. Creating a problem auto-creates its
`Revision` (SRS) row; grading reads/updates that row and appends a `ReviewLog`.

### LeetCode account sync

`POST /leetcode/sync` marks everything you've solved on leetcode.com as `Done`
here: body `{ "username": "…" }` and/or `{ "sessionCookie": "…" }`.

- **`sessionCookie`** (the browser's `LEETCODE_SESSION` value) fetches your
  **complete** accepted history via LeetCode's authenticated
  `/api/problems/all/` endpoint. The cookie is used for that single request
  and never stored.
- **`username` only** uses the public `recentAcSubmissionList` GraphQL query,
  which LeetCode caps at ~20 recent accepted submissions — fine for topping
  up, not for the first import.

Solved questions are matched against the local catalog (`leetcode_question`):
ones already in your bank are flipped to `Done`, the rest are imported as
`Done` problems with a `Revision` row. Repeat syncs are idempotent (they show
up in the response's `alreadyDone` count). The resolved username is saved to
the profile (`leetcodeUsername`) so the UI can prefill the next sync.

> [!NOTE]
> The flashcards endpoints are off by default (the UI isn't implemented yet).
> Set `ENABLE_FLASHCARDS=true` in `.env` to expose them; the frontend side is
> gated separately by `FEATURES.flashcards` in `frontend/src/features.js`.

## Tests & linting

```bash
pip install -r requirements-dev.txt
pytest        # full suite: every router over HTTP, serializers, FSRS scheduling, SM-2 replay
ruff check app/ tests/
```

Tests run against an in-memory SQLite database (see `tests/conftest.py`) — no
setup, no network, and the dev `algorma.db` is never touched. Router tests go
over real HTTP via the `client` fixture (routing, validation, and the camelCase
serialization are all exercised); pure logic (FSRS, serializers, slugify) is
unit-tested directly. Both suites also run from the repo's pre-push hook
(`git config core.hooksPath .githooks`).

## Frontend contract

`serialize.py` returns problems in the exact camelCase shape the React app
consumes (`exIn`, `exOut`, `due`, `created`, `lastRevised`, `nextLabel`,
`nextColor`, `dueMeta`, `revisions`, `patterns`, `topic` as a name), plus raw
fields (`dueAt`, `easeFactor`, …) for client-side formatting. The consumer is
the fetch client in [`frontend/src/api.js`](../frontend/src/api.js), which
covers every endpoint in the table above — see the root README's
"Architecture" section for what lives in the API vs. `localStorage`.
