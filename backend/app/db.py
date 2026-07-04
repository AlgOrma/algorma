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
    from sqlmodel import func, select
    
    inspector = inspect(engine)
    
    # 1. Add leetcode_id to problem table if missing
    columns = [c["name"] for c in inspector.get_columns("problem")]
    with engine.connect() as conn:
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
        
        for p in problems_to_migrate:
            # Check if it already has approaches
            has_approaches = session.exec(
                select(func.count(ProblemApproach.id)).where(ProblemApproach.problem_id == p.id)
            ).one() > 0
            
            if not has_approaches:
                default_approach = ProblemApproach(
                    problem_id=p.id,
                    name="Default Approach",
                    approach=p.approach or "",
                    code=p.solution or "",
                    language="Python",
                    position=0
                )
                session.add(default_approach)
        session.commit()



def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
