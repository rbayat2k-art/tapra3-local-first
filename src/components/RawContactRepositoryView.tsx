import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  RawContact, ImportJob, ImportJobRowResult, Customer, CustomerEntryConflict, CustomerPhoneEntry, CustomerNameEntry, CustomerAddressEntry,
  User, SystemRole, SystemPermission, Campaign, Lead
} from '../types';
import { normalizePhone, normalizeName, normalizeAddress, attachIncomingValuesToCustomer } from '../utils/customerIdentity';
import { resolveRawContactImportRows, isDuplicateImportJob, RawContactRowInput, RawContactRowDecision } from '../utils/rawContactImport';
import { buildLeadFromRawContact } from '../utils/leadAssignment';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNow } from '../utils/persianDate';
import { Upload, Download, UserPlus, Database, History, CheckCircle2, XCircle, AlertTriangle, ArrowUpRight } from 'lucide-react';

interface RawContactRepositoryViewProps {
  rawContacts: RawContact[];
  onUpdateRawContacts: (contacts: RawContact[]) => void;
  importJobs: ImportJob[];
  onUpdateImportJobs: (jobs: ImportJob[]) => void;
  customers: Customer[];
  onUpdateCustomers: (customers: Customer[]) => void;
  entryConflicts: CustomerEntryConflict[];
  onUpdateEntryConflicts: (conflicts: CustomerEntryConflict[]) => void;
  campaigns: Campaign[];
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const TARGET_FIELDS: { key: keyof RawContactFormMapping; label: string; required: boolean }[] = [
  { key: 'phone', label: 'شماره تماس', required: true },
  { key: 'name', label: 'نام احتمالی', required: false },
  { key: 'address', label: 'آدرس', required: false },
  { key: 'province', label: 'استان', required: false },
  { key: 'city', label: 'شهر', required: false },
  { key: 'postalCode', label: 'کد پستی', required: false },
  { key: 'nationalCode', label: 'کد ملی (اختیاری)', required: false },
  { key: 'purchaseHistory', label: 'سابقه خرید احتمالی', required: false },
  { key: 'campaignId', label: 'کد کمپین/منبع تبلیغاتی', required: false },
  { key: 'notes', label: 'یادداشت', required: false }
];

interface RawContactFormMapping {
  phone: string; name: string; address: string; province: string; city: string;
  postalCode: string; nationalCode: string; purchaseHistory: string; campaignId: string; notes: string;
}

const STATUS_LABELS: Record<RawContact['status'], string> = {
  new: 'جدید', matched_customer: 'متصل به پروفایل موجود', created_customer: 'پروفایل جدید ساخته شد',
  identity_conflict: 'تعارض هویتی', eligible_for_campaign: 'واجد شرایط کمپین', converted_to_lead: 'تبدیل به Lead شده',
  invalid_phone: 'شماره نامعتبر', wrong_number: 'شماره اشتباه', excluded: 'حذف‌شده از فرآیند', archived: 'بایگانی'
};
const STATUS_COLORS: Record<RawContact['status'], string> = {
  new: 'bg-slate-100 text-slate-700', matched_customer: 'bg-emerald-100 text-emerald-700',
  created_customer: 'bg-blue-100 text-blue-700', identity_conflict: 'bg-amber-100 text-amber-700',
  eligible_for_campaign: 'bg-purple-100 text-purple-700', converted_to_lead: 'bg-indigo-100 text-indigo-700',
  invalid_phone: 'bg-red-100 text-red-700', wrong_number: 'bg-red-100 text-red-700',
  excluded: 'bg-gray-100 text-gray-500', archived: 'bg-gray-100 text-gray-500'
};

const emptyManualForm: RawContactFormMapping = {
  phone: '', name: '', address: '', province: '', city: '', postalCode: '', nationalCode: '', purchaseHistory: '', campaignId: '', notes: ''
};

export const RawContactRepositoryView: React.FC<RawContactRepositoryViewProps> = ({
  rawContacts, onUpdateRawContacts, importJobs, onUpdateImportJobs,
  customers, onUpdateCustomers, entryConflicts, onUpdateEntryConflicts,
  campaigns, leads, onUpdateLeads,
  currentUser, roles, effectivePermissions, impersonatorAdmin
}) => {
  const [section, setSection] = useState<'pool' | 'manual' | 'excel' | 'jobs'>('pool');
  const [manualForm, setManualForm] = useState<RawContactFormMapping>(emptyManualForm);
  const [createProfileOnNoMatch, setCreateProfileOnNoMatch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | RawContact['status']>('all');

  // --- Excel import state ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [lastJobResult, setLastJobResult] = useState<{ job: ImportJob; created: RawContact[] } | null>(null);

  const canImport = hasPermission(effectivePermissions, ['import_raw_contacts']);
  const canView = hasPermission(effectivePermissions, ['view_raw_contact_pool']);
  const canConvertToLead = hasPermission(effectivePermissions, ['convert_interaction_to_lead']);

  if (!currentUser) return null;
  if (!canView) {
    return <div className="p-6 text-slate-500">دسترسی لازم برای مشاهدهٔ مخزن داده خام را ندارید.</div>;
  }

  const downloadTemplate = () => {
    const sample = [{
      'شماره تماس': '09121234567', 'نام احتمالی': 'نام و نام‌خانوادگی', 'آدرس': 'آدرس کامل', 'استان': 'تهران', 'شهر': 'تهران',
      'کد پستی': '1234567890', 'کد ملی (اختیاری)': '', 'سابقه خرید احتمالی': '', 'کد کمپین/منبع تبلیغاتی': '', 'یادداشت': ''
    }];
    const worksheet = XLSX.utils.json_to_sheet(sample);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قالب ورود داده خام');
    XLSX.writeFile(workbook, 'قالب_ورود_مخزن_داده_خام.xlsx');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);
    setLastJobResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as unknown as string[][];
      if (rows.length === 0) { alert('فایل خالی است.'); return; }
      const headers = rows[0].map((h) => String(h ?? '').trim());
      const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));
      setExcelHeaders(headers);
      setExcelRows(dataRows);

      // حدس اولیهٔ نگاشت ستون‌ها بر اساس عنوان قالب استاندارد — قابل تغییر دستی توسط کاربر
      const guess: Record<string, string> = {};
      const guessMap: Record<string, string> = {
        phone: 'شماره تماس', name: 'نام احتمالی', address: 'آدرس', province: 'استان', city: 'شهر',
        postalCode: 'کد پستی', nationalCode: 'کد ملی (اختیاری)', purchaseHistory: 'سابقه خرید احتمالی',
        campaignId: 'کد کمپین/منبع تبلیغاتی', notes: 'یادداشت'
      };
      for (const [key, label] of Object.entries(guessMap)) {
        if (headers.includes(label)) guess[key] = label;
      }
      setColumnMapping(guess);
    };
    reader.readAsArrayBuffer(file);
  };

  const buildRowInputsFromExcel = (): RawContactRowInput[] => {
    const headerIndex = (label?: string) => (label ? excelHeaders.indexOf(label) : -1);
    const idx = {
      phone: headerIndex(columnMapping.phone), name: headerIndex(columnMapping.name), address: headerIndex(columnMapping.address),
      province: headerIndex(columnMapping.province), city: headerIndex(columnMapping.city), postalCode: headerIndex(columnMapping.postalCode),
      nationalCode: headerIndex(columnMapping.nationalCode), purchaseHistory: headerIndex(columnMapping.purchaseHistory),
      campaignId: headerIndex(columnMapping.campaignId), notes: headerIndex(columnMapping.notes)
    };
    const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '') || undefined;
    return excelRows.map((row, i) => ({
      rowIndex: i + 2, // ردیف ۱ = هدر
      phone: cell(row, idx.phone) || '',
      name: cell(row, idx.name), address: cell(row, idx.address), province: cell(row, idx.province), city: cell(row, idx.city),
      postalCode: cell(row, idx.postalCode), nationalCode: cell(row, idx.nationalCode), purchaseHistory: cell(row, idx.purchaseHistory),
      campaignId: cell(row, idx.campaignId), notes: cell(row, idx.notes)
    }));
  };

  // Handler مشترک: تصمیمات خالص resolveRawContactImportRows را به رکوردهای واقعی RawContact/
  // Customer/CustomerEntryConflict تبدیل می‌کند. هیچ رکوردی هرگز حذف نمی‌شود؛ فقط افزوده می‌شود.
  const applyDecisions = (
    rowInputs: RawContactRowInput[], decisions: RawContactRowDecision[],
    sourceFile: 'manual' | 'excel', sourceFileName: string | undefined, importJobId: string | undefined
  ) => {
    const now = getJalaliNow();
    let workingCustomers = [...customers];
    let workingConflicts = [...entryConflicts];
    const newRawContacts: RawContact[] = [];
    const rowResults: ImportJobRowResult[] = [];
    const counts = { created: 0, attached: 0, conflict: 0, invalidPhone: 0, duplicateInFile: 0, error: 0 };

    for (const decision of decisions) {
      const row = rowInputs.find((r) => r.rowIndex === decision.rowIndex)!;
      const rawId = `raw_${Date.now()}_${decision.rowIndex}_${Math.random().toString(36).slice(2, 6)}`;
      const baseRaw: Omit<RawContact, 'status'> = {
        id: rawId, primaryPhoneNormalized: decision.normalizedPhone, primaryPhoneRaw: row.phone,
        otherPhones: row.otherPhones, probableName: row.name, address: row.address, province: row.province,
        city: row.city, postalCode: row.postalCode, nationalCodeOptional: row.nationalCode,
        probablePurchaseHistory: row.purchaseHistory, sourceFile, sourceFileName, sourceRowNumber: decision.rowIndex,
        campaignId: row.campaignId, importedAt: now, importedByUserId: currentUser.id, importedByUserName: currentUser.fullName,
        importJobId, tags: row.tags, notes: row.notes
      };

      if (decision.outcome === 'invalid_phone') {
        counts.invalidPhone++;
        newRawContacts.push({ ...baseRaw, status: 'invalid_phone', rejectionOrErrorReason: 'شمارهٔ موبایل معتبر نیست' });
        rowResults.push({ rowIndex: decision.rowIndex, outcome: 'invalid_phone', rawContactId: rawId });
      } else if (decision.outcome === 'error') {
        counts.error++;
        newRawContacts.push({ ...baseRaw, status: 'excluded', rejectionOrErrorReason: decision.errorMessage });
        rowResults.push({ rowIndex: decision.rowIndex, outcome: 'error', rawContactId: rawId, errorMessage: decision.errorMessage });
      } else if (decision.outcome === 'duplicate_in_file') {
        counts.duplicateInFile++;
        newRawContacts.push({
          ...baseRaw, status: 'excluded', tags: [...(row.tags || []), 'duplicate_in_file'],
          rejectionOrErrorReason: `شمارهٔ تکراری در همین فایل — اولین بار در ردیف ${decision.firstSeenRowIndex}`
        });
        rowResults.push({ rowIndex: decision.rowIndex, outcome: 'duplicate_in_file', rawContactId: rawId });
      } else if (decision.outcome === 'attached') {
        counts.attached++;
        const target = workingCustomers.find((c) => c.id === decision.targetCustomerId);
        if (target) {
          const updatedTarget = attachIncomingValuesToCustomer(
            target, { phone: row.phone, name: row.name, address: row.address, province: row.province, city: row.city, postalCode: row.postalCode },
            'data_entry_unit', { id: currentUser.id, fullName: currentUser.fullName }, now
          );
          workingCustomers = workingCustomers.map((c) => (c.id === target.id ? updatedTarget : c));
        }
        newRawContacts.push({ ...baseRaw, status: 'matched_customer', linkedCustomerId: decision.targetCustomerId });
        rowResults.push({ rowIndex: decision.rowIndex, outcome: 'attached', rawContactId: rawId, customerId: decision.targetCustomerId });
      } else if (decision.outcome === 'conflict') {
        counts.conflict++;
        const conflictId = `entry_conflict_${Date.now()}_${decision.rowIndex}`;
        const conflict: CustomerEntryConflict = {
          id: conflictId, incomingSource: 'data_entry_unit', submittedByUserId: currentUser.id, submittedByUserName: currentUser.fullName,
          submittedAt: now, incomingPhone: row.phone, incomingName: row.name, incomingAddress: row.address,
          conflictingCustomerIds: decision.conflictingCustomerIds, reason: decision.reason, status: 'pending'
        };
        workingConflicts = [conflict, ...workingConflicts];
        newRawContacts.push({ ...baseRaw, status: 'identity_conflict', linkedConflictId: conflictId });
        rowResults.push({ rowIndex: decision.rowIndex, outcome: 'conflict', rawContactId: rawId, conflictId });
      } else {
        // created
        counts.created++;
        if (decision.willCreateCustomerProfile) {
          const newCustomerId = `cust_import_${Date.now()}_${decision.rowIndex}`;
          const newCustomer: Customer = {
            id: newCustomerId, fullName: row.name, phone1: row.phone, address: row.address,
            province: row.province, city: row.city, postalCode: row.postalCode, createdAt: now, updatedAt: now, version: 1,
            phoneEntries: [{ id: `phone_${newCustomerId}_0`, value: row.phone, normalizedValue: decision.normalizedPhone, source: 'data_entry_unit', recordedAt: now, recordedByUserId: currentUser.id, recordedByName: currentUser.fullName, isCustomerConfirmed: false, isCurrentPrimary: true } as CustomerPhoneEntry],
            nameEntries: row.name ? [{ id: `name_${newCustomerId}_0`, value: row.name, normalizedValue: normalizeName(row.name), source: 'data_entry_unit', recordedAt: now, recordedByUserId: currentUser.id, recordedByName: currentUser.fullName, isCustomerConfirmed: false, isCurrentPrimary: true } as CustomerNameEntry] : [],
            addressEntries: row.address ? [{ id: `address_${newCustomerId}_0`, address: row.address, province: row.province, city: row.city, postalCode: row.postalCode, normalizedValue: normalizeAddress(row.address, row.province, row.city, row.postalCode), source: 'data_entry_unit', recordedAt: now, recordedByUserId: currentUser.id, recordedByName: currentUser.fullName, isCustomerConfirmed: false, isCurrentPrimary: true } as CustomerAddressEntry] : [],
            identityStatus: row.name ? 'complete' : 'incomplete', financialStatus: 'reconciled', contactStatus: 'needs_recall',
            contactPermissionStatus: 'allowed', complaintStatus: 'none', satisfactionStatus: 'unknown'
          };
          workingCustomers = [newCustomer, ...workingCustomers];
          newRawContacts.push({ ...baseRaw, status: 'created_customer', linkedCustomerId: newCustomerId });
          rowResults.push({ rowIndex: decision.rowIndex, outcome: 'created', rawContactId: rawId, customerId: newCustomerId });
        } else {
          newRawContacts.push({ ...baseRaw, status: 'new' });
          rowResults.push({ rowIndex: decision.rowIndex, outcome: 'created', rawContactId: rawId });
        }
      }
    }

    return { newRawContacts, workingCustomers, workingConflicts, rowResults, counts };
  };

  const persistImport = (
    newRawContacts: RawContact[], workingCustomers: Customer[], workingConflicts: CustomerEntryConflict[],
    job: ImportJob | null, auditAction: string
  ): boolean => {
    const updatedRawContacts = [...newRawContacts, ...rawContacts];
    const updatedImportJobs = job ? [job, ...importJobs] : importJobs;
    const tx = storage.saveCustomerIdentityTransaction({
      customers: workingCustomers, entryConflicts: workingConflicts, rawContacts: updatedRawContacts, importJobs: updatedImportJobs
    });
    if (tx.ok === false) {
      logAudit({ action: auditAction, effectiveUser: currentUser, impersonatorAdmin, roles, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return false;
    }
    logAudit({ action: auditAction, effectiveUser: currentUser, impersonatorAdmin, roles, targetId: job?.id, details: `${newRawContacts.length} رکورد پردازش شد` });
    onUpdateRawContacts(updatedRawContacts);
    onUpdateCustomers(workingCustomers);
    onUpdateEntryConflicts(workingConflicts);
    if (job) onUpdateImportJobs(updatedImportJobs);
    return true;
  };

  const handleManualSubmit = () => {
    if (!canImport) { alert('مجوز Import داده خام را ندارید.'); return; }
    const phone = manualForm.phone.trim();
    if (!phone) { alert('شماره تماس الزامی است.'); return; }
    const rowInput: RawContactRowInput = {
      rowIndex: 1, phone, name: manualForm.name.trim() || undefined, address: manualForm.address.trim() || undefined,
      province: manualForm.province.trim() || undefined, city: manualForm.city.trim() || undefined,
      postalCode: manualForm.postalCode.trim() || undefined, nationalCode: manualForm.nationalCode.trim() || undefined,
      purchaseHistory: manualForm.purchaseHistory.trim() || undefined, campaignId: manualForm.campaignId.trim() || undefined,
      notes: manualForm.notes.trim() || undefined
    };
    const decisions = resolveRawContactImportRows([rowInput], customers, { createCustomerWhenNoMatch: createProfileOnNoMatch });
    const { newRawContacts, workingCustomers, workingConflicts } = applyDecisions(
      [rowInput], decisions, 'manual', undefined, undefined
    );
    const ok = persistImport(newRawContacts, workingCustomers, workingConflicts, null, 'raw_contact_manual_entry');
    if (ok) {
      alert('رکورد با موفقیت در مخزن داده خام ثبت شد — وضعیت: ' + STATUS_LABELS[newRawContacts[0].status]);
      setManualForm(emptyManualForm);
    }
  };

  const handleStartExcelImport = () => {
    if (!canImport) { alert('مجوز Import داده خام را ندارید.'); return; }
    if (!columnMapping.phone) { alert('ستون «شماره تماس» باید نگاشت شود.'); return; }
    const idempotencyKey = `${fileName}_${fileSize}_${excelRows.length}`;
    if (isDuplicateImportJob(idempotencyKey, importJobs)) {
      alert('این فایل قبلاً یک‌بار Import شده است (Idempotency Key تکراری) — برای جلوگیری از ثبت دوباره، Import متوقف شد.');
      return;
    }
    const rowInputs = buildRowInputsFromExcel();
    const decisions = resolveRawContactImportRows(rowInputs, customers, { createCustomerWhenNoMatch: createProfileOnNoMatch });
    const importJobId = `import_job_${Date.now()}`;
    const { newRawContacts, workingCustomers, workingConflicts, rowResults, counts } = applyDecisions(
      rowInputs, decisions, 'excel', fileName, importJobId
    );
    const job: ImportJob = {
      id: importJobId, idempotencyKey, sourceType: 'excel', fileName,
      importedByUserId: currentUser.id, importedByUserName: currentUser.fullName, importedAt: getJalaliNow(),
      totalRows: rowInputs.length, createdCount: counts.created, attachedCount: counts.attached, conflictCount: counts.conflict,
      invalidPhoneCount: counts.invalidPhone, duplicateInFileCount: counts.duplicateInFile, errorCount: counts.error, rows: rowResults
    };
    const ok = persistImport(newRawContacts, workingCustomers, workingConflicts, job, 'raw_contact_excel_import');
    if (ok) {
      setLastJobResult({ job, created: newRawContacts });
      setExcelHeaders([]); setExcelRows([]); setColumnMapping({}); setFileName(''); setFileSize(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // تبدیل به Lead (بند ۷ مأموریت) — فقط وقتی کاربر (اپراتور تبلیغات/مدیر داده) صریحاً تأیید
  // کند که علاقهٔ خرید واقعی دیده شده؛ هر RawContact/تعامل خامی خودکار به Lead تبدیل نمی‌شود.
  const handleConvertToLead = (rawContact: RawContact) => {
    if (!canConvertToLead) { alert('مجوز تبدیل به Lead را ندارید.'); return; }
    const declaredInterest = prompt('علاقهٔ اعلام‌شدهٔ مشتری برای خرید را وارد کنید:', 'ابراز علاقه به خرید');
    if (!declaredInterest || !declaredInterest.trim()) return;
    const campaign = campaigns.find((c) => c.id === rawContact.campaignId);
    const now = getJalaliNow();
    const newLead = buildLeadFromRawContact(rawContact, campaign, declaredInterest.trim(), { id: currentUser.id, fullName: currentUser.fullName }, now, leads);
    const updatedLeads = [newLead, ...leads];
    const updatedRawContacts = rawContacts.map((r) => (r.id === rawContact.id ? { ...r, status: 'converted_to_lead' as const, linkedLeadId: newLead.id } : r));
    const tx = storage.saveCustomerIdentityTransaction({ rawContacts: updatedRawContacts, leads: updatedLeads });
    if (tx.ok === false) {
      logAudit({ action: 'raw_contact_converted_to_lead', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: rawContact.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'raw_contact_converted_to_lead', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: newLead.id, details: `Lead ${newLead.trackingCode} از RawContact ${rawContact.id} ساخته شد` });
    onUpdateRawContacts(updatedRawContacts);
    onUpdateLeads(updatedLeads);
    alert(`Lead با کد پیگیری ${newLead.trackingCode} ایجاد شد.`);
  };

  const filteredContacts = statusFilter === 'all' ? rawContacts : rawContacts.filter((r) => r.status === statusFilter);

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Database className="w-5 h-5" /> مخزن داده خام و Import</h2>
          <p className="text-sm text-slate-500 mt-1">RawContact مستقل از Customer/Lead است — هیچ رکوردی هرگز فیزیکی حذف نمی‌شود.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'pool', label: 'مخزن', icon: Database },
            { id: 'manual', label: 'ثبت دستی', icon: UserPlus },
            { id: 'excel', label: 'Import اکسل', icon: Upload },
            { id: 'jobs', label: 'تاریخچه Import', icon: History }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setSection(tab.id as any)}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${section === tab.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'pool' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">فیلتر وضعیت:</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <option value="all">همه ({rawContacts.length})</option>
                {(Object.keys(STATUS_LABELS) as RawContact['status'][]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]} ({rawContacts.filter((r) => r.status === s).length})</option>
                ))}
              </select>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800">
              <Download className="w-4 h-4" /> دانلود قالب استاندارد اکسل
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 px-2">شماره</th><th className="py-2 px-2">نام احتمالی</th><th className="py-2 px-2">وضعیت</th>
                  <th className="py-2 px-2">منبع</th><th className="py-2 px-2">ردیف فایل</th><th className="py-2 px-2">زمان ورود</th><th className="py-2 px-2">توضیح</th>
                  {canConvertToLead && <th className="py-2 px-2">عملیات</th>}
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((rc) => (
                  <tr key={rc.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono">{rc.primaryPhoneNormalized || rc.primaryPhoneRaw}</td>
                    <td className="py-2 px-2">{rc.probableName || '-'}</td>
                    <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[rc.status]}`}>{STATUS_LABELS[rc.status]}</span></td>
                    <td className="py-2 px-2 text-slate-500">{rc.sourceFileName || (rc.sourceFile === 'manual' ? 'ورود دستی' : '-')}</td>
                    <td className="py-2 px-2 text-slate-500">{rc.sourceRowNumber ?? '-'}</td>
                    <td className="py-2 px-2 text-slate-500">{rc.importedAt}</td>
                    <td className="py-2 px-2 text-slate-500">{rc.rejectionOrErrorReason || '-'}</td>
                    {canConvertToLead && (
                      <td className="py-2 px-2">
                        {(rc.status === 'new' || rc.status === 'eligible_for_campaign') && !rc.linkedLeadId && (
                          <button onClick={() => handleConvertToLead(rc)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                            <ArrowUpRight className="w-3.5 h-3.5" /> تبدیل به Lead
                          </button>
                        )}
                        {rc.linkedLeadId && <span className="text-xs text-slate-400">تبدیل‌شده</span>}
                      </td>
                    )}
                  </tr>
                ))}
                {filteredContacts.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-slate-400">رکوردی یافت نشد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'manual' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-2xl">
          <h3 className="font-semibold text-slate-800 mb-4">ثبت دستی یک رکورد در مخزن داده خام</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="شماره تماس *" value={manualForm.phone} onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="نام احتمالی" value={manualForm.name} onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="آدرس" value={manualForm.address} onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
            <input placeholder="استان" value={manualForm.province} onChange={(e) => setManualForm({ ...manualForm, province: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="شهر" value={manualForm.city} onChange={(e) => setManualForm({ ...manualForm, city: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="کد پستی" value={manualForm.postalCode} onChange={(e) => setManualForm({ ...manualForm, postalCode: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="کد ملی (اختیاری)" value={manualForm.nationalCode} onChange={(e) => setManualForm({ ...manualForm, nationalCode: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input placeholder="کد کمپین/منبع تبلیغاتی" value={manualForm.campaignId} onChange={(e) => setManualForm({ ...manualForm, campaignId: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
            <textarea placeholder="یادداشت" value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" rows={2} />
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm text-slate-600">
            <input type="checkbox" checked={createProfileOnNoMatch} onChange={(e) => setCreateProfileOnNoMatch(e.target.checked)} />
            اگر شماره با هیچ پروفایلی تطبیق نداشت، پروفایل ناقص ساخته شود (وگرنه فقط در مخزن خام می‌ماند)
          </label>
          <button onClick={handleManualSubmit} disabled={!canImport} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
            ثبت رکورد
          </button>
        </div>
      )}

      {section === 'excel' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50">
              <Download className="w-4 h-4" /> دانلود قالب استاندارد
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="text-sm" />
          </div>

          {excelHeaders.length > 0 && (
            <>
              <div>
                <h4 className="font-semibold text-slate-700 mb-2 text-sm">نگاشت ستون‌های فایل ({excelRows.length} ردیف یافت شد)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {TARGET_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-xs text-slate-500">{f.label}{f.required ? ' *' : ''}</label>
                      <select value={columnMapping[f.key] || ''} onChange={(e) => setColumnMapping({ ...columnMapping, [f.key]: e.target.value })} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">-- انتخاب نشود --</option>
                        {excelHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-2 text-sm">پیش‌نمایش (۵ ردیف اول)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 border-b">{excelHeaders.map((h) => <th key={h} className="py-1 px-2 text-right">{h}</th>)}</tr></thead>
                    <tbody>
                      {excelRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">{row.map((cell, j) => <td key={j} className="py-1 px-2">{String(cell)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={createProfileOnNoMatch} onChange={(e) => setCreateProfileOnNoMatch(e.target.checked)} />
                اگر شماره با هیچ پروفایلی تطبیق نداشت، پروفایل ناقص ساخته شود
              </label>

              <button onClick={handleStartExcelImport} disabled={!canImport} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
                شروع Import ({excelRows.length} ردیف)
              </button>
            </>
          )}

          {lastJobResult && (
            <div className="border-t border-slate-200 pt-4">
              <h4 className="font-semibold text-slate-700 mb-2 text-sm">نتیجهٔ آخرین Import</h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-3">
                <StatBox label="ساخته‌شده" value={lastJobResult.job.createdCount} icon={CheckCircle2} color="text-blue-600" />
                <StatBox label="متصل‌شده" value={lastJobResult.job.attachedCount} icon={CheckCircle2} color="text-emerald-600" />
                <StatBox label="تعارض" value={lastJobResult.job.conflictCount} icon={AlertTriangle} color="text-amber-600" />
                <StatBox label="نامعتبر" value={lastJobResult.job.invalidPhoneCount} icon={XCircle} color="text-red-600" />
                <StatBox label="تکراری در فایل" value={lastJobResult.job.duplicateInFileCount} icon={AlertTriangle} color="text-slate-500" />
                <StatBox label="خطا" value={lastJobResult.job.errorCount} icon={XCircle} color="text-red-600" />
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 border-b sticky top-0 bg-white"><th className="py-1 px-2 text-right">ردیف</th><th className="py-1 px-2 text-right">نتیجه</th><th className="py-1 px-2 text-right">جزئیات</th></tr></thead>
                  <tbody>
                    {lastJobResult.job.rows.map((r) => (
                      <tr key={r.rowIndex} className="border-b border-slate-100">
                        <td className="py-1 px-2">{r.rowIndex}</td>
                        <td className="py-1 px-2">{r.outcome}</td>
                        <td className="py-1 px-2 text-slate-500">{r.errorMessage || r.customerId || r.conflictId || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'jobs' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-4">تاریخچهٔ Import Job ها</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 px-2">فایل</th><th className="py-2 px-2">زمان</th><th className="py-2 px-2">کل ردیف</th>
                  <th className="py-2 px-2">ساخته/متصل</th><th className="py-2 px-2">تعارض</th><th className="py-2 px-2">نامعتبر/تکراری</th><th className="py-2 px-2">وارد‌کننده</th>
                </tr>
              </thead>
              <tbody>
                {importJobs.map((j) => (
                  <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-2">{j.fileName || (j.sourceType === 'manual' ? 'ورود دستی' : '-')}</td>
                    <td className="py-2 px-2 text-slate-500">{j.importedAt}</td>
                    <td className="py-2 px-2">{j.totalRows}</td>
                    <td className="py-2 px-2">{j.createdCount} / {j.attachedCount}</td>
                    <td className="py-2 px-2">{j.conflictCount}</td>
                    <td className="py-2 px-2">{j.invalidPhoneCount} / {j.duplicateInFileCount}</td>
                    <td className="py-2 px-2 text-slate-500">{j.importedByUserName}</td>
                  </tr>
                ))}
                {importJobs.length === 0 && (<tr><td colSpan={7} className="py-6 text-center text-slate-400">هنوز هیچ Import Job ثبت نشده.</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: number; icon: any; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="bg-slate-50 rounded-lg p-2">
    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
    <div className={`font-bold ${color}`}>{value}</div>
    <div className="text-[10px] text-slate-500">{label}</div>
  </div>
);
