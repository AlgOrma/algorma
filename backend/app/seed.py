"""Seed the database with global reference data: topics + the template library.

Run from the backend/ directory:  python -m app.seed

Users, problems, flashcards, and their review state are per-user and created
through the app at runtime — a fresh install has an empty users table and no
default profile.
"""

from sqlmodel import Session, SQLModel, select

from .db import engine
from .models import Template, Topic
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

TEMPLATES = [
    {
        "name": "Sliding Window",
        "tag": "Two Pointers",
        "concept": "Maintain a contiguous range [l, r] and slide it across the input, updating a running aggregate in O(1) per step instead of recomputing from scratch.",
        "when_to_use": "Longest / shortest subarray or substring meeting a constraint; running sums, counts, or distinct-element windows.",
        "code": "let l = 0, agg = 0;\nfor (let r = 0; r < n; r++) {\n  agg += a[r];                 // expand right\n  while (invalid(agg)) {\n    agg -= a[l++];             // shrink left\n  }\n  best = Math.max(best, r - l + 1);\n}",
    },
    {
        "name": "Two Pointers",
        "tag": "Arrays",
        "concept": "Two indices walking toward each other (or in the same direction) to replace an O(n²) scan with a single linear pass.",
        "when_to_use": "Sorted-array pair sums, palindrome checks, in-place partitioning, merging two sequences.",
        "code": "let i = 0, j = n - 1;\nwhile (i < j) {\n  const s = a[i] + a[j];\n  if (s === target) return [i, j];\n  s < target ? i++ : j--;\n}",
    },
    {
        "name": "Binary Search",
        "tag": "Search",
        "concept": "Halve a monotonic search space each step. Works on a sorted array or on the answer value itself.",
        "when_to_use": 'Sorted lookups, lower / upper bound, and "smallest X that satisfies P" optimisation problems.',
        "code": "let lo = 0, hi = n;\nwhile (lo < hi) {\n  const mid = (lo + hi) >> 1;\n  if (ok(mid)) hi = mid;\n  else lo = mid + 1;\n}\nreturn lo;",
    },
    {
        "name": "Backtracking",
        "tag": "Recursion",
        "concept": "A DFS that builds a partial candidate, recurses, then undoes the last choice to explore the alternatives.",
        "when_to_use": "Permutations, combinations, subsets, N-Queens, and constraint-satisfaction puzzles.",
        "code": "function backtrack(path, choices) {\n  if (complete(path)) { results.push([...path]); return; }\n  for (const c of choices) {\n    if (!valid(path, c)) continue;\n    path.push(c);\n    backtrack(path, next(choices, c));\n    path.pop();              // undo\n  }\n}",
    },
    {
        "name": "Topological Sort",
        "tag": "Graphs",
        "concept": "Order a DAG so every edge points forward. Kahn's algorithm repeatedly peels off zero-indegree nodes.",
        "when_to_use": "Build / dependency order, course scheduling, and detecting cycles in a directed graph.",
        "code": "const q = nodes.filter(v => indeg[v] === 0);\nwhile (q.length) {\n  const u = q.shift(); order.push(u);\n  for (const v of adj[u])\n    if (--indeg[v] === 0) q.push(v);\n}\n// order.length < N  =>  a cycle exists",
    },
    {
        "name": "Monotonic Stack",
        "tag": "Stacks",
        "concept": "A stack kept strictly increasing or decreasing; pop while the invariant breaks to find the nearest greater / smaller element.",
        "when_to_use": "Next greater element, daily temperatures, largest rectangle in a histogram, stock spans.",
        "code": "const st = [];                 // indices, decreasing values\nfor (let i = 0; i < n; i++) {\n  while (st.length && a[st[st.length-1]] < a[i]) {\n    const j = st.pop();\n    res[j] = i;                // i is next-greater of j\n  }\n  st.push(i);\n}",
    },
]


def run() -> None:
    # Full reset for an idempotent seed. Only global reference data is seeded;
    # users and their problems/flashcards are created through the app.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        for name in TOPICS:
            session.add(Topic(name=name, slug=slugify(name)))
        for tpl in TEMPLATES:
            session.add(Template(**tpl))
        session.commit()

        counts = {
            "topics": len(session.exec(select(Topic)).all()),
            "templates": len(session.exec(select(Template)).all()),
        }
    print("Seed complete:", counts)


if __name__ == "__main__":
    run()
