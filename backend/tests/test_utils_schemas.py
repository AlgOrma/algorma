"""Pure helpers: slugify/utcnow in app/utils.py and CamelModel input handling
in app/schemas.py (camelCase aliases, extra-key tolerance, the ProblemApproachIn
"lang" alias, and exclude_unset omitted-vs-null semantics for PATCH bodies)."""

from datetime import datetime, timedelta, timezone

from app.schemas import ProblemApproachIn, ProblemUpdate, UserCreate, UserUpdate
from app.utils import slugify, utcnow

# --- utils.slugify -----------------------------------------------------------


def test_slugify_lowercases_and_dashes_spaces():
    assert slugify("Two Pointers") == "two-pointers"


def test_slugify_collapses_runs_of_separators_to_one_dash():
    assert slugify("Dynamic   Programming -- 1D") == "dynamic-programming-1d"


def test_slugify_replaces_punctuation_with_dashes():
    assert slugify("Stacks & Queues (LIFO/FIFO)!") == "stacks-queues-lifo-fifo"


def test_slugify_strips_leading_and_trailing_dashes():
    assert slugify("  ...Heaps...  ") == "heaps"


def test_slugify_leaves_already_clean_slug_unchanged():
    assert slugify("binary-search-2") == "binary-search-2"


def test_slugify_treats_unicode_and_symbols_as_separators():
    # Non-ascii letters are not in [a-z0-9], so they collapse into dashes too.
    assert slugify("Grafos búsqueda") == "grafos-b-squeda"
    assert slugify("100% arrays™") == "100-arrays"


def test_slugify_all_symbols_yields_empty_string():
    assert slugify("!!!") == ""


# --- utils.utcnow ------------------------------------------------------------


def test_utcnow_is_naive_and_tracks_real_utc():
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    got = utcnow()
    after = datetime.now(timezone.utc).replace(tzinfo=None)

    assert got.tzinfo is None
    # The sandwich pins `got` to real UTC (a naive *local* time would fall
    # hours outside it on any non-UTC machine).
    assert before <= got <= after
    # Guard that the window stays tight enough for that check to mean anything.
    assert after - before < timedelta(seconds=5)


# --- schemas: CamelModel alias handling --------------------------------------


def test_user_create_accepts_camel_case_alias():
    u = UserCreate.model_validate({"name": "Ada", "dailyGoal": 5})
    assert u.daily_goal == 5


def test_user_create_accepts_snake_case_name():
    u = UserCreate.model_validate({"name": "Ada", "daily_goal": 7})
    assert u.daily_goal == 7


def test_user_create_applies_defaults_when_optional_fields_omitted():
    u = UserCreate.model_validate({"name": "Ada"})
    assert u.timezone == "UTC"
    assert u.daily_goal == 10
    assert u.email is None
    assert u.bio is None


def test_extra_keys_are_ignored_not_rejected():
    u = UserCreate.model_validate({"name": "Ada", "unknownField": 1, "junk": "x"})
    assert u.name == "Ada"
    assert not hasattr(u, "unknownField")
    assert not hasattr(u, "junk")


# --- schemas: ProblemApproachIn ----------------------------------------------


def test_problem_approach_populates_language_via_lang_alias():
    a = ProblemApproachIn.model_validate({"name": "Two pointers", "lang": "Go"})
    assert a.language == "Go"


def test_problem_approach_dumps_language_under_lang_alias():
    a = ProblemApproachIn.model_validate({"name": "Two pointers", "lang": "Go"})
    dumped = a.model_dump(by_alias=True)
    assert dumped["lang"] == "Go"
    assert "language" not in dumped


def test_problem_approach_field_name_language_also_works():
    # populate_by_name=True means the Python field name is accepted alongside
    # the "lang" alias; the frontend only ever sends "lang".
    a = ProblemApproachIn.model_validate({"name": "x", "language": "Rust"})
    assert a.language == "Rust"


def test_problem_approach_defaults():
    a = ProblemApproachIn.model_validate({"name": "Brute force"})
    assert a.id is None
    assert a.complexity_time is None
    assert a.complexity_space is None
    assert a.approach == ""
    assert a.code == ""
    assert a.language == "Python"


# --- schemas: exclude_unset distinguishes omitted from explicit null ----------


def test_problem_update_empty_body_dumps_to_nothing():
    upd = ProblemUpdate.model_validate({})
    assert upd.model_dump(exclude_unset=True) == {}


def test_problem_update_explicit_null_survives_exclude_unset():
    upd = ProblemUpdate.model_validate({"notes": None})
    assert upd.model_dump(exclude_unset=True) == {"notes": None}


def test_problem_update_only_sent_fields_appear_in_dump():
    upd = ProblemUpdate.model_validate({"title": "New", "checklistProgress": [True]})
    dumped = upd.model_dump(exclude_unset=True)
    assert dumped == {"title": "New", "checklist_progress": [True]}
    # Omitted fields still read as None on the model itself...
    assert upd.notes is None
    # ...but are absent from the exclude_unset dump, unlike explicit nulls.
    assert "notes" not in dumped


def test_user_update_mixes_null_and_value_fields():
    upd = UserUpdate.model_validate({"bio": None, "dailyGoal": 3})
    assert upd.model_dump(exclude_unset=True) == {"daily_goal": 3, "bio": None}
