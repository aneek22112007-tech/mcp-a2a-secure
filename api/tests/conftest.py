import pytest
from app.auth import ApiKeyVerifier, Principal, set_api_key_verifier

class DummyVerifier(ApiKeyVerifier):
    async def verify(self, raw_key: str) -> Principal | None:
        if raw_key == "mcpg_test":
            return Principal(
                api_key_id="test",
                client_id="test",
                key_prefix="mcpg_test",
                scopes=frozenset({"notes:read", "notes:write", "agent:run"})
            )
        return None

@pytest.fixture(autouse=True)
def setup_dummy_verifier():
    set_api_key_verifier(DummyVerifier())

@pytest.fixture
def anyio_backend():
    return "asyncio"
