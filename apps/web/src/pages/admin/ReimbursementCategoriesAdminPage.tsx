import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Tag, Plus, AlertCircle, CheckCircle2, Pencil, X, EyeOff, Eye, Save,
} from 'lucide-react';
import { reimbursementApi } from '../../lib/api';

interface Category {
  id:          string;
  name:        string;
  description: string | null;
  is_active:   boolean;
  created_at:  string;
  updated_at:  string;
}

const inputCx = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

export default function ReimbursementCategoriesAdminPage() {
  const [rows,    setRows]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Inline edit
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState('');
  const [editDesc,  setEditDesc]  = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await reimbursementApi.listCategories({ includeInactive: true });
      setRows(r.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to load categories.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setError(null); setSuccess(null);
    if (newName.trim().length < 2) { setError('Name must be ≥ 2 characters.'); return; }
    try {
      await reimbursementApi.createCategory({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewName(''); setNewDesc(''); setAdding(false);
      setSuccess('Category added.');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Add failed.');
    }
  }

  async function saveEdit(id: string) {
    setError(null); setSuccess(null);
    try {
      await reimbursementApi.updateCategory(id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      setEditId(null);
      setSuccess('Category updated.');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Update failed.');
    }
  }

  async function toggleActive(c: Category) {
    setError(null); setSuccess(null);
    try {
      await reimbursementApi.updateCategory(c.id, { isActive: !c.is_active });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Update failed.');
    }
  }

  function startEdit(c: Category) {
    setEditId(c.id);
    setEditName(c.name);
    setEditDesc(c.description ?? '');
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Tag className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Reimbursement Categories
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              Pickable categories for items on a reimbursement claim.
            </p>
          </div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'rgb(var(--accent))' }}>
            <Plus className="w-3.5 h-3.5" /> Add Category
          </button>
        )}
      </div>

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

      {/* Add form */}
      {adding && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="glass p-4 rounded-xl space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Parking"
                className={inputCx} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'rgb(var(--content-secondary))' }}>Description (optional)</label>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description"
                className={inputCx} style={inputStyle} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setAdding(false); setNewName(''); setNewDesc(''); }}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
              Cancel
            </button>
            <button onClick={create}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold text-white"
              style={{ background: 'rgb(var(--accent))' }}>
              Add
            </button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c, i) => (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass p-3 rounded-xl"
              style={{ opacity: c.is_active ? 1 : 0.55 }}>
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      className={inputCx} style={inputStyle} />
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                      className={inputCx} style={inputStyle} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
                      Cancel
                    </button>
                    <button onClick={() => saveEdit(c.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5"
                      style={{ background: 'rgb(var(--accent))' }}>
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgb(var(--accent-subtle))' }}>
                    <Tag className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold"
                        style={{ color: 'rgb(var(--content-primary))' }}>
                        {c.name}
                      </span>
                      {!c.is_active && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'rgb(var(--content-muted)/0.15)', color: 'rgb(var(--content-muted))' }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-xs mt-0.5"
                        style={{ color: 'rgb(var(--content-muted))' }}>
                        {c.description}
                      </p>
                    )}
                  </div>
                  <button onClick={() => toggleActive(c)}
                    className="p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]"
                    title={c.is_active ? 'Deactivate' : 'Activate'}>
                    {c.is_active
                      ? <Eye className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-secondary))' }} />
                      : <EyeOff className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-muted))' }} />}
                  </button>
                  <button onClick={() => startEdit(c)}
                    className="p-1.5 rounded-lg hover:bg-[rgb(var(--surface-elevated))]"
                    title="Edit">
                    <Pencil className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-secondary))' }} />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
