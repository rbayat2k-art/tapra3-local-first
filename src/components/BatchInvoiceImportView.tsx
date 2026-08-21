import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  SalesInvoice, Customer, Product, ServiceCatalogItem, Promotion, User, SystemRole,
  SystemPermission, DeclaredPaymentMethod
} from '../types';
import {
  resolveBatchInvoiceRows, BatchInvoiceRowInput, BatchInvoiceGroupResult,
  BatchInvoiceResolution, BatchPaymentRowInput
} from '../utils/batchInvoiceImport';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { formatPortalMoney, getPortalNowTimestamp, toLatinDigits } from '../utils/operationalFormat';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BatchInvoiceImportViewProps {
  salesInvoices: SalesInvoice[];
  onUpdateSalesInvoices: (invoices: SalesInvoice[]) => void;
  customers: Customer[];
  onUpdateCustomers: (customers: Customer[]) => void;
  products: Product[];
  services: ServiceCatalogItem[];
  promotions: Promotion[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const OUTCOME_LABELS: Record<BatchInvoiceGroupResult['outcome'], string> = {
  created: 'آماده ثبت',
  conflict: 'تعارض هویتی',
  invalid_phone: 'شماره نامعتبر',
  item_not_found: 'قلم نامعتبر',
  duplicate: 'تکراری',
  invalid_reference: 'ارجاع نامعتبر',
  error: 'خطا'
};

const getText = (row: Record<string, unknown>, key: string) => String(row[key] ?? '').trim();
const getNormalizedText = (row: Record<string, unknown>, key: string) => toLatinDigits(getText(row, key));
const getNumber = (row: Record<string, unknown>, key: string, fallback = 0) => {
  const value = Number(toLatinDigits(String(row[key] ?? '')).replace(/[٬,]/g, '').trim());
  return Number.isFinite(value) ? value : fallback;
};

function normalizePaymentMethod(value: string): DeclaredPaymentMethod {
  const normalized = value.trim().toLowerCase();
  if (['card_to_card', 'کارت به کارت'].includes(normalized)) return 'card_to_card';
  if (['cash', 'نقدی'].includes(normalized)) return 'cash';
  if (['gateway', 'درگاه'].includes(normalized)) return 'gateway';
  return 'other';
}

export const BatchInvoiceImportView: React.FC<BatchInvoiceImportViewProps> = ({
  salesInvoices, onUpdateSalesInvoices, customers, onUpdateCustomers, products, services, promotions, users,
  currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const canImport = hasPermission(effectivePermissions, ['bulk_import_invoices']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [salespersonId, setSalespersonId] = useState('');
  const [fileName, setFileName] = useState('');
  const [batchImportId, setBatchImportId] = useState('');
  const [invoiceRows, setInvoiceRows] = useState<BatchInvoiceRowInput[]>([]);
  const [paymentRows, setPaymentRows] = useState<BatchPaymentRowInput[]>([]);
  const [preview, setPreview] = useState<BatchInvoiceResolution | null>(null);
  const [committedResults, setCommittedResults] = useState<BatchInvoiceGroupResult[] | null>(null);
  const [error, setError] = useState('');

  if (!currentUser) return null;
  if (!canImport) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی ثبت گروهی فاکتور را ندارید.</div>;

  const salesRoleIds = new Set(roles.filter((role) => role.organizationalLevel !== undefined).map((role) => role.id));
  const salesUsers = users.filter((user) => user.isActive !== false && !!user.roleId && salesRoleIds.has(user.roleId));

  const resetParsed = () => {
    setInvoiceRows([]);
    setPaymentRows([]);
    setPreview(null);
    setCommittedResults(null);
    setError('');
  };

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      'کلید فاکتور خارجی': 'EXT-1001', 'شماره تماس مشتری': '09121234567', 'نام مشتری': 'نام مشتری',
      'استان': 'تهران', 'شهر': 'تهران', 'آدرس': 'آدرس کامل', 'تصویر برگه (اختیاری)': '', 'توضیحات': ''
    }]), 'Invoices');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      'کلید فاکتور خارجی': 'EXT-1001', 'کد کالا/خدمت/پروموشن': 'P-001', 'تعداد': 1, 'تخفیف مجاز': 0
    }]), 'Items');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      'کلید فاکتور خارجی': 'EXT-1001', 'مبلغ واریز اعلامی': 0, 'تاریخ واریز': '1405/05/18',
      'ساعت واریز': '12:30:00', 'روش پرداخت': 'کارت به کارت', 'شماره پیگیری': '', 'حساب مقصد': '', 'تصویر فیش (اختیاری)': ''
    }]), 'Payments');
    XLSX.writeFile(workbook, 'قالب_سه_شیتی_ثبت_گروهی_فاکتور.xlsx');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetParsed();
    setFileName(file.name);
    const id = `batch_${Date.now()}`;
    setBatchImportId(id);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: 'array' });
        const missing = ['Invoices', 'Items', 'Payments'].filter((name) => !workbook.Sheets[name]);
        if (missing.length > 0) throw new Error(`Sheetهای الزامی یافت نشد: ${missing.join('، ')}`);
        const invoices = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Invoices, { defval: '' });
        const items = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Items, { defval: '' });
        const payments = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Payments, { defval: '' });
        const invoiceMap = new Map(invoices.map((row) => [getText(row, 'کلید فاکتور خارجی'), row]));
        const parsedItems: BatchInvoiceRowInput[] = items.map((row, index) => {
          const key = getText(row, 'کلید فاکتور خارجی');
          const parent = invoiceMap.get(key) || {};
          return {
            rowIndex: index + 2,
            externalInvoiceKey: key,
            customerPhone: getNormalizedText(parent, 'شماره تماس مشتری'),
            customerName: getText(parent, 'نام مشتری') || undefined,
            province: getText(parent, 'استان') || undefined,
            city: getText(parent, 'شهر') || undefined,
            address: getText(parent, 'آدرس') || undefined,
            registrationSheetImageUrl: getText(parent, 'تصویر برگه (اختیاری)') || undefined,
            description: getText(parent, 'توضیحات') || undefined,
            itemCode: getText(row, 'کد کالا/خدمت/پروموشن'),
            quantity: getNumber(row, 'تعداد', 1),
            discount: getNumber(row, 'تخفیف مجاز', 0)
          };
        });
        const parsedPayments: BatchPaymentRowInput[] = payments
          .filter((row) => getText(row, 'کلید فاکتور خارجی') || getNumber(row, 'مبلغ واریز اعلامی') > 0)
          .map((row, index) => ({
            rowIndex: index + 2,
            externalInvoiceKey: getText(row, 'کلید فاکتور خارجی'),
            amount: getNumber(row, 'مبلغ واریز اعلامی'),
            date: getNormalizedText(row, 'تاریخ واریز'),
            time: getNormalizedText(row, 'ساعت واریز') || undefined,
            method: normalizePaymentMethod(getText(row, 'روش پرداخت')),
            trackingNumber: getText(row, 'شماره پیگیری') || undefined,
            destinationAccount: getText(row, 'حساب مقصد') || undefined,
            receiptImageUrl: getText(row, 'تصویر فیش (اختیاری)') || undefined
          }));
        const itemKeys = new Set(parsedItems.map((row) => row.externalInvoiceKey));
        const invoiceWithoutItems = [...invoiceMap.keys()].filter((key) => key && !itemKeys.has(key));
        if (invoiceWithoutItems.length > 0) throw new Error(`فاکتور بدون قلم: ${invoiceWithoutItems.join('، ')}`);
        setInvoiceRows(parsedItems);
        setPaymentRows(parsedPayments);
      } catch (readError) {
        setError(readError instanceof Error ? readError.message : 'فایل قابل خواندن نیست.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const buildPreview = () => {
    setError('');
    if (!salespersonId) { setError('انتخاب فروشنده الزامی است.'); return; }
    if (invoiceRows.length === 0) { setError('هیچ ردیف معتبری برای بررسی وجود ندارد.'); return; }
    const salesperson = users.find((user) => user.id === salespersonId);
    if (!salesperson) { setError('فروشنده انتخاب‌شده معتبر نیست.'); return; }
    const resolution = resolveBatchInvoiceRows(
      invoiceRows, customers, products, services, promotions, salesInvoices,
      { id: salesperson.id, fullName: salesperson.fullName, salesSupervisorId: salesperson.salesSupervisorId },
      { id: currentUser.id, fullName: currentUser.fullName }, getPortalNowTimestamp(),
      storage.getSalesOrgAssignments(), users, storage.getSalesBranches(),
      { payments: paymentRows, batchImportId, sourceFileName: fileName }
    );
    setPreview(resolution);
  };

  const commitPreview = () => {
    if (!preview) return;
    const created = preview.results.filter((result) => result.outcome === 'created' && result.invoice).map((result) => result.invoice!);
    if (created.length === 0) { setError('هیچ فاکتور معتبری برای ثبت وجود ندارد.'); return; }
    const updatedInvoices = [...created, ...salesInvoices];
    const transaction = storage.saveCustomerIdentityTransaction({ salesInvoices: updatedInvoices, customers: preview.updatedCustomers });
    if (transaction.ok === false) { setError(`خطا در ذخیره‌سازی: ${transaction.error}`); return; }
    logAudit({
      action: 'batch_invoice_import_committed', effectiveUser: currentUser, impersonatorAdmin, roles,
      targetId: batchImportId, details: `${created.length} فاکتور از ${fileName}`
    });
    onUpdateSalesInvoices(updatedInvoices);
    onUpdateCustomers(preview.updatedCustomers);
    setCommittedResults(preview.results);
    setPreview(null);
  };

  const downloadResults = () => {
    const results = committedResults || preview?.results;
    if (!results) return;
    const sheet = XLSX.utils.json_to_sheet(results.map((result) => ({
      'کلید فاکتور خارجی': result.externalInvoiceKey,
      'ردیف‌های منبع': result.rowIndexes.join('، '),
      'نتیجه': OUTCOME_LABELS[result.outcome],
      'کد فاکتور': result.invoice?.invoiceCode || '',
      'وضعیت فاکتور': result.invoice?.status || '',
      'مبلغ نهایی': result.invoice?.finalAmount || 0,
      'شرح': result.errorMessage || ''
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Results');
    XLSX.writeFile(workbook, `نتیجه_${batchImportId || 'batch'}.xlsx`);
  };

  const results = committedResults || preview?.results || [];
  const validCount = results.filter((result) => result.outcome === 'created').length;

  return (
    <div className="space-y-5" dir="rtl">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><FileSpreadsheet className="h-5 w-5" /> ثبت گروهی فاکتور کاغذی</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">سه Sheet مستقل؛ ابتدا بررسی و پیش‌نمایش، سپس ثبت قطعی. هر فاکتور هویت و گردش مستقل دارد.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_minmax(240px,1fr)_minmax(240px,1fr)]">
          <button onClick={downloadTemplate} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
            <Download className="h-4 w-4" /> دانلود قالب سه‌شیتی
          </button>
          <select value={salespersonId} onChange={(event) => { setSalespersonId(event.target.value); setPreview(null); setCommittedResults(null); }} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">انتخاب فروشنده مالک فروش *</option>
            {salesUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName} — {user.roleTitle}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 text-sm text-[var(--text-secondary)] file:ml-3 file:rounded file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-white" />
        </div>

        {fileName && <p className="text-sm text-[var(--text-secondary)]">فایل: {fileName} — {new Set(invoiceRows.map((row) => row.externalInvoiceKey)).size} فاکتور، {invoiceRows.length} قلم، {paymentRows.length} پرداخت</p>}
        {error && <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {invoiceRows.length > 0 && !committedResults && (
          <div className="flex flex-wrap gap-2">
            <button onClick={buildPreview} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white"><Upload className="h-4 w-4" /> بررسی و ساخت پیش‌نمایش</button>
            {preview && validCount > 0 && <button onClick={commitPreview} className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" /> ثبت قطعی {validCount} فاکتور</button>}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-[var(--text-primary)]">{committedResults ? 'نتیجه ثبت قطعی' : 'پیش‌نمایش بدون ذخیره'} — {validCount} معتبر از {results.length}</h3>
              <button onClick={downloadResults} className="min-h-11 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]"><Download className="ml-1 inline h-4 w-4" /> فایل نتیجه</button>
            </div>
            <div className="grid gap-2 md:hidden">
              {results.map((result, index) => <article key={`${result.externalInvoiceKey}_${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-primary)]"><div className="font-bold">{result.externalInvoiceKey}</div><div className="mt-1">{OUTCOME_LABELS[result.outcome]}{result.invoice ? ` — ${result.invoice.invoiceCode}` : ''}</div>{result.invoice && <div className="mt-1 text-[var(--text-secondary)]">{formatPortalMoney(result.invoice.finalAmount)} — {result.invoice.status === 'awaiting_supervisor_approval' ? 'ارسال‌شده به سرپرست' : 'باز برای تکمیل پرداخت'}</div>}{result.errorMessage && <div className="mt-1 text-red-600 dark:text-red-300">{result.errorMessage}</div>}</article>)}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-[var(--text-secondary)]"><th className="p-2 text-right">کلید</th><th className="p-2 text-right">ردیف‌ها</th><th className="p-2 text-right">نتیجه</th><th className="p-2 text-right">کد/وضعیت</th><th className="p-2 text-right">مبلغ</th><th className="p-2 text-right">شرح</th></tr></thead>
                <tbody>{results.map((result, index) => <tr key={`${result.externalInvoiceKey}_${index}`} className="border-b border-[var(--border)] text-[var(--text-primary)]"><td className="p-2">{result.externalInvoiceKey}</td><td className="p-2">{result.rowIndexes.join('، ')}</td><td className="p-2">{OUTCOME_LABELS[result.outcome]}</td><td className="p-2">{result.invoice ? `${result.invoice.invoiceCode} / ${result.invoice.status}` : '—'}</td><td className="p-2">{result.invoice ? formatPortalMoney(result.invoice.finalAmount) : '—'}</td><td className="p-2 text-[var(--text-secondary)]">{result.errorMessage || '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
