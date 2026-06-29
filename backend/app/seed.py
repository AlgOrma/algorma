"""Seed global reference data (topics) and provide the per-user starter template
library.

Run from the backend/ directory:  python -m app.seed

Topics are global and seeded by ``run()``. The template library, by contrast, is
per-user and editable, so its starter set (``STARTER_PATTERNS``) is copied into a
profile when the profile is created (see routers/users.py) — or lazily on first
view (see routers/templates.py). Users, problems, flashcards, and their review
state stay per-user and are created through the app at runtime.
"""

from sqlmodel import Session, SQLModel, select

from .db import engine
from .models import TemplatePattern, TemplateVariation, Topic
from .utils import slugify

TOPICS = [
    "Arrays",
    "Hashing",
    "Two Pointers",
    "Trees",
    "Graphs",
    "Binary Search",
    "Dynamic Prog.",
    "Heaps",
    "Stacks",
]

# --- Starter template library (nested: pattern -> variations) ---------------
# Code blocks are flush-left triple-quoted strings so their internal indentation
# is exactly what ends up stored.

_TP_SINGLE = """def fn(arr):
    slow = 0
    for fast in range(len(arr)):
        if CONDITION(arr[fast]):
            arr[slow] = arr[fast]
            slow += 1
    return slow  # arr[:slow]"""

_TP_BACKWARD = """def fn(arr):
    n = len(arr)
    zeros = arr.count(0)
    i = n - 1
    j = n + zeros - 1
    while i < j:
        # write current element if it's within bounds
        ..."""

_SW_LONGEST = """def fn(s):
    l = 0
    best = 0
    for r in range(len(s)):
        add(s[r])              # expand right
        while invalid():
            remove(s[l])       # shrink left
            l += 1
        best = max(best, r - l + 1)
    return best"""

_BS_LOWER = """let lo = 0, hi = n;
while (lo < hi) {
  const mid = (lo + hi) >> 1;
  if (ok(mid)) hi = mid;
  else lo = mid + 1;
}
return lo;"""

_BT_CHOOSE = """function backtrack(path, choices) {
  if (complete(path)) { results.push([...path]); return; }
  for (const c of choices) {
    if (!valid(path, c)) continue;
    path.push(c);
    backtrack(path, next(choices, c));
    path.pop();              // undo
  }
}"""

_TS_KAHN = """const q = nodes.filter(v => indeg[v] === 0);
while (q.length) {
  const u = q.shift(); order.push(u);
  for (const v of adj[u])
    if (--indeg[v] === 0) q.push(v);
}
// order.length < N  =>  a cycle exists"""

_MS_NEXT_GREATER = """const st = [];                 // indices, decreasing values
for (let i = 0; i < n; i++) {
  while (st.length && a[st[st.length-1]] < a[i]) {
    const j = st.pop();
    res[j] = i;                // i is next-greater of j
  }
  st.push(i);
}"""

STARTER_PATTERNS = [
    {
        "name": "Two Pointers",
        "topic": "Arrays",
        "description": (
            "Walk two indices through the array — either converging from both "
            "ends or both moving forward from the left.\n"
            "Ideal on sorted input: pair sums, palindrome checks, and "
            "partitioning or de-duplicating in place.\n"
            "The slow pointer marks where the next kept element gets written; "
            "the fast pointer scans ahead.\n"
            'Strong signal whenever the prompt says "continuous", "subarray", '
            "or asks you to work in-place — it keeps you at O(n)."
        ),
        "variations": [
            {
                "name": "Same Direction – Single Input",
                "desc": "A slow write-pointer keeps every element that passes a condition.",
                "lang": "Python",
                "code": _TP_SINGLE,
            },
            {
                "name": "Same Direction – Backward Traversal",
                "desc": "Write from the end when inserting would shift elements right.",
                "lang": "Python",
                "code": _TP_BACKWARD,
            },
        ],
    },
    {
        "name": "Sliding Window",
        "topic": "Two Pointers",
        "description": (
            "Maintain a contiguous window [l, r] and slide it across the input "
            "instead of re-scanning from scratch.\n"
            "Grow the window on the right, and shrink it from the left only "
            "while it breaks the constraint.\n"
            'Fits "longest / shortest substring", "at most k distinct", and '
            "fixed-size window questions.\n"
            "Each index enters and leaves the window once, so the whole pass "
            "stays O(n)."
        ),
        "variations": [
            {
                "name": "Dynamic Window – Longest",
                "desc": "Grow right, shrink left while the window is invalid; track the best length.",
                "lang": "Python",
                "code": _SW_LONGEST,
            },
        ],
    },
    {
        "name": "Binary Search",
        "topic": "Search",
        "description": (
            "Halve a monotonic search space each step. Works on a sorted array "
            "or on the answer value itself.\n"
            "Reach for it on sorted lookups, lower / upper bound, and "
            '"smallest X that satisfies P" optimisation problems.'
        ),
        "variations": [
            {
                "name": "Lower Bound",
                "desc": "Find the first index where the predicate becomes true.",
                "lang": "JavaScript",
                "code": _BS_LOWER,
            },
        ],
    },
    {
        "name": "Backtracking",
        "topic": "Recursion",
        "description": (
            "A DFS that builds a partial candidate, recurses, then undoes the "
            "last choice to explore the alternatives.\n"
            "Use it for permutations, combinations, subsets, N-Queens, and "
            "constraint-satisfaction puzzles."
        ),
        "variations": [
            {
                "name": "Choose / Explore / Undo",
                "desc": "Push a choice, recurse, then pop to restore state.",
                "lang": "JavaScript",
                "code": _BT_CHOOSE,
            },
        ],
    },
    {
        "name": "Topological Sort",
        "topic": "Graphs",
        "description": (
            "Order a DAG so every edge points forward. Kahn's algorithm "
            "repeatedly peels off zero-indegree nodes.\n"
            "Use it for build / dependency order, course scheduling, and "
            "detecting cycles in a directed graph."
        ),
        "variations": [
            {
                "name": "Kahn's Algorithm (BFS)",
                "desc": "Queue every zero-indegree node, then relax its outgoing edges.",
                "lang": "JavaScript",
                "code": _TS_KAHN,
            },
        ],
    },
    {
        "name": "Monotonic Stack",
        "topic": "Stacks",
        "description": (
            "A stack kept strictly increasing or decreasing; pop while the "
            "invariant breaks to find the nearest greater / smaller element.\n"
            "Use it for next greater element, daily temperatures, largest "
            "rectangle in a histogram, and stock spans."
        ),
        "variations": [
            {
                "name": "Next Greater Element",
                "desc": "Keep indices of decreasing values; resolve each on pop.",
                "lang": "JavaScript",
                "code": _MS_NEXT_GREATER,
            },
        ],
    },
]


def seed_starter_patterns(session: Session, user_id: str) -> list[TemplatePattern]:
    """Create the starter template library for a user. Returns the new patterns.

    Used both on profile creation and as a lazy backfill for profiles that
    predate the template library. Caller owns the surrounding transaction
    boundary semantics; this commits so callers get persisted, refreshed rows.
    """
    created: list[TemplatePattern] = []
    for i, pat in enumerate(STARTER_PATTERNS):
        pattern = TemplatePattern(
            user_id=user_id,
            name=pat["name"],
            topic=pat["topic"],
            description=pat["description"],
            position=i,
            variations=[
                TemplateVariation(
                    name=v["name"],
                    description=v["desc"],
                    language=v["lang"],
                    code=v["code"],
                    position=j,
                )
                for j, v in enumerate(pat["variations"])
            ],
        )
        session.add(pattern)
        created.append(pattern)
    session.commit()
    for pattern in created:
        session.refresh(pattern)
    return created


def run() -> None:
    # Non-destructive, idempotent seed of global reference data (topics). NEVER
    # drop tables: this lives in the same database as per-user rows (users,
    # problems, flashcards, templates) and the LeetCode catalog, all of which
    # must survive a reseed. We only create missing tables and insert reference
    # rows that aren't there yet. Template patterns are per-user (see
    # seed_starter_patterns) and intentionally NOT seeded here.
    SQLModel.metadata.create_all(engine)

    added_topics = 0
    with Session(engine) as session:
        existing_topics = {t.name for t in session.exec(select(Topic)).all()}
        for name in TOPICS:
            if name not in existing_topics:
                session.add(Topic(name=name, slug=slugify(name)))
                added_topics += 1

        session.commit()

        counts = {"topics": len(session.exec(select(Topic)).all())}
    print(f"Seed complete : +{added_topics} topics. Totals: {counts}")


if __name__ == "__main__":
    run()
