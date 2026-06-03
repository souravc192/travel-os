import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, CheckCircle2, XCircle, RefreshCw, FileText, Edit3,
  Plane, Hotel, Train, Bus, Car, Box, Upload, ExternalLink, Clock,
  Truck, Presentation,
} from 'lucide-react';
import { bookingApi, openAuthPdf } from '../../../lib/api';
import BookingFormModal, { type SegmentOption } from './BookingFormModal';

interface Booking {
  id: string;
  travelRequestId: string;
  bookingType: 'FLIGHT' | 'TRAIN' | 'BUS' | 'CAB' | 'TRAVELLER'
              | 'HOTEL' | 'CONFERENCE_HALL' | 'OTHER';
  bookingStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';
  vendorName: string;
  amount: number;
  currency: string;
  bookingReference: string | null;
  bookingDate: string;
  departureAt: string | null;
  returnAt: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  invoicePath: string | null;
  invoiceOriginalFilename: string | null;
  notes: string | null;
  cancellationFee: number;
  cancellationReason: string | null;
  consumedAmount: number;
  confirmedAt: string | null;
  cancelledAt: string | null;
  venueCapacity: number | null;
  travelSegmentId: string | null;
  accommodationSegmentId: string | null;
}

const TYPE_ICON: Record<Booking['bookingType'], React.ElementType> = {
  FLIGHT: Plane, TRAIN: Train, BUS: Bus, CAB: Car, TRAVELLER: Truck,
  HOTEL: Hotel, CONFERENCE_HALL: Presentation, OTHER: Box,
};

const TYPE_LABEL: Record<Booking['bookingType'], string> = {
  FLIGHT: 'Flight', TRAIN: 'Train', BUS: 'Bus', CAB: 'Cab',
  TRAVELLER: 'Tempo Traveller',
  HOTEL: 'Hotel', CONFERENCE_HALL: 'Conference Hall', OTHER: 'Other',
};

const STATUS_META: Record<Booking['bookingStatus'], { label: string; color: string; icon: React.ElementType }> = {
  PENDING:     { label: 'Pending',     color: 'var(--status-warning)', icon: Clock },
  CONFIRMED:   { label: 'Confirmed',   color: 'var(--status-success)', icon: CheckCircle2 },
  CANCELLED:   { label: 'Cancelled',   color: 'var(--status-danger)',  icon: XCircle },
  RESCHEDULED: { label: 'Rescheduled', color: 'var(--status-info)',    icon: RefreshCw },
};

function inr(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface Props {
  requestId: string;
  canEdit:   boolean;
  segments?: SegmentOption[];
}

export default function BookingsPanel({ requestId, canEdit, segments }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState<string | null>(null);
  const [modal, setModal]       = useState<{ open: true; edit?: Booking } | { open: false }>({ open: false });

  async function load() {
    setLoading(true);
    try {
      const r = await bookingApi.byRequest(requestId);
      setBookings(r.data.data);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [requestId]); // eslint-disable-line

  async function confirm(b: Booking) {
    setBusy(b.id);
    try {
      await bookingApi.confirm(b.id);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Failed to confirm.');
    } finally { setBusy(null); }
  }

  async function cancel(b: Booking) {
    const reason = window.prompt('Cancellation reason (≥ 5 chars):') ?? '';
    if (reason.trim().length < 5) return;
    const feeRaw = window.prompt(
      `Cancellation fee charged on this booking (in ₹)?
Enter 0 if no fee.
Max: ${inr(b.amount)}`,
      '0'
    );
    if (feeRaw === null) return;
    const fee = parseFloat(feeRaw);
    if (!Number.isFinite(fee) || fee < 0 || fee > b.amount) {
      alert('Invalid fee.');
      return;
    }
    setBusy(b.id);
    try {
      await bookingApi.cancel(b.id, { cancellationFee: fee, reason: reason.trim() });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Failed to cancel.');
    } finally { setBusy(null); }
  }

  async function reschedule(b: Booking) {
    const note = window.prompt('Reschedule note (optional):') ?? '';
    setBusy(b.id);
    try {
      await bookingApi.reschedule(b.id, { note: note.trim() || undefined });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Failed.');
    } finally { setBusy(null); }
  }

  async function uploadInvoice(b: Booking, file: File) {
    setBusy(b.id);
    try {
      await bookingApi.uploadInvoice(b.id, file);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Upload failed.');
    } finally { setBusy(null); }
  }

  const totalConfirmed = bookings
    .filter((b) => b.bookingStatus === 'CONFIRMED')
    .reduce((s, b) => s + b.amount, 0);

  return (
    <>
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2"
            style={{ color: 'rgb(var(--content-primary))' }}>
            <Package className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            Bookings
            {bookings.length > 0 && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  color: 'rgb(var(--content-muted))',
                }}>
                {bookings.length}
              </span>
            )}
          </h2>
          {canEdit && (
            <button onClick={() => setModal({ open: true })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'rgb(var(--accent))' }}>
              <Plus className="w-3.5 h-3.5" /> Add Booking
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        ) : bookings.length === 0 ? (
          <p className="text-xs text-center py-6"
            style={{ color: 'rgb(var(--content-muted))' }}>
            No bookings yet. {canEdit && 'Click "Add Booking" to record the first one.'}
          </p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {bookings.map((b, i) => {
                const TypeIcon = TYPE_ICON[b.bookingType];
                const sMeta = STATUS_META[b.bookingStatus];
                const SIcon = sMeta.icon;
                const isPending = b.bookingStatus === 'PENDING' || b.bookingStatus === 'RESCHEDULED';
                const isConfirmed = b.bookingStatus === 'CONFIRMED';
                return (
                  <motion.div key={b.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}
                    className="rounded-xl p-3"
                    style={{ background: 'rgb(var(--surface-elevated))' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `rgb(${sMeta.color}/0.12)` }}>
                        <TypeIcon className="w-4 h-4" style={{ color: `rgb(${sMeta.color})` }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold"
                            style={{ color: 'rgb(var(--content-primary))' }}>
                            {b.vendorName}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1"
                            style={{ background: `rgb(${sMeta.color}/0.12)`, color: `rgb(${sMeta.color})` }}>
                            <SIcon className="w-3 h-3" />
                            {sMeta.label}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: 'rgb(var(--surface-base))', color: 'rgb(var(--content-muted))' }}>
                            {TYPE_LABEL[b.bookingType] ?? b.bookingType}
                          </span>
                          {b.venueCapacity != null && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{
                                background: 'rgb(var(--status-info)/0.12)',
                                color: 'rgb(var(--status-info))',
                              }}>
                              cap {b.venueCapacity}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-1 font-mono"
                          style={{ color: 'rgb(var(--content-secondary))' }}>
                          {b.bookingReference ? `Ref: ${b.bookingReference} · ` : ''}
                          Booked {fmtDate(b.bookingDate)}
                          {(b.bookingType === 'HOTEL' || b.bookingType === 'CONFERENCE_HALL') && b.checkInDate
                            ? ` · ${fmtDate(b.checkInDate)} → ${fmtDate(b.checkOutDate)}`
                            : b.departureAt
                            ? ` · departs ${new Date(b.departureAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                            : ''}
                        </p>
                        {b.notes && (
                          <p className="text-[11px] mt-1"
                            style={{ color: 'rgb(var(--content-muted))' }}>
                            {b.notes}
                          </p>
                        )}
                        {b.bookingStatus === 'CANCELLED' && (
                          <p className="text-[11px] mt-1"
                            style={{ color: 'rgb(var(--status-danger))' }}>
                            Cancelled · fee {inr(b.cancellationFee)}
                            {b.cancellationReason && ` · ${b.cancellationReason}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono text-sm font-bold"
                          style={{ color: 'rgb(var(--content-primary))' }}>
                          {inr(b.amount)}
                        </p>
                        {b.consumedAmount > 0 && b.bookingStatus === 'CANCELLED' && (
                          <p className="text-[10px] font-mono"
                            style={{ color: 'rgb(var(--content-muted))' }}>
                            (₹{b.consumedAmount} kept)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1 mt-2 flex-wrap">
                        {b.invoicePath ? (
                          <button onClick={() => openAuthPdf(bookingApi.invoiceUrl(b.id))}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                            style={{
                              background: 'rgb(var(--status-info)/0.12)',
                              color: 'rgb(var(--status-info))',
                            }}>
                            <FileText className="w-3 h-3" /> Invoice
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        ) : (
                          <label className="px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                            style={{
                              background: 'rgb(var(--surface-base))',
                              color: 'rgb(var(--content-secondary))',
                            }}>
                            <Upload className="w-3 h-3" /> Upload Invoice
                            <input type="file" className="hidden"
                              accept=".pdf,.png,.jpg,.jpeg,.webp"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadInvoice(b, f);
                              }} />
                          </label>
                        )}
                        {isPending && (
                          <button onClick={() => setModal({ open: true, edit: b })} disabled={busy === b.id}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                            style={{
                              background: 'rgb(var(--surface-base))',
                              color: 'rgb(var(--content-secondary))',
                            }}>
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        )}
                        {isPending && (
                          <button onClick={() => confirm(b)} disabled={busy === b.id}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60"
                            style={{ background: 'rgb(var(--status-success))' }}>
                            Confirm
                          </button>
                        )}
                        {isConfirmed && (
                          <button onClick={() => reschedule(b)} disabled={busy === b.id}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                            style={{
                              background: 'rgb(var(--status-info)/0.12)',
                              color: 'rgb(var(--status-info))',
                            }}>
                            Reschedule
                          </button>
                        )}
                        {(isPending || isConfirmed) && (
                          <button onClick={() => cancel(b)} disabled={busy === b.id}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold"
                            style={{
                              background: 'rgb(var(--status-danger)/0.12)',
                              color: 'rgb(var(--status-danger))',
                            }}>
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <div className="flex items-center justify-between p-2.5 rounded-xl mt-3"
              style={{ background: 'rgb(var(--accent-subtle))' }}>
              <span className="text-xs font-medium" style={{ color: 'rgb(var(--accent-text))' }}>
                Confirmed bookings (consuming budget)
              </span>
              <span className="font-mono text-sm font-bold" style={{ color: 'rgb(var(--accent-text))' }}>
                {inr(totalConfirmed)}
              </span>
            </div>
          </div>
        )}
      </div>

      {modal.open && (
        <BookingFormModal
          requestId={requestId}
          editing={modal.edit ?? null}
          segments={segments}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }}
        />
      )}
    </>
  );
}
