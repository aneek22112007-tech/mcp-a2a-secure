"""Delegation scope attenuation for A2A tasks.

Security contract
-----------------
1.  The *effective* delegated scopes are computed server-side from the two
    server-configured key sets (manager, worker).  The request body never
    contributes extra permissions.

2.  The worker's effective permission set is:

        delegated_scopes = manager_scopes ∩ worker_scopes ∩ NOTES_TOOL_SCOPES

    where NOTES_TOOL_SCOPES is the fixed set of scopes that the notes
    worker is allowed to exercise.  ``agent:run`` alone does **not** imply
    ``notes:read`` or ``notes:write``; both must be present on the manager's
    principal *and* on the worker's configured key.

3.  Any requested scope that exceeds this intersection is rejected with
    the project's FORBIDDEN error shape (403 + FORBIDDEN code), not silently
    dropped.

4.  Credentials are never returned or logged.  Only the key *prefix* (the
    public part of the key) is used for attribution.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.auth.scopes import NOTES_READ, NOTES_WRITE

# The only tool-level scopes a notes worker may ever receive.
# agent:run alone does NOT grant these; both sides must carry each scope.
NOTES_TOOL_SCOPES: frozenset[str] = frozenset({NOTES_READ, NOTES_WRITE})


class DelegationScopeError(ValueError):
    """Requested delegated scopes exceed the manager's effective permissions.

    ``excess`` is the set of scopes that were denied.
    The exception message is safe to surface to the caller.
    """

    def __init__(self, excess: frozenset[str]) -> None:
        self.excess = excess
        super().__init__(
            f"Delegation denied: worker permissions exceed delegator permissions: "
            f"{', '.join(sorted(excess))}."
        )


class EmptyDelegationScopeError(ValueError):
    """Computed delegated scopes are empty.

    At least one tool scope (notes:read or notes:write) must be held by both
    delegator and worker.
    """

    def __init__(self) -> None:
        super().__init__(
            "Delegation denied: delegated permissions are empty. "
            "At least one tool scope (notes:read or notes:write) must be held "
            "by both delegator and worker."
        )


@dataclass(frozen=True, slots=True)
class DelegationContext:
    """The resolved, attenuated delegation grant.

    ``delegated_scopes`` is what the worker key is *allowed* to use on
    this specific task.  It is always a subset of both the manager's
    effective scopes *and* the worker's configured scopes.
    """

    manager_key_prefix: str
    worker_key_prefix: str
    delegated_scopes: frozenset[str]


def build_delegation(
    *,
    manager_scopes: frozenset[str],
    worker_scopes: frozenset[str],
    requested_scopes: frozenset[str] | None = None,
) -> DelegationContext:
    """Compute the intersection-attenuated delegation grant.

    Security rule:
    Worker tool permissions must be a subset of the delegator's effective
    permissions. agent:run alone never implies notes:read or notes:write.
    Any excess permissions on the worker relative to the manager are rejected
    with DelegationScopeError.
    """
    effective_manager = _expand(manager_scopes)
    effective_worker = _expand(worker_scopes)

    # The tool-level permissions the worker is configured with
    worker_tool_permissions = effective_worker & NOTES_TOOL_SCOPES

    # The tool-level permissions the manager holds
    manager_tool_permissions = effective_manager & NOTES_TOOL_SCOPES

    # Worker tool permissions must be a subset of the manager's permissions.
    # If the worker has tool permissions the manager lacks, reject with excess.
    excess = worker_tool_permissions - manager_tool_permissions
    if excess:
        raise DelegationScopeError(excess)

    # If requested_scopes is provided as a further narrowing, ensure it is
    # also a subset of the manager's permissions.
    if requested_scopes is not None:
        requested_excess = requested_scopes - manager_tool_permissions
        if requested_excess:
            raise DelegationScopeError(requested_excess)
        delegated = worker_tool_permissions & requested_scopes
    else:
        delegated = worker_tool_permissions

    if not delegated:
        raise EmptyDelegationScopeError()

    return DelegationContext(
        manager_key_prefix="",
        worker_key_prefix="",
        delegated_scopes=delegated,
    )


def attenuate(
    *,
    manager_key_prefix: str,
    manager_scopes: frozenset[str],
    worker_key_prefix: str,
    worker_scopes: frozenset[str],
    requested_scopes: frozenset[str] | None = None,
) -> DelegationContext:
    """Full public API: resolve and return the delegation context.

    Raises ``DelegationScopeError`` when the requested grant exceeds the
    manager's effective permissions.
    """
    ctx = build_delegation(
        manager_scopes=manager_scopes,
        worker_scopes=worker_scopes,
        requested_scopes=requested_scopes,
    )
    # Return a new context with the key prefixes filled in.
    return DelegationContext(
        manager_key_prefix=manager_key_prefix,
        worker_key_prefix=worker_key_prefix,
        delegated_scopes=ctx.delegated_scopes,
    )


def _expand(scopes: frozenset[str]) -> frozenset[str]:
    """Treat 'admin' as implying all scopes for intersection only."""
    from app.auth.scopes import ALL_SCOPES

    if "admin" in scopes:
        return frozenset(ALL_SCOPES)
    return scopes
