import React, { useState } from 'react';
import { Campaign, CampaignChannelType, User, SystemRole, SystemPermission } from '../types';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { getJalaliNow } from '../utils/persianDate';
import { Megaphone, Plus } from 'lucide-react';

interface CampaignsViewProps {
  campaigns: Campaign[];
  onUpdateCampaigns: (campaigns: Campaign[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const CHANNEL_LABELS: Record<CampaignChannelType, string> = {
  sms: 'پیامک', call: 'تماس', social: 'شبکه اجتماعی', web_form: 'فرم وب', referral: 'معرفی', other: 'سایر'
};

const emptyForm = {
  name: '', code: '', channelType: 'sms' as CampaignChannelType, startDate: '', endDate: '',
  leadGenerationMode: 'manual' as 'manual' | 'automatic', autoRuleKeyword: '', priority: 'normal' as 'low' | 'normal' | 'high'
};

export const CampaignsView: React.FC<CampaignsViewProps> = ({ campaigns, onUpdateCampaigns, currentUser, roles, effectivePermissions, impersonatorAdmin }) => {
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const canManage = hasPermission(effectivePermissions, ['manage_advertising_campaigns']);
  if (!currentUser) return null;
  if (!hasPermission(effectivePermissions, ['advertising_access', 'manage_advertising_campaigns', 'view_campaign_reports'])) {
    return <div className="p-6 text-slate-500">دسترسی لازم برای مشاهدهٔ کمپین‌ها را ندارید.</div>;
  }

  const handleCreate = () => {
    if (!canManage) { alert('مجوز مدیریت کمپین را ندارید.'); return; }
    if (!form.name.trim() || !form.code.trim()) { alert('نام و کد کمپین الزامی است.'); return; }
    const now = getJalaliNow();
    const newCampaign: Campaign = {
      id: `campaign_${Date.now()}`, name: form.name.trim(), code: form.code.trim(), channelType: form.channelType,
      startDate: form.startDate || undefined, endDate: form.endDate || undefined, status: 'active',
      leadGenerationMode: form.leadGenerationMode,
      autoRuleEnabled: form.leadGenerationMode === 'automatic' ? true : undefined,
      autoRuleKeyword: form.leadGenerationMode === 'automatic' ? (form.autoRuleKeyword.trim() || undefined) : undefined,
      priority: form.priority, createdAt: now, createdByUserId: currentUser.id, createdByUserName: currentUser.fullName
    };
    const updated = [newCampaign, ...campaigns];
    storage.saveCampaigns(updated);
    logAudit({ action: 'campaign_created', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: newCampaign.id, details: newCampaign.name });
    onUpdateCampaigns(updated);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleToggleStatus = (campaign: Campaign) => {
    if (!canManage) { alert('مجوز مدیریت کمپین را ندارید.'); return; }
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    const updated = campaigns.map((c) => (c.id === campaign.id ? { ...c, status: nextStatus as Campaign['status'] } : c));
    storage.saveCampaigns(updated);
    logAudit({ action: 'campaign_status_changed', effectiveUser: currentUser, impersonatorAdmin, roles, targetId: campaign.id, details: `${campaign.status} -> ${nextStatus}` });
    onUpdateCampaigns(updated);
  };

  return (
    <div className="space-y-6 dir-rtl" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Megaphone className="w-5 h-5" /> کمپین‌ها</h2>
          <p className="text-sm text-slate-500 mt-1">Lead فقط از دادهٔ دارای علاقهٔ خرید واقعی ساخته می‌شود، نه هر تعامل ورودی.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> کمپین جدید
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="نام کمپین *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="کد کمپین *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <select value={form.channelType} onChange={(e) => setForm({ ...form, channelType: e.target.value as CampaignChannelType })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="low">اولویت پایین</option><option value="normal">اولویت عادی</option><option value="high">اولویت بالا</option>
          </select>
          <input type="text" placeholder="تاریخ شروع" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input type="text" placeholder="تاریخ پایان" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <select value={form.leadGenerationMode} onChange={(e) => setForm({ ...form, leadGenerationMode: e.target.value as any })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="manual">تولید Lead: دستی</option>
            <option value="automatic">تولید Lead: خودکار (قاعده‌محور)</option>
          </select>
          {form.leadGenerationMode === 'automatic' && (
            <input placeholder="کلیدواژهٔ قاعدهٔ خودکار (مثال: قیمت)" value={form.autoRuleKeyword} onChange={(e) => setForm({ ...form, autoRuleKeyword: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          )}
          <div className="sm:col-span-2">
            <button onClick={handleCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">ثبت کمپین</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-slate-500 border-b border-slate-200">
              <th className="py-2 px-2">نام</th><th className="py-2 px-2">کد</th><th className="py-2 px-2">کانال</th>
              <th className="py-2 px-2">حالت تولید Lead</th><th className="py-2 px-2">وضعیت</th><th className="py-2 px-2">اپراتور</th>
              {canManage && <th className="py-2 px-2">عملیات</th>}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-2">{c.name}</td>
                <td className="py-2 px-2 font-mono">{c.code}</td>
                <td className="py-2 px-2">{CHANNEL_LABELS[c.channelType]}</td>
                <td className="py-2 px-2">{c.leadGenerationMode === 'automatic' ? `خودکار${c.autoRuleKeyword ? ` (${c.autoRuleKeyword})` : ''}` : 'دستی'}</td>
                <td className="py-2 px-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : c.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status === 'active' ? 'فعال' : c.status === 'paused' ? 'متوقف' : 'پایان‌یافته'}
                  </span>
                </td>
                <td className="py-2 px-2 text-slate-500">{c.advertisingOperatorName || '-'}</td>
                {canManage && (
                  <td className="py-2 px-2">
                    {c.status !== 'ended' && (
                      <button onClick={() => handleToggleStatus(c)} className="text-xs text-indigo-600 hover:text-indigo-800">
                        {c.status === 'active' ? 'توقف' : 'فعال‌سازی'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">کمپینی ثبت نشده.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
