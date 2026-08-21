import React, { useState } from 'react';
import { Letter, LetterStatus, User } from '../types';
import { getJalaliNowWithSeconds } from '../utils/persianDate';
import {
  X, CheckCircle2, RotateCcw, Send, Clock, Paperclip, Tag as TagIcon,
  Forward, Reply, Archive, Ban, History, Printer, Eye
} from 'lucide-react';
import { SystemPermissionRecipientPicker } from './SystemPermissionRecipientPicker';

interface LetterDetailModalProps {
  letter: Letter;
  thread: Letter[]; // all letters sharing this letter's threadId, sorted by createdAt
  currentUser: User | null;
  users: User[];
  canManageLetters: boolean;
  onClose: () => void;
  onUpdateLetter: (updated: Letter) => void;
  onOpenVersionEdit: (letter: Letter) => void;
  onOpenReply: (letter: Letter) => void;
  onOpenPrint: (letter: Letter) => void;
  onOpenThreadLetter: (letter: Letter) => void;
  onForward: (letter: Letter, targetInput: string, note: string, targetUserId?: string, targetUserName?: string) => void;
}

const statusMeta: Record<LetterStatus, { label: string; cls: string }> = {
  draft: { label: 'پیش‌نویس', cls: 'bg-slate-700 text-slate-300' },
  in_review: { label: 'در حال بررسی', cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30' },
  needs_correction: { label: 'نیاز به اصلاح', cls: 'bg-orange-500/15 text-orange-300 border border-orange-500/30' },
  approved: { label: 'تایید شده', cls: 'bg-teal-500/15 text-teal-300 border border-teal-500/30' },
  sent: { label: 'ارسال شده', cls: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30' },
  seen: { label: 'مشاهده شده', cls: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' },
  replied: { label: 'پاسخ داده شده', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  archived: { label: 'بایگانی شده', cls: 'bg-slate-800 text-slate-500' },
  cancelled: { label: 'لغو شده', cls: 'bg-rose-500/15 text-rose-300 border border-rose-500/30' },
};

export const LetterDetailModal: React.FC<LetterDetailModalProps> = ({
  letter,
  thread,
  currentUser,
  users,
  canManageLetters,
  onClose,
  onUpdateLetter,
  onOpenVersionEdit,
  onOpenReply,
  onOpenPrint,
  onOpenThreadLetter,
  onForward
}) => {
  const [showVersions, setShowVersions] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [forwardTarget, setForwardTarget] = useState('');
  const [forwardTargetUserId, setForwardTargetUserId] = useState<string | undefined>();
  const [forwardTargetUserName, setForwardTargetUserName] = useState<string | undefined>();
  const [forwardNote, setForwardNote] = useState('');

  const isAuthor = currentUser?.id === letter.fromUserId;
  const isAdmin = currentUser?.role === 'admin';

  const pushTimeline = (base: Letter, entry: Omit<Letter['timeline'][number], 'id' | 'timestamp'>) => ({
    ...base,
    timeline: [...base.timeline, { ...entry, id: `ltl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, timestamp: getJalaliNowWithSeconds() }]
  });

  const changeStatus = (newStatus: LetterStatus, actionTitle: string, comment?: string, extra?: Partial<Letter>) => {
    if (!currentUser) return;
    const now = getJalaliNowWithSeconds();
    let updated: Letter = { ...letter, status: newStatus, updatedAt: now, ...extra };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'status_changed', actionTitle, comment
    });
    onUpdateLetter(updated);
  };

  const handleSubmitForReview = () => changeStatus('in_review', 'ارسال برای بررسی');

  const handleApprove = () => {
    if (!currentUser) return;
    const now = getJalaliNowWithSeconds();
    const [d, t] = now.split(' - ');
    changeStatus('approved', 'تایید نامه', undefined, {
      signature: { userId: currentUser.id, fullName: currentUser.fullName, roleTitle: currentUser.roleTitle, date: d, time: t }
    });
  };

  const handleMarkSent = () => changeStatus('sent', 'ارسال نامه به گیرنده');

  const handleMarkSeen = () => {
    if (!currentUser) return;
    if (letter.seenBy.some((s) => s.userId === currentUser.id)) return;
    const now = getJalaliNowWithSeconds();
    let updated: Letter = {
      ...letter,
      status: letter.status === 'sent' ? 'seen' : letter.status,
      seenBy: [...letter.seenBy, { userId: currentUser.id, userName: currentUser.fullName, at: now }]
    };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'seen', actionTitle: 'مشاهده نامه'
    });
    onUpdateLetter(updated);
  };

  const handleRequestCorrection = () => {
    const note = prompt('توضیح دهید چه اصلاحی لازم است:');
    if (!note || !note.trim()) return;
    changeStatus('needs_correction', 'درخواست اصلاح', note.trim());
  };

  const handleArchive = () => changeStatus('archived', 'بایگانی نامه', 'نامه بایگانی شد (غیرقابل حذف).');
  const handleCancel = () => {
    if (!confirm('این نامه لغو شود؟')) return;
    changeStatus('cancelled', 'لغو نامه');
  };

  const handleRevertLetterStatus = () => {
    if (!currentUser) return;
    let targetStatus: LetterStatus = 'in_review';
    if (letter.status === 'in_review') targetStatus = 'draft';
    if (letter.status === 'approved' || letter.status === 'needs_correction' || letter.status === 'sent') targetStatus = 'in_review';

    changeStatus(targetStatus, 'بازگشت از وضعیت قبلی (لغو اقدام)', 'کاربر اقدام قبلی خود روی نامه را لغو کرد و نامه به وضعیت در انتظار بررسی/پیش‌نویس بازگشت.');
  };

  const handleForwardSubmit = () => {
    if (!forwardTarget.trim()) { alert('لطفاً گیرنده یا دسترسی مورد نظر را انتخاب نمایید.'); return; }
    onForward(letter, forwardTarget.trim(), forwardNote.trim(), forwardTargetUserId, forwardTargetUserName);
    setShowForward(false);
    setForwardTarget('');
    setForwardTargetUserId(undefined);
    setForwardTargetUserName(undefined);
    setForwardNote('');
  };

  // Auto-mark-seen once when a non-author opens a sent/approved letter
  React.useEffect(() => {
    if (currentUser && !isAuthor && (letter.status === 'sent' || letter.status === 'approved') && !letter.seenBy.some((s) => s.userId === currentUser.id)) {
      handleMarkSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter.id]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full my-8 max-h-[92vh] overflow-y-auto text-right">
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-indigo-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg">{letter.letterNumber}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusMeta[letter.status].cls}`}>{statusMeta[letter.status].label}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">V{letter.currentVersion}</span>
            </div>
            <h2 className="text-lg font-extrabold text-white mt-1">{letter.subject}</h2>
            <p className="text-xs text-slate-400 mt-0.5">از {letter.fromUserName} ({letter.fromRoleTitle}) — به {letter.toUnit} — {letter.date}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onOpenPrint(letter)} title="چاپ / PDF" className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center cursor-pointer">
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Body */}
          <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{letter.body}</p>
          </div>

          {letter.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <TagIcon className="w-3.5 h-3.5 text-slate-500" />
              {letter.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">{t}</span>
              ))}
            </div>
          )}

          {letter.attachments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> پیوست‌ها</span>
              {letter.attachments.map((a) => (
                <a key={a.id} href={a.dataUrl} download={a.name} className="block p-2 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-300 hover:bg-slate-750">
                  {a.name}
                </a>
              ))}
            </div>
          )}

          {/* Digital signature */}
          {letter.signature && (
            <div className="p-3 bg-teal-950/20 border border-teal-500/30 rounded-xl text-xs text-teal-200">
              <span className="font-bold block mb-1">امضای دیجیتال</span>
              <span>{letter.signature.fullName} — {letter.signature.roleTitle} — {letter.signature.date} ساعت {letter.signature.time}</span>
            </div>
          )}

          {/* Forward history */}
          {letter.forwardHistory.length > 0 && (
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-300 block">تاریخچه ارجاع</span>
              {letter.forwardHistory.map((f) => (
                <div key={f.id}>{f.byUserName} ← ارجاع به {f.toUserName} — {f.at} {f.note ? `— ${f.note}` : ''}</div>
              ))}
            </div>
          )}

          {/* Version history toggle */}
          <div>
            <button onClick={() => setShowVersions((v) => !v)} className="text-[11px] font-bold text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer">
              <History className="w-3.5 h-3.5" /> تاریخچه نسخه‌ها ({letter.versions.length})
            </button>
            {showVersions && (
              <div className="mt-2 space-y-1.5">
                {letter.versions.slice().reverse().map((v) => (
                  <div key={v.version} className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">نسخه V{v.version}</span>
                      <span className="text-slate-500">{v.editedAt}</span>
                    </div>
                    <p className="text-slate-400 mt-0.5">{v.editedByName} — {v.subject}</p>
                    {v.note && <p className="text-orange-300 mt-0.5">دلیل اصلاح: {v.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thread (replies) */}
          {thread.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400">گفتگوی مرتبط ({thread.length} نامه)</span>
              {thread.map((t) => (
                <button
                  key={t.id}
                  onClick={() => t.id !== letter.id && onOpenThreadLetter(t)}
                  className={`w-full text-right p-2.5 rounded-lg text-[11px] transition ${
                    t.id === letter.id ? 'bg-indigo-600/20 border border-indigo-500/40' : 'bg-slate-950/50 border border-slate-800 hover:bg-slate-800/50 cursor-pointer'
                  }`}
                >
                  <span className="font-bold text-white">{t.letterNumber}</span> — {t.subject} — {t.fromUserName} ({t.date})
                </button>
              ))}
            </div>
          )}

          {/* Action bar */}
          {canManageLetters && letter.status !== 'archived' && letter.status !== 'cancelled' && (
            <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-2xl space-y-3">
              <div className="flex flex-wrap gap-2">
                {isAuthor && letter.status === 'draft' && (
                  <button onClick={handleSubmitForReview} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Send className="w-3.5 h-3.5" /> ارسال برای بررسی
                  </button>
                )}
                {(isAdmin || !isAuthor) && letter.status === 'in_review' && (
                  <>
                    <button onClick={handleApprove} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5" /> تایید نامه
                    </button>
                    <button onClick={handleRequestCorrection} className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                      <RotateCcw className="w-3.5 h-3.5" /> نیاز به اصلاح
                    </button>
                  </>
                )}
                {isAuthor && letter.status === 'needs_correction' && (
                  <button onClick={() => onOpenVersionEdit(letter)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <RotateCcw className="w-3.5 h-3.5" /> اصلاح و ثبت نسخه جدید
                  </button>
                )}
                {isAuthor && letter.status === 'approved' && (
                  <button onClick={handleMarkSent} className="px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Send className="w-3.5 h-3.5" /> ثبت ارسال نامه
                  </button>
                )}
                {!isAuthor && ['sent', 'approved', 'seen'].includes(letter.status) && (
                  <button onClick={() => onOpenReply(letter)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Reply className="w-3.5 h-3.5" /> پاسخ
                  </button>
                )}
                <button onClick={() => setShowForward((s) => !s)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                  <Forward className="w-3.5 h-3.5" /> ارجاع مجدد
                </button>
                {['in_review', 'approved', 'needs_correction', 'sent'].includes(letter.status) && (
                  <button onClick={handleRevertLetterStatus} title="بازگشت از تایید یا لغو اقدام قبلی" className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow">
                    <RotateCcw className="w-3.5 h-3.5" /> بازگشت از اقدام
                  </button>
                )}
                {(isAuthor || isAdmin) && (
                  <button onClick={handleArchive} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Archive className="w-3.5 h-3.5" /> بایگانی
                  </button>
                )}
                {(isAuthor || isAdmin) && letter.status !== 'sent' && (
                  <button onClick={handleCancel} className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                    <Ban className="w-3.5 h-3.5" /> لغو نامه
                  </button>
                )}
              </div>

              {showForward && (
                <div className="pt-3 border-t border-slate-700 space-y-3">
                  <SystemPermissionRecipientPicker
                    value={forwardTarget}
                    onChange={(val, uid, uname) => {
                      setForwardTarget(val);
                      setForwardTargetUserId(uid);
                      setForwardTargetUserName(uname);
                    }}
                    users={users}
                    label="گیرنده / واحد / دسترسی جدید جهت ارجاع"
                    placeholder="جستجو و انتخاب دسترسی، نقش، کاربر یا واحد..."
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={forwardNote}
                      onChange={(e) => setForwardNote(e.target.value)}
                      placeholder="یادداشت ارجاع (اختیاری)"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleForwardSubmit}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer shrink-0"
                    >
                      تایید و ارجاع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Seen by */}
          {letter.seenBy.length > 0 && (
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
              <Eye className="w-3.5 h-3.5" />
              مشاهده‌شده توسط: {letter.seenBy.map((s) => s.userName).join('، ')}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-indigo-300 flex items-center gap-1.5"><Clock className="w-4 h-4" /> تاریخچه نامه</h3>
            {letter.timeline.slice().reverse().map((t) => (
              <div key={t.id} className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{t.actorName} <span className="text-slate-500 font-normal">({t.actorRole})</span></span>
                  <span className="text-slate-500">{t.timestamp}</span>
                </div>
                <p className="text-indigo-300 mt-0.5">{t.actionTitle}</p>
                {t.comment && <p className="text-slate-400 mt-0.5">{t.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
