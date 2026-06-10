import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Receipt, ArrowLeft, AlertCircle, CheckCircle2, XCircle, Clock,
  FileText, Link2, BadgeDollarSign, Edit3, Send, Ban, X,
  DownloadCloud, FileCheck2, Sparkles,
} from 'lucide-react';
import { reimbursementApi, openAuthPdf } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { ReimbursementKind, ReimbursementStatus, UserRole } from '@travel-os/shared-types';

interface Item {
  id:                       string;
  reimbursementId:          string;
  sequenceNo:               number;
  categoryId:               string;
  categoryName:             string | null;
  expenseDate:              string;
  description:              string;
  claimedAmount:            number;
  approvedAmount:           number | null;
  receiptPath:              string | null;
  receiptOriginalFilename:  string | null;
  receiptUploadedAt:        string | null;
  notes:                    string | null;
}

interface Detail {
  id:                  string;
  reimbursementCode:   string;
  kind:                ReimbursementKind;
  status:              ReimbursementStatus;
  submittedByUserId:   string;
  employeeId:          string | null;
  employeeCode:        string | null;
  employeeName:        string | null;
  departmentName:      string | null;
  travelRequestId:     string | null;
  travelRequestCode:   string | null;
  title:               string;
  description:         string | null;
  currency:            string;
  totalClaimed:        number;
  totalApproved:       number;
  decisionNote:        string | null;
  decidedAt:           string | null;
  paidReference:       string | null;
  paidAt:              string | null;
  submittedAt:         string | null;
  createdAt:           string;
  items:               Item[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:     { label: 'Draft',     color: 'var(--content-muted)',   icon: FileText },
  SUBMITTED: { label: 'Submitted', color: 'var(--status-warning)',  icon: Clock },
  APPROVED:  { label: 'Approved',  color: 'var(--status-success)',  icon: CheckCircle2 },
  REJECTED:  { label: 'Rejected',  color: 'var(--status-danger)',   icon: XCircle },
  PAID:      { label: 'Paid',      color: 'var(--status-info)',     icon: BadgeDollarSign },
};

function inr(n: number): string {
  return `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function ReimbursementDetailPage() {
  const navigate = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const { user }  = useAuthStore();
  const isAdmin   = user && (user.role === UserRole.OWNER || user.role === UserRole.ADMIN);

  const [data,    setData]    = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  // Approval form state (admin/owner)
  const [decideMode, setDecideMode]   = useState<'idle' | 'approve' | 'reject'>('idle');
  const [decisionNote, setDecisionNote] = useState('');
  const [approvedAmounts, setApprovedAmounts] = useState<Record<string, string>>({});

  // Pay form state
  const [payMode, setPayMode]   = useState(false);
  const [payRef,  setPayRef]    = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await reimbursementApi.get(id);
      setData(r.data.data);
      // Reset decide state when data refreshes
      setApprovedAmounts(
        (r.data.data.items ?? []).reduce((m: Record<string, string>, it: Item) => {
          m[it.id] = String(it.approvedAmount ?? it.claimedAmount);
          return m;
        }, {})
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to load.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);  // eslint-disable-line

  // ─── Actions ───────────────────────────────────────────────
  async function submitDraft() {
    if (!data) return;
    setBusy(true); setError(null);
    try {
      await reimbursementApi.submit(data.id);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Submit failed.');
    } finally { setBusy(false); }
  }

  async function cancelClaim() {
    if (!data) return;
    const reason = prompt('Reason for cancellation (optional):') ?? '';
    if (reason === null) return;
    setBusy(true); setError(null);
    try {
      await reimbursementApi.cancel(data.id, { reason });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Cancel failed.');
    } finally { setBusy(false); }
  }

  async function submitDecision() {
    if (!data || decideMode === 'idle') return;
    setBusy(true); setError(null);
    try {
      if (decideMode === 'reject') {
        if (decisionNote.trim().length < 5) {
          setError('Rejection note (≥ 5 chars) is required.');
          setBusy(false); return;
        }
        await reimbursementApi.decide(data.id, {
          action: 'REJECT', note: decisionNote.trim(),
        });
      } else {
        const itemApprovals = data.items.map((it) => {
          const v = approvedAmounts[it.id];
          const n = parseFloat(v ?? '0');
          if (!Number.isFinite(n) || n < 0 || n > it.claimedAmount) {
            throw new Error(
              `Item ${it.sequenceNo}: approved amount must be between 0 and ${inr(it.claimedAmount)}.`
            );
          }
          return { id: it.id, approvedAmount: n };
        });
        await reimbursementApi.decide(data.id, {
          action: 'APPROVE',
          note: decisionNote.trim() || undefined,
          itemApprovals,
        });
      }
      setDecideMode('idle');
      setDecisionNote('');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } } & { message?: string };
      setError(e.response?.data?.error?.message ?? e.message ?? 'Decision failed.');
    } finally { setBusy(false); }
  }

  async function payNow() {
    if (!data) return;
    if (!payRef.trim()) { setError('Payment reference (UTR / NEFT) is required.'); return; }
    setBusy(true); setError(null);
    try {
      await reimbursementApi.pay(data.id, { paidReference: payRef.trim() });
      setPayMode(false);
      setPayRef('');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Payout failed.');
    } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
          {error ?? 'Reimbursement not found.'}
        </p>
      </div>
    );
  }

  const m = STATUS_META[data.status] ?? STATUS_META.DRAFT;
  const SIcon = m.icon;
  const isOwner = data.submittedByUserId === user?.id;
  const canEdit = data.status === ReimbursementStatus.DRAFT && (isOwner || isAdmin);
  const canSubmit = canEdit && data.items.length > 0;
  const canCancel = (data.status === ReimbursementStatus.DRAFT
                  || data.status === ReimbursementStatus.SUBMITTED)
                  && (isOwner || isAdmin);
  const canDecide = isAdmin && data.status === ReimbursementStatus.SUBMITTED;
  const canPay    = isAdmin && data.status === ReimbursementStatus.APPROVED;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-xl"
            style={{ background: 'rgb(var(--surface-elevated))' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'rgb(var(--content-secondary))' }} />
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `rgb(${m.color}/0.12)` }}>
            <SIcon className="w-5 h-5" style={{ color: `rgb(${m.color})` }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold font-mono"
                style={{ color: 'rgb(var(--content-primary))' }}>
                {data.reimbursementCode}
              </h1>
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-semibold"
                style={{ background: `rgb(${m.color}/0.15)`, color: `rgb(${m.color})` }}>
                {m.label}
              </span>
              {data.kind === ReimbursementKind.TRAVEL_LINKED && data.travelRequestCode && (
                <button onClick={() => navigate(`/travel/requests/${data.travelRequestId}`)}
                  className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded font-semibold inline-flex items-center gap-1 hover:underline"
                  style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                  <Link2 className="w-3 h-3" />
                  {data.travelRequestCode}
                </button>
              )}
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              {data.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <button onClick={() => navigate(`/reimbursements/${data.id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-primary))' }}>
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {canSubmit && (
            <button onClick={submitDraft} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: 'rgb(var(--accent))' }}>
              <Send className="w-3.5 h-3.5" /> Submit
            </button>
          )}
          {canCancel && (
            <button onClick={cancelClaim} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
              style={{
                background: 'rgb(var(--status-danger)/0.08)',
                color: 'rgb(var(--status-danger))',
              }}>
              <Ban className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs glass"
          style={{ color: 'rgb(var(--status-danger))', background: 'rgb(var(--status-danger)/0.08)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass p-4 rounded-xl">
          <p className="text-[10px] uppercase tracking-wide font-semibold"
            style={{ color: 'rgb(var(--content-muted))' }}>Claimed</p>
          <p className="font-mono text-xl font-bold mt-1"
            style={{ color: 'rgb(var(--content-primary))' }}>
            {inr(data.totalClaimed)}
          </p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-[10px] uppercase tracking-wide font-semibold"
            style={{ color: 'rgb(var(--content-muted))' }}>Approved</p>
          <p className="font-mono text-xl font-bold mt-1"
            style={{ color: 'rgb(var(--status-success))' }}>
            {data.totalApproved > 0 ? inr(data.totalApproved) : '—'}
          </p>
        </div>
        <div className="glass p-4 rounded-xl">
          <p className="text-[10px] uppercase tracking-wide font-semibold"
            style={{ color: 'rgb(var(--content-muted))' }}>Items</p>
          <p className="font-mono text-xl font-bold mt-1"
            style={{ color: 'rgb(var(--content-primary))' }}>
            {data.items.length}
          </p>
        </div>
      </div>

      {/* Claimant info */}
      <div className="glass p-4 rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
            Claimant
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Field label="Name"        value={data.employeeName ?? '—'} />
          <Field label="Employee Code" value={data.employeeCode ?? '—'} />
          <Field label="Department"  value={data.departmentName ?? '—'} />
          <Field label="Submitted"   value={data.submittedAt ? new Date(data.submittedAt).toLocaleString('en-IN') : '—'} />
        </div>
        {data.description && (
          <div className="pt-2 border-t" style={{ borderColor: 'rgb(var(--border-subtle))' }}>
            <p className="text-[10px] uppercase tracking-wide font-semibold mb-1"
              style={{ color: 'rgb(var(--content-muted))' }}>Description</p>
            <p className="text-xs" style={{ color: 'rgb(var(--content-secondary))' }}>
              {data.description}
            </p>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="glass p-4 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
            Items ({data.items.length})
          </h2>
        </div>
        {data.items.map((it) => (
          <motion.div key={it.id}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl"
            style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))' }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                <span className="font-mono text-xs font-bold">{it.sequenceNo}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold"
                    style={{ color: 'rgb(var(--content-primary))' }}>
                    {it.description}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                    {it.categoryName ?? '—'}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5 font-mono"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  {new Date(it.expenseDate).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                  {it.notes && ` · ${it.notes}`}
                </p>
                {it.receiptOriginalFilename && (
                  <button
                    onClick={() => openAuthPdf(reimbursementApi.receiptUrl(it.id))}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] underline"
                    style={{ color: 'rgb(var(--accent-text))' }}>
                    <DownloadCloud className="w-3 h-3" />
                    {it.receiptOriginalFilename}
                  </button>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-sm font-bold"
                  style={{ color: 'rgb(var(--content-primary))' }}>
                  {inr(it.claimedAmount)}
                </p>
                {it.approvedAmount != null && (
                  <p className="font-mono text-[11px]"
                    style={{
                      color: it.approvedAmount === it.claimedAmount
                        ? 'rgb(var(--status-success))'
                        : 'rgb(var(--status-warning))',
                    }}>
                    ✓ {inr(it.approvedAmount)}
                  </p>
                )}
              </div>
            </div>

            {/* Per-item override in APPROVE mode */}
            {decideMode === 'approve' && canDecide && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2"
                style={{ borderColor: 'rgb(var(--border-subtle))' }}>
                <label className="text-[10px] uppercase font-semibold flex-shrink-0"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  Approve at ₹
                </label>
                <input
                  type="number" min="0" step="0.01" max={it.claimedAmount}
                  value={approvedAmounts[it.id] ?? ''}
                  onChange={(e) => setApprovedAmounts((p) => ({ ...p, [it.id]: e.target.value }))}
                  className="flex-1 px-2 py-1 rounded-lg text-xs font-mono outline-none"
                  style={{
                    background: 'rgb(var(--surface-primary))',
                    border: '1px solid rgb(var(--border-subtle))',
                    color: 'rgb(var(--content-primary))',
                  }} />
                <span className="text-[10px] font-mono"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  of {inr(it.claimedAmount)}
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Decision panel — Admin/Owner only */}
      {canDecide && (
        <div className="glass p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
              <h2 className="font-semibold text-sm"
                style={{ color: 'rgb(var(--content-primary))' }}>
                Decision
              </h2>
            </div>
            {decideMode !== 'idle' && (
              <button onClick={() => { setDecideMode('idle'); setDecisionNote(''); }}
                className="text-[11px] underline"
                style={{ color: 'rgb(var(--content-muted))' }}>
                Cancel
              </button>
            )}
          </div>

          {decideMode === 'idle' ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setDecideMode('approve')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'rgb(var(--status-success))' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => setDecideMode('reject')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'rgb(var(--status-danger))' }}>
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          ) : (
            <>
              <textarea
                rows={2}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={decideMode === 'reject'
                  ? 'Why is this being rejected? (≥ 5 chars)'
                  : 'Optional approver note'}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  border: '1px solid rgb(var(--border-subtle))',
                  color: 'rgb(var(--content-primary))',
                }} />
              <button onClick={submitDecision} disabled={busy}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{
                  background: decideMode === 'approve'
                    ? 'rgb(var(--status-success))'
                    : 'rgb(var(--status-danger))',
                }}>
                {busy ? 'Saving…' : decideMode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Payout panel */}
      {canPay && (
        <div className="glass p-4 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
              Mark as Paid
            </h2>
          </div>
          {payMode ? (
            <div className="flex items-center gap-2">
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="UTR / NEFT / transfer reference"
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none font-mono"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  border: '1px solid rgb(var(--border-subtle))',
                  color: 'rgb(var(--content-primary))',
                }} />
              <button onClick={() => setPayMode(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
                Cancel
              </button>
              <button onClick={payNow} disabled={busy}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: 'rgb(var(--accent))' }}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button onClick={() => setPayMode(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white"
              style={{ background: 'rgb(var(--accent))' }}>
              <BadgeDollarSign className="w-3.5 h-3.5" /> Mark as Paid
            </button>
          )}
        </div>
      )}

      {/* Decision / payout history */}
      {(data.decisionNote || data.paidReference) && (
        <div className="glass p-4 rounded-xl space-y-2">
          <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
            History
          </h2>
          {data.decisionNote && (
            <div className="text-xs p-2 rounded-lg"
              style={{ background: 'rgb(var(--surface-elevated))' }}>
              <p className="font-semibold"
                style={{ color: data.status === ReimbursementStatus.REJECTED
                    ? 'rgb(var(--status-danger))'
                    : 'rgb(var(--status-success))' }}>
                Decision · {data.decidedAt && new Date(data.decidedAt).toLocaleString('en-IN')}
              </p>
              <p className="mt-1" style={{ color: 'rgb(var(--content-secondary))' }}>
                {data.decisionNote}
              </p>
            </div>
          )}
          {data.paidReference && (
            <div className="text-xs p-2 rounded-lg"
              style={{ background: 'rgb(var(--surface-elevated))' }}>
              <p className="font-semibold" style={{ color: 'rgb(var(--status-info))' }}>
                Paid · {data.paidAt && new Date(data.paidAt).toLocaleString('en-IN')}
              </p>
              <p className="mt-1 font-mono" style={{ color: 'rgb(var(--content-secondary))' }}>
                Ref: {data.paidReference}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide font-semibold"
        style={{ color: 'rgb(var(--content-muted))' }}>
        {label}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--content-primary))' }}>
        {value}
      </p>
    </div>
  );
}
