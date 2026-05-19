import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { AppTheme } from '@travel-os/shared-types';
import { authApi } from '../../lib/api';

const THEMES: { id: AppTheme; label: string; description: string; preview: string[] }[] = [
  {
    id: AppTheme.DEEP_SPACE_DARK,
    label: 'Deep Space Dark',
    description: 'Dark indigo · Default',
    preview: ['#0A0B14', '#6366F1', '#161828', '#818CF8'],
  },
  {
    id: AppTheme.CORPORATE_LIGHT,
    label: 'Corporate Light',
    description: 'Professional · Clean',
    preview: ['#F8F9FC', '#2563EB', '#FFFFFF', '#93C5FD'],
  },
  {
    id: AppTheme.FOREST_PROFESSIONAL,
    label: 'Forest Professional',
    description: 'Dark green · Focused',
    preview: ['#08100C', '#34D399', '#12201A', '#6EE7B7'],
  },
  {
    id: AppTheme.SUNSET_WARM,
    label: 'Sunset Warm',
    description: 'Dark amber · Bold',
    preview: ['#120A05', '#F97316', '#241408', '#FED7AA'],
  },
  {
    id: AppTheme.ARCTIC_BLUE,
    label: 'Arctic Blue',
    description: 'Light sky · Crisp',
    preview: ['#F0F9FF', '#0EA5E9', '#FFFFFF', '#7DD3FC'],
  },
];

interface Props { open: boolean; onClose: () => void; }

export default function ThemeSwitcher({ open, onClose }: Props) {
  const { user, setAuth, employee, accessToken } = useAuthStore();
  const activeTheme = user?.theme ?? AppTheme.DEEP_SPACE_DARK;

  const applyTheme = async (theme: AppTheme) => {
    // Apply immediately to DOM
    document.documentElement.setAttribute('data-theme', theme);

    // Persist to server
    try {
      await authApi.updateTheme(theme);
      // Update store
      if (user && accessToken) {
        useAuthStore.getState().setAuth({
          accessToken,
          user: { ...user, theme },
          employee,
          requiresOnboarding: false,
        });
      }
    } catch { /* silent — DOM already updated */ }
    onClose();
  };

  // Apply stored theme on mount
  if (user?.theme) {
    document.documentElement.setAttribute('data-theme', user.theme);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'rgb(var(--surface-elevated))',
              border: '1px solid rgb(var(--border-strong))',
            }}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-base" style={{ color: 'rgb(var(--content-primary))' }}>
                Choose Theme
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-lg"
                style={{ background: 'rgb(var(--surface-overlay))' }}>
                <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
              </button>
            </div>

            <div className="space-y-3">
              {THEMES.map((theme) => (
                <motion.button
                  key={theme.id}
                  onClick={() => applyTheme(theme.id)}
                  className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all"
                  style={{
                    background: activeTheme === theme.id
                      ? 'rgb(var(--accent-subtle))'
                      : 'rgb(var(--surface-overlay))',
                    border: activeTheme === theme.id
                      ? '1.5px solid rgb(var(--accent) / 0.4)'
                      : '1.5px solid transparent',
                  }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Color swatches */}
                  <div className="flex gap-1 flex-shrink-0">
                    {theme.preview.map((color, i) => (
                      <div
                        key={i}
                        className="w-5 h-8 rounded-md"
                        style={{ background: color, opacity: i === 3 ? 0.6 : 1 }}
                      />
                    ))}
                  </div>

                  {/* Labels */}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                      {theme.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                      {theme.description}
                    </p>
                  </div>

                  {/* Active indicator */}
                  {activeTheme === theme.id && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgb(var(--accent))' }}>
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
