import { useMemo, useState, type ReactNode } from 'react';
import { useDialogA11y } from './a11y';
import { CornerDownLeft, Search } from 'lucide-react';
import { Kbd } from './premium';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  hint?: string;
  keywords?: string;
  run: () => void;
}

function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const hay = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`.toLowerCase();
  const label = cmd.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (hay.includes(q)) return 2;
  // Subsequence match (e.g. "lva" -> "Live Audit")
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i += 1;
  return i === q.length ? 1 : 0;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  if (!open) return null;
  return <PaletteInner onClose={onClose} commands={commands} />;
}

function PaletteInner({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useDialogA11y(true, onClose);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands
      .map(c => ({ c, s: score(c, q) }))
      .filter(r => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(r => r.c);
  }, [commands, query]);

  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    onClose();
    // Let the dialog close (and restore focus) before the command moves focus.
    setTimeout(cmd.run, 0);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((safeActive + 1) % Math.max(1, results.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((safeActive - 1 + results.length) % Math.max(1, results.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(safeActive); }
  };

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={e => e.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={15} aria-hidden />
          <input
            data-autofocus
            className="palette-input"
            placeholder="Jump to a view or run a command…"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[safeActive] ? `cmd-${results[safeActive].id}` : undefined}
            aria-label="Search commands"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Commands">
          {results.length === 0 && <li className="palette-empty">No commands match “{query}”.</li>}
          {results.map((cmd, i) => {
            const header = i === 0 || results[i - 1].group !== cmd.group ? cmd.group : null;
            return (
              <li key={cmd.id} role="presentation">
                {header && <div className="palette-group" role="presentation">{header}</div>}
                <div
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={i === safeActive}
                  className={`palette-item ${i === safeActive ? 'is-active' : ''}`}
                  onMouseMove={() => i !== safeActive && setActive(i)}
                  onClick={() => runAt(i)}
                >
                  <span className="palette-icon" aria-hidden>{cmd.icon}</span>
                  <span className="palette-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-hint">{cmd.hint.split(' ').map((k, j) => <Kbd key={j}>{k}</Kbd>)}</span>}
                  {i === safeActive && <CornerDownLeft size={13} className="palette-enter" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span><Kbd>Enter</Kbd> run</span>
          <span><Kbd>g</Kbd> then a letter jumps to a view</span>
        </div>
      </div>
    </div>
  );
}
