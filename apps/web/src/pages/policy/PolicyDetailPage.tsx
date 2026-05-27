import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronDown, History, FileText, Search,
  BookOpen, AlertTriangle, Calendar,
} from 'lucide-react';
import { policyApi } from '../../lib/api';

export interface PolicyNode {
  id:       string;
  heading:  string;
  level:    number;
  body:     string;
  children: PolicyNode[];
}

interface Detail {
  policy: {
    id: string;
    category: string;
    title: string;
    description: string | null;
    publishedVersionId: string | null;
    publishedAt: string | null;
  };
  publishedVersion: {
    id: string;
    versionNumber: number;
    sourceFilename: string;
    parsedTree: { tree: PolicyNode[]; fallback: boolean; meta: { headingCount: number; pages: number } };
    uploadedByEmail: string | null;
    publishedAt: string | null;
  } | null;
}

interface VersionRow {
  id: string;
  versionNumber: number;
  sourceFilename: string;
  isPublished: boolean;
  uploadedAt: string;
  publishedAt: string | null;
  uploadedByEmail: string | null;
}

// ─── Recursive card ───────────────────────────────────────────
function Card({ node, query, defaultOpen, depth = 0 }: {
  node: PolicyNode;
  query: string;
  defaultOpen: boolean;
  depth?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children.length > 0;
  const matchesQuery = !query ||
    node.heading.toLowerCase().includes(query.toLowerCase()) ||
    node.body.toLowerCase().includes(query.toLowerCase()) ||
    node.children.some((c) => matchesNode(c, query));

  if (!matchesQuery) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: depth === 0
          ? 'rgb(var(--surface-elevated))'
          : 'rgb(var(--surface-base))',
        border: '1px solid rgb(var(--border-subtle))',
        marginLeft: depth > 0 ? `${depth * 16}px` : undefined,
      }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left">
        <span className="text-sm font-semibold"
          style={{ color: 'rgb(var(--content-primary))' }}>
          {highlight(node.heading, query)}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="w-4 h-4 flex-shrink-0"
            style={{ color: 'rgb(var(--content-muted))' }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-4 space-y-3">
              {node.body && (
                <p className="text-xs whitespace-pre-wrap leading-relaxed"
                  style={{ color: 'rgb(var(--content-secondary))' }}>
                  {highlight(node.body, query)}
                </p>
              )}
              {hasChildren && (
                <div className="space-y-2">
                  {node.children.map((c) => (
                    <Card key={c.id} node={c} query={query}
                      defaultOpen={Boolean(query)} depth={depth + 1} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function matchesNode(n: PolicyNode, q: string): boolean {
  return n.heading.toLowerCase().includes(q.toLowerCase()) ||
         n.body.toLowerCase().includes(q.toLowerCase()) ||
         n.children.some((c) => matchesNode(c, q));
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{
        background: 'rgb(var(--accent)/0.25)',
        color: 'inherit',
        borderRadius: 2,
      }}>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function PolicyDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const [data,     setData]     = useState<Detail | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [showVer,  setShowVer]  = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([policyApi.get(id), policyApi.listVersions(id)])
      .then(([p, v]) => { setData(p.data.data); setVersions(v.data.data); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-6 max-w-3xl mx-auto space-y-3">
      <div className="skeleton h-12 rounded-xl" />
      <div className="skeleton h-20 rounded-xl" />
      <div className="skeleton h-20 rounded-xl" />
    </div>;
  }
  if (!data) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3"
          style={{ color: 'rgb(var(--status-danger))' }} />
        <p className="text-sm">Policy not found.</p>
        <button onClick={() => navigate(-1)}
          className="mt-3 text-xs underline" style={{ color: 'rgb(var(--accent))' }}>
          Go back
        </button>
      </div>
    );
  }

  const v = data.publishedVersion;
  const oldVersions = versions.filter((x) => !x.isPublished);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <button onClick={() => navigate('/policy')}
        className="flex items-center gap-1.5 text-xs"
        style={{ color: 'rgb(var(--content-muted))' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> All policies
      </button>

      <motion.div className="glass p-5"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: 'rgb(var(--content-muted))' }}>{data.policy.category}</p>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              {data.policy.title}
            </h1>
            {data.policy.description && (
              <p className="text-sm mt-1"
                style={{ color: 'rgb(var(--content-secondary))' }}>
                {data.policy.description}
              </p>
            )}
          </div>
          {v && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider"
                style={{ color: 'rgb(var(--content-muted))' }}>Current</p>
              <p className="text-xs font-mono font-semibold"
                style={{ color: 'rgb(var(--status-success))' }}>
                v{v.versionNumber}
              </p>
              {v.publishedAt && (
                <p className="text-[10px] mt-0.5 inline-flex items-center gap-1"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  <Calendar className="w-3 h-3" />
                  {new Date(v.publishedAt).toLocaleDateString('en-IN',
                    { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {v ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'rgb(var(--content-muted))' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search within this policy…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'rgb(var(--surface-elevated))',
                border: '1px solid rgb(var(--border-subtle))',
                color: 'rgb(var(--content-primary))',
              }} />
          </div>

          {v.parsedTree.fallback && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{
                background: 'rgb(var(--status-warning)/0.1)',
                color: 'rgb(var(--status-warning))',
              }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              No numbered sections were detected — rendering the document as a single card.
            </div>
          )}

          <div className="space-y-2">
            {v.parsedTree.tree.map((n) => (
              <Card key={n.id} node={n} query={query} defaultOpen={Boolean(query)} />
            ))}
          </div>

          <a href={`/api/v1/policies/versions/${v.id}/pdf`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: 'rgb(var(--content-muted))' }}>
            <FileText className="w-3.5 h-3.5" />
            Source PDF · {v.sourceFilename}
          </a>
        </>
      ) : (
        <div className="glass p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            No published version yet.
          </p>
        </div>
      )}

      {oldVersions.length > 0 && (
        <div className="glass p-5">
          <button onClick={() => setShowVer((o) => !o)}
            className="w-full flex items-center justify-between">
            <span className="text-sm font-semibold inline-flex items-center gap-2"
              style={{ color: 'rgb(var(--content-primary))' }}>
              <History className="w-4 h-4"
                style={{ color: 'rgb(var(--content-muted))' }} />
              Previous Versions ({oldVersions.length})
            </span>
            <motion.div animate={{ rotate: showVer ? 180 : 0 }}>
              <ChevronDown className="w-4 h-4"
                style={{ color: 'rgb(var(--content-muted))' }} />
            </motion.div>
          </button>
          <AnimatePresence initial={false}>
            {showVer && (
              <motion.div initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}>
                <ul className="mt-3 space-y-1.5">
                  {oldVersions.map((ov) => (
                    <li key={ov.id}
                      className="flex items-center justify-between p-2 rounded-lg text-xs"
                      style={{ background: 'rgb(var(--surface-elevated))' }}>
                      <span style={{ color: 'rgb(var(--content-primary))' }}>
                        v{ov.versionNumber} · {ov.sourceFilename}
                      </span>
                      <a href={`/api/v1/policies/versions/${ov.id}/pdf`}
                        target="_blank" rel="noreferrer"
                        className="text-[11px] underline"
                        style={{ color: 'rgb(var(--accent))' }}>
                        Open PDF
                      </a>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
