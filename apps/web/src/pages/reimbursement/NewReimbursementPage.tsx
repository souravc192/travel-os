import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Receipt, ArrowLeft, Plus, X, AlertCircle, Save, Send, FileUp,
  Link2, FileText, CheckCircle2, Trash2, Sparkles,
} from 'lucide-react';
import { reimbursementApi, travelRequestApi } from '../../lib/api';
import { ReimbursementKind, ReimbursementStatus } from '@travel-os/shared-types';

const inputCx = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

interface Category { id: string; name: string; description: string | null; is_active: boolean; }

interface ItemDraft {
  // Existing items have an `id`. New rows have `null` until saved.
  id:            string | null;
  categoryId:    string;
  expenseDate:   string;
  description:   string;
  claimedAmount: string;
  notes:         string;
  receiptOriginalFilename: string | null;
  receiptUploadedAt:       string | null;
  // Local-only: a file the user picked but hasn't uploaded yet
  pendingFile?: File | null;
}

interface TravelLite { id: string; request_code: string; traveler_full_name: string; }

function blankItem(): ItemDraft {
  return {
    id: null,
    categoryId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    description: '',
    claimedAmount: '',
    notes: '',
    receiptOriginalFilename: null,
    receiptUploadedAt: null,
    pendingFile: null,
  };
}

export default function NewReimbursementPage() {
  const navigate = useNavigate();
  const { id }    = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const [searchParams] = useSearchParams();

  // Header
  const [kind, setKind] = useState<ReimbursementKind>(
    (searchParams.get('travelRequestId')
      ? ReimbursementKind.TRAVEL_LINKED
      : ReimbursementKind.STANDALONE)
  );
  const [title, setTitle]                 = useState('');
  const [description, setDescription]     = useState('');
  const [travelRequestId, setTravelRequestId] = useState<string>(
    searchParams.get('travelRequestId') ?? ''
  );
  const [status, setStatus] = useState<ReimbursementStatus>(ReimbursementStatus.DRAFT);

  // Items
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);

  // Lookups
  const [categories, setCategories] = useState<Category[]>([]);
  const [travels,    setTravels]    = useState<TravelLite[]>([]);

  const [loading,    setLoading]    = useState(isEditing);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  // Load categories + travel requests (for the dropdown) + existing draft (if editing)
  useEffect(() => {
    reimbursementApi.listCategories({ includeInactive: false })
      .then((r) => setCategories(r.data.data))
      .catch(() => setCategories([]));

    travelRequestApi.list({ limit: 100 })
      .then((r) => setTravels(r.data.data.map((t: { id: string; request_code: string; traveler_full_name: string }) => ({
        id: t.id, request_code: t.request_code, traveler_full_name: t.traveler_full_name,
      }))))
      .catch(() => setTravels([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    reimbursementApi.get(id)
      .then((r) => {
        const d = r.data.data;
        setKind(d.kind);
        setTitle(d.title ?? '');
        setDescription(d.description ?? '');
        setTravelRequestId(d.travelRequestId ?? '');
        setStatus(d.status);
        setItems(
          (d.items ?? []).length === 0
            ? [blankItem()]
            : d.items.map((it: {
                id: string; categoryId: string; expenseDate: string; description: string;
                claimedAmount: number; notes: string | null;
                receiptOriginalFilename: string | null; receiptUploadedAt: string | null;
              }) => ({
                id: it.id,
                categoryId: it.categoryId,
                expenseDate: (it.expenseDate ?? '').slice(0, 10),
                description: it.description,
                claimedAmount: String(it.claimedAmount),
                notes: it.notes ?? '',
                receiptOriginalFilename: it.receiptOriginalFilename,
                receiptUploadedAt: it.receiptUploadedAt,
                pendingFile: null,
              }))
        );
      })
      .catch(() => setError('Could not load reimbursement.'))
      .finally(() => setLoading(false));
  }, [id]);

  const isDraft = status === ReimbursementStatus.DRAFT;
  const total   = useMemo(
    () => items.reduce((s, it) => s + (parseFloat(it.claimedAmount) || 0), 0),
    [items]
  );

  function setItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem()    { setItems((prev) => [...prev, blankItem()]); }
  function removeItem(i: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Validate header + items, return list of human-readable errors
  function validate(): string | null {
    if (!title.trim()) return 'Title is required.';
    if (kind === ReimbursementKind.TRAVEL_LINKED && !travelRequestId) {
      return 'Pick a travel request for travel-linked claims.';
    }
    if (items.length === 0) return 'Add at least one item.';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.categoryId) return `Item ${i + 1}: pick a category.`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.expenseDate)) return `Item ${i + 1}: pick a valid expense date.`;
      if (!it.description.trim()) return `Item ${i + 1}: description required.`;
      const amt = parseFloat(it.claimedAmount);
      if (!Number.isFinite(amt) || amt <= 0) return `Item ${i + 1}: claimed amount must be > 0.`;
    }
    return null;
  }

  // ---- Save (create or update) without submitting ----
  async function save({ andSubmit }: { andSubmit: boolean }): Promise<void> {
    setError(null); setSuccess(null);
    const v = validate();
    if (v) { setError(v); return; }

    setBusy(true);
    try {
      let reimbursementId = id;

      if (!isEditing) {
        const payload = {
          kind,
          title:       title.trim(),
          description: description.trim() || null,
          travelRequestId: kind === ReimbursementKind.TRAVEL_LINKED ? travelRequestId : null,
          items: items.map((it) => ({
            categoryId:    it.categoryId,
            expenseDate:   it.expenseDate,
            description:   it.description.trim(),
            claimedAmount: parseFloat(it.claimedAmount),
            notes:         it.notes.trim() || null,
          })),
        };
        const res = await reimbursementApi.create(payload);
        reimbursementId = res.data.data.id;
      } else {
        // Update header
        await reimbursementApi.update(id!, {
          title:       title.trim(),
          description: description.trim() || null,
        });

        // Reconcile items: update existing, add new (deletes are explicit only)
        for (const it of items) {
          if (it.id) {
            await reimbursementApi.updateItem(it.id, {
              categoryId:    it.categoryId,
              expenseDate:   it.expenseDate,
              description:   it.description.trim(),
              claimedAmount: parseFloat(it.claimedAmount),
              notes:         it.notes.trim() || null,
            });
          } else {
            const added = await reimbursementApi.addItem(id!, {
              categoryId:    it.categoryId,
              expenseDate:   it.expenseDate,
              description:   it.description.trim(),
              claimedAmount: parseFloat(it.claimedAmount),
              notes:         it.notes.trim() || null,
            });
            it.id = added.data.data.id;
          }
        }
      }

      // Upload any pending receipts now that items have IDs
      for (const it of items) {
        if (it.pendingFile && it.id) {
          await reimbursementApi.uploadReceipt(it.id, it.pendingFile);
          it.pendingFile = null;
        }
      }

      if (andSubmit) {
        await reimbursementApi.submit(reimbursementId!);
        navigate(`/reimbursements/${reimbursementId}`, { replace: true });
        return;
      }

      setSuccess('Draft saved.');
      if (!isEditing) {
        navigate(`/reimbursements/${reimbursementId}/edit`, { replace: true });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteExistingItem(itemId: string, index: number) {
    if (!confirm('Remove this item?')) return;
    setBusy(true);
    try {
      await reimbursementApi.deleteItem(itemId);
      setItems((prev) => prev.length === 1 ? [blankItem()] : prev.filter((_, idx) => idx !== index));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to remove item.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

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
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Receipt className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              {isEditing ? 'Edit Claim' : 'New Reimbursement Claim'}
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              {isDraft ? 'Save as draft, then submit when ready.' : `Status: ${status} — read-only.`}
            </p>
          </div>
        </div>
      </div>

      {!isDraft && (
        <div className="glass p-3 flex items-start gap-2 text-xs rounded-xl"
          style={{ color: 'rgb(var(--status-warning))', background: 'rgb(var(--status-warning)/0.08)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          This claim is no longer in draft and cannot be edited.
        </div>
      )}

      {/* Header card */}
      <div className="glass p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
            Claim Details
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1.5"
              style={{ color: 'rgb(var(--content-secondary))' }}>Claim Kind</label>
            <select
              disabled={!isDraft || isEditing}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as ReimbursementKind;
                setKind(k);
                if (k === ReimbursementKind.STANDALONE) setTravelRequestId('');
              }}
              className={inputCx} style={inputStyle}>
              <option value={ReimbursementKind.STANDALONE}>Standalone (no linked travel)</option>
              <option value={ReimbursementKind.TRAVEL_LINKED}>Travel-Linked</option>
            </select>
          </div>

          {kind === ReimbursementKind.TRAVEL_LINKED && (
            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>
                <Link2 className="inline w-3 h-3 mr-1" />
                Link to Travel Request
              </label>
              <select
                disabled={!isDraft || isEditing}
                value={travelRequestId}
                onChange={(e) => setTravelRequestId(e.target.value)}
                className={inputCx} style={inputStyle}>
                <option value="">— Select a travel request —</option>
                {travels.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.request_code} · {t.traveler_full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5"
            style={{ color: 'rgb(var(--content-secondary))' }}>Title</label>
          <input
            disabled={!isDraft}
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Onsite client visit — taxi + food"
            className={inputCx} style={inputStyle} />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5"
            style={{ color: 'rgb(var(--content-secondary))' }}>Description (optional)</label>
          <textarea
            disabled={!isDraft}
            rows={2}
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Any context for the approver."
            className={inputCx} style={inputStyle} />
        </div>
      </div>

      {/* Items */}
      <div className="glass p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
              Items
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-muted))' }}>
              {items.length}
            </span>
          </div>
          <p className="font-mono text-sm font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            Total: ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
        </div>

        {items.map((it, i) => (
          <motion.div key={it.id ?? `new-${i}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl space-y-3"
            style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))' }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                Item {i + 1}
              </span>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => it.id ? deleteExistingItem(it.id, i) : removeItem(i)}
                  disabled={items.length === 1 && !it.id}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove item">
                  <Trash2 className="w-3.5 h-3.5" style={{ color: 'rgb(var(--status-danger))' }} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Category</label>
                <select
                  disabled={!isDraft}
                  value={it.categoryId}
                  onChange={(e) => setItem(i, { categoryId: e.target.value })}
                  className={inputCx} style={inputStyle}>
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Expense Date</label>
                <input
                  disabled={!isDraft}
                  type="date"
                  value={it.expenseDate}
                  onChange={(e) => setItem(i, { expenseDate: e.target.value })}
                  className={inputCx} style={inputStyle} />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Claimed Amount (₹)</label>
                <input
                  disabled={!isDraft}
                  type="number" min="1" step="0.01"
                  value={it.claimedAmount}
                  onChange={(e) => setItem(i, { claimedAmount: e.target.value })}
                  className={`${inputCx} font-mono`} style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Description</label>
              <input
                disabled={!isDraft}
                value={it.description}
                onChange={(e) => setItem(i, { description: e.target.value })}
                placeholder="e.g. Ola from airport to hotel"
                className={inputCx} style={inputStyle} />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Notes (optional)</label>
              <textarea
                disabled={!isDraft}
                rows={2}
                value={it.notes}
                onChange={(e) => setItem(i, { notes: e.target.value })}
                className={inputCx} style={inputStyle} />
            </div>

            {/* Receipt */}
            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Receipt</label>
              {it.receiptUploadedAt && it.id ? (
                <div className="flex items-center gap-2 p-2 rounded-lg text-xs"
                  style={{ background: 'rgb(var(--status-success)/0.08)', color: 'rgb(var(--status-success))' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="flex-1 truncate">{it.receiptOriginalFilename ?? 'Receipt'}</span>
                  {isDraft && (
                    <label className="cursor-pointer text-xs underline">
                      Replace
                      <input type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f || !it.id) return;
                          setBusy(true);
                          try {
                            const r = await reimbursementApi.uploadReceipt(it.id, f);
                            setItem(i, {
                              receiptOriginalFilename: r.data.data.receiptOriginalFilename,
                              receiptUploadedAt:       r.data.data.receiptUploadedAt,
                            });
                            setSuccess('Receipt replaced.');
                          } catch (err: unknown) {
                            const e2 = err as { response?: { data?: { error?: { message?: string } } } };
                            setError(e2.response?.data?.error?.message ?? 'Upload failed.');
                          } finally { setBusy(false); }
                        }} />
                    </label>
                  )}
                </div>
              ) : (
                <label className={`${inputCx} flex items-center gap-2 cursor-pointer ${isDraft ? '' : 'opacity-50'}`}
                  style={inputStyle}>
                  <FileUp className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
                  <span className="flex-1 text-xs truncate"
                    style={{ color: it.pendingFile ? 'rgb(var(--content-primary))' : 'rgb(var(--content-muted))' }}>
                    {it.pendingFile?.name ?? 'Choose PDF / image (uploads on Save)'}
                  </span>
                  <input
                    disabled={!isDraft}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                    className="hidden"
                    onChange={(e) => setItem(i, { pendingFile: e.target.files?.[0] ?? null })} />
                </label>
              )}
            </div>
          </motion.div>
        ))}

        {isDraft && (
          <button
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-dashed"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--content-secondary))',
              background: 'transparent',
            }}>
            <Plus className="w-3.5 h-3.5" /> Add another item
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs glass"
          style={{ color: 'rgb(var(--status-danger))', background: 'rgb(var(--status-danger)/0.08)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs glass"
          style={{ color: 'rgb(var(--status-success))', background: 'rgb(var(--status-success)/0.08)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {isDraft && (
        <div className="flex items-center gap-2 sticky bottom-2">
          <button
            disabled={busy}
            onClick={() => save({ andSubmit: false })}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
            style={{
              background: 'rgb(var(--surface-elevated))',
              color:      'rgb(var(--content-primary))',
              border:     '1px solid rgb(var(--border))',
            }}>
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            disabled={busy}
            onClick={() => save({ andSubmit: true })}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'rgb(var(--accent))' }}>
            <Send className="w-3.5 h-3.5" />
            {busy ? 'Submitting…' : 'Save & Submit'}
          </button>
        </div>
      )}
    </div>
  );
}
