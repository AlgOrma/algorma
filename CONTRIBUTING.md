# Contributing to AlgOrma

Thanks for your interest in contributing! AlgOrma is a personal DSA practice
tracker, but issues and pull requests are welcome.

## Getting set up

Follow the [root README](README.md) to run both halves locally:

- **Backend** — FastAPI + SQLModel + SQLite (`backend/`, Python 3, virtualenv,
  `python -m app.bootstrap` to create and seed the DB).
- **Frontend** — React 19 + Vite + Tailwind CSS v4 (`frontend/`, `npm install`,
  `npm run dev`).

## Before you push

Enable the version-controlled pre-push hook once per clone — it runs the same
checks CI would and blocks the push if anything fails:

```bash
git config core.hooksPath .githooks
pip install -r backend/requirements-dev.txt   # adds ruff (use the backend venv)
```

You can also run the checks manually:

```bash
# frontend
cd frontend && npm run lint && npm run build

# backend
cd backend && ruff check app/ tests/ && pytest
```

Please keep `oxlint` and `ruff` clean and make sure `pytest` passes.

## Pull requests

- Open an issue first for anything larger than a small fix, so we can discuss
  the approach before you invest time in it.
- Keep PRs focused — one change per PR is easier to review.
- Match the style of the surrounding code; add tests for backend behavior
  changes (see `backend/tests/` for examples).
- Describe **what** the change does and **why** in the PR description.

## Reporting bugs

Use the issue templates. Include your OS, how you're running the app, and
steps to reproduce — a screenshot helps a lot for UI issues.
