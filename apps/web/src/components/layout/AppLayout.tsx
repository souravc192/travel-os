import { useState, useEffect } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Plane, CheckSquare, Building2, Receipt,
  BarChart3, Users, Settings, Bell, Search, LogOut, ChevronRight,
  Wallet, MapPin, Package, Menu, X, Sparkles, Moon, Sun, BookOpen, Tag,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { UserRole, AppTheme } from '@travel-os/shared-types';
import { authApi, notificationApi } from '../../lib/api';
import NotificationDrawer from './NotificationDrawer';
import CommandPalette from '../ui/CommandPalette';
import ThemeSwitcher from '../ui/ThemeSwitcher';

// ─── Nav items per role (Phase 3 — 5-role model) ──────────────
function getNavItems(role: UserRole) {
  const all = [
    { path: '/dashboard',       label: 'Dashboard',     icon: LayoutDashboard, roles: ['ALL'] },
    { path: '/travel/new',      label: 'New Request',   icon: Plane,           roles: ['ALL'] },
    { path: '/travel/requests', label: 'My Requests',   icon: MapPin,          roles: ['ALL'] },
    { path: '/approvals',       label: 'Approvals',     icon: CheckSquare,     roles: [UserRole.HOD, UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER] },
    { path: '/bookings',        label: 'Bookings',      icon: Package,         roles: [UserRole.TRAVEL_TEAM, UserRole.OWNER, UserRole.ADMIN] },
    { path: '/reimbursements',  label: 'Reimbursements', icon: Receipt,        roles: ['ALL'] },
    { path: '/vendors',         label: 'Vendors',       icon: Building2,       roles: [UserRole.TRAVEL_TEAM, UserRole.OWNER, UserRole.ADMIN] },
    { path: '/invoices',        label: 'Invoices',      icon: Receipt,         roles: [UserRole.ADMIN, UserRole.OWNER] },
    { path: '/budget',          label: 'Budget',        icon: Wallet,          roles: ['ALL'] },
    { path: '/policy',          label: 'Policy',        icon: BookOpen,        roles: ['ALL'] },
    { path: '/analytics',       label: 'Analytics',     icon: BarChart3,       roles: [UserRole.ADMIN, UserRole.OWNER, UserRole.TRAVEL_TEAM] },
    { path: '/admin/members',   label: 'Members',       icon: Users,           roles: [UserRole.ADMIN, UserRole.OWNER] },
    { path: '/admin/policies',  label: 'Manage Policy', icon: BookOpen,        roles: [UserRole.ADMIN, UserRole.OWNER] },
    { path: '/admin/reimbursement-categories', label: 'Reimburse Categories', icon: Tag, roles: [UserRole.ADMIN, UserRole.OWNER] },
    { path: '/users',           label: 'Users',         icon: Users,           roles: [UserRole.OWNER] },
    { path: '/settings',        label: 'Settings',      icon: Settings,        roles: [UserRole.OWNER] },
  ];
  return all.filter(item => item.roles.includes('ALL') || item.roles.includes(role));
}

// ─── Role badge ───────────────────────────────────────────────
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]:       'Owner',
  [UserRole.ADMIN]:       'Admin',
  [UserRole.TRAVEL_TEAM]: 'Travel Team',
  [UserRole.HOD]:         'HOD',
  [UserRole.USER]:        'User',
};

export default function AppLayout() {
  const { user, employee, clearAuth }   = useAuthStore();
  const navigate                         = useNavigate();
  const location                         = useLocation();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [notifOpen, setNotifOpen]       = useState(false);
  const [cmdOpen, setCmdOpen]           = useState(false);
  const [themeOpen, setThemeOpen]       = useState(false);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [loggingOut, setLoggingOut]     = useState(false);

  const navItems = user ? getNavItems(user.role) : [];

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
      if (e.key === '?' && !e.target) setCmdOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await notificationApi.count();
        setUnreadCount(res.data.data.unread);
      } catch { /* silent */ }
    };
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      navigate('/login', { replace: true });
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgb(var(--accent))' }}>
          <Plane className="w-4 h-4 text-white" fill="currentColor" />
        </div>
        <div>
          <p className="font-display font-bold text-sm leading-tight" style={{ color: 'rgb(var(--content-primary))' }}>Travel OS</p>
          <p className="text-[10px]" style={{ color: 'rgb(var(--content-muted))' }}>Enterprise Edition</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: 'rgb(var(--accent))' }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-2 border-t space-y-1" style={{ borderColor: 'rgb(var(--border))' }}>
        {/* Theme + keyboard shortcut hints */}
        <button
          onClick={() => setThemeOpen(true)}
          className="nav-item w-full"
        >
          <Sparkles className="w-4 h-4" />
          <span className="flex-1">Theme</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-muted))' }}>
            T
          </span>
        </button>

        {/* User card */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mt-2"
          style={{ background: 'rgb(var(--surface-elevated))' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
            {employee?.name?.[0] ?? user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'rgb(var(--content-primary))' }}>
              {employee?.name ?? user?.email}
            </p>
            <p className="text-[10px]" style={{ color: 'rgb(var(--content-muted))' }}>
              {user ? ROLE_LABELS[user.role] : ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
            title="Sign out"
          >
            {loggingOut
              ? <motion.div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />
              : <LogOut className="w-3.5 h-3.5" style={{ color: 'rgb(var(--status-danger))' }} />
            }
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'rgb(var(--surface-primary))' }}>

      {/* ── Desktop Sidebar ─────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r h-full"
        style={{
          background: 'var(--sidebar-bg)',
          borderColor: 'rgb(var(--border))',
          backdropFilter: 'blur(20px)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile Sidebar Overlay ───────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r lg:hidden"
              style={{ background: 'var(--sidebar-bg)', borderColor: 'rgb(var(--border))', backdropFilter: 'blur(20px)' }}
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 lg:px-6 py-3 border-b flex-shrink-0"
          style={{
            background: 'var(--glass-bg)',
            borderColor: 'rgb(var(--border))',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Left: hamburger + breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg"
              style={{ background: 'rgb(var(--surface-elevated))' }}
            >
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
              <MapPin className="w-3.5 h-3.5" />
              <span className="capitalize">
                {location.pathname.replace('/', '').replace('-', ' ') || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Right: search, notif, theme */}
          <div className="flex items-center gap-2">
            {/* Command palette trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{
                background: 'rgb(var(--surface-elevated))',
                border: '1px solid rgb(var(--border))',
                color: 'rgb(var(--content-muted))',
              }}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{ background: 'rgb(var(--surface-overlay))', color: 'rgb(var(--content-muted))' }}>
                ⌘K
              </kbd>
            </button>

            {/* Notifications */}
            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg transition-colors"
              style={{ background: 'rgb(var(--surface-elevated))' }}
            >
              <Bell className="w-4 h-4" style={{ color: 'rgb(var(--content-secondary))' }} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: 'rgb(var(--status-danger))' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            className="page-enter h-full"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* ── Overlays ─────────────────────────────────────── */}
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)}
        onCountChange={setUnreadCount} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} navItems={navItems} />
      <ThemeSwitcher open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  );
}
