import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Minus, ArrowDownRight, ArrowUpLeft, Sparkles, Plane, Package, Clock,
} from 'lucide-react';
import { useBudgetHistory } from '../../../hooks/useBudget';

interface Props {
  open: boolean;
  budgetId?: string;
  title?: string;
  onClose: () => void;
}

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string; sign: '+' | '-' }> = {
  ALLOCATE:   { icon: Plus,           color: 'var(--status-success)', label: 'Allocated',    sign: '+' },
  SUPPLEMENT: { icon: Sparkles,       color: 'var(--status-info)',    label: 'Added',        sign: '+' },
  CONSUME:    { icon: ArrowDownRight, color: 'var(--status-danger)',  label: 'Consumed',     sign: '-' },
  REFUND:     { icon: ArrowUpLeft,    color: 'var(--status-success)', label: 'Refunded',     sign: '+' },
  ADJUST:     { icon: Minus,          color: 'var(--status-warning)', label: 'Adjusted',     sign: '+' },
};

function inr(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000)    return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

export default function BudgetHistoryDrawer({ open, budgetId, title, onClose }: Props) {
  const { data, isLoading } = useBudgetHistory(open ? budgetId : undefined);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
            onClick={onClose}
          />
          <motion.div
            className="absolute top-0 right-0 bottom-0 w-full max-w-md glass overflow-y-auto"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between"
              style={{
                background: 'rgb(var(--surface-glass))',
                borderBottom: '1px solid rgb(var(--border-subtle))',
                backdropFilter: 'blur(10px)',
              }}>
              <div>
                <h2 className="font-display text-base font-bold"
                  style={{ color: 'rgb(var(--content-primary))' }}>
                  Budget History
                </h2>
                {title && (
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                    {title}
                  </p>
                )}
              </div>
              <button onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]"
                aria-label="Close history">
                <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
              </button>
            </div>

            <div className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : !data || data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Clock className="w-8 h-8" style={{ color: 'rgb(var(--content-muted))' }} />
                  <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
                    No history yet
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[rgb(var(--border-subtle))]">
                  {data.map((entry, i) => {
                    const meta = ACTION_META[entry.action] ?? ACTION_META.ADJUST;
                    const Icon = meta.icon;
                    return (
                      <motion.li
                        key={entry.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="relative"
                      >
                        <div
                          className="absolute -left-6 top-1 w-4 h-4 rounded-full flex items-center justify-center ring-4"
                          style={{
                            background: `rgb(${meta.color})`,
                            // @ts-expect-error ring color via CSS var
                            '--tw-ring-color': 'rgb(var(--surface-base))',
                          }}
                        >
                          <Icon className="w-2.5 h-2.5 text-white" />
                        </div>
                        <div className="rounded-xl p-3"
                          style={{ background: 'rgb(var(--surface-elevated))' }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold"
                                style={{ color: `rgb(${meta.color})` }}>
                                {meta.label}
                              </p>
                              {entry.request_code && (
                                <p className="text-[10px] font-mono mt-0.5 inline-flex items-center gap-1"
                                  style={{ color: 'rgb(var(--content-secondary))' }}>
                                  <Plane className="w-3 h-3" />
                                  {entry.request_code}
                                </p>
                              )}
                              {entry.booking_vendor && (
                                <p className="text-[11px] mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                                  style={{
                                    background: 'rgb(var(--surface-base))',
                                    color: 'rgb(var(--content-primary))',
                                  }}>
                                  <Package className="w-3 h-3" />
                                  {entry.booking_vendor}
                                  <span className="opacity-60">· {entry.booking_type}</span>
                                </p>
                              )}
                              {entry.note && (
                                <p className="text-[11px] mt-1"
                                  style={{ color: 'rgb(var(--content-secondary))' }}>
                                  {entry.note}
                                </p>
                              )}
                              <p className="text-[10px] mt-1.5"
                                style={{ color: 'rgb(var(--content-muted))' }}>
                                {entry.actor_name ?? entry.actor_email ?? 'System'} ·{' '}
                                {new Date(entry.created_at).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-mono text-sm font-bold"
                                style={{ color: `rgb(${meta.color})` }}>
                                {meta.sign}{inr(Math.abs(Number(entry.amount)))}
                              </p>
                              <p className="text-[10px] font-mono mt-0.5"
                                style={{ color: 'rgb(var(--content-muted))' }}>
                                bal {inr(Number(entry.balance_after))}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ol>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
