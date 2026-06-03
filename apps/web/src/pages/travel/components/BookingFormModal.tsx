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
  venueCapacity: number | null;
  travelSegmentId: string | null;
  accommodationSegmentId: string | null;
}

// Available segments to link a booking to (Phase 5B loose link)
export interface SegmentOption {
  id:     string;
  label:  string;  // e.g. "Seg 1 · Delhi → Mumbai · 12 Jun"
  kind:   'travel' | 'accommodation';
}

interface Props {
  requestId: string;
  editing:   EditingBooking | null;
  segments?: SegmentOption[];
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

export default function BookingFormModal({ requestId, editing, segments, onClose, onSaved }: Props) {
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
  const [capacity,  setCapacity]  = useState<string>(editing?.venueCapacity != null ? String(editing.venueCapacity) : '');
  const [segmentLink, setSegmentLink] = useState<string>(
    editing?.travelSegmentId ?? editing?.accommodationSegmentId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Stay-type bookings (use check-in / check-out instead of departure / return)
  const isStayType = type === BookingType.HOTEL || type === BookingType.CONFERENCE_HALL;
  const isHotel    = type === BookingType.HOTEL;                  // kept for backward refs
  const isVenue    = type === BookingType.CONFERENCE_HALL;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vendor.trim()) { setError('Vendor name is required.'); return; }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be > 0.'); return; }
    if (!bDate) { setError('Booking date is required.'); return; }
    if (isStayType && checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      setError('Check-out must be after check-in.'); return;
    }
    let cap: number | null = null;
    if (isVenue && capacity.trim()) {
      const parsed = parseInt(capacity, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Venue capacity must be a positive whole number.');
        return;
      }
      cap = parsed;
    }

    // Loose link to a segment (Phase 5B). Stay-types attach to accommodation,
    // travel-types attach to travel segments.
    const linkedSeg = segments?.find((s) => s.id === segmentLink);
    const travelSegmentId        = linkedSeg?.kind === 'travel'        ? linkedSeg.id : null;
    const accommodationSegmentId = linkedSeg?.kind === 'accommodation' ? linkedSeg.id : null;

    const payload = {
      travelRequestId:  requestId,
      bookingType:      type,
      vendorName:       vendor.trim(),
      amount:           amt,
      currency:         'INR',
      bookingReference: ref.trim() || null,
      bookingDate:      bDate,
      departureAt:      !isStayType && depAt ? new Date(depAt).toISOString() : null,
      returnAt:         !isStayType && retAt ? new Date(retAt).toISOString() : null,
      checkInDate:      isStayType ? (checkIn || null) : null,
      checkOutDate:     isStayType ? (checkOut || null) : null,
      notes:            notes.trim() || null,
      venueCapacity:    cap,
      travelSegmentId,
      accommodationSegmentId,
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
                  <option value={BookingType.FLIGHT}>Flight</option>
                  <option value={BookingType.TRAIN}>Train</option>
                  <option value={BookingType.BUS}>Bus</option>
                  <option value={BookingType.CAB}>Cab</option>
                  <option value={BookingType.TRAVELLER}>Tempo Traveller</option>
                  <option value={BookingType.HOTEL}>Hotel</option>
                  <option value={BookingType.CONFERENCE_HALL}>Conference Hall</option>
                  <option value={BookingType.OTHER}>Other</option>
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

            {isStayType ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1.5"
                      style={{ color: 'rgb(var(--content-secondary))' }}>
                      {isVenue ? 'Event Start' : 'Check-In'}
                    </label>
                    <input type="date" value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className={inputCx} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5"
                      style={{ color: 'rgb(var(--content-secondary))' }}>
                      {isVenue ? 'Event End' : 'Check-Out'}
                    </label>
                    <input type="date" value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className={inputCx} style={inputStyle} />
                  </div>
                </div>
                {isVenue && (
                  <div>
                    <label className="text-xs font-medium block mb-1.5"
                      style={{ color: 'rgb(var(--content-secondary))' }}>
                      Venue Capacity (seats)
                    </label>
                    <input type="number" min="1" step="1" value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="e.g. 80"
                      className={`${inputCx} font-mono`} style={inputStyle} />
                  </div>
                )}
              </>
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

            {segments && segments.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>
                  Link to Segment (optional)
                </label>
                <select value={segmentLink}
                  onChange={(e) => setSegmentLink(e.target.value)}
                  className={inputCx} style={inputStyle}>
                  <option value="">— Don't link to a segment —</option>
                  {segments
                    .filter((s) => isStayType ? s.kind === 'accommodation' : s.kind === 'travel')
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                </select>
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
