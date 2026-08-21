import React, { useState, useMemo } from 'react';
import { 
  User, DirectMessage, ChatMessage, Letter, PaymentRequest, SupportCase 
} from '../types';
import { 
  ShieldAlert, MessageSquare, Mail, CheckSquare, FileText, 
  Search, Filter, Download, User as UserIcon, Clock, Layers, Eye, RefreshCw, Lock
} from 'lucide-react';

interface AssignedTask {
  id: string;
  taskCode: string;
  title: string;
  description: string;
  assignedByUserId: string;
  assignedByName: string;
  assignedByRole: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedToRole: string;
  status: 'pending' | 'in_progress' | 'completed' | 'returned';
  createdAt: string;
  dueDate?: string;
  priority: 'normal' | 'high' | 'urgent';
  messages: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    letterNumber?: string;
    text: string;
    createdAt: string;
  }[];
}

interface AllCommunicationsAuditViewProps {
  currentUser: User | null;
  users: User[];
  directMessages: DirectMessage[];
  publicMessages: ChatMessage[];
  letters: Letter[];
  requests: PaymentRequest[];
  tasks: AssignedTask[];
  supportCases: SupportCase[];
}

type AuditCategory = 'all' | 'direct_chats' | 'public_chat' | 'letters' | 'tasks' | 'request_timeline' | 'support_notes';

interface AuditItem {
  id: string;
  type: AuditCategory;
  typeLabel: string;
  typeColor: string;
  title: string;
  senderName: string;
  senderRole?: string;
  recipientName?: string;
  timestamp: string;
  content: string;
  codeOrNumber?: string;
  extraInfo?: string;
}

export const AllCommunicationsAuditView: React.FC<AllCommunicationsAuditViewProps> = ({
  currentUser,
  users,
  directMessages,
  publicMessages,
  letters,
  requests,
  tasks,
  supportCases
}) => {
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // Convert all items into a unified AuditItem format
  const allAuditItems: AuditItem[] = useMemo(() => {
    const items: AuditItem[] = [];

    // 1. Direct Messages
    directMessages.forEach((dm) => {
      const sender = users.find((u) => u.id === dm.senderId);
      const recipient = users.find((u) => u.id === dm.recipientId);
      items.push({
        id: `dm_${dm.id}`,
        type: 'direct_chats',
        typeLabel: 'چت شخصی بین همکاران',
        typeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        title: `گفتگوی خصوصی: ${sender?.fullName || 'کاربر'} ↔ ${recipient?.fullName || 'کاربر'}`,
        senderName: sender?.fullName || 'ناشناس',
        senderRole: sender?.roleTitle,
        recipientName: recipient?.fullName || 'ناشناس',
        timestamp: dm.timestamp || (dm as any).createdAt || '',
        content: dm.content || (dm as any).text || (dm.attachment ? '[پیوست/فایل]' : ''),
        extraInfo: dm.readAt ? `خوانده شده در ${dm.readAt}` : 'هنوز خوانده نشده'
      });
    });

    // 2. Public Chat Messages
    publicMessages.forEach((pm) => {
      items.push({
        id: `pm_${pm.id}`,
        type: 'public_chat',
        typeLabel: 'چت عمومی خزانه‌داری',
        typeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        title: 'پیام گروهی کانال عمومی',
        senderName: pm.senderName || 'کاربر',
        senderRole: pm.senderRole,
        recipientName: 'همه‌ی پرسنل',
        timestamp: pm.timestamp || (pm as any).createdAt || '',
        content: pm.text || (pm as any).content || '',
      });
    });

    // 3. Letters
    letters.forEach((lettr) => {
      // Letter main body entry
      items.push({
        id: `let_${lettr.id}`,
        type: 'letters',
        typeLabel: 'نامه اداری ثبت شده',
        typeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        title: `موضوع نامه: ${lettr.subject}`,
        codeOrNumber: lettr.letterNumber,
        senderName: lettr.fromUserName,
        senderRole: lettr.fromRoleTitle,
        recipientName: lettr.toUnit,
        timestamp: `${lettr.date} - ${lettr.time}`,
        content: lettr.body,
        extraInfo: `وضعیت: ${lettr.status}`
      });

      // Letter versions and forwards
      lettr.forwardHistory?.forEach((fwd) => {
        items.push({
          id: `fwd_${fwd.id}`,
          type: 'letters',
          typeLabel: 'ارجاع نامه اداری',
          typeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
          title: `ارجاع نامه ${lettr.letterNumber} - ${lettr.subject}`,
          codeOrNumber: lettr.letterNumber,
          senderName: fwd.byUserName,
          recipientName: fwd.toUserName,
          timestamp: fwd.at,
          content: fwd.note || 'بدون یادداشت ارجاع'
        });
      });
    });

    // 4. Assigned Tasks & Messages
    tasks.forEach((tsk) => {
      items.push({
        id: `tsk_${tsk.id}`,
        type: 'tasks',
        typeLabel: 'دستور کار / task',
        typeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        title: `دستور کار: ${tsk.title}`,
        codeOrNumber: tsk.taskCode,
        senderName: tsk.assignedByName,
        senderRole: tsk.assignedByRole,
        recipientName: tsk.assignedToName,
        timestamp: tsk.createdAt,
        content: tsk.description,
        extraInfo: `اولویت: ${tsk.priority} | وضعیت: ${tsk.status}`
      });

      tsk.messages?.forEach((msg) => {
        items.push({
          id: `tsk_msg_${msg.id}`,
          type: 'tasks',
          typeLabel: 'مکاتبه دستور کار',
          typeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          title: `پیام دستور کار ${tsk.taskCode} (${tsk.title})`,
          codeOrNumber: msg.letterNumber || tsk.taskCode,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          timestamp: msg.createdAt,
          content: msg.text
        });
      });
    });

    // 5. Payment Requests Timeline Notes
    requests.forEach((req) => {
      req.timeline?.forEach((tl) => {
        if (tl.comment && tl.comment.trim()) {
          items.push({
            id: `tl_${tl.id}`,
            type: 'request_timeline',
            typeLabel: 'یادداشت درخواست پرداخت',
            typeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
            title: `درخواست ${req.trackingCode} - ${req.title}`,
            codeOrNumber: req.trackingCode,
            senderName: tl.actorName,
            senderRole: tl.actorRole,
            timestamp: tl.timestamp,
            content: `[اقدام: ${tl.actionTitle}] — ${tl.comment}`,
            extraInfo: `مبلغ: ${req.amount.toLocaleString()} ریال`
          });
        }
      });
    });

    // 6. Support Cases & Transaction Notes
    supportCases.forEach((sc) => {
      sc.transactions?.forEach((tx) => {
        if (tx.financialApproverNote) {
          items.push({
            id: `sc_tx_${tx.id}`,
            type: 'support_notes',
            typeLabel: 'یادداشت مالی خدمات/شکایات',
            typeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
            title: `پرونده پشتیبانی ${sc.caseCode} (فاکتور: ${tx.invoiceCode})`,
            codeOrNumber: sc.caseCode,
            senderName: tx.financialApproverName || 'تاییدکننده مالی',
            timestamp: tx.financialActionAt || sc.createdAt,
            content: tx.financialApproverNote,
          });
        }
      });
    });

    return items;
  }, [directMessages, publicMessages, letters, tasks, requests, supportCases, users]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    return allAuditItems
      .filter((item) => {
        // Privacy filter for non-admin users
        if (currentUser && currentUser.role !== 'admin') {
          const isParticipant = item.senderName === currentUser.fullName || item.recipientName === currentUser.fullName;
          const isPublicChat = item.type === 'public_chat';
          if (!isParticipant && !isPublicChat) {
            return false;
          }
        }

        // Category filter
        if (selectedCategory !== 'all' && item.type !== selectedCategory) return false;

        // User filter
        if (selectedUserFilter !== 'all') {
          const userObj = users.find(u => u.id === selectedUserFilter);
          const userName = userObj?.fullName || '';
          if (
            item.senderName !== userName &&
            item.recipientName !== userName
          ) {
            return false;
          }
        }

        // Search term
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const matchContent = (item.content || '').toLowerCase().includes(term);
          const matchTitle = (item.title || '').toLowerCase().includes(term);
          const matchSender = (item.senderName || '').toLowerCase().includes(term);
          const matchRecipient = (item.recipientName || '').toLowerCase().includes(term);
          const matchCode = (item.codeOrNumber || '').toLowerCase().includes(term);
          if (!matchContent && !matchTitle && !matchSender && !matchRecipient && !matchCode) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const tA = a.timestamp || '';
        const tB = b.timestamp || '';
        if (sortBy === 'newest') {
          return tB.localeCompare(tA);
        } else {
          return tA.localeCompare(tB);
        }
      });
  }, [allAuditItems, selectedCategory, selectedUserFilter, searchTerm, sortBy, users]);

  // Category Counts
  const counts = useMemo(() => {
    return {
      all: allAuditItems.length,
      direct_chats: allAuditItems.filter(i => i.type === 'direct_chats').length,
      public_chat: allAuditItems.filter(i => i.type === 'public_chat').length,
      letters: allAuditItems.filter(i => i.type === 'letters').length,
      tasks: allAuditItems.filter(i => i.type === 'tasks').length,
      request_timeline: allAuditItems.filter(i => i.type === 'request_timeline').length,
      support_notes: allAuditItems.filter(i => i.type === 'support_notes').length,
    };
  }, [allAuditItems]);

  const handleExportCSV = () => {
    const headers = ['نوع مکاتبه', 'عنوان/کد', 'فرستنده', 'گیرنده', 'تاریخ', 'متن پیام/مکاتبه'];
    const rows = filteredItems.map(item => [
      `"${item.typeLabel}"`,
      `"${item.codeOrNumber || item.title}"`,
      `"${item.senderName}"`,
      `"${item.recipientName || '-'}"`,
      `"${item.timestamp}"`,
      `"${item.content.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `مکاتبات_و_چت_های_پرسنل_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 dir-rtl text-right">
      
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-indigo-500 via-purple-500 to-emerald-500" />
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>پایگاه امنیتی و بازرسی مکاتبات سیستمی</span>
            </div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>کلیه مکاتبات اداری و چت‌های همکاران</span>
              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                مخصوص مدیریت ارشد و حراست
              </span>
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              این بخش به منظور شفافیت، امنیت اطلاعات و نظارت کامل بر پیام‌های شخصی همکاران، نامه‌های اداری، دستور کارها و یادداشت‌های پرداختی طراحی شده است. تمام مکاتبات با تاریخ دقیق و جزییات ثبت و قابل گزارش‌گیری می‌باشد.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl shadow-lg flex items-center gap-2 transition cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>خروجی اکسل گزارش نظارتی</span>
          </button>
        </div>
      </div>

      {/* Security Notice Alert */}
      <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-xs text-amber-200 flex items-start gap-3 shadow-md">
        <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">اطلاعیه سطح دسترسی امنیتی:</p>
          <p className="text-slate-300 text-[11.5px] leading-relaxed">
            مطابق قانون حریم خصوصی سازمانی، کلیه گفتگوهای شخصی چت همکاران، نامه‌ها، دستور کارها و پیام‌ها ثبت سیستم شده و صرفاً مدیریت ارشد به این داشبورد دسترسی دارد.
          </p>
        </div>
      </div>

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-slate-400 font-bold mb-1">کل مکاتبات ثبت‌شده</div>
          <div className="text-lg font-black text-white">{counts.all.toLocaleString()}</div>
        </div>
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-indigo-400 font-bold mb-1">چت‌های شخصی پرسنل</div>
          <div className="text-lg font-black text-indigo-300">{counts.direct_chats.toLocaleString()}</div>
        </div>
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-purple-400 font-bold mb-1">نامه‌ها و ارجاعات اداری</div>
          <div className="text-lg font-black text-purple-300">{counts.letters.toLocaleString()}</div>
        </div>
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-amber-400 font-bold mb-1">دستور کارها و وظایف</div>
          <div className="text-lg font-black text-amber-300">{counts.tasks.toLocaleString()}</div>
        </div>
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-sky-400 font-bold mb-1">کامنت‌های درخواست پرداخت</div>
          <div className="text-lg font-black text-sky-300">{counts.request_timeline.toLocaleString()}</div>
        </div>
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="text-[10px] text-emerald-400 font-bold mb-1">چت عمومی خزانه‌داری</div>
          <div className="text-lg font-black text-emerald-300">{counts.public_chat.toLocaleString()}</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          همه مکاتبات ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('direct_chats')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'direct_chats'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          💬 چت‌های شخصی همکاران ({counts.direct_chats})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('letters')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'letters'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          ✉️ نامه‌ها و ارجاعات اداری ({counts.letters})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('tasks')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'tasks'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          📋 دستور کارها و ارجاعات ({counts.tasks})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('request_timeline')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'request_timeline'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          💳 یادداشت‌های درخواست پرداخت ({counts.request_timeline})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('public_chat')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
            selectedCategory === 'public_chat'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          📢 چت عمومی خزانه‌داری ({counts.public_chat})
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در متن پیام، نام فرستنده، کد شماره نامه و..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-10 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter By User */}
        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="text-xs font-bold text-slate-400 shrink-0">فیلتر کاربر:</span>
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">همه کاربران سیستم</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
            ))}
          </select>
        </div>

        {/* Sort Order */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 shrink-0">مرتب‌سازی:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="newest">جدیدترین به قدیمی‌ترین</option>
            <option value="oldest">قدیمی‌ترین به جدیدترین</option>
          </select>
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">هیچ پیام یا مکاتبه‌ای با مشخصات درخواستی یافت نشد.</p>
            <p className="text-xs text-slate-500">کلمه کلیدی جستجو یا فیلتر کاربر را تغییر دهید.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800/90 rounded-2xl transition space-y-3 shadow-md"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg border ${item.typeColor}`}>
                    {item.typeLabel}
                  </span>
                  {item.codeOrNumber && (
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      کد: {item.codeOrNumber}
                    </span>
                  )}
                  <h3 className="text-xs font-bold text-white">{item.title}</h3>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-full border border-slate-800">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{item.timestamp}</span>
                </div>
              </div>

              {/* Sender and Recipient Info */}
              <div className="flex items-center gap-4 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/50 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-400">فرستنده:</span>
                  <span className="font-bold text-white">{item.senderName}</span>
                  {item.senderRole && <span className="text-[10px] text-slate-400">({item.senderRole})</span>}
                </div>

                {item.recipientName && (
                  <div className="flex items-center gap-1.5 border-r border-slate-800 pr-4">
                    <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-slate-400">گیرنده:</span>
                    <span className="font-bold text-white">{item.recipientName}</span>
                  </div>
                )}

                {item.extraInfo && (
                  <div className="mr-auto text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    {item.extraInfo}
                  </div>
                )}
              </div>

              {/* Content Body */}
              <div className="p-3 bg-slate-950/90 rounded-xl text-xs text-slate-200 leading-relaxed font-sans border border-slate-800/80 whitespace-pre-wrap">
                {item.content}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
