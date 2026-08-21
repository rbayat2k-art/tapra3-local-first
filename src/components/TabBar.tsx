import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NAV_ITEMS, NAV_ITEM_BY_ID } from '../config/navigationRegistry';
import { LayoutDashboard, X, ChevronDown, MoreHorizontal } from 'lucide-react';

export interface OpenTab {
  id: string;
  label: string;
}

// Icon/label برای هر تب اکنون فقط از Navigation Registry خوانده می‌شود (بند ۷ مأموریت
// بازطراحی UI) — TAB_DEFINITIONS مستقل قدیمی حذف شد؛ App.tsx's openTab() هم برای فالبک لیبل به
// همین Registry مراجعه می‌کند (adapter پایین همین فایل).
export function resolveTabMeta(tabId: string): { label: string; icon: typeof LayoutDashboard } {
  const item = NAV_ITEM_BY_ID[tabId];
  return { label: item?.label || tabId, icon: item?.icon || LayoutDashboard };
}

// Backward-compatible adapter — چند مصرف‌کنندهٔ preexisting (App.tsx's openTab fallback‌لیبل،
// DashboardView.tsx's «پرکاربردترین منوهای شما») هنوز به شکل Record قدیمی دسترسی دارند؛ همان
// دادهٔ Registry، فقط بازآرایی‌شده. عمداً یک Object واقعی (نه Proxy همیشه-truthy) است تا
// DashboardView.tsx's `!!TAB_DEFINITIONS[tabId]` فیلتر هنوز فقط برای idهای واقعاً موجود در
// Registry true برگردد — یک tabId حذف/تغییرنام‌یافته باید هنوز falsy بماند. 'new_request' عمداً
// حذف شده چون هرگز یک تب واقعی نبوده (همیشه Modal را باز می‌کند).
export const TAB_DEFINITIONS: Record<string, { label: string; icon: typeof LayoutDashboard }> = Object.fromEntries(
  NAV_ITEMS.filter((item) => !item.isModalAction).map((item) => [item.id, { label: item.label, icon: item.icon }])
);

interface TabBarProps {
  openTabs: OpenTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

const MAX_VISIBLE_TABS = 6;

// Browser-like tab strip above the main content: every open view stays mounted (App.tsx
// toggles visibility with CSS display), this bar just lets the user switch between /
// close the ones currently open. The "dashboard" tab never shows a close button — it's
// the one tab that always stays open. Beyond MAX_VISIBLE_TABS, extra tabs collapse into an
// overflow dropdown so the strip never pushes page content out of view.
export const TabBar: React.FC<TabBarProps> = ({ openTabs, activeTabId, onSelectTab, onCloseTab }) => {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isMobileSwitcherOpen, setIsMobileSwitcherOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOverflowOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setIsOverflowOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOverflowOpen]);

  const activeTab = useMemo(() => openTabs.find((t) => t.id === activeTabId), [openTabs, activeTabId]);

  if (openTabs.length === 0) return null;

  const visibleTabs = openTabs.length > MAX_VISIBLE_TABS ? openTabs.slice(0, MAX_VISIBLE_TABS - 1) : openTabs;
  const overflowTabs = openTabs.length > MAX_VISIBLE_TABS ? openTabs.slice(MAX_VISIBLE_TABS - 1) : [];
  // اگر تب فعال داخل overflow باشد، آن را هم در نوار اصلی نگه می‌داریم تا کاربر گم نشود.
  const activeInOverflow = overflowTabs.find((t) => t.id === activeTabId);
  const finalVisible = activeInOverflow ? [...visibleTabs.slice(0, -1), activeInOverflow] : visibleTabs;
  const finalOverflow = activeInOverflow ? [visibleTabs[visibleTabs.length - 1], ...overflowTabs.filter((t) => t.id !== activeTabId)] : overflowTabs;

  const renderTabChip = (tab: OpenTab, compact = false) => {
    const { icon: Icon } = resolveTabMeta(tab.id);
    const isActive = activeTabId === tab.id;
    const isDashboard = tab.id === 'dashboard';
    return (
      <div
        key={tab.id}
        className={`flex items-center shrink-0 rounded-t-lg border-b-2 transition ${
          isActive ? 'bg-[var(--primary-soft)] border-[var(--primary)]' : 'bg-transparent border-transparent hover:bg-[var(--surface-muted)]'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectTab(tab.id)}
          title={tab.label}
          className={`flex items-center gap-1.5 pr-2.5 ${isDashboard ? 'pl-2.5' : 'pl-1'} py-2 text-[12.5px] font-bold whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-t-lg ${
            isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
          {!compact && <span className="max-w-[140px] truncate">{tab.label}</span>}
        </button>
        {!isDashboard && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
            title="بستن تب"
            aria-label={`بستن تب ${tab.label}`}
            className="p-1 ml-0.5 mr-1 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition cursor-pointer shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop / Tablet strip with overflow menu */}
      <div className="hidden sm:flex items-center gap-1 pb-0.5 mb-4 border-b border-[var(--border)] dir-rtl">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
          {finalVisible.map((t) => renderTabChip(t))}
        </div>

        {finalOverflow.length > 0 && (
          <div ref={overflowRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsOverflowOpen((v) => !v)}
              title="سایر تب‌های باز"
              aria-haspopup="menu"
              aria-expanded={isOverflowOpen}
              className="flex items-center gap-1 px-2 py-2 text-[12px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] rounded-lg transition cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
              <span>{finalOverflow.length}+</span>
            </button>
            {isOverflowOpen && (
              <div role="menu" className="absolute left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl shadow-lg z-30 p-1">
                {finalOverflow.map((tab) => {
                  const { icon: Icon } = resolveTabMeta(tab.id);
                  return (
                    <button
                      key={tab.id}
                      role="menuitem"
                      onClick={() => { onSelectTab(tab.id); setIsOverflowOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition cursor-pointer text-right"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                        <span className="truncate">{tab.label}</span>
                      </span>
                      {tab.id !== 'dashboard' && (
                        <X
                          className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0"
                          onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile: compact switcher instead of a long horizontal strip */}
      <div className="sm:hidden relative mb-4">
        <button
          type="button"
          onClick={() => setIsMobileSwitcherOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[13px] font-bold text-[var(--text-primary)]"
          aria-haspopup="menu"
          aria-expanded={isMobileSwitcherOpen}
        >
          <span className="flex items-center gap-2 min-w-0">
            {activeTab && (() => { const { icon: Icon } = resolveTabMeta(activeTab.id); return <Icon className="w-4 h-4 text-[var(--primary)] shrink-0" />; })()}
            <span className="truncate">{activeTab?.label}</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform shrink-0 ${isMobileSwitcherOpen ? 'rotate-180' : ''}`} />
        </button>
        {isMobileSwitcherOpen && (
          <div role="menu" className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl shadow-lg p-1">
            {openTabs.map((tab) => {
              const { icon: Icon } = resolveTabMeta(tab.id);
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  role="menuitem"
                  onClick={() => { onSelectTab(tab.id); setIsMobileSwitcherOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-lg text-[13px] font-medium transition cursor-pointer text-right ${isActive ? 'text-[var(--primary)] bg-[var(--primary-soft)]' : 'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </span>
                  {tab.id !== 'dashboard' && (
                    <X
                      className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0"
                      onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
