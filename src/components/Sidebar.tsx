import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, DirectMessage, SystemRole, Letter } from '../types';
import {
  NAV_GROUP_LABELS, getVisibleGroupedNavItems, getEligiblePrimaryActions,
  type NavGroupId, type NavItemDefinition, type NavVisibilityContext
} from '../config/navigationRegistry';
import {
  ChevronDown, MoreHorizontal, UsersRound, PanelRightClose, PanelRightOpen, X,
  Briefcase, MapPinned, ChevronsUpDown
} from 'lucide-react';
import { useFoundationSession } from '../foundation/auth/FoundationSessionContext';

interface SidebarProps {
  activeTab: string;
  onOpenTab: (tabId: string, label?: string) => void;
  currentUser: User | null;
  pendingApprovalCount: number;
  myRequestsCount: number;
  users: User[];
  directMessages: DirectMessage[];
  roles: SystemRole[];
  letters: Letter[];
  onSelectColleague: (userId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const conversationId = (a: string, b: string) => [a, b].sort().join('__');

const expandedGroupsStorageKey = (userId: string) => `shavaz_sidebar_expanded_groups_${userId}`;

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onOpenTab,
  currentUser,
  pendingApprovalCount,
  myRequestsCount,
  users,
  directMessages,
  roles,
  letters,
  onSelectColleague,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const foundation = useFoundationSession();
  const foundationPermissions = foundation.session?.activeContext?.permissions ?? [];
  const activeCompanyId = foundation.session?.activeContext?.company?.id ?? null;
  const visibilityCtx: NavVisibilityContext = {
    currentUser,
    effectivePermissions: [],
    isAdmin: false,
    foundationPermissions,
    activeCompanyId,
  };
  const groupedNavItems = useMemo(() => getVisibleGroupedNavItems(visibilityCtx), [currentUser, foundationPermissions, activeCompanyId]);
  const activeGroup: NavGroupId | undefined = groupedNavItems.find((g) => g.items.some((i) => i.id === activeTab))?.group;

  // باز/بسته بودن هر گروه فقط برای همین کاربر، در localStorage — پیش‌فرض: فقط گروه فعال باز است.
  const [expandedGroups, setExpandedGroups] = useState<Set<NavGroupId>>(() => {
    if (!currentUser) return new Set();
    const saved = localStorage.getItem(expandedGroupsStorageKey(currentUser.id));
    if (saved) {
      try { return new Set(JSON.parse(saved) as NavGroupId[]); } catch { /* ignore malformed */ }
    }
    return activeGroup ? new Set([activeGroup]) : new Set();
  });

  useEffect(() => {
    if (activeGroup) setExpandedGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(expandedGroupsStorageKey(currentUser.id), JSON.stringify(Array.from(expandedGroups)));
  }, [expandedGroups, currentUser]);

  const toggleGroup = (group: NavGroupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  // نشان هر آیتم — فقط از badgeKey رجیستری خوانده می‌شود، عدد/رنگ خودش اینجا محاسبه می‌شود.
  const unreadLettersCount = useMemo(() => {
    if (!currentUser) return 0;
    return letters.filter((l) => l.toUserId === currentUser.id && !l.seenBy.some((s) => s.userId === currentUser.id)).length;
  }, [letters, currentUser]);

  const totalUnreadDMs = useMemo(() => {
    if (!currentUser) return 0;
    return directMessages.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
  }, [directMessages, currentUser]);

  const getBadge = (item: NavItemDefinition): { label: string | number; tone: 'neutral' | 'attention' | 'new' } | null => {
    switch (item.badgeKey) {
      case 'pendingApproval': return pendingApprovalCount > 0 ? { label: pendingApprovalCount, tone: 'attention' } : null;
      case 'myRequests': return myRequestsCount > 0 ? { label: myRequestsCount, tone: 'neutral' } : null;
      case 'unreadLetters': return unreadLettersCount > 0 ? { label: unreadLettersCount, tone: 'attention' } : { label: 'جدید', tone: 'new' };
      case 'unreadDMs': return totalUnreadDMs > 0 ? { label: totalUnreadDMs, tone: 'attention' } : null;
      default: return null;
    }
  };

  // Top 3 most-recently-active colleague conversations, for the quick-access shortcut list
  const recentColleagues = useMemo(() => {
    if (!currentUser) return [];
    return users
      .filter((u) => u.id !== currentUser.id)
      .map((u) => {
        const convId = conversationId(currentUser.id, u.id);
        const convMsgs = directMessages.filter((m) => m.conversationId === convId);
        const lastMsg = convMsgs.slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || '')).pop();
        const unread = convMsgs.filter((m) => m.recipientId === currentUser.id && !m.readAt).length;
        return { user: u, lastMsg, unread };
      })
      .filter((c) => !!c.lastMsg)
      .sort((a, b) => (b.lastMsg?.timestamp || '').localeCompare(a.lastMsg?.timestamp || ''))
      .slice(0, 3);
  }, [users, directMessages, currentUser]);

  // کارت هویت فقط context قابل اعتماد نشست سروری را نمایش می‌دهد و از نقش legacy اختیار نمی‌سازد.
  const identityMeta = useMemo(() => {
    const active = foundation.session?.activeContext;
    if (!active) return null;
    return {
      domainLabel: active.company?.name ?? 'کل مجموعه',
      branchName: active.organizationUnit?.name ?? null,
    };
  }, [foundation.session?.activeContext]);

  const eligiblePrimaryActions = useMemo(() => getEligiblePrimaryActions(visibilityCtx), [currentUser, foundationPermissions, activeCompanyId]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const handleNavigate = (item: NavItemDefinition) => {
    onOpenTab(item.id, item.label);
    if (onCloseMobile) onCloseMobile();
  };

  // Escape بستن Drawer موبایل + Focus روی دکمهٔ بستن هنگام باز شدن (Focus Trap سبک: تمرکز
  // فقط روی خودِ Drawer نگه داشته می‌شود، نه سراسر صفحه).
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isMobileOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseMobile?.(); return; }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const renderNavButton = (item: NavItemDefinition) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const badge = getBadge(item);
    return (
      <button
        key={item.id}
        onClick={() => handleNavigate(item)}
        title={isCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center ${isCollapsed ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-[10px] text-[13px] font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
          isActive
            ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-bold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
        }`}
      >
        <span className={`flex items-center min-w-0 ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
          {!isCollapsed && <span className="truncate">{item.label}</span>}
        </span>
        {!isCollapsed && badge && (
          <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold rounded-full ${
            badge.tone === 'attention' ? 'bg-[var(--danger)] text-white' : badge.tone === 'new' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
          }`}>
            {badge.label}
          </span>
        )}
        {isCollapsed && badge && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--danger)]" />}
      </button>
    );
  };

  const sidebarBody = (
    <>
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--border)]">
        {!isCollapsed && (
          <span className="text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">
            فضای کاری
          </span>
        )}
        <div className={`flex items-center gap-1 ${isCollapsed ? 'w-full justify-center' : ''}`}>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden md:flex p-1.5 rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text-secondary)] transition cursor-pointer"
              title={isCollapsed ? 'باز کردن منو' : 'بستن (جمع کردن) منو'}
              aria-label={isCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
            >
              {isCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          )}
          {onCloseMobile && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg bg-[var(--danger-soft)] text-[var(--danger)] transition cursor-pointer"
              aria-label="بستن منوی ناوبری"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Role-aware Primary Action */}
      {eligiblePrimaryActions.length === 1 && (
        <button
          onClick={() => handleNavigate({ id: eligiblePrimaryActions[0].navId, label: eligiblePrimaryActions[0].label } as NavItemDefinition)}
          title={eligiblePrimaryActions[0].label}
          className={`w-full mb-3 py-2.5 ${isCollapsed ? 'px-2' : 'px-4'} bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-[13px] rounded-xl shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer`}
        >
          {React.createElement(eligiblePrimaryActions[0].icon, { className: 'w-4 h-4 shrink-0' })}
          {!isCollapsed && <span>{eligiblePrimaryActions[0].label}</span>}
        </button>
      )}
      {eligiblePrimaryActions.length > 1 && (
        <div className="relative mb-3">
          <button
            onClick={() => setIsActionMenuOpen((v) => !v)}
            title="ایجاد / اقدام سریع"
            className={`w-full py-2.5 ${isCollapsed ? 'px-2' : 'px-4'} bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-[13px] rounded-xl shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer`}
            aria-haspopup="menu"
            aria-expanded={isActionMenuOpen}
          >
            <ChevronsUpDown className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>ایجاد / اقدام سریع</span>}
          </button>
          {isActionMenuOpen && (
            <div role="menu" className="absolute z-20 mt-1 w-full min-w-[200px] bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
              {eligiblePrimaryActions.map((action) => (
                <button
                  key={action.id}
                  role="menuitem"
                  onClick={() => { setIsActionMenuOpen(false); handleNavigate({ id: action.navId, label: action.label } as NavItemDefinition); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition cursor-pointer text-right"
                >
                  <action.icon className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grouped Navigation */}
      <nav className="space-y-0.5" aria-label="منوی اصلی">
        {groupedNavItems.map(({ group, items }) => {
          const isSingleItemGroup = items.length === 1 && group !== 'sales_crm' && group !== 'finance_treasury';
          const isOpen = expandedGroups.has(group) || isCollapsed;

          if (isCollapsed) {
            return <div key={group} className="space-y-0.5 py-1">{items.map(renderNavButton)}</div>;
          }

          // گروه تک‌آیتمی (مثل «خانه») بدون سرتیتر قابل‌جمع‌شدن رندر می‌شود.
          if (isSingleItemGroup) {
            return <div key={group}>{items.map(renderNavButton)}</div>;
          }

          return (
            <div key={group} className="py-0.5">
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-wide hover:bg-[var(--surface-muted)] transition cursor-pointer"
                aria-expanded={isOpen}
              >
                <span>{NAV_GROUP_LABELS[group]}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-0.5 mt-0.5">
                  {items.map(renderNavButton)}
                  {group === 'communications' && recentColleagues.length > 0 && (
                    <div className="pr-2 mr-2 border-r border-[var(--border)] space-y-0.5 pt-1">
                      {recentColleagues.map(({ user, unread }) => (
                        <button
                          key={user.id}
                          onClick={() => { onSelectColleague(user.id); handleNavigate({ id: 'colleagues', label: 'گفتگوی همکاران' } as NavItemDefinition); }}
                          className="w-full flex items-center justify-between text-right px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                        >
                          <span className="truncate">{user.fullName}</span>
                          {unread > 0 && (
                            <span className="w-4 h-4 shrink-0 rounded-full bg-[var(--danger)] text-white text-[10px] font-black flex items-center justify-center">
                              {unread}
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        onClick={() => { onSelectColleague(''); handleNavigate({ id: 'colleagues', label: 'گفتگوی همکاران' } as NavItemDefinition); }}
                        className="w-full flex items-center gap-1.5 text-right px-3 py-1.5 rounded-lg text-[11px] font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] transition cursor-pointer"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                        همه همکاران
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        ref={drawerRef}
        role={isMobileOpen ? 'dialog' : undefined}
        aria-modal={isMobileOpen ? true : undefined}
        aria-label={isMobileOpen ? 'منوی ناوبری' : undefined}
        className={`
          ${isMobileOpen ? 'fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-xs shadow-2xl' : 'hidden'}
          md:static md:z-auto md:flex md:shrink-0 ${isCollapsed ? 'md:w-[72px]' : 'md:w-[280px]'}
          bg-[var(--surface)] text-[var(--text-primary)] border-l border-[var(--border)]
          flex-col justify-between dir-rtl transition-[width] duration-200 overflow-y-auto
        `}
      >
        <div className="p-3 flex-1">
          {sidebarBody}
        </div>

        {/* Identity Card */}
        {currentUser && (
          <div className="p-3 pt-2 border-t border-[var(--border)]">
            <div className={`p-2.5 bg-[var(--surface-muted)] rounded-xl flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
              <div className="w-8 h-8 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.fullName.slice(0, 1)}
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden min-w-0">
                  <p className="text-[12.5px] font-bold text-[var(--text-primary)] truncate">{currentUser.fullName}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">دسترسی عملیاتی فعال</p>
                  {identityMeta && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                        <Briefcase className="w-2.5 h-2.5" />
                        {identityMeta.domainLabel}
                      </span>
                      {identityMeta.branchName && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-1.5 py-0.5">
                          <MapPinned className="w-2.5 h-2.5" />
                          {identityMeta.branchName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
