import React, { useMemo, useState } from 'react';
import { AlertTriangle, Building2, GitBranch, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import type { SalesBranch, SalesChain, SalesOrgAssignment, SystemPermission, User } from '../types';
import { storage } from '../utils/storage';
import {
  SALES_HIERARCHY_LABELS,
  getActiveSalesAssignment,
  getVisibleSalesOrganizationUserIds,
  resolveSalesHierarchy
} from '../utils/salesOrgStructure';

interface SalesOrganizationViewProps {
  users: User[];
  currentUser: User;
  effectivePermissions: SystemPermission[] | null;
}

interface HierarchyNodeProps {
  assignment: SalesOrgAssignment;
  assignments: SalesOrgAssignment[];
  users: User[];
  branches: SalesBranch[];
  chains: SalesChain[];
  depth?: number;
  visited?: Set<string>;
}

const roleTone: Record<SalesOrgAssignment['salesRoleId'], string> = {
  role_sales_deputy: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  role_sales_manager: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  role_senior_sales_supervisor: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  role_sales_supervisor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  role_salesperson: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
};

const roleRank: Record<SalesOrgAssignment['salesRoleId'], number> = {
  role_sales_deputy: 5,
  role_sales_manager: 4,
  role_senior_sales_supervisor: 3,
  role_sales_supervisor: 2,
  role_salesperson: 1
};

const toLatinDigits = (value: string): string => value
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const splitAssignmentTimestamp = (value: string): { date: string; time: string } => {
  const normalized = toLatinDigits(value || '').trim();
  const match = normalized.match(/(\d{4}\/\d{2}\/\d{2}).*?(\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return { date: normalized || '—', time: '—' };
  return { date: match[1], time: `${match[2]}:${match[3] || '00'}` };
};

const HierarchyNode: React.FC<HierarchyNodeProps> = ({
  assignment, assignments, users, branches, chains, depth = 0, visited = new Set<string>()
}) => {
  const user = users.find((u) => u.id === assignment.userId);
  const branchNames = assignment.salesBranchIds.map((id) => branches.find((b) => b.id === id)?.name || id);
  const chainNames = (assignment.salesChainIds || []).map((id) => chains.find((c) => c.id === id)?.name || id);
  const nextVisited = new Set(visited);
  nextVisited.add(assignment.userId);
  const children = assignments
    .filter((a) => a.directManagerUserId === assignment.userId && !nextVisited.has(a.userId))
    .sort((a, b) => roleRank[b.salesRoleId] - roleRank[a.salesRoleId] || (users.find((u) => u.id === a.userId)?.fullName || '').localeCompare(users.find((u) => u.id === b.userId)?.fullName || '', 'fa'));

  return (
    <div className={depth > 0 ? 'mr-4 sm:mr-7 border-r border-[var(--border)] pr-3 sm:pr-4' : ''}>
      <div className={`rounded-xl border px-3 py-2.5 mb-2 ${roleTone[assignment.salesRoleId]}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-extrabold text-sm truncate">{user?.fullName || 'کاربر حذف‌شده/نامشخص'}</p>
            <p className="text-[11px] opacity-80 mt-0.5">{SALES_HIERARCHY_LABELS[assignment.salesRoleId]}</p>
          </div>
          <div className="text-[10px] text-left opacity-80">
            <p>{branchNames.join('، ') || 'بدون شعبه'}</p>
            {chainNames.length > 0 && <p className="mt-0.5">{chainNames.join('، ')}</p>}
          </div>
        </div>
      </div>
      {children.map((child) => (
        <HierarchyNode
          key={child.id}
          assignment={child}
          assignments={assignments}
          users={users}
          branches={branches}
          chains={chains}
          depth={depth + 1}
          visited={nextVisited}
        />
      ))}
    </div>
  );
};

export const SalesOrganizationView: React.FC<SalesOrganizationViewProps> = ({ users, currentUser, effectivePermissions }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'all' | SalesOrgAssignment['salesRoleId']>('all');

  const assignments = useMemo(() => storage.getSalesOrgAssignments().filter((a) => a.isActive), [users, refreshKey]);
  const branches = useMemo(() => storage.getSalesBranches(), [refreshKey]);
  const chains = useMemo(() => storage.getSalesChains(), [refreshKey]);
  const canViewAll = effectivePermissions === null || effectivePermissions.includes('manage_sales_users');
  const visibleUserIds = useMemo(
    () => new Set(getVisibleSalesOrganizationUserIds(currentUser.id, assignments, canViewAll)),
    [currentUser.id, assignments, canViewAll]
  );
  const visibleAssignments = useMemo(
    () => assignments.filter((a) => visibleUserIds.has(a.userId)),
    [assignments, visibleUserIds]
  );
  const viewerAssignment = getActiveSalesAssignment(currentUser.id, assignments);
  // نام افراد مسیر بالادستی برای فهم «زنجیرهٔ من» لازم است، اما شعب/تیم‌های دیگرِ همان مدیران
  // نباید به کاربر قلمرو محدود نشت کند. برای ادمین/مدیر کاربران فروش نمایش کامل است؛ برای هر
  // عضو سازمان فروش، شعب و Chainهای همه کارت‌ها به قلمرو انتصاب خودِ او محدود می‌شوند.
  const displayAssignments = useMemo(() => {
    if (canViewAll || !viewerAssignment) return visibleAssignments;
    const allowedBranchIds = new Set(viewerAssignment.salesBranchIds);
    return visibleAssignments.map((a) => ({
      ...a,
      salesBranchIds: a.salesBranchIds.filter((id) => allowedBranchIds.has(id)),
      salesChainIds: (a.salesChainIds || []).filter((id) => {
        const chain = chains.find((c) => c.id === id);
        return !!chain && allowedBranchIds.has(chain.salesBranchId);
      })
    }));
  }, [canViewAll, viewerAssignment, visibleAssignments, chains]);

  const healthIssues = useMemo(() => {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const assignment of visibleAssignments) {
      if (seen.has(assignment.userId)) issues.push(`بیش از یک انتصاب فعال برای ${users.find((u) => u.id === assignment.userId)?.fullName || assignment.userId}`);
      seen.add(assignment.userId);
      const user = users.find((u) => u.id === assignment.userId);
      if (!user) issues.push(`کاربر انتصاب ${assignment.id} یافت نشد`);
      else if (user.isActive === false) issues.push(`انتصاب فعال برای کاربر غیرفعال ${user.fullName}`);
      if (assignment.salesBranchIds.some((id) => !branches.some((b) => b.id === id && b.isActive))) {
        issues.push(`شعبه نامعتبر/غیرفعال برای ${user?.fullName || assignment.userId}`);
      }
      if (assignment.salesRoleId !== 'role_sales_deputy' && !assignment.directManagerUserId) {
        issues.push(`مدیر مستقیم ${user?.fullName || assignment.userId} تعیین نشده`);
      }
      if (assignment.salesRoleId === 'role_salesperson') {
        const resolved = resolveSalesHierarchy(assignment.userId, assignments, users);
        if (resolved.ok === false || !resolved.hierarchy.supervisor || !resolved.hierarchy.seniorSupervisor || !resolved.hierarchy.manager || !resolved.hierarchy.deputy) {
          issues.push(`زنجیره پنج‌سطحی ${user?.fullName || assignment.userId} ناقص است`);
        }
      }
    }
    return Array.from(new Set(issues));
  }, [visibleAssignments, assignments, users, branches]);

  const filteredAssignments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fa');
    return displayAssignments
      .filter((a) => branchFilter === 'all' || a.salesBranchIds.includes(branchFilter))
      .filter((a) => roleFilter === 'all' || a.salesRoleId === roleFilter)
      .filter((a) => {
        if (!normalizedQuery) return true;
        const user = users.find((u) => u.id === a.userId);
        const manager = users.find((u) => u.id === a.directManagerUserId);
        const branchNames = a.salesBranchIds.map((id) => branches.find((b) => b.id === id)?.name || '').join(' ');
        const chainNames = (a.salesChainIds || []).map((id) => chains.find((c) => c.id === id)?.name || '').join(' ');
        return [user?.fullName, user?.username, manager?.fullName, SALES_HIERARCHY_LABELS[a.salesRoleId], branchNames, chainNames]
          .filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(normalizedQuery);
      })
      .sort((a, b) => roleRank[b.salesRoleId] - roleRank[a.salesRoleId] || (users.find((u) => u.id === a.userId)?.fullName || '').localeCompare(users.find((u) => u.id === b.userId)?.fullName || '', 'fa'));
  }, [displayAssignments, branchFilter, roleFilter, query, users, branches, chains]);

  const roots = useMemo(() => displayAssignments
    .filter((a) => !a.directManagerUserId || !visibleUserIds.has(a.directManagerUserId))
    .sort((a, b) => roleRank[b.salesRoleId] - roleRank[a.salesRoleId]), [displayAssignments, visibleUserIds]);

  const visibleBranches = branches.filter((b) => displayAssignments.some((a) => a.salesBranchIds.includes(b.id)));
  const salespersonCount = displayAssignments.filter((a) => a.salesRoleId === 'role_salesperson').length;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[var(--primary)]" /> سازمان فروش و سلسله‌مراتب
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {canViewAll ? 'نمای کامل سازمان فروش برای مدیر کاربران فروش/ادمین' : 'نمای قلمرو شما: مسیر بالادستی + تمام زیرمجموعه‌های مستقیم و غیرمستقیم'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((v) => v + 1)}
          className="min-h-11 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-xs font-bold flex items-center gap-2 hover:bg-[var(--surface-muted)]"
        >
          <RefreshCw className="w-4 h-4" /> تازه‌سازی ساختار
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <UsersRound className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-2xl font-black text-[var(--text-primary)]">{displayAssignments.length}</p>
          <p className="text-xs text-[var(--text-muted)]">جایگاه فعال قابل مشاهده</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <Building2 className="w-5 h-5 text-sky-400 mb-2" />
          <p className="text-2xl font-black text-[var(--text-primary)]">{visibleBranches.length}</p>
          <p className="text-xs text-[var(--text-muted)]">شعبه فروش در قلمرو</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {healthIssues.length === 0 ? <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2" /> : <AlertTriangle className="w-5 h-5 text-amber-400 mb-2" />}
          <p className="text-2xl font-black text-[var(--text-primary)]">{healthIssues.length}</p>
          <p className="text-xs text-[var(--text-muted)]">ناسازگاری ساختاری در قلمرو</p>
        </div>
      </div>

      {displayAssignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="font-bold text-[var(--text-primary)]">برای این حساب، انتصاب فعالی در سازمان فروش یافت نشد.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">مدیر کاربران فروش باید نقش، شعبه، زنجیره و مدیر مستقیم را در مدیریت کاربران ثبت کند.</p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-extrabold text-[var(--text-primary)]">چارت فعال سازمان فروش</h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">نمای Read-only؛ ویرایش از «مدیریت کاربران سیستمی» انجام می‌شود.</p>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] font-bold">{salespersonCount} فروشنده</span>
            </div>
            <div className="space-y-2">
              {roots.map((root) => (
                <HierarchyNode key={root.id} assignment={root} assignments={displayAssignments} users={users} branches={branches} chains={chains} />
              ))}
            </div>
          </section>

          {healthIssues.length > 0 && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <h3 className="font-extrabold text-amber-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> هشدارهای ساختاری</h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-100 list-disc list-inside">
                {healthIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] space-y-3">
              <h3 className="font-extrabold text-[var(--text-primary)]">فهرست تخصصی کاربران فروش</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="relative sm:col-span-1">
                  <Search className="absolute right-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="نام، نقش، مدیر، شعبه یا زنجیره..."
                    className="w-full min-h-11 pr-9 pl-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                </label>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="min-h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--text-primary)]">
                  <option value="all">همه شعب قابل مشاهده</option>
                  {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} className="min-h-11 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--text-primary)]">
                  <option value="all">همه جایگاه‌ها</option>
                  {Object.entries(SALES_HIERARCHY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
                  <tr><th className="p-3">نام</th><th className="p-3">جایگاه فروش</th><th className="p-3">شعبه</th><th className="p-3">زنجیره/تیم</th><th className="p-3">مدیر مستقیم</th><th className="p-3">تاریخ شروع</th><th className="p-3">ساعت شروع</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredAssignments.map((a) => (
                    <tr key={a.id} className="text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
                      <td className="p-3 font-bold">{users.find((u) => u.id === a.userId)?.fullName || '—'}</td>
                      <td className="p-3">{SALES_HIERARCHY_LABELS[a.salesRoleId]}</td>
                      <td className="p-3">{a.salesBranchIds.map((id) => branches.find((b) => b.id === id)?.name || id).join('، ')}</td>
                      <td className="p-3">{(a.salesChainIds || []).map((id) => chains.find((c) => c.id === id)?.name || id).join('، ') || '—'}</td>
                      <td className="p-3">{users.find((u) => u.id === a.directManagerUserId)?.fullName || '—'}</td>
                      <td className="p-3 whitespace-nowrap" dir="ltr">{splitAssignmentTimestamp(a.validFrom).date}</td>
                      <td className="p-3 whitespace-nowrap" dir="ltr">{splitAssignmentTimestamp(a.validFrom).time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden p-3 space-y-2">
              {filteredAssignments.map((a) => (
                <article key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-extrabold text-sm text-[var(--text-primary)]">{users.find((u) => u.id === a.userId)?.fullName || '—'}</p><p className="text-[11px] text-[var(--primary)] mt-1">{SALES_HIERARCHY_LABELS[a.salesRoleId]}</p></div>
                    <span className="text-[10px] text-[var(--text-muted)]" dir="ltr">
                      {splitAssignmentTimestamp(a.validFrom).date} | {splitAssignmentTimestamp(a.validFrom).time}
                    </span>
                  </div>
                  <dl className="grid grid-cols-[80px_1fr] gap-y-1 mt-3 text-xs">
                    <dt className="text-[var(--text-muted)]">شعبه</dt><dd className="text-[var(--text-primary)]">{a.salesBranchIds.map((id) => branches.find((b) => b.id === id)?.name || id).join('، ')}</dd>
                    <dt className="text-[var(--text-muted)]">زنجیره</dt><dd className="text-[var(--text-primary)]">{(a.salesChainIds || []).map((id) => chains.find((c) => c.id === id)?.name || id).join('، ') || '—'}</dd>
                    <dt className="text-[var(--text-muted)]">مدیر مستقیم</dt><dd className="text-[var(--text-primary)]">{users.find((u) => u.id === a.directManagerUserId)?.fullName || '—'}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
