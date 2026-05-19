import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUp, ArrowDown, CornerDownLeft, X, Hash } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
}

export default function CommandPalette({ open, onClose, navItems }: Props) {
  const navigate                    = useNavigate();
  const [query, setQuery]           = useState('');
  const [activeIdx, setActiveIdx]   = useState(0);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const listRef                     = useRef<HTMLDivElement>(null);

  const filtered = query
    ? navItems.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : navItems;

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const go = (path: string) => { navigate(path); onClose(); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')    { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[activeIdx]) go(filtered[activeIdx].path);
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-strong))' }}
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b"
              style={{ borderColor: 'rgb(var(--border))' }}>
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--content-muted))' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Navigate to…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'rgb(var(--content-primary))' }}
              />
              {query && (
                <button onClick={() => setQuery('')}>
                  <X className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-muted))' }} />
                </button>
              )}
              <kbd className="px-2 py-1 rounded text-[10px] font-mono"
                style={{ background: 'rgb(var(--surface-overlay))', color: 'rgb(var(--content-muted))' }}>
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
                  No results for "{query}"
                </div>
              ) : (
                filtered.map((item, i) => (
                  <motion.button
                    key={item.path}
                    onClick={() => go(item.path)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: i === activeIdx ? 'rgb(var(--accent-subtle))' : 'transparent',
                      color: i === activeIdx ? 'rgb(var(--accent-text))' : 'rgb(var(--content-secondary))',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: i === activeIdx ? 'rgb(var(--accent) / 0.15)' : 'rgb(var(--surface-overlay))',
                      }}>
                      <item.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    {i === activeIdx && (
                      <CornerDownLeft className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-muted))' }} />
                    )}
                  </motion.button>
                ))
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 px-4 py-3 border-t text-[10px]"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--content-muted))' }}>
              {[
                { icon: ArrowUp, label: 'Up' },
                { icon: ArrowDown, label: 'Down' },
                { icon: CornerDownLeft, label: 'Open' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <Icon className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
