export const INITIAL_PROBLEMS = [
  { 
    id: 'p1', 
    title: 'Two-Sum Variant', 
    topic: 'Hashing', 
    difficulty: 'Easy', 
    status: 'Done', 
    due: true,
    statement: 'Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one solution exists, and you may not reuse an element.',
    exIn: 'nums = [2, 7, 11, 15], target = 9', 
    exOut: '[0, 1]',
    approach: 'One pass with a hash map of value → index. For each x, check whether (target − x) has already been seen.',
    solution: 'function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}',
    notes: 'Hash map trades O(n) space for O(n) time. Store the index, not just presence, so duplicate values still resolve correctly.',
    patterns: ['Hash Map'], 
    created: '21d ago', 
    lastRevised: '4d ago · 5×', 
    nextLabel: 'today', 
    nextColor: 'var(--color-accent)', 
    dueMeta: 'revised 4d ago · 5×', 
    revisions: 5 
  },
  { 
    id: 'p2', 
    title: 'Merge Overlapping Ranges', 
    topic: 'Arrays', 
    difficulty: 'Medium', 
    status: 'Done', 
    due: true,
    statement: 'Given a collection of intervals [start, end], merge all overlapping intervals and return the non-overlapping set that covers the same span. Intervals touching at an endpoint count as overlapping.',
    exIn: '[[1,3], [2,6], [8,10], [15,18]]', 
    exOut: '[[1,6], [8,10], [15,18]]',
    approach: 'Sort by start. Sweep left → right keeping the last merged interval; if the next start ≤ last end, extend the end, otherwise push a new interval.',
    solution: 'function mergeRanges(intervals) {\n  intervals.sort((a, b) => a[0] - b[0]);\n  const out = [intervals[0]];\n  for (const [s, e] of intervals.slice(1)) {\n    const last = out[out.length - 1];\n    if (s <= last[1]) last[1] = Math.max(last[1], e);\n    else out.push([s, e]);\n  }\n  return out;\n}',
    notes: 'O(n log n) from the sort, O(n) sweep. The "touching counts as overlap" rule means use ≤, not <.',
    patterns: ['Interval Merge', 'Sorting', 'Sweep Line'], 
    created: '12d ago', 
    lastRevised: '6d ago · 3×', 
    nextLabel: 'today', 
    nextColor: 'var(--color-accent)', 
    dueMeta: 'revised 6d ago · 3×', 
    revisions: 3 
  },
  { 
    id: 'p3', 
    title: 'Longest Unique Window', 
    topic: 'Two Pointers', 
    difficulty: 'Medium', 
    status: 'Solving', 
    due: true,
    statement: 'Find the length of the longest substring without repeating characters. Return the length only.',
    exIn: '"abcabcbb"', 
    exOut: '3   ("abc")',
    approach: 'Sliding window with a map of last-seen index. When a duplicate appears, jump the left edge past it — never letting it move backwards.',
    solution: 'function lengthOfLongest(s) {\n  const seen = new Map();\n  let left = 0, best = 0;\n  for (let r = 0; r < s.length; r++) {\n    if (seen.has(s[r])) left = Math.max(left, seen.get(s[r]) + 1);\n    seen.set(s[r], r);\n    best = Math.max(best, r - left + 1);\n  }\n  return best;\n}',
    notes: 'Use max(left, lastSeen + 1) so the window never shrinks backwards on a far-away repeat.',
    patterns: ['Sliding Window', 'Hash Map'], 
    created: '18d ago', 
    lastRevised: '5d ago · 3×', 
    nextLabel: '-1d', 
    nextColor: 'var(--color-accent-red-hover)', 
    dueMeta: 'overdue 1d', 
    revisions: 3 
  },
  { 
    id: 'p4', 
    title: 'Course Order (Topo Sort)', 
    topic: 'Graphs', 
    difficulty: 'Hard', 
    status: 'Done', 
    due: true,
    statement: 'Given numCourses and prerequisite pairs [a, b] meaning b must be taken before a, return a valid order of all courses, or an empty array if it is impossible.',
    exIn: 'n = 4, prereqs = [[1,0],[2,0],[3,1],[3,2]]', 
    exOut: '[0, 1, 2, 3]',
    approach: "Kahn's BFS: compute indegrees, queue every zero-indegree node, then peel nodes off and relax their neighbours.",
    solution: 'function courseOrder(n, prereqs) {\n  const adj = Array.from({ length: n }, () => []);\n  const indeg = Array(n).fill(0);\n  for (const [a, b] of prereqs) { adj[b].push(a); indeg[a]++; }\n  const q = [], order = [];\n  for (let i = 0; i < n; i++) if (!indeg[i]) q.push(i);\n  while (q.length) {\n    const u = q.shift(); order.push(u);\n    for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);\n  }\n  return order.length === n ? order : [];\n}',
    notes: 'If the produced order is shorter than n, a cycle exists → no valid ordering.',
    patterns: ['Topological Sort', 'BFS', 'Graphs'], 
    created: '9d ago', 
    lastRevised: '9d ago · 2×', 
    nextLabel: 'today', 
    nextColor: 'var(--color-accent)', 
    dueMeta: 'revised 9d ago · 2×', 
    revisions: 2 
  },
  { 
    id: 'p8', 
    title: 'Binary Search Bounds', 
    topic: 'Binary Search', 
    difficulty: 'Easy', 
    status: 'Done', 
    due: true,
    statement: 'Given a sorted array, return the leftmost index where target could be inserted to keep the array sorted (its lower bound).',
    exIn: 'nums = [1, 3, 3, 5, 7], target = 3', 
    exOut: '1',
    approach: 'Binary search on a half-open interval [lo, hi); move hi to mid when nums[mid] ≥ target, otherwise lo to mid + 1.',
    solution: 'function lowerBound(nums, target) {\n  let lo = 0, hi = nums.length;\n  while (lo < hi) {\n    const mid = (lo + hi) >> 1;\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid;\n  }\n  return lo;\n}',
    notes: 'The half-open interval [lo, hi) kills almost all off-by-one bugs in bound searches.',
    patterns: ['Binary Search'], 
    created: '15d ago', 
    lastRevised: '7d ago · 2×', 
    nextLabel: 'today', 
    nextColor: 'var(--color-accent)', 
    dueMeta: 'revised 7d ago · 2×', 
    revisions: 2 
  },
  { 
    id: 'p5', 
    title: 'Min Path Sum (Grid DP)', 
    topic: 'Dynamic Prog.', 
    difficulty: 'Hard', 
    status: 'Not started', 
    due: false,
    statement: 'Given an m×n grid of non-negative numbers, find a path from top-left to bottom-right that minimises the sum of numbers along it. You may only move right or down.',
    exIn: '[[1,3,1],[1,5,1],[4,2,1]]', 
    exOut: '7',
    approach: 'DP over the grid: dp[i][j] = grid[i][j] + min(up, left). Can be done in place.',
    solution: 'function minPathSum(grid) {\n  const m = grid.length, n = grid[0].length;\n  for (let i = 0; i < m; i++)\n    for (let j = 0; j < n; j++) {\n      if (i === 0 && j === 0) continue;\n      const up = i ? grid[i-1][j] : Infinity;\n      const left = j ? grid[i][j-1] : Infinity;\n      grid[i][j] += Math.min(up, left);\n    }\n  return grid[m-1][n-1];\n}',
    notes: '', 
    patterns: ['Grid DP', 'Dynamic Programming'], 
    created: '2d ago', 
    lastRevised: '—', 
    nextLabel: '—', 
    nextColor: 'var(--color-border-accent)', 
    dueMeta: 'not started', 
    revisions: 0 
  },
  { 
    id: 'p6', 
    title: 'Sliding Window Maximum', 
    topic: 'Heaps', 
    difficulty: 'Hard', 
    status: 'Not started', 
    due: false,
    statement: 'Given an array and a window size k, return the maximum of each window as it slides from left to right.',
    exIn: 'nums = [1,3,-1,-3,5,3,6,7], k = 3', 
    exOut: '[3, 3, 5, 5, 6, 7]',
    approach: 'Monotonic deque of indices with decreasing values; drop indices that fall out of the window from the front.',
    solution: 'function maxWindow(nums, k) {\n  const dq = [], res = [];\n  for (let i = 0; i < nums.length; i++) {\n    while (dq.length && nums[dq[dq.length-1]] < nums[i]) dq.pop();\n    dq.push(i);\n    if (dq[0] <= i - k) dq.shift();\n    if (i >= k - 1) res.push(nums[dq[0]]);\n  }\n  return res;\n}',
    notes: '', 
    patterns: ['Monotonic Deque', 'Sliding Window'], 
    created: '1d ago', 
    lastRevised: '—', 
    nextLabel: '—', 
    nextColor: 'var(--color-border-accent)', 
    dueMeta: 'not started', 
    revisions: 0 
  },
  { 
    id: 'p7', 
    title: 'Valid Parentheses', 
    topic: 'Stacks', 
    difficulty: 'Easy', 
    status: 'Done', 
    due: false,
    statement: 'Given a string of brackets ()[]{}, decide whether it is validly nested and closed in the correct order.',
    exIn: '"([{}])"', 
    exOut: 'true',
    approach: 'Push opening brackets; on a closing bracket, the stack top must be its matching open.',
    solution: 'function isValid(s) {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const st = [];\n  for (const c of s) {\n    if (c in pairs) { if (st.pop() !== pairs[c]) return false; }\n    else st.push(c);\n  }\n  return st.length === 0;\n}',
    notes: 'An empty stack at the end is required — leftover opens mean the string is invalid.',
    patterns: ['Stack'], 
    created: '24d ago', 
    lastRevised: '10d ago · 4×', 
    nextLabel: 'in 5d', 
    nextColor: 'var(--color-text-muted)', 
    dueMeta: 'revised 10d ago · 4×', 
    revisions: 4 
  },
  { 
    id: 'p9', 
    title: 'Number of Islands', 
    topic: 'Graphs', 
    difficulty: 'Medium', 
    status: 'Done', 
    due: false,
    statement: "Count the connected groups of '1's (land) in a grid of '1' and '0', moving only up/down/left/right.",
    exIn: 'grid 4×5 with two clusters', 
    exOut: '2',
    approach: 'Scan every cell; on unvisited land, flood-fill the whole island (DFS or BFS) and increment the count.',
    solution: 'function numIslands(grid) {\n  let count = 0;\n  const sink = (i, j) => {\n    if (i < 0 || j < 0 || i >= grid.length || j >= grid[0].length || grid[i][j] !== "1") return;\n    grid[i][j] = "0";\n    sink(i+1,j); sink(i-1,j); sink(i,j+1); sink(i,j-1);\n  };\n  for (let i = 0; i < grid.length; i++)\n    for (let j = 0; j < grid[0].length; j++)\n      if (grid[i][j] === "1") { count++; sink(i, j); }\n  return count;\n}',
    notes: 'Sinking visited land to "0" marks it visited with no extra memory.',
    patterns: ['Flood Fill', 'DFS', 'Graphs'], 
    created: '20d ago', 
    lastRevised: '13d ago · 1×', 
    nextLabel: 'in 3d', 
    nextColor: 'var(--color-text-muted)', 
    dueMeta: 'revised 13d ago · 1×', 
    revisions: 1 
  },
  { 
    id: 'p10', 
    title: 'Kth Largest Element', 
    topic: 'Heaps', 
    difficulty: 'Medium', 
    status: 'Solving', 
    due: false,
    statement: 'Return the kth largest element in an unsorted array (kth in sorted order, not the kth distinct value).',
    exIn: 'nums = [3,2,1,5,6,4], k = 2', 
    exOut: '5',
    approach: 'Keep a min-heap of size k; after one pass its root is the answer. O(n log k).',
    solution: 'function kthLargest(nums, k) {\n  const heap = new MinHeap();\n  for (const x of nums) {\n    heap.push(x);\n    if (heap.size() > k) heap.pop();\n  }\n  return heap.peek();\n}',
    notes: 'Heap of size k → O(n log k). Quickselect averages O(n) if you need it faster.',
    patterns: ['Heap', 'Quickselect'], 
    created: '6d ago', 
    lastRevised: '—', 
    nextLabel: '—', 
    nextColor: 'var(--color-border-accent)', 
    dueMeta: 'in progress', 
    revisions: 0 
  }
];

export const INITIAL_TEMPLATES = [
  { 
    name: 'Sliding Window', 
    tag: 'Two Pointers',
    concept: 'Maintain a contiguous range [l, r] and slide it across the input, updating a running aggregate in O(1) per step instead of recomputing from scratch.',
    whenToUse: 'Longest / shortest subarray or substring meeting a constraint; running sums, counts, or distinct-element windows.',
    code: 'let l = 0, agg = 0;\nfor (let r = 0; r < n; r++) {\n  agg += a[r];                 // expand right\n  while (invalid(agg)) {\n    agg -= a[l++];             // shrink left\n  }\n  best = Math.max(best, r - l + 1);\n}' 
  },
  { 
    name: 'Two Pointers', 
    tag: 'Arrays',
    concept: 'Two indices walking toward each other (or in the same direction) to replace an O(n²) scan with a single linear pass.',
    whenToUse: 'Sorted-array pair sums, palindrome checks, in-place partitioning, merging two sequences.',
    code: 'let i = 0, j = n - 1;\nwhile (i < j) {\n  const s = a[i] + a[j];\n  if (s === target) return [i, j];\n  s < target ? i++ : j--;\n}' 
  },
  { 
    name: 'Binary Search', 
    tag: 'Search',
    concept: 'Halve a monotonic search space each step. Works on a sorted array or on the answer value itself.',
    whenToUse: 'Sorted lookups, lower / upper bound, and "smallest X that satisfies P" optimisation problems.',
    code: 'let lo = 0, hi = n;\nwhile (lo < hi) {\n  const mid = (lo + hi) >> 1;\n  if (ok(mid)) hi = mid;\n  else lo = mid + 1;\n}\nreturn lo;' 
  },
  { 
    name: 'Backtracking', 
    tag: 'Recursion',
    concept: 'A DFS that builds a partial candidate, recurses, then undoes the last choice to explore the alternatives.',
    whenToUse: 'Permutations, combinations, subsets, N-Queens, and constraint-satisfaction puzzles.',
    code: 'function backtrack(path, choices) {\n  if (complete(path)) { results.push([...path]); return; }\n  for (const c of choices) {\n    if (!valid(path, c)) continue;\n    path.push(c);\n    backtrack(path, next(choices, c));\n    path.pop();              // undo\n  }\n}' 
  },
  { 
    name: 'Topological Sort', 
    tag: 'Graphs',
    concept: "Order a DAG so every edge points forward. Kahn's algorithm repeatedly peels off zero-indegree nodes.",
    whenToUse: 'Build / dependency order, course scheduling, and detecting cycles in a directed graph.',
    code: 'const q = nodes.filter(v => indeg[v] === 0);\nwhile (q.length) {\n  const u = q.shift(); order.push(u);\n  for (const v of adj[u])\n    if (--indeg[v] === 0) q.push(v);\n}\n// order.length < N  =>  a cycle exists' 
  },
  { 
    name: 'Monotonic Stack', 
    tag: 'Stacks',
    concept: 'A stack kept strictly increasing or decreasing; pop while the invariant breaks to find the nearest greater / smaller element.',
    whenToUse: 'Next greater element, daily temperatures, largest rectangle in a histogram, stock spans.',
    code: 'const st = [];                 // indices, decreasing values\nfor (let i = 0; i < n; i++) {\n  while (st.length && a[st[st.length-1]] < a[i]) {\n    const j = st.pop();\n    res[j] = i;                // i is next-greater of j\n  }\n  st.push(i);\n}' 
  }
];

export const INITIAL_CARDS = [
  { 
    type: 'concept', 
    tag: 'Stacks', 
    front: 'When do you reach for a monotonic stack?',
    back: 'When you need the next / previous greater-or-smaller element in O(n). Keep indices in a stack that stays increasing or decreasing, popping as the invariant breaks.' 
  },
  { 
    type: 'concept', 
    tag: 'Two Pointers', 
    front: 'Sliding window — when do you shrink the window?',
    back: 'While the window violates the constraint (sum too large, a repeated character, more than k distinct). Shrink from the left until it is valid again, updating the aggregate as you remove each element.' 
  },
  { 
    type: 'concept', 
    tag: 'Binary Search', 
    front: 'How do you binary-search on the answer?',
    back: 'Define a monotonic predicate ok(x) that is false then becomes true. Binary search for the smallest x with ok(x) true — testing feasibility in the loop instead of comparing against an array value.' 
  },
  { 
    type: 'problem', 
    tag: 'Arrays', 
    front: 'Merge Overlapping Ranges — what is the key idea?',
    back: 'Sort the intervals by start, then sweep: if the next start ≤ the current end, extend the end; otherwise push a new interval. Overall O(n log n).' 
  },
  { 
    type: 'concept', 
    tag: 'Graphs', 
    front: "Kahn's topological sort in three steps?",
    back: '1) Count every node’s indegree. 2) Queue all zero-indegree nodes. 3) Pop a node into the order, decrement its neighbours’ indegrees, and enqueue any that reach zero. Leftover nodes mean a cycle.' 
  },
  { 
    type: 'concept', 
    tag: 'Recursion', 
    front: 'What is the general backtracking skeleton?',
    back: 'If the path is complete, record it. Otherwise loop over the valid choices: apply a choice, recurse, then undo it (pop) before trying the next one.' 
  }
];

export const INITIAL_TOPICS = [
  { name: 'Arrays', pct: 82, frac: '28/34' },
  { name: 'Two Pointers', pct: 64, frac: '16/25' },
  { name: 'Trees', pct: 55, frac: '17/31' },
  { name: 'Graphs', pct: 41, frac: '11/27' },
  { name: 'Dynamic Prog.', pct: 28, frac: '9/32' }
];

export const DIFF_MAP = {
  Easy: { c: 'var(--color-accent-green-hover)', bg: 'var(--color-badge-easy-bg)', bd: 'var(--color-badge-easy-border)', l: 'EASY' },
  Medium: { c: 'var(--color-accent-orange)', bg: 'var(--color-badge-medium-bg)', bd: 'var(--color-badge-medium-border)', l: 'MED' },
  Hard: { c: 'var(--color-accent-red-hover)', bg: 'var(--color-badge-hard-bg)', bd: 'var(--color-badge-hard-border)', l: 'HARD' }
};

export const STATUS_MAP = {
  'Done': { c: 'var(--color-accent-green-hover)', l: '● Done' },
  'Solving': { c: 'var(--color-accent-blue)', l: '◐ Solving' },
  'Not started': { c: 'var(--color-text-muted)', l: '○ Not started' }
};

export const GRADES = [
  { key: 'Again', c: 'var(--color-accent-red-hover)', iv: '<10 min' },
  { key: 'Hard', c: 'var(--color-accent-orange)', iv: '2 days' },
  { key: 'Good', c: 'var(--color-accent-green-hover)', iv: '6 days' },
  { key: 'Easy', c: 'var(--color-accent)', iv: '12 days' }
];
