import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel

from .utils import utcnow


def gen_id() -> str:
    return uuid.uuid4().hex


class ProblemPatternLink(SQLModel, table=True):
    problem_id: str = Field(foreign_key="problem.id", primary_key=True)
    pattern_id: str = Field(foreign_key="pattern.id", primary_key=True)


class Topic(SQLModel, table=True):
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = Field(index=True, unique=True)
    slug: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=utcnow)

    problems: list["Problem"] = Relationship(back_populates="topic")


class Pattern(SQLModel, table=True):
    """A reusable pattern tag (e.g. "Sliding Window"), optionally backed by a Template."""

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str = Field(index=True, unique=True)
    template_id: Optional[str] = Field(default=None, foreign_key="template.id")

    problems: list["Problem"] = Relationship(
        back_populates="patterns", link_model=ProblemPatternLink
    )
    template: Optional["Template"] = Relationship(back_populates="patterns")


class Problem(SQLModel, table=True):
    id: str = Field(default_factory=gen_id, primary_key=True)
    title: str
    topic_id: str = Field(foreign_key="topic.id", index=True)
    difficulty: str  # "Easy" | "Medium" | "Hard"
    status: str = "Not started"  # "Not started" | "Solving" | "Done"
    statement: str = ""
    example_input: Optional[str] = None
    example_output: Optional[str] = None
    approach: Optional[str] = None
    notes: Optional[str] = None
    solution: Optional[str] = None
    leetcode_url: Optional[str] = None

    # --- SM-2 spaced-repetition state ---
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0
    review_count: int = 0
    last_reviewed_at: Optional[datetime] = None
    due_at: Optional[datetime] = Field(default=None, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    topic: Optional[Topic] = Relationship(back_populates="problems")
    patterns: list[Pattern] = Relationship(
        back_populates="problems", link_model=ProblemPatternLink
    )
    review_logs: list["ReviewLog"] = Relationship(
        back_populates="problem",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Template(SQLModel, table=True):
    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    tag: str
    concept: str
    when_to_use: str
    code: str
    created_at: datetime = Field(default_factory=utcnow)

    patterns: list[Pattern] = Relationship(back_populates="template")


class Flashcard(SQLModel, table=True):
    id: str = Field(default_factory=gen_id, primary_key=True)
    type: str  # "concept" | "problem"
    tag: str
    front: str
    back: str

    # --- SM-2 spaced-repetition state ---
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0
    review_count: int = 0
    last_reviewed_at: Optional[datetime] = None
    due_at: Optional[datetime] = Field(default=None, index=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    review_logs: list["ReviewLog"] = Relationship(
        back_populates="flashcard",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ReviewLog(SQLModel, table=True):
    """One row per grading event — powers streak + retention stats."""

    id: str = Field(default_factory=gen_id, primary_key=True)
    grade: str  # "Again" | "Hard" | "Good" | "Easy"
    interval_days: int
    ease_factor: float
    reviewed_at: datetime = Field(default_factory=utcnow, index=True)

    problem_id: Optional[str] = Field(default=None, foreign_key="problem.id")
    flashcard_id: Optional[str] = Field(default=None, foreign_key="flashcard.id")

    problem: Optional[Problem] = Relationship(back_populates="review_logs")
    flashcard: Optional[Flashcard] = Relationship(back_populates="review_logs")
