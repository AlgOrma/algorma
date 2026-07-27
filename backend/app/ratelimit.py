"""Shared slowapi limiter — brute-force protection on login/register.

Lives in its own module so both ``main`` (app wiring) and ``routers.auth``
(the ``@limiter.limit`` decorators) can import it without a cycle.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
