from sqlmodel import select

from app.models import CustomList, CustomListProblemLink, Problem, User
from app.routers.custom_lists import (
    create_custom_list,
    list_custom_lists,
    get_custom_list,
    update_custom_list,
    delete_custom_list,
    add_problems_to_custom_list,
    remove_problem_from_custom_list,
)
from app.schemas import CustomListCreate, CustomListUpdate, CustomListProblemsUpdate
from app.serialize import serialize_problem


def make_problem(session, user, topic, title="Problem 1"):
    p = Problem(
        user_id=user.id, title=title, topic_id=topic.id, difficulty="Easy"
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def test_create_custom_list(session, user):
    payload = CustomListCreate(name="My Play List", description="Study playlist")
    res = create_custom_list(data=payload, user=user, session=session)

    assert res["name"] == "My Play List"
    assert res["description"] == "Study playlist"
    assert res["problemCount"] == 0
    assert "id" in res

    db_list = session.get(CustomList, res["id"])
    assert db_list is not None
    assert db_list.name == "My Play List"
    assert db_list.user_id == user.id


def test_list_custom_lists(session, user):
    cl1 = CustomList(name="List A", user_id=user.id)
    cl2 = CustomList(name="List B", user_id=user.id)
    session.add(cl1)
    session.add(cl2)
    session.commit()

    rows = list_custom_lists(user=user, session=session)
    assert len(rows) == 2
    assert rows[0]["name"] == "List B"  # ordered by desc created_at
    assert rows[1]["name"] == "List A"


def test_add_and_remove_problems_custom_list(session, user, topic):
    cl = CustomList(name="List A", user_id=user.id)
    session.add(cl)
    session.commit()
    session.refresh(cl)

    p1 = make_problem(session, user, topic, "P1")
    p2 = make_problem(session, user, topic, "P2")

    # Add problems
    add_payload = CustomListProblemsUpdate(problem_ids=[p1.id, p2.id])
    add_res = add_problems_to_custom_list(id=cl.id, data=add_payload, user=user, session=session)
    assert add_res["addedCount"] == 2

    # Verify links
    links = session.exec(select(CustomListProblemLink)).all()
    assert len(links) == 2

    # Check serialized problem includes customListIds
    session.refresh(p1)
    serialized = serialize_problem(p1)
    assert cl.id in serialized["customListIds"]

    # Verify get_custom_list contains the problems
    detail = get_custom_list(id=cl.id, user=user, session=session)
    assert detail["name"] == "List A"
    assert len(detail["problems"]) == 2
    assert detail["problems"][0]["id"] in [p1.id, p2.id]

    # Remove a problem
    remove_problem_from_custom_list(id=cl.id, problem_id=p1.id, user=user, session=session)
    links_after = session.exec(select(CustomListProblemLink)).all()
    assert len(links_after) == 1
    assert links_after[0].problem_id == p2.id


def test_update_and_delete_custom_list(session, user, topic):
    cl = CustomList(name="Old Name", description="Old Desc", user_id=user.id)
    session.add(cl)
    session.commit()
    session.refresh(cl)

    p = make_problem(session, user, topic)
    link = CustomListProblemLink(custom_list_id=cl.id, problem_id=p.id)
    session.add(link)
    session.commit()

    # Update
    update_payload = CustomListUpdate(name="New Name", description="New Desc")
    update_res = update_custom_list(id=cl.id, data=update_payload, user=user, session=session)
    assert update_res["name"] == "New Name"
    assert update_res["description"] == "New Desc"

    # Delete
    delete_custom_list(id=cl.id, user=user, session=session)
    assert session.get(CustomList, cl.id) is None
    assert session.exec(select(CustomListProblemLink)).all() == []
