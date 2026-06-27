"""Seed or update LeetCode questions in the database incrementally.

Run from the backend/ directory:  python -m app.seed_leetcode
"""

import json
import time
import urllib.request
from typing import Any

from sqlmodel import Session, select

from .db import engine, init_db
from .models import LeetCodeQuestion
from .utils import utcnow

JSON_URL = "https://raw.githubusercontent.com/noworneverev/leetcode-api/refs/heads/main/data/leetcode_questions.json"


def fetch_leetcode_questions() -> list:
    print(f"Fetching LeetCode questions from {JSON_URL}...")
    start_time = time.time()
    req = urllib.request.Request(
        JSON_URL,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        content = response.read().decode("utf-8")
        data = json.loads(content)
        elapsed = time.time() - start_time
        print(f"Downloaded {len(data)} questions in {elapsed:.2f}s")
        return data


def run() -> None:
    # Ensure database tables are created first
    init_db()

    try:
        raw_data = fetch_leetcode_questions()
    except Exception as e:
        print(f"Error fetching questions: {e}")
        return

    inserted_count = 0
    updated_count = 0
    now = utcnow()

    with Session(engine) as session:
        print("Loading existing questions from DB...")
        existing_qs = {
            q.id: q for q in session.exec(select(LeetCodeQuestion)).all()
        }
        print(f"Found {len(existing_qs)} existing questions in database.")

        for idx, item in enumerate(raw_data):
            q_data = item.get("data", {}).get("question")
            if not q_data:
                continue

            q_id = q_data.get("questionFrontendId")
            if not q_id:
                continue

            # Extract fields safely
            question_id = q_data.get("questionId") or ""
            title = q_data.get("title") or ""
            difficulty = q_data.get("difficulty") or "Easy"
            statement = q_data.get("content") or ""
            leetcode_url = q_data.get("url") or ""
            is_paid_only = bool(q_data.get("isPaidOnly", False))
            likes = int(q_data.get("likes") or 0)
            dislikes = int(q_data.get("dislikes") or 0)
            category_title = q_data.get("categoryTitle") or "Algorithms"

            # Serialize complex types to JSON strings
            topic_tags_list = [
                tag.get("name")
                for tag in q_data.get("topicTags") or []
                if tag.get("name")
            ]
            topic_tags = json.dumps(topic_tags_list)

            hints_list = q_data.get("hints") or []
            hints = json.dumps(hints_list)

            solution_obj = q_data.get("solution") or {}
            solution_content = (
                solution_obj.get("content")
                if isinstance(solution_obj, dict)
                else None
            )

            has_solution = bool(q_data.get("hasSolution", False))
            has_video_solution = bool(q_data.get("hasVideoSolution", False))

            similar_questions_raw = q_data.get("similarQuestions") or "[]"
            # Normalize similar questions
            try:
                if isinstance(similar_questions_raw, str):
                    similar_questions_list = json.loads(similar_questions_raw)
                else:
                    similar_questions_list = similar_questions_raw
                similar_questions = json.dumps(similar_questions_list)
            except Exception:
                similar_questions = "[]"

            stats_raw = q_data.get("stats") or "{}"
            try:
                if isinstance(stats_raw, str):
                    stats_dict = json.loads(stats_raw)
                else:
                    stats_dict = stats_raw
                stats = json.dumps(stats_dict)
            except Exception:
                stats = "{}"

            # Check if exists or needs update
            if q_id in existing_qs:
                existing = existing_qs[q_id]
                needs_update = False

                # Helper to compare and update field if changed
                def check_update(field_name: str, new_val: Any) -> None:
                    nonlocal needs_update
                    current_val = getattr(existing, field_name)
                    if current_val != new_val:
                        setattr(existing, field_name, new_val)
                        needs_update = True

                check_update("question_id", question_id)
                check_update("title", title)
                check_update("difficulty", difficulty)
                check_update("statement", statement)
                check_update("leetcode_url", leetcode_url)
                check_update("topic_tags", topic_tags)
                check_update("is_paid_only", is_paid_only)
                check_update("likes", likes)
                check_update("dislikes", dislikes)
                check_update("category_title", category_title)
                check_update("hints", hints)
                check_update("solution_content", solution_content)
                check_update("has_solution", has_solution)
                check_update("has_video_solution", has_video_solution)
                check_update("similar_questions", similar_questions)
                check_update("stats", stats)

                if needs_update:
                    existing.updated_at = now
                    session.add(existing)
                    updated_count += 1
            else:
                new_q = LeetCodeQuestion(
                    id=q_id,
                    question_id=question_id,
                    title=title,
                    difficulty=difficulty,
                    statement=statement,
                    leetcode_url=leetcode_url,
                    topic_tags=topic_tags,
                    is_paid_only=is_paid_only,
                    likes=likes,
                    dislikes=dislikes,
                    category_title=category_title,
                    hints=hints,
                    solution_content=solution_content,
                    has_solution=has_solution,
                    has_video_solution=has_video_solution,
                    similar_questions=similar_questions,
                    stats=stats,
                    created_at=now,
                    updated_at=now,
                )
                session.add(new_q)
                inserted_count += 1

            # Commit periodically to keep transactions fast and limit memory
            if (idx + 1) % 500 == 0:
                session.commit()

        session.commit()

    print(
        f"Seeding complete! Added {inserted_count} new questions, updated {updated_count} existing questions."
    )


if __name__ == "__main__":
    run()
