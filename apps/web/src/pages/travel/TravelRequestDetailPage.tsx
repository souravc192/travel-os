import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Plane, Hotel, User, CheckCircle2, XCircle, Clock,
  Sparkles, Calendar, MapPin, Building2, AlertTriangle,
} from 'lucide-react';
import { travelRequestApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '@travel-os/shared-types';

interface Approval {
  id: string; level: number;
  approver_email: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  acted_at: string | null;
  note: string | null;
}

interface Detail {
  id: string;
  request_code: string;
  status: string;
  urgency: 'NORMAL' | 'URGENT';
  current_level: number;
  request_for: string;
  request_kind: string;
  reservation_type: string;
  needs_stay: boolean;
  reason_of_travel: string;
  reason_of_travel_other: string | null;
  traveler_full_name: string;
  traveler_email: string;
  traveler_designation: string;
  traveler_employee_code: string;
  traveler_no_of_approvers: number;
  department_name: string;
  submitted_at: string;
  decided_at: string | null;
  submitted_on_behalf: boolean;
  on_behalf_cost_centre: string | null;
  booking_boarding: string | null;
  booking_visiting_reason: string | null;
  booking_destination: string | null;
  booking_departure_date: string | null;
  booking_preferred_time: string | null;
  booking_purpose: string | null;
  booking_remarks: string | null;
  stay_visiting_center: string | null;
  stay_location: string | null;
  stay_check_in: string | null;
  stay_check_out: string | null;
  stay_remarks: string | null;
  student_details: Record<string, string> | null;
  guest_details: Record<string, string> | null;
  new_member_details: Record<string, string> | null;
  event_details: Record<string, string> | null;
  traveler_details: Record<string, string> | null;
  submitted_by_user_id: string;
  approvals: Approval[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  AUTO_APPROVED: { label: 'Auto-Approved', color: 'var(--status-success)', icon: Sparkles },
  PENDING_L1:    { label: 'Pending L1',    color: 'var(--status-warning)', icon: Clock },
  PENDING_L2:    { label: 'Pending L2',    color: 'var(--status-warning)', icon: Clock },
  PENDING_L3:    { label: 'Pending L3',    color: 'var(--status-warning)', icon: Clock },
  APPROVED:      { label: 'Approved',      color: 'var(--status-success)', icon: CheckCircle2 },
  REJECTED:      { label: 'Rejected',      color: 'var(--status-danger)',  icon: XCircle },
  CANCELLED:     { label: 'Cancelled',     color: 'var(--content-muted)',  icon: XCircle },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide"
        style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
      <p className="text-xs font-medium" style={{ color: 'rgb(var(--content-primary))' }}>
        {value || '—'}
      </p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="glass p-5">
      <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2"
        style={{ color: 'rgb(var(--content-primary))' }}>
        {Icon && <Icon className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />}
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function TravelRequestDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { user } = useAuthStore();

  const [data, setData]       = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await travelRequestApi.get(id);
      setData(r.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function decide(action: 'APPROVE' | 'REJECT') {
    if (!data) return;
    const note = action === 'REJECT'
      ? window.prompt('Reason for rejection (≥ 5 chars):') ?? ''
      : window.prompt('Optional approval note (press OK to skip):') ?? '';
    if (action === 'REJECT' && note.trim().length < 5) return;
    setActing(true);
    try {
      if (action === 'APPROVE') {
        await travelRequestApi.approve(data.id, { note: note.trim() || undefined });
      } else {
        await travelRequestApi.reject(data.id, { note: note.trim() });
      }
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Action failed.');
    } finally {
      setActing(false);
    }
  }

  async function cancel() {
    if (!data) return;
    const reason = window.prompt('Reason for cancellation (≥ 5 chars):') ?? '';
    if (reason.trim().length < 5) return;
    setActing(true);
    try {
      await travelRequestApi.cancel(data.id, { reason: reason.trim() });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Cancel failed.');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-40 w-full rounded-xl" />
      <div className="skeleton h-32 w-full rounded-xl" />
    </div>;
  }
  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3"
          style={{ color: 'rgb(var(--status-danger))' }} />
        <p className="text-sm" style={{ color: 'rgb(var(--status-danger))' }}>{error}</p>
        <button onClick={() => navigate(-1)}
          className="mt-3 text-xs underline" style={{ color: 'rgb(var(--accent))' }}>
          Go back
        </button>
      </div>
    );
  }

  const meta = STATUS_META[data.status] ?? STATUS_META.PENDING_L1;
  const SIcon = meta.icon;

  const myEmail = user?.email.toLowerCase();
  const pendingChain = data.approvals.find(
    (a) => a.status === 'PENDING' && a.level === data.current_level
  );
  const canIDecide = pendingChain && (
    pendingChain.approver_email.toLowerCase() === myEmail ||
    user?.role === UserRole.OWNER || user?.role === UserRole.ADMIN
  );
  const canCancel = user && (
    user.id === data.submitted_by_user_id ||
    user.role === UserRole.OWNER || user.role === UserRole.ADMIN
  ) && ['PENDING_L1', 'PENDING_L2', 'PENDING_L3', 'APPROVED', 'AUTO_APPROVED'].includes(data.status);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto pb-32">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs"
        style={{ color: 'rgb(var(--content-muted))' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <motion.div className="glass p-5"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold font-mono"
                style={{ color: 'rgb(var(--content-primary))' }}>
                {data.request_code}
              </h1>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-semibold inline-flex items-center gap-1"
                style={{ background: `rgb(${meta.color}/0.15)`, color: `rgb(${meta.color})` }}>
                <SIcon className="w-3 h-3" />
                {meta.label}
              </span>
              {data.urgency === 'URGENT' && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{ background: 'rgb(var(--status-danger)/0.12)', color: 'rgb(var(--status-danger))' }}>
                  Urgent
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-muted))' }}>
              Submitted {fmtDate(data.submitted_at)}
              {data.decided_at && ` · Decided ${fmtDate(data.decided_at)}`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Approval timeline ─────────────────────────────────── */}
      <Section title="Approval Chain" icon={CheckCircle2}>
        {data.approvals.length === 0 ? (
          <p className="text-xs flex items-center gap-2"
            style={{ color: 'rgb(var(--status-success))' }}>
            <Sparkles className="w-3.5 h-3.5" />
            Auto-approved — no chain required.
          </p>
        ) : (
          <ol className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[rgb(var(--border-subtle))]">
            {data.approvals.map((a) => {
              const isCurrent = a.level === data.current_level && a.status === 'PENDING';
              const color = a.status === 'APPROVED'
                ? 'var(--status-success)'
                : a.status === 'REJECTED'
                ? 'var(--status-danger)'
                : isCurrent ? 'var(--status-warning)' : 'var(--content-muted)';
              return (
                <li key={a.id} className="relative">
                  <div className="absolute -left-6 top-1 w-4 h-4 rounded-full"
                    style={{ background: `rgb(${color})` }} />
                  <div className="rounded-xl p-3" style={{ background: 'rgb(var(--surface-elevated))' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold" style={{ color: `rgb(${color})` }}>
                          L{a.level} · {a.status}{isCurrent && ' (current)'}
                        </p>
                        <p className="text-[11px] mt-0.5 font-mono"
                          style={{ color: 'rgb(var(--content-secondary))' }}>
                          {a.approver_email}
                        </p>
                        {a.note && (
                          <p className="text-[11px] mt-1 italic"
                            style={{ color: 'rgb(var(--content-secondary))' }}>
                            "{a.note}"
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono"
                        style={{ color: 'rgb(var(--content-muted))' }}>
                        {fmtDate(a.acted_at)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title="Traveler" icon={User}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KV label="Name" value={data.traveler_full_name} />
          <KV label="Employee ID" value={<span className="font-mono">{data.traveler_employee_code}</span>} />
          <KV label="Email" value={data.traveler_email} />
          <KV label="Designation" value={data.traveler_designation} />
          <KV label="Department" value={data.department_name} />
          <KV label="Approval Levels" value={String(data.traveler_no_of_approvers)} />
        </div>
        {data.submitted_on_behalf && (
          <div className="mt-3 p-2 rounded-lg text-[11px]"
            style={{ background: 'rgb(var(--status-info)/0.1)', color: 'rgb(var(--status-info))' }}>
            Submitted on behalf · cost centre: {data.on_behalf_cost_centre || '—'}
          </div>
        )}
      </Section>

      <Section title="Request" icon={Building2}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KV label="Request For"    value={data.request_for.replace('_', ' ')} />
          <KV label="Type"           value={data.request_kind.replace('_', ' ')} />
          <KV label="Reservation"    value={data.reservation_type.replace(/_/g, ' ')} />
          <KV label="Needs Stay"     value={data.needs_stay ? 'Yes' : 'No'} />
          <KV label="Reason"         value={data.reason_of_travel} />
          {data.reason_of_travel_other && (
            <KV label="Reason (Other)" value={data.reason_of_travel_other} />
          )}
        </div>
      </Section>

      {data.reservation_type !== 'STAY' && data.booking_destination && (
        <Section title="Booking" icon={Plane}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KV label="Boarding"        value={data.booking_boarding} />
            <KV label="Destination"     value={data.booking_destination} />
            <KV label="Departure Date"  value={fmtDate(data.booking_departure_date)} />
            <KV label="Preferred Time"  value={data.booking_preferred_time} />
            <KV label="Visiting Reason" value={data.booking_visiting_reason} />
          </div>
          {(data.booking_purpose || data.booking_remarks) && (
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {data.booking_purpose && <KV label="Purpose" value={data.booking_purpose} />}
              {data.booking_remarks && <KV label="Remarks" value={data.booking_remarks} />}
            </div>
          )}
        </Section>
      )}

      {data.needs_stay && (
        <Section title="Stay" icon={Hotel}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KV label="Visiting Center" value={data.stay_visiting_center} />
            <KV label="Location"        value={data.stay_location} />
            <KV label="Check-In"        value={fmtDate(data.stay_check_in)} />
            <KV label="Check-Out"       value={fmtDate(data.stay_check_out)} />
          </div>
          {data.stay_remarks && <div className="mt-3"><KV label="Remarks" value={data.stay_remarks} /></div>}
        </Section>
      )}

      {[
        { d: data.student_details,    title: 'Student Details',    icon: User },
        { d: data.guest_details,      title: 'Guest Details',      icon: User },
        { d: data.new_member_details, title: 'New Employee',       icon: User },
        { d: data.event_details,      title: 'Event Details',      icon: Calendar },
        { d: data.traveler_details,   title: 'Traveler (Subject)', icon: User },
      ].map(({ d, title, icon }) => d && Object.keys(d).length > 0 && (
        <Section key={title} title={title} icon={icon}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(d).map(([k, v]) => (
              <KV key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()} value={v} />
            ))}
          </div>
        </Section>
      ))}

      {/* ── Action bar ───────────────────────────────────────── */}
      {(canIDecide || canCancel) && (
        <div className="sticky bottom-4 z-10">
          <motion.div className="glass p-4 flex items-center justify-end gap-2"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {canCancel && (
              <button onClick={cancel} disabled={acting}
                className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  color: 'rgb(var(--content-secondary))',
                }}>
                Cancel Request
              </button>
            )}
            {canIDecide && (
              <>
                <button onClick={() => decide('REJECT')} disabled={acting}
                  className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                  style={{
                    background: 'rgb(var(--status-danger)/0.12)',
                    color: 'rgb(var(--status-danger))',
                  }}>
                  Reject
                </button>
                <button onClick={() => decide('APPROVE')} disabled={acting}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: 'rgb(var(--status-success))' }}>
                  Approve as L{data.current_level}
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
