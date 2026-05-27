import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, ChevronRight, Settings, AlertCircle, FileText,
} from 'lucide-react';
import { policyApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '@travel-os/shared-types';

interface Policy {
  id: string;
  category: string;
  title: string;
  description: string | null;
  isActive: boolean;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  publishedAt: string | null;
  versionCount: number;
}

export default function PolicyListPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading,  setLoading]  = useState(true);

  const canManage =
    user?.role === UserRole.ADMIN || user?.role === UserRole.OWNER;

  useEffect(() => {
    policyApi.list()
      .then((r) => setPolicies(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  // Group by category
  const byCat = policies.reduce<Record<string, Policy[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <BookOpen className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Policy Knowledge Base
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              Travel policies — readable, navigable, searchable.
            </p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => navigate('/admin/policies')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={{
              background: 'rgb(var(--surface-elevated))',
              color: 'rgb(var(--content-secondary))',
            }}>
            <Settings className="w-3.5 h-3.5" /> Manage Policies
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : policies.length === 0 ? (
        <div className="glass p-10 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            No policies published yet.{canManage && ' Click "Manage Policies" to upload one.'}
          </p>
        </div>
      ) : (
        Object.entries(byCat).map(([category, items]) => (
          <section key={category} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider font-semibold"
              style={{ color: 'rgb(var(--content-muted))' }}>{category}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {items.map((p, i) => (
                <motion.button key={p.id}
                  onClick={() => navigate(`/policy/${p.id}`)}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -2 }}
                  className="glass p-4 text-left">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgb(var(--accent-subtle))' }}>
                      <FileText className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                    </div>
                    {p.publishedVersionNumber !== null && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: 'rgb(var(--status-success)/0.12)',
                          color: 'rgb(var(--status-success))',
                        }}>
                        v{p.publishedVersionNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold"
                    style={{ color: 'rgb(var(--content-primary))' }}>{p.title}</p>
                  {p.description && (
                    <p className="text-xs mt-1 line-clamp-2"
                      style={{ color: 'rgb(var(--content-secondary))' }}>{p.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[10px]" style={{ color: 'rgb(var(--content-muted))' }}>
                      {p.publishedAt
                        ? `Updated ${new Date(p.publishedAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}`
                        : 'No version published yet'}
                    </p>
                    <ChevronRight className="w-3.5 h-3.5"
                      style={{ color: 'rgb(var(--content-muted))' }} />
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
