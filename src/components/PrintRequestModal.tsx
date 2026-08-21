import React from 'react';
import { PaymentRequest } from '../types';
import { formatRial } from '../utils/numberToWords';
import { Printer, X, Building2, CheckCircle2 } from 'lucide-react';

interface PrintRequestModalProps {
  request: PaymentRequest | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintRequestModal: React.FC<PrintRequestModalProps> = ({
  request,
  isOpen,
  onClose
}) => {
  if (!isOpen || !request) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full p-8 space-y-6 print:m-0 print:p-6 print:shadow-none print:w-full">
        
        {/* Top Control Bar (Hidden on Print) */}
        <div className="flex items-center justify-between border-b pb-4 print:hidden">
          <div className="text-xs font-bold text-slate-500">
            پیش‌نمایش برگه حسابداری و دستور پرداخت قابل چاپ
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>چاپ / ذخیره به صورت PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
            >
              انصراف
            </button>
          </div>
        </div>

        {/* Official Printable Voucher Content */}
        <div className="border-2 border-slate-900 p-6 rounded-xl space-y-6">
          
          {/* Voucher Header */}
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-slate-900" />
              <div>
                <h1 className="text-lg font-black text-slate-900">
                  {request.companyName} - هلدینگ شاواز
                </h1>
                <p className="text-xs font-bold text-slate-600">
                  فرم رسمی درخواست و دستور پرداخت خزانه‌داری
                </p>
              </div>
            </div>

            <div className="text-left font-mono space-y-1">
              <div className="text-sm font-black text-slate-900">
                شناسه یونیک: <span className="bg-slate-100 px-2 py-0.5 border border-slate-400 rounded">{request.trackingCode}</span>
              </div>
              <div className="text-xs text-slate-600">تاریخ: {request.createdAt}</div>
            </div>
          </div>

          {/* Core Table Attributes */}
          <table className="w-full text-xs border-collapse border border-slate-900 text-right">
            <tbody>
              <tr className="border-b border-slate-900">
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900 w-1/4">عنوان درخواست:</td>
                <td className="p-2.5 font-bold text-slate-900 w-3/4" colSpan={3}>{request.title}</td>
              </tr>
              <tr className="border-b border-slate-900">
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">مرکز هزینه / شعبه:</td>
                <td className="p-2.5 font-bold text-slate-900 border-l border-slate-900">{request.costCenterName}</td>
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">نوع درخواست:</td>
                <td className="p-2.5 font-bold text-slate-900">
                  {request.requestType === 'current_payment' ? 'پرداخت جاری' : request.requestType === 'advance_payment' ? 'مساعده حقوق' : request.requestType === 'customer_refund' ? 'عودت وجه مشتری (خدمات پس از فروش)' : 'درخواست اطلاعات/صورت‌حساب'}
                </td>
              </tr>
              <tr className="border-b border-slate-900">
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">مبلغ به عددی (ریال):</td>
                <td className="p-2.5 font-mono font-black text-slate-900 text-base border-l border-slate-900">
                  {formatRial(request.amount)}
                </td>
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">مبلغ به حروف:</td>
                <td className="p-2.5 font-bold text-slate-900">{request.amountInWords}</td>
              </tr>
              <tr className="border-b border-slate-900">
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">شماره کارت / حساب مقصد:</td>
                <td className="p-2.5 font-mono font-bold text-slate-900 border-l border-slate-900">{request.destinationCardNumber}</td>
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">نام صاحب حساب:</td>
                <td className="p-2.5 font-bold text-slate-900">{request.destinationAccountName}</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold bg-slate-100 border-l border-slate-900">بابت / توضیحات:</td>
                <td className="p-2.5 text-slate-800" colSpan={3}>{request.description}</td>
              </tr>
            </tbody>
          </table>

          {/* Multi Cost-Center Allocation Table for Printable Voucher */}
          {request.isMultiCostCenter && request.costCenterAllocations && request.costCenterAllocations.length > 0 && (
            <div className="space-y-2 border border-slate-900 p-3 rounded">
              <h4 className="text-xs font-black text-slate-900">جدول تفکیک هزینه بین چند مرکز هزینه و شرکت (ثبت اسناد مالی حسابداری):</h4>
              <table className="w-full text-xs border-collapse border border-slate-900 text-right">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900">
                    <th className="p-1.5 border-l border-slate-900">ردیف</th>
                    <th className="p-1.5 border-l border-slate-900">شرکت</th>
                    <th className="p-1.5 border-l border-slate-900">مرکز هزینه / شعبه</th>
                    <th className="p-1.5 border-l border-slate-900 text-center">درصد</th>
                    <th className="p-1.5 border-l border-slate-900 text-left">مبلغ سهم (ریال)</th>
                    <th className="p-1.5">بابت / توضیحات سهم</th>
                  </tr>
                </thead>
                <tbody>
                  {request.costCenterAllocations.map((alloc, idx) => {
                    const percent = request.amount > 0 ? Math.round((alloc.amount / request.amount) * 100) : 0;
                    return (
                      <tr key={alloc.id || idx} className="border-b border-slate-300">
                        <td className="p-1.5 border-l border-slate-900 font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-l border-slate-900 font-bold">{alloc.companyName}</td>
                        <td className="p-1.5 border-l border-slate-900 font-bold">{alloc.costCenterName}</td>
                        <td className="p-1.5 border-l border-slate-900 text-center font-mono">{percent}%</td>
                        <td className="p-1.5 border-l border-slate-900 font-mono font-bold text-left">{formatRial(alloc.amount)}</td>
                        <td className="p-1.5 text-slate-700">{alloc.description || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Attachments Preview in Print */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-slate-900">ضمائم و فاکتورهای پیوست:</h4>
            <div className="flex gap-4 overflow-hidden">
              {request.initialAttachments.map((att) => (
                <div key={att.id} className="border border-slate-400 p-1 rounded">
                  <img src={att.url} alt="فاکتور" className="w-24 h-24 object-cover" />
                  <p className="text-[8px] text-center mt-1 truncate w-24">تصویر فاکتور</p>
                </div>
              ))}
              {request.paymentReceiptAttachment && (
                <div className="border border-emerald-600 p-1 rounded bg-emerald-50">
                  <img src={request.paymentReceiptAttachment.url} alt="فیش واریز" className="w-24 h-24 object-cover" />
                  <p className="text-[8px] text-center mt-1 font-bold text-emerald-800 w-24">فیش واریزی بانک</p>
                </div>
              )}
            </div>
          </div>

          {/* Signatures Box */}
          <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs font-bold border-t-2 border-slate-900">
            <div className="space-y-8">
              <p>مهر و امضاء درخواست‌کننده:</p>
              <p className="text-slate-700">{request.requestorName}</p>
            </div>
            <div className="space-y-8 border-r border-l border-slate-300">
              <p>مهر و امضاء مدیر تاییدکننده:</p>
              <p className="text-slate-700">{request.currentApproverName}</p>
            </div>
            <div className="space-y-8">
              <p>مهر و امضاء خزانه‌داری (رضا بیات):</p>
              <p className="text-slate-700">تایید شد جهت پرداخت</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
