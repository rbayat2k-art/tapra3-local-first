import React, { useState } from 'react';
import { 
  Download, FileSpreadsheet, CheckCircle2, Building2, 
  Banknote, AlertTriangle, ShieldCheck, CreditCard, ArrowLeft,
  X
} from 'lucide-react';
import { PaymentRequest } from '../types';
import { formatRial, numberToPersianWords } from '../utils/numberToWords';
import { SUPPORTED_BANKS, generateBankBatchFile, downloadBankBatchFile } from '../utils/bankFormats';

interface BulkPaymentExportModalProps {
  selectedRequests: PaymentRequest[];
  onClose: () => void;
  onMarkBatchAsPaid?: (requestIds: string[], batchNote: string) => void;
}

export const BulkPaymentExportModal: React.FC<BulkPaymentExportModalProps> = ({
  selectedRequests,
  onClose,
  onMarkBatchAsPaid
}) => {
  const [selectedBankId, setSelectedBankId] = useState('mellat');
  const [paymentType, setPaymentType] = useState<'paya' | 'satna' | 'internal'>('paya');
  const [sourceAccount, setSourceAccount] = useState('IR890120000000010099887001');
  const [isExported, setIsExported] = useState(false);
  const [exportedFilename, setExportedFilename] = useState('');

  const totalAmount = selectedRequests.reduce((sum, r) => sum + r.amount, 0);
  const selectedBank = SUPPORTED_BANKS.find(b => b.id === selectedBankId) || SUPPORTED_BANKS[0];

  const handleExport = () => {
    const { filename, fileContent, mimeType } = generateBankBatchFile(selectedRequests, {
      bankId: selectedBankId,
      bankName: selectedBank.name,
      fileType: 'csv',
      paymentType,
      sourceAccountOrSheba: sourceAccount
    });

    downloadBankBatchFile(filename, fileContent, mimeType);
    setExportedFilename(filename);
    setIsExported(true);
  };

  const handleMarkAsPaidSubmit = () => {
    if (confirm(`آیا از تغییر وضعیت ${selectedRequests.length} درخواست انتخابی به "پرداخت شده" اطمینان دارید؟`)) {
      if (onMarkBatchAsPaid) {
        onMarkBatchAsPaid(
          selectedRequests.map(r => r.id),
          `پرداخت گروهی بانکی (${selectedBank.name}) - فایل: ${exportedFilename || 'Batch Export'}`
        );
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl p-6 sm:p-8 space-y-6 shadow-2xl dir-rtl my-8">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-bold border border-emerald-500/20">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>پرداخت گروهی و خروجی فایل واریز بانکی (Bulk ACH / Paya)</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              صدور دیسکت واریز بانکی پایا / ساتنا
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تعداد {selectedRequests.length} فاکتور تایید شده جهت تسویه حساب گروهی با استاندارد اینترنت‌بانک شرکتی
            </p>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bank Selection Grid */}
        <div className="space-y-3">
          <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
            ۱. انتخاب بانک عامل و فرمت استاندارد فایل خروجی *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SUPPORTED_BANKS.map(bank => (
              <button
                key={bank.id}
                type="button"
                onClick={() => setSelectedBankId(bank.id)}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col justify-between gap-2 ${
                  selectedBankId === bank.id
                    ? 'border-indigo-500 bg-indigo-500/10 dark:bg-indigo-950/40 text-slate-900 dark:text-white shadow-md'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-3 h-3 rounded-full ${bank.logoColor}`} />
                  {selectedBankId === bank.id && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                  )}
                </div>
                <span className="text-xs font-bold leading-snug">{bank.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Payment Type and Source Account */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              نوع واریز سامانه بانکی
            </label>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setPaymentType('paya')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  paymentType === 'paya' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                پایا (Paya)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('satna')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  paymentType === 'satna' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                ساتنا (Satna)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              شماره شبا/حساب مبدأ خزانه‌داری
            </label>
            <input
              type="text"
              value={sourceAccount}
              onChange={(e) => setSourceAccount(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 font-mono dir-ltr"
            />
          </div>
        </div>

        {/* Summary Box */}
        <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>مجموع مبلغ نهایی جهت واریز گروهی:</span>
            <span className="font-mono font-black text-base text-emerald-400">{formatRial(totalAmount)}</span>
          </div>
          <div className="text-[11px] text-emerald-300/80 font-bold">
            معادل: {numberToPersianWords(totalAmount)}
          </div>
        </div>

        {/* Selected Requests List Table */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            فهرست {selectedRequests.length} درخواست انتخابی:
          </span>
          <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {selectedRequests.map((req, index) => (
              <div key={req.id} className="p-3 bg-white dark:bg-slate-950/50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-slate-400 font-mono text-[10px] w-5 text-center">{index + 1}</span>
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono font-extrabold text-slate-700 dark:text-slate-300 rounded text-[10px]">
                    {req.trackingCode}
                  </span>
                  <div className="truncate">
                    <span className="font-bold text-slate-900 dark:text-white block truncate">{req.title}</span>
                    <span className="text-[10px] text-slate-400">{req.destinationAccountName} - شبا: {req.destinationSheba || req.destinationCardNumber}</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs shrink-0">
                  {formatRial(req.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Export Actions */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
          >
            بستن
          </button>

          <div className="flex items-center gap-3">
            {isExported && onMarkBatchAsPaid && (
              <button
                onClick={handleMarkAsPaidSubmit}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer animate-pulse"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تغییر وضعیت همه به "واریز شده"</span>
              </button>
            )}

            <button
              onClick={handleExport}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل واریز {selectedBank.name.split(' ')[1] || selectedBank.name} (.CSV)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
