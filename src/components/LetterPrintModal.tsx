import React from 'react';
import { Letter } from '../types';
import { Printer, X, Building2 } from 'lucide-react';

interface LetterPrintModalProps {
  letter: Letter | null;
  isOpen: boolean;
  onClose: () => void;
}

// Standard Iranian official letter (نامه اداری) layout:
// سرلوحه (شماره / تاریخ / پیوست) بالا، گیرنده و فرستنده زیر آن، موضوع، متن، امضا پایین سمت چپ.
export const LetterPrintModal: React.FC<LetterPrintModalProps> = ({ letter, isOpen, onClose }) => {
  if (!isOpen || !letter) return null;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full p-8 space-y-6 print:m-0 print:p-6 print:shadow-none print:w-full">
        <div className="flex items-center justify-between border-b pb-4 print:hidden">
          <div className="text-xs font-bold text-slate-500">پیش‌نمایش نامه رسمی قابل چاپ</div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer">
              <Printer className="w-4 h-4" />
              <span>چاپ / ذخیره به صورت PDF</span>
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">
              انصراف
            </button>
          </div>
        </div>

        <div className="border-2 border-slate-900 p-8 rounded-xl space-y-6" dir="rtl">
          {/* Letterhead */}
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-slate-900" />
              <div>
                <h1 className="text-lg font-black text-slate-900">هلدینگ شاواز - tapra</h1>
                <p className="text-xs font-bold text-slate-600">سامانه نامه‌نگاری داخلی</p>
              </div>
            </div>
            <div className="text-left text-xs font-bold text-slate-700 space-y-1">
              <p>شماره: {letter.letterNumber} (V{letter.currentVersion})</p>
              <p>تاریخ: {letter.date}</p>
              <p>پیوست: {letter.attachments.length > 0 ? `${letter.attachments.length} فایل (${letter.attachments.map(a => a.name).join('، ')})` : 'ندارد'}</p>
            </div>
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-bold">از:</span> {letter.fromUserName} ({letter.fromRoleTitle})</div>
            <div className="text-left"><span className="font-bold">به:</span> {letter.toUnit}</div>
          </div>

          {/* Subject */}
          <div className="text-sm">
            <span className="font-bold">موضوع:</span> {letter.subject}
          </div>

          {/* Body */}
          <div className="text-sm leading-8 whitespace-pre-wrap min-h-[160px] pt-2">
            {letter.body}
          </div>

          {/* Tags */}
          {letter.tags.length > 0 && (
            <div className="text-xs text-slate-500">برچسب‌ها: {letter.tags.join('، ')}</div>
          )}

          {/* Signature */}
          <div className="pt-10 flex justify-start">
            <div className="text-xs font-bold text-slate-800 border-t-2 border-slate-900 pt-2 min-w-[220px]">
              {letter.signature ? (
                <>
                  <p>{letter.signature.fullName}</p>
                  <p className="font-normal text-slate-600">{letter.signature.roleTitle}</p>
                  <p className="font-normal text-slate-500">{letter.signature.date} — ساعت {letter.signature.time}</p>
                  <p className="mt-1 text-[10px] text-slate-400">امضای دیجیتال سیستمی</p>
                </>
              ) : (
                <p className="text-slate-400">در انتظار تایید و امضای نهایی</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
