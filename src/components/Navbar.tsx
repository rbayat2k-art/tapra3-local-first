import { useState } from 'react';
import { Building2, ChevronDown, LogOut, Menu, Moon, Sun } from 'lucide-react';
import type { SystemNotification, User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  notifications: SystemNotification[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onSearchTrackingCode: (code: string) => void;
  onSelectNotificationRequest: (requestId: string) => void;
  onSelectNotificationColleague: (colleagueId: string) => void;
  onMarkNotificationRead: (id: string) => void;
  activeTab: string;
  onOpenTab: (tabId: string, label?: string) => void;
  onToggleSidebar?: () => void;
}

export function Navbar({
  currentUser,
  theme,
  onToggleTheme,
  onLogout,
  onOpenTab,
  onToggleSidebar,
}: NavbarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm" dir="rtl">
      <div className="flex min-h-16 w-full items-center justify-between gap-2 px-3 py-2 sm:px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              title="باز یا بسته کردن منوی اصلی"
              aria-label="باز یا بسته کردن منوی اصلی"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenTab('dashboard')}
            className="flex min-w-0 items-center gap-2 rounded-xl text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:gap-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-sm">
              <Building2 className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black sm:text-base">سامانه عملیاتی تپرا</span>
              <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:block">مدیریت یکپارچه عملیات سازمان</span>
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            title={theme === 'dark' ? 'تغییر به نمای روشن' : 'تغییر به نمای تیره'}
            aria-label={theme === 'dark' ? 'تغییر به نمای روشن' : 'تغییر به نمای تیره'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-[var(--warning)]" /> : <Moon className="h-5 w-5 text-[var(--primary)]" />}
          </button>

          {currentUser && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((value) => !value)}
                className="flex h-10 max-w-[150px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 sm:max-w-[240px] sm:px-2.5"
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-xs font-bold text-white">{currentUser.fullName.slice(0, 1)}</span>
                <span className="hidden min-w-0 truncate text-xs font-bold sm:block">{currentUser.fullName}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </button>

              {showUserMenu && (
                <div role="menu" className="absolute left-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 text-right shadow-2xl">
                  <div className="mb-1 border-b border-[var(--border)] p-2">
                    <p className="truncate text-xs font-bold text-[var(--text-primary)]">{currentUser.fullName}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">کاربر سامانه</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  >
                    <LogOut className="h-4 w-4" /> خروج از حساب
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
