from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

# check_same_thread=False lets the SQLite connection be shared across FastAPI's
# threadpool workers.
engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    # Importing models registers them on SQLModel.metadata before create_all.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # Run lightweight schema migrations for existing SQLite databases
    from sqlalchemy import inspect, text
    from sqlmodel import select

    inspector = inspect(engine)
    
    # 1. Add leetcode_id / checklist_progress to problem table if missing
    columns = [c["name"] for c in inspector.get_columns("problem")]
    with engine.connect() as conn:
        if "checklist_progress" not in columns:
            conn.execute(text("ALTER TABLE problem ADD COLUMN checklist_progress VARCHAR"))
            conn.commit()
        if "solved_at" not in columns:
            conn.execute(text("ALTER TABLE problem ADD COLUMN solved_at DATETIME"))
            conn.commit()

            # Backfill: existing Done problems count as solved when last touched.
            conn.execute(text(
                "UPDATE problem SET solved_at = updated_at WHERE status = 'Done'"
            ))
            conn.commit()
        if "leetcode_id" not in columns:
            conn.execute(text("ALTER TABLE problem ADD COLUMN leetcode_id VARCHAR"))
            conn.commit()
            
            # Backfill existing problems' leetcode_id from leetcode_question
            conn.execute(text("""
                UPDATE problem
                SET leetcode_id = (
                    SELECT id FROM leetcode_question
                    WHERE leetcode_question.leetcode_url = problem.leetcode_url
                    LIMIT 1
                )
                WHERE leetcode_id IS NULL AND leetcode_url IS NOT NULL
            """))
            conn.commit()

    # 2. Migrate existing flat approaches / solutions to problem_approach table
    with Session(engine) as session:
        from .models import Problem, ProblemApproach
        problems_to_migrate = session.exec(
            select(Problem).where(
                (Problem.approach.is_not(None)) | (Problem.solution.is_not(None))
            )
        ).all()

        if problems_to_migrate:
            # One query for every problem that already has an approach row,
            # instead of a per-problem COUNT on every startup.
            migrated_ids = set(
                session.exec(select(ProblemApproach.problem_id).distinct()).all()
            )
            new_approaches = [
                ProblemApproach(
                    problem_id=p.id,
                    name="Default Approach",
                    approach=p.approach or "",
                    code=p.solution or "",
                    language="Python",
                    position=0,
                )
                for p in problems_to_migrate
                if p.id not in migrated_ids
            ]
            if new_approaches:
                session.add_all(new_approaches)
                session.commit()



def check_setup() -> list[str]:
    """Warn (without blocking) when reference data hasn't been seeded yet.

    Schema migrations run automatically on startup (see ``init_db``), but the
    reference-data seeds do not — so a fresh clone that skipped
    ``python -m app.bootstrap`` boots with an empty topic / LeetCode / curriculum
    catalog. Rather than let that look like a silent bug, detect it and print
    exactly what to run.

    Non-blocking: the API still serves (the schema is present). Returns the list
    of missing datasets — empty when everything is seeded.
    """
    from sqlalchemy import inspect
    from sqlmodel import func, select

    from . import models

    inspector = inspect(engine)
    datasets = [
        ("topics", models.Topic),
        ("LeetCode questions", models.LeetCodeQuestion),
        ("study curriculums", models.Curriculum),
    ]

    missing: list[str] = []
    with Session(engine) as session:
        for label, model in datasets:
            if not inspector.has_table(model.__tablename__):
                missing.append(label)
                continue
            if not session.exec(select(func.count(model.id))).one():
                missing.append(label)

    if missing:
        print(
            "\n" + "!" * 72 + "\n"
            f"  Setup incomplete: no {', '.join(missing)} found.\n"
            "  The schema is migrated, but reference data has not been seeded.\n"
            "  Run this once (idempotent, safe to re-run):\n"
            "      python -m app.bootstrap\n"
            + "!" * 72 + "\n"
        )
    return missing


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
