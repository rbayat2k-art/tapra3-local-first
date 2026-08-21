import React, { useState, useRef } from 'react';
import { Letter, LetterAttachment, User } from '../types';
import { getJalaliNowWithSeconds, getJalaliToday } from '../utils/persianDate';
import { storage } from '../utils/storage';
import { X, Send, Paperclip, Trash2, Tag as TagIcon, Save } from 'lucide-react';
import { SystemPermissionRecipientPicker } from './SystemPermissionRecipientPicker';

interface LetterFormModalProps {
  currentUser: User | null;
  editingLetter?: Letter | null; // if set: creating a corrected new version of this letter
  replyToLetter?: Letter | null; // if set: composing a reply within the same thread
  onClose: () => void;
  onCreate: (letter: Letter) => void;
  onSaveNewVersion: (letter: Letter, subject: string, body: string, note: string) => void;
}

const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3MB, same ceiling used for colleague chat attachments

export const LetterFormModal: React.FC<LetterFormModalProps> = ({
  currentUser,
  editingLetter,
  replyToLetter,
  onClose,
  onCreate,
  onSaveNewVersion
}) => {
  const isVersionEdit = !!editingLetter;
  const isReply = !!replyToLetter;

  const [subject, setSubject] = useState(editingLetter?.subject || (isReply ? `پاسخ: ${replyToLetter!.subject}` : ''));
  const [toUnit, setToUnit] = useState(editingLetter?.toUnit || replyToLetter?.fromUserName || '');
  const [toUserId, setToUserId] = useState<string | undefined>(editingLetter?.toUserId || replyToLetter?.fromUserId);
  const [toUserName, setToUserName] = useState<string | undefined>(editingLetter?.toUserName || replyToLetter?.fromUserName);
  const [body, setBody] = useState(editingLetter?.body || '');
  const [tagsInput, setTagsInput] = useState((editingLetter?.tags || []).join('، '));
  const [attachments, setAttachments] = useState<LetterAttachment[]>(editingLetter?.attachments || []);
  const [correctionNote, setCorrectionNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert(`حجم فایل «${file.name}» بیشتر از سقف مجاز (۳ مگابایت) است.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [...prev, {
        id: `latt_${Date.now()}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: reader.result as string
      }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!subject.trim() || !toUnit.trim() || !body.trim()) {
      alert('لطفاً موضوع، واحد گیرنده (به) و متن نامه را تکمیل نمایید.');
      return;
    }

    const tags = tagsInput.split(/[،,]/).map((t) => t.trim()).filter(Boolean);

    if (isVersionEdit && editingLetter) {
      onSaveNewVersion(editingLetter, subject.trim(), body.trim(), correctionNote.trim());
      return;
    }

    const now = getJalaliNowWithSeconds();
    const counter = storage.getAndIncrementLetterCounter();
    const letterNumber = `L${(1000 + counter).toString()}`;
    const newLetter: Letter = {
      id: `letter_${Date.now()}`,
      letterNumber,
      threadId: replyToLetter ? replyToLetter.threadId : `letter_${Date.now()}`,
      parentLetterId: replyToLetter?.id,
      date: getJalaliToday(),
      time: now.split(' - ')[1] || '',
      subject: subject.trim(),
      toUnit: toUnit.trim(),
      toUserId,
      toUserName,
      fromUserId: currentUser.id,
      fromUserName: currentUser.fullName,
      fromRoleTitle: currentUser.roleTitle,
      body: body.trim(),
      tags,
      attachments,
      status: 'draft',
      currentVersion: 1,
      versions: [{
        version: 1,
        subject: subject.trim(),
        body: body.trim(),
        editedAt: now,
        editedById: currentUser.id,
        editedByName: currentUser.fullName
      }],
      forwardHistory: [],
      seenBy: [],
      timeline: [{
        id: `ltl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'created',
        actionTitle: isReply ? `ثبت پاسخ به نامه ${replyToLetter!.letterNumber}` : 'ثبت پیش‌نویس نامه جدید',
        comment: `نامه با شماره ${letterNumber} ثبت شد.`,
        timestamp: now
      }],
      createdAt: now,
      updatedAt: now
    };

    onCreate(newLetter);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full my-8 max-h-[92vh] overflow-y-auto text-right">
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              {isVersionEdit ? `اصلاح نامه ${editingLetter!.letterNumber} (نسخه جدید)` : isReply ? `پاسخ به نامه ${replyToLetter!.letterNumber}` : 'ثبت نامه جدید'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isVersionEdit ? 'با ذخیره، یک نسخه جدید ساخته می‌شود و نسخه‌های قبلی حفظ می‌مانند.' : 'تاریخ و شماره نامه به‌صورت خودکار ثبت می‌شود'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center cursor-pointer shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400">
            <span>تاریخ: <b className="text-white">{editingLetter?.date || getJalaliToday()}</b></span>
            <span>از: <b className="text-white">{currentUser?.fullName} ({currentUser?.roleTitle})</b></span>
            {editingLetter && <span>نسخه فعلی: <b className="text-white">V{editingLetter.currentVersion} → V{editingLetter.currentVersion + 1}</b></span>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">موضوع *</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <SystemPermissionRecipientPicker
            value={toUnit}
            onChange={(val, uid, uname) => {
              setToUnit(val);
              setToUserId(uid);
              setToUserName(uname);
            }}
            disabled={isVersionEdit}
            label="به (واحد / دسترسی گیرنده)"
            required
            placeholder="جستجو و انتخاب نقش، دسترسی، کاربر یا واحد سازمانی..."
          />

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">متن نامه *</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white leading-relaxed focus:outline-none focus:border-indigo-500" />
          </div>

          {isVersionEdit && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">توضیح اصلاح (چه چیزی تغییر کرد) *</label>
              <input value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} className="w-full bg-slate-800 border border-indigo-400 rounded-xl px-3 py-2.5 text-xs text-white" />
            </div>
          )}

          {!isVersionEdit && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1"><TagIcon className="w-3.5 h-3.5" /> برچسب‌ها (با ، جدا کنید)</label>
                <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="فوری، مالی، پیگیری..." className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">پیوست</label>
                  <input ref={fileInputRef} type="file" onChange={handleFilePick} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" /> افزودن فایل
                  </button>
                </div>
                {attachments.map((a) => (
                  <div key={a.id} className="p-2 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-between text-[11px] text-slate-300">
                    <span className="truncate">{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} className="text-rose-400 hover:text-rose-300 cursor-pointer shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer">
              {isVersionEdit ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {isVersionEdit ? 'ذخیره نسخه جدید' : isReply ? 'ثبت پاسخ (پیش‌نویس)' : 'ثبت پیش‌نویس نامه'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
