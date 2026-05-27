import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Eye, BookOpen, Trash2, ChevronDown, X, Save,
} from 'lucide-react';
import { policyApi } from '../../lib/api';
import type { PolicyNode } from '../policy/PolicyDetailPage';

interface Policy {
  id: string;
  category: string;
  title: string;
  description: string | null;
  isActive: boolean;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  versionCount: number;
}

interface Version {
  id: string;
  policyId: string;
  versionNumber: number;
  sourceFilename: string;
  isPublished: boolean;
  uploadedAt: string;
  publishedAt: string | null;
  uploadedByEmail: string | null;
  parsedTree?: { tree: PolicyNode[]; fallback: boolean; meta: { headingCount: number; pages: number } };
}

const inputCx = "w-full px-3 py-2.5 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

// ─── Card preview component ──────────────────────────────────
function PreviewCard({ node, depth = 0 }: { node: PolicyNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: depth === 0 ? 'rgb(var(--surface-elevated))' : 'rgb(var(--surface-base))',
        border: '1px solid rgb(var(--border-subtle))',
        marginLeft: depth > 0 ? `${depth * 12}px` : undefined,
      }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="text-xs font-semibold"
          style={{ color: 'rgb(var(--content-primary))' }}>{node.heading}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="w-3.5 h-3.5"
            style={{ color: 'rgb(var(--content-muted))' }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}>
            <div className="px-3 pb-3 space-y-2">
              {node.body && (
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed"
                  style={{ color: 'rgb(var(--content-secondary))' }}>
                  {node.body}
                </p>
              )}
              {node.children.map((c) => <PreviewCard key={c.id} node={c} depth={depth + 1} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Create policy modal ─────────────────────────────────────
function CreatePolicyModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [category, setCategory]    = useState('');
  const [title,    setTitle]       = useState('');
  const [desc,     setDesc]        = useState('');
  const [busy,     setBusy]        = useState(false);
  const [error,    setError]       = useState<string | null>(null);

  async function save() {
    if (!category.trim() || !title.trim()) {
      setError('Category and title are required.'); return;
    }
    setBusy(true); setError(null);
    try {
      await policyApi.create({ category: category.trim(), title: title.trim(),
                                description: desc.trim() || undefined });
      setCategory(''); setTitle(''); setDesc('');
      onCreated();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Create failed.');
    } finally { setBusy(false); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={onClose} />
          <motion.div className="glass relative w-full max-w-md p-6 rounded-2xl"
            initial={{ y: 20, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.96 }}>
            <button onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]">
              <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
            </button>
            <h2 className="font-display text-lg font-bold mb-4"
              style={{ color: 'rgb(var(--content-primary))' }}>Create Policy</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Category</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Flight Policy, Hotel Policy"
                  className={inputCx} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Domestic Flights — All Grades"
                  className={inputCx} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs block mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}>Description (optional)</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
                  className={inputCx} style={inputStyle} />
              </div>
              {error && (
                <p className="text-xs" style={{ color: 'rgb(var(--status-danger))' }}>{error}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: 'rgb(var(--surface-elevated))',
                    color: 'rgb(var(--content-secondary))',
                  }}>Cancel</button>
                <button onClick={save} disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'rgb(var(--accent))' }}>
                  {busy ? 'Saving…' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Per-policy detail panel (versions list + upload preview) ──
function PolicyDetailPanel({ policy, onChanged }: {
  policy: Policy; onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview,  setPreview]  = useState<Version | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [msg,      setMsg]      = useState<string | null>(null);

  async function loadVersions() {
    const r = await policyApi.listVersions(policy.id);
    setVersions(r.data.data);
  }
  useEffect(() => { loadVersions(); }, [policy.id]); // eslint-disable-line

  async function onUpload(file: File) {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await policyApi.uploadVersion(policy.id, file);
      setMsg(r.data.message);
      // Pull the full version (with parsedTree) for preview
      const full = await policyApi.getVersion(r.data.data.id);
      setPreview(full.data.data);
      await loadVersions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Upload failed.');
    } finally { setBusy(false); }
  }

  async function publish(versionId: string) {
    setBusy(true); setError(null);
    try {
      await policyApi.publishVersion(versionId);
      setPreview(null);
      await loadVersions();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Publish failed.');
    } finally { setBusy(false); }
  }

  async function remove(versionId: string) {
    if (!window.confirm('Delete this version? The PDF will be removed from disk.')) return;
    setBusy(true);
    try {
      await policyApi.deleteVersion(versionId);
      await loadVersions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      alert(e.response?.data?.error?.message ?? 'Delete failed.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
          Upload a new PDF version. We'll parse it, show you a preview, and only
          publish once you say so.
        </p>
        <label className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer text-white inline-flex items-center gap-1.5"
          style={{ background: 'rgb(var(--accent))' }}>
          <Upload className="w-3.5 h-3.5" />
          {busy ? 'Uploading…' : 'Upload New Version'}
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              if (fileRef.current) fileRef.current.value = '';
            }} />
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
          style={{
            background: 'rgb(var(--status-danger)/0.08)',
            color: 'rgb(var(--status-danger))',
          }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {msg && !preview && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
          style={{
            background: 'rgb(var(--status-success)/0.08)',
            color: 'rgb(var(--status-success))',
          }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> {msg}
        </div>
      )}

      {preview && preview.parsedTree && (
        <div className="glass p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-semibold inline-flex items-center gap-1.5"
                style={{ color: 'rgb(var(--content-primary))' }}>
                <Eye className="w-4 h-4" /> Preview · v{preview.versionNumber}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                {preview.parsedTree.fallback
                  ? 'No numbered headings detected — rendered as a single card.'
                  : `Parsed ${preview.parsedTree.meta.headingCount} sections across ${preview.parsedTree.meta.pages} pages.`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  color: 'rgb(var(--content-secondary))',
                }}>
                Dismiss
              </button>
              <button onClick={() => publish(preview.id)} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white inline-flex items-center gap-1 disabled:opacity-60"
                style={{ background: 'rgb(var(--status-success))' }}>
                <Save className="w-3 h-3" /> Publish this version
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto p-1">
            {preview.parsedTree.tree.map((n) => <PreviewCard key={n.id} node={n} />)}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs uppercase tracking-wider mb-2 font-semibold"
          style={{ color: 'rgb(var(--content-muted))' }}>
          Versions ({versions.length})
        </h3>
        {versions.length === 0 ? (
          <p className="text-xs text-center py-4"
            style={{ color: 'rgb(var(--content-muted))' }}>
            No versions uploaded yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-semibold"
                      style={{ color: 'rgb(var(--content-primary))' }}>v{v.versionNumber}</span>
                    {v.isPublished && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: 'rgb(var(--status-success)/0.12)',
                          color: 'rgb(var(--status-success))',
                        }}>
                        Published
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    {v.sourceFilename}
                  </p>
                  <p className="text-[10px] mt-0.5"
                    style={{ color: 'rgb(var(--content-muted))' }}>
                    Uploaded {new Date(v.uploadedAt).toLocaleString('en-IN',
                      { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {v.uploadedByEmail && ` · ${v.uploadedByEmail}`}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <a href={`/api/v1/policies/versions/${v.id}/pdf`} target="_blank" rel="noreferrer"
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold"
                    style={{
                      background: 'rgb(var(--surface-base))',
                      color: 'rgb(var(--content-secondary))',
                    }}>
                    PDF
                  </a>
                  {!v.isPublished && (
                    <>
                      <button onClick={async () => {
                          const r = await policyApi.getVersion(v.id);
                          setPreview(r.data.data);
                        }}
                        className="px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1"
                        style={{
                          background: 'rgb(var(--accent-subtle))',
                          color: 'rgb(var(--accent-text))',
                        }}>
                        <Eye className="w-3 h-3" /> Preview
                      </button>
                      <button onClick={() => publish(v.id)} disabled={busy}
                        className="px-2 py-1 rounded-lg text-[10px] font-semibold text-white"
                        style={{ background: 'rgb(var(--status-success))' }}>
                        Publish
                      </button>
                      <button onClick={() => remove(v.id)} disabled={busy}
                        className="px-2 py-1 rounded-lg text-[10px] font-semibold"
                        style={{
                          background: 'rgb(var(--status-danger)/0.12)',
                          color: 'rgb(var(--status-danger))',
                        }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function PolicyAdminPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await policyApi.list();
      setPolicies(r.data.data);
      if (selected) {
        const fresh = r.data.data.find((p: Policy) => p.id === selected.id);
        setSelected(fresh ?? null);
      }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Manage Policies
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              Upload PDFs · preview the parsed cards · publish when satisfied.
            </p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'rgb(var(--accent))' }}>
          <Plus className="w-3.5 h-3.5" /> New Policy
        </button>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        {/* ── List of policies ───────────────────────── */}
        <div className="glass p-3 space-y-1 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          ) : policies.length === 0 ? (
            <p className="text-xs text-center py-6"
              style={{ color: 'rgb(var(--content-muted))' }}>
              No policies yet.
            </p>
          ) : (
            policies.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)}
                className="w-full text-left p-2.5 rounded-lg"
                style={{
                  background: selected?.id === p.id
                    ? 'rgb(var(--accent-subtle))'
                    : 'transparent',
                  border: '1px solid ' + (selected?.id === p.id
                    ? 'rgb(var(--accent))' : 'transparent'),
                }}>
                <p className="text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--content-muted))' }}>{p.category}</p>
                <p className="text-xs font-semibold mt-0.5"
                  style={{ color: 'rgb(var(--content-primary))' }}>{p.title}</p>
                <p className="text-[10px] mt-1 font-mono"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  {p.publishedVersionNumber !== null
                    ? `v${p.publishedVersionNumber} live`
                    : 'No version published'}
                  {' · '}
                  {p.versionCount} total
                </p>
              </button>
            ))
          )}
        </div>

        {/* ── Detail panel ───────────────────────────── */}
        <div>
          {selected ? (
            <div className="glass p-5 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--content-muted))' }}>{selected.category}</p>
                <h2 className="font-display text-lg font-bold"
                  style={{ color: 'rgb(var(--content-primary))' }}>{selected.title}</h2>
                {selected.description && (
                  <p className="text-xs mt-1"
                    style={{ color: 'rgb(var(--content-secondary))' }}>{selected.description}</p>
                )}
              </div>
              <PolicyDetailPanel policy={selected} onChanged={load} />
            </div>
          ) : (
            <div className="glass p-10 text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3"
                style={{ color: 'rgb(var(--content-muted))' }} />
              <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
                Select a policy on the left, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      <CreatePolicyModal open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); }} />
    </div>
  );
}
