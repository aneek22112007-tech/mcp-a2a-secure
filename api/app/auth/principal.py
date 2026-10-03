from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Principal:
    api_key_id: str
    client_id: str
    key_prefix: str
    scopes: frozenset[str]

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes or "admin" in self.scopes

    def has_all(self, required: Iterable[str]) -> bool:
        return all(self.has_scope(s) for s in required)
