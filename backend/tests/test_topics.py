"""Topic progress: solved/total per topic for the dashboard bars."""

from app.models import Problem, Topic, User
from app.routers.topics import list_topics


def add_problem(session, user, topic, status="Not started"):
    p = Problem(
        user_id=user.id, title=f"P {status}",
        topic_id=topic.id, difficulty="Medium", status=status,
    )
    session.add(p)
    session.commit()
    return p


def test_topics_report_solved_over_total(session, user, topic):
    add_problem(session, user, topic, "Not started")
    add_problem(session, user, topic, "Solving")
    add_problem(session, user, topic, "Done")
    add_problem(session, user, topic, "Done")

    [row] = list_topics(user=user, session=session)

    assert row["pct"] == 50
    assert row["frac"] == "2/4"
    assert row["solved"] == 2
    assert row["total"] == 4


def test_topics_skip_empty_and_sort_biggest_first(session, user, topic):
    small = Topic(name="Graphs", slug="graphs")
    empty = Topic(name="Trees", slug="trees")
    session.add(small)
    session.add(empty)
    session.commit()

    add_problem(session, user, topic, "Done")
    add_problem(session, user, topic, "Done")
    add_problem(session, user, small, "Solving")

    rows = list_topics(user=user, session=session)

    assert [r["name"] for r in rows] == ["Arrays", "Graphs"]
    assert rows[0]["pct"] == 100
    assert rows[1]["pct"] == 0


def test_topics_isolated_per_user(session, user, topic):
    # The current user has a single solved problem in the topic.
    add_problem(session, user, topic, "Done")

    # Another user piles problems into the same topic; none should leak into
    # the current user's counts.
    other = User(name="Other User")
    session.add(other)
    session.commit()
    session.refresh(other)
    for _ in range(3):
        add_problem(session, other, topic, "Done")

    [row] = list_topics(user=user, session=session)

    assert row["frac"] == "1/1"
    assert row["total"] == 1
    assert row["solved"] == 1
    assert row["pct"] == 100
