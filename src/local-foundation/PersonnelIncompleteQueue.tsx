import {useMemo, useState} from 'react';
import {AlertTriangle, Files, Search, UserRoundCheck} from 'lucide-react';
import type {FoundationState, PersonnelRecord} from './model';
import {mayViewPersonnelCompletion, personnelCompletionSummary} from './personnelDocuments';

export function PersonnelIncompleteQueue({state, onOpen}: {state: FoundationState; onOpen: (personnel: PersonnelRecord) => void}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'profile' | 'documents'>('all');
  const rows = useMemo(() => state.personnel.flatMap((personnel) => {
    if (personnel.employmentStatus === 'ended' || !mayViewPersonnelCompletion(state.activeUser, personnel, state.users)) return [];
    const summary = personnelCompletionSummary(personnel, state.operationalRecords);
    if (summary.complete) return [];
    const haystack = `${personnel.firstName} ${personnel.lastName} ${personnel.personnelCode} ${state.units.find((item) => item.id === personnel.unitId)?.name ?? ''}`.toLocaleLowerCase('fa-IR');
    if (!haystack.includes(query.trim().toLocaleLowerCase('fa-IR'))) return [];
    if (kind === 'profile' && !summary.profileFields.length) return [];
    if (kind === 'documents' && !summary.documents.length) return [];
    return [{personnel, summary}];
  }), [state, query, kind]);

  return <section className="org-panel personnel-incomplete-queue">
    <header className="personnel-incomplete-queue__heading"><span><AlertTriangle size={21}/></span><div><strong>نواقص پرونده پرسنلی</strong><p>این فهرست ذخیره جداگانه ندارد و از اطلاعات و مدارک واقعیِ محدوده مجاز محاسبه می‌شود.</p></div><b>{rows.length.toLocaleString('en-US')} پرونده</b></header>
    <div className="customer-toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام، کد پرسنلی یا واحد"/></label><select aria-label="نوع نقص" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">همه نواقص</option><option value="profile">اطلاعات الزامی</option><option value="documents">مدارک اجباری</option></select></div>
    <div className="personnel-incomplete-list">{rows.map(({personnel, summary}) => <article key={personnel.id}><span className="record-avatar"><UserRoundCheck size={20}/></span><div><strong>{personnel.firstName} {personnel.lastName}</strong><small>{personnel.personnelCode} · {state.units.find((item) => item.id === personnel.unitId)?.name ?? 'واحد نامشخص'}</small></div><div className="personnel-incomplete-list__issues">{summary.profileFields.length > 0 && <span><AlertTriangle size={15}/>{summary.profileFields.length.toLocaleString('en-US')} اطلاعات ناقص</span>}{summary.documents.length > 0 && <span><Files size={15}/>{summary.documents.map((item) => item.label).join('، ')}</span>}</div><button type="button" className="button button--secondary" onClick={() => onOpen(personnel)}>بازکردن بخش مدارک</button></article>)}{!rows.length && <div className="compact-empty"><UserRoundCheck size={24}/><span>پرونده ناقصی با این فیلتر پیدا نشد.</span></div>}</div>
  </section>;
}
