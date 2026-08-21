import React, { useState } from 'react';
import { User, Company, CostCenter, UserRole, PaymentRequest, SystemPermission, SystemRole, SalesBranch, SalesOrgAssignment } from '../types';
import { storage, DEFAULT_ROLE_ID_MAP } from '../utils/storage';
import { canStartImpersonation } from '../utils/auth';
import { getAssignedRoleIds, deriveLegacyUserRoleFromAssignedRoles } from '../utils/permissions';
import { SALES_HIERARCHY_LEVELS, getActiveSalesAssignment, resolveSalesHierarchy, validateSalesAssignment } from '../utils/salesOrgStructure';
import { getJalaliNow } from '../utils/persianDate';
import { CompaniesView } from './CompaniesView';
import { CostCentersView } from './CostCentersView';
import { ALL_PERMISSIONS } from './RolesAndPermissionsView';
import {
  ShieldCheck, UserPlus, Key, Phone, Mail,
  Building, Building2, MapPin, CheckCircle2, UserX, Edit2, Plus,
  Trash2, Lock, Eye, EyeOff, ShieldAlert, Sparkles, Send, ChevronDown, ChevronUp, LogIn
} from 'lucide-react';

// Multi-role access model helpers: which SystemRole ids count as "requestor-like" /
// "approver-like" (for deriving isDualRole) and which count as issuer-capable (for
// suggesting canIssueTasks) when the admin picks additional roles for a user.
const REQUESTOR_LIKE_ROLE_IDS = ['role_purchaser'];
const APPROVER_LIKE_ROLE_IDS = ['role_branch_approver', 'role_treasury_manager'];
const ISSUER_CAPABLE_ROLE_IDS = ['role_super_admin', 'role_treasury_manager', 'role_branch_approver', 'role_treasury_executor'];

// دامنه‌های غیرمالی (مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش) — بخش «مالی و خزانه‌داری» فرم
// فقط وقتی مخفی می‌شود که دامنهٔ همهٔ نقش‌های انتخابی این کاربر (نقش پایه + نقش‌های تکمیلی) در
// همین فهرست باشد؛ یک نقش بدون domain (مثلاً نقش سفارشی قدیمی) همیشه به‌صورت ایمن باعث نمایش
// بخش مالی می‌شود، نه مخفی‌شدن آن.
const NON_FINANCIAL_ROLE_DOMAINS = ['sales', 'sales_finance', 'data', 'advertising', 'registration', 'monitoring', 'fulfillment', 'general'];

const DOMAIN_LABELS: Record<string, string> = {
  system: 'سیستم', treasury: 'خزانه‌داری', sales: 'فروش', sales_finance: 'مالی فروش',
  data: 'مدیریت داده', advertising: 'تبلیغات', registration: 'واحد ثبت', monitoring: 'واحد شنود',
  after_sales: 'خدمات پس از فروش', fulfillment: 'اجرا و لجستیک', general: 'عمومی'
};
const DOMAIN_BADGE_CLASSES: Record<string, string> = {
  system: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  treasury: 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60',
  sales: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  sales_finance: 'bg-teal-950/60 text-teal-300 border-teal-800/60',
  data: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
  advertising: 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-800/60',
  registration: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60',
  monitoring: 'bg-violet-950/60 text-violet-300 border-violet-800/60',
  after_sales: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
  fulfillment: 'bg-orange-950/60 text-orange-300 border-orange-800/60',
  general: 'bg-slate-800 text-slate-400 border-slate-700'
};

// شناسهٔ نقش‌های سازمان فروش را به نمایش کوتاه فارسی برای پیش‌نمایش زنجیره تبدیل می‌کند.
const SALES_ROLE_SHORT_LABEL: Record<string, string> = {
  role_salesperson: 'فروشنده', role_sales_supervisor: 'سرپرست', role_senior_sales_supervisor: 'سرپرست ارشد',
  role_sales_manager: 'مدیر فروش', role_sales_deputy: 'معاونت فروش'
};

function deriveIsDualRoleFromRoles(baseRole: UserRole, selectedRoleIds: string[]): boolean {
  const hasRequestorLike = baseRole === 'requestor' || selectedRoleIds.some((id) => REQUESTOR_LIKE_ROLE_IDS.includes(id));
  const hasApproverLike = baseRole === 'approver' || selectedRoleIds.some((id) => APPROVER_LIKE_ROLE_IDS.includes(id));
  return hasRequestorLike && hasApproverLike;
}

function deriveTaskAccessFromRoles(selectedRoleIds: string[]): { canIssueTasks: boolean; canExecuteTasks: boolean } {
  return {
    canIssueTasks: selectedRoleIds.some((id) => ISSUER_CAPABLE_ROLE_IDS.includes(id)),
    canExecuteTasks: true
  };
}

interface AdminPanelProps {
  users: User[];
  companies: Company[];
  costCenters: CostCenter[];
  requests: PaymentRequest[];
  roles: SystemRole[];
  currentUser: User | null;
  realActor?: User | null;
  impersonatorAdmin?: User | null;
  realActorPermissions?: SystemPermission[] | null;
  onUpdateUsers: (newUsers: User[]) => void;
  onUpdateCompanies: (newComp: Company[]) => void;
  onUpdateCostCenters: (newCC: CostCenter[]) => void;
  onImpersonateUser?: (targetUser: User) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  companies,
  costCenters,
  requests,
  roles,
  currentUser,
  realActor = null,
  impersonatorAdmin = null,
  realActorPermissions = null,
  onUpdateUsers,
  onUpdateCompanies,
  onUpdateCostCenters,
  onImpersonateUser
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'cost_centers' | 'companies'>('users');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userDomainFilter, setUserDomainFilter] = useState<string>('all');

  // سازمان فروش — SalesBranch/SalesOrgAssignment منبع اصلی است (نه فقط users prop)؛ چون
  // AdminPanel این دو مجموعه را از App.tsx دریافت نمی‌کند، مستقیماً از storage خوانده و بعد از
  // هر ذخیرهٔ موفق، رفرش دستی می‌شود (همان الگویی که این کامپوننت برای storage.getTasks() دارد).
  const [salesBranches, setSalesBranches] = useState<SalesBranch[]>(() => storage.getSalesBranches());
  const [salesOrgAssignments, setSalesOrgAssignments] = useState<SalesOrgAssignment[]>(() => storage.getSalesOrgAssignments());
  const refreshSalesOrgData = () => {
    setSalesBranches(storage.getSalesBranches());
    setSalesOrgAssignments(storage.getSalesOrgAssignments());
  };

  // فرم — فقط برای کاربری معنی دارد که roleId/additionalRoleIds او یکی از پنج نقش سلسله‌مراتب
  // فروش باشد؛ فروشندهٔ فعال دقیقاً یک شعبه، سطوح بالاتر می‌توانند چند شعبه داشته باشند.
  const [salesBranchIds, setSalesBranchIds] = useState<string[]>([]);
  const [salesDirectManagerUserId, setSalesDirectManagerUserId] = useState<string>('');

  // Modals State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordChangeUser, setPasswordChangeUser] = useState<User | null>(null);
  
  // Show password toggle
  const [showPasswordMap, setShowPasswordMap] = useState<{ [key: string]: boolean }>({});

  // Form State for User Creation/Edit
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('approver');
  const [roleId, setRoleId] = useState<string>('role_branch_approver');
  const [roleTitle, setRoleTitle] = useState('مدیر تاییدکننده شعبه');
  const [companyId, setCompanyId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [allowedCostCenterIds, setAllowedCostCenterIds] = useState<string[]>([]);
  
  // Custom User Workflow Route State
  const [allowedApproverIds, setAllowedApproverIds] = useState<string[]>([]);
  const [chainStepsCount, setChainStepsCount] = useState<1 | 2 | 3>(1);
  const [step1ApproverId, setStep1ApproverId] = useState<string>('');
  const [step2ApproverId, setStep2ApproverId] = useState<string>('user_admin_reza');
  const [step3ApproverId, setStep3ApproverId] = useState<string>('user_treasury_exec');
  const [allowDirectToTreasury, setAllowDirectToTreasury] = useState<boolean>(true);
  const [workflowNote, setWorkflowNote] = useState<string>('');

  // Task & Directive Permissions State
  const [canIssueTasks, setCanIssueTasks] = useState<boolean>(true);
  const [canExecuteTasks, setCanExecuteTasks] = useState<boolean>(true);

  // Extra permissions granted on top of the user's base role. Still used internally to
  // sync the canCreateRequests toggle (see handleSaveUser) — the old standalone 5-item
  // checklist UI for this field was folded into the multi-role panel below.
  const [customPermissions, setCustomPermissions] = useState<SystemPermission[]>([]);
  const [canCreateRequests, setCanCreateRequests] = useState<boolean>(true);

  // Senior treasury supervisor designation (independent of the multi-role access model)
  const [isSeniorTreasurySupervisor, setIsSeniorTreasurySupervisor] = useState<boolean>(false);

  // Multi-role access model: extra SystemRole ids granted on top of the base role/roleId,
  // and per-role permission overrides (full replace) scoped to this user only.
  // isDualRole is no longer a manual checkbox — it is derived from the selected role set
  // (see deriveIsDualRoleFromRoles) every render and at save time.
  const [additionalRoleIds, setAdditionalRoleIds] = useState<string[]>([]);
  const [roleAccessOverrides, setRoleAccessOverrides] = useState<{ roleId: string; permissions: SystemPermission[] }[]>([]);
  const [openRolePanels, setOpenRolePanels] = useState<Record<string, boolean>>({});

  // User-specific deny list — subtracted from the union of role permissions at read time
  // (see getEffectiveUserPermissions). Takes priority over every granted role permission.
  const [deniedPermissions, setDeniedPermissions] = useState<SystemPermission[]>([]);
  // General org supervisor chain (independent of salesSupervisorId / approvalChain) — used
  // only for territory computation (computeVisibleUserIds / 'direct_reports' / 'subtree' scope).
  const [reportsToUserId, setReportsToUserId] = useState<string>('');
  // Per-role visibility scope. Default is 'own' when a role has no entry here — company/branch
  // scope is only ever granted explicitly, never a fallback.
  const [roleScopes, setRoleScopes] = useState<{ roleId: string; scope: { scopeType: 'own' | 'direct_reports' | 'subtree' | 'company' | 'branch'; companyId?: string; costCenterId?: string } }[]>([]);

  // Quick Password Change State
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Accordion / Collapsible states for User Modal sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    branches: false,
    multiRole: true,
    territory: false,
    seniorSupervisor: false,
    forward: true,
    chain: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAllSections = () => {
    setOpenSections({
      branches: true,
      multiRole: true,
      territory: true,
      seniorSupervisor: true,
      forward: true,
      chain: true,
    });
  };

  const collapseAllSections = () => {
    setOpenSections({
      branches: false,
      multiRole: false,
      territory: false,
      seniorSupervisor: false,
      forward: false,
      chain: false,
    });
  };

  // Effective permissions for a given role id, honoring this user's roleAccessOverrides
  // (a full replace, not a merge) when present.
  const getRoleEffectivePermissions = (rId: string): SystemPermission[] => {
    const override = roleAccessOverrides.find((o) => o.roleId === rId);
    if (override) return override.permissions;
    return roles.find((r) => r.id === rId)?.permissions || [];
  };

  const toggleAdditionalRole = (rId: string) => {
    if (rId === roleId) return; // base role is always included, not toggleable here
    setAdditionalRoleIds((prev) => {
      const next = prev.includes(rId) ? prev.filter((x) => x !== rId) : [...prev, rId];
      // Auto-suggest task-directive access from the new role set; admin can still
      // manually flip the checkboxes afterward to override this suggestion.
      const derived = deriveTaskAccessFromRoles([roleId, ...next]);
      setCanIssueTasks(derived.canIssueTasks);
      setCanExecuteTasks(derived.canExecuteTasks);
      return next;
    });
  };

  const toggleRolePermissionOverride = (rId: string, perm: SystemPermission) => {
    setRoleAccessOverrides((prev) => {
      const existing = prev.find((o) => o.roleId === rId);
      const basePerms = existing ? existing.permissions : (roles.find((r) => r.id === rId)?.permissions || []);
      const nextPerms = basePerms.includes(perm) ? basePerms.filter((p) => p !== perm) : [...basePerms, perm];
      if (existing) {
        return prev.map((o) => (o.roleId === rId ? { ...o, permissions: nextPerms } : o));
      }
      return [...prev, { roleId: rId, permissions: nextPerms }];
    });
  };

  const resetRolePermissionOverride = (rId: string) => {
    setRoleAccessOverrides((prev) => prev.filter((o) => o.roleId !== rId));
  };

  const toggleDeniedPermission = (perm: SystemPermission) => {
    setDeniedPermissions((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  const getRoleScope = (rId: string) => roleScopes.find((rs) => rs.roleId === rId)?.scope || { scopeType: 'own' as const };

  const setRoleScopeType = (rId: string, scopeType: 'own' | 'direct_reports' | 'subtree' | 'company' | 'branch') => {
    setRoleScopes((prev) => {
      const existing = prev.find((rs) => rs.roleId === rId);
      const nextScope = { scopeType, companyId: existing?.scope.companyId, costCenterId: existing?.scope.costCenterId };
      if (existing) return prev.map((rs) => (rs.roleId === rId ? { ...rs, scope: nextScope } : rs));
      return [...prev, { roleId: rId, scope: nextScope }];
    });
  };

  const setRoleScopeTarget = (rId: string, field: 'companyId' | 'costCenterId', value: string) => {
    setRoleScopes((prev) => {
      const existing = prev.find((rs) => rs.roleId === rId);
      const base = existing?.scope || { scopeType: 'own' as const };
      const nextScope = { ...base, [field]: value || undefined };
      if (existing) return prev.map((rs) => (rs.roleId === rId ? { ...rs, scope: nextScope } : rs));
      return [...prev, { roleId: rId, scope: nextScope }];
    });
  };

  // Live preview of the derived dual-role status for the currently selected role set — uses the
  // same single-source derivation that Save will persist (role دیگر دستی انتخاب نمی‌شود).
  const liveDerivedLegacyRole = deriveLegacyUserRoleFromAssignedRoles([roleId, ...additionalRoleIds]);
  const derivedIsDualRole = deriveIsDualRoleFromRoles(liveDerivedLegacyRole, [roleId, ...additionalRoleIds]);

  // نقش پایه یکی از پنج نقش سلسله‌مراتب فروش است یا نه — بخش «سازمان فروش» فقط برای همین حالت
  // نمایش داده می‌شود (هر کاربر حداکثر یک پست فعال از پنج پست دارد، بسته به roleId اصلی‌اش).
  const selectedRoleIdsForForm = [roleId, ...additionalRoleIds];
  const isSalesOrgRole = SALES_HIERARCHY_LEVELS.includes(roleId as typeof SALES_HIERARCHY_LEVELS[number]);
  const selectedSalesRole = roles.find((r) => r.id === roleId);
  const salesAllowedParentRoleIds = selectedSalesRole?.allowedParentRoleIds || [];

  // بخش «مالی و خزانه‌داری» فقط وقتی مخفی می‌شود که دامنهٔ همهٔ نقش‌های انتخابی این کاربر در
  // فهرست غیرمالی باشد — یک نقش بدون domain همیشه به‌صورت ایمن باعث نمایش می‌شود.
  const showFinancialSection = selectedRoleIdsForForm.some((rId) => {
    const r = roles.find((rr) => rr.id === rId);
    return !r?.domain || !NON_FINANCIAL_ROLE_DOMAINS.includes(r.domain);
  });

  // پیش‌نمایش زنجیرهٔ کامل فروش برای فرم — چون کاربر جدید هنوز id ندارد، زنجیره از مدیر مستقیم
  // انتخاب‌شده به بالا Resolve و پستِ در حال ویرایش در ابتدای آن اضافه می‌شود.
  const salesChainPreview = (() => {
    if (!isSalesOrgRole) return null;
    const currentLabel = `${fullName.trim() || '(کاربر جدید)'} — ${SALES_ROLE_SHORT_LABEL[roleId] || roleId}`;
    if (!salesAllowedParentRoleIds.length) {
      return { ok: true as const, chainLabel: currentLabel, isComplete: true };
    }
    if (!salesDirectManagerUserId) {
      return { ok: false as const, reason: 'مدیر مستقیم هنوز انتخاب نشده است.' };
    }
    const managerChain = resolveSalesHierarchy(salesDirectManagerUserId, salesOrgAssignments, users);
    if (managerChain.ok === false) {
      return { ok: false as const, reason: managerChain.reason };
    }
    const { hierarchy } = managerChain;
    const levels = [hierarchy.salesperson, hierarchy.supervisor, hierarchy.seniorSupervisor, hierarchy.manager, hierarchy.deputy]
      .filter((l): l is NonNullable<typeof l> => !!l)
      .map((l) => `${l.userName} — ${SALES_ROLE_SHORT_LABEL[l.assignment.salesRoleId] || l.assignment.salesRoleId}`);
    return { ok: true as const, chainLabel: [currentLabel, ...levels].join(' ← '), isComplete: true };
  })();

  const toggleShowPassword = (id: string) => {
    setShowPasswordMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setPassword('123456');
    setPhone('');
    setEmail('');
    setRole('approver');
    setRoleId(DEFAULT_ROLE_ID_MAP['approver']);
    setRoleTitle('مدیر تاییدکننده شعبه');
    setCompanyId(companies[0]?.id || 'comp_sales');
    setCostCenterId(costCenters[0]?.id || 'cc_saadatabad');
    setAllowedCostCenterIds(costCenters.map(cc => cc.id));
    setAllowedApproverIds(['user_admin_reza', 'user_approver_sales']);
    setChainStepsCount(1);
    setStep1ApproverId('user_approver_sales');
    setStep2ApproverId('user_admin_reza');
    setStep3ApproverId('user_treasury_exec');
    setAllowDirectToTreasury(true);
    setWorkflowNote('ارجاع بر اساس فرم چارت گردش کار استاندارد سیستم');
    setCanIssueTasks(false);
    setCanExecuteTasks(false);
    setCanCreateRequests(true);
    setIsSeniorTreasurySupervisor(false);
    setCustomPermissions([]);
    setAdditionalRoleIds([]);
    setRoleAccessOverrides([]);
    setOpenRolePanels({});
    setDeniedPermissions([]);
    setReportsToUserId('');
    setRoleScopes([]);
    setSalesBranchIds([]);
    setSalesDirectManagerUserId('');
    refreshSalesOrgData();
    setShowAddUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setFullName(u.fullName);
    setUsername(u.username);
    setPassword(u.password || '123456');
    setPhone(u.phone);
    setEmail(u.email);
    setRole(u.role);
    setRoleId(u.roleId || DEFAULT_ROLE_ID_MAP[u.role]);
    setRoleTitle(u.roleTitle);
    setCompanyId(u.companyId || companies[0]?.id || 'comp_sales');
    setCostCenterId(u.costCenterId || costCenters[0]?.id || 'cc_saadatabad');
    setAllowedCostCenterIds(u.allowedCostCenterIds || (u.costCenterId ? [u.costCenterId] : costCenters.map(cc => cc.id)));
    
    // Workflow state
    const currentCount = u.approvalChain ? u.approvalChain.length : 1;
    setChainStepsCount(currentCount === 2 ? 2 : currentCount === 3 ? 3 : 1);
    setAllowedApproverIds(u.allowedApproverIds || ['user_admin_reza', 'user_approver_sales']);
    setStep1ApproverId(u.approvalChain?.[0] || 'user_approver_sales');
    setStep2ApproverId(u.approvalChain?.[1] || 'user_admin_reza');
    setStep3ApproverId(u.approvalChain?.[2] || 'user_treasury_exec');
    setAllowDirectToTreasury(u.allowDirectToTreasury ?? true);
    setWorkflowNote(u.workflowNote || '');
    setCanIssueTasks(u.canIssueTasks ?? false);
    setCanExecuteTasks(u.canExecuteTasks ?? false);
    setCanCreateRequests(u.canCreateRequests ?? (u.customPermissions?.includes('create_request') || ['requestor', 'approver', 'admin'].includes(u.role)));
    setIsSeniorTreasurySupervisor(u.isSeniorTreasurySupervisor ?? false);
    setCustomPermissions(u.customPermissions || []);
    setAdditionalRoleIds(u.additionalRoleIds || []);
    setRoleAccessOverrides(u.roleAccessOverrides || []);
    setOpenRolePanels({});
    setDeniedPermissions(u.deniedPermissions || []);
    setReportsToUserId(u.reportsToUserId || '');
    setRoleScopes(u.roleScopes || []);
    refreshSalesOrgData();
    const activeAssignment = getActiveSalesAssignment(u.id, storage.getSalesOrgAssignments());
    setSalesBranchIds(activeAssignment?.salesBranchIds || []);
    setSalesDirectManagerUserId(activeAssignment?.directManagerUserId || '');
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) {
      alert('لطفاً نام و نام کاربری را وارد کنید.');
      return;
    }

    const targetUserId = editingUser ? editingUser.id : `user_${Date.now()}`;

    // پست سازمان فروش قبل از هر ذخیره‌ای اعتبارسنجی می‌شود — اگر کاربر همین حالا یک پست فعال
    // دیگر (نقش سازمان فروش متفاوت) دارد، برای اعتبارسنجی به‌عنوان غیرفعال در نظر گرفته می‌شود
    // (یعنی «ارتقا/جابه‌جایی پست» مجاز است)، ولی رکورد قدیمی حذف نمی‌شود — فقط در لحظهٔ ذخیرهٔ
    // نهایی isActive:false می‌گیرد تا سابقهٔ سازمانی حفظ شود.
    const existingActiveAssignment = getActiveSalesAssignment(targetUserId, salesOrgAssignments);
    let salesAssignmentsAfterSave: SalesOrgAssignment[] | null = null;

    if (isSalesOrgRole) {
      const assignmentsForValidation = existingActiveAssignment && existingActiveAssignment.salesRoleId !== roleId
        ? salesOrgAssignments.map((a) => (a.id === existingActiveAssignment.id ? { ...a, isActive: false } : a))
        : salesOrgAssignments;
      const validation = validateSalesAssignment(
        {
          userId: targetUserId, salesRoleId: roleId as typeof SALES_HIERARCHY_LEVELS[number],
          salesBranchIds, directManagerUserId: salesDirectManagerUserId || undefined,
          validFrom: existingActiveAssignment?.salesRoleId === roleId ? existingActiveAssignment.validFrom : getJalaliNow(),
          isActive: true, changedByUserId: currentUser?.id
        },
        targetUserId, assignmentsForValidation, users, salesBranches, roles
      );
      if (validation.ok === false) {
        alert(`خطا در سازمان فروش: ${validation.reason}`);
        return;
      }

      const now = getJalaliNow();
      if (existingActiveAssignment && existingActiveAssignment.salesRoleId === roleId) {
        // بند ۲۱ AGENTS.md / بند ۷ سند مرجع چرخهٔ عمر نیروی فروش: پس از اولین استفادهٔ مؤثر
        // (immutableAfterFirstBusinessUse)، انتصاب دیگر هرگز درجا overwrite نمی‌شود — این باگ
        // preexisting دقیقاً همین بود. پیش از استفاده، اصلاح درجا همچنان مجاز است.
        if (existingActiveAssignment.immutableAfterFirstBusinessUse === true) {
          alert('این انتصاب پس از اولین استفادهٔ مؤثر قفل شده — از فلوی «درخواست انتقال» (برای فروشنده) یا «اصلاح اضطراری» (فقط ادمین اصلی) استفاده کنید، نه ویرایش مستقیم این فرم.');
          return;
        }
        salesAssignmentsAfterSave = salesOrgAssignments.map((a) => (a.id === existingActiveAssignment.id ? {
          ...a, salesBranchIds, directManagerUserId: salesDirectManagerUserId || undefined,
          changedByUserId: currentUser?.id, changedAt: now
        } : a));
      } else {
        const deactivated = existingActiveAssignment
          ? salesOrgAssignments.map((a) => (a.id === existingActiveAssignment.id ? { ...a, isActive: false, changedByUserId: currentUser?.id, changedAt: now } : a))
          : salesOrgAssignments;
        salesAssignmentsAfterSave = [...deactivated, {
          id: `sassign_${targetUserId}_${Date.now()}`, userId: targetUserId, salesRoleId: roleId as typeof SALES_HIERARCHY_LEVELS[number],
          salesBranchIds, directManagerUserId: salesDirectManagerUserId || undefined,
          validFrom: now, isActive: true, changedByUserId: currentUser?.id, changedAt: now
        }];
      }
    } else if (existingActiveAssignment) {
      // کاربر دیگر نقش سازمان فروش ندارد — پست فعال قبلی‌اش بسته می‌شود، ولی رکورد برای Snapshotهای قدیمی باقی می‌ماند.
      salesAssignmentsAfterSave = salesOrgAssignments.map((a) => (a.id === existingActiveAssignment.id ? { ...a, isActive: false, changedByUserId: currentUser?.id, changedAt: getJalaliNow() } : a));
    }

    let chain: string[] = [];
    if (chainStepsCount === 1) {
      chain = [step1ApproverId || users.find(u => u.role === 'approver' || u.role === 'admin')?.id || users[0].id];
    } else if (chainStepsCount === 2) {
      chain = [step1ApproverId, step2ApproverId].filter(Boolean);
    } else {
      chain = [step1ApproverId, step2ApproverId, step3ApproverId].filter(Boolean);
    }
    // Respect an intentionally empty branch list (e.g. a task-only worker with no branch tie)
    // instead of forcing a fallback branch on them.
    const finalAllowedBranches = allowedCostCenterIds;

    // Sync customPermissions with canCreateRequests flag — وقتی بخش «مالی و خزانه‌داری» اصلاً
    // نمایش داده نشده (کاربر خالص فروش/داده/تبلیغات/...)، این پرچم همیشه false ذخیره می‌شود؛
    // چون canAccessNavItem مستقیماً از همین فیلد برای دکمهٔ «ثبت درخواست جدید» خزانه استفاده
    // می‌کند، صرف مخفی‌کردن چک‌باکس در UI کافی نبود — باید مقدار واقعی هم اجباری false شود.
    const finalCanCreateRequests = showFinancialSection ? canCreateRequests : false;
    let finalCustomPerms = [...customPermissions];
    if (finalCanCreateRequests && !finalCustomPerms.includes('create_request')) {
      finalCustomPerms.push('create_request');
    } else if (!finalCanCreateRequests) {
      finalCustomPerms = finalCustomPerms.filter(p => p !== 'create_request');
    }

    // Multi-role access model: exclude the base role from additionalRoleIds if it ended
    // up duplicated there, and derive isDualRole + the Legacy compatibility role from the
    // final selected role set — role دیگر از فرم انتخاب نمی‌شود، همیشه محاسبه‌شده در Save
    // نوشته می‌شود (بند ۱ مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش).
    const finalAdditionalRoleIds = additionalRoleIds.filter(id => id !== roleId);
    const derivedLegacyRole = deriveLegacyUserRoleFromAssignedRoles([roleId, ...finalAdditionalRoleIds]);
    const finalIsDualRole = deriveIsDualRoleFromRoles(derivedLegacyRole, [roleId, ...finalAdditionalRoleIds]);
    const finalSalesSupervisorId = isSalesOrgRole ? (salesDirectManagerUserId || undefined) : undefined;

    if (editingUser) {
      // Update existing user
      let updated = users.map(u => u.id === editingUser.id ? {
        ...u,
        fullName: fullName.trim(),
        username: username.trim(),
        password: password.trim() || '123456',
        phone: phone.trim() || u.phone,
        email: email.trim() || u.email,
        role: derivedLegacyRole,
        roleTitle: roleTitle.trim() || u.roleTitle,
        companyId,
        costCenterId,
        allowedCostCenterIds: finalAllowedBranches,
        allowedApproverIds,
        approvalChain: chain,
        allowDirectToTreasury,
        workflowNote: workflowNote.trim(),
        canIssueTasks,
        canExecuteTasks,
        canCreateRequests: finalCanCreateRequests,
        isDualRole: finalIsDualRole,
        isSeniorTreasurySupervisor,
        customPermissions: finalCustomPerms,
        roleId,
        additionalRoleIds: finalAdditionalRoleIds,
        roleAccessOverrides,
        deniedPermissions,
        reportsToUserId: reportsToUserId || undefined,
        roleScopes,
        salesSupervisorId: isSalesOrgRole ? finalSalesSupervisorId : u.salesSupervisorId
      } : u);

      // Only one user may hold the senior treasury supervisor designation at a time
      if (isSeniorTreasurySupervisor) {
        updated = updated.map(u => u.id === editingUser.id ? u : { ...u, isSeniorTreasurySupervisor: false });
      }

      onUpdateUsers(updated);
      storage.saveUsers(updated);
      if (salesAssignmentsAfterSave) {
        storage.saveSalesOrgAssignments(salesAssignmentsAfterSave);
        setSalesOrgAssignments(salesAssignmentsAfterSave);
      }
      setEditingUser(null);
      alert('اطلاعات، دسترسی‌ها و وضعیت کاربری با موفقیت بروزرسانی شد.');
    } else {
      // Add new user
      const newUser: User = {
        id: targetUserId,
        username: username.trim(),
        password: password.trim() || '123456',
        fullName: fullName.trim(),
        phone: phone.trim() || '09120000000',
        email: email.trim() || `${username}@shavaz.com`,
        role: derivedLegacyRole,
        roleTitle: roleTitle.trim() || 'کاربر سیستم',
        companyId,
        costCenterId,
        allowedCostCenterIds: finalAllowedBranches,
        isActive: true,
        allowedApproverIds,
        approvalChain: chain,
        allowDirectToTreasury,
        workflowNote: workflowNote.trim(),
        canIssueTasks,
        canExecuteTasks,
        canCreateRequests: finalCanCreateRequests,
        isDualRole: finalIsDualRole,
        isSeniorTreasurySupervisor,
        customPermissions: finalCustomPerms,
        roleId,
        additionalRoleIds: finalAdditionalRoleIds,
        roleAccessOverrides,
        deniedPermissions,
        reportsToUserId: reportsToUserId || undefined,
        roleScopes,
        salesSupervisorId: finalSalesSupervisorId
      };

      let updated = [...users, newUser];
      if (isSeniorTreasurySupervisor) {
        updated = updated.map(u => u.id === newUser.id ? u : { ...u, isSeniorTreasurySupervisor: false });
      }
      onUpdateUsers(updated);
      storage.saveUsers(updated);
      if (salesAssignmentsAfterSave) {
        storage.saveSalesOrgAssignments(salesAssignmentsAfterSave);
        setSalesOrgAssignments(salesAssignmentsAfterSave);
      }
      setShowAddUserModal(false);
      alert('کاربر جدید با مسیر تاییدات اختصاصی ایجاد گردید.');
    }
  };

  const handleQuickPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeUser || !newPasswordValue.trim()) return;

    const updated = users.map(u => u.id === passwordChangeUser.id ? {
      ...u,
      password: newPasswordValue.trim()
    } : u);

    onUpdateUsers(updated);
    storage.saveUsers(updated);
    setPasswordChangeUser(null);
    setNewPasswordValue('');
    alert('رمز عبور جدید کاربر با موفقیت ثبت گردید.');
  };

  const handleToggleUserActive = (userId: string) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        return { ...u, isActive: !u.isActive };
      }
      return u;
    });
    onUpdateUsers(updated);
    storage.saveUsers(updated);
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser?.id || u.username === 'admin') {
      alert('نمی‌توانید حساب کاربری ادمین اصلی جاری را حذف فیزیکی یا تغییر نام دهید.');
      return;
    }

    // Check user activities & logs across system
    const userRequests = requests.filter(r => 
      r.requestorId === u.id ||
      r.currentApproverId === u.id ||
      r.timeline?.some(t => t.actorName === u.fullName || t.nextActorName === u.fullName)
    );
    const userTasks = storage.getTasks().filter(t => 
      t.assignerId === u.id || 
      t.assigneeId === u.id ||
      t.messages?.some(m => m.senderId === u.id)
    );

    if (userRequests.length > 0 || userTasks.length > 0) {
      alert(`⛔ امکان حذف حساب کاربری "${u.fullName}" وجود ندارد!\n\nعلت: این کاربر دارای سوابق اجرایی و لاگ ثبت‌شده در سیستم می‌باشد (تعداد ${userRequests.length} درخواست پرداخت و ${userTasks.length} دستور اداری/کار محوله مربوط به این کاربر ثبت شده است).\n\nبرای حفظ یکپارچگی اطلاعات، اسناد مالی و سوابق پیگیری، امکان حذف فیزیکی وجود ندارد. شما به عنوان ادمین می‌توانید روی دکمه «غیرفعال‌سازی» کلیک کنید تا حساب کاربر مسدود شده و به تب «کاربران غیرفعال» منتقل گردد.`);
      return;
    }

    if (confirm(`آیا از حذف کامل و دائمی حساب کاربری بدون لاگ "${u.fullName}" اطمینان دارید؟`)) {
      const updated = users.filter(user => user.id !== u.id);
      onUpdateUsers(updated);
      storage.saveUsers(updated);
      alert('حساب کاربری جدید که فاقد هرگونه لاگ در سیستم بود، با موفقیت حذف گردید.');
    }
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Admin Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              پنل مدیریت ارشد ادمین (Super Admin Management)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              مدیریت کامل دسترسی کاربران، ویرایش رمز عبور، شعب فروش، مراکز هزینه و شرکت‌های هلدینگ
            </p>
          </div>
        </div>

        {/* Super Admin Info Badge */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 flex items-center gap-3">
          <Key className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <div className="font-bold">ادمین ارشد سیستم: رضا بیات</div>
            <div className="text-[10px] text-amber-300">نام کاربری: admin | تلفن: 09330297784</div>
          </div>
        </div>
      </div>

      {/* Pending Approval Notice Banner */}
      {users.filter(u => !u.isActive).length > 0 && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-300 text-xs font-bold">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
            <span>تعداد {users.filter(u => !u.isActive).length} کاربر جدید ثبت‌نام نموده و در انتظار بررسی و تایید دسترسی شما هستند.</span>
          </div>
          <button
            onClick={() => setActiveSubTab('users')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition shrink-0 cursor-pointer"
          >
            مشاهده و تایید کاربران
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('users')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-indigo-300" />
          <span>مدیریت کاربران و دسترسی‌ها ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cost_centers')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'cost_centers' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>شعب فروش و مراکز هزینه ({costCenters.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('companies')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'companies' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800/80 text-slate-400 hover:text-white'
          }`}
        >
          <Building className="w-4 h-4 text-indigo-400" />
          <span>شرکت‌های گروه ({companies.length})</span>
        </button>
      </div>

      {/* Users Sub-Tab Content */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>مدیریت حساب‌های کاربری</span>
              </h3>
              
              {/* User Status Filter Switcher */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold mr-2">
                <button
                  onClick={() => setUserStatusFilter('all')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer ${
                    userStatusFilter === 'all' 
                      ? 'bg-indigo-600 text-white shadow' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  همه کاربران ({users.length})
                </button>
                <button
                  onClick={() => setUserStatusFilter('active')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer flex items-center gap-1 ${
                    userStatusFilter === 'active' 
                      ? 'bg-emerald-600 text-white shadow' 
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <span>کاربران فعال</span>
                  <span className="bg-emerald-950 px-1.5 py-0.2 rounded-full text-[10px] text-emerald-300">
                    {users.filter(u => u.isActive).length}
                  </span>
                </button>
                <button
                  onClick={() => setUserStatusFilter('inactive')}
                  className={`px-3 py-1 rounded-xl transition cursor-pointer flex items-center gap-1 ${
                    userStatusFilter === 'inactive' 
                      ? 'bg-amber-600 text-white shadow' 
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <span>کاربران غیرفعال / مسدود</span>
                  <span className="bg-amber-950 px-1.5 py-0.2 rounded-full text-[10px] text-amber-300">
                    {users.filter(u => !u.isActive).length}
                  </span>
                </button>
              </div>
            </div>

            <button
              onClick={handleOpenAddUser}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>افزودن کاربر جدید</span>
            </button>
          </div>

          {/* Search + Domain filter — search matches name/username/role title/roles/branches
              (financial cost centers + sales branches); domain filter matches by RBAC role domain. */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder="جست‌وجو بر اساس نام، نام کاربری، نقش یا شعبه..."
              className="flex-1 min-w-[220px] bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={userDomainFilter}
              onChange={(e) => setUserDomainFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">همه دامنه‌های نقش</option>
              {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">نام و نام خانوادگی</th>
                    <th className="p-3.5">نام کاربری</th>
                    <th className="p-3.5">رمز عبور</th>
                    <th className="p-3.5">تلفن و ایمیل</th>
                    <th className="p-3.5">نقش / عنوان شغلی</th>
                    <th className="p-3.5">شرکت و شعبه مربوطه</th>
                    <th className="p-3.5">سازمان فروش</th>
                    <th className="p-3.5">وضعیت</th>
                    <th className="p-3.5 text-center">عملیات ادمین</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users
                    .filter(u => {
                      if (userStatusFilter === 'active') return u.isActive;
                      if (userStatusFilter === 'inactive') return !u.isActive;
                      return true;
                    })
                    .filter(u => {
                      if (userDomainFilter === 'all') return true;
                      return getAssignedRoleIds(u).some((rId) => roles.find((r) => r.id === rId)?.domain === userDomainFilter);
                    })
                    .filter(u => {
                      const q = userSearchQuery.trim().toLowerCase();
                      if (!q) return true;
                      const branchNames = (u.allowedCostCenterIds || []).map((ccId) => costCenters.find((c) => c.id === ccId)?.name || '').join(' ');
                      const activeAssignment = getActiveSalesAssignment(u.id, salesOrgAssignments);
                      const salesBranchNames = (activeAssignment?.salesBranchIds || []).map((bId) => salesBranches.find((b) => b.id === bId)?.name || '').join(' ');
                      const haystack = [u.fullName, u.username, u.roleTitle, branchNames, salesBranchNames, ...getAssignedRoleIds(u).map((rId) => roles.find((r) => r.id === rId)?.name || '')].join(' ').toLowerCase();
                      return haystack.includes(q);
                    })
                    .map((u) => {
                    const comp = companies.find(c => c.id === u.companyId);
                    const cc = costCenters.find(c => c.id === u.costCenterId);
                    const isPassVisible = showPasswordMap[u.id];
                    const roleChips = getAssignedRoleIds(u).map((rId) => {
                      const r = roles.find((rr) => rr.id === rId);
                      return { id: rId, label: r?.name || rId, domain: r?.domain || 'general' };
                    });
                    const userSalesAssignment = getActiveSalesAssignment(u.id, salesOrgAssignments);
                    const userSalesChain = userSalesAssignment ? resolveSalesHierarchy(u.id, salesOrgAssignments, users) : null;

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                            {u.fullName.slice(0, 1)}
                          </div>
                          <span>{u.fullName}</span>
                        </td>

                        <td className="p-3.5 font-mono font-bold text-indigo-300">{u.username}</td>

                        <td className="p-3.5 font-mono">
                          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 w-fit">
                            <span>{isPassVisible ? (u.password || '123456') : '••••••••'}</span>
                            <button
                              onClick={() => toggleShowPassword(u.id)}
                              className="text-slate-400 hover:text-white"
                              title={isPassVisible ? 'مخفی کردن' : 'نمایش رمز'}
                            >
                              {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-mono text-slate-200">{u.phone}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{u.email}</div>
                        </td>

                        <td className="p-3.5">
                          <span className="font-bold text-slate-200 block mb-1">{u.roleTitle}</span>
                          <div className="flex flex-wrap gap-1">
                            {roleChips.map((chip) => (
                              <span
                                key={chip.id}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DOMAIN_BADGE_CLASSES[chip.domain] || DOMAIN_BADGE_CLASSES.general}`}
                                title={DOMAIN_LABELS[chip.domain] || chip.domain}
                              >
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="p-3.5 max-w-[220px]">
                          {u.allowedCostCenterIds && u.allowedCostCenterIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.allowedCostCenterIds.slice(0, 3).map(ccId => {
                                const branchObj = costCenters.find(c => c.id === ccId);
                                return (
                                  <span key={ccId} className="text-[10px] bg-slate-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900/60 font-bold">
                                    {branchObj?.name || ccId}
                                  </span>
                                );
                              })}
                              {u.allowedCostCenterIds.length > 3 && (
                                <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800 font-bold">
                                  +{u.allowedCostCenterIds.length - 3} شعبه دیگر
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-slate-300 font-bold">{cc?.name || 'دفتر مرکزی'}</div>
                          )}
                          <div className="text-[10px] text-slate-500 mt-0.5">{comp?.name || 'گروه شاواز'}</div>
                        </td>

                        <td className="p-3.5 max-w-[200px]">
                          {userSalesAssignment ? (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-emerald-300 block">
                                {SALES_ROLE_SHORT_LABEL[userSalesAssignment.salesRoleId] || userSalesAssignment.salesRoleId}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {userSalesAssignment.salesBranchIds.slice(0, 2).map((bId) => (
                                  <span key={bId} className="text-[10px] bg-slate-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-900/60 font-bold">
                                    {salesBranches.find((b) => b.id === bId)?.name || bId}
                                  </span>
                                ))}
                                {userSalesAssignment.salesBranchIds.length > 2 && (
                                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800 font-bold">
                                    +{userSalesAssignment.salesBranchIds.length - 2}
                                  </span>
                                )}
                              </div>
                              {userSalesChain?.ok === false ? (
                                <span className="text-[9px] text-rose-300 font-bold flex items-center gap-1" title={userSalesChain.reason}>
                                  <ShieldAlert className="w-3 h-3" /> زنجیره ناقص
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-400 font-bold">زنجیره کامل</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 w-fit ${
                            u.isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          }`}>
                            {u.isActive ? 'فعال' : 'در انتظار تایید ادمین'}
                          </span>
                        </td>

                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Impersonate / Login as User Button — rendered only when
                                canStartImpersonation would actually succeed for this target:
                                real actor must be the true admin (not merely a permission
                                holder), no nested session already open, target active. */}
                            {onImpersonateUser && u.id !== currentUser?.id &&
                              canStartImpersonation(realActor, impersonatorAdmin, u, realActorPermissions).ok && (
                              <button
                                onClick={() => onImpersonateUser(u)}
                                className="p-1.5 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white rounded-lg transition"
                                title={`ورود به حساب کاربر (${u.fullName}) - شبیه‌سازی کامل دسترسی`}
                              >
                                <LogIn className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-lg transition"
                              title="ویرایش اطلاعات کاربر"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Quick Change Password */}
                            <button
                              onClick={() => {
                                setPasswordChangeUser(u);
                                setNewPasswordValue(u.password || '');
                              }}
                              className="p-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-slate-950 rounded-lg transition"
                              title="تغییر سریع رمز عبور"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>

                            {/* Active/Inactive Toggle */}
                            <button
                              onClick={() => handleToggleUserActive(u.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition flex items-center gap-1 cursor-pointer ${
                                u.isActive 
                                  ? 'bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-rose-950/50' 
                                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                              }`}
                            >
                              {u.isActive ? 'غیرفعال‌سازی' : 'تایید و فعال‌سازی'}
                            </button>

                            {/* Delete User */}
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 bg-rose-600/20 text-rose-300 hover:bg-rose-600 hover:text-white rounded-lg transition"
                              title="حذف کاربر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cost Centers Sub-Tab Content */}
      {activeSubTab === 'cost_centers' && (
        <CostCentersView
          costCenters={costCenters}
          companies={companies}
          requests={requests}
          currentUser={currentUser}
          onUpdateCostCenters={onUpdateCostCenters}
        />
      )}

      {/* Companies Sub-Tab Content */}
      {activeSubTab === 'companies' && (
        <CompaniesView
          companies={companies}
          currentUser={currentUser}
          onUpdateCompanies={onUpdateCompanies}
        />
      )}

      {/* Add / Edit User Modal */}
      {(showAddUserModal || editingUser) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              <span>{editingUser ? 'ویرایش کاربر و تعیین دسترسی' : 'افزودن کاربر و تعریف دسترسی جدید'}</span>
            </h3>
            
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="رضا حسینی"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نام کاربری (نام ورود)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="r.hoseini"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">رمز عبور کاربر</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="123456"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">شماره همراه (موبایل)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09121112233"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">ایمیل</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hoseini@shavaz.com"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نقش دقیق سیستمی (RBAC)</label>
                <span className="text-[10px] text-slate-400 block mb-1">
                  همان دسترسی‌هایی که در «نقش‌ها و دسترسی‌ها» تعریف کرده‌اید، اینجا اعمال می‌شود — چیزی که تیک نخورده باشد، این کاربر اصلاً نمی‌بیند. نقش قدیمی (Legacy) دیگر از این‌جا انتخاب نمی‌شود؛ برای گردش‌کارهای خزانه‌داری که هنوز به آن وابسته‌اند، خودکار و فقط بر اساس همین نقش محاسبه می‌شود.
                </span>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.isSystemRole ? '' : ' (سفارشی)'}</option>
                  ))}
                </select>
              </div>

              {isSalesOrgRole && (
                <div className="p-3.5 bg-slate-950/90 border border-emerald-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-extrabold">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span>سازمان فروش — {SALES_ROLE_SHORT_LABEL[roleId] || roleId}</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      {roleId === 'role_salesperson' ? 'شعبه فروش (دقیقاً یک شعبه)' : 'شعبه‌های فروش تحت مدیریت'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1">
                      {salesBranches.filter((b) => b.isActive).map((b) => {
                        const isSelected = salesBranchIds.includes(b.id);
                        return (
                          <label key={b.id} className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                            isSelected ? 'bg-emerald-600/30 border-emerald-500 text-white' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                          }`}>
                            <input
                              type={roleId === 'role_salesperson' ? 'radio' : 'checkbox'}
                              name="sales-branch"
                              checked={isSelected}
                              onChange={() => {
                                if (roleId === 'role_salesperson') { setSalesBranchIds([b.id]); return; }
                                setSalesBranchIds(isSelected ? salesBranchIds.filter((id) => id !== b.id) : [...salesBranchIds, b.id]);
                              }}
                              className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-700 bg-slate-800 focus:ring-emerald-500"
                            />
                            <span className="truncate text-[11px]">{b.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">مدیر مستقیم در سازمان فروش</label>
                    {salesAllowedParentRoleIds.length === 0 ? (
                      <p className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-3 py-2">
                        بالاترین سطح سازمان فروش (معاونت فروش) — بدون مدیر مستقیم.
                      </p>
                    ) : (
                      <select
                        value={salesDirectManagerUserId}
                        onChange={(e) => setSalesDirectManagerUserId(e.target.value)}
                        className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">— انتخاب مدیر مستقیم —</option>
                        {users
                          .filter((u) => u.id !== editingUser?.id && salesAllowedParentRoleIds.includes(getActiveSalesAssignment(u.id, salesOrgAssignments)?.salesRoleId || ''))
                          .map((u) => (
                            <option key={u.id} value={u.id}>{u.fullName} ({SALES_ROLE_SHORT_LABEL[getActiveSalesAssignment(u.id, salesOrgAssignments)?.salesRoleId || ''] || ''})</option>
                          ))}
                      </select>
                    )}
                  </div>

                  <div className="text-[11px] rounded-xl px-3 py-2 border bg-slate-900/70 border-slate-800">
                    <span className="block font-bold text-slate-300 mb-1">پیش‌نمایش زنجیره کامل:</span>
                    {salesChainPreview?.ok === true ? (
                      <span className="text-emerald-300">{salesChainPreview.chainLabel}</span>
                    ) : (
                      <span className="text-rose-300">{salesChainPreview?.reason || 'ناقص'}</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">عنوان شغلی رسمی</label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="مثال: سرپرست فروش شعب یا مسول خرید"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-0.5">شرکت مربوطه (پیش‌فرض)</label>
                  <span className="text-[10px] text-slate-400 block mb-1">پیش‌فرض اولیه در ثبت درخواست</span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                  >
                    <option value="">— بدون شرکت خاص (کاربر عمومی سیستم) —</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-0.5">مرکز هزینه / شعبه اصلی (پیش‌فرض)</label>
                  <span className="text-[10px] text-slate-400 block mb-1">شعبه اصلی کاربر در فرم اولیه</span>
                  <select
                    value={costCenterId}
                    onChange={(e) => setCostCenterId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                  >
                    <option value="">— بدون شعبه خاص —</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Accordion Expand/Collapse All */}
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                <span className="font-bold text-slate-300">تنظیمات پیشرفته و سطوح دسترسی (کشویی):</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAllSections}
                    className="text-indigo-400 hover:underline font-bold cursor-pointer"
                  >
                    باز کردن همه کشوها
                  </button>
                  <span>|</span>
                  <button
                    type="button"
                    onClick={collapseAllSections}
                    className="text-rose-400 hover:underline font-bold cursor-pointer"
                  >
                    بستن همه کشوها
                  </button>
                </div>
              </div>

              {/* Multi-Select Branches Box — مرکز هزینه مالی، فقط برای کاربری که واقعاً نقش
                  مالی/خزانه‌داری دارد؛ برای کاربر خالص فروش نمایش داده نمی‌شود (شعبهٔ فروش او
                  از بخش «سازمان فروش» بالا مدیریت می‌شود، نه از این‌جا). */}
              {showFinancialSection && (
              <div className="p-3.5 bg-slate-950/90 border border-indigo-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('branches')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-xs font-extrabold text-indigo-300 truncate">
                      {role === 'requestor'
                        ? 'شعب و مراکزی که این درخواست‌کننده مجاز به ثبت درخواست در آن‌هاست'
                        : role === 'approver'
                        ? 'شعب و مراکزی که این تاییدکننده مجاز به بررسی و تایید آن‌هاست'
                        : 'دسترسی شعب و مراکز هزینه (مدیریت کل)'}
                    </span>
                    <span className="text-[10px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-800/60 shrink-0">
                      {allowedCostCenterIds.length} شعبه مجاز
                    </span>
                  </div>
                  {openSections.branches ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.branches && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setAllowedCostCenterIds(costCenters.map(cc => cc.id))}
                        className="text-indigo-400 hover:underline font-bold cursor-pointer"
                      >
                        انتخاب همه شعب
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setAllowedCostCenterIds([])}
                        className="text-rose-400 hover:underline font-bold cursor-pointer"
                      >
                        پاک کردن
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      {role === 'requestor'
                        ? 'تیک تمام شعب و مراکز هزینه‌ای که این شخص مجاز است برای آن‌ها درخواست پرداخت ثبت کند را بزنید:'
                        : role === 'approver'
                        ? 'تیک تمام شعب و مراکز هزینه‌ای که این شخص مجاز است فاکتورها و درخواست‌هایشان را تایید کند بزنید:'
                        : 'کاربر با این نقش، مدیر کل سیستم بوده و به تمامی شعب و مراکز هزینه دسترسی کامل دارد.'}
                    </p>

                    <div className="max-h-56 overflow-y-auto p-1 space-y-3">
                      {companies.map((comp) => {
                        const compCCs = costCenters.filter(cc => cc.companyId === comp.id);
                        if (compCCs.length === 0) return null;
                        const allCompSelected = compCCs.every(c => allowedCostCenterIds.includes(c.id));
                        return (
                          <div key={comp.id} className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="text-amber-300 flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-amber-400" />
                                {comp.name} ({comp.code})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const compIds = compCCs.map(c => c.id);
                                  if (allCompSelected) {
                                    setAllowedCostCenterIds(allowedCostCenterIds.filter(id => !compIds.includes(id)));
                                  } else {
                                    setAllowedCostCenterIds(Array.from(new Set([...allowedCostCenterIds, ...compIds])));
                                  }
                                }}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold hover:underline cursor-pointer"
                              >
                                {allCompSelected ? 'حذف همه شعب این شرکت' : 'انتخاب همه شعب این شرکت'}
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {compCCs.map((cc) => {
                                const isSelected = allowedCostCenterIds.includes(cc.id);
                                return (
                                  <label
                                    key={cc.id}
                                    className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                                      isSelected
                                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow'
                                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setAllowedCostCenterIds([...allowedCostCenterIds, cc.id]);
                                        } else {
                                          setAllowedCostCenterIds(allowedCostCenterIds.filter(id => id !== cc.id));
                                        }
                                      }}
                                      className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                                    />
                                    <span className="truncate text-[11px]">{cc.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Multi-Role Access Model: additional roles + per-role permission overrides.
                  Replaces the old standalone task-directive box, custom-permissions box,
                  and manual dual-role checkbox — isDualRole is now derived automatically
                  from the selected role set (see deriveIsDualRoleFromRoles). */}
              <div className="p-3.5 bg-slate-950/90 border border-violet-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('multiRole')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-wrap">
                    <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="text-xs font-extrabold text-violet-300 truncate">
                      نقش‌های چندگانه و دسترسی‌های تفکیکی این کاربر
                    </span>
                    <span className="text-[10px] font-bold bg-violet-950 text-violet-300 px-2 py-0.5 rounded-full border border-violet-800/60 shrink-0">
                      {1 + additionalRoleIds.length} نقش فعال
                    </span>
                    {derivedIsDualRole && (
                      <span className="text-[10px] font-bold bg-fuchsia-950 text-fuchsia-300 px-2 py-0.5 rounded-full border border-fuchsia-800/60 shrink-0">
                        نقش دوگانه (خودکار)
                      </span>
                    )}
                  </div>
                  {openSections.multiRole ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.multiRole && (
                  <div className="pt-2 border-t border-slate-800 space-y-3 animate-fade-in">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      علاوه بر «نقش پایه» بالا، می‌توانید نقش‌های سیستمی دیگری هم برای این کاربر فعال کنید (مثلاً هم‌زمان درخواست‌کننده و تاییدکننده)، و برای هر نقش فعال، پرمیشن‌هایش را فقط برای همین کاربر محدود یا گسترش دهید. اگر ترکیب نقش‌های فعال شامل هم یک نقش درخواست‌کننده‌مانند و هم یک نقش تاییدکننده‌مانند باشد، «نقش دوگانه» این کاربر به‌صورت خودکار فعال می‌شود.
                    </p>

                    {/* Task-directive access: auto-suggested from the selected roles above,
                        always manually overridable by the admin. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-start gap-2 cursor-pointer transition ${
                        canIssueTasks
                          ? 'bg-indigo-950/50 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="checkbox"
                          checked={canIssueTasks}
                          onChange={(e) => setCanIssueTasks(e.target.checked)}
                          className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="block text-indigo-300 font-extrabold mb-0.5">صادرکننده دستورات اداری</span>
                          <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                            اجازه ثبت کار محوله جدید و ارجاع به سایر پرسنل (پیشنهاد خودکار بر اساس نقش‌های انتخابی؛ قابل تغییر دستی).
                          </span>
                        </div>
                      </label>

                      <label className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-start gap-2 cursor-pointer transition ${
                        canExecuteTasks
                          ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="checkbox"
                          checked={canExecuteTasks}
                          onChange={(e) => setCanExecuteTasks(e.target.checked)}
                          className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-700 bg-slate-800 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="block text-emerald-300 font-extrabold mb-0.5">مجری کارهای محوله</span>
                          <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                            امکان دریافت و انجام دستورات اداری (پیشنهاد خودکار بر اساس نقش‌های انتخابی؛ قابل تغییر دستی).
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="space-y-2">
                      {roles.map((r) => {
                        const isBase = r.id === roleId;
                        const isChecked = isBase || additionalRoleIds.includes(r.id);
                        const isPanelOpen = !!openRolePanels[r.id];
                        const hasOverride = roleAccessOverrides.some((o) => o.roleId === r.id);
                        const effectivePerms = getRoleEffectivePermissions(r.id);

                        return (
                          <div key={r.id} className={`rounded-xl border ${isChecked ? 'border-violet-500/50 bg-violet-950/20' : 'border-slate-800 bg-slate-900/60'}`}>
                            <div className="p-2.5 flex items-center justify-between gap-2 flex-wrap">
                              <label className={`flex items-center gap-2.5 flex-1 min-w-[160px] ${isBase ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isBase}
                                  onChange={() => toggleAdditionalRole(r.id)}
                                  className="w-4 h-4 text-violet-600 rounded border-slate-700 bg-slate-800 focus:ring-violet-500 disabled:opacity-60"
                                />
                                <span className="text-xs font-bold text-white">{r.name}</span>
                                {isBase && <span className="text-[9px] text-violet-300 font-bold">(نقش پایه)</span>}
                                {hasOverride && <span className="text-[9px] text-amber-300 font-bold">(دسترسی سفارشی)</span>}
                              </label>
                              {isChecked && (
                                <button
                                  type="button"
                                  onClick={() => setOpenRolePanels((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                                  className="text-[10px] text-violet-400 hover:text-violet-300 font-bold hover:underline cursor-pointer shrink-0"
                                >
                                  {isPanelOpen ? 'بستن پرمیشن‌ها' : `پرمیشن‌ها (${effectivePerms.length})`}
                                </button>
                              )}
                            </div>

                            {isChecked && isPanelOpen && (
                              <div className="px-2.5 pb-2.5 pt-1.5 border-t border-slate-800/80 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500">پرمیشن‌های این نقش، مخصوص همین کاربر:</span>
                                  {hasOverride && (
                                    <button
                                      type="button"
                                      onClick={() => resetRolePermissionOverride(r.id)}
                                      className="text-[10px] text-rose-400 hover:underline font-bold cursor-pointer"
                                    >
                                      بازگشت به پیش‌فرض نقش
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                                  {ALL_PERMISSIONS.map((p) => {
                                    const checked = effectivePerms.includes(p.key);
                                    return (
                                      <label key={p.key} className={`p-2 rounded-lg border text-[10.5px] font-bold flex items-start gap-2 cursor-pointer transition ${
                                        checked ? 'bg-violet-950/50 border-violet-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                                      }`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleRolePermissionOverride(r.id, p.key)}
                                          className="w-3.5 h-3.5 mt-0.5 text-violet-600 rounded border-slate-700 bg-slate-800 focus:ring-violet-500"
                                        />
                                        <span>{p.title}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Territory & Denied Permissions: general org supervisor (reportsToUserId,
                  independent of salesSupervisorId/approvalChain), per-role visibility scope
                  (own by default — company/branch only when explicitly assigned here), and
                  a user-specific deny list that always wins over granted role permissions. */}
              <div className="p-3.5 bg-slate-950/90 border border-sky-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('territory')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden flex-wrap">
                    <MapPin className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-xs font-extrabold text-sky-300 truncate">
                      قلمرو سازمانی و محرومیت‌های دسترسی این کاربر
                    </span>
                    {deniedPermissions.length > 0 && (
                      <span className="text-[10px] font-bold bg-rose-950 text-rose-300 px-2 py-0.5 rounded-full border border-rose-800/60 shrink-0">
                        {deniedPermissions.length} مجوز محروم
                      </span>
                    )}
                  </div>
                  {openSections.territory ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.territory && (
                  <div className="pt-2 border-t border-slate-800 space-y-3 animate-fade-in">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        سرپرست سازمانی مستقیم (زنجیره عمومی گزارش‌دهی)
                      </label>
                      <select
                        value={reportsToUserId}
                        onChange={(e) => setReportsToUserId(e.target.value)}
                        className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-sky-500"
                      >
                        <option value="">بدون سرپرست مشخص</option>
                        {users.filter(u => u.id !== editingUser?.id).map(u => (
                          <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        فقط برای محاسبه قلمرو دید سازمانی (زیرمجموعه مستقیم / کل زیرشاخه) استفاده می‌شود — مستقل از سلسله‌مراتب فروش و زنجیره تایید مالی.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-400">
                        قلمرو دید هر نقش فعال این کاربر (پیش‌فرض «فقط خودم» — هیچ نقشی بدون تخصیص صریح، دسترسی گسترده‌تر ندارد):
                      </p>
                      {[roleId, ...additionalRoleIds].map((rId) => {
                        const r = roles.find(rr => rr.id === rId);
                        if (!r) return null;
                        const scope = getRoleScope(rId);
                        return (
                          <div key={rId} className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
                            <span className="text-xs font-bold text-white">{r.name}</span>
                            <select
                              value={scope.scopeType}
                              onChange={(e) => setRoleScopeType(rId, e.target.value as any)}
                              className="w-full bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-sky-500"
                            >
                              <option value="own">فقط خودم</option>
                              <option value="direct_reports">زیرمجموعه مستقیم</option>
                              <option value="subtree">کل زیرشاخه سازمانی</option>
                              <option value="company">کل یک شرکت</option>
                              <option value="branch">یک شعبه / مرکز هزینه</option>
                            </select>
                            {scope.scopeType === 'company' && (
                              <select
                                value={scope.companyId || ''}
                                onChange={(e) => setRoleScopeTarget(rId, 'companyId', e.target.value)}
                                className="w-full bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-sky-500"
                              >
                                <option value="">انتخاب شرکت...</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}
                            {scope.scopeType === 'branch' && (
                              <select
                                value={scope.costCenterId || ''}
                                onChange={(e) => setRoleScopeTarget(rId, 'costCenterId', e.target.value)}
                                className="w-full bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-sky-500"
                              >
                                <option value="">انتخاب شعبه...</option>
                                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                        محرومیت اختصاصی از مجوز (اولویت بالاتر از هر نقش اعطاشده)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                        {ALL_PERMISSIONS.map((p) => {
                          const checked = deniedPermissions.includes(p.key);
                          return (
                            <label key={p.key} className={`p-2 rounded-lg border text-[10.5px] font-bold flex items-start gap-2 cursor-pointer transition ${
                              checked ? 'bg-rose-950/50 border-rose-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDeniedPermission(p.key)}
                                className="w-3.5 h-3.5 mt-0.5 text-rose-600 rounded border-slate-700 bg-slate-800 focus:ring-rose-500"
                              />
                              <span>{p.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Workflow & Permission Architecture Section Header */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-extrabold">
                  <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>راهنمای پیکربندی گردش کار و ارجاعات کاربر</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  تنظیمات این بخش مستقل و مکمل یکدیگرند:
                  <strong className="text-slate-300"> نقش‌های چندگانه</strong> (که نقش دوگانه به‌صورت خودکار از آن مشتق می‌شود)،
                  <strong className="text-slate-300"> مراحل تایید</strong> برای مسیر درخواست‌های این کاربر، و
                  <strong className="text-slate-300"> مقصدهای ارجاع</strong> برای کارتابل بررسی این فرد است.
                </p>
              </div>

              {/* Senior Treasury Supervisor Designation + Approval Chain — فقط برای کاربری که
                  واقعاً نقش مالی/خزانه‌داری دارد؛ برای کاربر خالص فروش هرگز نمایش/پیش‌فرض‌دهی
                  نمی‌شود (بند ۵-د مأموریت بازسازی کاربران/نقش‌ها/سازمان فروش). */}
              {showFinancialSection && (<>
              <div className="p-3.5 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('seniorSupervisor')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-extrabold text-amber-300 truncate">
                      تعیین سرپرست ارشد خزانه‌داری
                    </span>
                    {isSeniorTreasurySupervisor && (
                      <span className="text-[10px] font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/60 shrink-0">
                        سرپرست ارشد
                      </span>
                    )}
                  </div>
                  {openSections.seniorSupervisor ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.seniorSupervisor && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                      isSeniorTreasurySupervisor
                        ? 'bg-amber-950/50 border-amber-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isSeniorTreasurySupervisor}
                        onChange={(e) => setIsSeniorTreasurySupervisor(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-700 bg-slate-800 focus:ring-amber-500"
                      />
                      <div>
                        <span className="block text-amber-300 font-extrabold mb-0.5">این کاربر «سرپرست ارشد خزانه‌داری» است</span>
                        <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                          مقصد نهایی درخواست‌های شخصی کاربران دوگانه. فقط یک نفر در سازمان می‌تواند این عنوان را داشته باشد؛
                          با فعال‌سازی این گزینه برای این کاربر، از سایرین سلب می‌شود.
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Flexible Approval Chain Route Configuration (1, 2, or 3 Steps) */}
              <div className="p-3.5 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-3">
                <button
                  type="button"
                  onClick={() => toggleSection('chain')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-extrabold text-amber-300 truncate">
                      ۲. تعیین مراحل تایید درخواست‌های ارسالی این کاربر
                    </span>
                    <span className="text-[10px] font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded-full border border-amber-800/60 shrink-0">
                      {chainStepsCount} مرحله‌ای
                    </span>
                  </div>
                  {openSections.chain ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.chain && (
                  <div className="pt-2 border-t border-slate-800 space-y-3 animate-fade-in">
                    
                    {/* Primary Toggle for Create Request Permission placed right at the top of Section 2 */}
                    <label className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                      canCreateRequests 
                        ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-md' 
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      <input
                        type="checkbox"
                        checked={canCreateRequests}
                        onChange={(e) => setCanCreateRequests(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-700 bg-slate-800 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="block text-emerald-300 font-extrabold mb-0.5">
                          مجوز ایجاد و ثبت درخواست جدید (پرداخت فاکتور / تنخواه)
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal leading-relaxed block">
                          نمایش دکمه «ثبت درخواست جدید» در منوی کناری و هدر. با فعال کردن این گزینه، این کاربر با هر نقشی (تاییدکننده مالی، مجری واریز، سرپرست یا...) می‌تواند برای خود یا حوزه کاری‌اش درخواست پرداخت ثبت کند.
                        </span>
                      </div>
                    </label>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      مشخص می‌کند وقتی این کاربر درخواستی ثبت می‌کند (اگر کاربر دوگانه نباشد)، به ترتیب از چه تاییدکنندگانی عبور کند:
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">تعداد مراحل تایید متوالی:</span>
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(1)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 1 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۱ تاییدکننده
                        </button>
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(2)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 2 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۲ تاییدکننده
                        </button>
                        <button
                          type="button"
                          onClick={() => setChainStepsCount(3)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                            chainStepsCount === 3 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ۳ تاییدکننده
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                        <div className="text-[10px] font-bold text-indigo-300">مرحله ۱: تاییدکننده اول</div>
                        <select
                          value={step1ApproverId}
                          onChange={(e) => setStep1ApproverId(e.target.value)}
                          className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                        >
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                          ))}
                        </select>
                      </div>

                      {chainStepsCount >= 2 && (
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold text-amber-300">مرحله ۲: تاییدکننده دوم</div>
                          <select
                            value={step2ApproverId}
                            onChange={(e) => setStep2ApproverId(e.target.value)}
                            className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                          >
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {chainStepsCount >= 3 && (
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-[10px] font-bold text-emerald-300">مرحله ۳: تاییدکننده سوم</div>
                          <select
                            value={step3ApproverId}
                            onChange={(e) => setStep3ApproverId(e.target.value)}
                            className="w-full bg-slate-800 text-white text-[11px] rounded-lg p-1.5 border border-slate-700 focus:outline-none"
                          >
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="pt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="allow-direct-treasury"
                        checked={allowDirectToTreasury}
                        onChange={(e) => setAllowDirectToTreasury(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500"
                      />
                      <label htmlFor="allow-direct-treasury" className="text-xs font-bold text-indigo-200 cursor-pointer">
                        اجازه ارسال مستقیم ۵۰٪ درخواست‌ها به رضا بیات (مدیر خزانه‌داری)
                      </label>
                    </div>
                  </div>
                )}
              </div>
              </>)}

              {/* Approve & Forward destinations - restricts who this approver can send requests to;
                  گیت شده پشت همان showFinancialSection چون مختص کارتابل تاییدکنندگان است. */}
              {showFinancialSection && (
              <div className="p-3.5 bg-slate-950/90 border border-teal-500/30 rounded-2xl space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleSection('forward')}
                  className="w-full flex items-center justify-between cursor-pointer text-right"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Send className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="text-xs font-extrabold text-teal-300 truncate">
                      ۳. مقصدهای مجاز ارجاع (ویژه کارتابل تایید و ارجاع)
                    </span>
                    <span className="text-[10px] font-bold bg-teal-950 text-teal-300 px-2 py-0.5 rounded-full border border-teal-800/60 shrink-0">
                      {allowedApproverIds.length} مقصد مجاز
                    </span>
                  </div>
                  {openSections.forward ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {openSections.forward && (
                  <div className="pt-2 border-t border-slate-800 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setAllowedApproverIds(users.filter(u => u.id !== editingUser?.id).map(u => u.id))}
                        className="text-teal-400 hover:underline font-bold cursor-pointer"
                      >
                        انتخاب همه
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setAllowedApproverIds([])}
                        className="text-rose-400 hover:underline font-bold cursor-pointer"
                      >
                        پاک کردن
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      مختص کاربران تاییدکننده: مشخص می‌کند این کاربر هنگام بررسی پرونده دیگران در کارتابل، درخواست را فقط به چه کسانی می‌تواند «تایید و ارجاع» دهد:
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1">
                      {users.filter(u => u.id !== editingUser?.id).map((u) => {
                        const isSelected = allowedApproverIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                              isSelected
                                ? 'bg-teal-600/30 border-teal-500 text-white shadow'
                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAllowedApproverIds([...allowedApproverIds, u.id]);
                                } else {
                                  setAllowedApproverIds(allowedApproverIds.filter(id => id !== u.id));
                                }
                              }}
                              className="w-4 h-4 text-teal-600 rounded border-slate-700 bg-slate-800 focus:ring-teal-500"
                            />
                            <span className="truncate">{u.fullName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  {editingUser ? 'ذخیره تغییرات کاربر' : 'ایجاد کاربر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Password Change Modal */}
      {passwordChangeUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>تغییر رمز عبور برای: {passwordChangeUser.fullName}</span>
            </h3>

            <form onSubmit={handleQuickPasswordChange} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رمز عبور جدید</label>
                <input
                  type="text"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  required
                  placeholder="رمز جدید را وارد کنید..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordChangeUser(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition"
                >
                  تغییر رمز عبور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
