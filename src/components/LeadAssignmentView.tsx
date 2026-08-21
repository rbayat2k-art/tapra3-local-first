import React, { useState } from 'react';
import { Lead, User, SystemRole, SystemPermission } from '../types';
import { canAssignLeadTo, canTransferLead, assignLead, drainSalespersonQueue, isTerminalLeadStatus } from '../utils/leadAssignment';
import { getSubordinateUserIds } from '../utils/salesHierarchy';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNow } from '../utils/persianDate';
import { Users2, Send, RefreshCw } from 'lucide-react';

interface LeadAssignmentViewProps {
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'جدید', pending_action: 'در انتظار اقدام', callback_scheduled: 'یادآوری تماس', overdue: 'عقب‌افتاده',
  in_negotiation: 'در حال مذاکره', ready_for_invoice: 'آمادهٔ صدور فاکتور', closed_won: 'بسته‌شده (برد)',
  closed_lost: 'بسته‌شده (باخت)', wrong_number: 'شماره اشتباه', complaint_blocked: 'مسدود (شکایت)'
};

export const LeadAssignmentView: React.FC<LeadAssignmentViewProps> = ({ leads, onUpdateLeads, users, currentUser, roles, effectivePermissions, impersonatorAdmin }) => {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [transferReason, setTransferReason] = useState<string>('');
  const [drainFromUserId, setDrainFromUserId] = useState<string>('');
  const [drainToUserId, setDrainToUserId] = useState<string>('');

  const canAssign = hasPermission(effectivePermissions, ['assign_sales_lead']);
  const canReassign = hasPermission(effectivePermissions, ['reassign_sales_lead']);
  const canDrain = hasPermission(effectivePermissions, ['drain_salesperson_queue']);
  const isUnrestrictedAssigner = hasPermission(effectivePermissions, ['configure_lead_assignment']);

  if (!currentUser) return null;
  if (!canAssign && !canReassign && !canDrain) {
    return <div className="p-6 text-slate-500">دسترسی لازم برای تخصیص/انتقال Lead را ندارید.</div>;
  }

  const territoryUserIds = new Set(getSubordinateUserIds(currentUser, users));
  // نقش‌های سلسله‌مراتب فروش با organizationalLevel مشخص می‌شوند (۱=فروشنده ... ۵=معاونت فروش) —
  // بازاستفاده از همان علامت‌گذاری موجود در DEFAULT_ROLES، نه یک فهرست موازی از roleId ها.
  const salesRoleIds = new Set(roles.filter((r) => r.organizationalLevel !== undefined).map((r) => r.id));
  const salesUsers = users.filter((u) =>
    u.id !== currentUser.id && u.isActive !== false &&
    (isUnrestrictedAssigner || territoryUserIds.has(u.id)) &&
    !!u.roleId && salesRoleIds.has(u.roleId)
  );

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  const handleAssign = () => {
    if (!selectedLead || !targetUserId) { alert('یک Lead و یک کاربر مقصد انتخاب کنید.'); return; }
    const target = users.find((u) => u.id === targetUserId);
    if (!target) return;

    const territoryCheck = canAssignLeadTo(currentUser, targetUserId, users, isUnrestrictedAssigner);
    if (territoryCheck.ok === false) { alert(territoryCheck.reason); return; }

    const requiredPermission = selectedLead.hadFirstContact ? canReassign : canAssign;
    if (!requiredPermission) { alert(selectedLead.hadFirstContact ? 'برای انتقال بعد از اولین تماس، مجوز اختصاصی انتقال لازم است.' : 'مجوز تخصیص Lead را ندارید.'); return; }

    const transferCheck = canTransferLead(selectedLead, canReassign, transferReason);
    if (transferCheck.ok === false) { alert(transferCheck.reason); return; }

    const now = getJalaliNow();
    const updatedLead = assignLead(selectedLead, target.id, target.fullName, { id: currentUser.id, fullName: currentUser.fullName }, now, transferReason.trim() || undefined);
    const updatedLeads = leads.map((l) => (l.id === selectedLead.id ? updatedLead : l));
    const tx = storage.saveCustomerIdentityTransaction({ leads: updatedLeads });
    if (tx.ok === false) {
      logAudit({ action: 'lead_assigned', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: selectedLead.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'lead_assigned', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: selectedLead.id, details: `به ${target.fullName} تخصیص/انتقال یافت` });
    onUpdateLeads(updatedLeads);
    setSelectedLeadId(''); setTargetUserId(''); setTransferReason('');
  };

  const handleDrain = () => {
    if (!canDrain) { alert('مجوز تخلیهٔ صف را ندارید.'); return; }
    if (!drainFromUserId || !drainToUserId) { alert('فروشندهٔ مبدأ و مقصد را انتخاب کنید.'); return; }
    const toUser = users.find((u) => u.id === drainToUserId);
    if (!toUser) return;
    const now = getJalaliNow();
    const { updatedLeads, drainedCount } = drainSalespersonQueue(leads, drainFromUserId, drainToUserId, toUser.fullName, { id: currentUser.id, fullName: currentUser.fullName }, now);
    const tx = storage.saveCustomerIdentityTransaction({ leads: updatedLeads });
    if (tx.ok === false) {
      logAudit({ action: 'salesperson_queue_drained', effectiveUser: currentUser, impersonatorAdmin, roles, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'salesperson_queue_drained', effectiveUser: currentUser, impersonatorAdmin, roles, details: `${drainedCount} Lead از ${drainFromUserId} به ${toUser.fullName} منتقل شد` });
    onUpdateLeads(updatedLeads);
    alert(`${drainedCount} Lead تخلیه و منتقل شد.`);
    setDrainFromUserId(''); setDrainToUserId('');
  };

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users2 className="w-5 h-5" /> تخصیص و انتقال Lead</h2>
        <p className="text-sm text-slate-500 mt-1">قبل از اولین تماس هر مدیر مجاز می‌تواند Lead را جابه‌جا کند؛ بعد از اولین تماس، انتقال فقط با دلیل و مجوز اختصاصی مجاز است.</p>
      </div>

      {(canAssign || canReassign) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">تخصیص/انتقال یک Lead</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={selectedLeadId} onChange={(e) => setSelectedLeadId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">-- انتخاب Lead --</option>
              {leads.filter((l) => !isTerminalLeadStatus(l.status)).map((l) => (
                <option key={l.id} value={l.id}>{l.trackingCode} — {STATUS_LABELS[l.status]} — مالک فعلی: {l.currentOwnerUserName || 'ندارد'}</option>
              ))}
            </select>
            <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">-- کاربر مقصد --</option>
              {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>)}
            </select>
            <input placeholder="دلیل انتقال (بعد از اولین تماس الزامی)" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          {selectedLead && selectedLead.hadFirstContact && (
            <p className="text-xs text-amber-600">این Lead قبلاً تماس اول را داشته — انتقال فقط با مجوز اختصاصی و ثبت دلیل انجام می‌شود.</p>
          )}
          <button onClick={handleAssign} className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Send className="w-4 h-4" /> تخصیص/انتقال
          </button>
        </div>
      )}

      {canDrain && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">تخلیهٔ صف فروشنده (برای فروشندهٔ غیرفعال/خروجی)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={drainFromUserId} onChange={(e) => setDrainFromUserId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">-- فروشندهٔ مبدأ --</option>
              {users.filter((u) => u.id !== currentUser.id).map((u) => <option key={u.id} value={u.id}>{u.fullName} {u.isActive === false ? '(غیرفعال)' : ''}</option>)}
            </select>
            <select value={drainToUserId} onChange={(e) => setDrainToUserId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">-- فروشندهٔ مقصد --</option>
              {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          <button onClick={handleDrain} className="flex items-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <RefreshCw className="w-4 h-4" /> تخلیهٔ صف و انتقال گروهی
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-slate-500 border-b border-slate-200">
              <th className="py-2 px-2">کد پیگیری</th><th className="py-2 px-2">وضعیت</th><th className="py-2 px-2">مالک فعلی</th>
              <th className="py-2 px-2">اولین تماس؟</th><th className="py-2 px-2">آخرین رویداد</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-2 font-mono">{l.trackingCode}</td>
                <td className="py-2 px-2">{STATUS_LABELS[l.status]}</td>
                <td className="py-2 px-2">{l.currentOwnerUserName || 'تخصیص‌نیافته'}</td>
                <td className="py-2 px-2">{l.hadFirstContact ? 'بله' : 'خیر'}</td>
                <td className="py-2 px-2 text-slate-500">{l.timeline[l.timeline.length - 1]?.title || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
