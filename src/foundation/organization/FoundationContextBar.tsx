import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { organizationScopeLabels } from '../localization/foundationLabels';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export function FoundationContextBar() {
  const { session, logout, selectContext } = useFoundationSession();
  if (!session?.activeContext) return null;
  const current = session.activeContext;

  const contextLabel = (item: typeof current) => [
    item.workspace.name,
    item.company?.name ?? 'کل مجموعه',
    item.organizationUnit?.name ?? organizationScopeLabels[item.scope.type],
  ].join(' / ');

  return (
    <section className="border-b border-emerald-800 bg-emerald-950 px-3 py-2 text-xs text-emerald-50 sm:px-4" aria-label="محیط کاری فعال" dir="rtl">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 size={16} className="shrink-0" />
          <strong className="truncate">{current.workspace.name}</strong>
          <span className="text-emerald-300">/</span>
          <span className="truncate">{current.company?.name ?? 'کل مجموعه'}</span>
          <span className="hidden rounded bg-emerald-900 px-2 py-1 text-emerald-100 sm:inline">
            {current.organizationUnit?.name ?? organizationScopeLabels[current.scope.type]}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {session.memberships.length > 1 && (
            <select
              aria-label="تغییر محیط کاری"
              value={current.contextKey}
              onChange={(event) => {
                const next = session.memberships.find((item) => item.contextKey === event.target.value);
                if (next) void selectContext(next);
              }}
              className="min-w-0 w-full rounded-lg border border-emerald-700 bg-emerald-900 px-2 py-2 text-emerald-50 sm:w-auto sm:max-w-md"
            >
              {session.memberships.map((item) => (
                <option key={item.contextKey} value={item.contextKey}>{contextLabel(item)}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void selectContext(current)}
              title="بازخوانی دسترسی‌ها"
              aria-label="بازخوانی دسترسی‌ها"
              className="rounded-lg border border-emerald-700 p-2 hover:bg-emerald-900"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-700 px-3 py-2 hover:bg-emerald-900 sm:flex-none"
            >
              <LogOut size={14} /> خروج امن
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
