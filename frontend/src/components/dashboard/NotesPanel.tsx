/**
 * NotesPanel.tsx — live MCP-backed notes panel for the dashboard.
 *
 * This is the ONLY dashboard component that fetches real data from the
 * Polaris FastAPI + MCP backend.  All other dashboard panels use the
 * existing mock data (which is intentional — those panels have no real
 * backend equivalent yet).
 *
 * Data flow:
 *   NotesPanel → mcpApi.ts → GET /api/notes → list_notes() MCP tool
 *   NotesPanel → mcpApi.ts → GET /api/notes/:name → read_note() MCP tool
 *   NotesPanel → mcpApi.ts → POST /api/notes/:name → write_note() MCP tool
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  listNotes,
  readNote,
  writeNote,
  getMcpInfo,
  type NoteDetail,
  type McpInfo,
} from '../../lib/mcpApi';

// ---------------------------------------------------------------------------
// Types for local state
// ---------------------------------------------------------------------------

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface NotesState {
  names: string[];
  loadState: LoadState;
  error: string | null;
}

interface NoteViewState {
  note: NoteDetail | null;
  loadState: LoadState;
  error: string | null;
}

interface McpInfoState {
  info: McpInfo | null;
  loadState: LoadState;
}

// ---------------------------------------------------------------------------
// Helper: format timestamp
// ---------------------------------------------------------------------------
const now = () => new Date().toLocaleTimeString('en-US', { hour12: false });

// ---------------------------------------------------------------------------
// McpInfoBadge — shows live server metadata
// ---------------------------------------------------------------------------
const McpInfoBadge: React.FC<{ info: McpInfo | null; loadState: LoadState }> = ({
  info,
  loadState,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.5rem 1rem',
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '6px',
      flexWrap: 'wrap',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      {/* Live indicator dot */}
      <motion.div
        animate={loadState === 'success' ? { opacity: [1, 0.3, 1] } : { opacity: 0.3 }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: loadState === 'success' ? '#7CFF4F' : loadState === 'error' ? '#ff4444' : '#666',
          boxShadow: loadState === 'success' ? '0 0 6px #7CFF4F' : 'none',
        }}
      />
      <span
        style={{
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.06em',
        }}
      >
        {loadState === 'loading' && 'Connecting…'}
        {loadState === 'error' && 'API OFFLINE'}
        {loadState === 'success' && info && `${info.server_name.toUpperCase()} · ${info.transport}`}
      </span>
    </div>
    {info && loadState === 'success' && (
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {info.tools.map((t) => (
          <span
            key={t}
            style={{
              fontFamily: "'SF Mono', monospace",
              fontSize: '0.62rem',
              color: '#FE6E44',
              background: 'rgba(254,110,68,0.08)',
              border: '1px solid rgba(254,110,68,0.2)',
              borderRadius: '3px',
              padding: '0.1rem 0.4rem',
            }}
          >
            {t}
          </span>
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// NoteEditor — create/edit a note inline
// ---------------------------------------------------------------------------
interface NoteEditorProps {
  initialName?: string;
  initialContent?: string;
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
  saving: boolean;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  initialName = '',
  initialContent = '',
  onSave,
  onCancel,
  saving,
}) => {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const valid = /^[A-Za-z0-9_-]{1,64}$/.test(name) && content.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        padding: '1rem',
        background: 'rgba(254,110,68,0.05)',
        border: '1px solid rgba(254,110,68,0.2)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="note-name (a–z, 0–9, _ -)"
        disabled={!!initialName || saving}
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '4px',
          color: '#fff',
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.8rem',
          padding: '0.5rem 0.75rem',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write Markdown here…"
        rows={6}
        disabled={saving}
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '4px',
          color: 'rgba(255,255,255,0.85)',
          fontFamily: "'SF Mono', monospace",
          fontSize: '0.78rem',
          padding: '0.5rem 0.75rem',
          outline: 'none',
          resize: 'vertical',
          width: '100%',
          boxSizing: 'border-box',
          lineHeight: 1.6,
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '0.4rem 1rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.75rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => valid && onSave(name, content)}
          disabled={!valid || saving}
          style={{
            padding: '0.4rem 1rem',
            background: valid && !saving ? 'rgba(254,110,68,0.15)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${valid && !saving ? 'rgba(254,110,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '4px',
            color: valid && !saving ? '#FE6E44' : 'rgba(255,255,255,0.3)',
            fontSize: '0.75rem',
            cursor: valid && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const NotesPanel: React.FC = () => {
  // Notes list
  const [notesState, setNotesState] = useState<NotesState>({
    names: [],
    loadState: 'idle',
    error: null,
  });

  // Viewed note
  const [viewState, setViewState] = useState<NoteViewState>({
    note: null,
    loadState: 'idle',
    error: null,
  });

  // MCP server info
  const [mcpInfoState, setMcpInfoState] = useState<McpInfoState>({
    info: null,
    loadState: 'idle',
  });

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [lastRefresh, setLastRefresh] = useState('');

  // ---------------------------------------------------------------------------
  // Read a note
  // ---------------------------------------------------------------------------
  const openNote = useCallback(async (name: string) => {
    setViewState({ note: null, loadState: 'loading', error: null });
    try {
      const note = await readNote(name);
      setViewState({ note, loadState: 'success', error: null });
    } catch (err) {
      setViewState({
        note: null,
        loadState: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load note list
  // ---------------------------------------------------------------------------
  const loadNotes = useCallback(async (options?: { selectFirst?: boolean }) => {
    setNotesState((s) => ({ ...s, loadState: 'loading', error: null }));
    try {
      const names = await listNotes();
      setNotesState({ names, loadState: 'success', error: null });
      setLastRefresh(now());
      if (options?.selectFirst && names.length > 0) {
        openNote(names[0]);
      }
    } catch (err) {
      setNotesState((s) => ({
        ...s,
        loadState: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [openNote]);

  // ---------------------------------------------------------------------------
  // Load MCP info
  // ---------------------------------------------------------------------------
  const loadMcpInfo = useCallback(async () => {
    setMcpInfoState({ info: null, loadState: 'loading' });
    try {
      const info = await getMcpInfo();
      setMcpInfoState({ info, loadState: 'success' });
    } catch {
      setMcpInfoState({ info: null, loadState: 'error' });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Save a note
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(
    async (name: string, content: string) => {
      setSaving(true);
      setSaveError(null);
      try {
        await writeNote(name, content);
        setEditorOpen(false);
        setEditingNote(null);
        // Reload list + re-open the note we just saved
        await loadNotes();
        await openNote(name);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [loadNotes, openNote]
  );

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadNotes({ selectFirst: true });
    loadMcpInfo();
  }, [loadNotes, loadMcpInfo]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#fff',
            }}
          >
            MCP NOTES
          </span>
          {lastRefresh && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.06em',
              }}
            >
              updated {lastRefresh}
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => loadNotes()}
            disabled={notesState.loadState === 'loading'}
            title="Refresh notes list"
            style={{
              padding: '0.35rem 0.75rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.7rem',
              cursor: notesState.loadState === 'loading' ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.71" />
            </svg>
            {notesState.loadState === 'loading' ? 'Loading…' : 'Refresh'}
          </button>

          <button
            onClick={() => {
              setEditingNote(null);
              setEditorOpen(true);
            }}
            style={{
              padding: '0.35rem 0.75rem',
              background: 'rgba(254,110,68,0.1)',
              border: '1px solid rgba(254,110,68,0.3)',
              borderRadius: '4px',
              color: '#FE6E44',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Note
          </button>
        </div>
      </div>

      {/* ── MCP info badge ──────────────────────────────────────────────── */}
      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <McpInfoBadge info={mcpInfoState.info} loadState={mcpInfoState.loadState} />
      </div>

      {/* ── Editor (AnimatePresence) ──────────────────────────────────── */}
      <AnimatePresence>
        {editorOpen && (
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <NoteEditor
              initialName={editingNote?.name}
              initialContent={editingNote?.content}
              onSave={handleSave}
              onCancel={() => {
                setEditorOpen(false);
                setEditingNote(null);
                setSaveError(null);
              }}
              saving={saving}
            />
            {saveError && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,68,68,0.1)',
                  border: '1px solid rgba(255,68,68,0.3)',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: '#ff4444',
                }}
              >
                ⚠ {saveError}
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* ── Main content: list + reader side-by-side ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '260px' }}>
        {/* Note list */}
        <div
          style={{
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
            maxHeight: '400px',
          }}
        >
          {notesState.loadState === 'loading' && (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              Loading live metrics…
            </div>
          )}

          {notesState.loadState === 'error' && (
            <div
              style={{
                padding: '1rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: '#ff4444',
              }}
            >
              Unable to load live metrics. Check the API connection.
              <button
                onClick={() => loadNotes()}
                style={{
                  display: 'block',
                  marginTop: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#FE6E44',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-body)',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {notesState.loadState === 'success' && notesState.names.length === 0 && (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              No notes available yet.
              <br />
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)' }}>
                Click "New Note" to create one.
              </span>
            </div>
          )}

          {notesState.loadState === 'success' &&
            notesState.names.map((name) => (
              <motion.button
                key={name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                  setEditorOpen(false);
                  openNote(name);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.65rem 1rem',
                  background:
                    viewState.note?.name === name
                      ? 'rgba(254,110,68,0.08)'
                      : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  borderLeft:
                    viewState.note?.name === name
                      ? '2px solid #FE6E44'
                      : '2px solid transparent',
                  color:
                    viewState.note?.name === name
                      ? '#FE6E44'
                      : 'rgba(255,255,255,0.6)',
                  fontFamily: "'SF Mono', monospace",
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {name}
              </motion.button>
            ))}
        </div>

        {/* Note viewer */}
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', maxHeight: '400px' }}>
          {viewState.loadState === 'idle' && !viewState.note && (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.2)',
              }}
            >
              Select a note to read it.
            </div>
          )}

          {viewState.loadState === 'loading' && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              Loading live metrics…
            </div>
          )}

          {viewState.loadState === 'error' && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: '#ff4444',
              }}
            >
              Unable to load live metrics. Check the API connection.
            </div>
          )}

          {viewState.loadState === 'success' && viewState.note && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Note header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    fontFamily: "'SF Mono', monospace",
                    fontSize: '0.85rem',
                    color: '#FE6E44',
                    fontWeight: 600,
                  }}
                >
                  {viewState.note.name}.md
                </div>
                <button
                  onClick={() => {
                    setEditingNote(viewState.note);
                    setEditorOpen(true);
                  }}
                  style={{
                    padding: '0.25rem 0.6rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Edit
                </button>
              </div>

              {/* Note content — rendered as preformatted text */}
              <pre
                style={{
                  fontFamily: "'SF Mono', 'Courier New', monospace",
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.75)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  padding: '0.75rem',
                }}
              >
                {viewState.note.content}
              </pre>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};
