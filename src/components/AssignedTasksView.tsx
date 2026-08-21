import React, { useState } from 'react';
import { AssignedTask, User, TaskStatus, TaskPriority, TaskMessage } from '../types';
import { storage } from '../utils/storage';
import { getJalaliNow, getJalaliToday, generateAutoLetterNumber } from '../utils/persianDate';
import { 
  CheckSquare, Plus, Search, Filter, MessageSquare, Clock, 
  CheckCircle2, AlertTriangle, Send, Calendar, UserCheck, 
  FileText, ShieldAlert, ArrowLeft, Paperclip, ChevronRight, X,
  Edit3, Ban, RefreshCw, Sparkles
} from 'lucide-react';

interface AssignedTasksViewProps {
  currentUser: User | null;
  users: User[];
  tasks: AssignedTask[];
  onUpdateTask: (updatedTask: AssignedTask) => void;
  onCreateTask: (newTask: AssignedTask) => void;
}

export const AssignedTasksView: React.FC<AssignedTasksViewProps> = ({
  currentUser,
  users,
  tasks,
  onUpdateTask,
  onCreateTask
}) => {
  const [filterTab, setFilterTab] = useState<'my_assigned' | 'created_by_me' | 'all'>('my_assigned');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [selectedTask, setSelectedTask] = useState<AssignedTask | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState<boolean>(false);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState<boolean>(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState(users[0]?.id || '');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newDueDate, setNewDueDate] = useState('');
  const [newLetterNumber, setNewLetterNumber] = useState('');
  const [newLetterDate, setNewLetterDate] = useState('');

  // Edit task form state (Assigner modification)
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [editDueDate, setEditDueDate] = useState('');
  const [editLetterNumber, setEditLetterNumber] = useState('');
  const [editLetterDate, setEditLetterDate] = useState('');

  // Detail Modal Message State
  const [messageText, setMessageText] = useState('');
  const [messageLetterNumber, setMessageLetterNumber] = useState('');

  // Filter users eligible to receive & execute tasks (admin or canExecuteTasks === true)
  const eligibleAssignees = users.filter(u => u.role === 'admin' || u.canExecuteTasks === true);

  // Open New Task modal with automatic defaults
  const handleOpenNewTaskModal = () => {
    const today = getJalaliToday();
    const autoLetter = generateAutoLetterNumber(tasks.length + 101);
    setNewTitle('');
    setNewDescription('');
    setNewAssigneeId(eligibleAssignees[0]?.id || users[0]?.id || '');
    setNewPriority('normal');
    setNewDueDate(today);
    setNewLetterNumber(autoLetter);
    setNewLetterDate(today);
    setIsNewTaskModalOpen(true);
  };

  // Open Edit Task modal
  const handleOpenEditTaskModal = (task: AssignedTask) => {
    const foundAssignee = eligibleAssignees.find(u => u.id === task.assigneeId || u.fullName === task.assigneeName);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditAssigneeId(foundAssignee?.id || eligibleAssignees[0]?.id || users[0]?.id || '');
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate || getJalaliToday());
    setEditLetterNumber(task.letterNumber || generateAutoLetterNumber(tasks.length + 101));
    setEditLetterDate(task.letterDate || getJalaliToday());
    setIsEditTaskModalOpen(true);
  };

  // Check user permissions
  const isAdminUser = currentUser?.role === 'admin';
  const canIssueTasks = isAdminUser || currentUser?.canIssueTasks === true || currentUser?.customPermissions?.includes('manage_assigned_tasks');
  const canExecuteTasks = isAdminUser || currentUser?.canExecuteTasks === true || currentUser?.customPermissions?.includes('manage_assigned_tasks');

  const hasTaskAccess = canIssueTasks || canExecuteTasks;

  if (!currentUser) return null;

  if (!hasTaskAccess) {
    return (
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4 max-w-xl mx-auto my-12 dir-rtl shadow-2xl">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-3xl border border-rose-500/30 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-white">عدم داشتن دسترسی به کارهای محوله</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          دسترسی به بخش کارهای محوله و ابلاغ دستورات اداری توسط مدیر سیستم (ادمین) برای حساب شما فعال نشده است.
        </p>
      </div>
    );
  }

  // Privacy rule: a user may only ever see tasks where they are the assigner (issuer)
  // or the assignee (recipient) of that specific task - never the full system list,
  // regardless of role or permission level.
  const myVisibleTasks = tasks.filter(task =>
    task.assigneeId === currentUser.id || task.assigneeName === currentUser.fullName ||
    task.assignerId === currentUser.id || task.assignerName === currentUser.fullName
  );

  // Filtering tasks
  const filteredTasks = myVisibleTasks.filter(task => {
    // Role/Assignee tab filter
    if (filterTab === 'my_assigned') {
      if (task.assigneeId !== currentUser.id && task.assigneeName !== currentUser.fullName) return false;
    } else if (filterTab === 'created_by_me') {
      if (task.assignerId !== currentUser.id && task.assignerName !== currentUser.fullName) return false;
    }
    // filterTab === 'all' -> both tasks assigned to me and created by me (myVisibleTasks already scoped)

    // Status filter
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;

    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match = task.taskNumber.toLowerCase().includes(q) ||
                    task.title.toLowerCase().includes(q) ||
                    task.description.toLowerCase().includes(q) ||
                    task.assigneeName.toLowerCase().includes(q) ||
                    task.assignerName.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAssigneeId) {
      alert('لطفاً عنوان کار و شخص مسئول انجام را مشخص کنید.');
      return;
    }

    const assignee = users.find(u => u.id === newAssigneeId) || users[0];
    const now = getJalaliNow();
    const taskCount = tasks.length + 1;
    const taskNumber = `T100${taskCount}`;

    const newTask: AssignedTask = {
      id: `task_${Date.now()}`,
      taskNumber,
      title: newTitle.trim(),
      description: newDescription.trim() || 'دستور اداری محوله جهت پیگیری و اقدام',
      assignerId: currentUser.id,
      assignerName: currentUser.fullName,
      assignerRole: currentUser.roleTitle,
      assigneeId: assignee.id,
      assigneeName: assignee.fullName,
      assigneeRole: assignee.roleTitle,
      priority: newPriority,
      status: 'pending',
      dueDate: newDueDate || 'بدون مهلت تعیین شده',
      createdAt: now,
      updatedAt: now,
      letterNumber: newLetterNumber.trim() || undefined,
      letterDate: newLetterDate.trim() || undefined,
      messages: [
        {
          id: `msg_${Date.now()}`,
          senderId: currentUser.id,
          senderName: currentUser.fullName,
          senderRole: currentUser.roleTitle,
          content: `دستور کار جدید ایجاد گردید:\n${newDescription.trim() || 'ارسال شد جهت اقدام.'}`,
          letterNumber: newLetterNumber.trim() || undefined,
          letterDate: newLetterDate.trim() || undefined,
          timestamp: now
        }
      ],
      logs: [
        {
          id: `log_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          actionTitle: 'ایجاد و محول نمودن کار جدید',
          detail: `ابلاغ کار به ${assignee.fullName} (${assignee.roleTitle})`,
          timestamp: now
        }
      ]
    };

    onCreateTask(newTask);
    setIsNewTaskModalOpen(false);
    setNewTitle('');
    setNewDescription('');
    setNewDueDate('');
    setNewLetterNumber('');
    setNewLetterDate('');
    alert(`کار جدید با موفقیت ارجاع شد (کد پیگیری: ${taskNumber}).`);
  };

  const handleEditTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !editTitle.trim()) return;

    const assignee = users.find(u => u.id === editAssigneeId) || users[0];
    const now = getJalaliNow();

    const updatedTask: AssignedTask = {
      ...selectedTask,
      title: editTitle.trim(),
      description: editDescription.trim(),
      assigneeId: assignee.id,
      assigneeName: assignee.fullName,
      assigneeRole: assignee.roleTitle,
      priority: editPriority,
      dueDate: editDueDate || 'بدون مهلت تعیین شده',
      letterNumber: editLetterNumber.trim() || undefined,
      letterDate: editLetterDate.trim() || undefined,
      updatedAt: now,
      logs: [
        ...selectedTask.logs,
        {
          id: `log_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          actionTitle: 'اصلاح و ویرایش دستور اداری توسط صادرکننده',
          detail: `تغییرات در عنوان، توضیحات، مهلت یا مجری کار (${assignee.fullName})`,
          timestamp: now
        }
      ]
    };

    onUpdateTask(updatedTask);
    setSelectedTask(updatedTask);
    setIsEditTaskModalOpen(false);
    alert('دستور کار با موفقیت اصلاح و به‌روزرسانی شد.');
  };

  const handleCancelTask = (task: AssignedTask) => {
    if (!confirm('آیا از لغو و ابطال کامل این دستور اداری اطمینان دارید؟')) return;

    const now = getJalaliNow();
    const updatedTask: AssignedTask = {
      ...task,
      status: 'rejected',
      updatedAt: now,
      logs: [
        ...task.logs,
        {
          id: `log_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          actionTitle: 'لغو و ابطال کامل دستور اداری توسط صادرکننده',
          detail: 'کار از سوی صادرکننده ملغی گردید.',
          timestamp: now
        }
      ]
    };

    onUpdateTask(updatedTask);
    setSelectedTask(updatedTask);
    alert('دستور کار لغو شد.');
  };

  const handleSendMessage = (task: AssignedTask) => {
    if (!messageText.trim()) return;

    const now = getJalaliNow();
    const newMsg: TaskMessage = {
      id: `msg_${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      senderRole: currentUser.roleTitle,
      content: messageText.trim(),
      letterNumber: messageLetterNumber.trim() || undefined,
      timestamp: now
    };

    const updatedTask: AssignedTask = {
      ...task,
      messages: [...task.messages, newMsg],
      updatedAt: now,
      logs: [
        ...task.logs,
        {
          id: `log_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          actionTitle: 'ثبت یادداشت / پاسخنامه جدید',
          detail: messageLetterNumber.trim() ? `ارسال نامه/نامه اداری شماره ${messageLetterNumber.trim()}` : 'ثبت پیام مکاتبه ای',
          timestamp: now
        }
      ]
    };

    onUpdateTask(updatedTask);
    setSelectedTask(updatedTask);
    setMessageText('');
    setMessageLetterNumber('');
  };

  const handleStatusChange = (task: AssignedTask, newStatus: TaskStatus, statusTitle: string) => {
    const now = getJalaliNow();
    const updatedTask: AssignedTask = {
      ...task,
      status: newStatus,
      updatedAt: now,
      logs: [
        ...task.logs,
        {
          id: `log_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          actionTitle: `تغییر وضعیت کار: ${statusTitle}`,
          timestamp: now
        }
      ]
    };

    onUpdateTask(updatedTask);
    setSelectedTask(updatedTask);
  };

  const getPriorityBadge = (p: TaskPriority) => {
    if (p === 'immediate') return <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-[10px] font-bold animate-pulse">فوریت بسیار بالا (فوری)</span>;
    if (p === 'urgent') return <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-[10px] font-bold">فوریت بالا</span>;
    return <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-[10px] font-bold">عادی</span>;
  };

  const getStatusBadge = (s: TaskStatus) => {
    if (s === 'pending') return <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold">در انتظار شروع</span>;
    if (s === 'in_progress') return <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-[11px] font-bold">در حال انجام</span>;
    if (s === 'completed') return <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-[11px] font-bold">تکمیل شده (منتظر تایید)</span>;
    if (s === 'approved') return <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-[11px] font-bold">تایید نهایی شده</span>;
    return <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-[11px] font-bold">رد/عودت داده شده</span>;
  };

  return (
    <div className="space-y-6 dir-rtl animate-in fade-in duration-300">
      
      {/* Top Banner Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <CheckSquare className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-black text-white">مدیریت کارهای محوله و دستورات اداری</h2>
          </div>
          <p className="text-xs text-slate-400">
            سامانه ارجاع کار، ثبت مکاتبات اداری، چت، تاییدیه انجام و ثبت لوگ و تاریخ تمام مراحل
          </p>
        </div>

        {canIssueTasks ? (
          <button
            onClick={handleOpenNewTaskModal}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs rounded-2xl shadow-lg transition transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ارسال دستور / کار جدید</span>
          </button>
        ) : (
          <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>نقش کاربر: مجری (فاقد مجوز ثبت دستور جدید)</span>
          </div>
        )}
      </div>

      {/* Tabs Switcher: My Tasks vs Created By Me vs All */}
      <div className="p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center gap-1 shadow-inner max-w-xl mx-auto">
        <button
          onClick={() => setFilterTab('my_assigned')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            filterTab === 'my_assigned'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>کارهای ارجاع‌شده به من</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
            {tasks.filter(t => t.assigneeId === currentUser.id || t.assigneeName === currentUser.fullName).length}
          </span>
        </button>

        <button
          onClick={() => setFilterTab('created_by_me')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            filterTab === 'created_by_me'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>دستورات صادر شده توسط من</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
            {tasks.filter(t => t.assignerId === currentUser.id || t.assignerName === currentUser.fullName).length}
          </span>
        </button>

        <button
          onClick={() => setFilterTab('all')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            filterTab === 'all'
              ? 'bg-slate-800 text-white shadow scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>همه کارهای من</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-700 text-slate-300 font-bold">
            {myVisibleTasks.length}
          </span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در کد، عنوان، مسئول یا توضیحات..."
            className="w-full bg-slate-800 text-white text-xs rounded-xl pr-9 pl-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="pending">در انتظار شروع</option>
            <option value="in_progress">در حال انجام</option>
            <option value="completed">تکمیل شده (منتظر تایید)</option>
            <option value="approved">تایید نهایی شده</option>
            <option value="rejected">رد/عودت داده شده</option>
          </select>
        </div>

        <div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">همه اولویت‌ها</option>
            <option value="immediate">فوریت بسیار بالا (فوری)</option>
            <option value="urgent">فوریت بالا</option>
            <option value="normal">عادی</option>
          </select>
        </div>
      </div>

      {/* Task List Table with Mandatory Row Numbers (ردیف #) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 font-extrabold border-b border-slate-800">
              <tr>
                <th className="py-4 px-4 text-center w-12">ردیف</th>
                <th className="py-4 px-4">کد و عنوان کار</th>
                <th className="py-4 px-4">صادرکننده دستور</th>
                <th className="py-4 px-4">مسئول انجام (انجام‌دهنده)</th>
                <th className="py-4 px-4 text-center">اولویت</th>
                <th className="py-4 px-4 text-center">وضعیت</th>
                <th className="py-4 px-4 text-center">مهلت / تاریخ</th>
                <th className="py-4 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    هیچ کار محوله‌ای با مشخصات انتخابی پیدا نشد.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task, index) => (
                  <tr key={task.id} className="hover:bg-slate-800/40 transition">
                    {/* Mandatory Row Number */}
                    <td className="py-4 px-4 text-center font-mono font-bold text-slate-400 bg-slate-950/40">
                      {index + 1}
                    </td>

                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20 text-[11px]">
                            {task.taskNumber}
                          </span>
                          <span className="font-extrabold text-white">{task.title}</span>
                        </div>
                        {task.letterNumber && (
                          <span className="text-[10px] text-amber-300 font-mono block">
                            شماره نامه: {task.letterNumber} ({task.letterDate || '-'})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div>
                        <span className="font-bold text-slate-200 block">{task.assignerName}</span>
                        <span className="text-[10px] text-slate-400">{task.assignerRole}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div>
                        <span className="font-bold text-slate-200 block">{task.assigneeName}</span>
                        <span className="text-[10px] text-slate-400">{task.assigneeRole}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      {getPriorityBadge(task.priority)}
                    </td>

                    <td className="py-4 px-4 text-center">
                      {getStatusBadge(task.status)}
                    </td>

                    <td className="py-4 px-4 text-center text-[11px] font-mono text-slate-400">
                      {task.dueDate}
                    </td>

                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => setSelectedTask(task)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 mx-auto cursor-pointer"
                      >
                        <span>بررسی و چت</span>
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Task Modal */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full my-8 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">صدور دستور اداری و محول نمودن کار جدید</h3>
              </div>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  عنوان دستور / کار محوله <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  placeholder="مثلاً: استعلام قیمت تجهیزات شعبه سعادت‌آباد و ارسال گزارش"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  شخص ارجاع‌شونده (انجام‌دهنده) <span className="text-rose-400">*</span>
                </label>
                <select
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {eligibleAssignees.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">درجه فوریت کار</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="normal">عادی</option>
                    <option value="urgent">فوریت بالا</option>
                    <option value="immediate">فوریت بسیار بالا (فوری)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">مهلت انجام (تاریخ)</label>
                  <input
                    type="text"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    placeholder="مثلاً: ۱۴۰۳/۰۵/۲۰"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">شماره نامه اداری (تولید سیستمی)</label>
                    <button
                      type="button"
                      onClick={() => setNewLetterNumber(generateAutoLetterNumber(tasks.length + 101))}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>تولید مجدد</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newLetterNumber}
                    onChange={(e) => setNewLetterNumber(e.target.value)}
                    placeholder="مثلاً: ۱۰۲/۱۴۰۳/ب-۰۳:۵۷"
                    className="w-full bg-slate-800 text-amber-300 font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">تاریخ نامه (پیش‌فرض روز)</label>
                  <input
                    type="text"
                    value={newLetterDate}
                    onChange={(e) => setNewLetterDate(e.target.value)}
                    placeholder="مثلاً: ۱۴۰۳/۰۵/۱۰"
                    className="w-full bg-slate-800 text-white font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">متن کامل دستور و جزئیات کار</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="توضیحات تکمیلی و دستورالعمل‌های لازم را بنویسید..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl p-3 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex gap-2 justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow cursor-pointer transition"
                >
                  ثبت و ارجاع دستور
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal (Assigner Edit Option) */}
      {isEditTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full my-8 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">اصلاح و ویرایش دستور اداری توسط صادرکننده</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditTaskModalOpen(false)}
                className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditTaskSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  عنوان دستور / کار محوله <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  شخص ارجاع‌شونده (انجام‌دهنده) <span className="text-rose-400">*</span>
                </label>
                <select
                  value={editAssigneeId}
                  onChange={(e) => setEditAssigneeId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {eligibleAssignees.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">درجه فوریت کار</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="normal">عادی</option>
                    <option value="urgent">فوریت بالا</option>
                    <option value="immediate">فوریت بسیار بالا (فوری)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">مهلت انجام (تاریخ)</label>
                  <input
                    type="text"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-slate-800 text-white font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">شماره نامه اداری</label>
                    <button
                      type="button"
                      onClick={() => setEditLetterNumber(generateAutoLetterNumber(tasks.length + 101))}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>تولید مجدد</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editLetterNumber}
                    onChange={(e) => setEditLetterNumber(e.target.value)}
                    className="w-full bg-slate-800 text-amber-300 font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">تاریخ نامه</label>
                  <input
                    type="text"
                    value={editLetterDate}
                    onChange={(e) => setEditLetterDate(e.target.value)}
                    className="w-full bg-slate-800 text-white font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">متن دستور اداری</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl p-3 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex gap-2 justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow cursor-pointer transition"
                >
                  اعمال تغییرات و اصلاح دستور
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditTaskModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail & Chat / Action Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full my-6 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 font-mono font-black text-xs rounded-xl border border-indigo-500/30">
                  {selectedTask.taskNumber}
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">{selectedTask.title}</h3>
                  <span className="text-[11px] text-slate-400">
                    ارجاع داده‌شده از {selectedTask.assignerName} به {selectedTask.assigneeName}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[80vh] overflow-y-auto space-y-6">
              
              {/* Info Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 block font-bold">وضعیت کنونی:</span>
                  <div>{getStatusBadge(selectedTask.status)}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 block font-bold">اولویت / درجه فوریت:</span>
                  <div>{getPriorityBadge(selectedTask.priority)}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-400 block font-bold">مهلت / تاریخ ایجاد:</span>
                  <span className="text-xs font-mono font-bold text-white block">
                    {selectedTask.dueDate} (ایجاد: {selectedTask.createdAt})
                  </span>
                </div>
              </div>

              {/* Task Description Box */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>متن شرح کار / دستور صادر شده</span>
                </h4>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                  {selectedTask.description}
                </p>
              </div>

              {/* Status Action Buttons with Strict Role Separation */}
              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-3">
                
                {/* Assigner Controls */}
                {(selectedTask.assignerId === currentUser.id || selectedTask.assignerName === currentUser.fullName || currentUser.role === 'admin') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                    <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-indigo-400" />
                      <span>پنل درخواست‌دهنده کار (صادرکننده):</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditTaskModal(selectedTask)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>اصلاح و ویرایش دستور</span>
                      </button>

                      {selectedTask.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleCancelTask(selectedTask)}
                          className="px-3.5 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>لغو و ابطال درخواست</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Assignee Controls */}
                {(selectedTask.assigneeId === currentUser.id || selectedTask.assigneeName === currentUser.fullName || currentUser.role === 'admin') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                    <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span>پنل انجام‌دهنده کار (مجری):</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(selectedTask.status === 'pending' || selectedTask.status === 'rejected') && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(selectedTask, 'in_progress', 'شروع به انجام کار توسط مجری')}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>شروع کار</span>
                        </button>
                      )}

                      {selectedTask.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(selectedTask, 'approved', 'تایید نهایی و تکمیل کار توسط مجری')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تایید نهایی انجام کار</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Messaging & Correspondence (مکاتبات و چت) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-200 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span>سابقه پیام‌ها و مکاتبات اداری (رفت و برگشت)</span>
                </h4>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 max-h-60 overflow-y-auto">
                  {selectedTask.messages.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`p-3 rounded-2xl space-y-1.5 ${
                        msg.senderId === currentUser.id 
                          ? 'bg-indigo-950/80 border border-indigo-500/30 mr-6' 
                          : 'bg-slate-900 border border-slate-800 ml-6'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-extrabold text-indigo-300">
                          {msg.senderName} ({msg.senderRole})
                        </span>
                        <span className="text-slate-500 font-mono">{msg.timestamp}</span>
                      </div>
                      {msg.letterNumber && (
                        <div className="text-[10px] text-amber-300 font-mono font-bold bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-500/30 inline-block">
                          شماره نامه: {msg.letterNumber}
                        </div>
                      )}
                      <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Send Message Form */}
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={messageLetterNumber}
                      onChange={(e) => setMessageLetterNumber(e.target.value)}
                      placeholder="شماره نامه اداری (خودکار یا دستی)"
                      className="bg-slate-800 text-amber-300 text-xs rounded-xl px-3 py-1.5 border border-slate-700 w-56 font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setMessageLetterNumber(generateAutoLetterNumber(selectedTask.messages.length + 10))}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-xl cursor-pointer transition flex items-center gap-1 shrink-0"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      <span>تولید شماره نامه خودکار</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendMessage(selectedTask);
                        }
                      }}
                      placeholder="متن پیام، نامه یا گزارش خود را بنویسید..."
                      className="flex-1 bg-slate-800 text-white text-xs rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => handleSendMessage(selectedTask)}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>ارسال</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Task Audit Log (تاریخچه تغییرات و لوگ‌ها) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>سوابق و لوگ‌های ثبت‌شده (با تاریخ و زمان دقیق)</span>
                </h4>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  {selectedTask.logs.map((log, idx) => (
                    <div key={log.id} className="flex items-start gap-3 text-xs py-1.5 border-b border-slate-850 last:border-none">
                      <span className="font-mono text-slate-500 text-[10px] w-6 shrink-0 pt-0.5">#{idx + 1}</span>
                      <div className="flex-1">
                        <span className="font-bold text-white">{log.actionTitle}</span>
                        <span className="text-slate-400 text-[11px] block">
                          توسط: {log.actorName} ({log.actorRole}) {log.detail ? `- ${log.detail}` : ''}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal for Editing / Modifying Task by Assigner */}
      {isEditTaskModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full my-8 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
            
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">اصلاح و ویرایش دستور کار (صادرکننده)</h3>
              </div>
              <button
                onClick={() => setIsEditTaskModalOpen(false)}
                className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditTaskSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  عنوان دستور / کار محوله <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3.5 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  شخص ارجاع‌شونده (انجام‌دهنده کار)
                </label>
                <select
                  value={editAssigneeId}
                  onChange={(e) => setEditAssigneeId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">درجه فوریت کار</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="normal">عادی</option>
                    <option value="urgent">فوریت بالا</option>
                    <option value="immediate">فوریت بسیار بالا (فوری)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">مهلت انجام (تاریخ)</label>
                  <input
                    type="text"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    placeholder="۱۴۰۳/۰۵/۲۰"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">شماره نامه اداری</label>
                  <input
                    type="text"
                    value={editLetterNumber}
                    onChange={(e) => setEditLetterNumber(e.target.value)}
                    className="w-full bg-slate-800 text-amber-300 font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">تاریخ نامه</label>
                  <input
                    type="text"
                    value={editLetterDate}
                    onChange={(e) => setEditLetterDate(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">متن کامل دستور و شرح تغییرات</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl p-3 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex gap-2 justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow cursor-pointer transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ذخیره اصلاحات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditTaskModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
