"""Errors raised by repository functions.

Integrity failures from the database are not wrapped. Callers see
``sqlalchemy.exc.IntegrityError`` when a constraint rejects a write.
"""


class RepositoryError(Exception):
    """Base class for repository lookup failures."""


class ClientNotFoundError(RepositoryError):
    def __init__(self, client_id: str) -> None:
        self.client_id = client_id
        super().__init__(f"Client {client_id} was not found")


class ApiKeyNotFoundError(RepositoryError):
    def __init__(self, api_key_id: str) -> None:
        self.api_key_id = api_key_id
        super().__init__(f"API key {api_key_id} was not found")
