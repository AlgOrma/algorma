from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Accepts camelCase JSON (matching the frontend) and Python snake_case alike."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="ignore"
    )


class RegisterIn(CamelModel):
    name: str
    email: str
    password: str


class LoginIn(CamelModel):
    identifier: str  # email or username (the form is labeled "Email or username")
    password: str
    remember: bool = False


class ProblemApproachIn(CamelModel):
    id: str | None = None
    name: str
    complexity_time: str | None = None
    complexity_space: str | None = None
    approach: str = ""
    code: str = ""
    # The frontend (and serialize_problem) uses "lang", not the camelCase
    # "language" the alias generator would otherwise expect.
    language: str = Field(default="Python", alias="lang")


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
    approaches: list[ProblemApproachIn] | None = None


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
    approaches: list[ProblemApproachIn] | None = None
    checklist_progress: list[bool] | None = None  # checklistProgress



class GradeIn(CamelModel):
    grade: str  # "Again" | "Hard" | "Good" | "Easy"


class VariationIn(CamelModel):
    name: str = "New variation"
    desc: str = ""  # -> TemplateVariation.description
    lang: str = "Python"  # -> TemplateVariation.language
    code: str = ""


class TemplatePatternCreate(CamelModel):
    name: str = "New pattern"
    topic: str = ""
    description: str = ""
    variations: list[VariationIn] = []


class TemplatePatternUpdate(CamelModel):
    # The frontend saves the whole pattern at once, so all fields are optional and
    # a provided `variations` list fully replaces the existing variations.
    name: str | None = None
    topic: str | None = None
    description: str | None = None
    variations: list[VariationIn] | None = None


class ReorderIn(CamelModel):
    # Pattern ids in the new top-to-bottom display order.
    ids: list[str] = []


class UserUpdate(CamelModel):
    name: str | None = None
    email: str | None = None
    timezone: str | None = None
    daily_goal: int | None = None
    bio: str | None = None
    leetcode_username: str | None = None  # leetcodeUsername


class LeetCodeSyncRequest(CamelModel):
    """Input for POST /api/leetcode/sync — at least one field is required.

    ``session_cookie`` (the browser's LEETCODE_SESSION value) unlocks the full
    accepted-history sync; username alone only reaches recent submissions. The
    cookie is used for the one fetch and never persisted.
    """

    username: str | None = None
    session_cookie: str | None = None  # sessionCookie


class CurriculumCreate(CamelModel):
    name: str
    description: str | None = None
    is_global: bool = False


class CurriculumQuestionsUpdate(CamelModel):
    question_ids: list[str] = []


class CustomListCreate(CamelModel):
    name: str
    description: str | None = None


class CustomListUpdate(CamelModel):
    name: str | None = None
    description: str | None = None


class CustomListProblemsUpdate(CamelModel):
    problem_ids: list[str] = []


