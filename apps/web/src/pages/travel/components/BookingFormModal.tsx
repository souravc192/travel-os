import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { bookingApi } from '../../../lib/api';
import { BookingType } from '@travel-os/shared-types';

interface EditingBooking {
  id: string;
  bookingType: string;
  vendorName: string;
  amount: number;
  currency: string;
  bookingReference: string | null;
  bookingDate: string;
  departureAt: string | null;
  returnAt: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  notes: string | null;
}

interface Props {
  requestId: string;
  editing:   EditingBooking | null;
  onClose:   () => void;
  onSaved:   () => void;
}

const inputCx = "w-full px-3 py-2.5 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export default function BookingFormModal({ requestId, editing, onClose, onSaved }: Props) {
  const [type,      setType]      = useState<string>(editing?.bookingType ?? BookingType.FLIGHT);
  const [vendor,    setVendor]    = useState(editing?.vendorName ?? '');
  const [amount,    setAmount]    = useState<string>(editing ? String(editing.amount) : '');
  const [ref,       setRef]       = useState(editing?.bookingReference ?? '');
  const [bDate,     setBDate]     = useState(editing?.bookingDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [depAt,     setDepAt]     = useState(isoToLocal(editing?.departureAt ?? null));
  const [retAt,     setRetAt]     = useState(isoToLocal(editing?.returnAt ?? null));
  const [checkIn,   setCheckIn]   = useState(editing?.checkInDate?.slice(0, 10) ?? '');
  const [checkOut,  setCheckOut]  = useState(editing?.checkOutDate?.slice(0, 10) ?? '');
  const [notes,     setNotes]     = useState(editing?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const isHotel = type === BookingType.HOTEL;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vendor.trim()) { setError('Vendor name is required.'); return; }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be > 0.'); return; }
    if (!bDate) { setError('Booking date is required.'); return; }
    if (isHotel && checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      setError('Check-out must be after check-in.'); return;
    }

    const payload = {
      travelRequestId:  requestId,
      bookingType:      type,
      vendorName:       vendor.trim(),
      amount:           amt,
      currency:         'INR',
      bookingReference: ref.trim() || null,
      bookingDate:      bDate,
      departureAt:      !isHotel && depAt ? new Date(depAt).toISOString() : null,
      returnAt:         !isHotel && retAt ? new Date(retAt).toISOString() : null,
      checkInDate:      isHotel ? (checkIn || null) : null,
      checkOutDate:     isHotel ? (checkOut || null) : null,
      notes:            notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editing) await bookingApi.update(editing.id, payload);
      else         await bookingApi.create(payload);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Save failed.');
    } finally { setSubmitting(false); }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={onClose} />
        <motion.div className="glass relative w-full max-w-lg p-6 rounded-2xl max-h-[90vh] overflow-y-auto"
          initial={{ y: 20, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 20, scale: 0.96, opacity: 0 }} transition={{ duration: 0.25 }}>
          <button onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]"
            aria-label="Close">
            <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
          </button>

          <h2 className="font-display text-lg font-bold mb-1"
            style={{ color: 'rgb(var(--content-primary))' }}>
            {editing ? 'Edit Booking' : 'Add Booking'}
          </h2>
          <p className="text-xs mb-5" style={{ color: 'rgb(var(--content-muted))' }}>
            Booking is created in <strong>Pending</strong> state. Confirm later to debit the budget.
          </p>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}
                  className={inputCx} style={inputStyle}>
                  {Object.values(BookingType).map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Vendor</label>
                <input value={vendor} onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. IndiGo"
                  className={inputCx} style={inputStyle} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Amount (₹)</label>
                <input type="number" min="1" step="1" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputCx} font-mono`} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>PNR / Reference</label>
                <input value={ref} onChange={(e) => setRef(e.target.value)}
                  placeholder="e.g. RSEKJF"
                  className={`${inputCx} font-mono`} style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Booking Date</label>
              <input type="date" value={bDate}
                onChange={(e) => setBDate(e.target.value)}
                className={inputCx} style={inputStyle} />
            </div>

            {isHotel ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>Check-In</label>
                  <input type="date" value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className={inputCx} style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>Check-Out</label>
                  <input type="date" value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className={inputCx} style={inputStyle} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>Departure</label>
                  <input type="datetime-local" value={depAt}
                    onChange={(e) => setDepAt(e.target.value)}
                    className={inputCx} style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>Return (optional)</label>
                  <input type="datetime-local" value={retAt}
                    onChange={(e) => setRetAt(e.target.value)}
                    className={inputCx} style={inputStyle} />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Notes / Internal Remarks</label>
              <textarea rows={2} value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputCx} style={inputStyle} />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
                style={{
                  background: 'rgb(var(--status-danger)/0.08)',
                  color: 'rgb(var(--status-danger))',
                }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  color: 'rgb(var(--content-secondary))',
                }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'rgb(var(--accent))' }}>
                {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Booking'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
