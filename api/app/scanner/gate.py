from app.config import settings
from app.database import async_session_maker
from app.pins.gate import ScanGate
from app.repos.scanner import count_open_blocking


class DbScanGate(ScanGate):
    """Scan gate that checks the database for open blocking findings."""

    async def blocking_reason(self, tool_name: str, fingerprint: str) -> str | None:
        if not settings.scanner_enabled:
            return None

        # Determine which severities actually block
        block_severities = []
        if settings.scanner_block_severities:
            block_severities = [
                s.strip().lower()
                for s in settings.scanner_block_severities.split(",")
                if s.strip()
            ]

        if not block_severities:
            return None

        async with async_session_maker() as session:
            count = await count_open_blocking(
                session, tool_name, fingerprint, block_severities
            )
            if count > 0:
                return "pin_scan_blocked"

        return None
