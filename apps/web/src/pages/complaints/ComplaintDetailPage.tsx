import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MessageSquareWarning, ArrowLeft, AlertCircle, Link2, UserCheck, Loader,
  CheckCircle2, XCircle, Clock, Send, Flag, MessageSquare, Sparkles, AlertTriangle,
} from 'lucide-react';
import { complaintApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { ComplaintStatus, ComplaintPriority, UserRole } from '@travel-os/shared-types';

interface Update {
  id: string; authorName: string | null; kind: string; body: string;
  fromStatus: string | null; toStatus: string | null; createdAt: string;
}
interface Detail {
  id: string; complaintCode: string;
  raisedByUserId: string;
  status: ComplaintStatus; priority: ComplaintPriority;
  category: string; subject: string; description: string;
  vendorName: string | null;
  employeeName: string | null; departmentName: string | null;
  travelRequestId: string | null; travelRequestCode: string | null;
  slaDueAt: string | null;
  resolutionOwnerUserId: string | null; resolutionOwnerName: string | null;
  assignedAt: string | null;
  resolutionNote: string | null; resolvedAt: string | null;
  closedAt: string | null; createdAt: string;
  updates: Update[];
}
interface StaffUser { id: string; email: string; role: string; name: string | null; department_name: string | null; }

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  OPEN:        { label: 'Open',        color: 'var(--status-warning)', icon: Clock },
  ASSIGNED:    { label: 'Assigned',    color: 'var(--status-info)',    icon: UserCheck },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--status-info)',    icon: Loader },
  RESOLVED:    { label: 'Resolved',    color: 'var(--status-success)', icon: CheckCircle2 },
  CLOSED:      { label: 'Closed',      color: 'var(--content-muted)',  icon: XCircle },
};
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW:      { label: 'Low',      color: 'var(--content-muted)' },
  MEDIUM:   { label: 'Medium',   color: 'var(--status-info)' },
  HIGH:     { label: 'High',     color: 'var(--status-warning)' },
  CRITICAL: { label: 'Critical', color: 'var(--status-danger)' },
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ComplaintDetailPage() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const isManager = user && [UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER].includes(user.role);

  const [data,    setData]    = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  const [staff,   setStaff]   = useState<StaffUser[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [comment, setComment] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await complaintApi.get(id);
      setData(r.data.data);
      setOwnerId(r.data.data.resolutionOwnerUserId ?? '');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to load.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  useEffect(() => {
    if (!isManager) return;
    complaintApi.assignableUsers().then((r) => setStaff(r.data.data)).catch(() => setStaff([]));
  }, [isManager]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await load(); }
    catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Action failed.');
    } finally { setBusy(false); }
  }

  async function assign() {
    if (!data || !ownerId) { setError('Pick a resolution owner.'); return; }
    await run(() => complaintApi.assign(data.id, { resolutionOwnerUserId: ownerId }));
  }
  async function startWork() {
    if (!data) return;
    await run(() => complaintApi.updateStatus(data.id, { status: ComplaintStatus.IN_PROGRESS }));
  }
  async function resolve() {
    if (!data) return;
    const note = window.prompt('Resolution note (≥ 5 chars):') ?? '';
    if (note.trim().length < 5) return;
    await run(() => complaintApi.resolve(data.id, { note: note.trim() }));
  }
  async function close() {
    if (!data) return;
    const note = window.prompt('Closing note (optional):') ?? '';
    await run(() => complaintApi.close(data.id, { note: note.trim() || undefined }));
  }
  async function postComment() {
    if (!data || !comment.trim()) return;
    await run(async () => {
      await complaintApi.addComment(data.id, { body: comment.trim() });
      setComment('');
    });
  }

  if (loading) {
    return <div className="p-6 max-w-3xl mx-auto space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
    </div>;
  }
  if (!data) {
    return <div className="p-6 text-center">
      <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>{error ?? 'Complaint not found.'}</p>
    </div>;
  }

  const m = STATUS_META[data.status] ?? STATUS_META.OPEN;
  const pm = PRIORITY_META[data.priority] ?? PRIORITY_META.MEDIUM;
  const SIcon = m.icon;

  const isRaiser = data.raisedByUserId === user?.id;
  const isOwner  = data.resolutionOwnerUserId === user?.id;
  const active   = !['RESOLVED', 'CLOSED'].includes(data.status);

  const canAssign   = isManager && active;
  const canStart    = (isManager || isOwner) && data.status === 'ASSIGNED';
  const canResolve  = (isManager || isOwner) && ['ASSIGNED', 'IN_PROGRESS'].includes(data.status);
  const canClose    = (isManager || isRaiser) && data.status !== 'CLOSED';
  const canComment  = true;

  const slaBreached = data.slaDueAt && active && new Date(data.slaDueAt).getTime() < Date.now();

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs"
        style={{ color: 'rgb(var(--content-muted))' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Header */}
      <div className="glass p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `rgb(${m.color}/0.12)` }}>
              <SIcon className="w-5 h-5" style={{ color: `rgb(${m.color})` }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl font-bold font-mono" style={{ color: 'rgb(var(--content-primary))' }}>
                  {data.complaintCode}
                </h1>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-semibold"
                  style={{ background: `rgb(${m.color}/0.15)`, color: `rgb(${m.color})` }}>{m.label}</span>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-bold"
                  style={{ background: `rgb(${pm.color}/0.12)`, color: `rgb(${pm.color})` }}>{pm.label}</span>
                {data.travelRequestCode && (
                  <button onClick={() => navigate(`/travel/requests/${data.travelRequestId}`)}
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded inline-flex items-center gap-1 hover:underline"
                    style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                    <Link2 className="w-3 h-3" /> {data.travelRequestCode}
                  </button>
                )}
              </div>
              <p className="text-sm font-semibold mt-1" style={{ color: 'rgb(var(--content-primary))' }}>
                {data.subject}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                {data.category}{data.vendorName && ` · ${data.vendorName}`} · raised {fmt(data.createdAt)}
              </p>
            </div>
          </div>
          {slaBreached && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded font-bold inline-flex items-center gap-1"
              style={{ background: 'rgb(var(--status-danger)/0.12)', color: 'rgb(var(--status-danger))' }}>
              <AlertTriangle className="w-3 h-3" /> SLA Breached
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs glass"
          style={{ color: 'rgb(var(--status-danger))', background: 'rgb(var(--status-danger)/0.08)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Meta grid */}
      <div className="glass p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
        <KV label="Raised By" value={data.employeeName ?? '—'} />
        <KV label="Department" value={data.departmentName ?? '—'} />
        <KV label="Resolution Owner" value={data.resolutionOwnerName ?? 'Unassigned'} />
        <KV label="SLA Due" value={fmt(data.slaDueAt)} />
        {data.resolvedAt && <KV label="Resolved" value={fmt(data.resolvedAt)} />}
        {data.closedAt && <KV label="Closed" value={fmt(data.closedAt)} />}
      </div>

      {/* Description */}
      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-2 flex items-center gap-2"
          style={{ color: 'rgb(var(--content-primary))' }}>
          <Flag className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> Details
        </h2>
        <p className="text-xs whitespace-pre-wrap" style={{ color: 'rgb(var(--content-secondary))' }}>
          {data.description}
        </p>
        {data.resolutionNote && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: 'rgb(var(--status-success)/0.08)' }}>
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'rgb(var(--status-success))' }}>
              Resolution
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-secondary))' }}>{data.resolutionNote}</p>
          </div>
        )}
      </div>

      {/* Assignment (managers) */}
      {canAssign && (
        <div className="glass p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2"
            style={{ color: 'rgb(var(--content-primary))' }}>
            <UserCheck className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            {data.resolutionOwnerUserId ? 'Reassign Resolution Owner' : 'Assign Resolution Owner'}
          </h2>
          <div className="flex items-center gap-2">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))', color: 'rgb(var(--content-primary))' }}>
              <option value="">— Select staff —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email} ({s.role}){s.department_name ? ` · ${s.department_name}` : ''}
                </option>
              ))}
            </select>
            <button onClick={assign} disabled={busy || !ownerId}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: 'rgb(var(--accent))' }}>
              Assign
            </button>
          </div>
        </div>
      )}

      {/* Timeline + comments */}
      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2"
          style={{ color: 'rgb(var(--content-primary))' }}>
          <MessageSquare className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> Activity
        </h2>
        {data.updates.length === 0 ? (
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>No activity yet.</p>
        ) : (
          <ol className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[rgb(var(--border-subtle))]">
            {data.updates.map((u) => {
              const isStatus = u.kind === 'STATUS_CHANGE' || u.kind === 'ASSIGNMENT';
              return (
                <li key={u.id} className="relative">
                  <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full"
                    style={{ background: isStatus ? 'rgb(var(--accent))' : 'rgb(var(--content-muted))' }} />
                  <div className="rounded-xl p-3" style={{ background: 'rgb(var(--surface-elevated))' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                        {u.authorName ?? 'Someone'}
                        {isStatus && u.toStatus && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                            {u.toStatus}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                        {fmt(u.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-secondary))' }}>{u.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Comment box */}
        {canComment && (
          <div className="flex items-center gap-2 mt-4">
            <input value={comment} onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }}
              placeholder="Add a comment…"
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))', color: 'rgb(var(--content-primary))' }} />
            <button onClick={postComment} disabled={busy || !comment.trim()}
              className="p-2.5 rounded-xl text-white disabled:opacity-40"
              style={{ background: 'rgb(var(--accent))' }}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Action bar */}
      {(canStart || canResolve || canClose) && (
        <div className="sticky bottom-4 z-10">
          <motion.div className="glass p-4 flex items-center justify-end gap-2 flex-wrap"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {canClose && (
              <button onClick={close} disabled={busy}
                className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
                Close
              </button>
            )}
            {canStart && (
              <button onClick={startWork} disabled={busy}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 inline-flex items-center gap-1.5"
                style={{ background: 'rgb(var(--status-info))' }}>
                <Loader className="w-3.5 h-3.5" /> Start Working
              </button>
            )}
            {canResolve && (
              <button onClick={resolve} disabled={busy}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 inline-flex items-center gap-1.5"
                style={{ background: 'rgb(var(--status-success))' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
              </button>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: 'rgb(var(--content-primary))' }}>{value || '—'}</p>
    </div>
  );
}
