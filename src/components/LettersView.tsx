import React, { useState, useMemo } from 'react';
import { Letter, User } from '../types';
import { LetterFormModal } from './LetterFormModal';
import { LetterDetailModal } from './LetterDetailModal';
import { LetterPrintModal } from './LetterPrintModal';
import {
  Mail, Plus, Search, Clock3, AlertTriangle, Forward, Reply as ReplyIcon,
  Inbox, Send, FileEdit, Archive, Download
} from 'lucide-react';

interface LettersViewProps {
  letters: Letter[];
  currentUser: User | null;
  users: User[];
  onCreateLetter: (letter: Letter) => void;
  onUpdateLetter: (updated: Letter) => void;
  onSaveNewVersion: (letter: Letter, subject: string, body: string, note: string) => void;
  onForward: (letter: Letter, targetInput: string, note: string, targetUserId?: string, targetUserName?: string) => void;
}

const statusLabel = (s: Letter['status']) => ({
  draft: 'پیش‌نویس', in_review: 'در حال بررسی', needs_correction: 'نیاز به اصلاح', approved: 'تایید شده',
  sent: 'ارسال شده', seen: 'مشاهده شده', replied: 'پاسخ داده شده', archived: 'بایگانی شده', cancelled: 'لغو شده'
}[s]);

export const LettersView: React.FC<LettersViewProps> = ({
  letters,
  currentUser,
  users,
  onCreateLetter,
  onUpdateLetter,
  onSaveNewVersion,
  onForward
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const [tab, setTab] = useState<'dashboard' | 'sent' | 'received' | 'archive' | 'search'>('dashboard');

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [editingVersionLetter, setEditingVersionLetter] = useState<Letter | null>(null);
  const [replyToLetter, setReplyToLetter] = useState<Letter | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [printLetter, setPrintLetter] = useState<Letter | null>(null);

  // Search filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [attachmentOnly, setAttachmentOnly] = useState(false);

  const myLetters = useMemo(() => (isAdmin ? letters : letters.filter((l) => l.fromUserId === currentUser?.id)), [letters, currentUser, isAdmin]);
  const sentLetters = useMemo(() => myLetters.filter((l) => l.fromUserId === currentUser?.id && l.status !== 'archived').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [myLetters, currentUser]);
  const receivedLetters = useMemo(() => letters.filter((l) => l.toUserId === currentUser?.id && l.status !== 'archived').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [letters, currentUser]);
  const archivedLetters = useMemo(() => (isAdmin ? letters : letters.filter((l) => l.fromUserId === currentUser?.id || l.toUserId === currentUser?.id)).filter((l) => l.status === 'archived'), [letters, currentUser, isAdmin]);

  const stats = useMemo(() => {
    const relevant = isAdmin ? letters : letters.filter((l) => l.fromUserId === currentUser?.id || l.toUserId === currentUser?.id);
    const mostRecentDate = letters.length > 0 ? letters.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0].date : null;
    const todaysLetters = mostRecentDate ? relevant.filter((l) => l.date === mostRecentDate) : [];
    const unread = relevant.filter((l) => l.toUserId === currentUser?.id && !l.seenBy.some((s) => s.userId === currentUser?.id));
    const forwardedToMe = relevant.filter((l) => l.forwardHistory.some((f) => f.toUserId === currentUser?.id));
    const unanswered = relevant.filter((l) => l.fromUserId === currentUser?.id && ['sent', 'seen'].includes(l.status) && !letters.some((r) => r.parentLetterId === l.id));
    const overdue = relevant.filter((l) => ['sent', 'seen'].includes(l.status)); // simple heuristic: anything still open awaiting a reply
    const byUnit: Record<string, number> = {};
    relevant.forEach((l) => { byUnit[l.toUnit] = (byUnit[l.toUnit] || 0) + 1; });
    return { todaysLetters, unread, forwardedToMe, unanswered, overdue, byUnit };
  }, [letters, currentUser, isAdmin]);

  const searchResults = useMemo(() => {
    let list = isAdmin ? letters : letters.filter((l) => l.fromUserId === currentUser?.id || l.toUserId === currentUser?.id);
    if (q.trim()) {
      const query = q.trim();
      list = list.filter((l) =>
        l.letterNumber.includes(query) || l.subject.includes(query) || l.fromUserName.includes(query) ||
        (l.toUserName || '').includes(query) || l.body.includes(query)
      );
    }
    if (statusFilter !== 'all') list = list.filter((l) => l.status === statusFilter);
    if (unitFilter.trim()) list = list.filter((l) => l.toUnit.includes(unitFilter.trim()));
    if (tagFilter.trim()) list = list.filter((l) => l.tags.some((t) => t.includes(tagFilter.trim())));
    if (dateFrom) list = list.filter((l) => l.date >= dateFrom);
    if (dateTo) list = list.filter((l) => l.date <= dateTo);
    if (attachmentOnly) list = list.filter((l) => l.attachments.length > 0);
    return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [letters, currentUser, isAdmin, q, statusFilter, unitFilter, tagFilter, dateFrom, dateTo, attachmentOnly]);

  const handleExportCsv = () => {
    const headers = ['شماره نامه', 'نسخه', 'موضوع', 'از', 'به', 'وضعیت', 'تاریخ', 'برچسب‌ها', 'تعداد پیوست'];
    const csvEscape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = searchResults.map((l) => [
      l.letterNumber, l.currentVersion, l.subject, l.fromUserName, l.toUnit, statusLabel(l.status), l.date, l.tags.join('، '), l.attachments.length
    ].map((v) => csvEscape(String(v))).join(','));
    const csv = '\uFEFF' + [headers.map(csvEscape).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش-نامه‌ها-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getThread = (letter: Letter) => letters.filter((l) => l.threadId === letter.threadId).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const renderLetterRow = (l: Letter) => (
    <button key={l.id} onClick={() => setSelectedLetter(l)} className="w-full text-right p-3.5 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl transition cursor-pointer">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-lg">{l.letterNumber}</span>
          <span className="text-xs font-bold text-white">{l.subject}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">{statusLabel(l.status)}</span>
        </div>
        <span className="text-[10px] text-slate-500">{l.date}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
        <span>از {l.fromUserName}</span>
        <span>به {l.toUnit}</span>
        {l.attachments.length > 0 && <span>📎 {l.attachments.length}</span>}
        {l.versions.length > 1 && <span>V{l.currentVersion}</span>}
      </div>
    </button>
  );

  return (
    <div className="space-y-6 dir-rtl">
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">نامه‌نگاری داخلی (دبیرخانه)</h2>
            <p className="text-xs text-slate-400 mt-0.5">ثبت، ارجاع و پیگیری مکاتبات با واحد مالی، خزانه‌داری و سایر واحدها</p>
          </div>
        </div>
        <button onClick={() => setIsComposeOpen(true)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
          <Plus className="w-4 h-4" /> نامه جدید
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-0.5 flex-wrap">
        <button onClick={() => setTab('dashboard')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer ${tab === 'dashboard' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>داشبورد</button>
        <button onClick={() => setTab('sent')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 ${tab === 'sent' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}><Send className="w-3.5 h-3.5" /> نامه‌های من ({sentLetters.length})</button>
        <button onClick={() => setTab('received')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 ${tab === 'received' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
          <Inbox className="w-3.5 h-3.5" /> ارجاع‌شده به من
          {stats.unread.length > 0 && <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">{stats.unread.length}</span>}
        </button>
        <button onClick={() => setTab('search')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 ${tab === 'search' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}><Search className="w-3.5 h-3.5" /> جست‌وجوی پیشرفته</button>
        <button onClick={() => setTab('archive')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 ${tab === 'archive' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}><Archive className="w-3.5 h-3.5" /> بایگانی ({archivedLetters.length})</button>
      </div>

      {tab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock3 className="w-3 h-3" /> نامه‌های امروز</span>
              <p className="text-lg font-black text-white mt-1">{stats.todaysLetters.length}</p>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3" /> خوانده‌نشده</span>
              <p className="text-lg font-black text-white mt-1">{stats.unread.length}</p>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Forward className="w-3 h-3" /> نامه‌های ارجاعی</span>
              <p className="text-lg font-black text-white mt-1">{stats.forwardedToMe.length}</p>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><ReplyIcon className="w-3 h-3" /> پاسخ داده‌نشده</span>
              <p className="text-lg font-black text-white mt-1">{stats.unanswered.length}</p>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> نامه‌های معوق</span>
              <p className="text-lg font-black text-white mt-1">{stats.overdue.length}</p>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><FileEdit className="w-3 h-3" /> پیش‌نویس‌ها</span>
              <p className="text-lg font-black text-white mt-1">{sentLetters.filter((l) => l.status === 'draft').length}</p>
            </div>
          </div>

          {Object.keys(stats.byUnit).length > 0 && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <h3 className="text-xs font-black text-indigo-300 mb-3">نامه‌های هر واحد</h3>
              <div className="space-y-1.5">
                {Object.entries(stats.byUnit).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([unit, count]) => (
                  <div key={unit} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{unit}</span>
                    <span className="text-slate-500 font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-black text-indigo-300">آخرین نامه‌ها</h3>
            {sentLetters.slice(0, 5).map(renderLetterRow)}
          </div>
        </div>
      )}

      {tab === 'sent' && (
        <div className="space-y-2">
          {sentLetters.length === 0 && <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">هنوز نامه‌ای ثبت نکرده‌اید.</div>}
          {sentLetters.map(renderLetterRow)}
        </div>
      )}

      {tab === 'received' && (
        <div className="space-y-2">
          {receivedLetters.length === 0 && <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">نامه‌ای برای شما ارجاع نشده است.</div>}
          {receivedLetters.map(renderLetterRow)}
        </div>
      )}

      {tab === 'archive' && (
        <div className="space-y-2">
          {archivedLetters.length === 0 && <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">بایگانی خالی است.</div>}
          {archivedLetters.map(renderLetterRow)}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-[10px] font-bold text-slate-400">جست‌وجو (شماره، موضوع، فرستنده، گیرنده، متن)</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-8 pl-3 py-2 text-xs text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">وضعیت</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                <option value="all">همه</option>
                {(['draft','in_review','needs_correction','approved','sent','seen','replied','archived','cancelled'] as Letter['status'][]).map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">واحد</label>
              <input value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-28" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">برچسب</label>
              <input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-24" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">از تاریخ</label>
              <input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="1404/05/01" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-28" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">تا تاریخ</label>
              <input value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="1404/05/31" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-28" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <input type="checkbox" checked={attachmentOnly} onChange={(e) => setAttachmentOnly(e.target.checked)} className="w-4 h-4" />
              فقط دارای پیوست
            </label>
            <button onClick={handleExportCsv} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> خروجی Excel
            </button>
          </div>

          <div className="space-y-2">
            {searchResults.length === 0 && <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">نتیجه‌ای یافت نشد.</div>}
            {searchResults.map(renderLetterRow)}
          </div>
        </div>
      )}

      {isComposeOpen && (
        <LetterFormModal
          currentUser={currentUser}
          onClose={() => setIsComposeOpen(false)}
          onCreate={(l) => { onCreateLetter(l); setIsComposeOpen(false); }}
          onSaveNewVersion={onSaveNewVersion}
        />
      )}

      {editingVersionLetter && (
        <LetterFormModal
          currentUser={currentUser}
          editingLetter={editingVersionLetter}
          onClose={() => setEditingVersionLetter(null)}
          onCreate={onCreateLetter}
          onSaveNewVersion={(letter, subject, body, note) => { onSaveNewVersion(letter, subject, body, note); setEditingVersionLetter(null); setSelectedLetter(null); }}
        />
      )}

      {replyToLetter && (
        <LetterFormModal
          currentUser={currentUser}
          replyToLetter={replyToLetter}
          onClose={() => setReplyToLetter(null)}
          onCreate={(l) => { onCreateLetter(l); setReplyToLetter(null); setSelectedLetter(null); }}
          onSaveNewVersion={onSaveNewVersion}
        />
      )}

      {selectedLetter && (
        <LetterDetailModal
          letter={letters.find((l) => l.id === selectedLetter.id) || selectedLetter}
          thread={getThread(selectedLetter)}
          currentUser={currentUser}
          users={users}
          canManageLetters={true}
          onClose={() => setSelectedLetter(null)}
          onUpdateLetter={onUpdateLetter}
          onOpenVersionEdit={(l) => { setSelectedLetter(null); setEditingVersionLetter(l); }}
          onOpenReply={(l) => { setSelectedLetter(null); setReplyToLetter(l); }}
          onOpenPrint={(l) => setPrintLetter(l)}
          onOpenThreadLetter={(l) => setSelectedLetter(l)}
          onForward={onForward}
        />
      )}

      <LetterPrintModal letter={printLetter} isOpen={!!printLetter} onClose={() => setPrintLetter(null)} />
    </div>
  );
};
