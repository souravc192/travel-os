import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Users, ArrowUpRight,
} from 'lucide-react';
import { memberApi } from '../../lib/api';

interface ImportResult {
  totalRows: number;
  inserted: number;
  updated:  number;
  skipped:  number;
  departments: number;
  errors:   Array<{ row: number; reason: string }>;
}

export default function MembersAdminPage() {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pick(f: File | null) {
    setResult(null); setError(null);
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      setError('Only .xlsx files are accepted.');
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await memberApi.import(file);
      setResult(res.data.data);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(apiErr.response?.data?.error?.message ?? 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Users className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Members Master
            </h1>
            <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
              Upload the Active Employee Excel — autofills the travel form.
            </p>
          </div>
        </div>
      </div>

      <motion.div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e)  => { e.preventDefault(); setDragging(true); }}
        onDragLeave={()  => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="glass p-10 border-2 border-dashed rounded-2xl transition-colors"
        style={{
          borderColor: dragging
            ? 'rgb(var(--accent))'
            : 'rgb(var(--border-subtle))',
          background: dragging ? 'rgb(var(--accent-subtle))' : undefined,
        }}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgb(var(--surface-elevated))' }}>
            <FileSpreadsheet className="w-6 h-6" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <h2 className="font-display text-lg font-semibold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            {file ? file.name : 'Drop your .xlsx here'}
          </h2>
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
            We'll upsert by <span className="font-mono">Employee Id</span> — re-uploads are safe.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: 'rgb(var(--surface-elevated))',
                color: 'rgb(var(--content-secondary))',
              }}>
              Browse files
            </button>
            <button
              type="button"
              disabled={!file || busy}
              onClick={upload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: 'rgb(var(--accent))' }}>
              <Upload className="w-3.5 h-3.5" />
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{
              background: 'rgb(var(--status-danger)/0.08)',
              color: 'rgb(var(--status-danger))',
            }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </motion.div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="glass p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" style={{ color: 'rgb(var(--status-success))' }} />
              <h3 className="font-display text-base font-bold"
                style={{ color: 'rgb(var(--content-primary))' }}>
                Import complete
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: 'Total Rows',  value: result.totalRows,   color: 'var(--accent)' },
                { label: 'Inserted',    value: result.inserted,    color: 'var(--status-success)' },
                { label: 'Updated',     value: result.updated,     color: 'var(--status-info)' },
                { label: 'Skipped',     value: result.skipped,     color: 'var(--status-warning)' },
                { label: 'Departments', value: result.departments, color: 'var(--accent)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 rounded-xl"
                  style={{ background: 'rgb(var(--surface-elevated))' }}>
                  <p className="font-mono font-bold text-lg" style={{ color: `rgb(${color})` }}>
                    {value.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide"
                    style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <details className="rounded-xl p-3" style={{ background: 'rgb(var(--surface-elevated))' }}>
                <summary className="text-xs font-semibold cursor-pointer"
                  style={{ color: 'rgb(var(--status-warning))' }}>
                  Skipped rows ({result.errors.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-[11px] font-mono"
                      style={{ color: 'rgb(var(--content-secondary))' }}>
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-[11px] inline-flex items-center gap-1"
              style={{ color: 'rgb(var(--content-muted))' }}>
              <ArrowUpRight className="w-3 h-3" />
              Department budgets are auto-seeded at ₹24L per FY for any new departments.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
