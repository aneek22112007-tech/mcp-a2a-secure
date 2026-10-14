import { useState } from 'react';
import {
  Search, Play, CheckCircle, AlertTriangle, Download, Info,
} from 'lucide-react';
import { useFindings, useScanAll, useScanTool, useResolveFinding, usePins } from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, EmptyState, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtDatetime, severityClass, severityBadgeClass,
} from '../../utils/helpers';
import { DEMO_FINDINGS } from '../../demo/demoData';
import type { ScanFinding } from '../../api/client';
import { toast } from 'sonner';

interface ScannerViewProps { isDemo: boolean }

const RULE_LABELS: Record<string, string> = {
  R1_PROMPT_INJECTION:      'Prompt Injection',
  R2_EXFILTRATION:          'Exfiltration Pattern',
  R3_OVERBROAD_STRING:      'Overbroad String',
  R4_SIZE_CAP_DESCRIPTION:  'Size Cap (Desc)',
  R4_SIZE_CAP_SCHEMA:       'Size Cap (Schema)',
  R5_SUSPICIOUS_PARAM_DESC: 'Suspicious Param',
  R6_TOOL_NAME_ANOMALY:     'Name Anomaly',
};

function ScannerViewInner({ isDemo }: ScannerViewProps) {
  const [selectedTool, setSelectedTool] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{
    scan_id: string; tools_scanned: number; findings_open: number; by_severity: Record<string, number>;
  } | null>(null);

  const { data: pinsData } = usePins(!isDemo);
  const toolNames = (pinsData?.items ?? []).map(p => p.tool_name);

  const { data, isLoading, isError, refetch } = useFindings(
    { open_only: openOnly, tool_name: selectedTool || undefined },
    !isDemo,
  );
  const scanAll    = useScanAll();
  const scanTool   = useScanTool();
  const resolveFinding = useResolveFinding();

  const findings: ScanFinding[] = isDemo ? DEMO_FINDINGS : (data?.items ?? []);

  const handleScanAll = async () => {
    try {
      const res = await scanAll.mutateAsync();
      setLastScan(res);
      toast.success(`Scan complete — ${res.findings_open} open finding(s) across ${res.tools_scanned} tool(s)`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Scan failed');
    }
  };

  const handleScanTool = async () => {
    if (!selectedTool) return;
    try {
      const res = await scanTool.mutateAsync(selectedTool);
      setLastScan(res);
      toast.success(`Scanned ${selectedTool} — ${res.findings_open} open finding(s)`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Scan failed');
    }
  };

  const handleResolve = async (id: string, toolName: string) => {
    try {
      await resolveFinding.mutateAsync(id);
      toast.success(`Resolved finding for ${toolName}`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Resolve failed');
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(findings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcpg-findings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scanning = scanAll.isPending || scanTool.isPending;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Scanner
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            Static rule-based checks on tool schemas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={findings.length === 0}
            aria-label="Export findings as JSON"
          >
            <Download size={12} /> Export JSON
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleScanTool}
            disabled={isDemo || !selectedTool || scanning}
            aria-label={`Scan ${selectedTool || 'selected tool'}`}
          >
            <Play size={12} />
            {scanning && selectedTool ? 'Scanning…' : 'Scan tool'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleScanAll}
            disabled={isDemo || scanning}
            aria-label="Run full scan"
          >
            <Search size={12} style={scanning && !selectedTool ? { animation: 'spin 1s linear infinite' } : undefined} />
            {scanning && !selectedTool ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
      </div>

      {/* Rule-based disclaimer */}
      <div
        className="panel"
        style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <Info size={13} style={{ color: 'var(--c-info)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--c-text)' }}>Rule-based checks, not full coverage.</strong>
          {' '}Scans are synchronous — results appear immediately. Severities in{' '}
          <span className="mono">SCANNER_BLOCK_SEVERITIES</span>
          {' '}block tools via the pin gate (reason: <span className="mono" style={{ color: 'var(--c-deny)' }}>pin_scan_blocked</span>).
        </span>
      </div>

      {/* Last scan summary */}
      {lastScan && (
        <div
          className="panel"
          style={{ padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
          role="status"
          aria-live="polite"
        >
          <CheckCircle size={14} style={{ color: 'var(--c-allow)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            Scan <span className="mono" style={{ fontSize: 11 }}>{lastScan.scan_id.slice(0, 8)}…</span>
            {' · '}{lastScan.tools_scanned} tool(s)
            {' · '}<strong style={{ color: lastScan.findings_open > 0 ? 'var(--c-deny)' : 'var(--c-allow)' }}>
              {lastScan.findings_open} open finding(s)
            </strong>
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(lastScan.by_severity).map(([sev, count]) => (
              <span key={sev} className={`badge ${severityBadgeClass(sev)}`}>
                {sev}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="input"
          value={selectedTool}
          onChange={e => setSelectedTool(e.target.value)}
          style={{ width: 200, fontSize: 12 }}
          aria-label="Filter by tool"
        >
          <option value="">All tools</option>
          {toolNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--c-text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={e => setOpenOnly(e.target.checked)}
            style={{ accentColor: 'var(--c-amber)' }}
          />
          Open only
        </label>
      </div>

      {/* Findings table */}
      <div className="panel">
        {!isDemo && isLoading && !data ? (
          <LoadingPanel label="Loading findings…" />
        ) : !isDemo && isError ? (
          <ErrorPanel message="Failed to load findings" onRetry={() => void refetch()} />
        ) : findings.length === 0 ? (
          <EmptyState
            label={openOnly ? 'No open findings. Run a scan to check.' : 'No findings.'}
            icon={Search}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Rule</th>
                <th>Tool</th>
                <th>Message</th>
                <th>Detected</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {findings.map(f => (
                <>
                  <tr
                    key={f.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    aria-expanded={expanded === f.id}
                  >
                    <td>
                      <span className={`badge ${severityBadgeClass(f.severity)}`}>
                        <span className={severityClass(f.severity)}>{f.severity}</span>
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                        {f.rule_id}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--c-text-dim)', marginLeft: 6 }}>
                        {RULE_LABELS[f.rule_id] ?? ''}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{f.tool_name}</td>
                    <td style={{ fontSize: 12, maxWidth: 280 }}>
                      {f.message.slice(0, 80)}{f.message.length > 80 ? '…' : ''}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                      {fmtDatetime(f.created_at)}
                    </td>
                    <td>
                      {f.resolved_at
                        ? <span className="badge badge-allow">Resolved</span>
                        : <span className="badge badge-deny">Open</span>}
                    </td>
                    <td>
                      {!f.resolved_at && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={e => { e.stopPropagation(); void handleResolve(f.id, f.tool_name); }}
                          disabled={isDemo}
                          aria-label={`Resolve finding for ${f.tool_name}`}
                        >
                          <CheckCircle size={11} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === f.id && (
                    <tr key={f.id + '-exp'} style={{ background: 'var(--c-surface-2)' }}>
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 12, color: 'var(--c-text)' }}>
                            <strong>Full message:</strong> {f.message}
                          </div>
                          {f.evidence && (
                            <div>
                              <span className="section-label">Evidence</span>
                              <pre
                                className="mono"
                                style={{
                                  fontSize: 11,
                                  color: 'var(--c-text-muted)',
                                  background: 'var(--c-bg)',
                                  border: '1px solid var(--c-border)',
                                  borderRadius: 'var(--radius)',
                                  padding: '8px 10px',
                                  marginTop: 6,
                                  overflow: 'auto',
                                  maxHeight: 120,
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {f.evidence}
                              </pre>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
                            Finding ID: <span className="mono">{f.id}</span>
                            {f.scan_id && <> · Scan: <span className="mono">{f.scan_id.slice(0, 8)}…</span></>}
                            · Fingerprint: <span className="mono">{f.fingerprint.slice(0, 16)}…</span>
                          </div>
                          {f.resolved_at && (
                            <div style={{ fontSize: 11, color: 'var(--c-allow)' }}>
                              <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                              Resolved: {fmtDatetime(f.resolved_at)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rule reference */}
      <div className="panel" style={{ padding: 16 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Rule Reference</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6 }}>
          {[
            { id: 'R1', label: 'PROMPT_INJECTION',      sev: 'high' },
            { id: 'R2', label: 'EXFILTRATION',          sev: 'critical' },
            { id: 'R3', label: 'OVERBROAD_STRING',      sev: 'medium' },
            { id: 'R4', label: 'SIZE_CAP_DESC/SCHEMA',  sev: 'medium' },
            { id: 'R5', label: 'SUSPICIOUS_PARAM_DESC', sev: 'high' },
            { id: 'R6', label: 'TOOL_NAME_ANOMALY',     sev: 'low' },
          ].map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
              <span className="mono" style={{ color: 'var(--c-text-muted)', flexShrink: 0 }}>{r.id}</span>
              <span style={{ color: 'var(--c-text-dim)' }}>{r.label}</span>
              <span className={`badge ${severityBadgeClass(r.sev)}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                {r.sev}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScannerView(props: ScannerViewProps) {
  return (
    <ConsoleErrorBoundary>
      <ScannerViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
