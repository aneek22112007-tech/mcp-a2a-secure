from app.scanner.rules.pack import scan_tool_rules
from app.scanner.types import ScannerFinding
from app.tools.catalog import ToolDefinition


def scan_tool(defn: ToolDefinition) -> list[ScannerFinding]:
    """Scan a single tool definition using the static rule pack."""
    # We fingerprint to ensure the caller has it if needed,
    # but the rule engine itself only acts on the definition data.
    # The actual findings insert will use fingerprint_tool(defn) separately.
    return scan_tool_rules(defn)
