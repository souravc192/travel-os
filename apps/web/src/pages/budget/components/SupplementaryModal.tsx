import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRequestSupplementary } from '../../../hooks/useBudget';

interface SupplementaryModalProps {
  open: boolean;
  onClose: () => void;
  costCentreId?: string;
  costCentreLabel?: string;
  fiscalYear?: string;
}

export default function SupplementaryModal({
  open, onClose, costCentreId, costCentreLabel, fiscalYear,
}: SupplementaryModalProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState<string | null>(null);
  const [ok,     setOk]     = useState(false);

  const mutation = useRequestSupplementary();

  function reset() {
    setAmount(''); setReason(''); setError(null); setOk(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Amount must be a positive number.'); return; }
    if (reason.trim().length < 20) { setError('Reason must be at least 20 characters.'); return; }
    try {
      await mutation.mutateAsync({
        amount: num,
        reason: reason.trim(),
        costCentreId,
        fiscalYear,
      });
      setOk(true);
      setTimeout(() => { reset(); onClose(); }, 1400);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(apiErr.response?.data?.error?.message ?? 'Request failed. Try again.');
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => { reset(); onClose(); }}
          />
          <motion.div
            className="glass relative w-full max-w-md p-6 rounded-2xl"
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0,  scale: 1,    opacity: 1 }}
            exit={{    y: 20, scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={() => { reset(); onClose(); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]"
              aria-label="Close"
            >
              <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
            </button>

            <h2 className="font-display text-xl font-bold mb-1"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Request Supplementary Budget
            </h2>
            <p className="text-xs mb-5" style={{ color: 'rgb(var(--content-muted))' }}>
              {costCentreLabel ? `For ${costCentreLabel}` : 'For your cost centre'}
              {fiscalYear && ` · FY ${fiscalYear}`}
            </p>

            {ok ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="w-12 h-12" style={{ color: 'rgb(var(--status-success))' }} />
                <p className="font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                  Request submitted
                </p>
                <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                  Finance will review shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    Amount (₹)
                  </label>
                  <input
                    type="number" min="1" step="1" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none"
                    style={{
                      background:  'rgb(var(--surface-elevated))',
                      border:      '1px solid rgb(var(--border-subtle))',
                      color:       'rgb(var(--content-primary))',
                    }}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    Justification <span style={{ color: 'rgb(var(--content-muted))' }}>(min 20 characters)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={5}
                    placeholder="Why is this supplementary budget required? Mention upcoming critical travel, scope changes, etc."
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                    style={{
                      background:  'rgb(var(--surface-elevated))',
                      border:      '1px solid rgb(var(--border-subtle))',
                      color:       'rgb(var(--content-primary))',
                    }}
                    required
                  />
                  <p className="text-[10px] mt-1 text-right font-mono"
                    style={{ color: reason.trim().length < 20
                      ? 'rgb(var(--status-warning))'
                      : 'rgb(var(--content-muted))' }}>
                    {reason.trim().length} / 20
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                    style={{
                      background: 'rgb(var(--status-danger)/0.08)',
                      color: 'rgb(var(--status-danger))',
                    }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { reset(); onClose(); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      background: 'rgb(var(--surface-elevated))',
                      color:      'rgb(var(--content-secondary))',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: 'rgb(var(--accent))' }}
                  >
                    {mutation.isPending ? 'Submitting…' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
