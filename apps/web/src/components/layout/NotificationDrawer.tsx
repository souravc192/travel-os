import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, CheckCheck, Plane, DollarSign, AlertTriangle, Clock, ChevronRight } from 'lucide-react';
import { notificationApi } from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

const TYPE_ICONS: Record<string, { icon: typeof Bell; color: string }> = {
  APPROVAL_NEEDED: { icon: CheckCheck,     color: 'var(--status-warning)' },
  TRIP_APPROVED:   { icon: Plane,          color: 'var(--status-success)' },
  TRIP_REJECTED:   { icon: AlertTriangle,  color: 'var(--status-danger)'  },
  BUDGET_ALERT:    { icon: DollarSign,     color: 'var(--status-warning)' },
  PRICE_DROP:      { icon: DollarSign,     color: 'var(--status-success)' },
  SLA_REMINDER:    { icon: Clock,          color: 'var(--status-danger)'  },
  DEFAULT:         { icon: Bell,           color: 'var(--accent)'         },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

export default function NotificationDrawer({ open, onClose, onCountChange }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(false);
  const [markingAll, setMarkingAll]       = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notificationApi.list()
      .then((res) => setNotifications(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const markRead = async (id: string) => {
    await notificationApi.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, isRead: true } : n)
    );
    onCountChange(notifications.filter((n) => !n.isRead && n.id !== id).length);
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    await notificationApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onCountChange(0);
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm flex flex-col border-l"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(24px)',
              borderColor: 'rgb(var(--border))',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 35 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
              style={{ borderColor: 'rgb(var(--border))' }}>
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'rgb(var(--content-primary))' }}>
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: 'rgb(var(--status-danger))' }}>
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={markingAll}
                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: 'rgb(var(--accent-text))', background: 'rgb(var(--accent-subtle))' }}
                  >
                    {markingAll ? 'Marking…' : 'Mark all read'}
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-lg"
                  style={{ background: 'rgb(var(--surface-elevated))' }}>
                  <X className="w-4 h-4" style={{ color: 'rgb(var(--content-muted))' }} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="skeleton h-16 rounded-xl" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgb(var(--surface-elevated))' }}>
                    <Bell className="w-6 h-6" style={{ color: 'rgb(var(--content-muted))' }} />
                  </div>
                  <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
                    You're all caught up
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
                  {notifications.map((notif, i) => {
                    const typeConfig = TYPE_ICONS[notif.type] ?? TYPE_ICONS.DEFAULT;
                    const Icon = typeConfig.icon;
                    return (
                      <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => !notif.isRead && markRead(notif.id)}
                        className="flex gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-white/5"
                        style={{
                          background: notif.isRead ? 'transparent' : 'rgb(var(--accent-subtle))',
                        }}
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `rgb(${typeConfig.color} / 0.12)` }}>
                          <Icon className="w-4 h-4" style={{ color: `rgb(${typeConfig.color})` }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold mb-0.5 truncate"
                            style={{ color: 'rgb(var(--content-primary))' }}>
                            {notif.title}
                          </p>
                          <p className="text-xs leading-relaxed"
                            style={{ color: 'rgb(var(--content-secondary))' }}>
                            {notif.body}
                          </p>
                          <p className="text-[10px] mt-1.5"
                            style={{ color: 'rgb(var(--content-muted))' }}>
                            {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!notif.isRead && (
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                            style={{ background: 'rgb(var(--accent))' }} />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
