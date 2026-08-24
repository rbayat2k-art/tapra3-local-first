import {useMemo, useState, type ReactNode} from 'react';
import {BadgeCheck, CheckCircle2, ClipboardCheck, Clock3, Eye, Search, XCircle} from 'lucide-react';
import {formatPersianDateTime} from './PersianDate';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import {FIELD_LABELS, ReviewDialog} from './MyAccountPage';
import type {FoundationState, PersonnelProfileChangeField, PersonnelProfileChangeRequest} from './model';
import type {FoundationExecutor} from './OrganizationPages';
import type {LocalFoundationService} from './service';

type QueueStatus = 'all' | PersonnelProfileChangeRequest['status'];

export function PersonnelChangeQueue({state, service, execute}: {state: FoundationState; service: LocalFoundationService; execute: FoundationExecutor}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<QueueStatus>('submitted');
  const [reviewRequest, setReviewRequest] = useState<PersonnelProfileChangeRequest | null>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fa-IR');
    return state.personnelProfileChangeRequests.filter((request) => {
      const personnel = state.personnel.find((item) => item.id === request.personnelId);
      const fields = Object.keys(request.requestedValues).map((field) => FIELD_LABELS[field as PersonnelProfileChangeField]).join(' ');
      const haystack = `${request.requesterName} ${request.trackingCode} ${personnel?.personnelCode ?? ''} ${fields}`.toLocaleLowerCase('fa-IR');
      return (!needle || haystack.includes(needle)) && (status === 'all' || request.status === status);
    });
  }, [query, status, state.personnelProfileChangeRequests, state.personnel]);
  const columns = useMemo<SortColumn<PersonnelProfileChangeRequest>[]>(() => [
    {key: 'requester', kind: 'text', value: (request) => request.requesterName},
    {key: 'tracking', kind: 'text', value: (request) => request.trackingCode},
    {key: 'changes', kind: 'number', value: (request) => Object.keys(request.requestedValues).length},
    {key: 'created', kind: 'date', value: (request) => request.createdAt},
    {key: 'status', kind: 'text', value: (request) => requestStatusLabel(request.status)},
    {key: 'reviewer', kind: 'text', value: (request) => request.reviewerName},
  ], []);
  const {sortedRows, sort, requestSort} = useSortableRows(rows, columns, 'created', 'desc');
  const pending = state.personnelProfileChangeRequests.filter((request) => request.status === 'submitted').length;
  const approved = state.personnelProfileChangeRequests.filter((request) => request.status === 'approved').length;
  const rejected = state.personnelProfileChangeRequests.filter((request) => request.status === 'rejected').length;

  return <div className="page-stack personnel-change-queue">
    <section className="org-metrics personnel-change-metrics">
      <QueueMetric value={pending} label="در انتظار بررسی" icon={<Clock3 size={19}/>}/>
      <QueueMetric value={approved} label="تأیید و اعمال‌شده" icon={<CheckCircle2 size={19}/>}/>
      <QueueMetric value={rejected} label="ردشده" icon={<XCircle size={19}/>}/>
      <QueueMetric value={state.personnelProfileChangeRequests.length} label="کل درخواست‌ها" icon={<ClipboardCheck size={19}/>}/>
    </section>
    <section className="org-panel personnel-change-panel">
      <div className="change-queue-heading"><span><ClipboardCheck size={22}/></span><div><h3>صف تغییرات اطلاعات پرسنلی</h3><p>درخواست‌های ثبت‌شده توسط کاربران، فقط با تصمیم نقش مجاز منابع انسانی روی پرونده اعمال می‌شوند.</p></div></div>
      <div className="customer-toolbar change-queue-toolbar">
        <label className="search-box"><Search size={18}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام، کد پیگیری، کد پرسنلی یا فیلد تغییرکرده"/></label>
        <select aria-label="وضعیت درخواست تغییر" value={status} onChange={(event) => setStatus(event.target.value as QueueStatus)}><option value="submitted">در انتظار بررسی</option><option value="all">همه وضعیت‌ها</option><option value="approved">تأییدشده</option><option value="rejected">ردشده</option></select>
      </div>
      <div className="enterprise-table personnel-change-table">
        <div className="enterprise-table-head"><span><SortHeader columnKey="requester" label="درخواست‌دهنده" sort={sort} onSort={requestSort}/></span><span><SortHeader columnKey="tracking" label="کد پیگیری" sort={sort} onSort={requestSort}/></span><span><SortHeader columnKey="changes" label="تغییرات" sort={sort} onSort={requestSort}/></span><span><SortHeader columnKey="created" label="زمان ثبت" sort={sort} onSort={requestSort}/></span><span><SortHeader columnKey="status" label="وضعیت" sort={sort} onSort={requestSort}/></span><span><SortHeader columnKey="reviewer" label="بررسی‌کننده" sort={sort} onSort={requestSort}/></span><span>اقدام‌ها</span></div>
        {sortedRows.map((request) => {
          const personnel = state.personnel.find((item) => item.id === request.personnelId);
          const fieldLabels = Object.keys(request.requestedValues).map((field) => FIELD_LABELS[field as PersonnelProfileChangeField]);
          return <article key={request.id} className="enterprise-table-row">
            <button type="button" className="record-identity" onClick={() => setReviewRequest(request)}><span className="record-avatar">{request.requesterName.slice(0, 2)}</span><span><strong>{request.requesterName}</strong><small>{personnel?.personnelCode ?? 'پرونده نامشخص'}</small></span></button>
            <span><b dir="ltr">{request.trackingCode}</b></span>
            <span><b>{fieldLabels.length.toLocaleString('en-US')} فیلد</b><small>{fieldLabels.join('، ')}</small></span>
            <span><b>{formatPersianDateTime(request.createdAt)}</b></span>
            <span><i className={`state-badge state-badge--${request.status === 'approved' ? 'good' : request.status === 'rejected' ? 'danger' : 'progress'}`}>{requestStatusLabel(request.status)}</i></span>
            <span><b>{request.reviewerName ?? '—'}</b>{request.reviewedAt && <small>{formatPersianDateTime(request.reviewedAt)}</small>}</span>
            <div className="user-actions"><button type="button" className="icon-action icon-action--primary" aria-label={request.status === 'submitted' ? 'بررسی درخواست تغییر' : 'مشاهده نتیجه درخواست'} data-tooltip={request.status === 'submitted' ? 'بررسی درخواست تغییر' : 'مشاهده نتیجه درخواست'} onClick={() => setReviewRequest(request)}><Eye size={17}/></button></div>
          </article>;
        })}
        {!sortedRows.length && <div className="table-empty"><Search size={22}/><strong>درخواستی با این فیلتر پیدا نشد</strong><span>عبارت جست‌وجو یا وضعیت انتخابی را تغییر دهید.</span></div>}
      </div>
    </section>
    {reviewRequest && <ReviewDialog request={reviewRequest} personnel={state.personnel.find((item) => item.id === reviewRequest.personnelId)} readOnly={reviewRequest.status !== 'submitted'} onClose={() => setReviewRequest(null)} onDecision={(decision, reason) => {void execute('profile-change-review', () => service.reviewProfileChangeRequest(reviewRequest.id, decision, reason, reviewRequest.version), decision === 'approved' ? 'درخواست تأیید و اطلاعات پرونده به‌روزرسانی شد.' : 'درخواست با ثبت دلیل رد شد.').then((succeeded) => {if (succeeded) setReviewRequest(null);});}}/>}
  </div>;
}

function QueueMetric({value, label, icon}: {value: number; label: string; icon: ReactNode}) {
  return <article><span>{icon}</span><div><strong>{value.toLocaleString('en-US')}</strong><small>{label}</small></div></article>;
}

function requestStatusLabel(status: PersonnelProfileChangeRequest['status']) {
  return status === 'approved' ? 'تأییدشده' : status === 'rejected' ? 'ردشده' : 'در انتظار بررسی';
}
