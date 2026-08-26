import {useEffect, useId, useMemo, useRef, useState, type ReactNode} from 'react';
import type * as React from 'react';
import {
  BadgeCheck, BriefcaseBusiness, Building2, Check, ChevronLeft, CircleAlert,
  Copy, Eye, GitBranch, KeyRound, Network, Pencil, Plus, Power, Search, Shield, ShieldCheck, Trash2, UserCheck, UsersRound, UserX, X,
  type LucideIcon,
} from 'lucide-react';
import {can} from './authorization';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {SortHeader, useSortableRows, type SortColumn} from './Sorting';
import type {FoundationState, LocalUser, OrganizationalPosition, OrganizationalUnit, PermissionCode, ScopeType, SecurityRole} from './model';
import {PERMISSION_CATALOG} from './seed';
import {userConcurrencyToken, type LocalFoundationService, type PositionInput, type RoleInput, type UnitInput} from './service';
import {formatPersianDate, PersianDateInput, todayIsoDate} from './PersianDate';
import {personnelDisplayLabel, userDisplayLabel} from './personIdentity';
import {PRIMARY_ADMIN_USER_ID, PROTECTED_PERMISSION_CODES, PROTECTED_ROLE_IDS} from './accessPolicy';
import {activeActingManager, effectiveUnitManagerUserId, flattenOrganizationUnits, organizationPeopleForUnit, organizationStructureHealth, type OrganizationPerson} from './organizationStructure';
import {positionUsage} from './positionUsage';
import {permissionDomainLabel, roleAttentionLabel, roleInsight} from './roleInsights';

export type FoundationExecutor = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;

interface PageProps {state: FoundationState; service: LocalFoundationService; execute: FoundationExecutor;}

export function OrganizationOverviewPage({state}: Pick<PageProps, 'state'>) {
  const organizationalUnits = state.units.filter((unit) => unit.type !== 'شعبه');
  const activeUnits = organizationalUnits.filter((unit) => unit.status === 'active');
  const health = organizationStructureHealth(state);
  const activePeople = health.people;
  const peopleWithUnit = activePeople.filter((person) => person.unitId && activeUnits.some((unit) => unit.id === person.unitId)).length;
  const peopleWithPosition = activePeople.filter((person) => person.positionId && state.positions.some((position) => position.id === person.positionId && position.status === 'active')).length;
  const fullyAssigned = activePeople.filter((person) => person.unitId && person.positionId && activeUnits.some((unit) => unit.id === person.unitId) && state.positions.some((position) => position.id === person.positionId && position.status === 'active' && position.unitIds.includes(person.unitId!))).length;
  const coverage = Math.round((fullyAssigned / Math.max(activePeople.length, 1)) * 100);
  return <div className="page-stack">
    <OrgIntro icon={Network} eyebrow="سازمان / نمای سازمان" title="ساختار شرکت در یک نگاه" description="شرکت جاری به‌صورت ضمنی فعال است؛ واحدها، مسئولان و افراد بدون پیچیدگی چندشرکتی در یک نمای واحد دیده می‌شوند." />
    <section className="org-metrics">
      <OrgMetric icon={GitBranch} value={activeUnits.length} label="واحد فعال" detail={`${organizationalUnits.length - activeUnits.length} واحد غیرفعال`} />
      <OrgMetric icon={UsersRound} value={activePeople.length} label="پرسنل فعال" detail={`${peopleWithUnit.toLocaleString('en-US')} دارای واحد · ${peopleWithPosition.toLocaleString('en-US')} دارای سمت`} />
      <OrgMetric icon={BriefcaseBusiness} value={state.positions.filter((item) => item.status === 'active').length} label="سمت سازمانی" detail="مستقل از نقش دسترسی" />
      <OrgMetric icon={KeyRound} value={state.roles.filter((item) => item.status === 'active').length} label="نقش دسترسی" detail="منبع مجوزهای مؤثر" />
    </section>
    <div className="org-overview-grid">
      <section className="org-panel org-panel--wide">
        <OrgPanelHeading eyebrow="ساختار زنده" title="درخت سازمانی" text="هر شاخه یک واحد قابل‌ویرایش است و تعداد اعضا و مسئول آن را نشان می‌دهد." />
        <div className="org-tree">{flattenOrganizationUnits(organizationalUnits).filter((item) => item.depth === 0).map(({unit}) => <OrgTreeBranch key={unit.id} unit={unit} state={state} depth={0} />)}</div>
      </section>
      <section className="org-panel">
        <OrgPanelHeading eyebrow="کیفیت ساختار" title="پوشش اطلاعات سازمانی" text="رکوردهای ناقص به‌وضوح مشخص می‌شوند تا اصلاح ساختار ساده بماند." />
        <div className="coverage-ring" style={{'--coverage': `${coverage}%`} as React.CSSProperties}><strong>{coverage.toLocaleString('en-US')}٪</strong><span>پوشش انتساب</span></div>
        <div className="coverage-list"><span><i className="dot dot--green" /> واحد معتبر ثبت‌شده <b>{peopleWithUnit.toLocaleString('en-US')}</b></span><span><i className="dot dot--violet" /> سمت معتبر ثبت‌شده <b>{peopleWithPosition.toLocaleString('en-US')}</b></span><span><i className="dot dot--amber" /> هر دو مورد کامل <b>{fullyAssigned.toLocaleString('en-US')}</b></span><span><i className="dot dot--danger" /> واحد بدون مسئول فعال <b>{health.unitsWithoutActiveManager.toLocaleString('en-US')}</b></span>{health.invalidParents > 0 && <span><i className="dot dot--danger" /> رابطه بالادست نامعتبر <b>{health.invalidParents.toLocaleString('en-US')}</b></span>}</div>
      </section>
    </div>
    <section className="org-principle"><ShieldCheck size={24} /><div><strong>سمت سازمانی با نقش دسترسی یکی نیست</strong><p>واحد سازمانی و سمت سازمانی دو مفهوم مستقل برای توصیف جایگاه فرد هستند؛ نقش‌ها مجوز، محدوده و دسترسی مؤثر او را می‌سازند.</p></div></section>
  </div>;
}

export function UnitsPage({state, service, execute}: PageProps) {
  const organizationalUnits = state.units.filter((unit) => unit.type !== 'شعبه');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<OrganizationalUnit | 'new' | null>(null);
  const [selectedId, setSelectedId] = useState(organizationalUnits[0]?.id ?? '');
  const [confirmUnit, setConfirmUnit] = useState<OrganizationalUnit | null>(null);
  const selected = organizationalUnits.find((unit) => unit.id === selectedId);
  const mayManage = can(state.activeUser, 'organization.units.manage');
  const members = selected ? organizationPeopleForUnit(state, selected.id) : [];
  const flattenedUnits = useMemo(() => flattenOrganizationUnits(organizationalUnits), [organizationalUnits]);
  const visibleUnitIds = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fa');
    if (!normalizedQuery) return new Set(organizationalUnits.map((unit) => unit.id));
    const ids = new Set<string>();
    for (const unit of organizationalUnits) {
      const manager = state.users.find((user) => user.id === effectiveUnitManagerUserId(unit));
      if (!`${unit.name} ${unit.type} ${unit.description} ${manager ? userDisplayLabel(manager, state) : ''}`.toLocaleLowerCase('fa').includes(normalizedQuery)) continue;
      ids.add(unit.id);
      let parentId = unit.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {visited.add(parentId); ids.add(parentId); parentId = organizationalUnits.find((candidate) => candidate.id === parentId)?.parentId;}
    }
    return ids;
  }, [organizationalUnits, query, state]);
  const visibleUnits = flattenedUnits.filter(({unit}) => visibleUnitIds.has(unit.id));
  return <div className="page-stack">
    <OrgIntro icon={GitBranch} eyebrow="سازمان / واحدهای سازمانی" title="واحدهای سازمانی" description="ساختار سلسله‌مراتبی شرکت را بدون ایجاد چرخه مدیریت کنید و مسئول و اعضای هر واحد را ببینید." action={mayManage ? <button className="org-primary-action" onClick={() => setEditing('new')}><Plus size={18} /> واحد جدید</button> : undefined} />
    <section className="unit-layout">
      <div className="org-panel unit-list-panel">
        <div className="list-header"><div><strong>ساختار واحدها</strong><span>{organizationalUnits.length.toLocaleString('en-US')} واحد ثبت‌شده</span></div><span className="status-badge status-badge--active">تک‌شرکتی</span></div>
        <div className="unit-list-tools"><label className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام، نوع، مسئول یا توضیحات واحد"/></label><span className="unit-hierarchy-hint"><Network size={15}/> نمایش سلسله‌مراتبی</span></div>
        <div className="unit-list">{visibleUnits.map(({unit, depth}) => {
          const manager = state.users.find((user) => user.id === effectiveUnitManagerUserId(unit));
          const memberCount = organizationPeopleForUnit(state, unit.id).length;
          return <article key={unit.id} className={`unit-row ${selectedId === unit.id ? 'unit-row--selected' : ''}`} style={{'--tree-depth': depth} as React.CSSProperties}>
            <button className="unit-main" onClick={() => setSelectedId(unit.id)}><span className="unit-type-icon"><Building2 size={18} /></span><span><strong>{unit.name}</strong><small>{unit.type} · {manager ? compactUserLabel(manager) : 'بدون مسئول'} · {memberCount.toLocaleString('en-US')} عضو</small></span></button>
            <span className={`status-badge status-badge--${unit.status}`}>{unit.status === 'active' ? 'فعال' : 'غیرفعال'}</span>
            {mayManage && <div className="user-actions">
              <OrgIconAction label="ویرایش واحد" tone="primary" onClick={() => setEditing(unit)}><Pencil size={17} /></OrgIconAction>
              <OrgIconAction label={unit.status === 'active' ? 'غیرفعال‌سازی واحد' : 'فعال‌سازی واحد'} tone={unit.status === 'active' ? 'danger' : 'success'} onClick={() => unit.status === 'active' ? setConfirmUnit(unit) : execute('unit-status', () => service.setUnitStatus(unit.id, unit.updatedAt, 'active'), 'واحد فعال شد.')}><Power size={17} /></OrgIconAction>
            </div>}
          </article>;
        })}{!visibleUnits.length && <div className="empty-state unit-search-empty"><Search size={24}/><strong>واحدی پیدا نشد</strong><span>عبارت جست‌وجو را تغییر دهید.</span></div>}</div>
      </div>
      <aside className="org-panel unit-inspector">
        {selected ? <><div className="unit-inspector-head"><span className="unit-type-icon unit-type-icon--large"><Building2 size={22} /></span><div><small>{selected.type}</small><h3>{selected.name}</h3><p>{selected.description || 'توضیحی ثبت نشده است.'}</p></div></div><div className="inspector-data"><span>واحد بالادست<strong>{state.units.find((unit) => unit.id === selected.parentId)?.name ?? 'سطح اصلی'}</strong></span><span>{activeActingManager(selected) ? 'جانشین موقت' : 'مدیر دائم'}<strong>{managerLabel(effectiveUnitManagerUserId(selected), state)}</strong>{activeActingManager(selected) && <small>تا {formatPersianDate(selected.actingManager?.endsOn)}</small>}</span><span>تعداد اعضا<strong>{members.length.toLocaleString('en-US')} نفر</strong></span></div><div className="member-mini-list"><strong>اعضای این واحد</strong>{members.length ? members.map((person) => <OrganizationMemberRow key={person.id} person={person} state={state}/>) : <p>هنوز فردی به این واحد اختصاص داده نشده است.</p>}</div></> : <div className="empty-state"><CircleAlert size={25} /><strong>یک واحد را انتخاب کنید</strong></div>}
      </aside>
    </section>
    {editing && <UnitDialog unit={editing === 'new' ? undefined : editing} state={state} onClose={() => setEditing(null)} onSubmit={(input) => execute('unit-save', () => editing === 'new' ? service.createUnit(input) : service.updateUnit(editing.id, editing.updatedAt, input), editing === 'new' ? 'واحد سازمانی ایجاد شد.' : 'واحد سازمانی ویرایش شد.').then((succeeded) => {if (succeeded) setEditing(null);})} />}
    {confirmUnit && <ConfirmDialog icon={Power} title="غیرفعال‌سازی واحد" text={`واحد «${confirmUnit.name}» فقط زمانی غیرفعال می‌شود که عضو فعال یا زیرواحد فعال نداشته باشد.`} confirm="تأیید غیرفعال‌سازی" onClose={() => setConfirmUnit(null)} onConfirm={() => execute('unit-status', () => service.setUnitStatus(confirmUnit.id, confirmUnit.updatedAt, 'inactive'), 'واحد غیرفعال شد.').then((succeeded) => {if (succeeded) setConfirmUnit(null);})} />}
  </div>;
}

export function PositionsPage({state, service, execute}: PageProps) {
  const organizationalUnits = state.units.filter((unit) => unit.type !== 'شعبه');
  const [selectedUnitId, setSelectedUnitId] = useState(organizationalUnits.find((unit) => unit.status === 'active')?.id ?? '');
  const [unitQuery, setUnitQuery] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'active'|'in-use'|'unused'|'issues'>('all');
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [editing, setEditing] = useState<OrganizationalPosition | 'new' | null>(null);
  const [confirmPosition, setConfirmPosition] = useState<OrganizationalPosition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationalPosition | null>(null);
  const mayManage = can(state.activeUser, 'organization.positions.manage');
  const selectedUnit = organizationalUnits.find((unit) => unit.id === selectedUnitId);
  const visibleUnits = organizationalUnits.filter((unit) => unit.name.toLocaleLowerCase('fa').includes(unitQuery.trim().toLocaleLowerCase('fa')));
  const positionsInUnit = state.positions.filter((position) => position.unitIds.includes(selectedUnitId));
  const visiblePositions = useMemo(() => positionsInUnit.filter((position) => {
    const usage = positionUsage(state, position);
    const matchesQuery = `${position.title} ${position.description}`.toLocaleLowerCase('fa').includes(query.trim().toLocaleLowerCase('fa'));
    if (!matchesQuery) return false;
    if (filter === 'active') return position.status === 'active';
    if (filter === 'in-use') return usage.activePeopleInUnit(selectedUnitId).length > 0;
    if (filter === 'unused') return usage.activePeopleInUnit(selectedUnitId).length === 0;
    if (filter === 'issues') return usage.invalidActivePeople.length > 0 || (position.status === 'inactive' && usage.activePeople.length > 0) || usage.inactiveUnits > 0;
    return true;
  }), [filter, positionsInUnit, query, selectedUnitId, state]);
  const selectedPosition = state.positions.find((position) => position.id === selectedPositionId && position.unitIds.includes(selectedUnitId));
  useEffect(() => {
    if (selectedPositionId && visiblePositions.some((position) => position.id === selectedPositionId)) return;
    setSelectedPositionId(visiblePositions[0]?.id ?? '');
  }, [selectedPositionId, selectedUnitId, visiblePositions]);
  const assignedPeople = (position: OrganizationalPosition) => positionUsage(state, position).people.map((person) => person.personnel ? personnelDisplayLabel(person.personnel, state) : person.user ? userDisplayLabel(person.user, state) : person.id);
  const activePositions = positionsInUnit.filter((position) => position.status === 'active').length;
  const activeAssignments = positionsInUnit.reduce((count, position) => count + positionUsage(state, position).activePeopleInUnit(selectedUnitId).length, 0);
  const issueCount = positionsInUnit.filter((position) => {const usage=positionUsage(state,position);return usage.invalidActivePeople.length>0||(position.status==='inactive'&&usage.activePeople.length>0)||usage.inactiveUnits>0;}).length;
  return <div className="page-stack">
    <OrgIntro icon={BriefcaseBusiness} eyebrow="سازمان / واحدها و سمت‌ها" title="سمت‌های مجاز هر واحد" description="سمت، جایگاه سازمانی فرد است؛ افراد جاری، سوابق و واحدهای مجاز آن را پیش از هر تغییر بررسی کنید." action={mayManage ? <button className="org-primary-action" disabled={!selectedUnit || selectedUnit.status !== 'active'} title={selectedUnit?.status === 'inactive' ? 'برای واحد غیرفعال نمی‌توان سمت جدید ساخت.' : undefined} onClick={() => setEditing('new')}><Plus size={18}/> افزودن سمت به این واحد</button> : undefined}/>
    <section className="unit-position-catalog">
      <aside className="org-panel unit-position-catalog__units">
        <div className="list-header"><div><strong>واحدهای سازمانی</strong><span>{organizationalUnits.length.toLocaleString('en-US')} واحد</span></div></div>
        <label className="search-box"><Search size={17}/><input value={unitQuery} placeholder="جست‌وجوی واحد" onChange={(event) => setUnitQuery(event.target.value)}/></label>
        <div className="unit-position-catalog__unit-list">{visibleUnits.map((unit) => <button key={unit.id} className={unit.id === selectedUnitId ? 'active' : ''} onClick={() => setSelectedUnitId(unit.id)}><span><Building2 size={17}/><b>{unit.name}</b>{unit.status === 'inactive' && <small>غیرفعال</small>}</span><i>{state.positions.filter((position) => position.unitIds.includes(unit.id)).length.toLocaleString('en-US')}</i></button>)}{!visibleUnits.length && <SearchEmpty text="واحدی پیدا نشد."/>}</div>
      </aside>
      <div className="org-panel unit-position-catalog__positions">
        <div className="unit-position-catalog__heading"><div><small>واحد انتخاب‌شده</small><h3>{selectedUnit?.name ?? 'واحدی انتخاب نشده'}</h3><p>این سمت‌ها هنگام ساخت یا انتقال پرسنلِ همین واحد قابل انتخاب‌اند.</p></div><label className="search-box"><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="جست‌وجوی سمت یا شرح"/></label></div>
        <div className="position-catalog-metrics"><span><b>{positionsInUnit.length.toLocaleString('en-US')}</b><small>سمت تعریف‌شده</small></span><span><b>{activePositions.toLocaleString('en-US')}</b><small>سمت فعال</small></span><span><b>{activeAssignments.toLocaleString('en-US')}</b><small>انتساب فعال در واحد</small></span><span className={issueCount ? 'has-issue' : ''}><b>{issueCount.toLocaleString('en-US')}</b><small>نیازمند بررسی</small></span></div>
        <div className="position-filter-bar" aria-label="فیلتر سمت‌های سازمانی">{([
          ['all','همه'],['active','فعال'],['in-use','دارای فرد فعال'],['unused','بدون فرد فعال'],['issues','نیازمند بررسی'],
        ] as const).map(([id,label])=><button key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
        <div className="position-list-head unit-position-catalog__table-head"><span>ردیف</span><span>سمت سازمانی</span><span>شرح سمت</span><span>وضعیت</span><span>افراد</span><span>عملیات</span></div>
        <div className="position-list">{visiblePositions.map((position,index) => {const usage=positionUsage(state,position);const currentInUnit=usage.activePeopleInUnit(selectedUnitId);const hasIssue=usage.invalidActivePeople.length>0||(position.status==='inactive'&&usage.activePeople.length>0)||usage.inactiveUnits>0;return <article className={`position-row unit-position-catalog__row ${selectedPositionId===position.id?'position-row--selected':''}`} key={position.id}><span>{(index+1).toLocaleString('en-US')}</span><button className="position-row-identity" onClick={()=>setSelectedPositionId(position.id)} aria-label={`مشاهده جزئیات سمت ${position.title}`}><span><BriefcaseBusiness size={15}/></span><strong>{position.title}</strong>{hasIssue&&<small>نیازمند بررسی</small>}</button><p>{position.description||'شرحی ثبت نشده است.'}</p><span><i className={`status-badge status-badge--${position.status}`}>{position.status==='active'?'فعال':'غیرفعال'}</i></span><span className="position-assignment-count" title={`${usage.activePeople.length.toLocaleString('en-US')} انتساب فعال در همه واحدها · ${usage.historicalPeople.length.toLocaleString('en-US')} سابقه`}><UsersRound size={15}/><strong>{currentInUnit.length.toLocaleString('en-US')}</strong><small>فعال</small></span>{mayManage?<div className="position-row-actions"><OrgIconAction label="ویرایش سمت و واحدهای مجاز" tone="primary" onClick={()=>setEditing(position)}><Pencil size={16}/></OrgIconAction><OrgIconAction label={position.status==='active'?(usage.canDeactivate?'غیرفعال‌سازی سمت':`غیرفعال‌سازی ممکن نیست؛ ${usage.activePeople.length.toLocaleString('en-US')} فرد فعال دارد`):'فعال‌سازی سمت'} tone={position.status==='active'?'danger':'success'} disabled={position.status==='active'&&!usage.canDeactivate} onClick={()=>position.status==='active'?setConfirmPosition(position):execute('position-status',()=>service.setPositionStatus(position.id,position.updatedAt,'active'),'سمت فعال شد.')}><Power size={16}/></OrgIconAction><OrgIconAction label={usage.canDelete?'حذف سمت':`حذف ممکن نیست؛ ${usage.people.length.toLocaleString('en-US')} انتساب جاری یا تاریخی دارد`} tone="danger" disabled={!usage.canDelete} onClick={()=>setDeleteTarget(position)}><Trash2 size={16}/></OrgIconAction></div>:<span className="read-only-label">فقط مشاهده</span>}</article>;})}{!visiblePositions.length&&<SearchEmpty text={query||filter!=='all'?'سمتی با این فیلتر پیدا نشد.':'برای این واحد هنوز سمتی تعریف نشده است.'}/>}</div>
        {selectedPosition&&<PositionInspector position={selectedPosition} selectedUnitId={selectedUnitId} state={state} mayManage={mayManage} onEdit={()=>setEditing(selectedPosition)}/>}
      </div>
    </section>
    {editing&&<UnitPositionDialog
      position={editing==='new'?undefined:editing}
      initialUnitId={selectedUnitId}
      state={state}
      onClose={()=>setEditing(null)}
      onSubmit={(input)=>execute('position-save',()=>editing==='new'?service.createPosition(input):service.updatePosition(editing.id,editing.updatedAt,input),editing==='new'?'سمت برای واحد انتخابی ایجاد شد.':'سمت و واحدهای مجاز آن ویرایش شد.').then((ok)=>{if(ok)setEditing(null);})}
    />}
    {confirmPosition&&<ConfirmDialog
      icon={Power}
      title="غیرفعال‌سازی سمت"
      text={`سمت «${confirmPosition.title}» فقط در صورت نداشتن انتساب فعال غیرفعال می‌شود.`}
      confirm="تأیید غیرفعال‌سازی"
      onClose={()=>setConfirmPosition(null)}
      onConfirm={()=>execute('position-status',()=>service.setPositionStatus(confirmPosition.id,confirmPosition.updatedAt,'inactive'),'سمت غیرفعال شد.').then((ok)=>{if(ok)setConfirmPosition(null);})}
    />}
    {deleteTarget&&<PositionDeleteDialog
      position={deleteTarget}
      assignedPeople={assignedPeople(deleteTarget)}
      onClose={()=>setDeleteTarget(null)}
      onConfirm={()=>execute('position-delete',()=>service.deletePosition(deleteTarget.id,deleteTarget.updatedAt),'سمت حذف شد و سابقه آن در ممیزی باقی ماند.').then((ok)=>{if(ok)setDeleteTarget(null);})}
    />}
  </div>;
}

function LegacyPositionsPage({state, service, execute}: PageProps) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<OrganizationalPosition | 'new' | null>(null);
  const [confirmPosition, setConfirmPosition] = useState<OrganizationalPosition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationalPosition | null>(null);
  const mayManage = can(state.activeUser, 'organization.positions.manage');
  const positionSortColumns = useMemo<SortColumn<OrganizationalPosition>[]>(() => [
    {key: 'position', kind: 'text', value: (item) => item.title},
    {key: 'description', kind: 'text', value: (item) => item.description},
    {key: 'status', kind: 'text', value: (item) => item.status === 'active' ? 'فعال' : 'غیرفعال'},
    {key: 'assignments', kind: 'number', value: (item) => state.personnel.filter((person) => person.positionId === item.id).length + state.users.filter((user) => user.positionId === item.id && !user.personnelId).length},
    {key: 'updated', kind: 'date', value: (item) => item.updatedAt},
  ], [state.personnel, state.users]);
  const filteredPositions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fa-IR');
    if (!search) return state.positions;
    return state.positions.filter((position) => {
      const assignedNames = state.personnel.filter((person) => person.positionId === position.id).map((person) => personnelDisplayLabel(person,state)).concat(state.users.filter((user) => user.positionId === position.id).map((user) => userDisplayLabel(user,state)));
      return `${position.title} ${position.description} ${position.status === 'active' ? 'فعال' : 'غیرفعال'} ${assignedNames.join(' ')}`.toLocaleLowerCase('fa-IR').includes(search);
    });
  }, [query, state.personnel, state.positions, state.users]);
  const {sortedRows: sortedPositions, sort: positionSort, requestSort: requestPositionSort} = useSortableRows(filteredPositions, positionSortColumns, 'position', 'asc');
  return <div className="page-stack">
    <OrgIntro icon={BriefcaseBusiness} eyebrow="سازمان / سمت‌ها" title="سمت‌های سازمانی" description="سمت جایگاه فرد در ساختار سازمان است و هیچ مجوز امنیتی را به‌تنهایی ایجاد نمی‌کند." action={mayManage ? <button className="org-primary-action" onClick={() => setEditing('new')}><Plus size={18} /> سمت جدید</button> : undefined} />
    <section className="position-list-panel"><ListSearchToolbar value={query} onChange={setQuery} placeholder="جست‌وجوی نام، شرح، وضعیت یا افراد دارای سمت" count={filteredPositions.length} unit="سمت"/><div className="position-list-head"><span><SortHeader columnKey="position" label="سمت سازمانی" sort={positionSort} onSort={requestPositionSort}/></span><span><SortHeader columnKey="description" label="شرح سمت" sort={positionSort} onSort={requestPositionSort}/></span><span><SortHeader columnKey="status" label="وضعیت" sort={positionSort} onSort={requestPositionSort}/></span><span><SortHeader columnKey="assignments" label="افراد دارای این سمت" sort={positionSort} onSort={requestPositionSort}/></span><span><SortHeader columnKey="updated" label="آخرین تغییر" sort={positionSort} onSort={requestPositionSort}/></span><span>عملیات</span></div><div className="position-list">{sortedPositions.map((position) => {
      const personnel = state.personnel.filter((person) => person.positionId === position.id);
      const standaloneUsers = state.users.filter((user) => user.positionId === position.id && !user.personnelId);
      const assignmentCount = personnel.length + standaloneUsers.length;
      return <article className="position-row" key={position.id}><button className="position-row-identity" onClick={() => setEditing(position)}><span><BriefcaseBusiness size={15}/></span><strong>{position.title}</strong></button><p>{position.description || 'شرحی برای این سمت ثبت نشده است.'}</p><span><i className={`status-badge status-badge--${position.status}`}>{position.status === 'active' ? 'فعال' : 'غیرفعال'}</i></span><span className="position-assignment-count"><UsersRound size={15}/><strong>{assignmentCount.toLocaleString('en-US')}</strong><small>نفر</small></span><time>{formatPersianDate(position.updatedAt)}</time>{mayManage ? <div className="position-row-actions"><OrgIconAction label="ویرایش سمت" tone="primary" onClick={() => setEditing(position)}><Pencil size={16} /></OrgIconAction><OrgIconAction label={position.status === 'active' ? 'غیرفعال‌سازی سمت' : 'فعال‌سازی سمت'} tone={position.status === 'active' ? 'danger' : 'success'} onClick={() => position.status === 'active' ? setConfirmPosition(position) : execute('position-status', () => service.setPositionStatus(position.id, position.updatedAt, 'active'), 'سمت فعال شد.')}><Power size={16} /></OrgIconAction><OrgIconAction label={assignmentCount ? `حذف ممکن نیست؛ سمت به ${assignmentCount.toLocaleString('en-US')} نفر تخصیص دارد` : 'حذف سمت'} tone="danger" onClick={() => setDeleteTarget(position)}><Trash2 size={16}/></OrgIconAction></div> : <span className="read-only-label">فقط مشاهده</span>}</article>;
    })}{!sortedPositions.length && <SearchEmpty text="سمتی با این جست‌وجو پیدا نشد."/>}</div></section>
    {editing && <PositionDialog position={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSubmit={(input) => execute('position-save', () => editing === 'new' ? service.createPosition(input) : service.updatePosition(editing.id, editing.updatedAt, input), editing === 'new' ? 'سمت سازمانی ایجاد شد.' : 'سمت سازمانی ویرایش شد.').then((succeeded) => {if (succeeded) setEditing(null);})} />}
    {confirmPosition && <ConfirmDialog icon={Power} title="غیرفعال‌سازی سمت" text={`سمت «${confirmPosition.title}» در صورت نداشتن کاربر فعال، غیرفعال خواهد شد.`} confirm="تأیید غیرفعال‌سازی" onClose={() => setConfirmPosition(null)} onConfirm={() => execute('position-status', () => service.setPositionStatus(confirmPosition.id, confirmPosition.updatedAt, 'inactive'), 'سمت غیرفعال شد.').then((succeeded) => {if (succeeded) setConfirmPosition(null);})} />}
    {deleteTarget && <PositionDeleteDialog
      position={deleteTarget}
      assignedPeople={state.personnel.filter((person)=>person.positionId===deleteTarget.id).map((person)=>personnelDisplayLabel(person,state)).concat(state.users.filter((user)=>user.positionId===deleteTarget.id&&!user.personnelId).map((user)=>userDisplayLabel(user,state)))}
      onClose={()=>setDeleteTarget(null)}
      onConfirm={()=>execute('position-delete',()=>service.deletePosition(deleteTarget.id,deleteTarget.updatedAt),'سمت حذف شد و سابقه آن در ممیزی باقی ماند.').then((succeeded)=>{if(succeeded)setDeleteTarget(null);})}
    />}
  </div>;
}

export function RolesPage({state, service, execute}: PageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unused' | 'protected' | 'attention'>('all');
  const [editing, setEditing] = useState<SecurityRole | 'new' | null>(null);
  const [viewing, setViewing] = useState<SecurityRole | null>(null);
  const [assigning, setAssigning] = useState<SecurityRole | null>(null);
  const [confirmRole, setConfirmRole] = useState<SecurityRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecurityRole | null>(null);
  const mayManage = can(state.activeUser, 'organization.roles.manage');
  const mayAssign = can(state.activeUser, 'organization.roles.assign');
  const actorIsPrimaryAdmin = state.activeUser.id === PRIMARY_ADMIN_USER_ID;
  const roleInsights = useMemo(() => state.roles.map((role) => roleInsight(role, state.users, PERMISSION_CATALOG)), [state.roles, state.users]);
  const insightByRoleId = useMemo(() => new Map(roleInsights.map((insight) => [insight.role.id, insight])), [roleInsights]);
  const roleCounts = useMemo(() => ({
    all: roleInsights.length,
    assigned: roleInsights.filter((insight) => insight.users.length > 0).length,
    unused: roleInsights.filter((insight) => insight.attention.includes('unused')).length,
    protected: roleInsights.filter((insight) => insight.protectedAccess).length,
    attention: roleInsights.filter((insight) => insight.attention.length > 0).length,
  }), [roleInsights]);
  const roleSortColumns = useMemo<SortColumn<SecurityRole>[]>(() => [
    {key: 'role', kind: 'text', value: (item) => item.name},
    {key: 'description', kind: 'text', value: (item) => item.description},
    {key: 'status', kind: 'text', value: (item) => item.status === 'active' ? 'فعال' : 'غیرفعال'},
    {key: 'access', kind: 'number', value: (item) => item.permissions.length},
    {key: 'users', kind: 'number', value: (item) => state.users.filter((user) => user.roleIds.includes(item.id)).length},
  ], [state.users]);
  const filteredRoles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fa-IR');
    return state.roles.filter((role) => {
      const insight = insightByRoleId.get(role.id)!;
      if (filter === 'assigned' && !insight.users.length) return false;
      if (filter === 'unused' && !insight.attention.includes('unused')) return false;
      if (filter === 'protected' && !insight.protectedAccess) return false;
      if (filter === 'attention' && !insight.attention.length) return false;
      if (!search) return true;
      const permissionText = role.permissions.map(permissionLabel).join(' ');
      const domainText = insight.domains.map((domain) => domain.label).join(' ');
      const userText = insight.users.map((user) => userDisplayLabel(user, state)).join(' ');
      return `${role.name} ${role.description} ${scopeLabel(role.scope)} ${role.status === 'active' ? 'فعال' : 'غیرفعال'} ${permissionText} ${role.permissions.join(' ')} ${domainText} ${userText}`.toLocaleLowerCase('fa-IR').includes(search);
    });
  }, [filter, insightByRoleId, query, state]);
  const {sortedRows: sortedRoles, sort: roleSort, requestSort: requestRoleSort} = useSortableRows(filteredRoles, roleSortColumns, 'role', 'asc');
  return <div className="page-stack">
    <OrgIntro icon={KeyRound} eyebrow="سازمان / نقش‌ها و دسترسی‌ها" title="نقش‌ها و دسترسی‌ها" description="نام نقش به‌تنهایی هیچ اختیاری نمی‌دهد؛ مجوز، محدوده، سیاست رکورد و گارد گردش‌کار با هم دسترسی مؤثر را می‌سازند." action={mayManage && actorIsPrimaryAdmin ? <button className="org-primary-action" onClick={() => setEditing('new')}><Plus size={18} /> نقش جدید</button> : undefined} />
    <section className="access-formula"><span>نقش</span><ChevronLeft size={17} /><span>مجوز</span><ChevronLeft size={17} /><span>محدوده</span><ChevronLeft size={17} /><span>سیاست رکورد</span><ChevronLeft size={17} /><span>گارد گردش‌کار</span></section>
    <section className="role-health-metrics" aria-label="خلاصه سلامت نقش‌ها">
      <article><KeyRound size={18}/><span><strong>{roleCounts.all.toLocaleString('en-US')}</strong><small>کل نقش‌ها</small></span></article>
      <article><UsersRound size={18}/><span><strong>{roleCounts.assigned.toLocaleString('en-US')}</strong><small>دارای کاربر</small></span></article>
      <article><ShieldCheck size={18}/><span><strong>{roleCounts.protected.toLocaleString('en-US')}</strong><small>دسترسی حساس</small></span></article>
      <article className={roleCounts.attention ? 'has-issue' : ''}><CircleAlert size={18}/><span><strong>{roleCounts.attention.toLocaleString('en-US')}</strong><small>نیازمند بررسی</small></span></article>
    </section>
    <section className="role-list-panel">
      <div className="role-filter-bar" role="group" aria-label="فیلتر نقش‌ها">
        {([
          ['all', 'همه'], ['assigned', 'دارای کاربر'], ['unused', 'بدون استفاده'], ['protected', 'حساس'], ['attention', 'نیازمند بررسی'],
        ] as const).map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}><span>{label}</span><b>{roleCounts[id].toLocaleString('en-US')}</b></button>)}
      </div>
      <ListSearchToolbar value={query} onChange={setQuery} placeholder="جست‌وجوی نام نقش، شرح، محدوده، وضعیت یا مجوز" count={filteredRoles.length} unit="نقش"/>
      <div className="role-list-head"><span><SortHeader columnKey="role" label="نقش" sort={roleSort} onSort={requestRoleSort}/></span><span><SortHeader columnKey="description" label="شرح نقش" sort={roleSort} onSort={requestRoleSort}/></span><span><SortHeader columnKey="status" label="وضعیت" sort={roleSort} onSort={requestRoleSort}/></span><span><SortHeader columnKey="access" label="محدوده و مجوز" sort={roleSort} onSort={requestRoleSort}/></span><span><SortHeader columnKey="users" label="کاربران" sort={roleSort} onSort={requestRoleSort}/></span><span>عملیات</span></div>
      <div className="role-list">{sortedRoles.map((role) => {
      const insight = insightByRoleId.get(role.id)!;
      const users = insight.users;
      const protectedRole = insight.protectedAccess;
      const mayMutateRole = mayManage && (actorIsPrimaryAdmin || (!protectedRole && role.permissions.length === 0));
      const mayToggleAssignments = mayAssign && (actorIsPrimaryAdmin || !protectedRole);
      return <article className="role-row" key={role.id}>
        <button className="role-row-identity" onClick={() => setViewing(role)} aria-label={`مشاهده نقش ${role.name}`}><span className="role-row-icon"><KeyRound size={15} /></span><span><strong>{role.name}</strong>{role.protected && <small>پایه محافظت‌شده</small>}</span></button>
        <div className="role-row-description"><p>{role.description || 'شرحی برای این نقش ثبت نشده است.'}</p><span className="role-row-signals">{insight.domains.slice(0, 2).map((domain) => <i key={domain.id}>{domain.label}</i>)}{insight.attention.slice(0, 1).map((code) => <em key={code}><CircleAlert size={11}/>{roleAttentionLabel(code)}</em>)}</span></div>
        <span><i className={`status-badge status-badge--${role.status}`}>{role.status === 'active' ? 'فعال' : 'غیرفعال'}</i></span>
        <span className="role-row-access"><strong>{scopeLabel(role.scope)}</strong><small>{role.permissions.length.toLocaleString('en-US')} مجوز</small></span>
        <button className="role-row-users" onClick={() => setAssigning(role)} aria-label={`کاربران نقش ${role.name}`}><UsersRound size={15}/><strong>{users.length.toLocaleString('en-US')}</strong><small>کاربر</small></button>
        <div className="role-row-actions">
          <OrgIconAction label="ورود و مشاهده نقش" onClick={() => setViewing(role)}><Eye size={16}/></OrgIconAction>
          {mayToggleAssignments && <OrgIconAction label="مدیریت کاربران این نقش" tone="qa" onClick={() => setAssigning(role)}><UsersRound size={16}/></OrgIconAction>}
          {mayMutateRole && <><OrgIconAction label="ویرایش نقش و مجوزها" tone="primary" onClick={() => setEditing(role)}><Pencil size={16}/></OrgIconAction><OrgIconAction label="کپی نقش" onClick={() => execute('role-clone', () => service.cloneRole(role.id), 'یک کپی قابل‌ویرایش از نقش ساخته شد.')}><Copy size={16}/></OrgIconAction><OrgIconAction label={role.status === 'active' ? 'غیرفعال‌سازی نقش' : 'فعال‌سازی نقش'} tone={role.status === 'active' ? 'danger' : 'success'} disabled={role.id === 'role-admin' && role.status === 'active'} onClick={() => role.status === 'active' ? setConfirmRole(role) : execute('role-status', () => service.setRoleStatus(role.id, role.version ?? 1, 'active'), 'نقش فعال شد.')}><Power size={16}/></OrgIconAction><OrgIconAction label={role.protected ? 'نقش محافظت‌شده قابل حذف نیست' : users.length ? `حذف ممکن نیست؛ نقش به ${users.length.toLocaleString('en-US')} کاربر تخصیص دارد` : 'حذف نقش'} tone="danger" onClick={() => setDeleteTarget(role)}><Trash2 size={16}/></OrgIconAction></>}
        </div>
      </article>;
    })}{!sortedRoles.length && <SearchEmpty text="نقشی با این جست‌وجو پیدا نشد."/>}</div></section>
    {editing && <RoleDialog role={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSubmit={(input) => execute('role-save', () => editing === 'new' ? service.createRole(input) : service.updateRole(editing.id, editing.version ?? 1, input), editing === 'new' ? 'نقش دسترسی ایجاد شد.' : 'نقش و مجوزهای آن ویرایش شد.').then((succeeded) => {if (succeeded) setEditing(null);})} />}
    {viewing && <RoleDetailsDialog role={viewing} state={state} onClose={() => setViewing(null)} onEdit={mayManage && (actorIsPrimaryAdmin || (!PROTECTED_ROLE_IDS.has(viewing.id) && !viewing.permissions.some((permission) => PROTECTED_PERMISSION_CODES.has(permission)) && viewing.permissions.length === 0)) ? () => {setViewing(null);setEditing(viewing);} : undefined}/>}
    {assigning && <RoleAssignmentsDialog role={assigning} state={state} mayToggle={mayAssign && (actorIsPrimaryAdmin || (!PROTECTED_ROLE_IDS.has(assigning.id) && !assigning.permissions.some((permission) => PROTECTED_PERMISSION_CODES.has(permission))))} actorIsPrimaryAdmin={actorIsPrimaryAdmin} onClose={() => setAssigning(null)} onToggle={(user, checked) => {const roleIds = checked ? [...user.roleIds, assigning.id] : user.roleIds.filter((id) => id !== assigning.id); return execute('role-assignment', () => service.updateUser(user.id, userConcurrencyToken(user), {name: user.name, username: user.username, unitId: user.unitId, positionId: user.positionId, managerUserId: user.managerUserId, roleIds}), checked ? 'نقش به کاربر اضافه شد.' : 'نقش از کاربر حذف شد.');}} />}
    {confirmRole && <ConfirmDialog icon={Power} title="غیرفعال‌سازی نقش" text={`نقش «${confirmRole.name}» غیرفعال می‌شود و مجوزهای آن از دسترسی مؤثر کاربران حذف خواهد شد.`} confirm="تأیید غیرفعال‌سازی" onClose={() => setConfirmRole(null)} onConfirm={() => execute('role-status', () => service.setRoleStatus(confirmRole.id, confirmRole.version ?? 1, 'inactive'), 'نقش غیرفعال شد.').then((succeeded) => {if (succeeded) setConfirmRole(null);})} />}
    {deleteTarget && <RoleDeleteDialog
      role={deleteTarget}
      assignedUsers={state.users.filter((user)=>user.roleIds.includes(deleteTarget.id))}
      state={state}
      onClose={()=>setDeleteTarget(null)}
      onConfirm={()=>execute('role-delete',()=>service.deleteRole(deleteTarget.id,deleteTarget.version??1),'نقش حذف شد و سابقه آن در ممیزی باقی ماند.').then((succeeded)=>{if(succeeded)setDeleteTarget(null);})}
    />}
  </div>;
}

function UnitDialog({unit, state, onClose, onSubmit}: {unit?: OrganizationalUnit; state: FoundationState; onClose: () => void; onSubmit: (input: UnitInput) => void}) {
  const [name, setName] = useState(unit?.name ?? '');
  const [type, setType] = useState(unit?.type ?? 'واحد');
  const [parentId, setParentId] = useState(unit?.parentId ?? '');
  const [managerUserId, setManagerUserId] = useState(unit?.managerUserId ?? '');
  const [hasActingManager, setHasActingManager] = useState(Boolean(unit?.actingManager));
  const [actingManagerUserId, setActingManagerUserId] = useState(unit?.actingManager?.userId ?? '');
  const [actingManagerReason, setActingManagerReason] = useState(unit?.actingManager?.reason ?? '');
  const [actingManagerStartsOn, setActingManagerStartsOn] = useState(unit?.actingManager?.startsOn ?? todayIsoDate());
  const [actingManagerEndsOn, setActingManagerEndsOn] = useState(unit?.actingManager?.endsOn ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const permanentManagers = unit ? state.users.filter((user) => {
    if (user.status !== 'active') return false;
    const personnel = state.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
    return personnel?.employmentStatus === 'active' && personnel.unitId === unit.id;
  }) : [];
  const actingManagers = parentId ? state.users.filter((user) => {
    if (user.status !== 'active') return false;
    const personnel = state.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
    return personnel?.employmentStatus === 'active' && personnel.unitId === parentId;
  }) : [];
  const selectedPermanentManager = state.users.find((user) => user.id === managerUserId);
  const selectedActingManager = state.users.find((user) => user.id === actingManagerUserId);
  const submit = () => {
    const next = validateRequired([{label:'نام واحد', value:name, valid:(value)=>String(value).trim().length>=2, message:'فیلد «نام واحد» الزامی است و باید حداقل ۲ نویسه داشته باشد.'},{label:'نوع واحد', value:type, valid:(value)=>String(value).trim().length>=2, message:'فیلد «نوع واحد» الزامی است و باید حداقل ۲ نویسه داشته باشد.'}]);
    if(type.trim()==='شعبه') next.push('شعبه واحد سازمانی محسوب نمی‌شود؛ آن را از منوی «شعبه» ایجاد کنید.');
    if (hasActingManager) {
      if (!parentId) next.push('جانشین موقت فقط برای واحد دارای بالادست قابل ثبت است.');
      if (!actingManagerUserId) next.push('فرد جانشین موقت را انتخاب کنید.');
      if (actingManagerReason.trim().length < 5) next.push('دلیل جانشینی موقت را حداقل در ۵ نویسه بنویسید.');
      if (!actingManagerStartsOn || !actingManagerEndsOn) next.push('تاریخ شروع و پایان جانشینی موقت را کامل کنید.');
      else if (actingManagerStartsOn > actingManagerEndsOn) next.push('تاریخ پایان جانشینی باید بعد از تاریخ شروع باشد.');
    }
    setErrors(next);
    if (!next.length) onSubmit({name, type, parentId: parentId || undefined, managerUserId: managerUserId || undefined, actingManagerUserId: hasActingManager ? actingManagerUserId || undefined : undefined, actingManagerReason: hasActingManager ? actingManagerReason : undefined, actingManagerStartsOn: hasActingManager ? actingManagerStartsOn : undefined, actingManagerEndsOn: hasActingManager ? actingManagerEndsOn : undefined, description});
  };
  const unitTypeOptions = [...new Set(['مدیریت', 'معاونت', 'واحد', 'دپارتمان', 'تیم', type].filter(Boolean))];
  return <OrgModal onClose={onClose}><DialogHeading eyebrow="واحد سازمانی" title={unit ? 'ویرایش واحد' : 'ایجاد واحد جدید'} text="مدیر دائم باید عضو همین واحد باشد؛ جانشین موقت فقط از واحد بالادست و با بازه زمانی مشخص انتخاب می‌شود." onClose={onClose} /><div className="org-form-grid"><FormValidationSummary errors={errors}/><Field label="نام واحد" required><input aria-required="true" aria-invalid={Boolean(errors.length)&&name.trim().length<2} autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="نوع واحد" required><select aria-required="true" aria-invalid={Boolean(errors.length)&&type.trim().length<2} value={type} onChange={(event) => setType(event.target.value)}><option value="">انتخاب کنید</option>{unitTypeOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></Field><Field label="واحد بالادست"><select value={parentId} onChange={(event) => {setParentId(event.target.value);setActingManagerUserId('');if(!event.target.value)setHasActingManager(false);}}><option value="">سطح اصلی</option>{state.units.filter((item) => item.id !== unit?.id && item.status === 'active' && item.type !== 'شعبه').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="مدیر دائم"><select value={managerUserId} disabled={!unit} onChange={(event) => setManagerUserId(event.target.value)}><option value="">تعیین نشده</option>{selectedPermanentManager&&!permanentManagers.some((user)=>user.id===selectedPermanentManager.id)&&<option value={selectedPermanentManager.id}>{userDisplayLabel(selectedPermanentManager,state)} — نیازمند اصلاح جایگاه</option>}{permanentManagers.map((user) => <option key={user.id} value={user.id}>{userDisplayLabel(user,state)}</option>)}</select><small>{unit ? 'فقط افراد فعال همین واحد نمایش داده می‌شوند.' : 'پس از ایجاد واحد و انتقال فرد به آن، مدیر دائم را تعیین کنید.'}</small></Field><label className="check-field field-label--full"><input type="checkbox" checked={hasActingManager} disabled={!unit || !parentId} onChange={(event) => setHasActingManager(event.target.checked)}/><span><strong>ثبت جانشین موقت از واحد بالادست</strong><small>جانشینی در پایان تاریخ تعیین‌شده خودکار خاتمه می‌یابد و مدیر دائم تغییر نمی‌کند.</small></span></label>{hasActingManager && <><Field label="فرد جانشین" required full><select aria-required="true" value={actingManagerUserId} onChange={(event) => setActingManagerUserId(event.target.value)}><option value="">انتخاب فرد فعال واحد بالادست</option>{selectedActingManager&&!actingManagers.some((user)=>user.id===selectedActingManager.id)&&<option value={selectedActingManager.id}>{userDisplayLabel(selectedActingManager,state)} — نیازمند اصلاح جایگاه</option>}{actingManagers.map((user) => <option key={user.id} value={user.id}>{userDisplayLabel(user,state)}</option>)}</select></Field><Field label="تاریخ شروع جانشینی" required><PersianDateInput value={actingManagerStartsOn} required onChange={setActingManagerStartsOn} ariaLabel="تاریخ شمسی شروع جانشینی موقت" /></Field><Field label="تاریخ پایان جانشینی" required><PersianDateInput value={actingManagerEndsOn} min={actingManagerStartsOn} required onChange={setActingManagerEndsOn} ariaLabel="تاریخ شمسی پایان جانشینی موقت" /></Field><Field label="دلیل جانشینی" required full><textarea aria-required="true" rows={3} value={actingManagerReason} onChange={(event) => setActingManagerReason(event.target.value)} placeholder="مثلاً مرخصی مدیر، مأموریت یا فاصله تا انتصاب مدیر جدید" /></Field></>}<Field label="توضیحات" full><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><DialogActions onClose={onClose} submit={unit ? 'ذخیره تغییرات' : 'ایجاد واحد'} onSubmit={submit} /></OrgModal>;
}

function UnitPositionDialog({position,initialUnitId,state,onClose,onSubmit}:{position?:OrganizationalPosition;initialUnitId:string;state:FoundationState;onClose:()=>void;onSubmit:(input:PositionInput)=>void}) {
  const [title,setTitle]=useState(position?.title??'');
  const [description,setDescription]=useState(position?.description??'');
  const [unitIds,setUnitIds]=useState<string[]>(position?.unitIds??(initialUnitId?[initialUnitId]:[]));
  const [unitQuery,setUnitQuery]=useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const units=state.units.filter((unit)=>unit.type!=='شعبه'&&(unit.status==='active'||Boolean(position?.unitIds.includes(unit.id)))&&unit.name.toLocaleLowerCase('fa').includes(unitQuery.trim().toLocaleLowerCase('fa')));
  const submit=()=>{const next=validateRequired([{label:'عنوان سمت',value:title,valid:(value)=>String(value).trim().length>=2,message:'عنوان سمت باید حداقل ۲ نویسه داشته باشد.'},{label:'حداقل یک واحد مجاز',value:unitIds,valid:(value)=>Array.isArray(value)&&value.length>0,message:'حداقل یک واحد سازمانی مجاز برای این سمت انتخاب کنید.'}]);setErrors(next);if(!next.length)onSubmit({title,description,unitIds});};
  return <OrgModal onClose={onClose}><DialogHeading eyebrow="کاتالوگ واحد و سمت" title={position?'ویرایش سمت و واحدهای مجاز':'افزودن سمت به واحد'} text="این تنظیم تعیین می‌کند سمت در فرم کدام واحدها قابل انتخاب باشد؛ هیچ دسترسی امنیتی ایجاد نمی‌کند." onClose={onClose}/><div className="org-form-grid"><FormValidationSummary errors={errors}/><Field label="عنوان سمت" full required><input aria-required="true" aria-invalid={Boolean(errors.length)&&title.trim().length<2} autoFocus value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="برای نمونه: انباردار"/></Field><Field label="شرح سمت" full><textarea value={description} onChange={(event)=>setDescription(event.target.value)}/></Field><Field label="واحدهای سازمانی مجاز" full required><div className="position-unit-picker"><label className="search-box"><Search size={16}/><input value={unitQuery} onChange={(event)=>setUnitQuery(event.target.value)} placeholder="جست‌وجوی واحد"/></label><div>{units.map((unit)=><label className={unit.status==='inactive'?'inactive':''} key={unit.id}><input type="checkbox" checked={unitIds.includes(unit.id)} onChange={(event)=>setUnitIds((current)=>event.target.checked?[...current,unit.id]:current.filter((id)=>id!==unit.id))}/><span><Building2 size={16}/><b>{unit.name}</b>{unit.status==='inactive'&&<small>غیرفعال؛ از فهرست مجاز حذف شود</small>}</span></label>)}</div><small>{unitIds.length.toLocaleString('en-US')} واحد انتخاب شده است.</small></div></Field></div><DialogActions onClose={onClose} submit={position?'ذخیره تغییرات':'ایجاد سمت'} onSubmit={submit}/></OrgModal>;
}

function PositionDialog({position, onClose, onSubmit}: {position?: OrganizationalPosition; onClose: () => void; onSubmit: (input: PositionInput) => void}) { const [title, setTitle] = useState(position?.title ?? ''); const [description, setDescription] = useState(position?.description ?? ''); const [errors,setErrors]=useState<string[]>([]); const submit=()=>{const next=validateRequired([{label:'عنوان سمت',value:title,valid:(value)=>String(value).trim().length>=2,message:'فیلد «عنوان سمت» الزامی است و باید حداقل ۲ نویسه داشته باشد.'}]);setErrors(next);if(!next.length)onSubmit({title,description,unitIds:position?.unitIds??[]});}; return <OrgModal onClose={onClose}><DialogHeading eyebrow="سمت سازمانی" title={position ? 'ویرایش سمت' : 'ایجاد سمت جدید'} text="سمت فقط جایگاه سازمانی است و هیچ مجوز امنیتی ایجاد نمی‌کند." onClose={onClose} /><div className="org-form-grid"><FormValidationSummary errors={errors}/><Field label="عنوان سمت" full required><input aria-required="true" aria-invalid={Boolean(errors.length)&&title.trim().length<2} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="برای نمونه: سرپرست عملیات" /></Field><Field label="شرح سمت" full><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><DialogActions onClose={onClose} submit={position ? 'ذخیره تغییرات' : 'ایجاد سمت'} onSubmit={submit} /></OrgModal>; }

function PositionDeleteDialog({position,assignedPeople,onClose,onConfirm}:{position:OrganizationalPosition;assignedPeople:string[];onClose:()=>void;onConfirm:()=>void}) {const blocked=assignedPeople.length>0;return <OrgModal onClose={onClose}><div className="danger-symbol"><Trash2 size={24}/></div><div className="centered-modal"><h2>{blocked?'حذف این سمت ممکن نیست':'حذف سمت سازمانی'}</h2>{blocked?<><p>برای سمت «{position.title}» {assignedPeople.length.toLocaleString('en-US')} انتساب جاری یا تاریخی ثبت شده است. برای حفظ پرونده پرسنلی، این سمت حذف نمی‌شود؛ در صورت نداشتن فرد فعال می‌توانید آن را غیرفعال کنید.</p><div className="blocked-role-users">{assignedPeople.slice(0,6).map((name)=><span key={name}>{name}</span>)}</div></>:<p>سمت «{position.title}» هیچ انتساب جاری یا تاریخی ندارد و حذف می‌شود. رخداد حذف در ممیزی باقی می‌ماند.</p>}<div className="modal-actions modal-actions--center"><button className="button button--secondary" onClick={onClose}>{blocked?'متوجه شدم':'انصراف'}</button>{!blocked&&<button className="button button--danger" onClick={onConfirm}>تأیید حذف سمت</button>}</div></div></OrgModal>}

function RoleDialog({role, onClose, onSubmit}: {role?: SecurityRole; onClose: () => void; onSubmit: (input: RoleInput) => void}) {
  const [name, setName] = useState(role?.name ?? ''); const [description, setDescription] = useState(role?.description ?? ''); const [scope, setScope] = useState<ScopeType>(role?.scope ?? 'SELF'); const [permissions, setPermissions] = useState<PermissionCode[]>(role?.permissions ?? []); const [domain, setDomain] = useState<(typeof PERMISSION_CATALOG)[number]['domain']>('organization');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const domainLabels: Record<string,string> = {organization:'سازمان',hr:'منابع انسانی',crm:'مشتری و CRM',sales:'فروش',marketing:'بازاریابی',catalog:'کاتالوگ',procurement:'تدارکات',supplier:'تأمین‌کننده',finance:'مالی',treasury:'خزانه',accounting:'حسابداری',warehouse:'انبار',logistics:'لجستیک',service:'خدمات',support:'پشتیبانی',contract:'قرارداد',asset:'دارایی',task:'وظایف',communications:'ارتباطات',letter:'نامه',document:'اسناد',management:'مدیریت'};
  const domains = [...new Set(PERMISSION_CATALOG.map((item)=>item.domain))].map((id)=>({id,label:domainLabels[id]??id}));
  const normalizedPermissionQuery = permissionQuery.trim().toLocaleLowerCase('fa-IR');
  const visible = PERMISSION_CATALOG.filter((item) => (!normalizedPermissionQuery ? item.domain === domain : true) && `${item.label} ${item.description} ${item.code} ${domainLabels[item.domain] ?? item.domain}`.toLocaleLowerCase('fa-IR').includes(normalizedPermissionQuery));
  const submit=()=>{const next=validateRequired([{label:'نام نقش',value:name,valid:(value)=>String(value).trim().length>=2,message:'فیلد «نام نقش» الزامی است و باید حداقل ۲ نویسه داشته باشد.'}]);setErrors(next);if(!next.length)onSubmit({name,description,scope,permissions});};
  return <OrgModal onClose={onClose} wide><DialogHeading eyebrow="نقش دسترسی" title={role ? 'ویرایش نقش و مجوزها' : 'ایجاد نقش جدید'} text="مجوزهای تمام حوزه‌های ERP قابل تنظیم‌اند؛ هر اقدام همچنان از Scope، Resource Policy و Workflow Guard عبور می‌کند." onClose={onClose} /><div className="org-form-grid"><FormValidationSummary errors={errors}/><Field label="نام نقش" required><input aria-required="true" aria-invalid={Boolean(errors.length)&&name.trim().length<2} autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="محدوده پیش‌فرض" required><select aria-required="true" value={scope} onChange={(event) => setScope(event.target.value as ScopeType)}><option value="COMPANY">کل شرکت</option><option value="UNIT">واحد سازمانی</option><option value="TEAM">تیم کاری</option><option value="SELF">فقط خود</option><option value="RECORD">رکورد مشخص</option></select></Field><Field label="شرح نقش" full><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><section className="permission-editor"><div className="permission-editor-head"><div><strong>مجوزهای نقش</strong><span>{permissions.length.toLocaleString('en-US')} مجوز انتخاب‌شده</span></div><ShieldCheck size={22} /></div><div className="permission-search"><label className="search-box"><Search size={17}/><input type="search" aria-label="جست‌وجوی مجوزهای نقش" value={permissionQuery} onChange={(event) => setPermissionQuery(event.target.value)} placeholder="جست‌وجوی نام، شرح، کد یا حوزه مجوز"/></label><span>{visible.length.toLocaleString('en-US')} نتیجه</span></div><div className="permission-domains">{domains.map((item) => <button key={item.id} className={domain === item.id ? 'active' : ''} onClick={() => {setDomain(item.id); setPermissionQuery('');}}>{item.label}</button>)}</div><div className="permission-options">{visible.map((permission) => {const checked = permissions.includes(permission.code as PermissionCode); return <label key={permission.code} className={`permission-option ${!permission.available ? 'permission-option--future' : ''}`}><input type="checkbox" checked={checked} disabled={!permission.available} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, permission.code as PermissionCode] : current.filter((item) => item !== permission.code))} /><span className="permission-check">{checked && <Check size={14} />}</span><span><strong>{permission.label}</strong><small>{permission.description}</small></span>{!permission.available && <em>آینده</em>}</label>;})}{!visible.length && <SearchEmpty text="مجوزی با این جست‌وجو پیدا نشد."/>}</div></section><DialogActions onClose={onClose} submit={role ? 'ذخیره نقش و مجوزها' : 'ایجاد نقش'} onSubmit={submit} /></OrgModal>;
}

function RoleDetailsDialog({role,state,onClose,onEdit}:{role:SecurityRole;state:FoundationState;onClose:()=>void;onEdit?:()=>void}) {
  const insight=roleInsight(role,state.users,PERMISSION_CATALOG);
  const permissionsByDomain=insight.domains.map((domain)=>({domain,permissions:role.permissions.filter((permission)=>PERMISSION_CATALOG.find((item)=>item.code===permission)?.domain===domain.id)}));
  return <OrgModal onClose={onClose} wide><DialogHeading eyebrow="مشاهده نقش" title={role.name} text={role.description||'شرحی برای این نقش ثبت نشده است.'} onClose={onClose}/>{insight.attention.length>0&&<section className="role-detail-alerts" aria-label="موارد نیازمند بررسی"><CircleAlert size={18}/><div><strong>این نقش نیازمند بررسی است</strong>{insight.attention.map((code)=><span key={code}>{roleAttentionLabel(code)}</span>)}</div></section>}<div className="role-detail-summary"><span><small>وضعیت</small><i className={`status-badge status-badge--${role.status}`}>{role.status==='active'?'فعال':'غیرفعال'}</i></span><span><small>محدوده</small><strong>{scopeLabel(role.scope)}</strong></span><span><small>کاربران جاری</small><strong>{insight.activeUsers.length.toLocaleString('en-US')} فعال · {insight.inactiveUsers.length.toLocaleString('en-US')} غیرفعال</strong></span><span><small>نوع دسترسی</small><strong>{insight.protectedAccess?'حساس و محافظت‌شده':'عملیاتی عادی'}</strong></span></div><section className="role-detail-permissions"><div><strong>مجوزها به تفکیک حوزه</strong><span>{role.permissions.length.toLocaleString('en-US')} مجوز مؤثر</span></div><div className="role-domain-groups">{permissionsByDomain.map(({domain,permissions})=><section key={domain.id}><header><strong>{permissionDomainLabel(domain.id)}</strong><b>{permissions.length.toLocaleString('en-US')}</b></header><div>{permissions.map((permission)=><span key={permission}>{permissionLabel(permission)}</span>)}</div></section>)}{insight.unknownPermissions.length>0&&<section className="has-issue"><header><strong>مجوزهای ناشناخته</strong><b>{insight.unknownPermissions.length.toLocaleString('en-US')}</b></header><div>{insight.unknownPermissions.map((permission)=><code key={permission}>{permission}</code>)}</div></section>}{!role.permissions.length&&<p>هیچ مجوزی برای این نقش ثبت نشده است.</p>}</div></section><section className="role-detail-users"><header><div><strong>کاربران دارای این نقش</strong><span>اثر واقعی نقش روی حساب‌های جاری</span></div><b>{insight.users.length.toLocaleString('en-US')}</b></header><div>{insight.users.slice(0,10).map((user)=><span key={user.id}><span className="persona-avatar" style={{background:user.accent}}>{user.initials}</span><span><strong>{userDisplayLabel(user,state)}</strong><small>{user.status==='active'?'حساب فعال':'حساب غیرفعال'}</small></span></span>)}{!insight.users.length&&<p>این نقش اکنون به هیچ کاربری تخصیص ندارد.</p>}</div></section><div className="dialog-actions"><button className="button button--secondary" onClick={onClose}>بستن</button>{onEdit&&<button className="button button--primary" onClick={onEdit}><Pencil size={17}/> ویرایش نقش</button>}</div></OrgModal>;
}

function RoleDeleteDialog({role,assignedUsers,state,onClose,onConfirm}:{role:SecurityRole;assignedUsers:LocalUser[];state:FoundationState;onClose:()=>void;onConfirm:()=>void}) {
  const blocked=role.protected||assignedUsers.length>0;
  return <OrgModal onClose={onClose}><div className="danger-symbol"><Trash2 size={24}/></div><div className="centered-modal"><h2>{blocked?'حذف این نقش ممکن نیست':'حذف نقش'}</h2>{role.protected?<p>نقش «{role.name}» یک نقش پایه محافظت‌شده است و برای سلامت دسترسی‌های سیستم حذف نمی‌شود.</p>:assignedUsers.length?<><p>نقش «{role.name}» اکنون به {assignedUsers.length.toLocaleString('en-US')} کاربر تخصیص دارد. ابتدا تخصیص جاری را از همه کاربران بردارید.</p><div className="blocked-role-users">{assignedUsers.slice(0,5).map((user)=><span key={user.id}>{userDisplayLabel(user,state)}</span>)}</div></>:<p>نقش «{role.name}» از فهرست فعال حذف می‌شود. نسخه‌های قبلی، رخداد حذف و سابقه تخصیص‌های گذشته برای گزارش‌گیری و ممیزی باقی می‌مانند.</p>}<div className="modal-actions modal-actions--center"><button className="button button--secondary" onClick={onClose}>{blocked?'متوجه شدم':'انصراف'}</button>{!blocked&&<button className="button button--danger" onClick={onConfirm}>تأیید حذف نقش</button>}</div></div></OrgModal>;
}

function RoleAssignmentsDialog({role, state, mayToggle, actorIsPrimaryAdmin, onClose, onToggle}: {role: SecurityRole; state: FoundationState; mayToggle: boolean; actorIsPrimaryAdmin: boolean; onClose: () => void; onToggle: (user: LocalUser, checked: boolean) => Promise<boolean>}) {
  const [query, setQuery] = useState('');
  const users = useMemo(() => {const search = query.trim().toLocaleLowerCase('fa-IR'); if (!search) return state.users; return state.users.filter((user) => `${user.name} ${user.username} ${user.roles.join(' ')} ${state.units.find((unit) => unit.id === user.unitId)?.name ?? ''} ${state.positions.find((position) => position.id === user.positionId)?.title ?? ''}`.toLocaleLowerCase('fa-IR').includes(search));}, [query, state.positions, state.units, state.users]);
  return <OrgModal onClose={onClose}><DialogHeading eyebrow="انتساب نقش" title={`کاربران نقش «${role.name}»`} text="هر کاربر می‌تواند هم‌زمان یک یا چند نقش داشته باشد. حذف آخرین نقش مجاز نیست." onClose={onClose} />{!mayToggle && <p className="compact-role-readonly"><Shield size={15}/> این فهرست فقط برای مشاهده است؛ حساب جاری اجازه انتساب این نقش را ندارد.</p>}<ListSearchToolbar value={query} onChange={setQuery} placeholder="جست‌وجوی نام، نام کاربری، نقش، واحد یا سمت" count={users.length} unit="کاربر" compact/><div className="assignment-list">{users.map((user) => {const checked = user.roleIds.includes(role.id); const targetHasProtectedAccess = user.roleIds.some((roleId) => {const assignedRole=state.roles.find((item)=>item.id===roleId);return PROTECTED_ROLE_IDS.has(roleId)||assignedRole?.permissions.some((permission)=>PROTECTED_PERMISSION_CODES.has(permission));}); const disabled = !mayToggle || (!actorIsPrimaryAdmin && targetHasProtectedAccess) || (checked && user.roleIds.length === 1) || user.isAdmin || (role.id === 'role-admin' && (!actorIsPrimaryAdmin || user.id !== PRIMARY_ADMIN_USER_ID)); return <label key={user.id}><span className="persona-avatar" style={{background: user.accent}}>{user.initials}</span><span><strong>{userDisplayLabel(user,state)}</strong><small>{user.roles.join('، ')}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => void onToggle(user, event.target.checked)} /><i /></label>;})}{!users.length && <SearchEmpty text="کاربری با این جست‌وجو پیدا نشد."/>}</div><div className="dialog-actions"><button className="button button--primary" onClick={onClose}>پایان</button></div></OrgModal>;
}

function OrgTreeBranch({unit, state, depth, visited = new Set<string>()}: {unit: OrganizationalUnit; state: FoundationState; depth: number; visited?: Set<string>}) { if (visited.has(unit.id)) return null; const nextVisited=new Set(visited);nextVisited.add(unit.id); const children = state.units.filter((item) => item.parentId === unit.id && item.type !== 'شعبه'); const memberCount = organizationPeopleForUnit(state,unit.id).length; const acting=activeActingManager(unit);const manager=state.users.find((user)=>user.id===effectiveUnitManagerUserId(unit)); return <div className="org-tree-branch" style={{'--tree-depth': depth} as React.CSSProperties}><article><span className="tree-connector" /><span className="unit-type-icon"><Building2 size={17} /></span><div><strong>{unit.name}</strong><small>{unit.type} · {manager?compactUserLabel(manager):'تعیین نشده'}{acting?' · جانشین موقت':''}</small></div><span>{memberCount.toLocaleString('en-US')} نفر</span><span className={`status-badge status-badge--${unit.status}`}>{unit.status === 'active' ? 'فعال' : 'غیرفعال'}</span></article>{children.map((child) => <OrgTreeBranch key={child.id} unit={child} state={state} depth={depth + 1} visited={nextVisited}/>)}</div>; }
function managerLabel(managerUserId:string|undefined,state:FoundationState){const manager=state.users.find((user)=>user.id===managerUserId);return manager?userDisplayLabel(manager,state):'تعیین نشده';}
function compactUserLabel(user:LocalUser){return `${user.name} — @${user.username}`;}
function OrganizationMemberRow({person,state}:{person:OrganizationPerson;state:FoundationState}){const label=person.personnel?personnelDisplayLabel(person.personnel,state):person.user?userDisplayLabel(person.user,state):person.id;const initials=person.user?.initials??person.personnel?`${person.personnel.firstName.slice(0,1)}${person.personnel.lastName.slice(0,1)}`:'؟';const accent=person.user?.accent??'#2563eb';return <div><span className="persona-avatar" style={{background:accent}}>{initials}</span><span><b>{label}</b><small>{state.positions.find((position)=>position.id===person.positionId)?.title??'بدون سمت'}{person.user?' · دارای حساب':' · بدون حساب کاربری'}</small></span></div>;}

function PositionPersonRow({person,state}:{person:OrganizationPerson;state:FoundationState}) {
  const label=person.personnel?personnelDisplayLabel(person.personnel,state):person.user?userDisplayLabel(person.user,state):person.id;
  const unit=state.units.find((item)=>item.id===person.unitId);
  const initials=person.user?.initials??(person.personnel?`${person.personnel.firstName.slice(0,1)}${person.personnel.lastName.slice(0,1)}`:'؟');
  return <div className="position-person-row"><span className="persona-avatar" style={{background:person.user?.accent??'#2563eb'}}>{initials}</span><span><b>{label}</b><small>{unit?.name??'واحد نامشخص'} · {person.user?'دارای حساب کاربری':'بدون حساب کاربری'}</small></span><i className={`status-badge status-badge--${person.active?'active':'inactive'}`}>{person.active?'جاری':'سابقه'}</i></div>;
}

function PositionInspector({position,selectedUnitId,state,mayManage,onEdit}:{position:OrganizationalPosition;selectedUnitId:string;state:FoundationState;mayManage:boolean;onEdit:()=>void}) {
  const usage=positionUsage(state,position);
  const selectedUnit=state.units.find((unit)=>unit.id===selectedUnitId);
  const currentInUnit=usage.activePeopleInUnit(selectedUnitId);
  const otherCurrent=usage.activePeople.filter((person)=>person.unitId!==selectedUnitId);
  return <section className="position-inspector" aria-label={`جزئیات سمت ${position.title}`}>
    <header><div><small>پرونده سمت سازمانی</small><h3>{position.title}</h3><p>{position.description||'شرحی برای این سمت ثبت نشده است.'}</p></div>{mayManage&&<button className="button button--secondary" onClick={onEdit}><Pencil size={16}/> ویرایش سمت</button>}</header>
    <div className="position-inspector__facts"><span><small>وضعیت</small><strong>{position.status==='active'?'فعال':'غیرفعال'}</strong></span><span><small>افراد فعال در {selectedUnit?.name??'واحد'}</small><strong>{currentInUnit.length.toLocaleString('en-US')} نفر</strong></span><span><small>افراد فعال در همه واحدها</small><strong>{usage.activePeople.length.toLocaleString('en-US')} نفر</strong></span><span><small>سوابق خاتمه‌یافته</small><strong>{usage.historicalPeople.length.toLocaleString('en-US')} نفر</strong></span></div>
    <div className="position-inspector__units"><strong>واحدهای مجاز</strong><div>{position.unitIds.map((unitId)=>{const unit=state.units.find((item)=>item.id===unitId);return <span className={unit?.status==='active'?'':'inactive'} key={unitId}><Building2 size={14}/>{unit?.name??'واحد حذف‌شده'}{unit?.status!=='active'&&<small>غیرفعال</small>}</span>;})}</div></div>
    {(usage.invalidActivePeople.length>0||usage.inactiveUnits>0||position.status==='inactive'&&usage.activePeople.length>0)&&<div className="position-integrity-warning"><CircleAlert size={19}/><span><strong>این سمت نیازمند بررسی است</strong><small>{usage.invalidActivePeople.length>0&&`${usage.invalidActivePeople.length.toLocaleString('en-US')} فرد فعال خارج از واحدهای مجاز است. `}{usage.inactiveUnits>0&&`${usage.inactiveUnits.toLocaleString('en-US')} واحد مجاز غیرفعال شده است. `}{position.status==='inactive'&&usage.activePeople.length>0&&'سمت غیرفعال هنوز انتساب فعال دارد.'}</small></span></div>}
    <div className="position-inspector__people"><section><header><strong>افراد فعال این واحد</strong><span>{currentInUnit.length.toLocaleString('en-US')}</span></header>{currentInUnit.length?currentInUnit.map((person)=><PositionPersonRow key={person.id} person={person} state={state}/>):<p>فرد فعالی با این سمت در واحد انتخابی وجود ندارد.</p>}</section><section><header><strong>سایر انتساب‌ها و سوابق</strong><span>{(otherCurrent.length+usage.historicalPeople.length).toLocaleString('en-US')}</span></header>{otherCurrent.concat(usage.historicalPeople).length?otherCurrent.concat(usage.historicalPeople).map((person)=><PositionPersonRow key={person.id} person={person} state={state}/>):<p>سابقه دیگری برای این سمت ثبت نشده است.</p>}</section></div>
    <footer><span className={usage.canDeactivate?'safe':'blocked'}><Power size={15}/>{usage.canDeactivate?'قابل غیرفعال‌سازی':'برای غیرفعال‌سازی، ابتدا سمت افراد فعال را تغییر دهید'}</span><span className={usage.canDelete?'safe':'blocked'}><Trash2 size={15}/>{usage.canDelete?'بدون سابقه و قابل حذف':'به‌دلیل انتساب جاری یا تاریخی قابل حذف نیست'}</span></footer>
  </section>;
}
function OrgIntro({icon: Icon, eyebrow, title, description, action}: {icon: LucideIcon; eyebrow: string; title: string; description: string; action?: ReactNode}) { return <section className="page-intro org-page-intro"><span className="page-intro-icon"><Icon size={24} /></span><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action && <div className="page-intro-action">{action}</div>}</section>; }
function OrgMetric({icon: Icon, value, label, detail}: {icon: LucideIcon; value: number; label: string; detail: string}) { return <article><span><Icon size={20} /></span><div><strong>{value.toLocaleString('en-US')}</strong><b>{label}</b><small>{detail}</small></div></article>; }
function OrgPanelHeading({eyebrow, title, text}: {eyebrow: string; title: string; text: string}) { return <div className="org-panel-heading"><span>{eyebrow}</span><h3>{title}</h3><p>{text}</p></div>; }
function ListSearchToolbar({value, onChange, placeholder, count, unit, compact = false}: {value: string; onChange: (value: string) => void; placeholder: string; count: number; unit: string; compact?: boolean}) { return <div className={`data-search-toolbar ${compact ? 'data-search-toolbar--compact' : ''}`}><label className="search-box"><Search size={18}/><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder}/></label><span>{count.toLocaleString('en-US')} {unit}</span></div>; }
function SearchEmpty({text}: {text: string}) { return <div className="empty-state data-search-empty"><Search size={25}/><strong>{text}</strong><span>عبارت جست‌وجو را تغییر دهید.</span></div>; }
function OrgIconAction({label, tone = 'neutral', disabled = false, onClick, children}: {label: string; tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'qa'; disabled?: boolean; onClick: () => void; children: ReactNode}) { return <button type="button" className={`icon-action icon-action--${tone}`} aria-label={label} data-tooltip={label} disabled={disabled} onClick={onClick}>{children}</button>; }
function OrgModal({children, onClose, wide = false}: {children: ReactNode; onClose: () => void; wide?: boolean}) {
  const dialogRef=useRef<HTMLElement>(null);const titleId=useId();const restoreFocusRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(document.activeElement instanceof HTMLElement&&!dialog.contains(document.activeElement)&&document.activeElement!==document.body)restoreFocusRef.current=document.activeElement;const heading=dialog.querySelector('h2');if(heading)heading.id=titleId;const focusable=visibleFocusable(dialog);(focusable[0]??dialog).focus();const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')?.click();return;}if(event.key!=='Tab')return;const current=visibleFocusable(dialog);if(!current.length){event.preventDefault();dialog.focus();return;}const first=current[0];const last=current[current.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};document.addEventListener('keydown',onKeyDown,true);return()=>{document.removeEventListener('keydown',onKeyDown,true);document.body.style.overflow=previousOverflow;const restore=restoreFocusRef.current;window.setTimeout(()=>{if(restore?.isConnected)restore.focus();},0);};},[onClose,titleId]);
  return <div className="modal-layer"><button type="button" className="modal-scrim" onClick={onClose} tabIndex={-1} aria-hidden="true" /><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal-card ${wide ? 'modal-card--wide' : ''}`}>{children}</section></div>;
}
function visibleFocusable(root:HTMLElement){return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter((element)=>element.getClientRects().length>0);}
function DialogHeading({eyebrow, title, text, onClose}: {eyebrow: string; title: string; text: string; onClose: () => void}) { return <div className="modal-heading"><div><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div><button className="icon-button" data-dialog-close aria-label="بستن پنجره" onClick={onClose}><X size={20} /></button></div>; }
function Field({label, full = false, required = false, children}: {label: string; full?: boolean; required?: boolean; children: ReactNode}) { return <label className={`field-label ${full ? 'field-label--full' : ''}`}>{required ? <RequiredLabel>{label}</RequiredLabel> : <OptionalLabel>{label}</OptionalLabel>}{children}</label>; }
function DialogActions({onClose, submit, onSubmit}: {onClose: () => void; submit: string; onSubmit: () => void}) { return <div className="dialog-actions"><button className="button button--secondary" data-dialog-close onClick={onClose}>انصراف</button><button className="button button--primary" onClick={onSubmit}>{submit}</button></div>; }
function ConfirmDialog({icon: Icon, title, text, confirm, onClose, onConfirm}: {icon: LucideIcon; title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => void}) { return <OrgModal onClose={onClose}><div className="danger-symbol"><Icon size={27} /></div><div className="centered-modal"><h2>{title}</h2><p>{text}</p><div className="modal-actions modal-actions--center"><button className="button button--secondary" data-dialog-close onClick={onClose}>انصراف</button><button className="button button--danger" onClick={onConfirm}>{confirm}</button></div></div></OrgModal>; }
function scopeLabel(scope: ScopeType) { return ({COMPANY: 'کل شرکت', UNIT: 'واحد', TEAM: 'تیم', SELF: 'فقط خود', RECORD: 'رکورد'} as const)[scope]; }
function permissionLabel(code: PermissionCode) { return PERMISSION_CATALOG.find((item) => item.code === code)?.label ?? code.split('.').slice(-2).join('.'); }
