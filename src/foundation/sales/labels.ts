import type {
  InvoiceItemType,
  SaleEntryMode,
  SalesCallOutcome,
  SalesInvoiceStatus,
  SalesLeadStatus,
  SalesPaymentMethod,
  SalesPaymentStatus,
} from '../api/contracts';

export const SALES_LEAD_STATUS_LABELS: Record<SalesLeadStatus, string> = {
  new: 'جدید',
  pending_action: 'در انتظار اقدام',
  callback_scheduled: 'یادآوری تماس',
  overdue: 'عقب‌افتاده',
  in_negotiation: 'در حال مذاکره',
  ready_for_invoice: 'آمادهٔ صدور فاکتور',
  closed_won: 'بسته‌شده (برد)',
  closed_lost: 'بسته‌شده (باخت)',
  wrong_number: 'شماره اشتباه',
  complaint_blocked: 'مسدود (شکایت)',
};

export const SALES_CALL_OUTCOME_LABELS: Record<SalesCallOutcome, string> = {
  not_dialed: 'شماره‌گیری نشد',
  could_not_connect: 'اتصال برقرار نشد',
  switched_off: 'خاموش',
  no_answer: 'پاسخ داده نشد',
  wrong_number: 'شماره اشتباه',
  connected_no_time: 'وصل شد ولی فرصت صحبت نبود',
  real_conversation: 'گفتگوی واقعی و معرفی انجام شد',
  callback_requested: 'درخواست تماس مجدد',
  interested: 'علاقه‌مند',
  ready_for_invoice: 'آمادهٔ صدور فاکتور',
  cancelled: 'انصراف داد',
  complaint: 'شکایت/پشتیبانی',
};

export function formatSalesDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export const SALES_INVOICE_STATUS_LABELS: Record<SalesInvoiceStatus, string> = {
  awaiting_supervisor_approval: 'در انتظار تأیید سرپرست',
  awaiting_payment: 'در انتظار پرداخت',
  awaiting_financial_review: 'در انتظار بررسی مالی',
  partially_paid: 'بخشی از مبلغ تأیید شده',
  payment_correction_required: 'نیازمند اصلاح پرداخت',
  overpayment_hold: 'متوقف به‌دلیل اضافه‌پرداخت',
  financially_approved: 'تأیید مالی کامل',
  cancellation_requested: 'درخواست لغو ثبت شده',
  cancelled: 'لغو شده',
};

export const SALES_PAYMENT_STATUS_LABELS: Record<SalesPaymentStatus, string> = {
  submitted: 'در انتظار بررسی',
  approved: 'تأیید شده',
  needs_correction: 'برگشت برای اصلاح',
};

export const SALES_PAYMENT_METHOD_LABELS: Record<SalesPaymentMethod, string> = {
  card_to_card: 'کارت‌به‌کارت',
  bank_transfer: 'انتقال بانکی',
  payment_gateway: 'درگاه پرداخت',
  cash: 'نقدی',
  cheque: 'چک',
  cod: 'پرداخت هنگام تحویل',
};

export const SALE_ENTRY_MODE_LABELS: Record<SaleEntryMode, string> = {
  direct: 'ثبت مستقیم فروشنده',
  paper_entry: 'ثبت از روی فرم کاغذی',
};

export const INVOICE_ITEM_TYPE_LABELS: Record<InvoiceItemType, string> = {
  goods: 'کالا',
  service: 'خدمت',
};

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  blocked_by_payment: 'متوقف تا تکمیل تأیید مالی',
  eligible: 'آماده ورود به اجرا',
  awaiting_stock: 'در انتظار موجودی',
  in_progress: 'در حال اجرا',
  completed: 'تکمیل شده',
  cancellation_requested: 'درخواست لغو ثبت شده',
  cancelled: 'لغو شده',
  failed: 'ناموفق',
};

export function formatRial(value: string): string {
  try {
    return `${new Intl.NumberFormat('fa-IR').format(BigInt(value))} ریال`;
  } catch {
    return 'مبلغ نامعتبر';
  }
}
