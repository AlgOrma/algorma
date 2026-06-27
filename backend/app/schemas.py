from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Accepts camelCase JSON (matching the frontend) and Python snake_case alike."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore"
    )


class ProblemCreate(CamelModel):
    title: str
    topic: str
    difficulty: str = "Easy"
    status: str = "Not started"
    statement: str = ""
    ex_in: str | None = None  # exIn
    ex_out: str | None = None  # exOut
    approach: str | None = None
    solution: str | None = None
    notes: str | None = None
    patterns: list[str] = []
    leetcode_url: str | None = None  # leetcodeUrl


class ProblemUpdate(CamelModel):
    title: str | None = None
    topic: str | None = None
    difficulty: str | None = None
    status: str | None = None
    statement: str | None = None
    ex_in: str | None = None
    ex_out: str | None = None
    approach: str | None = None
    solution: str | None = None
    notes: str | None = None
    patterns: list[str] | None = None
    leetcode_url: str | None = None


class GradeIn(CamelModel):
    grade: str  # "Again" | "Hard" | "Good" | "Easy"
