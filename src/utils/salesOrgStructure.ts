import { SalesBranch, SalesOrgAssignment, SalesHierarchyRoleId, SalesHierarchySnapshot, User, SystemRole, SalesChain } from '../types';

// ============================================================
// موتور خالص سازمان فروش (مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش). SalesOrgAssignment منبع
// اصلی زنجیرهٔ فروش است — User.salesSupervisorId فقط برای خواندن دادهٔ قدیمی/مصرف‌کننده‌های
// فعلی src/utils/salesHierarchy.ts نگه داشته شده و در لحظهٔ ذخیرهٔ یک انتصاب جدید با
// directManagerUserId هم‌گام می‌شود (به‌جای بازنویسی همهٔ مصرف‌کننده‌های موجود). کاملاً خالص —
// بدون localStorage/alert؛ persistence/Audit مسئولیت Handler در کامپوننت فراخواننده است.
// ============================================================

// ترتیب دقیق پنج سطح — همان چیزی که allowedParentRoleIds هر نقش هم باید با آن سازگار باشد.
export const SALES_HIERARCHY_LEVELS: SalesHierarchyRoleId[] = [
  'role_salesperson', 'role_sales_supervisor', 'role_senior_sales_supervisor', 'role_sales_manager', 'role_sales_deputy'
];

export const SALES_HIERARCHY_LABELS: Record<SalesHierarchyRoleId, string> = {
  role_salesperson: 'فروشنده',
  role_sales_supervisor: 'سرپرست فروش',
  role_senior_sales_supervisor: 'سرپرست ارشد فروش',
  role_sales_manager: 'مدیر فروش',
  role_sales_deputy: 'معاونت فروش'
};

export function getActiveSalesAssignment(userId: string, assignments: SalesOrgAssignment[]): SalesOrgAssignment | undefined {
  return assignments.find((a) => a.userId === userId && a.isActive);
}

// نسخهٔ سخت‌گیر برای مسیرهای Mutating (انتقال/غیرفعال‌سازی/اصلاح — بند ۲۱ AGENTS.md): اگر
// دادهٔ خراب باعث شد یک کاربر بیش از یک انتصاب فعال هم‌زمان داشته باشد، به‌جای انتخاب اولی
// (رفتار قدیمی getActiveSalesAssignment که فقط برای نمایش/Read استفاده می‌ماند)، صریحاً Fail
// می‌دهد تا این ناسازگاری در همان لحظه Audit/گزارش شود، نه این‌که بی‌صدا داده‌ی اشتباه ببرد.
export function getSingleActiveSalesAssignmentStrict(
  userId: string, assignments: SalesOrgAssignment[]
): { ok: true; assignment: SalesOrgAssignment | null } | { ok: false; reason: string } {
  const active = assignments.filter((a) => a.userId === userId && a.isActive);
  if (active.length > 1) {
    return { ok: false, reason: `کاربر ${userId} هم‌زمان ${active.length} انتصاب فعال در سازمان فروش دارد — این ناسازگاری داده باید قبل از هر عملیات دیگر بررسی شود.` };
  }
  return { ok: true, assignment: active[0] || null };
}

// زیرشاخهٔ سلسله‌مراتب فروش (خودِ کاربر + هر کسی که مستقیم/غیرمستقیم directManagerUserی او را
// در یک انتصاب فعال اشاره می‌کند) — نسخهٔ مبتنی‌بر SalesOrgAssignment از الگوی
// src/utils/salesHierarchy.ts's getSubordinateUserIds (که همچنان روی salesSupervisorId کار می‌کند).
export function getSalesSubtreeUserIds(userId: string, assignments: SalesOrgAssignment[]): string[] {
  const activeAssignments = assignments.filter((a) => a.isActive);
  const subtreeIds = new Set<string>([userId]);
  let added = true;
  while (added) {
    added = false;
    for (const a of activeAssignments) {
      if (a.directManagerUserId && subtreeIds.has(a.directManagerUserId) && !subtreeIds.has(a.userId)) {
        subtreeIds.add(a.userId);
        added = true;
      }
    }
  }
  return Array.from(subtreeIds);
}

// قلمرو خواندن «دایرکتوری سازمان فروش». مدیر کاربران فروش/ادمین می‌تواند canViewAll=true
// بدهد؛ بقیه فقط زیرشاخهٔ خودشان + مسیر بالادستی خودشان را می‌بینند. افزودن مسیر بالادستی
// باعث می‌شود فروشنده زنجیرهٔ کامل خودش را ببیند، بدون اینکه نام همکاران یا زنجیره‌های موازی
// برای او افشا شود. تابع در برابر دادهٔ حلقه‌دار Fail-safe است و بعد از مشاهدهٔ دوبارهٔ یک
// userId پیمایش را متوقف می‌کند.
export function getVisibleSalesOrganizationUserIds(
  viewerUserId: string,
  assignments: SalesOrgAssignment[],
  canViewAll: boolean
): string[] {
  const activeAssignments = assignments.filter((a) => a.isActive);
  if (canViewAll) return Array.from(new Set(activeAssignments.map((a) => a.userId)));

  const viewerAssignment = getActiveSalesAssignment(viewerUserId, activeAssignments);
  if (!viewerAssignment) return [];

  const visible = new Set(getSalesSubtreeUserIds(viewerUserId, activeAssignments));
  const visited = new Set<string>();
  let cursor: string | undefined = viewerUserId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    visible.add(cursor);
    const current = getActiveSalesAssignment(cursor, activeAssignments);
    cursor = current?.directManagerUserId;
  }

  return Array.from(visible);
}

interface ResolvedLevel { userId: string; userName: string; assignment: SalesOrgAssignment }
export interface ResolvedSalesHierarchy {
  salesperson?: ResolvedLevel;
  supervisor?: ResolvedLevel;
  seniorSupervisor?: ResolvedLevel;
  manager?: ResolvedLevel;
  deputy?: ResolvedLevel;
}

// زنجیرهٔ کامل را از یک کاربر (در هر سطحی از پنج سطح) به سمت بالا (سرپرست ← ... ← معاونت) Resolve
// می‌کند. اگر زنجیره ناقص یا حلقه‌دار باشد، ok:false با دلیل دقیق برمی‌گرداند — هرگز نیمه‌کاره
// حدس نمی‌زند. حداکثر عمق ۵ (بیشتر از این یعنی حلقه یا دادهٔ خراب).
export function resolveSalesHierarchy(
  userId: string, assignments: SalesOrgAssignment[], users: User[]
): { ok: true; hierarchy: ResolvedSalesHierarchy } | { ok: false; reason: string } {
  const hierarchy: ResolvedSalesHierarchy = {};
  const visited = new Set<string>();
  let currentUserId: string | undefined = userId;

  while (currentUserId) {
    if (visited.has(currentUserId)) return { ok: false, reason: `حلقه در زنجیرهٔ سرپرستی فروش شناسایی شد (کاربر ${currentUserId} دوباره تکرار شد).` };
    if (visited.size >= SALES_HIERARCHY_LEVELS.length) return { ok: false, reason: 'عمق زنجیرهٔ سرپرستی فروش از ۵ سطح مجاز بیشتر شد.' };
    visited.add(currentUserId);

    const assignment = getActiveSalesAssignment(currentUserId, assignments);
    if (!assignment) return { ok: false, reason: `کاربر ${currentUserId} هیچ انتصاب فعالی در سازمان فروش ندارد.` };
    const user = users.find((u) => u.id === currentUserId);
    if (!user) return { ok: false, reason: `کاربر ${currentUserId} یافت نشد.` };
    if (user.isActive === false) return { ok: false, reason: `کاربر ${user.fullName} در زنجیره غیرفعال است.` };

    const level: ResolvedLevel = { userId: user.id, userName: user.fullName, assignment };
    if (assignment.salesRoleId === 'role_salesperson') hierarchy.salesperson = level;
    else if (assignment.salesRoleId === 'role_sales_supervisor') hierarchy.supervisor = level;
    else if (assignment.salesRoleId === 'role_senior_sales_supervisor') hierarchy.seniorSupervisor = level;
    else if (assignment.salesRoleId === 'role_sales_manager') hierarchy.manager = level;
    else if (assignment.salesRoleId === 'role_sales_deputy') hierarchy.deputy = level;

    currentUserId = assignment.directManagerUserId;
  }

  return { ok: true, hierarchy };
}

// اعتبارسنجی کامل یک SalesOrgAssignment جدید/ویرایش‌شده — allowedParentRoleIds واقعاً از
// SystemRole مصرف می‌شود (نه صرفاً تزئینی). این تابع فقط محاسبه می‌کند؛ هیچ چیزی نمی‌نویسد.
export function validateSalesAssignment(
  assignment: Omit<SalesOrgAssignment, 'id' | 'changedAt'>,
  targetUserId: string,
  allAssignments: SalesOrgAssignment[],
  allUsers: User[],
  allBranches: SalesBranch[],
  allRoles: SystemRole[]
): { ok: true } | { ok: false; reason: string } {
  if (!SALES_HIERARCHY_LEVELS.includes(assignment.salesRoleId)) {
    return { ok: false, reason: 'نقش سازمان فروش نامعتبر است.' };
  }

  // فروشندهٔ فعال دقیقاً یک شعبه — سطوح بالاتر می‌توانند چند شعبه داشته باشند.
  if (assignment.salesRoleId === 'role_salesperson' && assignment.isActive && assignment.salesBranchIds.length !== 1) {
    return { ok: false, reason: 'فروشندهٔ فعال باید دقیقاً یک شعبهٔ فروش داشته باشد.' };
  }
  if (assignment.isActive && assignment.salesBranchIds.length === 0) {
    return { ok: false, reason: 'حداقل یک شعبهٔ فروش باید انتخاب شود.' };
  }

  // همهٔ شعبه‌های ارجاع‌شده باید موجود و فعال باشند.
  for (const branchId of assignment.salesBranchIds) {
    const branch = allBranches.find((b) => b.id === branchId);
    if (!branch) return { ok: false, reason: `شعبهٔ فروش با شناسهٔ ${branchId} یافت نشد.` };
    if (!branch.isActive) return { ok: false, reason: `شعبهٔ «${branch.name}» غیرفعال است.` };
  }

  // Parent خودِ کاربر ممنوع.
  if (assignment.directManagerUserId === targetUserId) {
    return { ok: false, reason: 'کاربر نمی‌تواند مدیر مستقیم خودش باشد.' };
  }

  const roleRecord = allRoles.find((r) => r.id === assignment.salesRoleId);
  const allowedParentRoleIds = roleRecord?.allowedParentRoleIds || [];

  if (allowedParentRoleIds.length === 0) {
    // معاونت فروش — Parent ندارد.
    if (assignment.directManagerUserId) {
      return { ok: false, reason: 'بالاترین سطح سازمان فروش (معاونت فروش) نباید مدیر مستقیم داشته باشد.' };
    }
  } else {
    if (!assignment.directManagerUserId) {
      return { ok: false, reason: 'برای این جایگاه، تعیین مدیر مستقیم الزامی است.' };
    }
    const managerUser = allUsers.find((u) => u.id === assignment.directManagerUserId);
    if (!managerUser) return { ok: false, reason: 'مدیر مستقیم انتخاب‌شده یافت نشد.' };
    if (managerUser.isActive === false) return { ok: false, reason: 'مدیر مستقیم انتخاب‌شده غیرفعال است.' };

    const managerAssignment = getActiveSalesAssignment(assignment.directManagerUserId, allAssignments);
    if (!managerAssignment) return { ok: false, reason: 'مدیر مستقیم انتخاب‌شده هیچ انتصاب فعالی در سازمان فروش ندارد.' };
    if (!allowedParentRoleIds.includes(managerAssignment.salesRoleId)) {
      return { ok: false, reason: `مدیر مستقیم باید در جایگاه صحیح سلسله‌مراتب باشد (نقش مجاز: ${allowedParentRoleIds.join('، ')}).` };
    }

    // مدیر مستقیم باید شعبه(های) کاربر را پوشش دهد — هر شعبهٔ Child باید در مجموعه شعب Parent باشد.
    const uncovered = assignment.salesBranchIds.filter((bId) => !managerAssignment.salesBranchIds.includes(bId));
    if (uncovered.length > 0) {
      return { ok: false, reason: 'مدیر مستقیم باید همهٔ شعبه‌های فروش این کاربر را پوشش دهد.' };
    }

    // محافظ حلقه: از مدیر مستقیم به بالا برو و مطمئن شو به targetUserId برنمی‌گردیم.
    const visited = new Set<string>([targetUserId]);
    let cursor: string | undefined = assignment.directManagerUserId;
    let depth = 0;
    while (cursor) {
      if (visited.has(cursor)) return { ok: false, reason: 'این انتصاب باعث ایجاد حلقه در زنجیرهٔ سرپرستی فروش می‌شود.' };
      if (depth >= SALES_HIERARCHY_LEVELS.length) return { ok: false, reason: 'زنجیرهٔ سرپرستی فروش بیش از حد مجاز عمق دارد.' };
      visited.add(cursor);
      depth += 1;
      const nextAssignment = getActiveSalesAssignment(cursor, allAssignments);
      cursor = nextAssignment?.directManagerUserId;
    }
  }

  // یک کاربر در یک زمان حداکثر یک جایگاه فعال از پنج جایگاه دارد.
  if (assignment.isActive) {
    const otherActive = allAssignments.find((a) => a.userId === targetUserId && a.isActive);
    if (otherActive && otherActive.salesRoleId !== assignment.salesRoleId) {
      return { ok: false, reason: 'این کاربر از قبل یک جایگاه فعال دیگر در سازمان فروش دارد؛ ابتدا آن را غیرفعال کنید.' };
    }
  }

  return { ok: true };
}

// Snapshot کامل زنجیرهٔ فروش برای یک فروشنده در لحظهٔ فراخوانی — برای ثبت روی فاکتور/رکورد فروش
// جدید. بعد از این لحظه، تغییر بعدی شعبه/مدیران کاربر هرگز این Snapshot را عوض نمی‌کند.
export function buildSalesHierarchySnapshot(
  salespersonUserId: string, assignments: SalesOrgAssignment[], users: User[], branches: SalesBranch[], now: string, chains: SalesChain[] = []
): { ok: true; snapshot: SalesHierarchySnapshot } | { ok: false; reason: string } {
  const resolved = resolveSalesHierarchy(salespersonUserId, assignments, users);
  if (resolved.ok === false) return resolved;
  const { hierarchy } = resolved;

  if (!hierarchy.salesperson) return { ok: false, reason: 'کاربر مبدأ فروشنده نیست.' };
  if (!hierarchy.supervisor) return { ok: false, reason: 'زنجیرهٔ فروش ناقص است: سرپرست فروش یافت نشد.' };
  if (!hierarchy.seniorSupervisor) return { ok: false, reason: 'زنجیرهٔ فروش ناقص است: سرپرست ارشد فروش یافت نشد.' };
  if (!hierarchy.manager) return { ok: false, reason: 'زنجیرهٔ فروش ناقص است: مدیر فروش یافت نشد.' };
  if (!hierarchy.deputy) return { ok: false, reason: 'زنجیرهٔ فروش ناقص است: معاونت فروش یافت نشد.' };

  const branchId = hierarchy.salesperson.assignment.salesBranchIds[0];
  const branch = branches.find((b) => b.id === branchId);
  if (!branch) return { ok: false, reason: 'شعبهٔ فروش این کاربر یافت نشد.' };

  const chainId = hierarchy.salesperson.assignment.salesChainIds?.[0];
  const chain = chainId ? chains.find((c) => c.id === chainId) : undefined;

  return {
    ok: true,
    snapshot: {
      salespersonUserId: hierarchy.salesperson.userId, salespersonUserName: hierarchy.salesperson.userName,
      salesBranchId: branch.id, salesBranchName: branch.name,
      salesChainId: chain?.id, salesChainName: chain?.name,
      supervisorUserId: hierarchy.supervisor.userId, supervisorUserName: hierarchy.supervisor.userName,
      seniorSupervisorUserId: hierarchy.seniorSupervisor.userId, seniorSupervisorUserName: hierarchy.seniorSupervisor.userName,
      salesManagerUserId: hierarchy.manager.userId, salesManagerUserName: hierarchy.manager.userName,
      salesDeputyUserId: hierarchy.deputy.userId, salesDeputyUserName: hierarchy.deputy.userName,
      capturedAt: now
    }
  };
}

// ============================================================
// تأییدکنندهٔ سرپرست فاکتور (بند ۲۱ AGENTS.md / بند ۸ مأموریت چرخهٔ عمر نیروی فروش) — کاسکید
// سه‌مرحله‌ای: ۱) سرپرست Snapshot اگر فعال است ۲) دارندهٔ فعال همان جایگاه در همان salesChainId
// ۳) اولین سطح بالاتر فعالِ همان زنجیره (از روی همان Snapshot: سرپرست ارشد ← مدیر ← معاونت).
// فاکتور/پروندهٔ قدیمی که قبلاً وارد فلو شده هرگز به زنجیرهٔ جدید منتقل نمی‌شود — این تابع فقط
// روی همان Snapshot اصلی فاکتور کار می‌کند، هرگز آن را بازنویسی نمی‌کند.
// ============================================================
export function resolveInvoiceApprover(
  snapshot: SalesHierarchySnapshot | undefined, users: User[], assignments: SalesOrgAssignment[]
): { ok: true; approverUserId: string; approverUserName: string; isSuccessor: boolean; successorReason?: string } | { ok: false; reason: string } {
  if (!snapshot) return { ok: false, reason: 'این فاکتور Snapshot زنجیرهٔ فروش ندارد — تأیید سرپرست خودکار قابل تشخیص نیست.' };

  const activeUser = (userId: string) => users.find((u) => u.id === userId && u.isActive !== false);

  const originalSupervisor = activeUser(snapshot.supervisorUserId);
  if (originalSupervisor) {
    return { ok: true, approverUserId: originalSupervisor.id, approverUserName: originalSupervisor.fullName, isSuccessor: false };
  }

  if (snapshot.salesChainId) {
    const holderAssignment = assignments.find((a) =>
      a.isActive && a.salesRoleId === 'role_sales_supervisor' &&
      (a.salesChainIds || []).includes(snapshot.salesChainId!) && activeUser(a.userId)
    );
    if (holderAssignment) {
      const holder = activeUser(holderAssignment.userId)!;
      return {
        ok: true, approverUserId: holder.id, approverUserName: holder.fullName, isSuccessor: true,
        successorReason: `سرپرست اصلی (${snapshot.supervisorUserName}) غیرفعال بود؛ دارندهٔ فعال همان زنجیره جایگزین شد.`
      };
    }
  }

  const higherLevels: { id: string; name: string }[] = [
    { id: snapshot.seniorSupervisorUserId, name: snapshot.seniorSupervisorUserName },
    { id: snapshot.salesManagerUserId, name: snapshot.salesManagerUserName },
    { id: snapshot.salesDeputyUserId, name: snapshot.salesDeputyUserName }
  ];
  for (const level of higherLevels) {
    const u = activeUser(level.id);
    if (u) {
      return {
        ok: true, approverUserId: u.id, approverUserName: u.fullName, isSuccessor: true,
        successorReason: `سرپرست اصلی (${snapshot.supervisorUserName}) و دارندهٔ فعال زنجیره یافت نشد؛ اولین سطح بالاتر فعال (${u.fullName}) اقدام کرد.`
      };
    }
  }

  return { ok: false, reason: 'هیچ سرپرست یا سطح بالاتر فعالی برای تأیید این فاکتور یافت نشد.' };
}
