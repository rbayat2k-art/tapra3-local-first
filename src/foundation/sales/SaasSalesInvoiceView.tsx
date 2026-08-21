import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  BadgeCheck,
  CircleDollarSign,
  FilePenLine,
  FilePlus2,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { FoundationApiError, foundationApi } from '../api/client';
import type {
  FoundationCustomer,
  FoundationSalesInvoice,
  InvoiceItemType,
  SaleEntryMode,
  SalesAssignee,
  SalesInvoiceLineInput,
  SalesPaymentInfrastructure,
  SalesPaymentMethod,
} from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import {
  FULFILLMENT_STATUS_LABELS,
  formatRial,
  formatSalesDate,
  INVOICE_ITEM_TYPE_LABELS,
  SALE_ENTRY_MODE_LABELS,
  SALES_INVOICE_STATUS_LABELS,
  SALES_PAYMENT_METHOD_LABELS,
  SALES_PAYMENT_STATUS_LABELS,
} from './labels';
import { salesInvoiceLoadDependencies } from './loadDependencies';

interface Props {
  mode?: 'sales' | 'financial_review';
}

export interface LineDraft {
  itemType: InvoiceItemType;
  catalogReference: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}

const emptyLine = (): LineDraft => ({
  itemType: 'goods', catalogReference: '', itemName: '', quantity: '1', unitPrice: '', discountAmount: '0',
});
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const errorLabels: Record<string, string> = {
  permission_denied: 'برای انجام این عملیات دسترسی لازم را ندارید.',
  sales_invoice_not_found: 'فاکتور در محدوده دسترسی شما پیدا نشد.',
  invoice_self_approval_denied: 'فروشنده نمی‌تواند فاکتور فروش خودش را تأیید کند.',
  invoice_not_awaiting_supervisor: 'این فاکتور در انتظار تأیید سرپرست نیست.',
  payment_method_disabled: 'این روش پرداخت برای شرکت فعال نیست.',
  payment_recording_blocked: 'در وضعیت فعلی فاکتور امکان ثبت پرداخت وجود ندارد.',
  payment_self_review_denied: 'ثبت‌کننده پرداخت نمی‌تواند همان پرداخت را بررسی کند.',
  payment_review_reason_required: 'برای برگشت پرداخت، توضیح مالی الزامی است.',
  invoice_has_payments: 'پس از شروع عملیات پرداخت، مبلغ و اقلام فاکتور از این مسیر قابل تغییر نیست.',
  invoice_revision_blocked: 'در وضعیت فعلی امکان ایجاد نسخه اصلاحی فاکتور وجود ندارد.',
  financial_account_invalid: 'حساب مالی مقصد معتبر یا فعال نیست.',
  payment_overpayment_denied: 'تأیید این پرداخت از مبلغ فاکتور بیشتر می‌شود و مجاز نیست.',
};

function messageFrom(error: unknown): string {
  if (error instanceof FoundationApiError) return errorLabels[error.code] ?? 'عملیات انجام نشد. لطفاً اطلاعات را بررسی و دوباره تلاش کنید.';
  return 'ارتباط با سامانه انجام نشد. لطفاً دوباره تلاش کنید.';
}

export function toLineInput(lines: LineDraft[]): SalesInvoiceLineInput[] | null {
  const result = lines.map((line) => ({
    itemType: line.itemType,
    catalogReference: line.itemType === 'goods' && line.catalogReference.trim() ? line.catalogReference.trim() : undefined,
    itemName: line.itemName.trim(),
    quantity: Number(line.quantity),
    unitPrice: line.unitPrice,
    discountAmount: line.discountAmount || '0',
    sourceType: 'manual_addition' as const,
  }));
  if (result.some((line) => (
    line.itemName.length < 2 || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
    || !isRial(line.unitPrice) || !isRial(line.discountAmount ?? '0')
    || BigInt(line.discountAmount ?? '0') > BigInt(line.quantity) * BigInt(line.unitPrice)
  ))) return null;
  return result;
}

function isRial(value: string, positive = false): boolean {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) return false;
  const amount = BigInt(value);
  return amount <= 9_223_372_036_854_775_807n && (!positive || amount > 0n);
}

function remainingRial(finalAmount: string, approvedAmount: string): string {
  const remaining = BigInt(finalAmount) - BigInt(approvedAmount);
  return (remaining > 0n ? remaining : 0n).toString();
}

function invoiceTone(status: FoundationSalesInvoice['status']): string {
  if (status === 'financially_approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (['payment_correction_required', 'overpayment_hold', 'cancellation_requested'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'cancelled') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-indigo-200 bg-indigo-50 text-indigo-800';
}

function paymentTone(status: FoundationSalesInvoice['payments'][number]['status']): string {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'submitted') return 'bg-blue-100 text-blue-800';
  if (status === 'needs_correction') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

export function SaasSalesInvoiceView({ mode = 'sales' }: Props) {
  const { session } = useFoundationSession();
  const permissions = session?.activeContext?.permissions ?? [];
  const canRead = permissions.includes('sales.invoice.read_own') || permissions.includes('sales.invoice.read_all');
  const canCreate = permissions.includes('sales.sale.create');
  const canCreateOnBehalf = permissions.includes('sales.sale.create_on_behalf');
  const canApprove = permissions.includes('sales.invoice.supervisor_approve');
  const canRecordPayment = permissions.includes('sales.payment.record');
  const canReviewPayment = permissions.includes('sales.payment.review');
  const canReviseDraft = permissions.includes('sales.invoice.edit_draft');
  const canAmend = permissions.includes('sales.invoice.amend');
  const canManageInfrastructure = permissions.includes('sales.payment.infrastructure.manage');

  const [invoices, setInvoices] = useState<FoundationSalesInvoice[]>([]);
  const [customers, setCustomers] = useState<FoundationCustomer[]>([]);
  const [sellers, setSellers] = useState<SalesAssignee[]>([]);
  const [infrastructure, setInfrastructure] = useState<SalesPaymentInfrastructure | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [entryMode, setEntryMode] = useState<SaleEntryMode>('direct');
  const [sellerMembershipId, setSellerMembershipId] = useState('');
  const [createLines, setCreateLines] = useState<LineDraft[]>([emptyLine()]);

  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionLines, setRevisionLines] = useState<LineDraft[]>([]);
  const [revisionReason, setRevisionReason] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<Exclude<SalesPaymentMethod, 'payment_gateway'>>('card_to_card');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentLastFour, setPaymentLastFour] = useState('');
  const [paymentTracking, setPaymentTracking] = useState('');
  const [paymentOccurredAt, setPaymentOccurredAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [correctsPaymentId, setCorrectsPaymentId] = useState<string | undefined>();
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [accountName, setAccountName] = useState('');
  const [accountBank, setAccountBank] = useState('');
  const [accountReference, setAccountReference] = useState('');

  const load = useCallback(async () => {
    if (!canRead || (mode === 'financial_review' && !canReviewPayment)) return;
    setLoading(true);
    try {
      const dependencies = salesInvoiceLoadDependencies({
        mode, canCreate, canCreateOnBehalf, canRecordPayment, canManageInfrastructure,
      });
      const invoiceResponse = await foundationApi.listSalesInvoices();
      setInvoices(invoiceResponse.invoices);
      const selectableInvoices = mode === 'financial_review'
        ? invoiceResponse.invoices.filter((invoice) => ['awaiting_financial_review', 'payment_correction_required', 'overpayment_hold', 'partially_paid'].includes(invoice.status))
        : invoiceResponse.invoices;
      setSelectedId((current) => current && selectableInvoices.some((invoice) => invoice.id === current)
        ? current : selectableInvoices[0]?.id ?? null);
      if (dependencies.customers) {
        setCustomers((await foundationApi.listCustomers()).customers);
      }
      if (dependencies.sellers) {
        setSellers((await foundationApi.listSaleSellers()).sellers);
      }
      if (dependencies.paymentInfrastructure) {
        const paymentInfrastructure = await foundationApi.getSalesPaymentInfrastructure();
        setInfrastructure(paymentInfrastructure);
        setPaymentAccountId((current) => current || paymentInfrastructure.accounts.find((account) => account.active)?.id || '');
      }
      setError(null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [canCreate, canCreateOnBehalf, canManageInfrastructure, canRead, canRecordPayment, canReviewPayment, mode, session?.activeContext?.contextKey]);

  useEffect(() => { void load(); }, [load]);

  const visibleInvoices = useMemo(() => mode === 'financial_review'
    ? invoices.filter((invoice) => ['awaiting_financial_review', 'payment_correction_required', 'overpayment_hold', 'partially_paid'].includes(invoice.status))
    : invoices, [invoices, mode]);
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null;
  const enabledManualMethods = infrastructure?.policies
    .filter((policy) => policy.enabled && policy.manualReviewRequired && policy.method !== 'payment_gateway')
    .map((policy) => policy.method as Exclude<SalesPaymentMethod, 'payment_gateway'>) ?? [];

  const activeAccounts = infrastructure?.accounts.filter((account) => account.active) ?? [];
  const directSaleUsable = canCreate && sellers.some((seller) => seller.membershipId === session?.activeContext?.membershipId);
  const canOpenCreate = directSaleUsable || canCreateOnBehalf;

  const replaceInvoice = (invoice: FoundationSalesInvoice, message: string) => {
    setInvoices((current) => [invoice, ...current.filter((item) => item.id !== invoice.id)]);
    setSelectedId(invoice.id);
    setSuccess(message);
    setError(null);
  };

  const editLine = (
    setter: Dispatch<SetStateAction<LineDraft[]>>,
    index: number,
    patch: Partial<LineDraft>,
  ) => setter((current) => current.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line));

  const submitSale = async () => {
    if (!session || !customerId) { setError('انتخاب مشتری الزامی است.'); return; }
    const lines = toLineInput(createLines);
    if (!lines) { setError('اطلاعات اقلام، تعداد، مبلغ یا تخفیف معتبر نیست.'); return; }
    if (entryMode === 'paper_entry' && !sellerMembershipId) { setError('برای ثبت کاغذی، فروشنده واقعی را انتخاب کنید.'); return; }
    setSaving(true);
    try {
      const response = await foundationApi.createSaleAndInvoice({
        customerId, entryMode,
        sellerMembershipId: entryMode === 'paper_entry' ? sellerMembershipId : undefined,
        source: { ui: 'sales_invoice' }, lines,
      }, session.csrfToken);
      replaceInvoice(response.invoice, 'فروش ثبت و فاکتور به‌صورت خودکار ساخته شد.');
      setCreateOpen(false);
      setCustomerId('');
      setSellerMembershipId('');
      setCreateLines([emptyLine()]);
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const startRevision = () => {
    if (!selected) return;
    setRevisionLines(selected.lines.map((line) => ({
      itemType: line.itemType, catalogReference: line.catalogReference ?? '', itemName: line.itemName, quantity: String(line.quantity),
      unitPrice: String(line.unitPrice), discountAmount: String(line.discountAmount),
    })));
    setRevisionReason('');
    setRevisionOpen(true);
  };

  const submitRevision = async () => {
    if (!session || !selected) return;
    const lines = toLineInput(revisionLines);
    if (!lines) { setError('اطلاعات نسخه اصلاحی معتبر نیست.'); return; }
    if (selected.status !== 'awaiting_supervisor_approval' && selected.salesApprovalRequired && revisionReason.trim().length < 3) {
      setError('برای اصلاح فاکتور تأییدشده، دلیل تغییر الزامی است.'); return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.reviseSalesInvoice(selected.id, {
        lines, reason: revisionReason.trim() || undefined,
      }, session.csrfToken);
      replaceInvoice(response.invoice, 'نسخه جدید فاکتور ثبت و برای تأیید مجدد ارسال شد.');
      setRevisionOpen(false);
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const approveInvoice = async () => {
    if (!session || !selected) return;
    setSaving(true);
    try {
      replaceInvoice((await foundationApi.approveSalesInvoice(selected.id, session.csrfToken)).invoice, 'فاکتور تأیید و آماده دریافت پرداخت شد.');
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const recordPayment = async () => {
    if (!session || !selected) return;
    if (!isRial(paymentAmount, true) || !paymentAccountId || paymentTracking.trim().length < 2) {
      setError('مبلغ، حساب مقصد و شماره پیگیری را کامل و صحیح وارد کنید.'); return;
    }
    if (['card_to_card', 'bank_transfer'].includes(paymentMethod) && !/^\d{4}$/.test(paymentLastFour)) {
      setError('چهار رقم آخر برای این روش پرداخت الزامی است.'); return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.recordSalesPayment(selected.id, {
        amount: paymentAmount, paymentMethod, occurredAt: new Date(paymentOccurredAt).toISOString(),
        lastFourDigits: paymentLastFour || undefined, destinationAccountId: paymentAccountId,
        trackingNumber: paymentTracking.trim(), correctsPaymentId,
      }, session.csrfToken);
      replaceInvoice(response.invoice, correctsPaymentId ? 'نسخه اصلاحی پرداخت ثبت شد.' : 'پرداخت برای بررسی مالی ثبت شد.');
      setPaymentAmount(''); setPaymentLastFour(''); setPaymentTracking(''); setCorrectsPaymentId(undefined);
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const reviewPayment = async (paymentId: string, decision: 'approved' | 'needs_correction') => {
    if (!session || !selected) return;
    const reason = reviewReasons[paymentId]?.trim();
    if (decision !== 'approved' && (!reason || reason.length < 3)) {
      setError('برای برگشت یا رد پرداخت، توضیح مالی الزامی است.'); return;
    }
    setSaving(true);
    try {
      const response = await foundationApi.reviewSalesPayment(selected.id, paymentId, { decision, reason }, session.csrfToken);
      replaceInvoice(response.invoice, decision === 'approved' ? 'پرداخت تأیید شد.' : 'پرداخت برای اصلاح برگشت داده شد.');
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const createAccount = async () => {
    if (!session || accountName.trim().length < 2 || accountBank.trim().length < 2 || accountReference.trim().length < 4) {
      setError('نام حساب، نام بانک و شناسه پوشیده حساب را کامل کنید.'); return;
    }
    setSaving(true);
    try {
      await foundationApi.createSalesCollectionAccount({
        displayName: accountName.trim(), bankName: accountBank.trim(), maskedReference: accountReference.trim(),
      }, session.csrfToken);
      setAccountName(''); setAccountBank(''); setAccountReference('');
      setSuccess('حساب دریافت وجه ایجاد شد.');
      await load();
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const toggleAccount = async (account: SalesPaymentInfrastructure['accounts'][number]) => {
    if (!session || !account.maskedReference) return;
    setSaving(true);
    try {
      await foundationApi.updateSalesCollectionAccount(account.id, {
        displayName: account.name, bankName: account.bankName,
        maskedReference: account.maskedReference, isActive: !account.active,
      }, session.csrfToken);
      setSuccess(account.active ? 'حساب دریافت وجه غیرفعال شد.' : 'حساب دریافت وجه فعال شد.');
      await load();
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  const toggleApprovalPolicy = async () => {
    if (!session || !infrastructure) return;
    setSaving(true);
    try {
      await foundationApi.updateSalesApprovalPolicy(
        !infrastructure.salesApprovalPolicy.supervisorApprovalRequired, session.csrfToken,
      );
      setSuccess('تنظیم تأیید سرپرست برای فروش‌های بعدی به‌روزرسانی شد.');
      await load();
    } catch (caught) { setError(messageFrom(caught)); } finally { setSaving(false); }
  };

  if (!canRead || (mode === 'financial_review' && !canReviewPayment)) return <div dir="rtl" className="p-6 text-slate-500">برای مشاهده این بخش دسترسی لازم را ندارید.</div>;

  return <div dir="rtl" className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          {mode === 'financial_review' ? <CircleDollarSign className="h-5 w-5" /> : <FilePlus2 className="h-5 w-5" />}
          {mode === 'financial_review' ? 'کارتابل بررسی مالی پرداخت‌ها' : 'فروش و فاکتور'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'financial_review'
            ? 'هر پرداخت مستقل بررسی می‌شود و فقط تکمیل دقیق مبلغ تأییدشده، اقلام فاکتور را برای اجرا آزاد می‌کند.'
            : 'فروش، فاکتور، نسخه‌های اصلاحی و پرداخت‌ها با تاریخچه کامل و دسترسی کنترل‌شده ثبت می‌شوند.'}
        </p>
      </div>
      <div className="flex gap-2">
        {mode === 'sales' && canOpenCreate && <button type="button" onClick={() => {
          setEntryMode(directSaleUsable ? 'direct' : 'paper_entry');
          setCreateOpen((value) => !value);
        }} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" />ثبت فروش جدید
        </button>}
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />بازخوانی
        </button>
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

    {canManageInfrastructure && infrastructure && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-bold text-slate-800">تنظیمات دریافت وجه و تأیید فروش</h3><p className="mt-1 text-xs text-slate-500">اطلاعات حساس کامل نمایش داده نمی‌شود و همه تغییرها در سابقه مدیریتی ثبت می‌شوند.</p></div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={infrastructure.salesApprovalPolicy.supervisorApprovalRequired} onChange={() => void toggleApprovalPolicy()} disabled={saving} />تأیید سرپرست برای فروش‌های جدید الزامی باشد</label>
      </div>
      <div className="grid gap-2 md:grid-cols-4"><input aria-label="نام حساب دریافت وجه" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="نام حساب" className={inputClass} /><input aria-label="نام بانک" value={accountBank} onChange={(event) => setAccountBank(event.target.value)} placeholder="نام بانک" className={inputClass} /><input aria-label="شناسه پوشیده حساب" value={accountReference} onChange={(event) => setAccountReference(event.target.value)} placeholder="مانند •••• ۱۲۳۴" className={inputClass} /><button type="button" disabled={saving} onClick={() => void createAccount()} className="mt-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">افزودن حساب</button></div>
      <div className="flex flex-wrap gap-2">{infrastructure.accounts.map((account) => <div key={account.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"><span>{account.name} · {account.bankName} · {account.maskedReference ?? 'شناسه ثبت نشده'}</span><button type="button" disabled={saving || !account.maskedReference} onClick={() => void toggleAccount(account)} className={account.active ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{account.active ? 'غیرفعال‌کردن' : 'فعال‌کردن'}</button></div>)}</div>
    </section>}

    {createOpen && <section className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <h3 className="font-bold text-slate-800">ثبت فروش و ساخت خودکار فاکتور</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-600">مشتری
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">
            <option value="">انتخاب مشتری</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} — {customer.phonePrimary}</option>)}
          </select>
        </label>
        {canCreateOnBehalf && <label className="text-sm text-slate-600">روش ثبت
          <select value={entryMode} onChange={(event) => setEntryMode(event.target.value as SaleEntryMode)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">
            {directSaleUsable && <option value="direct">{SALE_ENTRY_MODE_LABELS.direct}</option>}
            <option value="paper_entry">{SALE_ENTRY_MODE_LABELS.paper_entry}</option>
          </select>
        </label>}
        {entryMode === 'paper_entry' && <label className="text-sm text-slate-600">فروشنده واقعی
          <select value={sellerMembershipId} onChange={(event) => setSellerMembershipId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2">
            <option value="">انتخاب فروشنده</option>
            {sellers.map((seller) => <option key={seller.membershipId} value={seller.membershipId}>{seller.fullName}</option>)}
          </select>
        </label>}
      </div>
      <LineEditor lines={createLines} setLines={setCreateLines} editLine={editLine} />
      <button type="button" disabled={saving} onClick={() => void submitSale()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">ثبت فروش و ساخت فاکتور</button>
    </section>}

    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.36fr)_minmax(0,1fr)]">
      <aside className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading && <div className="p-6 text-center text-slate-400">در حال دریافت فاکتورها…</div>}
        {!loading && visibleInvoices.length === 0 && <div className="p-6 text-center text-slate-400">فاکتوری در این بخش وجود ندارد.</div>}
        {visibleInvoices.map((invoice) => <button key={invoice.id} type="button" onClick={() => { setSelectedId(invoice.id); setRevisionOpen(false); setSuccess(null); }}
          className={`block w-full p-4 text-right hover:bg-slate-50 ${selectedId === invoice.id ? 'bg-indigo-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-slate-800">{invoice.code}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${invoiceTone(invoice.status)}`}>{SALES_INVOICE_STATUS_LABELS[invoice.status]}</span>
          </div>
          <div className="mt-2 text-sm text-slate-600">{invoice.sale.customer.name}</div>
          <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{invoice.sale.seller.name}</span><span>{formatRial(invoice.finalAmount)}</span></div>
        </button>)}
      </aside>

      <div>
        {!selected && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">یک فاکتور را انتخاب کنید.</div>}
        {selected && <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-lg font-bold text-slate-800">{selected.code}</h3><span className="text-xs text-slate-400">نسخه {new Intl.NumberFormat('fa-IR').format(selected.revision)}</span></div>
                <div className="mt-1 text-sm text-slate-500">مشتری: {selected.sale.customer.name} · فروشنده: {selected.sale.seller.name}</div>
                <div className="mt-1 text-xs text-slate-400">ثبت‌کننده: {selected.sale.actor.name} · {SALE_ENTRY_MODE_LABELS[selected.sale.entryMode]}</div>
              </div>
              <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${invoiceTone(selected.status)}`}>{SALES_INVOICE_STATUS_LABELS[selected.status]}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <AmountCard label="مبلغ فاکتور" value={selected.finalAmount} />
              <AmountCard label="پرداخت تأییدشده" value={selected.approvedPaymentAmount} />
              <AmountCard label="مانده" value={remainingRial(selected.finalAmount, selected.approvedPaymentAmount)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canApprove && selected.salesApprovalRequired && selected.status === 'awaiting_supervisor_approval' && selected.sale.seller.membershipId !== session?.activeContext?.membershipId && <button type="button" disabled={saving} onClick={() => void approveInvoice()} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><BadgeCheck className="h-4 w-4" />تأیید سرپرست</button>}
              {((selected.status === 'awaiting_supervisor_approval' && canReviseDraft) || (selected.status === 'awaiting_payment' && ((!selected.salesApprovalRequired && canReviseDraft) || (selected.salesApprovalRequired && canAmend)))) && <button type="button" onClick={startRevision} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"><FilePenLine className="h-4 w-4" />ایجاد نسخه اصلاحی</button>}
            </div>
          </section>

          {revisionOpen && <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h3 className="font-bold text-slate-800">نسخه اصلاحی فاکتور</h3>
            <p className="text-xs text-slate-500">نسخه قبلی در تاریخچه باقی می‌ماند و تغییر مهم دوباره نیازمند تأیید سرپرست است.</p>
            <LineEditor lines={revisionLines} setLines={setRevisionLines} editLine={editLine} />
            {selected.status !== 'awaiting_supervisor_approval' && selected.salesApprovalRequired && <textarea value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} rows={2} placeholder="دلیل اصلاح فاکتور" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />}
            <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void submitRevision()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">ثبت نسخه جدید</button><button type="button" onClick={() => setRevisionOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">انصراف</button></div>
          </section>}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-slate-800">اقلام فاکتور</h3>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="border-b text-xs text-slate-400"><tr><th className="p-2">ردیف</th><th className="p-2">نوع</th><th className="p-2">شرح</th><th className="p-2">کد کالای انبار</th><th className="p-2">تعداد</th><th className="p-2">مبلغ واحد</th><th className="p-2">تخفیف</th><th className="p-2">جمع</th><th className="p-2">وضعیت اجرا</th></tr></thead><tbody>
              {selected.lines.map((line) => <tr key={line.id} className="border-b border-slate-100"><td className="p-2">{new Intl.NumberFormat('fa-IR').format(line.lineNumber)}</td><td className="p-2">{INVOICE_ITEM_TYPE_LABELS[line.itemType]}</td><td className="p-2 font-medium text-slate-700">{line.itemName}</td><td className="p-2 text-xs text-slate-500">{line.catalogReference ?? (line.itemType === 'goods' ? 'متصل نشده' : '—')}</td><td className="p-2">{new Intl.NumberFormat('fa-IR').format(line.quantity)}</td><td className="p-2">{formatRial(line.unitPrice)}</td><td className="p-2">{formatRial(line.discountAmount)}</td><td className="p-2 font-semibold">{formatRial(line.lineTotal)}</td><td className="p-2 text-xs">{FULFILLMENT_STATUS_LABELS[line.fulfillmentStatus] ?? 'در حال بررسی'}</td></tr>)}
            </tbody></table></div>
          </section>

          {canRecordPayment && (selected.supervisorApproval || !selected.salesApprovalRequired) && !['financially_approved', 'cancelled', 'cancellation_requested'].includes(selected.status) && <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-5">
            <h3 className="flex items-center gap-2 font-bold text-slate-800"><CircleDollarSign className="h-4 w-4" />{correctsPaymentId ? 'ثبت نسخه اصلاحی پرداخت' : 'ثبت پرداخت'}</h3>
            {correctsPaymentId && <p className="flex items-center gap-2 text-xs text-amber-700"><RotateCcw className="h-3.5 w-3.5" />این پرداخت جایگزین مورد برگشتی می‌شود و سابقه قبلی باقی می‌ماند.</p>}
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="مبلغ پرداخت"><input inputMode="numeric" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className={inputClass} /></Field>
              <Field label="روش پرداخت"><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as Exclude<SalesPaymentMethod, 'payment_gateway'>)} className={inputClass}>{enabledManualMethods.map((method) => <option key={method} value={method}>{SALES_PAYMENT_METHOD_LABELS[method]}</option>)}</select></Field>
              <Field label="حساب مقصد"><select value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} className={inputClass}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.bankName}{account.maskedReference ? ` · ${account.maskedReference}` : ''}</option>)}</select></Field>
              <Field label="چهار رقم آخر"><input inputMode="numeric" maxLength={4} value={paymentLastFour} onChange={(event) => setPaymentLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} /></Field>
              <Field label="شماره پیگیری"><input value={paymentTracking} onChange={(event) => setPaymentTracking(event.target.value)} className={inputClass} /></Field>
              <Field label="تاریخ و ساعت"><input type="datetime-local" value={paymentOccurredAt} onChange={(event) => setPaymentOccurredAt(event.target.value)} className={inputClass} /></Field>
            </div>
            <div className="flex gap-2"><button type="button" disabled={saving || enabledManualMethods.length === 0} onClick={() => void recordPayment()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{correctsPaymentId ? 'ثبت اصلاح پرداخت' : 'ثبت برای بررسی مالی'}</button>{correctsPaymentId && <button type="button" onClick={() => setCorrectsPaymentId(undefined)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">انصراف</button>}</div>
          </section>}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold text-slate-800">پرداخت‌ها</h3>
            {selected.payments.length === 0 && <p className="mt-3 text-sm text-slate-400">هنوز پرداختی ثبت نشده است.</p>}
            <div className="mt-3 space-y-3">{selected.payments.map((payment) => <article key={payment.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold text-slate-700">{formatRial(payment.amount)} · {SALES_PAYMENT_METHOD_LABELS[payment.method]}</div><div className="mt-1 text-xs text-slate-400">{formatSalesDate(payment.occurredAt)} · پیگیری: {payment.trackingNumber ?? 'ثبت نشده'} · ثبت‌کننده: {payment.recorderName}</div></div><span className={`rounded-full px-2 py-1 text-xs ${paymentTone(payment.status)}`}>{SALES_PAYMENT_STATUS_LABELS[payment.status]}</span></div>
              {payment.reviewReason && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">توضیح مالی: {payment.reviewReason}</p>}
              {canReviewPayment && payment.status === 'submitted' && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3"><textarea value={reviewReasons[payment.id] ?? ''} onChange={(event) => setReviewReasons((current) => ({ ...current, [payment.id]: event.target.value }))} rows={2} placeholder="توضیح مالی برای برگشت" className="w-full rounded-lg border border-slate-300 p-2 text-sm" /><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void reviewPayment(payment.id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">تأیید پرداخت</button><button type="button" disabled={saving} onClick={() => void reviewPayment(payment.id, 'needs_correction')} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">برگشت برای اصلاح</button></div></div>}
              {canRecordPayment && payment.status === 'needs_correction' && !payment.supersededByPaymentId && <button type="button" onClick={() => { setCorrectsPaymentId(payment.id); setPaymentAmount(String(payment.amount)); setPaymentMethod(payment.method === 'payment_gateway' ? 'card_to_card' : payment.method); setPaymentLastFour(payment.lastFourDigits ?? ''); setPaymentTracking(''); }} className="mt-3 flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-700"><RotateCcw className="h-3.5 w-3.5" />ثبت اصلاح این پرداخت</button>}
            </article>)}</div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="flex items-center gap-2 font-bold text-slate-800"><History className="h-4 w-4" />تاریخچه فاکتور</h3>
            <div className="mt-3 space-y-2">{selected.history.map((event) => <div key={event.id} className="flex items-start gap-2 border-r-2 border-indigo-200 pr-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 text-indigo-500" /><div><div className="text-slate-700">{eventTypeLabel(event.type)}</div><div className="text-xs text-slate-400">{event.actorName} · {formatSalesDate(event.occurredAt)}</div>{event.reason && <div className="mt-1 text-xs text-slate-500">{event.reason}</div>}</div></div>)}</div>
          </section>
        </div>}
      </div>
    </div>
  </div>;
}

function AmountCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 font-bold text-slate-800">{formatRial(value)}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-sm text-slate-600">{label}{children}</label>;
}

function LineEditor({ lines, setLines, editLine }: {
  lines: LineDraft[];
  setLines: Dispatch<SetStateAction<LineDraft[]>>;
  editLine: (setter: Dispatch<SetStateAction<LineDraft[]>>, index: number, patch: Partial<LineDraft>) => void;
}) {
  return <div className="space-y-2">
    {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-[110px_150px_minmax(180px,1fr)_90px_140px_140px_40px]">
      <select aria-label="نوع قلم" value={line.itemType} onChange={(event) => editLine(setLines, index, { itemType: event.target.value as InvoiceItemType })} className={inputClass}>{(Object.keys(INVOICE_ITEM_TYPE_LABELS) as InvoiceItemType[]).map((item) => <option key={item} value={item}>{INVOICE_ITEM_TYPE_LABELS[item]}</option>)}</select>
      <input aria-label="کد کالای انبار" value={line.catalogReference} onChange={(event) => editLine(setLines, index, { catalogReference: event.target.value })} placeholder={line.itemType === 'goods' ? 'کد کالای انبار' : 'برای خدمت لازم نیست'} disabled={line.itemType !== 'goods'} className={inputClass} />
      <input aria-label="شرح قلم" value={line.itemName} onChange={(event) => editLine(setLines, index, { itemName: event.target.value })} placeholder="شرح کالا یا خدمت" className={inputClass} />
      <input aria-label="تعداد" inputMode="numeric" value={line.quantity} onChange={(event) => editLine(setLines, index, { quantity: event.target.value })} placeholder="تعداد" className={inputClass} />
      <input aria-label="مبلغ واحد" inputMode="numeric" value={line.unitPrice} onChange={(event) => editLine(setLines, index, { unitPrice: event.target.value })} placeholder="مبلغ واحد" className={inputClass} />
      <input aria-label="تخفیف" inputMode="numeric" value={line.discountAmount} onChange={(event) => editLine(setLines, index, { discountAmount: event.target.value })} placeholder="تخفیف" className={inputClass} />
      <button type="button" aria-label="حذف قلم" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg text-rose-500 disabled:text-slate-300"><Trash2 className="mx-auto h-4 w-4" /></button>
    </div>)}
    <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="flex items-center gap-1 text-sm font-medium text-indigo-600"><Plus className="h-4 w-4" />افزودن قلم</button>
  </div>;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    invoice_created: 'فاکتور ساخته شد',
    invoice_revised: 'نسخه اصلاحی فاکتور ثبت شد',
    supervisor_approved: 'فاکتور توسط سرپرست تأیید شد',
    payment_recorded: 'پرداخت ثبت شد',
    payment_reviewed: 'پرداخت بررسی شد',
  };
  return labels[type] ?? 'رویداد فاکتور ثبت شد';
}
