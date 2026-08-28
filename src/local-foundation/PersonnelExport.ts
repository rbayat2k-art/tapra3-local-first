import type {FoundationState, PersonnelMovement, PersonnelRecord} from './model';
import {formatPersianDate, formatPersianDateTime} from './PersianDate';
import {currentSalesCompensation, orderedSalesCompensationHistory, salesCompensationModeLabel} from './salesCompensation';

type ExportCell = string | number;
export type PersonnelExportRow = Record<string, ExportCell>;

export interface PersonnelExportData {
  personnelRows: PersonnelExportRow[];
  movementRows: PersonnelExportRow[];
  compensationRows: PersonnelExportRow[];
}

const genderLabel = (value: PersonnelRecord['gender']) => value === 'female' ? 'زن' : value === 'male' ? 'مرد' : 'ثبت نشده';
const maritalLabel = (value: PersonnelRecord['maritalStatus']) => value === 'single' ? 'مجرد' : value === 'married' ? 'متأهل' : 'ثبت نشده';
const employmentLabel = (value: PersonnelRecord['employmentStatus']) => value === 'active' ? 'فعال' : value === 'ending_scheduled' ? 'پایان زمان‌بندی‌شده' : value === 'rehire_scheduled' ? 'بازگشت زمان‌بندی‌شده' : 'خاتمه‌یافته';
const accountStatusLabel = (value?: string) => value === 'active' ? 'فعال' : value === 'inactive' ? 'غیرفعال' : 'بدون حساب';
const salesLevelLabel = (value?: PersonnelRecord['salesHierarchyLevel']) => ({sales_vice: 'معاونت فروش', sales_manager: 'مدیر فروش', senior_supervisor: 'سرپرست ارشد فروش', sales_supervisor: 'سرپرست فروش', seller: 'فروشنده'} as Record<string, string>)[value ?? ''] ?? '';
const salesChannelLabel = (value?: PersonnelRecord['salesChannel']) => ({call_center: 'کال‌سنتر', branch: 'فروش شعبه', field: 'فروش میدانی', partner: 'شبکه پذیرندگان'} as Record<string, string>)[value ?? ''] ?? '';

function nameOfUnit(state: FoundationState, id?: string) {return id ? state.units.find((item) => item.id === id)?.name ?? 'نامشخص' : '';}
function nameOfPosition(state: FoundationState, id?: string) {return id ? state.positions.find((item) => item.id === id)?.title ?? 'نامشخص' : '';}
function nameOfPersonnel(state: FoundationState, id?: string) {const person = id ? state.personnel.find((item) => item.id === id) : undefined; return person ? `${person.firstName} ${person.lastName}` : '';}
function movementValue(state: FoundationState, movement: PersonnelMovement, side: 'from' | 'to') {const id = side === 'from' ? movement.fromId : movement.toId; return movement.kind === 'position_change' ? nameOfPosition(state, id) : nameOfUnit(state, id);}
function latestMovement(person: PersonnelRecord, kind: PersonnelMovement['kind']) {return [...(person.movements ?? [])].filter((item) => item.kind === kind).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];}

export function buildPersonnelExportData(state: FoundationState, includeBanking: boolean): PersonnelExportData {
  const personnelRows = state.personnel.map((person) => {
    const user = state.users.find((item) => item.id === person.linkedUserId);
    const branchTransfer = latestMovement(person, 'branch_transfer');
    const unitChange = latestMovement(person, 'unit_change');
    const positionChange = latestMovement(person, 'position_change');
    const compensation = currentSalesCompensation(person);
    const row: PersonnelExportRow = {
      'کد پرسنلی': person.personnelCode,
      'نام': person.firstName,
      'نام خانوادگی': person.lastName,
      'نام پدر': person.fatherName ?? '',
      'کد ملی': person.nationalId ?? '',
      'شماره شناسنامه': person.identityNumber ?? '',
      'تاریخ تولد (شمسی)': person.birthDate ? formatPersianDate(person.birthDate) : '',
      'محل تولد': person.birthPlace ?? '',
      'جنسیت': genderLabel(person.gender),
      'وضعیت تأهل': maritalLabel(person.maritalStatus),
      'همراه اصلی': person.primaryMobile,
      'همراه دوم': person.secondaryMobile ?? '',
      'تلفن ثابت': person.phone ?? '',
      'ایمیل شخصی': person.personalEmail ?? '',
      'استان': person.province ?? '',
      'شهر': person.city ?? '',
      'نشانی': person.address ?? '',
      'کد پستی': person.postalCode ?? '',
      'وضعیت همکاری': employmentLabel(person.employmentStatus),
      'نوع همکاری': person.employmentType,
      'تاریخ شروع همکاری (شمسی)': formatPersianDate(person.startDate),
      'تاریخ پایان همکاری (شمسی)': person.endDate ? formatPersianDate(person.endDate) : '',
      'واحد سازمانی فعلی': nameOfUnit(state, person.unitId),
      'سمت سازمانی فعلی': nameOfPosition(state, person.positionId),
      'شعبه محل استقرار / فروش': nameOfUnit(state, person.branchUnitId),
      'مدیر مستقیم': nameOfPersonnel(state, person.managerPersonnelId),
      'رده در شبکه فروش': salesLevelLabel(person.salesHierarchyLevel),
      'تاریخ شروع نقش فروش (شمسی)': person.salesAssignmentStartDate ? formatPersianDate(person.salesAssignmentStartDate) : '',
      'کانال فروش': salesChannelLabel(person.salesChannel),
      'سرپرست مستقیم فروش': nameOfPersonnel(state, person.salesSupervisorPersonnelId),
      'نوع پرداخت فروش فعلی': compensation ? salesCompensationModeLabel(compensation.mode) : '',
      'حقوق ثابت ماهانه فعلی (ریال)': compensation?.monthlyFixedSalaryRial ?? '',
      'درصد پورسانت فعلی': compensation?.commissionPercent ?? '',
      'مبنای پورسانت فعلی': compensation ? 'وصول فاکتور' : '',
      'تاریخ شروع شرایط مالی فعلی (شمسی)': compensation?.effectiveFrom ? formatPersianDate(compensation.effectiveFrom) : '',
      'محل کار': person.workLocation ?? '',
      'نام کاربری': user?.username ?? '',
      'نقش‌های حساب': user?.roles.join('، ') ?? '',
      'وضعیت حساب': accountStatusLabel(user?.status),
      'تعداد کل گردش‌ها': person.movements?.length ?? 0,
      'شعبه قبلی در آخرین انتقال': branchTransfer ? movementValue(state, branchTransfer, 'from') : '',
      'شعبه جدید در آخرین انتقال': branchTransfer ? movementValue(state, branchTransfer, 'to') : '',
      'تاریخ پایان شعبه قبلی (شمسی)': branchTransfer?.previousEndedAt ? formatPersianDate(branchTransfer.previousEndedAt) : '',
      'تاریخ انتقال/شروع شعبه جدید (شمسی)': branchTransfer?.newStartedAt ? formatPersianDate(branchTransfer.newStartedAt) : branchTransfer ? formatPersianDate(branchTransfer.effectiveDate) : '',
      'دلیل آخرین انتقال شعبه': branchTransfer?.reason ?? '',
      'ثبت‌کننده آخرین انتقال شعبه': branchTransfer?.actorName ?? '',
      'واحد قبلی در آخرین تغییر': unitChange ? movementValue(state, unitChange, 'from') : '',
      'واحد جدید در آخرین تغییر': unitChange ? movementValue(state, unitChange, 'to') : '',
      'تاریخ آخرین تغییر واحد (شمسی)': unitChange ? formatPersianDate(unitChange.effectiveDate) : '',
      'سمت قبلی در آخرین تغییر': positionChange ? movementValue(state, positionChange, 'from') : '',
      'سمت جدید در آخرین تغییر': positionChange ? movementValue(state, positionChange, 'to') : '',
      'تاریخ آخرین تغییر سمت (شمسی)': positionChange ? formatPersianDate(positionChange.effectiveDate) : '',
      'نام تماس اضطراری': person.emergencyName ?? '',
      'نسبت تماس اضطراری': person.emergencyRelation ?? '',
      'شماره تماس اضطراری': person.emergencyPhone ?? '',
      'تاریخ ایجاد پرونده (شمسی)': formatPersianDateTime(person.createdAt),
      'آخرین ویرایش پرونده (شمسی)': formatPersianDateTime(person.updatedAt),
    };
    if (includeBanking) {
      row['نام بانک'] = person.bankName ?? '';
      row['شماره حساب'] = person.accountNumber ?? '';
      row['شماره کارت'] = person.cardNumber ?? '';
      row['شماره شبا'] = person.iban ?? '';
    }
    return row;
  });

  const movementRows = state.personnel.flatMap((person) => [...(person.movements ?? [])]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((movement, index) => ({
      'ردیف گردش': index + 1,
      'کد پرسنلی': person.personnelCode,
      'نام و نام خانوادگی': `${person.firstName} ${person.lastName}`,
      'نوع گردش': movement.kind === 'branch_transfer' ? 'انتقال شعبه' : movement.kind === 'unit_change' ? 'تغییر واحد' : 'تغییر سمت',
      'مقدار قبلی': movementValue(state, movement, 'from'),
      'مقدار جدید': movementValue(state, movement, 'to'),
      'تاریخ اجرای تغییر (شمسی)': formatPersianDate(movement.effectiveDate),
      'تاریخ پایان استقرار قبلی (شمسی)': movement.previousEndedAt ? formatPersianDate(movement.previousEndedAt) : '',
      'تاریخ شروع استقرار جدید (شمسی)': movement.newStartedAt ? formatPersianDate(movement.newStartedAt) : '',
      'دلیل تغییر': movement.reason,
      'ثبت‌کننده': movement.actorName,
      'زمان ثبت رویداد (شمسی)': formatPersianDateTime(movement.recordedAt),
    })));
  const compensationRows = state.personnel.flatMap((person) => orderedSalesCompensationHistory(person).map((item, index) => ({
    'ردیف سابقه': index + 1,
    'کد پرسنلی': person.personnelCode,
    'نام و نام خانوادگی': `${person.firstName} ${person.lastName}`,
    'واحد سازمانی اصلی': nameOfUnit(state, person.unitId),
    'سمت سازمانی اصلی': nameOfPosition(state, person.positionId),
    'رده در شبکه فروش': salesLevelLabel(person.salesHierarchyLevel),
    'تاریخ شروع نقش فروش (شمسی)': person.salesAssignmentStartDate ? formatPersianDate(person.salesAssignmentStartDate) : '',
    'نوع پرداخت': salesCompensationModeLabel(item.mode),
    'حقوق ثابت ماهانه (ریال)': item.monthlyFixedSalaryRial ?? '',
    'درصد پورسانت': item.commissionPercent ?? '',
    'مبنای پورسانت': 'وصول فاکتور',
    'تاریخ شروع اجرای شرایط (شمسی)': formatPersianDate(item.effectiveFrom),
    'دلیل تغییر': item.reason,
    'ثبت‌کننده': item.actorName,
    'تاریخ و ساعت ثبت (شمسی)': formatPersianDateTime(item.recordedAt),
  })));
  return {personnelRows, movementRows, compensationRows};
}

function prepareSheet(XLSX: typeof import('xlsx'), rows: PersonnelExportRow[], fallbackHeaders: string[]) {
  const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([fallbackHeaders]);
  const headers = rows.length ? Object.keys(rows[0]) : fallbackHeaders;
  sheet['!autofilter'] = {ref: `A1:${XLSX.utils.encode_col(Math.max(0, headers.length - 1))}${Math.max(1, rows.length + 1)}`};
  sheet['!cols'] = headers.map((header) => ({wch: Math.min(38, Math.max(13, header.length + 4))}));
  return sheet;
}

export async function downloadPersonnelWorkbook(state: FoundationState, includeBanking: boolean) {
  const XLSX = await import('xlsx');
  const data = buildPersonnelExportData(state, includeBanking);
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = {Views: [{RTL: true}]};
  XLSX.utils.book_append_sheet(workbook, prepareSheet(XLSX, data.personnelRows, ['کد پرسنلی', 'نام', 'نام خانوادگی']), 'اطلاعات جامع پرسنل');
  XLSX.utils.book_append_sheet(workbook, prepareSheet(XLSX, data.movementRows, ['کد پرسنلی', 'نام و نام خانوادگی', 'نوع گردش']), 'تاریخچه گردش');
  XLSX.utils.book_append_sheet(workbook, prepareSheet(XLSX, data.compensationRows, ['کد پرسنلی', 'نام و نام خانوادگی', 'نوع پرداخت']), 'تاریخچه حقوق و پورسانت');
  const today = formatPersianDate(todayIsoDateForExport()).replaceAll('/', '-');
  XLSX.writeFile(workbook, `گزارش_جامع_پرسنل_${today}.xlsx`, {compression: true});
  return {personnelCount: data.personnelRows.length, movementCount: data.movementRows.length, includesBanking: includeBanking};
}

function todayIsoDateForExport() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
