import React, { useState } from 'react';
import { PaymentRequest } from '../types';
import { formatRial } from '../utils/numberToWords';
import { StatusBadge, EmptyState, type StatusTone } from './ui/primitives';
import {
  Building, MapPin, Calendar, User as UserIcon,
  Paperclip, Eye, CheckCircle2, Clock, XCircle,
  RefreshCw, CreditCard, ArrowLeftRight, LayoutList, LayoutGrid, Printer
} from 'lucide-react';

interface RequestTableViewProps {
  requests: PaymentRequest[];
  onSelectRequest: (request: PaymentRequest) => void;
  onOpenPrintModal?: (request: PaymentRequest) => void;
}

export const RequestTableView: React.FC<RequestTableViewProps> = ({
  requests,
  onSelectRequest,
  onOpenPrintModal
}) => {
  const [viewDensity, setViewDensity] = useState<'slim' | 'card'>('slim');

  const getStatusBadge = (status: PaymentRequest['status']): { label: string; tone: StatusTone; icon: typeof Clock } => {
    switch (status) {
      case 'pending_approval':
        return { label: 'در انتظار تایید', tone: 'warning', icon: Clock };
      case 'returned':
        return { label: 'عودت داده شده', tone: 'warning', icon: RefreshCw };
      case 'approved_awaiting_payment_assignment':
        return { label: 'آماده ارجاع پرداخت', tone: 'info', icon: ArrowLeftRight };
      case 'approved_pending_payment':
        return { label: 'تایید شده (انتظار واریز)', tone: 'info', icon: CreditCard };
      case 'emergency_pending_payment':
        return { label: 'پرداخت فوری (در انتظار واریز)', tone: 'warning', icon: CreditCard };
      case 'paid':
        return { label: 'واریز شد', tone: 'success', icon: CheckCircle2 };
      case 'completed':
        return { label: 'اتمام کار', tone: 'neutral', icon: CheckCircle2 };
      case 'cancelled':
        return { label: 'لغو شده', tone: 'neutral', icon: XCircle };
      case 'rejected':
        return { label: 'رد شده', tone: 'danger', icon: XCircle };
      default:
        return { label: 'در جریان', tone: 'neutral', icon: Clock };
    }
  };

  const getRequestTypeTitle = (type: PaymentRequest['requestType']) => {
    switch (type) {
      case 'current_payment': return 'فاکتور جاری';
      case 'advance_payment': return 'مساعده حقوق';
      case 'info_request': return 'درخواست اطلاعات';
      default: return 'عمومی';
    }
  };

  if (requests.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px]">
        <EmptyState
          icon={ArrowLeftRight}
          title="هیچ درخواستی در این بخش یافت نشد"
          description="می‌توانید با دکمه ثبت درخواست جدید، فرم پرداختی را ایجاد کنید."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 dir-rtl">

      {/* Top Controls: View Density Switcher */}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-[var(--text-muted)] border-b border-[var(--border)] pb-2">
        <span className="font-bold">
          تعداد درخواست‌ها: <strong className="text-[var(--text-primary)] font-mono">{requests.length}</strong> مورد
        </span>

        <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-1 border border-[var(--border)] rounded-xl">
          <button
            onClick={() => setViewDensity('slim')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              viewDensity === 'slim'
                ? 'bg-[var(--primary)] text-white shadow'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>نمای باریک فشرده (جدولی)</span>
          </button>

          <button
            onClick={() => setViewDensity('card')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              viewDensity === 'card'
                ? 'bg-[var(--primary)] text-white shadow'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>نمای کارت پرجزئیات</span>
          </button>
        </div>
      </div>

      {/* SLIM TABLE ROW VIEW (DEFAULT & COMPACT) */}
      {viewDensity === 'slim' ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] overflow-hidden divide-y divide-[var(--border)] shadow-sm">
          {requests.map((req, index) => {
            const statusConfig = getStatusBadge(req.status);

            return (
              <div
                key={req.id}
                onClick={() => onSelectRequest(req)}
                className="p-3 sm:px-4 sm:py-3.5 hover:bg-[var(--surface-muted)] transition-colors flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 cursor-pointer group"
              >
                {/* 1. Row Index & Tracking Code & Type */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-[var(--surface-muted)] text-[var(--text-muted)] font-mono font-bold text-[11px] px-2 py-1 rounded-lg border border-[var(--border)] min-w-[32px] text-center">
                    #{index + 1}
                  </span>

                  <span className="bg-[var(--primary)] text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm">
                    {req.trackingCode}
                  </span>

                  <span className="hidden sm:inline-block bg-[var(--surface-muted)] text-[var(--text-secondary)] text-[11px] font-bold px-2 py-0.5 rounded-md border border-[var(--border)]">
                    {getRequestTypeTitle(req.requestType)}
                  </span>
                </div>

                {/* 2. Title & Description (Permanently visible, clean truncating, NO hover flicker!) */}
                <div className="flex-1 min-w-[200px] max-w-xl">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors line-clamp-1">
                      {req.title}
                    </h4>
                    {req.isMultiCostCenter && (
                      <StatusBadge label="چندمرکزی" tone="info" />
                    )}
                  </div>

                  {/* Clean permanent description preview */}
                  {req.description ? (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1 font-normal">
                      {req.description}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)] italic mt-0.5">بدون توضیحات اضافی</p>
                  )}
                </div>

                {/* 3. Company & Cost Center Branch */}
                <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] shrink-0">
                  <div className="bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                    <Building className="w-3 h-3 text-[var(--primary)] shrink-0" />
                    <span className="font-medium text-[11px]">{req.companyName}</span>
                    <span className="text-[var(--border-strong)]">•</span>
                    <MapPin className="w-3 h-3 text-[var(--warning)] shrink-0" />
                    <span className="font-bold text-[var(--warning)] text-[11px]">{req.costCenterName}</span>
                  </div>
                </div>

                {/* 4. Requestor & Date */}
                <div className="hidden lg:flex flex-col text-right shrink-0 min-w-[120px]">
                  <span className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    <UserIcon className="w-3 h-3 text-[var(--text-muted)]" />
                    {req.requestorName}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5 font-mono">
                    <Calendar className="w-3 h-3" />
                    {req.createdAt}
                  </span>
                </div>

                {/* 5. Amount (Formatted Rial) */}
                <div className="text-left shrink-0 min-w-[130px] font-mono">
                  <span className="text-xs sm:text-sm font-black text-[var(--success)] block dir-ltr text-right">
                    {formatRial(req.amount)}
                  </span>
                  {req.initialAttachments?.length > 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center justify-end gap-1 mt-0.5">
                      <Paperclip className="w-2.5 h-2.5" />
                      {req.initialAttachments.length} پیوست
                    </span>
                  )}
                </div>

                {/* 6. Status & Quick Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge label={statusConfig.label} tone={statusConfig.tone} icon={statusConfig.icon} />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRequest(req);
                    }}
                    className="p-1.5 bg-[var(--primary-soft)] hover:bg-[var(--primary)] text-[var(--primary)] hover:text-white rounded-lg transition cursor-pointer"
                    title="مشاهده جزئیات کامل"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {onOpenPrintModal && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPrintModal(req);
                      }}
                      className="p-1.5 bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text-secondary)] rounded-lg border border-[var(--border)] transition cursor-pointer"
                      title="چاپ فرم پرداخت"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* EXPANDED CARD VIEW */
        <div className="space-y-3">
          {requests.map((req, index) => {
            const statusConfig = getStatusBadge(req.status);

            return (
              <div
                key={req.id}
                className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] rounded-[14px] p-4 transition shadow-sm group text-right"
              >
                {/* Top Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-[var(--surface-muted)] text-[var(--text-muted)] font-mono font-bold text-xs px-2.5 py-1 rounded-xl border border-[var(--border)]">
                      ردیف {index + 1}
                    </span>
                    <span className="bg-[var(--primary)] text-white font-mono font-black text-xs px-3 py-1 rounded-xl">
                      کد: {req.trackingCode}
                    </span>
                    <span className="bg-[var(--surface-muted)] text-[var(--primary)] text-[11px] font-bold px-2.5 py-1 rounded-xl border border-[var(--border)]">
                      {getRequestTypeTitle(req.requestType)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge label={statusConfig.label} tone={statusConfig.tone} icon={statusConfig.icon} />

                    <button
                      onClick={() => onSelectRequest(req)}
                      className="px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مشاهده جزئیات</span>
                    </button>
                  </div>
                </div>

                {/* Title & Amount */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div className="md:col-span-2">
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition leading-snug">
                      {req.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {req.description || 'بدون توضیحات اضافی'}
                    </p>
                  </div>

                  <div className="p-2.5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl text-left flex flex-col justify-center">
                    <span className="text-[11px] text-[var(--text-muted)] block text-right font-medium">مبلغ به ریال:</span>
                    <span className="text-sm font-mono font-black text-[var(--success)] block dir-ltr text-right">{formatRial(req.amount)}</span>
                    <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block truncate text-right">{req.amountInWords}</span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[var(--border)] text-xs">
                  <div className="bg-[var(--surface-muted)] p-2 rounded-xl border border-[var(--border)]">
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mb-0.5"><Building className="w-3 h-3 text-[var(--primary)]" /> شرکت:</span>
                    <span className="font-bold text-[var(--text-secondary)]">{req.companyName}</span>
                  </div>
                  <div className="bg-[var(--surface-muted)] p-2 rounded-xl border border-[var(--border)]">
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mb-0.5"><MapPin className="w-3 h-3 text-[var(--warning)]" /> مرکز هزینه:</span>
                    <span className="font-bold text-[var(--warning)]">{req.costCenterName}</span>
                  </div>
                  <div className="bg-[var(--surface-muted)] p-2 rounded-xl border border-[var(--border)]">
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mb-0.5"><UserIcon className="w-3 h-3 text-[var(--info)]" /> درخواست‌کننده:</span>
                    <span className="font-bold text-[var(--text-secondary)] truncate block">{req.requestorName}</span>
                  </div>
                  <div className="bg-[var(--surface-muted)] p-2 rounded-xl border border-[var(--border)] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mb-0.5"><Paperclip className="w-3 h-3 text-[var(--success)]" /> پیوست‌ها:</span>
                      <span className="font-bold text-[var(--text-secondary)]">{req.initialAttachments?.length || 0} فایل</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
