import { useEffect } from 'react';
import { Building2, LogOut } from 'lucide-react';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import { organizationScopeLabels } from '../localization/foundationLabels';

export function ContextSelector() {
  const { session, selectContext, logout } = useFoundationSession();
  useEffect(() => {
    if (!session) return;
    const workspaces = new Set(session.memberships.map((item) => item.workspace.id));
    const companyContexts = session.memberships.filter((item) => item.scope.type === 'COMPANY');
    const companies = new Set(companyContexts.map((item) => item.company?.id).filter(Boolean));
    if (workspaces.size === 1 && companies.size === 1 && companyContexts.length === 1) {
      void selectContext(companyContexts[0]);
    }
  }, [selectContext, session]);
  if (!session) return null;
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 dir-rtl">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div><h1 className="text-xl font-extrabold">انتخاب محیط کاری</h1><p className="text-sm text-slate-400 mt-1">{session.user.fullName}</p></div>
          <button onClick={() => void logout()} className="rounded-xl border border-slate-700 p-2 text-slate-300" title="خروج"><LogOut /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {session.memberships.map((membership) => (
            <button key={membership.contextKey} onClick={() => void selectContext(membership)} className="text-right rounded-2xl border border-slate-700 bg-slate-950 p-4 hover:border-emerald-500 transition">
              <Building2 className="text-emerald-400 mb-3" />
              <strong className="block">{membership.workspace.name}</strong>
              <span className="text-xs text-slate-400">{membership.company?.name ?? 'کل مجموعه'} · {membership.organizationUnit?.name ?? organizationScopeLabels[membership.scope.type]}</span>
              <span className="mt-1 block text-[10px] text-indigo-300">{membership.roles.map((role) => role.name).join('، ') || 'بدون نقش تخصیص‌یافته'}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
