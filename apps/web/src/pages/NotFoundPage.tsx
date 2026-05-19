import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldOff, SearchX } from 'lucide-react';

export default function NotFoundPage({ type = 'not-found' }: { type?: 'not-found' | 'unauthorized' }) {
  const navigate = useNavigate();
  const isUnauth = type === 'unauthorized';

  return (
    <div className="min-h-screen flex items-center justify-center p-8"
      style={{ background: 'rgb(var(--surface-primary))' }}>
      <motion.div
        className="flex flex-col items-center gap-6 text-center max-w-sm"
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: isUnauth ? 'rgb(var(--status-danger)/0.1)' : 'rgb(var(--surface-elevated))' }}
          animate={{ rotate: [0, -5, 5, -5, 0] }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {isUnauth
            ? <ShieldOff className="w-9 h-9" style={{ color: 'rgb(var(--status-danger))' }} />
            : <SearchX   className="w-9 h-9" style={{ color: 'rgb(var(--content-muted))' }} />
          }
        </motion.div>

        <div>
          <p className="font-mono text-6xl font-bold mb-3"
            style={{ color: isUnauth ? 'rgb(var(--status-danger))' : 'rgb(var(--accent))' }}>
            {isUnauth ? '403' : '404'}
          </p>
          <h1 className="font-display text-xl font-bold mb-2" style={{ color: 'rgb(var(--content-primary))' }}>
            {isUnauth ? 'Access Denied' : 'Page Not Found'}
          </h1>
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            {isUnauth
              ? "You don't have permission to access this page. Contact your administrator if you believe this is a mistake."
              : "The page you're looking for doesn't exist or has been moved."
            }
          </p>
        </div>

        <motion.button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgb(var(--accent))', color: 'white' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </motion.button>
      </motion.div>
    </div>
  );
}
