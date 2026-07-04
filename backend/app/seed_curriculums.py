"""Seed study curriculums (Blind 75, NeetCode 150/250).

Run from the backend/ directory: python -m app.seed_curriculums
"""

import json
import ssl
import urllib.request

import certifi
from sqlmodel import Session, delete, select

from .db import engine
from .models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion
from .utils import slugify, utcnow

# Fetch URLs
NC_150_URL = "https://raw.githubusercontent.com/krmanik/Anki-NeetCode/main/neetcode-150-list.json"
NC_250_URL = "https://raw.githubusercontent.com/ascherj/neetcode-250-guide/main/neetcode_250_complete.json"

# Blind 75 static titles
BLIND_75_TITLES = [
    # Array
    "Two Sum",
    "Best Time to Buy and Sell Stock",
    "Contains Duplicate",
    "Product of Array Except Self",
    "Maximum Subarray",
    "Maximum Product Subarray",
    "Find Minimum in Rotated Sorted Array",
    "Search in Rotated Sorted Array",
    "3Sum",
    "Container With Most Water",
    # Binary
    "Sum of Two Integers",
    "Number of 1 Bits",
    "Counting Bits",
    "Missing Number",
    "Reverse Bits",
    # DP
    "Climbing Stairs",
    "Coin Change",
    "Longest Increasing Subsequence",
    "Longest Common Subsequence",
    "Word Break",
    "Combination Sum IV",
    "House Robber",
    "House Robber II",
    "Decode Ways",
    "Unique Paths",
    "Jump Game",
    # Graph
    "Clone Graph",
    "Course Schedule",
    "Pacific Atlantic Water Flow",
    "Number of Islands",
    "Longest Consecutive Sequence",
    "Alien Dictionary",
    "Graph Valid Tree",
    "Number of Connected Components in an Undirected Graph",
    # Interval
    "Insert Interval",
    "Merge Intervals",
    "Non-overlapping Intervals",
    "Meeting Rooms",
    "Meeting Rooms II",
    # Linked List
    "Reverse Linked List",
    "Linked List Cycle",
    "Merge Two Sorted Lists",
    "Merge k Sorted Lists",
    "Remove Nth Node From End of List",
    "Reorder List",
    # Matrix
    "Set Matrix Zeroes",
    "Spiral Matrix",
    "Rotate Image",
    "Word Search",
    # String
    "Longest Substring Without Repeating Characters",
    "Longest Repeating Character Replacement",
    "Minimum Window Substring",
    "Valid Anagram",
    "Group Anagrams",
    "Valid Parentheses",
    "Valid Palindrome",
    "Longest Palindromic Substring",
    "Palindromic Substrings",
    "Encode and Decode Strings",
    # Tree
    "Maximum Depth of Binary Tree",
    "Same Tree",
    "Invert Binary Tree",
    "Binary Tree Maximum Path Sum",
    "Binary Tree Level Order Traversal",
    "Serialize and Deserialize Binary Tree",
    "Subtree of Another Tree",
    "Construct Binary Tree from Preorder and Inorder Traversal",
    "Validate Binary Search Tree",
    "Kth Smallest Element in a BST",
    "Lowest Common Ancestor of a Binary Search Tree",
    "Implement Trie (Prefix Tree)",
    "Design Add and Search Words Data Structure",
    "Word Search II",
    # Heap
    "Top K Frequent Elements",
    "Find Median from Data Stream",
]


def fetch_json(url: str, is_github_api: bool = False) -> dict:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
        content = response.read().decode("utf-8")
        return json.loads(content)


def get_slug_from_url(url: str) -> str:
    if not url:
        return ""
    # strip query params and trailing slashes
    clean_url = url.split("?")[0].rstrip("/")
    return clean_url.split("/")[-1].lower()


def run() -> None:
    now = utcnow()

    # Define the 3 standard curriculums
    curriculum_definitions = [
        {
            "slug": "blind-75",
            "name": "Blind 75",
            "description": "The 75 most essential LeetCode questions to master key coding interview patterns.",
        },
        {
            "slug": "neetcode-150",
            "name": "NeetCode 150",
            "description": "A structured roadmap of 150 LeetCode questions covering all major DSA topics, building on top of Blind 75.",
        },
        {
            "slug": "neetcode-250",
            "name": "NeetCode 250",
            "description": "A comprehensive study plan of 250 LeetCode questions, expanding on NeetCode 150 with beginner-friendly practice.",
        },
    ]

    with Session(engine) as session:
        print("Loading global LeetCode questions from database...")
        db_questions = session.exec(select(LeetCodeQuestion)).all()
        print(f"Loaded {len(db_questions)} questions from DB.")

        # Cleanup any non-standard curriculums (like AlgoMaster 300 or accidently-created user lists)
        standard_slugs = ["blind-75", "neetcode-150", "neetcode-250"]
        custom_curriculums = session.exec(
            select(Curriculum).where(Curriculum.slug.not_in(standard_slugs))
        ).all()
        for cc in custom_curriculums:
            print(f"Removing non-standard curriculum: {cc.name} ({cc.slug})")
            session.exec(
                delete(CurriculumQuestionLink).where(
                    CurriculumQuestionLink.curriculum_id == cc.id
                )
            )
            session.delete(cc)
        session.commit()

        # Create quick lookups
        slug_lookup = {}
        id_lookup = {}
        for q in db_questions:
            slug = get_slug_from_url(q.leetcode_url)
            if slug:
                slug_lookup[slug] = q
            id_lookup[q.id] = q

        # Ensure Curriculum records exist
        curriculums = {}
        for definition in curriculum_definitions:
            c = session.exec(
                select(Curriculum).where(Curriculum.slug == definition["slug"])
            ).first()
            if not c:
                c = Curriculum(
                    name=definition["name"],
                    slug=definition["slug"],
                    description=definition["description"],
                    user_id=None,  # system-wide
                    created_at=now,
                    updated_at=now,
                )
                session.add(c)
                session.commit()
                session.refresh(c)
                print(f"Created global curriculum: {c.name}")
            else:
                print(f"Found existing global curriculum: {c.name}")
            curriculums[c.slug] = c

        # -------------------------------------------------------------
        # 1. Seed Blind 75
        # -------------------------------------------------------------
        print("\nSeeding Blind 75...")
        blind_75_c = curriculums["blind-75"]
        # Clear existing links
        session.exec(
            delete(CurriculumQuestionLink).where(
                CurriculumQuestionLink.curriculum_id == blind_75_c.id
            )
        )
        session.commit()

        blind_75_added = 0
        for title in BLIND_75_TITLES:
            tslug = slugify(title)
            # Try matching by slug directly
            q = slug_lookup.get(tslug)
            if not q:
                # Fallback: exact match in slug lookup where key contains tslug
                for k, val in slug_lookup.items():
                    if tslug in k or k in tslug:
                        q = val
                        break
            if q:
                link = CurriculumQuestionLink(
                    curriculum_id=blind_75_c.id, leetcode_id=q.id
                )
                session.add(link)
                blind_75_added += 1
            else:
                print(f"Warning: Could not match Blind 75 question '{title}'")

        session.commit()
        print(f"Seeded {blind_75_added} / 75 questions to Blind 75.")

        # -------------------------------------------------------------
        # 2. Seed NeetCode 150
        # -------------------------------------------------------------
        print("\nSeeding NeetCode 150...")
        nc_150_c = curriculums["neetcode-150"]
        session.exec(
            delete(CurriculumQuestionLink).where(
                CurriculumQuestionLink.curriculum_id == nc_150_c.id
            )
        )
        session.commit()

        try:
            nc_150_data = fetch_json(NC_150_URL)
            nc_150_added = 0
            for category, problems in nc_150_data.items():
                if not isinstance(problems, dict):
                    continue
                for p_name, details in problems.items():
                    url = details.get("url")
                    pslug = get_slug_from_url(url)
                    q = slug_lookup.get(pslug)
                    if q:
                        link = CurriculumQuestionLink(
                            curriculum_id=nc_150_c.id, leetcode_id=q.id
                        )
                        session.add(link)
                        nc_150_added += 1
            session.commit()
            print(f"Seeded {nc_150_added} questions to NeetCode 150.")
        except Exception as e:
            print(f"Error fetching/parsing NeetCode 150: {e}")

        # -------------------------------------------------------------
        # 3. Seed NeetCode 250
        # -------------------------------------------------------------
        print("\nSeeding NeetCode 250...")
        nc_250_c = curriculums["neetcode-250"]
        session.exec(
            delete(CurriculumQuestionLink).where(
                CurriculumQuestionLink.curriculum_id == nc_250_c.id
            )
        )
        session.commit()

        try:
            nc_250_data = fetch_json(NC_250_URL)
            nc_250_added = 0
            problems_list = nc_250_data.get("problems", [])
            for p in problems_list:
                url = p.get("leetcode_url")
                pslug = get_slug_from_url(url)
                q = slug_lookup.get(pslug)
                if q:
                    link = CurriculumQuestionLink(
                        curriculum_id=nc_250_c.id, leetcode_id=q.id
                    )
                    session.add(link)
                    nc_250_added += 1
            session.commit()
            print(f"Seeded {nc_250_added} questions to NeetCode 250.")
        except Exception as e:
            print(f"Error fetching/parsing NeetCode 250: {e}")

    print("\nSeeding study curriculums complete!")


if __name__ == "__main__":
    run()
