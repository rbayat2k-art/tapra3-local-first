import {useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode} from 'react';
import {
  Activity, ArrowLeft, ArrowRight, AtSign, BadgeCheck, Bell, BellRing, Building2, Check, CheckCheck, CheckCircle2, ChevronDown, CircleAlert,
  BriefcaseBusiness, Database, Download, Eye, FileClock, FileJson, Fingerprint, FlaskConical, GitBranch, HardDrive, KeyRound, LayoutDashboard,
  LockKeyhole, LogIn, LogOut, Menu, MessageSquareText, Monitor, Moon, MoreVertical, Palette, Pencil, Phone, RotateCcw, ScrollText, Shield, ShieldCheck,
  SlidersHorizontal, Sparkles, Sun, Upload, UserCheck, UserCog, UserPlus, UserRound, UserX, UsersRound, Workflow, X, Network, ContactRound, EyeOff,
  PanelRightClose, PanelRightOpen, Headphones, Search,
  type LucideIcon,
} from 'lucide-react';
import {authorize, can} from './authorization';
import type {
  AuthorizationDecision, DemoResource, EncryptedSnapshot, FoundationState, LocalUser, PermissionCode, QaPersona,
  SnapshotManifest, UserNotification, UserStatus,
} from './model';
import {FOUNDATION_SCHEMA_VERSION} from './model';
import {PERMISSION_CATALOG, ROLE_TEMPLATES} from './seed';
import {LocalFoundationService, isEncryptedSnapshot, type SelfCredentialChangeInput, type UserInput} from './service';
import {positionSupportsUnit, positionsForUnit} from './unitPosition';
import {OrganizationOverviewPage, PositionsPage, RolesPage, UnitsPage} from './OrganizationPages';
import {PersonnelPage} from './PersonnelPages';
import {CustomersPage} from './CustomerPages';
import {ERP_MODULES, permissionFor} from './erpCatalog';
import {ErpWorkspacePage} from './ErpWorkspacePage';
import {RegistrationDialog, RegistrationPage} from './RegistrationPage';
import {BranchesPage} from './BranchesPage';
import {SalesStructuresPage} from './SalesStructuresPage';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import {formatPersianDateTime} from './PersianDate';
import {ProfileCompletionGate} from './ProfileCompletionGate';
import {isProfileComplete, type ProfileCompletionInput} from './profileCompletion';
import {MyAccountPage} from './MyAccountPage';
import {dashboardCapabilitiesFor, type DashboardCapability} from './organizationAccess';
import {digitsOnly, normalizeIranianMobile} from '../utils/operationalFormat';
import {pageFromUrl, pageRouteUrl} from './navigationUrl';
import {WorkflowAdminPage} from './WorkflowAdminPage';
import {RecruitmentPage} from './RecruitmentPage';

type PageId = string;
type ThemePreference = 'light' | 'dark' | 'system';
type FontSizePreference = 'standard' | 'large' | 'xlarge';
type DensityPreference = 'compact' | 'comfortable' | 'spacious';
interface UiPreferences { theme: ThemePreference; fontSize: FontSizePreference; density: DensityPreference; columnGap: number; reduceMotion: boolean; highContrast: boolean; }

interface NavigationItem {
  id: PageId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  anyPermissions: PermissionCode[];
  group: string;
}

const DOMAIN_PAGE_MODULES: Record<string, string[]> = {
  hcm: ['employment-contract','onboarding','offboarding','attendance','shift','leave','mission','overtime','employee-advance','employee-loan','performance-review','training','personnel-document'],
  crm: ['lead','call','followup','opportunity'], sales: ['quote','sale','invoice','payment'], marketing: ['campaign','promotion'], catalog: ['catalog-item','price-list'],
  procurement: ['purchase-request','rfq','supplier-offer','offer-comparison','purchase-order','matching'], suppliers: ['supplier','supplier-invoice'], finance: ['cost-center','budget','finance-request'], treasury: ['bank-account','treasury-execution'], accounting: ['chart-account','accounting-period','journal-entry','bank-reconciliation'],
  warehouse: ['warehouse-master','location','inventory-item','receipt','reservation','transfer','adjustment','count','return','inventory-movement'], logistics: ['shipment','delivery'], service: ['service-case','service-evidence'], support: ['support-case','support-transaction'], contracts: ['contract'], assets: ['fixed-asset','asset-transfer','asset-maintenance'], tasks: ['task'], communications: ['chat','message'], letters: ['letter'], documents: ['document'],
};
const modulePermissions = (page: string) => (DOMAIN_PAGE_MODULES[page] ?? []).map((moduleId) => permissionFor(moduleId, 'view'));

const NAVIGATION: NavigationItem[] = [
  {id: 'dashboard', title: 'نمای امروز', subtitle: 'وضعیت بنیاد محلی', icon: LayoutDashboard, anyPermissions: ['foundation.dashboard.view'], group: 'کار روزانه'},
  {id: 'organization', title: 'نمای سازمان', subtitle: 'ساختار شرکت در یک نگاه', icon: Network, anyPermissions: ['organization.overview.view'], group: 'سازمان'},
  {id: 'units', title: 'واحدهای سازمانی', subtitle: 'ساختار، والد و مسئول', icon: GitBranch, anyPermissions: ['organization.units.view'], group: 'سازمان'},
  {id: 'branches', title: 'شعبه', subtitle: 'شعبه‌های شرکت به‌صورت مستقل', icon: Building2, anyPermissions: ['organization.units.view'], group: 'سازمان'},
  {id: 'positions', title: 'سمت‌ها', subtitle: 'جایگاه‌های سازمانی', icon: BriefcaseBusiness, anyPermissions: ['organization.positions.view'], group: 'سازمان'},
  {id: 'personnel', title: 'پرسنل', subtitle: 'پرونده شغلی، فروش و صف تغییرات', icon: ContactRound, anyPermissions: ['organization.personnel.view', 'organization.personnel.changes.review'], group: 'سازمان'},
  {id: 'sales-structures', title: 'ساختار فروش', subtitle: 'شعب، سرپرستان کال‌سنتر و زنجیره فروش', icon: Headphones, anyPermissions: ['organization.personnel.view'], group: 'سازمان'},
  {id: 'users', title: 'کاربران', subtitle: 'سازمان · کاربران', icon: UsersRound, anyPermissions: ['foundation.users.view'], group: 'سازمان'},
  {id: 'roles', title: 'نقش‌ها و دسترسی‌ها', subtitle: 'مجوز و محدوده مؤثر', icon: KeyRound, anyPermissions: ['organization.roles.view'], group: 'سازمان'},
  {id: 'registrations', title: 'درخواست‌های ثبت‌نام', subtitle: 'بررسی، اتصال و فعال‌سازی', icon: UserCheck, anyPermissions: ['organization.registrations.view'], group: 'سازمان'},
  {id: 'recruitment', title: 'جذب و شروع همکاری', subtitle: 'اعلام نیاز تا حساب و قرارداد', icon: UserPlus, anyPermissions: [permissionFor('recruitment-case','view'), permissionFor('recruitment-case','create')], group: 'عملیات سازمان'},
  {id: 'hcm', title: 'منابع انسانی', subtitle: 'قرارداد تا خروج و عملکرد', icon: ContactRound, anyPermissions: modulePermissions('hcm'), group: 'عملیات سازمان'},
  {id: 'customers', title: 'مشتریان', subtitle: 'فهرست و نمای ۳۶۰ مشتری', icon: UsersRound, anyPermissions: ['crm.customers.view'], group: 'مشتری و CRM'},
  {id: 'crm', title: 'CRM و سرنخ‌ها', subtitle: 'Lead، تماس، پیگیری و فرصت', icon: UserRound, anyPermissions: modulePermissions('crm'), group: 'مشتری و درآمد'},
  {id: 'sales', title: 'فروش و وصول', subtitle: 'پیش‌فاکتور تا پرداخت', icon: BriefcaseBusiness, anyPermissions: modulePermissions('sales'), group: 'مشتری و درآمد'},
  {id: 'marketing', title: 'بازاریابی', subtitle: 'کمپین و پروموشن', icon: Sparkles, anyPermissions: modulePermissions('marketing'), group: 'مشتری و درآمد'},
  {id: 'catalog', title: 'کاتالوگ و قیمت', subtitle: 'کالا، خدمت و نسخه قیمت', icon: FileJson, anyPermissions: modulePermissions('catalog'), group: 'مشتری و درآمد'},
  {id: 'procurement', title: 'تدارکات و خرید', subtitle: 'درخواست تا تطبیق', icon: BriefcaseBusiness, anyPermissions: modulePermissions('procurement'), group: 'تأمین و عملیات'},
  {id: 'suppliers', title: 'تأمین‌کنندگان', subtitle: 'Supplier 360 و صورتحساب', icon: Building2, anyPermissions: modulePermissions('suppliers'), group: 'تأمین و عملیات'},
  {id: 'warehouse', title: 'انبار', subtitle: 'موجودی، رزرو، انتقال و کنترل', icon: Database, anyPermissions: modulePermissions('warehouse'), group: 'تأمین و عملیات'},
  {id: 'logistics', title: 'لجستیک و تحویل', subtitle: 'ارسال، تحویل و Attempt', icon: GitBranch, anyPermissions: modulePermissions('logistics'), group: 'تأمین و عملیات'},
  {id: 'service', title: 'فعال‌سازی خدمات', subtitle: 'هماهنگی، مدرک و تأیید', icon: Workflow, anyPermissions: modulePermissions('service'), group: 'تأمین و عملیات'},
  {id: 'finance', title: 'درخواست‌های مالی', subtitle: 'بودجه، مرکز هزینه و Approval', icon: FileClock, anyPermissions: modulePermissions('finance'), group: 'مالی و کنترل'},
  {id: 'treasury', title: 'خزانه', subtitle: 'ارجاع مستقیم و اجرای پرداخت', icon: HardDrive, anyPermissions: modulePermissions('treasury'), group: 'مالی و کنترل'},
  {id: 'accounting', title: 'حسابداری', subtitle: 'سند، دوره و مغایرت بانکی', icon: ScrollText, anyPermissions: modulePermissions('accounting'), group: 'مالی و کنترل'},
  {id: 'support', title: 'پشتیبانی', subtitle: 'Case، SLA و ردیف‌های مالی', icon: ShieldCheck, anyPermissions: modulePermissions('support'), group: 'خدمات و همکاری'},
  {id: 'contracts', title: 'قراردادها', subtitle: 'نسخه، تعهد و تمدید', icon: FileJson, anyPermissions: modulePermissions('contracts'), group: 'خدمات و همکاری'},
  {id: 'assets', title: 'دارایی‌های ثابت', subtitle: 'ثبت، انتقال و نگهداری', icon: Building2, anyPermissions: modulePermissions('assets'), group: 'خدمات و همکاری'},
  {id: 'tasks', title: 'وظایف', subtitle: 'تخصیص، تحویل و بازگشایی', icon: CheckCircle2, anyPermissions: modulePermissions('tasks'), group: 'همکاری'},
  {id: 'communications', title: 'گفت‌وگوها', subtitle: 'پیام با تاریخچه اصلاح', icon: ContactRound, anyPermissions: modulePermissions('communications'), group: 'همکاری'},
  {id: 'letters', title: 'نامه‌ها', subtitle: 'ثبت، ارجاع و مجوز ارسال', icon: ScrollText, anyPermissions: modulePermissions('letters'), group: 'همکاری'},
  {id: 'documents', title: 'اسناد و آرشیو', subtitle: 'هش، نسخه و سهمیه', icon: FileJson, anyPermissions: modulePermissions('documents'), group: 'همکاری'},
  {id: 'reports', title: 'گزارش‌ها و KPI', subtitle: 'صف‌ها و سلامت عملیات', icon: Activity, anyPermissions: ['foundation.reports.view'], group: 'کنترل و راهبری'},
  {id: 'workflow-admin', title: 'مدیریت گردش‌کار', subtitle: 'صف، تخصیص و سیاست تأیید محدود', icon: Workflow, anyPermissions: ['foundation.workflow.manage'], group: 'کنترل و راهبری'},
  {id: 'policy', title: 'آزمایش دسترسی', subtitle: 'مجوز، محدوده و گارد', icon: ShieldCheck, anyPermissions: ['foundation.policy.inspect'], group: 'مدیریت'},
  {id: 'audit', title: 'رویدادها و ممیزی', subtitle: 'ردپای همه اقدام‌ها', icon: ScrollText, anyPermissions: ['foundation.audit.view'], group: 'مدیریت'},
  {id: 'data', title: 'پشتیبان داده', subtitle: 'خروجی، بازیابی و بازنشانی', icon: Database, anyPermissions: ['foundation.data.export', 'foundation.data.manage'], group: 'مدیریت'},
  {id: 'qa', title: 'راهنمای آزمون', subtitle: 'سناریوی تست پذیرش', icon: FlaskConical, anyPermissions: ['foundation.qa.view'], group: 'مدیریت'},
  {id: 'my-account', title: 'حساب کاربری', subtitle: 'پرونده من و درخواست تغییر', icon: UserRound, anyPermissions: [], group: 'تنظیمات'},
  {id: 'appearance', title: 'تنظیمات ظاهری', subtitle: 'فونت، پوسته، تراکم و ستون‌ها', icon: Palette, anyPermissions: ['foundation.preferences.manage'], group: 'تنظیمات'},
];

const service = new LocalFoundationService();
const UI_PREFERENCES_KEY = 'tapra2_ui_preferences_v2';
const LEGACY_UI_PREFERENCES_KEY = 'tapra2_ui_preferences_v1';
const SIDEBAR_COLLAPSED_KEY = 'tapra2_sidebar_collapsed_v1';
const SIDEBAR_GROUPS_KEY = 'tapra2_sidebar_groups_v1';
const DEFAULT_PREFERENCES: UiPreferences = {theme: 'system', fontSize: 'large', density: 'comfortable', columnGap: 8, reduceMotion: false, highContrast: false};

function loadPreferences(): UiPreferences {
  try {
    const current = localStorage.getItem(UI_PREFERENCES_KEY);
    const legacy = !current ? localStorage.getItem(LEGACY_UI_PREFERENCES_KEY) : null;
    const stored = JSON.parse(current ?? legacy ?? '{}') as Partial<UiPreferences>;
    return {...DEFAULT_PREFERENCES, ...stored, columnGap: legacy && stored.columnGap === 4 ? 8 : stored.columnGap ?? DEFAULT_PREFERENCES.columnGap};
  }
  catch { return DEFAULT_PREFERENCES; }
}

export function LocalFoundationApp() {
  const [foundation, setFoundation] = useState<FoundationState | null>(null);
  const [page, setPageState] = useState<PageId>(() => pageFromUrl(window.location.href));
  const setPage = useCallback((nextPage: PageId) => {
    const nextUrl = pageRouteUrl(window.location.href, nextPage);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) window.history.pushState({page: nextPage}, '', nextUrl);
    setPageState(nextPage);
  }, []);
  const [preferences, setPreferences] = useState<UiPreferences>(loadPreferences);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [editUser, setEditUser] = useState<LocalUser | 'new' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  const [expandedNavigationGroups, setExpandedNavigationGroups] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY) ?? '[]') as string[];
      return new Set(stored.length ? stored : ['کار روزانه']);
    } catch { return new Set(['کار روزانه']); }
  });
  const [busy, setBusy] = useState<string | null>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreInput, setRestoreInput] = useState<SnapshotManifest | EncryptedSnapshot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleNavigation = useMemo(() => foundation
    ? NAVIGATION.filter((item) => {
      if (item.id === 'my-account' || item.anyPermissions.some((permission) => can(foundation.activeUser, permission))) return true;
      if (item.id !== 'personnel' || !foundation.activeUser.personnelId) return false;
      return foundation.personnel.some((person) => person.employmentStatus === 'active' && (person.managerPersonnelId === foundation.activeUser.personnelId || person.salesSupervisorPersonnelId === foundation.activeUser.personnelId));
    })
    : [], [foundation]);
  const groupedNavigation = useMemo(() => {
    const groups = new Map<string, NavigationItem[]>();
    visibleNavigation.forEach((item) => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));
    return Array.from(groups, ([group, items]) => ({group, items}));
  }, [visibleNavigation]);

  useEffect(() => {
    let active = true;
    service.initialize()
      .then((state) => { if (active) setFoundation(state); })
      .catch((cause) => { if (active) setError(messageOf(cause)); })
      .finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const restorePageFromUrl = () => setPageState(pageFromUrl(window.location.href));
    window.addEventListener('popstate', restorePageFromUrl);
    return () => window.removeEventListener('popstate', restorePageFromUrl);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
      root.dataset.fontSize = preferences.fontSize;
      root.dataset.density = preferences.density;
      root.dataset.reduceMotion = String(preferences.reduceMotion);
      root.dataset.highContrast = String(preferences.highContrast);
      const columnGap = Math.min(24, Math.max(0, Number(preferences.columnGap) || 0));
      root.style.setProperty('--table-column-gap', `${columnGap}px`);
    };
    apply();
    media.addEventListener('change', apply);
    localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(preferences));
    return () => media.removeEventListener('change', apply);
  }, [preferences]);

  useEffect(() => {
    if (!foundation) return;
    if (page === 'account-security') return;
    const isCurrentVisible = visibleNavigation.some((item) => item.id === page);
    if (!isCurrentVisible) setPage('dashboard');
  }, [foundation, page, visibleNavigation]);

  useEffect(() => {
    const activeGroup = visibleNavigation.find((item) => item.id === page)?.group;
    if (!activeGroup) return;
    setExpandedNavigationGroups((current) => current.has(activeGroup) ? current : new Set(current).add(activeGroup));
  }, [page, visibleNavigation]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(Array.from(expandedNavigationGroups)));
  }, [expandedNavigationGroups]);

  function toggleNavigationGroup(group: string) {
    setExpandedNavigationGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function run(label: string, work: () => Promise<FoundationState>, success: string) {
    setBusy(label);
    setError(null);
    try {
      const next = await work();
      setFoundation(next);
      setToast(success);
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function loginAsUser(user: LocalUser) {
    if (!await run('qa-login', () => service.loginAsUser(user.id), `اکنون محیط را با دسترسی واقعی «${user.name}» می‌بینید.`)) return;
    setEditUser(null); setPage('dashboard'); setMobileOpen(false);
  }

  async function endQaSession() {
    if (!await run('qa-return', () => service.endQaSession(), 'به حساب ادمین بازگشتید.')) return;
    setAccountOpen(false); setNotificationOpen(false); setPage('users');
  }

  async function signIn(username: string, password: string) {
    setBusy('sign-in');
    setError(null);
    try {
      const next = await service.signIn(username, password);
      setFoundation(next);
      setLoginOpen(false);
      setNotificationOpen(false);
      setPage('dashboard');
      setToast(`با حساب «${next.activeUser.name}» وارد شدید.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('sign-out');
    setError(null);
    try {
      const next = await service.signOut();
      setFoundation(next);
      setLogoutOpen(false);
      setAccountOpen(false);
      setNotificationOpen(false);
      setPage('dashboard');
      setToast('با موفقیت از سامانه خارج شدید.');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function exportBackup(password?: string) {
    if (!foundation) return;
    setBusy('backup');
    setError(null);
    try {
      const snapshot = await service.exportSnapshot(password);
      downloadJson(snapshot, password ? 'tapra2-backup-encrypted.json' : 'tapra2-backup.json');
      setFoundation(await service.loadState());
      setToast(password ? 'پشتیبان رمزگذاری‌شده آماده شد.' : 'فایل پشتیبان آماده شد.');
      setBackupOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function chooseRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as SnapshotManifest | EncryptedSnapshot;
      setRestoreInput(parsed);
    } catch {
      setError('فایل انتخاب‌شده JSON معتبر نیست.');
    }
  }

  async function openNotification(notification: UserNotification) {
    setNotificationOpen(false);
    if (!notification.readAt) await run('notification-read', () => service.markNotificationRead(notification.id), 'اعلان خوانده شد.');
    if (notification.relatedModuleId === 'treasury-execution') setPage('treasury');
    else if (notification.relatedModuleId === 'purchase-request') setPage('procurement');
  }

  if (busy === 'initializing') return <LoadingScreen />;
  if (!foundation) return <FatalState error={error ?? 'Foundation محلی آماده نشد.'} />;

  const signedOut = Boolean(foundation.session.signedOutAt);
  if (signedOut || loginOpen) return <>
    <AuthPortal
      currentUser={signedOut ? undefined : foundation.activeUser}
      busy={busy === 'sign-in'}
      globalError={error}
      onClearError={() => setError(null)}
      onClose={signedOut ? undefined : () => setLoginOpen(false)}
      onRegister={() => setRegistrationOpen(true)}
      onSubmit={signIn}
    />
    {registrationOpen && <RegistrationDialog service={service} onClose={() => setRegistrationOpen(false)} onDone={(state) => {setFoundation(state);setRegistrationOpen(false);setToast('درخواست ثبت‌نام با کد پیگیری ثبت شد.');}} />}
    {busy && <div className="busy-indicator"><span /><b>در حال بررسی امن اطلاعات…</b></div>}
    {toast && <div className="toast"><BadgeCheck size={20} /><span>{toast}</span></div>}
  </>;

  const user = foundation.activeUser;
  const currentNavigation = NAVIGATION.find((item) => item.id === page) ?? NAVIGATION[0];
  const currentPageTitle = page === 'account-security' ? 'حساب و امنیت' : currentNavigation.title;
  const activePersonnel = foundation.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
  const profileIncomplete = !isProfileComplete(activePersonnel);

  if (profileIncomplete) return <ProfileCompletionGate state={foundation} busy={busy === 'profile-completion'} externalError={error} onSubmit={(input: ProfileCompletionInput) => run('profile-completion', () => service.completeOwnPersonnelProfile(input), 'اطلاعات الزامی پرونده تکمیل شد. اکنون می‌توانید از سامانه استفاده کنید.')} onSignOut={() => void signOut()} onEndQa={foundation.session.actingAdminUserId ? () => void endQaSession() : undefined}/>;

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`} dir="rtl">
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={21} /></div>
          <div><strong>تپرا</strong><span>بنیاد محلی محصول</span></div>
          <button
            className="icon-button sidebar-collapse-toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? 'باز کردن منوی اصلی' : 'جمع کردن منوی اصلی'}
            aria-label={sidebarCollapsed ? 'باز کردن منوی اصلی' : 'جمع کردن منوی اصلی'}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? <PanelRightOpen size={19} /> : <PanelRightClose size={19} />}
          </button>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="بستن منو"><X size={20} /></button>
        </div>

        <div className="local-pill"><span className="pulse-dot" /><span>ERP محلی آماده آزمون</span><small>Master V1 · IndexedDB</small></div>

        <nav className="main-navigation" aria-label="منوی اصلی">
          {sidebarCollapsed ? visibleNavigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} title={`${item.title} — ${item.group}`} aria-label={item.title} className={`nav-item nav-item--icon-only ${page === item.id ? 'nav-item--active' : ''}`} onClick={() => { setPage(item.id); setMobileOpen(false); }}><Icon size={21} /></button>;
          }) : groupedNavigation.map(({group, items}) => {
            const isExpanded = expandedNavigationGroups.has(group);
            const hasActivePage = items.some((item) => item.id === page);
            return <section className={`nav-group ${hasActivePage ? 'nav-group--active' : ''}`} key={group}>
              <button className="nav-group-trigger" onClick={() => toggleNavigationGroup(group)} aria-expanded={isExpanded} aria-controls={`nav-group-${items[0].id}`}>
                <span>{group}</span>
                <span className="nav-group-count">{items.length.toLocaleString('en-US')}</span>
                <ChevronDown size={17} className={isExpanded ? 'nav-group-chevron nav-group-chevron--open' : 'nav-group-chevron'} />
              </button>
              {isExpanded && <div className="nav-group-items" id={`nav-group-${items[0].id}`}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return <button key={item.id} className={`nav-item ${page === item.id ? 'nav-item--active' : ''}`} onClick={() => { setPage(item.id); setMobileOpen(false); }}>
                    <Icon size={20} />
                    <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                    {page === item.id && <ArrowLeft size={16} />}
                  </button>;
                })}
              </div>}
            </section>;
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="storage-status"><HardDrive size={17} /><span><strong>ذخیره روی این دستگاه</strong><small>IndexedDB فعال است</small></span><CheckCircle2 size={16} /></div>
          <p>هیچ اتصال سروری برای این تجربه لازم نیست.</p>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="بستن منو" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-menu" onClick={() => {setSidebarCollapsed(false);setMobileOpen(true);}} aria-label="بازکردن منو"><Menu size={21} /></button>
            <div><span>تپرا / {currentPageTitle}</span><h1>{currentPageTitle}</h1></div>
          </div>
          <div className="topbar-actions">
            <NotificationCenter notifications={foundation.notifications} open={notificationOpen} onToggle={() => {setNotificationOpen((value) => !value);setAccountOpen(false);}} onClose={() => setNotificationOpen(false)} onOpen={(notification) => {void openNotification(notification);}} onReadAll={() => {void run('notifications-read-all', () => service.markAllNotificationsRead(), 'همه اعلان‌ها خوانده شدند.');}} />
            <button className="persona-trigger account-trigger" onClick={() => {setAccountOpen((value) => !value);setNotificationOpen(false);}} aria-expanded={accountOpen}>
              <span className="persona-avatar" style={{background: user.accent}}>{user.initials}</span>
              <span><strong>{user.name}</strong><small>{user.roleTitle}</small></span>
              <ChevronDown size={17} />
            </button>
            {accountOpen && <AccountMenu user={user} inQaSession={Boolean(foundation.session.actingAdminUserId)} onMyAccount={() => {setPage('my-account');setAccountOpen(false);}} onAccountSecurity={() => {setPage('account-security');setAccountOpen(false);}} onAppearance={() => { setPage('appearance'); setAccountOpen(false); }} onSwitchAccount={() => {setAccountOpen(false); setLoginOpen(true);}} onEndQa={endQaSession} onSignOut={() => {setAccountOpen(false);setLogoutOpen(true);}} onClose={() => setAccountOpen(false)} />}
          </div>
        </header>

        {foundation.session.actingAdminUserId && <div className="access-view-banner"><Eye size={19} /><span>در حال مشاهده با دسترسی: <strong>{foundation.activeUser.name}</strong></span><button onClick={endQaSession}>بازگشت به دسترسی ادمین <ArrowLeft size={16} /></button></div>}

        <div className="page-frame">
          {error && <div className="notice notice--danger"><CircleAlert size={19} /><span>{error}</span><button onClick={() => setError(null)}>بستن</button></div>}
          {page === 'dashboard' && <Dashboard state={foundation} navigate={setPage} />}
          {page === 'organization' && <OrganizationOverviewPage state={foundation} />}
          {page === 'units' && <UnitsPage state={foundation} service={service} execute={run} />}
          {page === 'branches' && <BranchesPage state={foundation} service={service} execute={run} />}
          {page === 'positions' && <PositionsPage state={foundation} service={service} execute={run} />}
          {page === 'personnel' && <PersonnelPage state={foundation} service={service} execute={run} />}
          {page === 'sales-structures' && <SalesStructuresPage state={foundation} service={service} execute={run} />}
          {page === 'users' && <UsersPage state={foundation} onEdit={setEditUser} onLogin={loginAsUser} onStatus={(target, status) => run('user-status', () => service.setUserStatus(target.id, status), `وضعیت «${target.name}» به‌روزرسانی شد.`)} />}
          {page === 'roles' && <RolesPage state={foundation} service={service} execute={run} />}
          {page === 'registrations' && <RegistrationPage state={foundation} service={service} execute={run} />}
          {page === 'recruitment' && <RecruitmentPage state={foundation} service={service} execute={run} />}
          {page === 'customers' && <CustomersPage state={foundation} service={service} execute={run} />}
          {DOMAIN_PAGE_MODULES[page] && <ErpWorkspacePage key={page} state={foundation} moduleIds={DOMAIN_PAGE_MODULES[page]} service={service} execute={run} />}
          {page === 'reports' && <ReportsPage state={foundation} />}
          {page === 'workflow-admin' && <WorkflowAdminPage state={foundation} execute={run} service={service} />}
          {page === 'my-account' && <MyAccountPage state={foundation} service={service} execute={run} />}
          {page === 'account-security' && <AccountSecurityPage user={user} busy={busy === 'own-credentials'} onSubmit={(input) => run('own-credentials', () => service.changeOwnCredentials(input), 'نام کاربری و تنظیمات امنیتی حساب ذخیره شد.')} />}
          {page === 'appearance' && <AppearancePage preferences={preferences} onChange={setPreferences} />}
          {page === 'policy' && <PolicyLab state={foundation} onState={setFoundation} />}
          {page === 'audit' && <AuditPage state={foundation} />}
          {page === 'data' && (
            <DataPage
              state={foundation}
              onExport={() => exportBackup()}
              onEncrypted={() => setBackupOpen(true)}
              onRestore={() => fileInputRef.current?.click()}
              onReset={() => setResetOpen(true)}
              onGenerateQa={() => run('qa-generate', () => service.generateLargeQaDataset(), 'داده آزمون حجیم ساخته شد.')}
              onResetQa={() => run('qa-reset', () => service.resetLargeQaDataset(), 'داده آزمون حجیم حذف شد.')}
              onRebuild={() => run('projection-rebuild', () => service.rebuildProjections(), 'Projectionها بازسازی شدند.')}
              onRunQa={() => run('qa-scenarios', () => service.runQaScenarios(), 'سناریوهای یکپارچگی اجرا و در Audit ثبت شدند.')}
            />
          )}
          {page === 'qa' && <QaGuide state={foundation} navigate={setPage} />}
        </div>
      </main>

      <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={chooseRestore} />

      {editUser && <UserDialog user={editUser === 'new' ? undefined : editUser} state={foundation} onClose={() => setEditUser(null)} onSave={(input) => run('user-save', () => editUser === 'new' ? service.createUser(input) : service.updateUser(editUser.id, input), editUser === 'new' ? 'کاربر جدید ایجاد شد.' : 'اطلاعات کاربر ذخیره شد.').then((succeeded) => {if (succeeded) setEditUser(null);})} onPassword={editUser === 'new' ? undefined : (password) => run('user-password', () => service.setUserPassword(editUser.id, password), 'رمز عبور کاربر با موفقیت تنظیم شد.')} onLogin={editUser === 'new' ? undefined : () => loginAsUser(editUser)} />}
      {registrationOpen && <RegistrationDialog service={service} onClose={() => setRegistrationOpen(false)} onDone={(state) => {setFoundation(state);setRegistrationOpen(false);setToast('درخواست ثبت‌نام با کد پیگیری ثبت شد.');}} />}
      {logoutOpen && <ConfirmLogoutDialog busy={busy === 'sign-out'} user={foundation.activeUser} onClose={() => setLogoutOpen(false)} onConfirm={signOut} />}
      {resetOpen && <ResetDialog busy={busy === 'reset'} onClose={() => setResetOpen(false)} onConfirm={() => run('reset', () => service.reset(), 'داده‌ها به سناریوی اولیه بازگشتند.').then((succeeded) => {if (succeeded) setResetOpen(false);})} />}
      {backupOpen && <PasswordDialog title="پشتیبان رمزگذاری‌شده" description="یک رمز حداقل ۸ نویسه‌ای انتخاب کنید. این رمز در تپرا ذخیره نمی‌شود." actionLabel="ساخت پشتیبان" busy={busy === 'backup'} onClose={() => setBackupOpen(false)} onSubmit={exportBackup} />}
      {restoreInput && <RestoreDialog input={restoreInput} busy={busy === 'restore'} onClose={() => setRestoreInput(null)} onSubmit={(password) => run('restore', () => service.importSnapshot(restoreInput, password), 'پشتیبان با موفقیت بازیابی شد.').then((succeeded) => {if (succeeded) setRestoreInput(null);})} />}
      {busy && busy !== 'initializing' && <div className="busy-indicator"><span /><b>در حال ثبت امن تغییرات…</b></div>}
      {toast && <div className="toast"><BadgeCheck size={20} /><span>{toast}</span></div>}
    </div>
  );
}

function Dashboard({state, navigate}: {state: FoundationState; navigate: (page: PageId) => void}) {
  const {activeUser: user} = state;
  const auditVisible = can(user, 'foundation.audit.view');
  const dataVisible = can(user, 'foundation.data.export') || can(user, 'foundation.data.manage');
  const workspaceItems = dashboardCapabilitiesFor(user);
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow"><span className="pulse-dot pulse-dot--light" /> بنیاد محلی تپرا فعال است</span>
          <h2>سلام {user.name.split(' ')[0]}،<br /><em>این همان شروع تازه تپراست.</em></h2>
          <p>با نقش «{user.roleTitle}» وارد شده‌اید. منو و اقدام‌ها فقط بر اساس مجوز، محدوده و سیاست‌های واقعی همین کاربر محاسبه می‌شوند.</p>
          <div className="hero-actions">
            {can(user, 'organization.overview.view') && <button className="button button--light" onClick={() => navigate('organization')}>مشاهده سازمان <ArrowLeft size={17} /></button>}
            {!can(user, 'foundation.qa.view') && <button className="button button--light" onClick={() => navigate('appearance')}>تنظیمات ظاهری <ArrowLeft size={17} /></button>}
            {auditVisible && <button className="button button--ghost-light" onClick={() => navigate('audit')}>دیدن ردپای رویدادها</button>}
          </div>
        </div>
        <div className="identity-orbit">
          <div className="orbit-ring orbit-ring--one" /><div className="orbit-ring orbit-ring--two" />
          <div className="orbit-center" style={{background: user.accent}}><span>{user.initials}</span><small>{scopeLabel(user.scope)}</small></div>
          <div className="orbit-chip orbit-chip--top"><Shield size={15} /> {user.permissions.length.toLocaleString('en-US')} مجوز</div>
          <div className="orbit-chip orbit-chip--bottom"><Fingerprint size={15} /> Actor مستقل</div>
        </div>
      </section>

      <section className="metric-grid">
        <Metric icon={Database} tone="violet" value="فعال" label="پایگاه داده محلی" detail={`IndexedDB · نسخه ${FOUNDATION_SCHEMA_VERSION.toLocaleString('en-US')}`} />
        <Metric icon={UsersRound} tone="blue" value={state.users.length.toLocaleString('en-US')} label="کاربر سازمانی" detail="نقش و وضعیت مستقل" />
        <Metric icon={Activity} tone="green" value={state.audits.length.toLocaleString('en-US')} label="رویداد ممیزی" detail="Append-only و ماندگار" />
        <Metric icon={LockKeyhole} tone="amber" value={scopeLabel(user.scope)} label="محدوده فعال" detail="Fail-closed در حالت ناشناخته" />
      </section>

      <section className="panel role-workspace">
        <PanelHeading eyebrow="میزکار مبتنی بر نقش" title={`کارهای مجاز ${user.roleTitle}`} subtitle="این میان‌برها از مجوز مؤثر همین حساب ساخته شده‌اند؛ با تغییر نقش، خودکار کم یا زیاد می‌شوند." />
        <div className="role-workspace-grid">
          {workspaceItems.map((item) => {
            const Icon = dashboardCapabilityIcon(item.id);
            return <button key={item.id} onClick={() => navigate(item.page)}>
              <span><Icon size={20}/></span>
              <div><strong>{item.title}</strong><small>{item.description}</small></div>
              <b>{dashboardCapabilityMetric(item.id, state)}</b>
              <ArrowLeft size={17}/>
            </button>;
          })}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--wide">
          <PanelHeading eyebrow="اثبات Foundation" title="چه چیزهایی همین حالا واقعی‌اند؟" subtitle="این‌ها Mock نمایشی نیستند؛ هر اقدام به لایه Application و IndexedDB می‌رسد." />
          <div className="proof-list">
            <Proof icon={KeyRound} title="ناوبری مبتنی بر مجوز" text="هر کاربر فقط منوهای مجاز نقش و محدودهٔ واقعی خود را می‌بیند." />
            <Proof icon={Workflow} title="Policy و Workflow Guard" text="Permission، Scope، Resource Policy و Transition به ترتیب بررسی می‌شوند." />
            <Proof icon={ScrollText} title="Audit و Event پایدار" text="Actor، زمان، نتیجه، دلیل و Correlation ID در مرورگر باقی می‌مانند." />
            <Proof icon={FileJson} title="Snapshot قابل بازیابی" text="خروجی ساده یا رمزگذاری‌شده بگیرید و دوباره Restore کنید." />
          </div>
        </section>
        <section className="panel">
          <PanelHeading eyebrow="حساب جاری" title={user.roleTitle} subtitle={user.description} />
          <div className="persona-summary">
            <div><span>محدوده</span><strong>{scopeLabel(user.scope)}</strong></div>
            <div><span>واحد</span><strong>{unitLabel(user.unitId)}</strong></div>
            <div><span>سطح داده</span><strong>{dataVisible ? 'پشتیبان مجاز' : 'بدون مدیریت داده'}</strong></div>
          </div>
          <div className="permission-cloud">{[...new Set(user.permissions)].map((permission) => <span key={permission}>{permissionLabel(permission)}</span>)}</div>
        </section>
      </div>

      <section className="phase-boundary phase-boundary--ready">
        <div><span>ERP محلی V1</span><h3>هسته مشترک عملیات، مجوز، گردش‌کار و Audit فعال است.</h3><p>{ERP_MODULES.length.toLocaleString('en-US')} زیربخش از منابع انسانی و CRM تا مالی، انبار، پشتیبانی و همکاری روی یک قرارداد داده نسخه‌دار اجرا می‌شوند.</p></div>
        <div className="boundary-tags">{['سازمان','درآمد','تأمین','مالی','خدمات','همکاری'].map((item) => <span className="boundary-tag--ready" key={item}>{item}<BadgeCheck size={13} /></span>)}</div>
      </section>
    </div>
  );
}

function dashboardCapabilityIcon(id: DashboardCapability['id']): LucideIcon {
  return ({organization: Network, structure: GitBranch, personnel: ContactRound, recruitment: UserCheck, 'personnel-review': FileClock, users: UserCog, registrations: UserCheck, roles: KeyRound, procurement: BriefcaseBusiness, treasury: HardDrive})[id];
}

function dashboardCapabilityMetric(id: DashboardCapability['id'], state: FoundationState): string {
  const value = {
    organization: state.units.filter((unit) => unit.status === 'active').length,
    structure: state.units.filter((unit) => unit.status === 'active').length + state.positions.filter((position) => position.status === 'active').length,
    personnel: state.personnel.filter((person) => person.employmentStatus === 'active').length,
    recruitment: state.operationalRecords.filter((record) => record.moduleId === 'recruitment-case' && !['closed','rejected','withdrawn'].includes(record.status)).length,
    'personnel-review': state.personnelProfileChangeRequests.filter((request) => request.status === 'submitted').length,
    users: state.users.filter((item) => item.status === 'active').length,
    registrations: state.registrationRequests.filter((request) => request.status === 'submitted' || request.status === 'in_review').length,
    roles: state.roles.filter((role) => role.status === 'active').length,
    procurement: state.operationalRecords.filter((record) => record.moduleId === 'purchase-request' && !['cancelled', 'rejected'].includes(record.status)).length,
    treasury: state.operationalRecords.filter((record) => record.moduleId === 'treasury-execution' && !['paid', 'failed'].includes(record.status)).length,
  }[id];
  return value.toLocaleString('en-US');
}

function PolicyLab({state, onState}: {state: FoundationState; onState: (state: FoundationState) => void}) {
  const persona = state.activeUser;
  const [results, setResults] = useState<Record<string, AuthorizationDecision>>({});
  const probes = createPolicyProbes(persona);

  async function inspect(id: string, request: Parameters<typeof service.inspectAuthorization>[0]) {
    const {decision, state: next} = await service.inspectAuthorization(request);
    setResults((current) => ({...current, [id]: decision}));
    onState(next);
  }

  return (
    <div className="page-stack">
      <PageIntro icon={ShieldCheck} eyebrow="Permission Engine" title="آزمایش زنده تصمیم دسترسی" description="هر آزمون از چهار ایستگاه عبور می‌کند: مجوز، محدوده، سیاست رکورد و گارد گردش‌کار. نتیجه در Audit ثبت می‌شود." />
      <div className="policy-persona-strip"><span className="persona-avatar" style={{background: persona.accent}}>{persona.initials}</span><div><small>کاربر تحت آزمون</small><strong>{persona.roleTitle} · {persona.name}</strong></div><span className="scope-badge">{scopeLabel(persona.scope)}</span></div>
      <div className="probe-grid">
        {probes.map((probe) => <div key={probe.id}><ProbeCard title={probe.title} scenario={probe.scenario} request={probe.request} decision={results[probe.id] ?? authorize(probe.request)} onRun={() => inspect(probe.id, probe.request)} /></div>)}
      </div>
      <section className="panel">
        <PanelHeading eyebrow="ترتیب Enforcement" title="یک تصمیم، چهار گارد مستقل" subtitle="وجود Role به‌تنهایی هیچ Actionی را مجاز نمی‌کند." />
        <div className="guard-flow">
          {[
            ['۱', 'مجوز', 'آیا Permission صریح وجود دارد؟'], ['۲', 'محدوده', 'رکورد داخل شرکت، واحد، تیم یا SELF است؟'],
            ['۳', 'سیاست رکورد', 'maker/checker و مالکیت رعایت شده؟'], ['۴', 'گردش‌کار', 'Transition از State فعلی مجاز است؟'],
          ].map(([number, title, text], index) => <div key={title}><span>{number}</span><strong>{title}</strong><small>{text}</small>{index < 3 && <ArrowLeft size={17} />}</div>)}
        </div>
      </section>
    </div>
  );
}

function AuditPage({state}: {state: FoundationState}) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const audits = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fa-IR');
    return state.audits.filter((event) => {
      if (category !== 'all' && event.category !== category) return false;
      if (!search) return true;
      return `${legacyTerminology(event.summary)} ${legacyTerminology(event.reason ?? '')} ${event.actorName} ${event.action} ${event.correlationId} ${auditCategoryLabel(event.category)} ${event.outcome}`.toLocaleLowerCase('fa-IR').includes(search);
    });
  }, [category, query, state.audits]);
  return (
    <div className="page-stack">
      <PageIntro icon={ScrollText} eyebrow="Append-only audit" title="ردپای تصمیم‌ها و تغییرها" description="هر رخداد کاربر اقدام‌کننده، کاربر مؤثر، زمان، نتیجه، دلیل و Correlation ID دارد و با بارگذاری دوباره باقی می‌ماند." />
      <div className="filter-row">
        {[['all', 'همه'], ['session', 'نشست کاربری'], ['authorization', 'دسترسی'], ['data', 'داده'], ['system', 'سامانه']].map(([id, title]) => (
          <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{title}</button>
        ))}
        <span>{audits.length.toLocaleString('en-US')} رویداد</span>
      </div>
      <DataSearchToolbar value={query} onChange={setQuery} placeholder="جست‌وجوی رویداد، کاربر، اقدام، دلیل یا شناسه پیگیری" count={audits.length} unit="رویداد"/>
      <section className="audit-panel">
        {audits.map((event) => (
          <article className="audit-row" key={event.id}>
            <span className={`audit-outcome audit-outcome--${event.outcome}`}>{event.outcome === 'success' ? <Check size={16} /> : event.outcome === 'denied' ? <LockKeyhole size={15} /> : <Activity size={15} />}</span>
            <div className="audit-main"><div><strong>{legacyTerminology(event.summary)}</strong><span>{auditCategoryLabel(event.category)}</span></div><p>{legacyTerminology(event.reason ?? actionLabel(event.action))}</p><code dir="ltr">{event.correlationId}</code></div>
            <div className="audit-meta"><strong>{event.actorName}</strong><span>{formatDateTime(event.occurredAt)}</span><small>{event.action}</small></div>
          </article>
        ))}
        {!audits.length && <DataSearchEmpty text="رویدادی با این جست‌وجو پیدا نشد."/>}
      </section>
    </div>
  );
}

function DataPage({state, onExport, onEncrypted, onRestore, onReset, onGenerateQa, onResetQa, onRebuild, onRunQa}: {state: FoundationState; onExport: () => void; onEncrypted: () => void; onRestore: () => void; onReset: () => void; onGenerateQa:()=>void; onResetQa:()=>void; onRebuild:()=>void; onRunQa:()=>void}) {
  const persona = state.activeUser;
  const mayExport = can(persona, 'foundation.data.export');
  const mayManage = can(persona, 'foundation.data.manage');
  return (
    <div className="page-stack">
      <PageIntro icon={Database} eyebrow="Local data controls" title="پشتیبان‌گیری و بازیابی روی همین دستگاه" description="داده عملیاتی فقط در IndexedDB است. ترجیحات ظاهری تنها داده‌هایی هستند که در localStorage نگهداری می‌شوند." />
      <div className="data-grid">
        <DataAction icon={Download} tone="violet" title="خروجی ساده" text="Snapshot نسخه‌دار با checksum بسازید." action="دریافت فایل JSON" disabled={!mayExport} onClick={onExport} />
        <DataAction icon={LockKeyhole} tone="blue" title="خروجی رمزگذاری‌شده" text="AES-GCM با رمزی که فقط شما می‌دانید." action="انتخاب رمز و دریافت" disabled={!mayExport} onClick={onEncrypted} />
        <DataAction icon={Upload} tone="green" title="بازیابی پشتیبان" text="فایل ساده یا رمزگذاری‌شده را اعتبارسنجی کنید." action="انتخاب فایل" disabled={!mayManage} onClick={onRestore} />
        <DataAction icon={RotateCcw} tone="danger" title="بازنشانی محلی" text="بازگشت به Seed قطعی ERP V1 بدون حذف تنظیمات ظاهری." action="بازنشانی داده" disabled={!mayManage} onClick={onReset} />
      </div>
      <section className="panel">
        <PanelHeading eyebrow="سلامت ذخیره‌سازی" title="وضعیت پایگاه داده این مرورگر" subtitle="آخرین وضعیت پس از هر Command دوباره از Adapter خوانده می‌شود." />
        <div className="storage-grid">
          <StorageDatum label="نام پایگاه" value="tapra2_local" mono />
          <StorageDatum label="نسخه Schema" value="۵" />
          <StorageDatum label="کاربران" value={state.users.length.toLocaleString('en-US')} />
          <StorageDatum label="رویدادهای Audit" value={state.audits.length.toLocaleString('en-US')} />
          <StorageDatum label="آخرین ثبت" value={formatDateTime(state.lastPersistedAt)} />
          <StorageDatum label="Adapter فعال" value="IndexedDBAdapter" mono />
        </div>
      </section>
      <section className="panel"><PanelHeading eyebrow="Large QA mode" title="داده آزمون حجیم و Projectionهای قابل بازسازی" subtitle="داده NORMAL_DEMO و LARGE_QA جدا هستند؛ بازنشانی QA فقط رکوردهای علامت‌گذاری‌شده را حذف می‌کند."/><div className="qa-data-actions"><div><strong>{state.qaDataset.status==='generated'?'داده حجیم آماده است':'داده حجیم ساخته نشده'}</strong><span>{state.qaDataset.userCount.toLocaleString('en-US')} کاربر در {state.qaDataset.roleCount.toLocaleString('en-US')} نقش</span></div><button className="button button--secondary" disabled={!mayManage||state.qaDataset.status==='generated'} onClick={onGenerateQa}>ساخت ۱۰ کاربر برای هر نقش</button><button className="button button--secondary" disabled={!mayManage||state.qaDataset.status==='empty'} onClick={onResetQa}>حذف فقط LARGE_QA</button><button className="button button--secondary" disabled={!mayManage} onClick={onRunQa}>اجرای سناریوهای QA</button><button className="button button--primary" disabled={!mayManage} onClick={onRebuild}>بازسازی Projectionها</button></div></section>
    </div>
  );
}

function ReportsPage({state}:{state:FoundationState}) {
  const active = state.operationalRecords.filter((item)=>!['completed','closed','paid','delivered','cancelled','rejected'].includes(item.status));
  const overdue = active.filter((item)=>item.dueAt&&new Date(item.dueAt)<new Date());
  const groups = [...new Set(ERP_MODULES.map((item)=>item.group))].map((group)=>({group,count:state.operationalRecords.filter((record)=>ERP_MODULES.find((module)=>module.id===record.moduleId)?.group===group).length})).sort((a,b)=>b.count-a.count);
  return <div className="page-stack"><PageIntro icon={Activity} eyebrow="Operational MIS" title="گزارش مدیریتی و سلامت صف‌ها" description="این نما از Projection و داده مرجع IndexedDB محاسبه می‌شود و هیچ عددی از سرور دریافت نمی‌کند."/><section className="metric-grid"><Metric icon={Database} tone="violet" value={state.operationalRecords.length.toLocaleString('en-US')} label="رکورد عملیاتی" detail={`${ERP_MODULES.length.toLocaleString('en-US')} زیربخش فعال`}/><Metric icon={Workflow} tone="blue" value={active.length.toLocaleString('en-US')} label="در جریان" detail="به‌جز وضعیت‌های پایانی"/><Metric icon={CircleAlert} tone="amber" value={overdue.length.toLocaleString('en-US')} label="سررسید گذشته" detail="نیازمند پیگیری"/><Metric icon={ScrollText} tone="green" value={state.audits.length.toLocaleString('en-US')} label="رویداد Audit" detail="قابل ردگیری"/></section><section className="panel"><PanelHeading eyebrow="Queue health" title="توزیع رکوردها در حوزه‌های محصول" subtitle="هر نوار با رکوردهای واقعی ذخیره‌شده در مرورگر به‌روز می‌شود."/><div className="report-bars">{groups.map((item)=><div key={item.group}><span>{item.group}</span><i><b style={{width:`${Math.max(5,(item.count/Math.max(1,state.operationalRecords.length))*100)}%`}}/></i><strong>{item.count.toLocaleString('en-US')}</strong></div>)}</div></section><section className="panel"><PanelHeading eyebrow="Rebuildable projections" title="وضعیت نماهای محاسباتی" subtitle="Projectionها مشتق‌شده‌اند و با ابزار داده می‌توانند از Source of Truth بازسازی شوند."/><div className="storage-grid">{state.projections.map((item)=><StorageDatum key={item.id} label={item.kind} value={`نسخه ${item.version.toLocaleString('en-US')} · ${formatDateTime(item.rebuiltAt)}`}/>)}</div></section></div>
}

function QaGuide({state, navigate}: {state: FoundationState; navigate: (page: PageId) => void}) {
  const steps = [
    ['نمای سازمان را بررسی کنید', 'درخت سازمان، مسئولان، تعداد اعضا و تفکیک سمت از نقش دسترسی را ببینید.', () => navigate('organization')],
    ['واحدها را ویرایش کنید', 'یک واحد با نوع دلخواه بسازید، والد و مسئول تعیین کنید و کنترل جلوگیری از چرخه را بیازمایید.', () => navigate('units')],
    ['سمت‌ها را مدیریت کنید', 'یک سمت تازه بسازید و غیرفعال‌سازی سمت دارای کاربر فعال را آزمایش کنید.', () => navigate('positions')],
    ['پرسنل و حساب مرتبط را بررسی کنید', 'یک پرونده پرسنلی بدون حساب بسازید، سپس از تب حساب کاربری نقش و ورود را متصل کنید.', () => navigate('personnel')],
    ['کاربر و نقش‌هایش را ویرایش کنید', 'فیلتر وضعیت، حساب مرتبط، چند نقش، رمز و خلاصه دسترسی مؤثر را بررسی کنید.', () => navigate('users')],
    ['مشتری ۳۶۰ را بررسی کنید', 'مشتری حقیقی یا حقوقی بسازید، تماس و نشانی بیفزایید و پیشنهاد تکراری‌ها را ببینید.', () => navigate('customers')],
    ['نقش و مجوز بسازید', 'یک نقش را کپی کنید، مجوزهای عملیاتی را تغییر دهید و قابلیت‌های آیندهٔ غیرفعال را ببینید.', () => navigate('roles')],
    ['ورود واقعی کاربر را تست کنید', 'از منوی حساب «ورود با حساب دیگر» را بزنید؛ این مسیر با مشاهده دسترسی ادمین متفاوت است.', () => navigate('dashboard')],
    ['مشاهده دسترسی ادمین را تست کنید', 'از فهرست کاربران آیکون ورود به دسترسی را بزنید و بنر ثابت بازگشت به ادمین را بررسی کنید.', () => navigate('users')],
    ['ردپا و پشتیبان را بررسی کنید', 'Audit رخدادها را ببینید، خروجی بگیرید و Reset قطعی را با حفظ تنظیمات ظاهر آزمایش کنید.', () => navigate('audit')],
  ];
  return (
    <div className="page-stack">
      <PageIntro icon={FlaskConical} eyebrow="Product acceptance" title="آزمون‌های کوتاه پذیرش سازمان و مشتری" description={`آزمون را با حساب فعلی «${state.activeUser.roleTitle}» شروع کنید. هر مرحله نتیجه قابل مشاهده و قابل تکرار دارد.`} />
      <section className="qa-timeline">
        {steps.map(([title, text, action], index) => (
          <article key={String(title)}><span>{(index + 1).toLocaleString('en-US')}</span><div><strong>{title as string}</strong><p>{text as string}</p></div><button onClick={action as () => void}>انجام آزمون <ArrowLeft size={16} /></button></article>
        ))}
      </section>
    </div>
  );
}

function UsersPage({state, onEdit, onLogin, onStatus}: {state: FoundationState; onEdit: (user: LocalUser) => void; onLogin: (user: LocalUser) => void; onStatus: (user: LocalUser, status: UserStatus) => void}) {
  const [filter, setFilter] = useState<'all' | UserStatus>('all');
  const [query, setQuery] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<LocalUser | null>(null);
  const users = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fa-IR');
    return state.users.filter((user) => {
      if (filter !== 'all' && user.status !== filter) return false;
      if (!search) return true;
      const unit = state.units.find((item) => item.id === user.unitId)?.name ?? '';
      const position = state.positions.find((item) => item.id === user.positionId)?.title ?? '';
      return `${user.name} ${user.username} ${user.roles.join(' ')} ${unit} ${position} ${user.status === 'active' ? 'فعال' : 'غیرفعال'}`.toLocaleLowerCase('fa-IR').includes(search);
    });
  }, [filter, query, state.positions, state.units, state.users]);
  const mayEdit = can(state.activeUser, 'foundation.users.edit');
  const mayManageStatus = can(state.activeUser, 'foundation.users.status.manage');
  const mayQaLogin = can(state.activeUser, 'foundation.users.qa_login');
  const activeCount = state.users.filter((user) => user.status === 'active').length;
  const userSortColumns = useMemo<SortColumn<LocalUser>[]>(() => [
    {key: 'user', kind: 'text', value: (item) => item.name},
    {key: 'roles', kind: 'text', value: (item) => item.roles.join('، ')},
    {key: 'status', kind: 'text', value: (item) => item.status === 'active' ? 'فعال' : 'غیرفعال'},
    {key: 'unit', kind: 'text', value: (item) => state.units.find((unit) => unit.id === item.unitId)?.name},
    {key: 'position', kind: 'text', value: (item) => state.positions.find((position) => position.id === item.positionId)?.title},
  ], [state.units, state.positions]);
  const {sortedRows: sortedUsers, sort: userSort, requestSort: requestUserSort} = useSortableRows(users, userSortColumns, 'user', 'asc');
  return <><div className="page-stack">
    <PageIntro icon={UsersRound} eyebrow="سازمان / کاربران" title="کاربران سازمان" description="این فهرست فقط حساب‌های ورود را نشان می‌دهد. ایجاد حساب تازه از پرونده پرسنلی انجام می‌شود تا اطلاعات هویتی تکرار نشود." />
    <div className="org-toolbar"><div><strong>حساب کاربری از پرسنل مستقل است</strong><span>غیرفعال‌سازی حساب، پرونده پرسنلی یا سابقه همکاری را حذف نمی‌کند.</span></div></div>
    <section className="user-metrics">
      <Metric icon={UsersRound} tone="violet" value={state.users.length.toLocaleString('en-US')} label="همه کاربران" detail="Seed قطعی محلی" />
      <Metric icon={UserCheck} tone="green" value={activeCount.toLocaleString('en-US')} label="کاربر فعال" detail="قابل ورود و مشاهده دسترسی" />
      <Metric icon={UserX} tone="amber" value={(state.users.length - activeCount).toLocaleString('en-US')} label="کاربر غیرفعال" detail="داده حفظ می‌شود" />
    </section>
    <div className="filter-row user-filter">
      {([['all', 'همه کاربران'], ['active', 'کاربران فعال'], ['inactive', 'کاربران غیرفعال']] as const).map(([id, title]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{title}</button>)}
      <span>{users.length.toLocaleString('en-US')} کاربر</span>
    </div>
    <DataSearchToolbar value={query} onChange={setQuery} placeholder="جست‌وجوی نام، نام کاربری، نقش، واحد یا سمت" count={users.length} unit="کاربر"/>
    <section className="users-panel">
      <div className="users-head"><span><SortHeader columnKey="user" label="کاربر" sort={userSort} onSort={requestUserSort}/></span><span><SortHeader columnKey="roles" label="نقش‌های دسترسی" sort={userSort} onSort={requestUserSort}/></span><span><SortHeader columnKey="status" label="وضعیت" sort={userSort} onSort={requestUserSort}/></span><span><SortHeader columnKey="unit" label="واحد سازمانی" sort={userSort} onSort={requestUserSort}/></span><span><SortHeader columnKey="position" label="سمت سازمانی" sort={userSort} onSort={requestUserSort}/></span><span>اقدام‌ها</span></div>
      {sortedUsers.map((target) => <article className="user-row" key={target.id}>
        <button className="user-identity user-name-button" onClick={() => onEdit(target)} aria-label={`بازکردن پرونده ${target.name}`}><span className="persona-avatar" style={{background: target.accent}}>{target.initials}</span><span><strong>{target.name}</strong><small dir="ltr">@{target.username}</small></span></button>
        <div className="role-chips">{target.roles.map((role) => <span key={role}>{role}</span>)}</div>
        <span className={`status-badge status-badge--${target.status}`}>{target.status === 'active' ? 'فعال' : 'غیرفعال'}</span>
        <span className="user-unit"><b>{state.units.find((unit) => unit.id === target.unitId)?.name ?? 'بدون واحد'}</b></span>
        <span className="user-position"><b>{state.positions.find((position) => position.id === target.positionId)?.title ?? 'بدون سمت'}</b></span>
        <div className="user-actions">
          {(mayEdit || mayQaLogin) && <IconAction label="مشاهده و ویرایش کاربر" tone="primary" onClick={() => onEdit(target)}><Pencil size={17} /></IconAction>}
          {mayQaLogin && target.id !== state.activeUser.id && <IconAction label={target.status === 'active' ? 'ورود به دسترسی کاربر' : 'کاربر غیرفعال است'} tone="qa" disabled={target.status !== 'active'} onClick={() => onLogin(target)}><LogIn size={17} /></IconAction>}
          {mayManageStatus && target.id !== state.activeUser.id && target.status === 'active' && <IconAction label="غیرفعال‌سازی کاربر" tone="danger" onClick={() => setDeactivateTarget(target)}><UserX size={17} /></IconAction>}
          {mayManageStatus && target.id !== state.activeUser.id && target.status === 'inactive' && <IconAction label="فعال‌سازی کاربر" tone="success" onClick={() => onStatus(target, 'active')}><UserCheck size={17} /></IconAction>}
          {!mayEdit && !mayQaLogin && <span className="read-only-label">فقط مشاهده</span>}
        </div>
      </article>)}
      {!sortedUsers.length && <DataSearchEmpty text="کاربری با این جست‌وجو پیدا نشد."/>}
    </section>
  </div>{deactivateTarget && <StatusConfirmDialog user={deactivateTarget} onClose={() => setDeactivateTarget(null)} onConfirm={() => { onStatus(deactivateTarget, 'inactive'); setDeactivateTarget(null); }} />}</>;
}

function UserDialog({user, state, onClose, onSave, onPassword, onLogin}: {user?: LocalUser; state: FoundationState; onClose: () => void; onSave: (input: UserInput) => void; onPassword?: (password: string) => Promise<boolean>; onLogin?: () => void}) {
  const actor = state.activeUser; const creating = !user;
  const linkedPersonnel = state.personnel.find((person) => person.id === user?.personnelId);
  const [tab, setTab] = useState<'profile' | 'access' | 'activity'>('profile');
  const [name, setName] = useState(user?.name ?? ''); const [username, setUsername] = useState(user?.username ?? '');
  const [unitId, setUnitId] = useState(user?.unitId ?? state.units.find((unit) => unit.status === 'active' && unit.type !== 'شعبه')?.id ?? '');
  const [positionId, setPositionId] = useState(user?.positionId ?? state.positions.find((position) => position.status === 'active')?.id ?? '');
  const [managerUserId, setManagerUserId] = useState(user?.managerUserId ?? ''); const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [permissionGrants, setPermissionGrants] = useState<PermissionCode[]>(user?.permissionGrants ?? []);
  const [permissionDenials, setPermissionDenials] = useState<PermissionCode[]>(user?.permissionDenials ?? []);
  const [password, setPassword] = useState(''); const [passwordMode, setPasswordMode] = useState(false); const [errors,setErrors]=useState<string[]>([]);
  const mayEdit = creating ? can(actor, 'organization.users.create') : can(actor, 'foundation.users.edit');
  const mayAssign = can(actor, 'organization.roles.assign'); const mayLogin = Boolean(user && onLogin && actor.isAdmin && user.status === 'active' && user.id !== actor.id);
  const availablePositions = positionsForUnit(state.positions, unitId, user?.positionId).filter((position) => position.status === 'active' || position.id === user?.positionId);
  const changeUnit = (nextUnitId: string) => {
    setUnitId(nextUnitId);
    const currentPosition = state.positions.find((position) => position.id === positionId);
    if (!currentPosition || !positionSupportsUnit(currentPosition, nextUnitId)) setPositionId('');
  };
  const basePermissions = [...new Set(state.roles.filter((role) => roleIds.includes(role.id) && role.status === 'active').flatMap((role) => role.permissions))];
  const permissions = user?.isAdmin ? user.permissions : [...new Set([...basePermissions.filter((permission) => !permissionDenials.includes(permission)), ...permissionGrants])];
  const recent = user ? state.audits.filter((audit) => audit.effectiveUserId === user.id || audit.actorId === user.actorId).slice(0, 6) : [];
  const submit=()=>{const next=validateRequired([{label:'نام و نام خانوادگی',value:name,valid:(value)=>String(value).trim().length>=3,message:'فیلد «نام و نام خانوادگی» الزامی است و باید حداقل ۳ نویسه داشته باشد.'},{label:'نام کاربری',value:username,valid:(value)=>/^[a-zA-Z0-9._-]{3,32}$/.test(String(value).trim()),message:'فیلد «نام کاربری» الزامی است و باید ۳ تا ۳۲ نویسه انگلیسی معتبر داشته باشد.'},{label:'واحد سازمانی',value:unitId},{label:'سمت سازمانی',value:positionId},{label:'نقش‌های دسترسی',value:roleIds},...(creating?[{label:'رمز عبور اولیه',value:password,valid:(value:unknown)=>String(value).length>=8,message:'فیلد «رمز عبور اولیه» الزامی است و باید حداقل ۸ نویسه داشته باشد.'}]:[])]);setErrors(next);if(next.length){setTab(!name.trim()||!username.trim()||!unitId||!positionId||creating&&password.length<8?'profile':'access');return;}onSave({name,username,unitId,positionId,managerUserId:managerUserId||undefined,roleIds,password:creating?password:undefined,permissionGrants:permissionGrants.filter((permission)=>!basePermissions.includes(permission)),permissionDenials:permissionDenials.filter((permission)=>basePermissions.includes(permission))});};
  return <Modal onClose={onClose} wide>
    <div className="modal-heading"><div><span>سازمان / پرونده کاربر</span><h2>{creating ? 'ایجاد کاربر جدید' : user.name}</h2><p>{creating ? 'حساب، جایگاه سازمانی و دسترسی اولیه را در یک جریان کنترل‌شده بسازید.' : 'اطلاعات سازمانی، نقش‌های دسترسی و فعالیت اخیر کاربر را بررسی کنید.'}</p></div><button className="icon-button" aria-label="بستن پنجره" onClick={onClose}><X size={20} /></button></div>
    <FormValidationSummary errors={errors}/>{!creating && <div className="user-dialog-profile"><span className="persona-avatar persona-avatar--large" style={{background: user.accent}}>{user.initials}</span><div><strong>{user.name}</strong><span>@{user.username} · {user.roleTitle}</span><span className={`status-badge status-badge--${user.status}`}>{user.status === 'active' ? 'فعال' : 'غیرفعال'}</span></div></div>}
    <div className="record-tabs"><button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>مشخصات و جایگاه</button><button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>نقش و دسترسی مؤثر</button>{!creating && <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>فعالیت اخیر</button>}</div>
    {tab === 'profile' && <><div className="form-grid user-profile-form">
      <label className="field-label"><RequiredLabel>نام و نام خانوادگی</RequiredLabel><input aria-required="true" autoFocus value={name} disabled={!mayEdit || Boolean(linkedPersonnel)} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field-label"><RequiredLabel>نام کاربری</RequiredLabel><input aria-required="true" dir="ltr" value={username} disabled={!mayEdit} onChange={(event) => setUsername(event.target.value)} placeholder="name.family" /></label>
      <label className="field-label"><RequiredLabel>واحد سازمانی</RequiredLabel><select aria-required="true" value={unitId} disabled={!mayEdit || Boolean(linkedPersonnel)} onChange={(event) => changeUnit(event.target.value)}><option value="">انتخاب کنید</option>{state.units.filter((unit) => unit.type !== 'شعبه' && (unit.status === 'active' || unit.id === user?.unitId)).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label className="field-label"><RequiredLabel>سمت سازمانی</RequiredLabel><select aria-required="true" value={positionId} disabled={!mayEdit || Boolean(linkedPersonnel) || !unitId} onChange={(event) => setPositionId(event.target.value)}><option value="">{unitId ? 'انتخاب سمت مجاز این واحد' : 'ابتدا واحد را انتخاب کنید'}</option>{availablePositions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select><small>فقط سمت‌های تعریف‌شده برای واحد انتخابی نمایش داده می‌شوند.</small></label>
      <label className="field-label"><OptionalLabel>مدیر مستقیم</OptionalLabel><select value={managerUserId} disabled={!mayEdit || Boolean(linkedPersonnel)} onChange={(event) => setManagerUserId(event.target.value)}><option value="">بدون مدیر مستقیم</option>{state.users.filter((item) => item.status === 'active' && item.id !== user?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {creating && <label className="field-label"><RequiredLabel>رمز عبور اولیه</RequiredLabel><input aria-required="true" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="حداقل ۸ نویسه" /></label>}
    </div>{linkedPersonnel && <div className="linked-source-note"><ContactRound size={19} /><span><strong>متصل به پرونده پرسنلی</strong> نام، واحد، سمت و مدیر مستقیم از پرونده «{linkedPersonnel.personnelCode}» خوانده می‌شوند.</span></div>}{!creating && can(actor, 'organization.users.password.manage') && <div className="password-control"><div><KeyRound size={20} /><span><strong>رمز عبور محلی</strong><small>آخرین تغییر: {formatDateTime(user.passwordUpdatedAt)}</small></span></div>{!passwordMode ? <button className="button button--secondary" onClick={() => setPasswordMode(true)}>تنظیم رمز جدید</button> : <div className="password-inline"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="حداقل ۸ نویسه" /><button className="button button--primary" disabled={password.length < 8} onClick={() => onPassword?.(password).then((succeeded) => {if (succeeded) {setPassword(''); setPasswordMode(false);}})}>ثبت رمز</button><button className="icon-button" aria-label="انصراف از تغییر رمز" onClick={() => setPasswordMode(false)}><X size={18} /></button></div>}</div>}</>}
    {tab === 'access' && <UserAccessEditor user={user} state={state} roleIds={roleIds} mayAssign={mayAssign} permissions={permissions} permissionGrants={permissionGrants} permissionDenials={permissionDenials} onChange={setRoleIds} onGrantsChange={setPermissionGrants} onDenialsChange={setPermissionDenials} />}
    {tab === 'activity' && <div className="recent-activity">{recent.length ? recent.map((audit) => <article key={audit.id}><span className={`audit-outcome audit-outcome--${audit.outcome}`}>{audit.outcome === 'success' ? <Check size={15} /> : <CircleAlert size={15} />}</span><div><strong>{legacyTerminology(audit.summary)}</strong><p>{audit.reason ?? actionLabel(audit.action)}</p></div><time>{formatDateTime(audit.occurredAt)}</time></article>) : <div className="empty-state"><ScrollText size={24} /><strong>فعالیتی ثبت نشده است</strong></div>}</div>}
    <div className="user-policy-note"><ShieldCheck size={20} /><div><strong>دسترسی از نام نقش مستقل است</strong><span>Permission، Scope، Resource Policy و Workflow Guard با هم تصمیم نهایی را می‌سازند. استثنای ادمین قابل انتساب به نقش‌های دیگر نیست.</span></div></div>
    <div className="modal-actions modal-actions--split"><div>{mayLogin && <IconAction label="ورود به دسترسی کاربر" tone="qa" large onClick={onLogin!}><LogIn size={20} /></IconAction>}{user && actor.isAdmin && user.status === 'inactive' && <span className="inactive-help">کاربر غیرفعال قابل ورود نیست.</span>}</div><div><button className="button button--secondary" onClick={onClose}>بستن</button>{mayEdit && <button className="button button--primary" onClick={submit}>{creating ? 'ایجاد کاربر' : 'ذخیره تغییرات'}</button>}</div></div>
  </Modal>;
}

function UserAccessEditor({user, state, roleIds, mayAssign, permissions, permissionGrants, permissionDenials, onChange, onGrantsChange, onDenialsChange}: {user?: LocalUser; state: FoundationState; roleIds: string[]; mayAssign: boolean; permissions: PermissionCode[]; permissionGrants: PermissionCode[]; permissionDenials: PermissionCode[]; onChange: (roleIds: string[]) => void; onGrantsChange: (permissions: PermissionCode[]) => void; onDenialsChange: (permissions: PermissionCode[]) => void}) {
  const [query, setQuery] = useState('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [extraQuery, setExtraQuery] = useState('');
  const selectedRoles = state.roles.filter((role) => roleIds.includes(role.id));
  const basePermissions = [...new Set(selectedRoles.filter((role) => role.status === 'active').flatMap((role) => role.permissions))];
  const normalizedQuery = query.trim().toLocaleLowerCase('fa-IR');
  const visibleRoles = state.roles.filter((role) => !normalizedQuery || `${role.name} ${role.description} ${scopeLabel(role.scope)}`.toLocaleLowerCase('fa-IR').includes(normalizedQuery));
  const catalogByCode = new Map(PERMISSION_CATALOG.map((item) => [item.code, item]));
  const matchesPermission = (permission: PermissionCode, source: string) => {const item = catalogByCode.get(permission); const haystack = `${permission} ${item?.label ?? ''} ${item?.description ?? ''} ${source}`.toLocaleLowerCase('fa-IR'); return haystack.includes(permissionQuery.trim().toLocaleLowerCase('fa-IR'));};
  const extraMatches = PERMISSION_CATALOG.filter((item) => item.available && !basePermissions.includes(item.code) && (!extraQuery.trim() || `${item.code} ${item.label} ${item.description}`.toLocaleLowerCase('fa-IR').includes(extraQuery.trim().toLocaleLowerCase('fa-IR'))));
  const toggleDenial = (permission: PermissionCode, enabled: boolean) => onDenialsChange(enabled ? permissionDenials.filter((item) => item !== permission) : [...new Set([...permissionDenials, permission])]);
  const toggleGrant = (permission: PermissionCode, enabled: boolean) => onGrantsChange(enabled ? [...new Set([...permissionGrants, permission])] : permissionGrants.filter((item) => item !== permission));
  const overridesDisabled = !mayAssign || Boolean(user?.isAdmin);

  return <div className="compact-access-layout">
    <section className="compact-role-section">
      <div className="section-mini-heading"><strong>نقش‌های دسترسی</strong><span>انتخاب چندگانه از فهرست کشویی</span></div>
      <div className="selected-role-summary">
        {selectedRoles.length ? selectedRoles.map((role, index) => <span key={role.id}><KeyRound size={13} />{role.name}{index === 0 && <i>اصلی</i>}</span>) : <small>هنوز نقشی انتخاب نشده است.</small>}
      </div>
      <details className="compact-role-picker">
        <summary aria-label="باز کردن فهرست نقش‌ها"><span><KeyRound size={17} /><strong>{roleIds.length.toLocaleString('en-US')} نقش انتخاب‌شده</strong></span><small>برای مشاهده و تغییر نقش‌ها باز کنید</small><ChevronDown size={18} /></summary>
        <div className="compact-role-dropdown">
          <label className="compact-role-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا شرح نقش…" /></label>
          <div className="compact-role-list">
            {visibleRoles.map((role) => {
              const checked = roleIds.includes(role.id);
              const protectedRole = Boolean(user?.isAdmin && role.id === 'role-admin');
              const disabled = !mayAssign || protectedRole || role.status === 'inactive';
              return <label key={role.id} className={`${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...roleIds, role.id] : roleIds.filter((id) => id !== role.id))} />
                <span className="permission-check">{checked && <Check size={13} />}</span>
                <span className="compact-role-copy"><strong>{role.name}</strong><small>{role.description}</small></span>
                <span className="compact-role-meta"><b>{scopeLabel(role.scope)}</b><small>{role.permissions.length.toLocaleString('en-US')} مجوز</small></span>
                {role.status === 'inactive' && <em>غیرفعال</em>}
                {protectedRole && <em>محافظت‌شده</em>}
              </label>;
            })}
            {!visibleRoles.length && <div className="compact-role-empty">نقشی مطابق جست‌وجو پیدا نشد.</div>}
          </div>
        </div>
      </details>
      {!mayAssign && <p className="compact-role-readonly"><Shield size={15} /> نقش‌ها فقط برای مشاهده نمایش داده می‌شوند.</p>}
      <section className="permission-override-editor">
        <div className="section-mini-heading"><strong>ریزِ مجوزهای نقش‌ها</strong><span>هر مجوز را فقط برای همین کاربر روشن یا خاموش کنید</span></div>
        <label className="compact-role-search"><Search size={16}/><input value={permissionQuery} onChange={(event) => setPermissionQuery(event.target.value)} placeholder="جست‌وجوی مجوز در نقش‌های انتخاب‌شده…" /></label>
        <div className="role-permission-accordions">
          {selectedRoles.map((role, roleIndex) => {
            const visiblePermissions = role.permissions.filter((permission) => matchesPermission(permission, role.name));
            const enabledCount = role.permissions.filter((permission) => !permissionDenials.includes(permission)).length;
            return <details key={role.id} open={roleIndex === 0} className="role-permission-accordion">
              <summary><span><KeyRound size={15}/><strong>{role.name}</strong>{roleIndex === 0 && <i>اصلی</i>}</span><small>{enabledCount.toLocaleString('en-US')} از {role.permissions.length.toLocaleString('en-US')} مجوز فعال</small><ChevronDown size={16}/></summary>
              <div className="role-permission-list">
                {visiblePermissions.map((permission) => {const item = catalogByCode.get(permission); const enabled = !permissionDenials.includes(permission); return <label key={permission} className={!enabled ? 'permission-denied' : ''}><input type="checkbox" checked={enabled} disabled={overridesDisabled} onChange={(event) => toggleDenial(permission, event.target.checked)}/><span className="permission-check">{enabled && <Check size={12}/>}</span><span><strong>{item?.label ?? permissionLabel(permission)}</strong><small>{item?.description ?? permission}</small></span><code>{permission}</code>{!enabled && <em>مستثنا برای این کاربر</em>}</label>;})}
                {!visiblePermissions.length && <div className="compact-role-empty">مجوزی مطابق جست‌وجو در این نقش نیست.</div>}
              </div>
            </details>;
          })}
          {!selectedRoles.length && <div className="compact-role-empty">ابتدا حداقل یک نقش انتخاب کنید.</div>}
        </div>
        <details className="extra-permission-picker">
          <summary><span><ShieldCheck size={16}/><strong>مجوز افزوده خارج از نقش</strong></span><small>{permissionGrants.length.toLocaleString('en-US')} مجوز افزوده</small><ChevronDown size={16}/></summary>
          <div><label className="compact-role-search"><Search size={16}/><input value={extraQuery} onChange={(event) => setExtraQuery(event.target.value)} placeholder="جست‌وجوی مجوز تکمیلی…" /></label><div className="role-permission-list extra-permission-list">{extraMatches.map((item) => {const enabled = permissionGrants.includes(item.code); return <label key={item.code}><input type="checkbox" checked={enabled} disabled={overridesDisabled} onChange={(event) => toggleGrant(item.code, event.target.checked)}/><span className="permission-check">{enabled && <Check size={12}/>}</span><span><strong>{item.label}</strong><small>{item.description}</small></span><code>{item.code}</code>{enabled && <em>افزوده برای این کاربر</em>}</label>;})}</div></div>
        </details>
        {user?.isAdmin && <p className="compact-role-readonly"><Shield size={15}/> حساب ادمین محافظت‌شده است و ریزمجوز کاربری نمی‌پذیرد.</p>}
      </section>
    </section>
    <section className="compact-access-summary">
      <div className="section-mini-heading"><strong>خلاصه دسترسی مؤثر</strong><span>نقش‌ها منهای استثناها، به‌علاوه مجوزهای تکمیلی</span></div>
      <div className="effective-access-card"><ShieldCheck size={27} /><strong>{permissions.length.toLocaleString('en-US')} مجوز مؤثر</strong><span>محدوده پایه: {user?.isAdmin ? 'کل شرکت · استثنای محافظت‌شده ادمین' : scopeLabel(state.roles.find((role) => role.id === roleIds[0])?.scope ?? 'SELF')}</span><dl className="permission-override-stats"><div><dt>پایه نقش‌ها</dt><dd>{basePermissions.length.toLocaleString('en-US')}</dd></div><div><dt>مستثناشده</dt><dd>{permissionDenials.filter((item) => basePermissions.includes(item)).length.toLocaleString('en-US')}</dd></div><div><dt>افزوده</dt><dd>{permissionGrants.filter((item) => !basePermissions.includes(item)).length.toLocaleString('en-US')}</dd></div></dl><div>{[...new Set(permissions)].slice(0, 12).map((permission) => <i key={permission}>{permissionLabel(permission)}</i>)}</div></div>
    </section>
  </div>;
}

function StatusConfirmDialog({user, onClose, onConfirm}: {user: LocalUser; onClose: () => void; onConfirm: () => void}) {
  return <Modal onClose={onClose}><div className="danger-symbol"><UserX size={27} /></div><div className="centered-modal"><h2>غیرفعال‌سازی کاربر</h2><p>حساب «{user.name}» غیرفعال می‌شود و تا فعال‌سازی دوباره امکان ورود یا مشاهده دسترسی ندارد. داده‌های قبلی او حذف نمی‌شوند.</p><div className="modal-actions modal-actions--center"><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--danger" onClick={onConfirm}>تأیید غیرفعال‌سازی</button></div></div></Modal>;
}

function IconAction({label, tone = 'neutral', large = false, disabled = false, onClick, children}: {label: string; tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'qa'; large?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode}) {
  return <button type="button" className={`icon-action icon-action--${tone} ${large ? 'icon-action--large' : ''}`} aria-label={label} data-tooltip={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function AccountSecurityPage({user, busy, onSubmit}: {user: LocalUser; busy: boolean; onSubmit: (input: SelfCredentialChangeInput) => Promise<boolean>}) {
  const [username, setUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const usernameChanged = username.trim().toLowerCase() !== user.username.toLowerCase();

  const submit = () => {
    const next: string[] = [];
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) next.push('نام کاربری باید ۳ تا ۳۲ نویسه انگلیسی معتبر داشته باشد.');
    if (!currentPassword) next.push('برای تأیید هویت، رمز عبور فعلی را وارد کنید.');
    if (newPassword && newPassword.length < 8) next.push('رمز عبور جدید باید حداقل ۸ نویسه باشد.');
    if (newPassword !== confirmPassword) next.push('تکرار رمز عبور جدید با رمز واردشده یکسان نیست.');
    if (!usernameChanged && !newPassword) next.push('برای ذخیره، نام کاربری یا رمز عبور جدید را تغییر دهید.');
    setErrors(next);
    if (!next.length) void onSubmit({currentPassword, username, newPassword: newPassword || undefined});
  };

  return <div className="page-stack account-security-page">
    <PageIntro icon={LockKeyhole} eyebrow="تنظیمات / حساب شخصی" title="حساب و امنیت" description="نام کاربری و رمز عبور همین حساب را شخصاً مدیریت کنید. تغییرات در داده محلی امن ثبت و در ممیزی ثبت می‌شوند." />
    <section className="account-security-layout">
      <aside className="account-security-summary">
        <span className="persona-avatar persona-avatar--large" style={{background: user.accent}}>{user.initials}</span>
        <div><strong>{user.name}</strong><span>{user.roleTitle}</span><small dir="ltr">@{user.username}</small></div>
        <dl><div><dt>وضعیت حساب</dt><dd><i className="status-badge status-badge--active">فعال</i></dd></div><div><dt>آخرین تغییر رمز</dt><dd>{formatDateTime(user.passwordUpdatedAt)}</dd></div></dl>
      </aside>
      <div className="account-security-form">
        <FormValidationSummary errors={errors} />
        <section className="security-form-section">
          <SettingHeading icon={AtSign} title="نام کاربری" text="این نام در ورود بعدی استفاده می‌شود و ادمین آن را در فهرست کاربران مشاهده می‌کند." />
          <label className="field-label"><RequiredLabel>نام کاربری</RequiredLabel><input aria-required="true" dir="ltr" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="name.family" /><small>۳ تا ۳۲ نویسه لاتین، عدد، نقطه، خط تیره یا زیرخط</small></label>
        </section>
        <section className="security-form-section">
          <SettingHeading icon={KeyRound} title="رمز عبور" text="برای تغییر نام کاربری یا رمز، ابتدا رمز فعلی را وارد کنید. رمز جدید اختیاری است." />
          <div className="security-password-grid">
            <label className="field-label"><RequiredLabel>رمز عبور فعلی</RequiredLabel><span className="password-field"><input aria-required="true" type={showCurrent ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><button type="button" aria-label={showCurrent ? 'پنهان‌کردن رمز فعلی' : 'نمایش رمز فعلی'} onClick={() => setShowCurrent((value) => !value)}>{showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            <label className="field-label"><OptionalLabel>رمز عبور جدید</OptionalLabel><span className="password-field"><input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="حداقل ۸ نویسه" /><button type="button" aria-label={showNew ? 'پنهان‌کردن رمز جدید' : 'نمایش رمز جدید'} onClick={() => setShowNew((value) => !value)}>{showNew ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            <label className="field-label"><OptionalLabel>تکرار رمز عبور جدید</OptionalLabel><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="رمز جدید را دوباره وارد کنید" /></label>
          </div>
        </section>
        <div className="security-privacy-note"><ShieldCheck size={20} /><span><strong>رمز عبور قابل مشاهده نیست</strong><small>ادمین فقط می‌تواند رمز را بازنشانی کند؛ رمز فعلی یا جدید شما در فهرست کاربران نمایش داده نمی‌شود.</small></span></div>
        <div className="account-security-actions"><button className="button button--primary" disabled={busy} onClick={submit}><LockKeyhole size={18} /> ذخیره اطلاعات ورود</button></div>
      </div>
    </section>
  </div>;
}

function AppearancePage({preferences, onChange}: {preferences: UiPreferences; onChange: (value: UiPreferences) => void}) {
  const update = <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => onChange({...preferences, [key]: value});
  return <div className="page-stack">
    <PageIntro icon={Palette} eyebrow="ترجیحات این دستگاه" title="تنظیمات ظاهری" description="این گزینه‌ها فقط برای ظاهر محصول‌اند، در localStorage همین مرورگر می‌مانند و وارد داده عملیاتی IndexedDB نمی‌شوند." />
    <section className="settings-panel">
      <SettingHeading icon={SlidersHorizontal} title="اندازه نوشته‌ها" text="خوانایی همهٔ صفحه‌ها را بدون نیاز به Zoom مرورگر تنظیم کنید." />
      <div className="choice-grid choice-grid--font">
        {([['standard', 'استاندارد', 'برای صفحه‌های کوچک و اطلاعات متراکم'], ['large', 'بزرگ', 'اندازه پیش‌فرض و پیشنهادی'], ['xlarge', 'خیلی بزرگ', 'خوانایی بیشتر در نمایشگرهای بزرگ']] as const).map(([value, title, text], index) => <button key={value} className={`preference-choice ${preferences.fontSize === value ? 'preference-choice--active' : ''}`} onClick={() => update('fontSize', value)}><span className={`font-sample font-sample--${index}`}>آ</span><strong>{title}</strong><small>{text}</small>{preferences.fontSize === value && <CheckCircle2 size={18} />}</button>)}
      </div>
    </section>
    <section className="settings-panel">
      <SettingHeading icon={Palette} title="پوسته" text="پوسته روشن، تیره یا هماهنگ با تنظیم سیستم‌عامل." />
      <div className="choice-grid">
        {([['light', 'روشن', Sun], ['dark', 'تیره', Moon], ['system', 'سیستم', Monitor]] as const).map(([value, title, Icon]) => <button key={value} className={`preference-choice preference-choice--compact ${preferences.theme === value ? 'preference-choice--active' : ''}`} onClick={() => update('theme', value)}><Icon size={22} /><strong>{title}</strong><small>{value === 'system' ? 'هماهنگ با دستگاه' : `پوسته ${title}`}</small>{preferences.theme === value && <CheckCircle2 size={18} />}</button>)}
      </div>
    </section>
    <section className="settings-panel">
      <SettingHeading icon={LayoutDashboard} title="تراکم نمایش" text="فاصلهٔ بین محتوا و ارتفاع ردیف‌ها را برای سبک کاری خود انتخاب کنید." />
      <div className="choice-grid">
        {([['compact', 'فشرده', 'اطلاعات بیشتر'], ['comfortable', 'راحت', 'تعادل پیشنهادی'], ['spacious', 'باز', 'فاصله بیشتر']] as const).map(([value, title, text]) => <button key={value} className={`preference-choice preference-choice--compact ${preferences.density === value ? 'preference-choice--active' : ''}`} onClick={() => update('density', value)}><span className={`density-preview density-preview--${value}`}><i /><i /><i /></span><strong>{title}</strong><small>{text}</small>{preferences.density === value && <CheckCircle2 size={18} />}</button>)}
      </div>
    </section>
    <section className="settings-panel">
      <SettingHeading icon={SlidersHorizontal} title="فاصله ستون‌های جدول" text="فاصله افقی تمام جدول‌ها و فهرست‌های ستونی را مطابق سلیقه خود تنظیم کنید." />
      <div className="column-gap-setting">
        <div><strong>{preferences.columnGap <= 3 ? 'خیلی فشرده' : preferences.columnGap <= 6 ? 'فشرده' : preferences.columnGap <= 11 ? 'استاندارد' : preferences.columnGap <= 17 ? 'باز' : 'خیلی باز'}</strong><span>{preferences.columnGap.toLocaleString('en-US')} پیکسل فاصله واقعی بین ستون‌های جدول</span></div>
        <input aria-label="تنظیم فاصله بین ستون‌ها" type="range" min="0" max="24" step="1" value={preferences.columnGap} onChange={(event) => update('columnGap', Number(event.target.value))} />
        <div className="column-gap-scale"><span>بدون فاصله</span><span>فاصله بیشتر</span></div>
      </div>
    </section>
    <section className="settings-panel">
      <SettingHeading icon={UserCog} title="ترجیحات رابط" text="رفتار حرکتی و کنتراست را متناسب با نیاز خود تنظیم کنید." />
      <div className="toggle-list">
        <ToggleRow title="کاهش حرکت‌ها" text="انیمیشن‌ها و جابه‌جایی‌های تزئینی را کم می‌کند." checked={preferences.reduceMotion} onChange={(value) => update('reduceMotion', value)} />
        <ToggleRow title="کنتراست بیشتر" text="مرزها و متن‌های کم‌رنگ را واضح‌تر نمایش می‌دهد." checked={preferences.highContrast} onChange={(value) => update('highContrast', value)} />
      </div>
      <button className="button button--secondary settings-reset" onClick={() => onChange(DEFAULT_PREFERENCES)}><RotateCcw size={17} /> بازگشت به تنظیمات پیشنهادی</button>
    </section>
  </div>;
}

function NotificationCenter({notifications, open, onToggle, onClose, onOpen, onReadAll}: {notifications: UserNotification[]; open: boolean; onToggle: () => void; onClose: () => void; onOpen: (notification: UserNotification) => void; onReadAll: () => void}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return <div className="notification-center">
    <button className="icon-button notification-trigger" onClick={onToggle} aria-expanded={open} aria-label={`اعلان‌ها؛ ${unread.toLocaleString('fa-IR')} خوانده‌نشده`} title="اعلان‌ها">
      <Bell size={20}/>{unread > 0 && <span className="notification-badge">{unread > 99 ? '۹۹+' : unread.toLocaleString('fa-IR')}</span>}
    </button>
    {open && <><button className="account-scrim" aria-label="بستن اعلان‌ها" onClick={onClose}/><section className="notification-popover" aria-label="مرکز اعلان‌ها">
      <header><div><strong>اعلان‌ها</strong><span>{unread ? `${unread.toLocaleString('fa-IR')} اعلان خوانده‌نشده` : 'همه اعلان‌ها خوانده شده‌اند'}</span></div><button className="notification-read-all" disabled={!unread} onClick={onReadAll}><CheckCheck size={16}/> خواندن همه</button></header>
      <div className="notification-list">
        {notifications.length ? notifications.map((notification) => <button key={notification.id} className={`notification-item ${notification.readAt ? '' : 'notification-item--unread'}`} onClick={() => onOpen(notification)}>
          <span className="notification-item__icon"><BellRing size={18}/></span><span className="notification-item__body"><strong>{notification.title}</strong><span>{notification.message}</span><small>{formatPersianDateTime(notification.createdAt)}</small></span>{!notification.readAt && <i aria-label="خوانده‌نشده"/>}
        </button>) : <div className="notification-empty"><Bell size={25}/><strong>اعلان تازه‌ای ندارید.</strong><span>پیگیری‌ها و رویدادهای مرتبط با نقش شما اینجا نمایش داده می‌شوند.</span></div>}
      </div>
    </section></>}
  </div>;
}

function AccountMenu({user, inQaSession, onMyAccount, onAccountSecurity, onAppearance, onSwitchAccount, onEndQa, onSignOut, onClose}: {user: LocalUser; inQaSession: boolean; onMyAccount: () => void; onAccountSecurity: () => void; onAppearance: () => void; onSwitchAccount: () => void; onEndQa: () => void; onSignOut: () => void; onClose: () => void}) {
  return <><button className="account-scrim" aria-label="بستن منوی حساب" onClick={onClose} /><section className="account-menu">
    <div className="account-summary"><span className="persona-avatar persona-avatar--large" style={{background: user.accent}}>{user.initials}</span><div><strong>{user.name}</strong><span>{user.roleTitle}</span><small>{scopeLabel(user.scope)}</small></div></div>
    <button onClick={onMyAccount}><UserRound size={18} /><span><strong>حساب کاربری من</strong><small>مشاهده پرونده و درخواست تغییر اطلاعات</small></span><ArrowLeft size={16} /></button>
    {!inQaSession && <button onClick={onAccountSecurity}><LockKeyhole size={18} /><span><strong>حساب و امنیت</strong><small>تغییر نام کاربری و رمز عبور شخصی</small></span><ArrowLeft size={16} /></button>}
    <button onClick={onAppearance}><Palette size={18} /><span><strong>تنظیمات ظاهری</strong><small>فونت، پوسته، تراکم و فاصله ستون‌ها</small></span><ArrowLeft size={16} /></button>
    {!inQaSession && <button onClick={onSwitchAccount}><LogIn size={18} /><span><strong>ورود با حساب دیگر</strong><small>نام کاربری و رمز عبور محلی</small></span><ArrowLeft size={16} /></button>}
    {inQaSession && <button className="account-menu-qa" onClick={onEndQa}><ShieldCheck size={18} /><span><strong>بازگشت به دسترسی ادمین</strong><small>پایان مشاهده دسترسی کاربر</small></span><ArrowLeft size={16} /></button>}
    {!inQaSession && <button className="account-menu-logout" onClick={onSignOut}><LogOut size={18} /><span><strong>خروج از سامانه</strong><small>پایان نشست روی این دستگاه</small></span><ArrowLeft size={16} /></button>}
    <div className="account-local"><HardDrive size={16} /> حساب محلی این دستگاه</div>
  </section></>;
}

function SettingHeading({icon: Icon, title, text}: {icon: LucideIcon; title: string; text: string}) { return <div className="setting-heading"><span><Icon size={20} /></span><div><h3>{title}</h3><p>{text}</p></div></div>; }
function ToggleRow({title, text, checked, onChange}: {title: string; text: string; checked: boolean; onChange: (value: boolean) => void}) { return <label className="toggle-row"><div><strong>{title}</strong><span>{text}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }

function ResetDialog({busy, onClose, onConfirm}: {busy: boolean; onClose: () => void; onConfirm: () => void}) {
  const [value, setValue] = useState('');
  return <Modal onClose={onClose}><div className="danger-symbol"><RotateCcw size={27} /></div><div className="centered-modal"><h2>بازنشانی داده‌های محلی</h2><p>تمام تغییرات عملیاتی IndexedDB با Seed قطعی جایگزین می‌شوند. تنظیمات ظاهری حذف نمی‌شوند.</p><label>برای تأیید، عبارت «بازنشانی» را بنویسید<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="modal-actions"><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--danger" disabled={value !== 'بازنشانی' || busy} onClick={onConfirm}>بازنشانی قطعی</button></div></div></Modal>;
}

function PasswordDialog({title, description, actionLabel, busy, onClose, onSubmit}: {title: string; description: string; actionLabel: string; busy: boolean; onClose: () => void; onSubmit: (password: string) => void}) {
  const [password, setPassword] = useState('');
  const [errors,setErrors]=useState<string[]>([]); const submit=()=>{const next=validateRequired([{label:'رمز پشتیبان',value:password,valid:(value)=>String(value).length>=8,message:'فیلد «رمز پشتیبان» الزامی است و باید حداقل ۸ نویسه داشته باشد.'}]);setErrors(next);if(!next.length)onSubmit(password);};
  return <Modal onClose={onClose}><div className="modal-heading"><div><span>محافظت از Snapshot</span><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><FormValidationSummary errors={errors}/><label className="field-label"><RequiredLabel>رمز پشتیبان</RequiredLabel><input aria-required="true" aria-invalid={Boolean(errors.length)&&password.length<8} type="password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} placeholder="حداقل ۸ نویسه" /></label><div className="modal-actions"><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary" disabled={busy} onClick={submit}>{actionLabel}</button></div></Modal>;
}

type AuthMode = 'login' | 'password' | 'username';

function AuthPortal({currentUser, busy, globalError, onClearError, onClose, onRegister, onSubmit}: {currentUser?: LocalUser; busy: boolean; globalError: string | null; onClearError: () => void; onClose?: () => void; onRegister: () => void; onSubmit: (username: string, password: string) => void}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [smsPreview, setSmsPreview] = useState<{maskedMobile: string; message: string; verificationCode?: string} | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const changeMode = (next: AuthMode) => { setMode(next); setSmsPreview(null); setLocalError(null); setSuccess(null); onClearError(); };
  const validateLogin = () => {
    const errors = validateRequired([
      {label: 'نام کاربری', value: username, valid: (value) => String(value).trim().length >= 3, message: 'نام کاربری را کامل وارد کنید.'},
      {label: 'رمز عبور', value: password, valid: (value) => String(value).length >= 8, message: 'رمز عبور باید حداقل ۸ نویسه داشته باشد.'},
    ]);
    if (errors.length) { setLocalError(errors[0]); return; }
    setLocalError(null); onSubmit(username, password);
  };
  const requestRecovery = async () => {
    setLocalBusy(true); setLocalError(null);
    try { setSmsPreview(await service.requestPasswordRecovery(username, mobile)); }
    catch (cause) { setLocalError(messageOf(cause)); }
    finally { setLocalBusy(false); }
  };
  const finishRecovery = async () => {
    if (newPassword.length < 8) { setLocalError('رمز عبور جدید باید حداقل ۸ نویسه داشته باشد.'); return; }
    if (newPassword !== repeatPassword) { setLocalError('تکرار رمز عبور با رمز جدید یکسان نیست.'); return; }
    setLocalBusy(true); setLocalError(null);
    try { await service.completePasswordRecovery(username, mobile, code, newPassword); setSuccess('رمز عبور با موفقیت تغییر کرد. اکنون وارد سامانه شوید.'); setPassword(''); setSmsPreview(null); setMode('login'); }
    catch (cause) { setLocalError(messageOf(cause)); }
    finally { setLocalBusy(false); }
  };
  const requestUsername = async () => {
    setLocalBusy(true); setLocalError(null);
    try { setSmsPreview(await service.requestUsernameReminder(mobile)); }
    catch (cause) { setLocalError(messageOf(cause)); }
    finally { setLocalBusy(false); }
  };

  return <main className="auth-page" dir="rtl">
    <section className="auth-showcase" aria-label="معرفی سامانه تپرا">
      <div className="auth-brand"><span><Sparkles size={25} /></span><div><strong>تپرا</strong><small>سامانه یکپارچه مدیریت سازمان</small></div></div>
      <div className="auth-showcase-copy">
        <span className="auth-kicker"><i /> محیط امن و محلی سازمان</span>
        <h1>همه‌چیز برای یک<br/><em>روز کاری منظم</em></h1>
        <p>کاربران، دسترسی‌ها و گردش‌کارهای سازمان در یک تجربه فارسی، سریع و یکپارچه.</p>
      </div>
      <div className="auth-proof-grid">
        <div><ShieldCheck size={22}/><span><strong>دسترسی کنترل‌شده</strong><small>براساس نقش و محدوده</small></span></div>
        <div><Database size={22}/><span><strong>داده روی دستگاه</strong><small>بدون نیاز به سرور</small></span></div>
      </div>
      <small className="auth-showcase-foot">نسخه آزمایشی محصول · اطلاعات این محیط داخل مرورگر نگهداری می‌شود</small>
    </section>

    <section className="auth-workspace">
      {onClose && <button className="auth-close" onClick={onClose} aria-label="بازگشت به سامانه"><X size={20}/></button>}
      <div className="auth-card">
        <div className="auth-mobile-brand"><span><Sparkles size={20}/></span><strong>تپرا</strong></div>
        {mode !== 'login' && <button className="auth-back" onClick={() => changeMode('login')}><ArrowRight size={17}/> بازگشت به ورود</button>}
        <div className="auth-heading">
          <span>{mode === 'login' ? 'ورود به حساب کاربری' : mode === 'password' ? 'بازیابی رمز عبور' : 'یادآوری نام کاربری'}</span>
          <h2>{mode === 'login' ? 'خوش آمدید' : mode === 'password' ? 'رمزتان را بازیابی کنید' : 'نام کاربری را دریافت کنید'}</h2>
          <p>{mode === 'login' ? 'برای ادامه، اطلاعات حساب سازمانی خود را وارد کنید.' : mode === 'password' ? 'نام کاربری و شماره همراه ثبت‌شده در پرونده را وارد کنید.' : 'نام کاربری حساب فعال به شماره همراه ثبت‌شده ارسال می‌شود.'}</p>
        </div>

        {currentUser && <div className="auth-current-user"><span className="persona-avatar" style={{background: currentUser.accent}}>{currentUser.initials}</span><div><small>حساب فعلی</small><strong>{currentUser.name}</strong></div></div>}
        {(localError || globalError) && <div className="auth-alert auth-alert--danger"><CircleAlert size={18}/><span>{localError || globalError}</span></div>}
        {success && <div className="auth-alert auth-alert--success"><CheckCircle2 size={18}/><span>{success}</span></div>}

        {mode === 'login' && <form className="auth-form" onSubmit={(event) => {event.preventDefault();validateLogin();}}>
          <label><RequiredLabel>نام کاربری</RequiredLabel><span className="auth-input"><UserRound size={19}/><input dir="ltr" autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" /></span></label>
          <label><RequiredLabel>رمز عبور</RequiredLabel><span className="auth-input"><LockKeyhole size={19}/><input dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••"/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'پنهان‌کردن رمز عبور' : 'نمایش رمز عبور'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
          <div className="auth-help-row"><button type="button" onClick={() => changeMode('password')}>رمز عبور را فراموش کرده‌ام</button><button type="button" onClick={() => changeMode('username')}>نام کاربری را فراموش کرده‌ام</button></div>
          <button className="auth-primary" disabled={busy} type="submit"><LogIn size={19}/>{busy ? 'در حال ورود…' : 'ورود به سامانه'}</button>
        </form>}

        {mode === 'password' && <div className="auth-form">
          {!smsPreview ? <>
            <label><RequiredLabel>نام کاربری</RequiredLabel><span className="auth-input"><UserRound size={19}/><input dir="ltr" autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username"/></span></label>
            <label><RequiredLabel>شماره همراه</RequiredLabel><span className="auth-input"><Phone size={19}/><input dir="ltr" inputMode="numeric" maxLength={11} value={mobile} onChange={(event) => setMobile(normalizeIranianMobile(event.target.value))} placeholder="09121234567"/></span></label>
            <button className="auth-primary" disabled={localBusy} onClick={requestRecovery}><MessageSquareText size={19}/>{localBusy ? 'در حال بررسی…' : 'ارسال کد بازیابی'}</button>
          </> : <>
            <SmsPreview preview={smsPreview}/>
            <label><RequiredLabel>کد تأیید</RequiredLabel><span className="auth-input"><Fingerprint size={19}/><input dir="ltr" inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(event) => setCode(digitsOnly(event.target.value, 6))} placeholder="کد ۶ رقمی"/></span></label>
            <label><RequiredLabel>رمز عبور جدید</RequiredLabel><span className="auth-input"><LockKeyhole size={19}/><input dir="ltr" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="حداقل ۸ نویسه"/></span></label>
            <label><RequiredLabel>تکرار رمز عبور</RequiredLabel><span className="auth-input"><LockKeyhole size={19}/><input dir="ltr" type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} placeholder="تکرار رمز جدید"/></span></label>
            <button className="auth-primary" disabled={localBusy} onClick={finishRecovery}><BadgeCheck size={19}/>ثبت رمز عبور جدید</button>
          </>}
        </div>}

        {mode === 'username' && <div className="auth-form">
          <label><RequiredLabel>شماره همراه</RequiredLabel><span className="auth-input"><Phone size={19}/><input dir="ltr" inputMode="numeric" maxLength={11} autoFocus value={mobile} onChange={(event) => setMobile(normalizeIranianMobile(event.target.value))} placeholder="09121234567"/></span></label>
          {smsPreview && <SmsPreview preview={smsPreview}/>} 
          <button className="auth-primary" disabled={localBusy} onClick={requestUsername}><AtSign size={19}/>{localBusy ? 'در حال بررسی…' : 'ارسال نام کاربری با پیامک'}</button>
        </div>}

        <div className="auth-register"><span>حساب کاربری ندارید؟</span><button onClick={onRegister}><UserPlus size={17}/> ثبت‌نام در سامانه</button></div>
        <div className="auth-security"><LockKeyhole size={15}/><span>رمزها به‌صورت متن ساده ذخیره یا در گزارش‌ها ثبت نمی‌شوند.</span></div>
      </div>
    </section>
  </main>;
}

function SmsPreview({preview}: {preview: {maskedMobile: string; message: string}}) { return <div className="sms-preview"><MessageSquareText size={20}/><div><strong>پیش‌نمایش پیامک محلی</strong><span>گیرنده: {preview.maskedMobile}</span><p>{preview.message}</p></div></div>; }

function ConfirmLogoutDialog({user, busy, onClose, onConfirm}: {user: LocalUser; busy: boolean; onClose: () => void; onConfirm: () => void}) {
  return <Modal onClose={onClose}><div className="logout-dialog"><span className="logout-dialog__icon"><LogOut size={26}/></span><h2>از سامانه خارج می‌شوید؟</h2><p>نشست «{user.name}» روی این دستگاه پایان می‌یابد. داده‌های محلی شما حذف نمی‌شوند.</p><div className="modal-actions"><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--danger" disabled={busy} onClick={onConfirm}><LogOut size={17}/>{busy ? 'در حال خروج…' : 'خروج از سامانه'}</button></div></div></Modal>;
}

function RestoreDialog({input, busy, onClose, onSubmit}: {input: SnapshotManifest | EncryptedSnapshot; busy: boolean; onClose: () => void; onSubmit: (password?: string) => void}) {
  const encrypted = isEncryptedSnapshot(input);
  const [password, setPassword] = useState('');
  const [errors,setErrors]=useState<string[]>([]);const submit=()=>{const next=encrypted?validateRequired([{label:'رمز فایل',value:password,valid:(value)=>String(value).length>=8,message:'فیلد «رمز فایل» الزامی است و باید حداقل ۸ نویسه داشته باشد.'}]):[];setErrors(next);if(!next.length)onSubmit(encrypted?password:undefined);};
  return <Modal onClose={onClose}><div className="modal-heading"><div><span>بازیابی کنترل‌شده</span><h2>{encrypted ? 'پشتیبان رمزگذاری‌شده' : 'پشتیبان محلی تپرا'}</h2><p>داده فعلی با محتوای فایل جایگزین می‌شود و رخداد بازیابی در Audit ثبت خواهد شد.</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><FormValidationSummary errors={errors}/>{encrypted && <label className="field-label"><RequiredLabel>رمز فایل</RequiredLabel><input aria-required="true" type="password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} placeholder="رمز پشتیبان" /></label>}<div className="restore-summary"><FileJson size={21} /><div><strong>اعتبارسنجی Schema و checksum</strong><span>قبل از جایگزینی داده به‌صورت خودکار انجام می‌شود.</span></div></div><div className="modal-actions"><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary" disabled={busy} onClick={submit}>تأیید و بازیابی</button></div></Modal>;
}

function ProbeCard({title, scenario, request, decision, onRun}: {title: string; scenario: string; request: Parameters<typeof service.inspectAuthorization>[0]; decision: AuthorizationDecision; onRun: () => void}) {
  return <article className="probe-card"><div className="probe-top"><span className={decision.allowed ? 'decision decision--allowed' : 'decision decision--denied'}>{decision.allowed ? <CheckCircle2 size={16} /> : <LockKeyhole size={15} />}{decision.allowed ? 'مجاز' : 'رد شده'}</span><code dir="ltr">{request.permission}</code></div><h3>{title}</h3><p>{scenario}</p><div className="guard-dots"><GuardDot label="مجوز" passed={decision.permissionMatched} /><GuardDot label="محدوده" passed={decision.scopeMatched} /><GuardDot label="Policy" passed={decision.policyMatched} /><GuardDot label="Workflow" passed={decision.workflowMatched} /></div><div className="decision-reason">{decision.reasonFa}</div><button className="button button--secondary button--full" onClick={onRun}>اجرای آزمون و ثبت در Audit</button></article>;
}

function createPolicyProbes(persona: QaPersona) {
  const ownRequest: DemoResource = {id: 'demo-own-request', companyId: persona.companyId, unitId: persona.unitId ?? 'unit-finance', teamId: persona.teamId, ownerId: persona.actorId, createdBy: persona.actorId, state: 'PENDING_APPROVAL'};
  const warehouseAdjustment: DemoResource = {id: 'demo-adjustment', companyId: persona.companyId, unitId: 'unit-warehouse', ownerId: 'actor-inventory-maker', createdBy: 'actor-inventory-maker', state: 'SUBMITTED'};
  const externalRecord: DemoResource = {id: 'demo-other-company', companyId: 'company-outside', unitId: persona.unitId, ownerId: persona.actorId, createdBy: 'actor-other', state: 'DRAFT'};
  return [
    {id: 'dashboard', title: 'مشاهده داشبورد', scenario: 'یک مجوز پایه بدون Resource خاص.', request: {persona, permission: 'foundation.dashboard.view' as const, action: 'view' as const}},
    {id: 'self-approval', title: 'تأیید رکورد ساخته‌شده توسط خود', scenario: 'اثبات maker/checker؛ حتی با Permission باید رد شود.', request: {persona, permission: 'business.request.approve' as const, resource: ownRequest, action: 'approve' as const}},
    {id: 'warehouse', title: 'تأیید تعدیل انبار', scenario: 'فقط کاربر تأییدکننده انبار در همان واحد عبور می‌کند.', request: {persona, permission: 'business.inventory.approve' as const, resource: warehouseAdjustment, action: 'approve' as const, targetState: 'APPROVED', allowedTransitions: {SUBMITTED: ['APPROVED', 'RETURNED']}}},
    {id: 'company-boundary', title: 'دسترسی خارج از شرکت', scenario: 'حتی Role قوی از مرز شرکت عبور نمی‌کند.', request: {persona, permission: 'foundation.dashboard.view' as const, resource: externalRecord, action: 'view' as const}},
  ];
}

function Metric({icon: Icon, tone, value, label, detail}: {icon: LucideIcon; tone: string; value: string; label: string; detail: string}) { return <article className="metric-card"><span className={`metric-icon metric-icon--${tone}`}><Icon size={20} /></span><div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>; }
function Proof({icon: Icon, title, text}: {icon: LucideIcon; title: string; text: string}) { return <article><span><Icon size={19} /></span><div><strong>{title}</strong><p>{text}</p></div><CheckCircle2 size={18} /></article>; }
function PanelHeading({eyebrow, title, subtitle}: {eyebrow: string; title: string; subtitle: string}) { return <div className="panel-heading"><span>{eyebrow}</span><h3>{title}</h3><p>{subtitle}</p></div>; }
function PageIntro({icon: Icon, eyebrow, title, description}: {icon: LucideIcon; eyebrow: string; title: string; description: string}) { return <section className="page-intro"><span className="page-intro-icon"><Icon size={24} /></span><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div></section>; }
function DataSearchToolbar({value,onChange,placeholder,count,unit,compact=false}:{value:string;onChange:(value:string)=>void;placeholder:string;count:number;unit:string;compact?:boolean}) { return <div className={`data-search-toolbar ${compact?'data-search-toolbar--compact':''}`}><label className="search-box"><Search size={18}/><input type="search" value={value} onChange={(event)=>onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder}/></label><span>{count.toLocaleString('en-US')} {unit}</span></div>; }
function DataSearchEmpty({text}:{text:string}) { return <div className="empty-state data-search-empty"><Search size={25}/><strong>{text}</strong><span>عبارت جست‌وجو یا فیلتر را تغییر دهید.</span></div>; }
function GuardDot({label, passed}: {label: string; passed: boolean}) { return <span className={passed ? 'guard-dot guard-dot--passed' : 'guard-dot'}><i>{passed ? <Check size={11} /> : <X size={11} />}</i>{label}</span>; }
function DataAction({icon: Icon, tone, title, text, action, disabled, onClick}: {icon: LucideIcon; tone: string; title: string; text: string; action: string; disabled: boolean; onClick: () => void}) { return <article className={`data-action data-action--${tone}`}><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p><button disabled={disabled} onClick={onClick}>{disabled ? 'برای این کاربر مجاز نیست' : action}<ArrowLeft size={16} /></button></article>; }
function StorageDatum({label, value, mono = false}: {label: string; value: string; mono?: boolean}) { return <div className="storage-datum"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>; }
function Modal({children, onClose, wide = false}: {children: ReactNode; onClose: () => void; wide?: boolean}) { return <div className="modal-layer" role="dialog" aria-modal="true"><button className="modal-scrim" onClick={onClose} aria-label="بستن" /><section className={`modal-card ${wide ? 'modal-card--wide' : ''}`}>{children}</section></div>; }
function LoadingScreen() { return <div className="loading-screen" dir="rtl"><div className="brand-mark"><Sparkles size={25} /></div><strong>تپرا در حال آماده‌سازی بنیاد محلی است</strong><span>داده‌های این دستگاه بررسی می‌شوند…</span><i /></div>; }
function FatalState({error}: {error: string}) { return <div className="fatal-state" dir="rtl"><CircleAlert size={30} /><h1>راه‌اندازی Foundation ممکن نشد</h1><p>{error}</p><button onClick={() => location.reload()}>تلاش دوباره</button></div>; }

function scopeLabel(scope: QaPersona['scope']) { return ({COMPANY: 'کل شرکت', UNIT: 'واحد سازمانی', TEAM: 'تیم کاری', SELF: 'فقط خود', RECORD: 'رکورد مشخص'} as const)[scope]; }
function unitLabel(unitId?: string) { return ({'unit-finance': 'مالی', 'unit-sales': 'فروش', 'unit-warehouse': 'انبار', 'unit-support': 'پشتیبانی'} as Record<string, string>)[unitId ?? ''] ?? 'تمام شرکت'; }
function auditCategoryLabel(category: string) { return ({session: 'نشست کاربری', authorization: 'تصمیم دسترسی', data: 'مدیریت داده', system: 'سامانه'} as Record<string, string>)[category] ?? category; }
function permissionLabel(permission: PermissionCode) { const labels: Partial<Record<PermissionCode, string>> = {'organization.overview.view': 'مشاهده نمای سازمان', 'organization.units.view': 'مشاهده واحدها', 'organization.units.manage': 'مدیریت واحدها', 'organization.positions.view': 'مشاهده سمت‌ها', 'organization.positions.manage': 'مدیریت سمت‌ها', 'organization.users.create': 'ایجاد کاربر', 'organization.users.password.manage': 'تنظیم رمز کاربران', 'organization.roles.view': 'مشاهده نقش‌ها', 'organization.roles.manage': 'مدیریت نقش‌ها', 'organization.roles.assign': 'انتساب نقش', 'organization.personnel.view': 'مشاهده پرسنل', 'organization.personnel.manage': 'مدیریت پرسنل', 'organization.personnel.changes.review': 'بررسی صف تغییرات پرسنل', 'organization.personnel.banking.view': 'مشاهده اطلاعات بانکی', 'organization.personnel.banking.manage': 'ویرایش اطلاعات بانکی', 'organization.personnel.account.manage': 'مدیریت حساب پرسنل', 'organization.registrations.view': 'مشاهده درخواست‌های ثبت‌نام', 'organization.registrations.review': 'بررسی درخواست‌های ثبت‌نام', 'crm.customers.view': 'مشاهده مشتریان', 'crm.customers.create': 'ایجاد مشتری', 'crm.customers.edit': 'ویرایش مشتری', 'crm.customers.status.manage': 'مدیریت وضعیت مشتری', 'crm.customers.merge': 'ادغام مشتری تکراری', 'crm.customers.import': 'ورود گروهی مشتری'}; if (labels[permission]) return labels[permission]!; const last = permission.split('.').slice(-2).join('.'); return ({'dashboard.view': 'مشاهده داشبورد', 'preferences.manage': 'تنظیم ظاهر', 'users.view': 'مشاهده کاربران', 'users.edit': 'ویرایش کاربران', 'status.manage': 'مدیریت وضعیت کاربران', 'users.qa_login': 'مشاهده دسترسی کاربر', 'registrations.view': 'مشاهده درخواست‌های ثبت‌نام', 'registrations.review': 'بررسی درخواست‌های ثبت‌نام', 'qa.view': 'راهنمای آزمون', 'policy.inspect': 'بازرسی دسترسی', 'audit.view': 'مشاهده ممیزی', 'data.export': 'خروجی داده', 'data.manage': 'مدیریت داده', 'request.create': 'ثبت درخواست', 'request.approve': 'تأیید درخواست', 'inventory.adjust': 'ثبت تعدیل', 'inventory.approve': 'تأیید تعدیل'} as Record<string, string>)[last] ?? last; }
function actionLabel(action: string) { return ({'foundation.seed.completed': 'آماده‌سازی Seed قطعی', 'organization.foundation.migrated': 'ارتقای بنیاد سازمان', 'organization.session.signed_in': 'ورود با حساب محلی', 'organization.session.signed_out': 'خروج از سامانه', 'organization.session.password_recovery_requested': 'درخواست بازیابی رمز', 'organization.session.password_recovered': 'بازیابی رمز عبور', 'organization.session.username_reminder_requested': 'درخواست نام کاربری', 'organization.access_view.started': 'شروع مشاهده دسترسی کاربر', 'organization.access_view.ended': 'پایان مشاهده دسترسی کاربر', 'organization.unit.created': 'ایجاد واحد سازمانی', 'organization.unit.updated': 'ویرایش واحد سازمانی', 'organization.unit.status_changed': 'تغییر وضعیت واحد', 'organization.position.created': 'ایجاد سمت', 'organization.position.updated': 'ویرایش سمت', 'organization.position.deleted': 'حذف سمت سازمانی', 'organization.position.status_changed': 'تغییر وضعیت سمت', 'organization.personnel.profile_completed': 'تکمیل اطلاعات الزامی پرونده', 'organization.personnel.profile_change_requested': 'درخواست تغییر اطلاعات پرسنلی', 'organization.personnel.profile_change_approved': 'تأیید تغییر اطلاعات پرسنلی', 'organization.personnel.profile_change_rejected': 'رد تغییر اطلاعات پرسنلی', 'organization.personnel.unit_changed': 'تغییر واحد سازمانی پرسنل', 'organization.personnel.position_changed': 'تغییر سمت سازمانی پرسنل', 'organization.personnel.sales_hierarchy_changed': 'تغییر جایگاه در شبکه فروش', 'organization.personnel.branch_transferred': 'انتقال شعبه پرسنل', 'organization.personnel.exported': 'خروجی جامع پرسنل', 'organization.user.created': 'ایجاد کاربر', 'organization.user.updated': 'ویرایش کاربر', 'organization.user.credentials_changed': 'تغییر شخصی اطلاعات ورود', 'organization.user.activated': 'فعال‌سازی کاربر', 'organization.user.deactivated': 'غیرفعال‌سازی کاربر', 'organization.user.password_reset': 'تنظیم رمز کاربر', 'organization.role.created': 'ایجاد نقش', 'organization.role.updated': 'ویرایش نقش', 'organization.role.deleted': 'حذف نقش', 'organization.role.status_changed': 'تغییر وضعیت نقش', 'organization.role.permissions_changed': 'تغییر مجوزهای نقش', 'organization.role.assigned': 'انتساب نقش', 'organization.role.assignment_changed': 'تغییر انتساب نقش', 'foundation.qa.login_as_user': 'شروع مشاهده دسترسی کاربر', 'foundation.qa.return_to_admin': 'پایان مشاهده دسترسی کاربر', 'foundation.backup.export': 'خروجی پشتیبان', 'foundation.backup.encrypted': 'خروجی رمزگذاری‌شده', 'foundation.backup.restored': 'بازیابی پشتیبان', 'foundation.local.reset': 'بازنشانی محلی'} as Record<string, string>)[action] ?? action; }
function formatDateTime(value: string) { return formatPersianDateTime(value); }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'یک خطای پیش‌بینی‌نشده رخ داد.'; }
function legacyTerminology(value: string) { return value.replaceAll('مالک محصول', 'ادمین').replaceAll('Product Owner', 'ادمین').replaceAll('Persona', 'کاربر').replaceAll('ورود آزمایشی', 'مشاهده دسترسی'); }
function downloadJson(value: unknown, filename: string) { const blob = new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
