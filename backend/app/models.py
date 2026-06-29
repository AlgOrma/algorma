import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel

from .utils import utcnow


def gen_id() -> str:
    return uuid.uuid4().hex


class User(SQLModel, table=True):
    """A profile. No authentication — name + details only (see plan)."""

    id: str = Field(default_factory=gen_id, primary_key=True)
    name: str
    email: Optional[str] = Field(default=None, index=True, unique=True)
    timezone: str = "UTC"  # reserved for per-user "today" boundaries in stats
    daily_goal: int = 10
    bio: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    problems: list["Problem"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    flashcards: list["Flashcard"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    revisions: list["Revision"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    review_logs: list["ReviewLog"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    template_patterns: list["TemplatePattern"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


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
    user_id: str = Field(foreign_key="user.id", index=True)
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

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="problems")
    topic: Optional[Topic] = Relationship(back_populates="problems")
    patterns: list[Pattern] = Relationship(
        back_populates="problems", link_model=ProblemPatternLink
    )
    # SRS state lives in its own table (see Revision); 1:1 per problem.
    revision: Optional["Revision"] = Relationship(
        back_populates="problem",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
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


class TemplatePattern(SQLModel, table=True):
    """A user's reusable approach: shared guidance plus named code variations.

    The editable template library (parent "pattern" → child "variations"),
    distinct from the legacy flat ``Template`` and the problem-tagging
    ``Pattern``. One row per (user, pattern); variations cascade-delete with it.
    """

    id: str = Field(default_factory=gen_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    name: str
    topic: str = ""
    description: str = ""  # guidance / "when to use" prose
    position: int = 0  # ordering on the Templates page
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="template_patterns")
    variations: list["TemplateVariation"] = Relationship(
        back_populates="pattern",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "TemplateVariation.position",
        },
    )


class TemplateVariation(SQLModel, table=True):
    """One named code template under a TemplatePattern (the FE's ``desc``/``lang``
    map to ``description``/``language`` here)."""

    id: str = Field(default_factory=gen_id, primary_key=True)
    pattern_id: str = Field(foreign_key="templatepattern.id", index=True)
    name: str
    description: str = ""  # the FE's per-variation `desc`
    language: str = "Python"  # the FE's `lang`
    code: str = ""
    position: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    pattern: Optional[TemplatePattern] = Relationship(back_populates="variations")


class Flashcard(SQLModel, table=True):
    id: str = Field(default_factory=gen_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    type: str  # "concept" | "problem"
    tag: str
    front: str
    back: str

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="flashcards")
    revision: Optional["Revision"] = Relationship(
        back_populates="flashcard",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )
    review_logs: list["ReviewLog"] = Relationship(
        back_populates="flashcard",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Revision(SQLModel, table=True):
    """Per-user spaced-repetition state, partitioned out of the content rows.

    One row per (user, problem) or (user, flashcard) — exactly one of
    ``problem_id`` / ``flashcard_id`` is set (mirrors ReviewLog). The fields are
    grouped so a different scheduler can be slotted in later (see ``algo``):
    neutral scheduling fields, the current SM-2 state, and nullable FSRS/opensrs
    state populated only once we switch.
    """

    id: str = Field(default_factory=gen_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    problem_id: Optional[str] = Field(
        default=None, foreign_key="problem.id", index=True
    )
    flashcard_id: Optional[str] = Field(
        default=None, foreign_key="flashcard.id", index=True
    )

    # --- scheduler-neutral state ---
    algo: str = "sm2"  # "sm2" today; "fsrs" later
    review_count: int = 0
    last_reviewed_at: Optional[datetime] = None
    due_at: Optional[datetime] = Field(default=None, index=True)

    # --- SM-2 state ---
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0

    # --- FSRS / opensrs state (nullable until we adopt it) ---
    stability: Optional[float] = None
    difficulty: Optional[float] = None

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="revisions")
    problem: Optional[Problem] = Relationship(back_populates="revision")
    flashcard: Optional[Flashcard] = Relationship(back_populates="revision")


class ReviewLog(SQLModel, table=True):
    """One row per grading event — powers streak + retention stats."""

    id: str = Field(default_factory=gen_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    grade: str  # "Again" | "Hard" | "Good" | "Easy"
    interval_days: int
    ease_factor: float
    reviewed_at: datetime = Field(default_factory=utcnow, index=True)

    problem_id: Optional[str] = Field(default=None, foreign_key="problem.id")
    flashcard_id: Optional[str] = Field(default=None, foreign_key="flashcard.id")

    user: Optional[User] = Relationship(back_populates="review_logs")
    problem: Optional[Problem] = Relationship(back_populates="review_logs")
    flashcard: Optional[Flashcard] = Relationship(back_populates="review_logs")


class LeetCodeQuestion(SQLModel, table=True):
    """Global LeetCode question cache for reference and importing."""

    __tablename__ = "leetcode_question"

    id: str = Field(primary_key=True)  # maps to questionFrontendId, e.g. "1"
    question_id: str  # maps to questionId, e.g. "1"
    title: str
    difficulty: str  # "Easy" | "Medium" | "Hard"
    statement: str = ""  # maps to content (HTML description)
    leetcode_url: str  # maps to url
    topic_tags: str = "[]"  # JSON list of tag names
    is_paid_only: bool = False
    likes: int = 0
    dislikes: int = 0
    category_title: str = "Algorithms"
    hints: str = "[]"  # JSON list of hints
    solution_content: Optional[str] = None  # maps to solution.content (Markdown editorial)
    has_solution: bool = False
    has_video_solution: bool = False
    similar_questions: str = "[]"  # JSON list of similar questions
    stats: str = "{}"  # JSON list of statistics (totalAccepted, totalSubmission, acRate)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

