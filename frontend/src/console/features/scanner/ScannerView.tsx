import { Fragment, useState } from 'react';
import {
  Search, Play, CheckCircle, AlertTriangle, Download, Info, Sparkles,
} from 'lucide-react';
import {
  useFindings, useScanAll, useScanTool, useResolveFinding, usePins, useAudit,
} from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, EmptyState, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtDatetime, fmtTimestamp, CONSOLE_TZ_LABEL, severityClass, severityBadgeClass,
} from '../../utils/helpers';
import type { ScanFinding, ScanStats } from '../../api/client';
import { toast } from 'sonner';

interface ScannerViewProps { offline: boolean }

const RULE_LABELS: Record<string, string> = {
  R1_PROMPT_INJECTION:      'Prompt Injection',
  R2_EXFILTRATION:          'Exfiltration Pattern',
  R3_OVERBROAD_STRING:      'Overbroad String',
  R4_SIZE_CAP_DESCRIPTION:  'Size Cap (Desc)',
  R4_SIZE_CAP_SCHEMA:       'Size Cap (Schema)',
  R5_SUSPICIOUS_PARAM_DESC: 'Suspicious Param',
  R6_TOOL_NAME_ANOMALY:     'Name Anomaly',
  AI1_SEMANTIC_POISONING:   'Semantic Poisoning',
};

function parseScanCompletedReason(reason?: string | null) {
  if (!reason) return null;
  const matchScanned = reason.match(/scanned=(\d+)/);
  const matchFindings = reason.match(/findings=(\d+)/);
  const matchAiChecked = reason.match(/ai_checked=(\d+)/);
  const matchAiUnavailable = reason.match(/ai_unavailable=(\d+)/);
  if (!matchScanned) return null;
  return {
    scanned: parseInt(matchScanned[1], 10),
    findings: matchFindings ? parseInt(matchFindings[1], 10) : 0,
    aiChecked: matchAiChecked ? parseInt(matchAiChecked[1], 10) : undefined,
    aiUnavailable: matchAiUnavailable ? parseInt(matchAiUnavailable[1], 10) : undefined,
  };
}

function ScannerViewInner({ offline }: ScannerViewProps) {
  const [selectedTool, setSelectedTool] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanStats | null>(null);

  const { data: pinsData } = usePins();
  const toolNames = (pinsData?.items ?? []).map(p => p.tool_name);

  const { data, isLoading, isError, refetch } = useFindings({
    open_only: openOnly,
    tool_name: selectedTool || undefined,
  });
  const { data: auditData } = useAudit({ action: 'tool.scan.completed', limit: 1 });

  const scanAll    = useScanAll();
  const scanTool   = useScanTool();
  const resolveFinding = useResolveFinding();

  const findings: ScanFinding[] = data?.items ?? [];

  const handleScanAll = async () => {
    if (offline) return;
    try {
      const res = await scanAll.mutateAsync(aiEnabled);
      setLastScan(res);
      let msg = `Scan complete — ${res.findings_open} open finding(s) across ${res.tools_scanned} tool(s)`;
      if (res.ai_checked != null && res.ai_checked > 0) {
        msg += ` (${res.ai_checked} checked with AI)`;
      }
      toast.success(msg);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Scan failed');
    }
  };

  const handleScanTool = async () => {
    if (offline || !selectedTool) return;
    try {
      const res = await scanTool.mutateAsync({ tool_name: selectedTool, ai: aiEnabled });
      setLastScan(res);
      let msg = `Scanned ${selectedTool} — ${res.findings_open} open finding(s)`;
      if (res.ai_checked != null && res.ai_checked > 0) {
        msg += ` (checked with AI)`;
      }
      toast.success(msg);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Scan failed');
    }
  };

  const handleResolve = async (id: string, toolName: string) => {
    if (offline) return;
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
    <div className="console-page">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">
            Scanner
          </h1>
          <p className="page-sub">
            Static rule-based checks and AI semantic analysis on tool schemas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              fontSize: 12,
              color: 'var(--c-text-muted)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            title="Run local LLM to read descriptions and schemas (~20-30s per tool)"
          >
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={e => setAiEnabled(e.target.checked)}
              style={{ accentColor: 'var(--c-amber)' }}
            />
            <Sparkles size={12} style={{ color: aiEnabled ? 'var(--c-amber)' : 'inherit' }} />
            Include AI check
          </label>
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
            disabled={offline || !selectedTool || scanning}
            aria-label={`Scan ${selectedTool || 'selected tool'}`}
          >
            <Play size={12} />
            {scanning && selectedTool ? 'Scanning…' : 'Scan tool'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleScanAll}
            disabled={offline || scanning}
            aria-label="Run full scan"
          >
            <Search size={12} style={scanning && !selectedTool ? { animation: 'spin 1s linear infinite' } : undefined} />
            {scanning && !selectedTool ? 'Scanning…' : 'Scan all tools'}
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
          <strong style={{ color: 'var(--c-text)' }}>Rule-based checks & optional AI semantic pass.</strong>
          {' '}Scans are synchronous — results appear immediately. Severities in{' '}
          <span className="mono">SCANNER_BLOCK_SEVERITIES</span>
          {' '}block tools via the pin gate (reason: <span className="mono" style={{ color: 'var(--c-deny)' }}>pin_scan_blocked</span>).
        </span>
      </div>

      {/* Last scan summary */}
      {lastScan ? (
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
            {lastScan.ai_checked != null && lastScan.ai_checked > 0 && (
              <span className="badge badge-info" style={{ marginLeft: 8 }}>
                AI checked: {lastScan.ai_checked}
              </span>
            )}
            {lastScan.ai_unavailable != null && lastScan.ai_unavailable > 0 && (
              <span className="badge badge-muted" style={{ marginLeft: 8 }}>
                AI unavailable: {lastScan.ai_unavailable}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(lastScan.by_severity).map(([sev, count]) => (
              <span key={sev} className={`badge ${severityBadgeClass(sev)}`}>
                {sev}: {count}
              </span>
            ))}
          </div>
        </div>
      ) : auditData?.items?.[0] ? (() => {
        const ev = auditData.items[0];
        const p = parseScanCompletedReason(ev.reason);
        if (!p) return null;
        return (
          <div
            className="panel"
            style={{ padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <CheckCircle size={13} style={{ color: 'var(--c-allow)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
              Last scan at {fmtTimestamp(ev.created_at)} {CONSOLE_TZ_LABEL}: {p.scanned} tool(s) checked,{' '}
              <strong style={{ color: p.findings > 0 ? 'var(--c-deny)' : 'var(--c-allow)' }}>
                {p.findings} open finding(s)
              </strong>
              {p.aiChecked != null && p.aiChecked > 0 && ` · ${p.aiChecked} AI checked`}
              {p.aiUnavailable != null && p.aiUnavailable > 0 && ` · ${p.aiUnavailable} AI unavailable`}
            </span>
          </div>
        );
      })() : null}

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
        {isLoading && !data ? (
          <LoadingPanel label="Loading findings…" />
        ) : isError && !data ? (
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
                <Fragment key={f.id}>
                  <tr
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
                      {f.rule_id.startsWith('AI') && (
                        <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10, verticalAlign: 'middle' }}>
                          AI
                        </span>
                      )}
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
                          disabled={offline}
                          aria-label={`Resolve finding for ${f.tool_name}`}
                        >
                          <CheckCircle size={11} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === f.id && (
                    <tr style={{ background: 'var(--c-surface-2)' }}>
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
                </Fragment>
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
            { id: 'R1',  label: 'PROMPT_INJECTION',      sev: 'high' },
            { id: 'R2',  label: 'EXFILTRATION',          sev: 'critical' },
            { id: 'R3',  label: 'OVERBROAD_STRING',      sev: 'medium' },
            { id: 'R4',  label: 'SIZE_CAP_DESC/SCHEMA',  sev: 'medium' },
            { id: 'R5',  label: 'SUSPICIOUS_PARAM_DESC', sev: 'high' },
            { id: 'R6',  label: 'TOOL_NAME_ANOMALY',     sev: 'low' },
            { id: 'AI1', label: 'SEMANTIC_POISONING',    sev: 'medium' },
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
