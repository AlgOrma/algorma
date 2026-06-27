"""Seed the database with the data from the frontend's initialData.js.

Run from the backend/ directory:  python -m app.seed
"""

from datetime import timedelta

from sqlmodel import Session, SQLModel, select

from .db import engine
from .deps import DEFAULT_USER_EMAIL
from .models import (
    Flashcard,
    Pattern,
    Problem,
    ReviewLog,
    Revision,
    Template,
    Topic,
    User,
)
from .utils import slugify, utcnow

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

PROBLEMS = [
    {
        "id": "p1",
        "title": "Two-Sum Variant",
        "topic": "Hashing",
        "difficulty": "Easy",
        "status": "Done",
        "statement": "Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one solution exists, and you may not reuse an element.",
        "ex_in": "nums = [2, 7, 11, 15], target = 9",
        "ex_out": "[0, 1]",
        "approach": "One pass with a hash map of value → index. For each x, check whether (target − x) has already been seen.",
        "notes": "Hash map trades O(n) space for O(n) time. Store the index, not just presence, so duplicate values still resolve correctly.",
        "solution": "function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}",
        "patterns": ["Hash Map"],
        "created_days_ago": 21,
        "last_revised_days_ago": 4,
        "revisions": 5,
        "next_offset_days": 0,
    },
    {
        "id": "p2",
        "title": "Merge Overlapping Ranges",
        "topic": "Arrays",
        "difficulty": "Medium",
        "status": "Done",
        "statement": "Given a collection of intervals [start, end], merge all overlapping intervals and return the non-overlapping set that covers the same span. Intervals touching at an endpoint count as overlapping.",
        "ex_in": "[[1,3], [2,6], [8,10], [15,18]]",
        "ex_out": "[[1,6], [8,10], [15,18]]",
        "approach": "Sort by start. Sweep left → right keeping the last merged interval; if the next start ≤ last end, extend the end, otherwise push a new interval.",
        "notes": 'O(n log n) from the sort, O(n) sweep. The "touching counts as overlap" rule means use ≤, not <.',
        "solution": "function mergeRanges(intervals) {\n  intervals.sort((a, b) => a[0] - b[0]);\n  const out = [intervals[0]];\n  for (const [s, e] of intervals.slice(1)) {\n    const last = out[out.length - 1];\n    if (s <= last[1]) last[1] = Math.max(last[1], e);\n    else out.push([s, e]);\n  }\n  return out;\n}",
        "patterns": ["Interval Merge", "Sorting", "Sweep Line"],
        "created_days_ago": 12,
        "last_revised_days_ago": 6,
        "revisions": 3,
        "next_offset_days": 0,
    },
    {
        "id": "p3",
        "title": "Longest Unique Window",
        "topic": "Two Pointers",
        "difficulty": "Medium",
        "status": "Solving",
        "statement": "Find the length of the longest substring without repeating characters. Return the length only.",
        "ex_in": '"abcabcbb"',
        "ex_out": '3   ("abc")',
        "approach": "Sliding window with a map of last-seen index. When a duplicate appears, jump the left edge past it — never letting it move backwards.",
        "notes": "Use max(left, lastSeen + 1) so the window never shrinks backwards on a far-away repeat.",
        "solution": "function lengthOfLongest(s) {\n  const seen = new Map();\n  let left = 0, best = 0;\n  for (let r = 0; r < s.length; r++) {\n    if (seen.has(s[r])) left = Math.max(left, seen.get(s[r]) + 1);\n    seen.set(s[r], r);\n    best = Math.max(best, r - left + 1);\n  }\n  return best;\n}",
        "patterns": ["Sliding Window", "Hash Map"],
        "created_days_ago": 18,
        "last_revised_days_ago": 5,
        "revisions": 3,
        "next_offset_days": -1,
    },
    {
        "id": "p4",
        "title": "Course Order (Topo Sort)",
        "topic": "Graphs",
        "difficulty": "Hard",
        "status": "Done",
        "statement": "Given numCourses and prerequisite pairs [a, b] meaning b must be taken before a, return a valid order of all courses, or an empty array if it is impossible.",
        "ex_in": "n = 4, prereqs = [[1,0],[2,0],[3,1],[3,2]]",
        "ex_out": "[0, 1, 2, 3]",
        "approach": "Kahn's BFS: compute indegrees, queue every zero-indegree node, then peel nodes off and relax their neighbours.",
        "notes": "If the produced order is shorter than n, a cycle exists → no valid ordering.",
        "solution": "function courseOrder(n, prereqs) {\n  const adj = Array.from({ length: n }, () => []);\n  const indeg = Array(n).fill(0);\n  for (const [a, b] of prereqs) { adj[b].push(a); indeg[a]++; }\n  const q = [], order = [];\n  for (let i = 0; i < n; i++) if (!indeg[i]) q.push(i);\n  while (q.length) {\n    const u = q.shift(); order.push(u);\n    for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);\n  }\n  return order.length === n ? order : [];\n}",
        "patterns": ["Topological Sort", "BFS", "Graphs"],
        "created_days_ago": 9,
        "last_revised_days_ago": 9,
        "revisions": 2,
        "next_offset_days": 0,
    },
    {
        "id": "p8",
        "title": "Binary Search Bounds",
        "topic": "Binary Search",
        "difficulty": "Easy",
        "status": "Done",
        "statement": "Given a sorted array, return the leftmost index where target could be inserted to keep the array sorted (its lower bound).",
        "ex_in": "nums = [1, 3, 3, 5, 7], target = 3",
        "ex_out": "1",
        "approach": "Binary search on a half-open interval [lo, hi); move hi to mid when nums[mid] ≥ target, otherwise lo to mid + 1.",
        "notes": "The half-open interval [lo, hi) kills almost all off-by-one bugs in bound searches.",
        "solution": "function lowerBound(nums, target) {\n  let lo = 0, hi = nums.length;\n  while (lo < hi) {\n    const mid = (lo + hi) >> 1;\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid;\n  }\n  return lo;\n}",
        "patterns": ["Binary Search"],
        "created_days_ago": 15,
        "last_revised_days_ago": 7,
        "revisions": 2,
        "next_offset_days": 0,
    },
    {
        "id": "p5",
        "title": "Min Path Sum (Grid DP)",
        "topic": "Dynamic Prog.",
        "difficulty": "Hard",
        "status": "Not started",
        "statement": "Given an m×n grid of non-negative numbers, find a path from top-left to bottom-right that minimises the sum of numbers along it. You may only move right or down.",
        "ex_in": "[[1,3,1],[1,5,1],[4,2,1]]",
        "ex_out": "7",
        "approach": "DP over the grid: dp[i][j] = grid[i][j] + min(up, left). Can be done in place.",
        "notes": "",
        "solution": "function minPathSum(grid) {\n  const m = grid.length, n = grid[0].length;\n  for (let i = 0; i < m; i++)\n    for (let j = 0; j < n; j++) {\n      if (i === 0 && j === 0) continue;\n      const up = i ? grid[i-1][j] : Infinity;\n      const left = j ? grid[i][j-1] : Infinity;\n      grid[i][j] += Math.min(up, left);\n    }\n  return grid[m-1][n-1];\n}",
        "patterns": ["Grid DP", "Dynamic Programming"],
        "created_days_ago": 2,
        "last_revised_days_ago": None,
        "revisions": 0,
        "next_offset_days": None,
    },
    {
        "id": "p6",
        "title": "Sliding Window Maximum",
        "topic": "Heaps",
        "difficulty": "Hard",
        "status": "Not started",
        "statement": "Given an array and a window size k, return the maximum of each window as it slides from left to right.",
        "ex_in": "nums = [1,3,-1,-3,5,3,6,7], k = 3",
        "ex_out": "[3, 3, 5, 5, 6, 7]",
        "approach": "Monotonic deque of indices with decreasing values; drop indices that fall out of the window from the front.",
        "notes": "",
        "solution": "function maxWindow(nums, k) {\n  const dq = [], res = [];\n  for (let i = 0; i < nums.length; i++) {\n    while (dq.length && nums[dq[dq.length-1]] < nums[i]) dq.pop();\n    dq.push(i);\n    if (dq[0] <= i - k) dq.shift();\n    if (i >= k - 1) res.push(nums[dq[0]]);\n  }\n  return res;\n}",
        "patterns": ["Monotonic Deque", "Sliding Window"],
        "created_days_ago": 1,
        "last_revised_days_ago": None,
        "revisions": 0,
        "next_offset_days": None,
    },
    {
        "id": "p7",
        "title": "Valid Parentheses",
        "topic": "Stacks",
        "difficulty": "Easy",
        "status": "Done",
        "statement": "Given a string of brackets ()[]{}, decide whether it is validly nested and closed in the correct order.",
        "ex_in": '"([{}])"',
        "ex_out": "true",
        "approach": "Push opening brackets; on a closing bracket, the stack top must be its matching open.",
        "notes": "An empty stack at the end is required — leftover opens mean the string is invalid.",
        "solution": 'function isValid(s) {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const st = [];\n  for (const c of s) {\n    if (c in pairs) { if (st.pop() !== pairs[c]) return false; }\n    else st.push(c);\n  }\n  return st.length === 0;\n}',
        "patterns": ["Stack"],
        "created_days_ago": 24,
        "last_revised_days_ago": 10,
        "revisions": 4,
        "next_offset_days": 5,
    },
    {
        "id": "p9",
        "title": "Number of Islands",
        "topic": "Graphs",
        "difficulty": "Medium",
        "status": "Done",
        "statement": "Count the connected groups of '1's (land) in a grid of '1' and '0', moving only up/down/left/right.",
        "ex_in": "grid 4×5 with two clusters",
        "ex_out": "2",
        "approach": "Scan every cell; on unvisited land, flood-fill the whole island (DFS or BFS) and increment the count.",
        "notes": 'Sinking visited land to "0" marks it visited with no extra memory.',
        "solution": 'function numIslands(grid) {\n  let count = 0;\n  const sink = (i, j) => {\n    if (i < 0 || j < 0 || i >= grid.length || j >= grid[0].length || grid[i][j] !== "1") return;\n    grid[i][j] = "0";\n    sink(i+1,j); sink(i-1,j); sink(i,j+1); sink(i,j-1);\n  };\n  for (let i = 0; i < grid.length; i++)\n    for (let j = 0; j < grid[0].length; j++)\n      if (grid[i][j] === "1") { count++; sink(i, j); }\n  return count;\n}',
        "patterns": ["Flood Fill", "DFS", "Graphs"],
        "created_days_ago": 20,
        "last_revised_days_ago": 13,
        "revisions": 1,
        "next_offset_days": 3,
    },
    {
        "id": "p10",
        "title": "Kth Largest Element",
        "topic": "Heaps",
        "difficulty": "Medium",
        "status": "Solving",
        "statement": "Return the kth largest element in an unsorted array (kth in sorted order, not the kth distinct value).",
        "ex_in": "nums = [3,2,1,5,6,4], k = 2",
        "ex_out": "5",
        "approach": "Keep a min-heap of size k; after one pass its root is the answer. O(n log k).",
        "notes": "Heap of size k → O(n log k). Quickselect averages O(n) if you need it faster.",
        "solution": "function kthLargest(nums, k) {\n  const heap = new MinHeap();\n  for (const x of nums) {\n    heap.push(x);\n    if (heap.size() > k) heap.pop();\n  }\n  return heap.peek();\n}",
        "patterns": ["Heap", "Quickselect"],
        "created_days_ago": 6,
        "last_revised_days_ago": None,
        "revisions": 0,
        "next_offset_days": None,
    },
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

CARDS = [
    {
        "type": "concept",
        "tag": "Stacks",
        "front": "When do you reach for a monotonic stack?",
        "back": "When you need the next / previous greater-or-smaller element in O(n). Keep indices in a stack that stays increasing or decreasing, popping as the invariant breaks.",
    },
    {
        "type": "concept",
        "tag": "Two Pointers",
        "front": "Sliding window — when do you shrink the window?",
        "back": "While the window violates the constraint (sum too large, a repeated character, more than k distinct). Shrink from the left until it is valid again, updating the aggregate as you remove each element.",
    },
    {
        "type": "concept",
        "tag": "Binary Search",
        "front": "How do you binary-search on the answer?",
        "back": "Define a monotonic predicate ok(x) that is false then becomes true. Binary search for the smallest x with ok(x) true — testing feasibility in the loop instead of comparing against an array value.",
    },
    {
        "type": "problem",
        "tag": "Arrays",
        "front": "Merge Overlapping Ranges — what is the key idea?",
        "back": "Sort the intervals by start, then sweep: if the next start ≤ the current end, extend the end; otherwise push a new interval. Overall O(n log n).",
    },
    {
        "type": "concept",
        "tag": "Graphs",
        "front": "Kahn's topological sort in three steps?",
        "back": "1) Count every node’s indegree. 2) Queue all zero-indegree nodes. 3) Pop a node into the order, decrement its neighbours’ indegrees, and enqueue any that reach zero. Leftover nodes mean a cycle.",
    },
    {
        "type": "concept",
        "tag": "Recursion",
        "front": "What is the general backtracking skeleton?",
        "back": "If the path is complete, record it. Otherwise loop over the valid choices: apply a choice, recurse, then undo it (pop) before trying the next one.",
    },
]


def run() -> None:
    # Full reset for an idempotent seed.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    now = utcnow()
    with Session(engine) as session:
        # Default profile: every seeded item belongs to this user, and it's the
        # fallback for requests that don't send an X-User-Id header.
        default_user = User(name="Sam", email=DEFAULT_USER_EMAIL)
        session.add(default_user)
        session.commit()
        session.refresh(default_user)

        topic_by_name: dict[str, Topic] = {}
        for name in TOPICS:
            topic = Topic(name=name, slug=slugify(name))
            session.add(topic)
            topic_by_name[name] = topic
        session.commit()

        for tpl in TEMPLATES:
            session.add(Template(**tpl))
        session.commit()

        pattern_by_name: dict[str, Pattern] = {}

        def get_pattern(name: str) -> Pattern:
            name = name.strip()
            if name not in pattern_by_name:
                pattern = Pattern(name=name)
                session.add(pattern)
                session.commit()
                session.refresh(pattern)
                pattern_by_name[name] = pattern
            return pattern_by_name[name]

        for pd in PROBLEMS:
            last_revised = pd["last_revised_days_ago"]
            next_offset = pd["next_offset_days"]
            problem = Problem(
                id=pd["id"],
                user_id=default_user.id,
                title=pd["title"],
                topic_id=topic_by_name[pd["topic"]].id,
                difficulty=pd["difficulty"],
                status=pd["status"],
                statement=pd["statement"],
                example_input=pd["ex_in"],
                example_output=pd["ex_out"],
                approach=pd["approach"],
                notes=pd["notes"] or None,
                solution=pd["solution"],
                created_at=now - timedelta(days=pd["created_days_ago"]),
                updated_at=now,
                patterns=[get_pattern(n) for n in pd["patterns"]],
            )
            session.add(problem)
            # SRS state now lives in its own per-user Revision row.
            session.add(
                Revision(
                    user_id=default_user.id,
                    problem_id=problem.id,
                    repetitions=pd["revisions"],
                    review_count=pd["revisions"],
                    interval_days=max(0, (last_revised or 0) + (next_offset or 0)),
                    last_reviewed_at=now - timedelta(days=last_revised)
                    if last_revised is not None
                    else None,
                    due_at=now + timedelta(days=next_offset)
                    if next_offset is not None
                    else None,
                )
            )
        session.commit()

        for card in CARDS:
            flashcard = Flashcard(user_id=default_user.id, **card)
            session.add(flashcard)
            session.add(
                Revision(
                    user_id=default_user.id,
                    flashcard_id=flashcard.id,
                    due_at=now,
                )
            )
        session.commit()

        # Review history for streak + retention (~last 12 days, one per day).
        first = session.exec(select(Problem).order_by(Problem.created_at)).first()
        if first:
            for i in range(12):
                session.add(
                    ReviewLog(
                        user_id=default_user.id,
                        problem_id=first.id,
                        grade="Hard" if i == 5 else "Good",
                        interval_days=6,
                        ease_factor=2.5,
                        reviewed_at=now - timedelta(days=i),
                    )
                )
        session.commit()

        counts = {
            "users": len(session.exec(select(User)).all()),
            "topics": len(session.exec(select(Topic)).all()),
            "problems": len(session.exec(select(Problem)).all()),
            "templates": len(session.exec(select(Template)).all()),
            "flashcards": len(session.exec(select(Flashcard)).all()),
            "revisions": len(session.exec(select(Revision)).all()),
            "reviewLogs": len(session.exec(select(ReviewLog)).all()),
        }
    print("Seed complete:", counts)


if __name__ == "__main__":
    run()
