"""One-command setup for the AlgOrma backend.

Takes a fresh clone to a ready-to-serve database by running every setup step in
order, so contributors don't have to remember (or read the README for) the
individual commands:

    python -m app.bootstrap

This module is the single source of truth for the setup sequence. When you add a
new migration or seed step, wire it into ``run()`` below — the README points at
this one command, so it never goes stale.

Steps:
  1. init_db()               create tables + run lightweight schema migrations
  2. seed.run()              global reference data (topics)
  3. seed_leetcode.run()     LeetCode questions catalog          (needs network)
  4. seed_curriculums.run()  default study curriculums           (needs network)

Every step is idempotent and non-destructive: re-running never drops tables or
wipes per-user data, so it's safe on an existing database. The network steps are
best-effort — if you're offline they warn and are skipped, leaving a usable
local database with the reference data.

Run it from the backend/ directory (the SQLite path is relative to it).
"""

from collections.abc import Callable

from . import seed, seed_curriculums, seed_leetcode
from .db import check_setup, init_db


def _step(label: str, fn: Callable[[], None], *, needs_network: bool = False) -> None:
    print(f"\n=== {label} ===")
    try:
        fn()
    except Exception as exc:
        hint = "  (offline? this step needs network)" if needs_network else ""
        print(f"!! skipped '{label}': {exc}{hint}")


def run() -> None:
    print("Bootstrapping AlgOrma backend...")
    _step("Database schema (create tables + migrate)", init_db)
    _step("Reference data (topics)", seed.run)
    _step("LeetCode questions", seed_leetcode.run, needs_network=True)
    _step("Study curriculums", seed_curriculums.run, needs_network=True)

    # Consolidated status. If a network step was skipped (e.g. offline), this
    # prints exactly what's still missing so it can be re-run later.
    if check_setup():
        print("\nSome reference data is still missing (see above). Re-run when ready:")
        print("    python -m app.bootstrap")
    else:
        print("\nBootstrap complete. Start the API with:")
        print("    uvicorn app.main:app --reload --port 8000")


if __name__ == "__main__":
    run()
