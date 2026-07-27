"""Business logic between the routers and the DB.

Routers stay thin HTTP adapters: parse the request (FastAPI dependencies and
schemas), call a service function, serialize the result (``serialize.py``).
Services own the queries, ownership checks, and write flows so each rule lives
in exactly one place. They raise ``HTTPException`` directly — small app, no
separate domain-error layer.
"""
