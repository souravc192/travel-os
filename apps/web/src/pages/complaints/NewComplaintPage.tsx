import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquareWarning, ArrowLeft, AlertCircle, Send, Link2 } from 'lucide-react';
import { complaintApi, travelRequestApi, bookingApi } from '../../lib/api';
import { ComplaintPriority, COMPLAINT_CATEGORY_OPTIONS } from '@travel-os/shared-types';

const inputCx = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

interface TravelLite { id: string; request_code: string; traveler_full_name: string; }
interface BookingLite { id: string; vendorName: string; bookingType: string; }

const PRIORITY_HINT: Record<string, string> = {
  LOW:      'Resolve within 7 days',
  MEDIUM:   'Resolve within 72 hours',
  HIGH:     'Resolve within 24 hours',
  CRITICAL: 'Resolve within 4 hours',
};

export default function NewComplaintPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledTr = searchParams.get('travelRequestId') ?? '';

  const [travelRequestId, setTravelRequestId] = useState(prefilledTr);
  const [bookingId,  setBookingId]  = useState('');
  const [vendorName, setVendorName] = useState('');
  const [category,   setCategory]   = useState<string>(COMPLAINT_CATEGORY_OPTIONS[0]);
  const [priority,   setPriority]   = useState<ComplaintPriority>(ComplaintPriority.MEDIUM);
  const [subject,    setSubject]    = useState('');
  const [description, setDescription] = useState('');

  const [travels,  setTravels]  = useState<TravelLite[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    travelRequestApi.list({ limit: 100 })
      .then((r) => setTravels(r.data.data.map((t: TravelLite) => ({
        id: t.id, request_code: t.request_code, traveler_full_name: t.traveler_full_name,
      }))))
      .catch(() => setTravels([]));
  }, []);

  // When a travel request is chosen, load its bookings so the user can
  // attribute the complaint to a specific vendor.
  useEffect(() => {
    if (!travelRequestId) { setBookings([]); return; }
    bookingApi.byRequest(travelRequestId)
      .then((r) => setBookings(r.data.data.map((b: { id: string; vendorName: string; bookingType: string }) => ({
        id: b.id, vendorName: b.vendorName, bookingType: b.bookingType,
      }))))
      .catch(() => setBookings([]));
  }, [travelRequestId]);

  async function submit() {
    setError(null);
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (description.trim().length < 10) { setError('Description must be at least 10 characters.'); return; }
    setBusy(true);
    try {
      const res = await complaintApi.create({
        travelRequestId: travelRequestId || null,
        bookingId:       bookingId || null,
        vendorName:      vendorName.trim() || null,
        category,
        priority,
        subject:         subject.trim(),
        description:     description.trim(),
      });
      navigate(`/complaints/${res.data.data.id}`, { replace: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not raise complaint.');
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl"
          style={{ background: 'rgb(var(--surface-elevated))' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: 'rgb(var(--content-secondary))' }} />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgb(var(--accent-subtle))' }}>
          <MessageSquareWarning className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: 'rgb(var(--content-primary))' }}>
            Raise a Complaint
          </h1>
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
            Travel Desk will triage and assign a resolution owner.
          </p>
        </div>
      </div>

      <div className="glass p-5 rounded-2xl space-y-4">
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
            <Link2 className="inline w-3 h-3 mr-1" /> Link to Travel Request (optional)
          </label>
          <select value={travelRequestId} onChange={(e) => { setTravelRequestId(e.target.value); setBookingId(''); }}
            className={inputCx} style={inputStyle}>
            <option value="">— Standalone complaint —</option>
            {travels.map((t) => (
              <option key={t.id} value={t.id}>{t.request_code} · {t.traveler_full_name}</option>
            ))}
          </select>
        </div>

        {travelRequestId && bookings.length > 0 && (
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
              Related Booking / Vendor (optional)
            </label>
            <select value={bookingId}
              onChange={(e) => {
                setBookingId(e.target.value);
                const b = bookings.find((x) => x.id === e.target.value);
                if (b) setVendorName(b.vendorName);
              }}
              className={inputCx} style={inputStyle}>
              <option value="">— None —</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>{b.vendorName} ({b.bookingType})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
              Vendor Name (optional)
            </label>
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. MakeMyTrip"
              className={inputCx} style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
              Category
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={inputCx} style={inputStyle}>
              {COMPLAINT_CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
            Priority
          </label>
          <div className="grid grid-cols-4 gap-2">
            {Object.values(ComplaintPriority).map((p) => (
              <button key={p} type="button" onClick={() => setPriority(p)}
                className="px-2 py-2 rounded-xl text-xs font-semibold"
                style={priority === p
                  ? { background: 'rgb(var(--accent))', color: '#fff' }
                  : { background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'rgb(var(--content-muted))' }}>
            SLA: {PRIORITY_HINT[priority]}
          </p>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
            Subject
          </label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="One-line summary of the issue"
            className={inputCx} style={inputStyle} />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
            Description
          </label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, when, and the impact (≥ 10 chars)."
            className={inputCx} style={inputStyle} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ color: 'rgb(var(--status-danger))', background: 'rgb(var(--status-danger)/0.08)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'rgb(var(--accent))' }}>
          <Send className="w-4 h-4" /> {busy ? 'Submitting…' : 'Submit Complaint'}
        </button>
      </div>
    </div>
  );
}
