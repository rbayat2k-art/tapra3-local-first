import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Archive, CalendarClock, Check, CheckCircle2, ChevronLeft, CircleAlert, Clock3, FolderKanban,
  FileText, History, MessageCircle, Pause, Pencil, Play, Plus, RotateCcw, Search, UsersRound, X,
} from 'lucide-react';
import {authorize, can, operationalRecordResource} from './authorization';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService} from './service';
import {permissionFor} from './erpCatalog';
import {RecordDialog} from './RecordDialog';
import {FormValidationSummary, OptionalLabel, RequiredLabel, validateRequired} from './FormValidation';
import {PersianDateInput, formatPersianDate} from './PersianDate';
import {projectChatId, projectMemberUserIds, taskChecklist, taskLabels, taskProjectId, type ProjectInput, type ProjectTaskBatchInput} from './collaborationDomain';
import {
  collaborationSummary, progressForProject, projectRecords, projectStatusLabel, projectTasks,
  taskCompletionLabel, taskStatusLabel,
} from './collaborationSelectors';
import {userDisplayLabel} from './personIdentity';
import './CollaborationHub.css';

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
  onOpenConversations: () => void;
  onOpenConversation: (chatId: string) => void;
  onOpenLetters: (recordId?: string) => void;
  onOpenDocuments: (recordId?: string) => void;
  initialQueue?: TaskQueue;
}

type TaskQueue = 'project'|'today'|'overdue'|'delegated';
type TaskBoardState = 'todo'|'in_progress'|'blocked'|'done';
const TASK_STATES: readonly TaskBoardState[] = ['todo', 'in_progress', 'blocked', 'done'];
const TERMINAL_TASK_STATES = new Set(['done','completed','cancelled','rejected','archived']);

export function CollaborationDashboardPanel({state, onOpenHub, onOpenConversations, onOpenLetters}: {state: FoundationState; onOpenHub: (queue?:TaskQueue) => void; onOpenConversations: () => void; onOpenLetters: () => void}) {
  const summary = collaborationSummary(state);
  const items = [
    {label: 'کار امروز من', value: summary.todayTasks, icon: CalendarClock, action: () => onOpenHub('today')},
    {label: 'عقب‌افتاده', value: summary.overdueTasks, icon: CircleAlert, action: () => onOpenHub('overdue')},
    {label: 'واگذارشده به دیگران', value: summary.waitingOnOthers, icon: Clock3, action: () => onOpenHub('delegated')},
    ...(can(state.activeUser,permissionFor('chat','view'))?[{label: 'پیام خوانده‌نشده', value: summary.unreadMessages, icon: MessageCircle, action: onOpenConversations}]:[]),
    ...(can(state.activeUser,permissionFor('letter','view'))?[{label: 'نامه نیازمند اقدام', value: summary.actionableLetters, icon: Archive, action: onOpenLetters}]:[]),
  ];
  return <section className="panel collaboration-dashboard-panel">
    <header><div><span className="eyebrow">میز همکاری من</span><h3>امروز چه چیزی به اقدام شما نیاز دارد؟</h3><p>خلاصه از پروژه‌ها، کارها، گفت‌وگوها و نامه‌هایی که با مجوز همین حساب دیده می‌شوند.</p></div><button className="button button--primary button--small" onClick={()=>onOpenHub('project')}>باز کردن میز همکاری <ChevronLeft size={16}/></button></header>
    <div>{items.map(({label,value,icon:Icon,action}) => <button key={label} onClick={action}><span><Icon size={18}/></span><strong>{value.toLocaleString('fa-IR')}</strong><small>{label}</small><ChevronLeft size={15}/></button>)}</div>
  </section>;
}

export function CollaborationHubPage({state, service, execute, onOpenConversations, onOpenConversation, onOpenLetters, onOpenDocuments, initialQueue='project'}: Props) {
  const projects = useMemo(() => projectRecords(state), [state]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [query, setQuery] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [pendingProjectTitle, setPendingProjectTitle] = useState<string>();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<OperationalRecord>();
  const [editingTask, setEditingTask] = useState<OperationalRecord>();
  const [linkingType,setLinkingType]=useState<'letter'|'document'>();
  const [taskQuery, setTaskQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<'all'|'today'|'overdue'>('all');
  const [taskQueue,setTaskQueue]=useState<TaskQueue>(initialQueue);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const allTasks = useMemo(() => projectTasks(state), [state]);
  const editingTaskProject = editingTask ? projects.find((project)=>project.id===taskProjectId(editingTask)) : undefined;
  const todayKey = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dueKeyFor=(task:OperationalRecord)=>task.dueAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(task.dueAt)):'';
  const selectedTasks = taskQueue==='project'
    ? selectedProject ? allTasks.filter((task) => taskProjectId(task) === selectedProject.id) : []
    : allTasks.filter((task)=>taskQueue==='today'
      ? task.assigneeUserId===state.activeUser.id&&!TERMINAL_TASK_STATES.has(task.status)&&dueKeyFor(task)===todayKey
      : taskQueue==='overdue'
        ? task.assigneeUserId===state.activeUser.id&&!TERMINAL_TASK_STATES.has(task.status)&&Boolean(dueKeyFor(task)&&dueKeyFor(task)<todayKey)
        : task.createdByUserId===state.activeUser.id&&task.assigneeUserId!==state.activeUser.id&&!TERMINAL_TASK_STATES.has(task.status));
  const availableLabels = [...new Set(selectedTasks.flatMap(taskLabels))].sort((a,b)=>a.localeCompare(b,'fa'));
  const filteredTasks = selectedTasks.filter((task) => {
    const queryMatches = !taskQuery.trim() || `${task.title} ${task.description} ${taskLabels(task).join(' ')}`.toLocaleLowerCase('fa').includes(taskQuery.trim().toLocaleLowerCase('fa'));
    const assigneeMatches = assigneeFilter === 'all' || task.assigneeUserId === assigneeFilter;
    const labelMatches = labelFilter === 'all' || taskLabels(task).includes(labelFilter);
    const dueKey = dueKeyFor(task);
    const dueMatches = dueFilter === 'all' || (dueFilter === 'today' ? dueKey === todayKey : Boolean(dueKey && dueKey < todayKey && task.status !== 'done'));
    return queryMatches && assigneeMatches && labelMatches && dueMatches;
  });
  const linkedLetters = selectedProject ? state.operationalRecords.filter((record)=>record.moduleId==='letter'&&record.payload.projectId===selectedProject.id) : [];
  const linkedDocuments = selectedProject ? state.operationalRecords.filter((record)=>['document','personnel-document'].includes(record.moduleId)&&record.payload.projectId===selectedProject.id) : [];
  const selectedProjectTasks=selectedProject?allTasks.filter((task)=>taskProjectId(task)===selectedProject.id):[];
  const recentActivity = selectedProject ? state.operationalHistory
    .filter((item)=>item.recordId===selectedProject.id||selectedProjectTasks.some((task)=>task.id===item.recordId))
    .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,8) : [];
  const summary = useMemo(() => collaborationSummary(state), [state]);
  const normalizedQuery = query.trim().toLocaleLowerCase('fa');
  const visibleProjects = projects.filter((project) => `${project.title} ${project.description}`.toLocaleLowerCase('fa').includes(normalizedQuery));
  const mayCreateProject = can(state.activeUser, permissionFor('project', 'create'));
  const mayOpenConversations=can(state.activeUser,permissionFor('chat','view'));
  const mayOpenLetters=can(state.activeUser,permissionFor('letter','view'));
  const mayCreateTask = Boolean(selectedProject&&can(state.activeUser,permissionFor('task','create'))&&authorize({persona:state.activeUser,permission:permissionFor('task','create'),action:'create',resource:operationalRecordResource(state.activeUser,selectedProject)}).allowed);
  const mayManageProject = Boolean(selectedProject&&can(state.activeUser,permissionFor('project','manage'))&&authorize({persona:state.activeUser,permission:permissionFor('project','manage'),action:'edit',resource:operationalRecordResource(state.activeUser,selectedProject)}).allowed);

  useEffect(()=>setTaskQueue(initialQueue),[initialQueue]);

  useEffect(() => {
    if (pendingProjectTitle) {
      const createdProject = [...projects]
        .filter((project) => project.title === pendingProjectTitle)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (createdProject) {
        setSelectedProjectId(createdProject.id);
        setPendingProjectTitle(undefined);
        return;
      }
    }
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) setSelectedProjectId(projects[0]?.id);
  }, [pendingProjectTitle, projects, selectedProjectId]);

  const transitionProject = (targetStatus: 'active' | 'paused' | 'completed' | 'archived', reason = '') => {
    if (!selectedProject) return;
    void execute(
      `project-${targetStatus}`,
      () => service.transitionProject(selectedProject.id, targetStatus, reason, selectedProject.version),
      `وضعیت پروژه به «${projectStatusLabel(targetStatus)}» تغییر کرد.`,
    );
  };

  const transitionTask = (task: OperationalRecord, target: 'todo'|'in_progress'|'blocked'|'done') => {
    let reason='';
    if(target==='blocked')reason=window.prompt('مانع انجام این کار چیست؟ این توضیح برای اعضای پروژه نمایش داده می‌شود.')?.trim()??'';
    else if(task.status==='blocked'&&target==='in_progress')reason=window.prompt('مانع چگونه برطرف شد؟')?.trim()??'';
    if((target==='blocked'||task.status==='blocked')&&reason.length<3)return;
    void execute(
      `project-task-${target}`,
      () => service.transitionProjectTask(task.id, target, reason, task.version),
      target === 'done' ? 'کار انجام شد.' : target==='blocked'?'کار در صف مسدود قرار گرفت.':target==='todo'?'کار به صف انجام بازگشت.':'کار در حال انجام قرار گرفت.',
    );
  };

  return <div className="collaboration-hub page-stack">
    <section className="collaboration-hero">
      <div>
        <span className="eyebrow">همکاری سازمانی شاهراه</span>
        <h2>پروژه، کار، گفت‌وگو و نامه در یک نمای هماهنگ</h2>
        <p>این بخش جایگزین گفت‌وگو و نامه‌نگاری موجود نیست؛ اطلاعات مجاز همان بخش‌ها را کنار پروژه‌ها و کارهای شما جمع می‌کند.</p>
      </div>
      <div className="collaboration-hero__actions">
        {mayOpenLetters&&<button className="button button--secondary" onClick={()=>onOpenLetters()}>نامه‌ها <ChevronLeft size={17}/></button>}
        {mayOpenConversations&&<button className="button button--secondary" onClick={onOpenConversations}>گفت‌وگوها <ChevronLeft size={17}/></button>}
        {mayCreateProject && <button className="button button--primary" onClick={() => setProjectDialogOpen(true)}><Plus size={18}/> پروژه جدید</button>}
      </div>
    </section>

    <section className="collaboration-metrics" aria-label="خلاصه همکاری من">
      <SummaryMetric icon={FolderKanban} value={summary.activeProjects} label="پروژه فعال" tone="primary"/>
      <SummaryMetric icon={CalendarClock} value={summary.todayTasks} label="کار امروز من" tone="blue" active={taskQueue==='today'} onClick={()=>setTaskQueue('today')}/>
      <SummaryMetric icon={CircleAlert} value={summary.overdueTasks} label="عقب‌افتاده" tone="danger" active={taskQueue==='overdue'} onClick={()=>setTaskQueue('overdue')}/>
      <SummaryMetric icon={Clock3} value={summary.waitingOnOthers} label="واگذارشده به دیگران" tone="amber" active={taskQueue==='delegated'} onClick={()=>setTaskQueue('delegated')}/>
      <SummaryMetric icon={MessageCircle} value={summary.unreadMessages} label="پیام خوانده‌نشده" tone="green"/>
      <SummaryMetric icon={Archive} value={summary.actionableLetters} label="نامه نیازمند اقدام" tone="violet"/>
    </section>

    <section className="collaboration-layout">
      <aside className="project-directory panel">
        <header><div><span className="eyebrow">فضاهای کاری</span><h3>پروژه‌ها</h3></div><b>{projects.length.toLocaleString('fa-IR')}</b></header>
        <label className="search-field"><Search size={17}/><input aria-label="جست‌وجوی پروژه" placeholder="نام یا شرح پروژه…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
        <div className="project-directory__list">
          {visibleProjects.map((project) => {
            const progress = progressForProject(state, project.id);
            return <button key={project.id} aria-pressed={selectedProject?.id===project.id&&taskQueue==='project'} className={selectedProject?.id === project.id&&taskQueue==='project' ? 'active' : ''} onClick={() => {setSelectedProjectId(project.id);setTaskQueue('project');}}>
              <span><strong>{project.title}</strong><small>{projectStatusLabel(project.status)} · {projectMemberUserIds(project).length.toLocaleString('fa-IR')} عضو</small></span>
              <i><b style={{width: `${progress.percent}%`}}/></i>
              <em>{progress.percent.toLocaleString('fa-IR')}٪</em>
            </button>;
          })}
          {!visibleProjects.length && <div className="empty-state"><FolderKanban size={34}/><strong>پروژه‌ای پیدا نشد</strong><span>{projects.length ? 'عبارت دیگری جست‌وجو کنید.' : 'پس از ساخت پروژه، فضای کاری آن اینجا دیده می‌شود.'}</span></div>}
        </div>
      </aside>

      <main className="project-workspace">
        {selectedProject ? <>
          {taskQueue==='project'&&<ProjectHeader project={selectedProject} state={state} onOpenConversation={onOpenConversation} mayManage={mayManageProject} onEdit={()=>setEditingProject(selectedProject)} onTransition={transitionProject}/>}
          <section className="task-board" aria-label={taskQueue==='project'?`تابلوی کارهای ${selectedProject.title}`:'صف سراسری کارهای من'}>
            <header><div><span className="eyebrow">{taskQueue==='project'?'تابلوی اجرای پروژه':'صف سراسری کارهای من'}</span><h3>{({project:'کارهای پروژه',today:'کارهای امروز من',overdue:'کارهای عقب‌افتاده',delegated:'واگذارشده به دیگران'} as Record<TaskQueue,string>)[taskQueue]}</h3></div><div className="collaboration-task-queue-actions">{taskQueue!=='project'&&<button className="button button--ghost button--small" onClick={()=>setTaskQueue('project')}>بازگشت به پروژه</button>}{mayCreateTask && taskQueue==='project' && <button className="button button--primary button--small" onClick={() => setTaskDialogOpen(true)}><Plus size={16}/> افزودن کار</button>}</div></header>
            <div className="collaboration-task-filters" aria-label="فیلتر کارهای پروژه">
              <label className="search-field"><Search size={16}/><input aria-label="جست‌وجوی کار" value={taskQuery} onChange={(event)=>setTaskQuery(event.target.value)} placeholder="عنوان، شرح یا برچسب…"/></label>
              <label><span>مسئول</span><select value={assigneeFilter} onChange={(event)=>setAssigneeFilter(event.target.value)}><option value="all">همه</option>{[...new Set(selectedTasks.map((task)=>task.assigneeUserId).filter((id):id is string=>Boolean(id)))].map((id)=>state.users.find((user)=>user.id===id)).filter(Boolean).map((user)=><option key={user!.id} value={user!.id}>{user!.name}</option>)}</select></label>
              <label><span>برچسب</span><select value={labelFilter} onChange={(event)=>setLabelFilter(event.target.value)}><option value="all">همه</option>{availableLabels.map((label)=><option key={label} value={label}>{label}</option>)}</select></label>
              <label><span>سررسید</span><select value={dueFilter} onChange={(event)=>setDueFilter(event.target.value as typeof dueFilter)}><option value="all">همه</option><option value="today">امروز</option><option value="overdue">عقب‌افتاده</option></select></label>
              {(taskQuery||assigneeFilter!=='all'||labelFilter!=='all'||dueFilter!=='all')&&<button className="button button--ghost button--small" onClick={()=>{setTaskQuery('');setAssigneeFilter('all');setLabelFilter('all');setDueFilter('all');}}>پاک‌کردن فیلترها</button>}
            </div>
            <div className="task-board__lanes">
              {TASK_STATES.map((status) => <TaskLane key={status} status={status} tasks={filteredTasks.filter((task) => task.status === status)} state={state} service={service} execute={execute} onTransition={transitionTask} onEdit={setEditingTask}/>)}
            </div>
          </section>
          {taskQueue==='project'&&<section className="collaboration-project-details">
            <article className="panel collaboration-linked-records"><header><div><span className="eyebrow">پرونده پروژه</span><h3>نامه‌ها و اسناد مرتبط</h3></div><FileText size={20}/></header><div><section><button onClick={()=>setLinkingType('letter')}><strong>{linkedLetters.length.toLocaleString('fa-IR')} نامه</strong><small>{linkedLetters.length ? linkedLetters.slice(0,2).map((record)=>record.title).join('، ') : 'هنوز نامه‌ای با شناسه این پروژه پیوند نشده است.'}</small></button>{mayManageProject&&<button className="button button--ghost button--small" onClick={()=>setLinkingType('letter')}>مدیریت پیوند نامه‌ها</button>}</section><section><button onClick={()=>setLinkingType('document')}><strong>{linkedDocuments.length.toLocaleString('fa-IR')} سند</strong><small>{linkedDocuments.length ? linkedDocuments.slice(0,2).map((record)=>record.title).join('، ') : 'هنوز سندی با شناسه این پروژه پیوند نشده است.'}</small></button>{mayManageProject&&<button className="button button--ghost button--small" onClick={()=>setLinkingType('document')}>مدیریت پیوند اسناد</button>}</section></div></article>
            <article className="panel collaboration-activity"><header><div><span className="eyebrow">ردپای تغییرات</span><h3>فعالیت اخیر</h3></div><History size={20}/></header><ol>{recentActivity.map((item)=><li key={item.id}><span>{item.actorName}</span><strong>{({created:'ساخت',edited:'ویرایش',transitioned:'تغییر وضعیت',assigned:'تخصیص'} as Record<string,string>)[item.eventType]??'به‌روزرسانی'}</strong><time>{new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'}).format(new Date(item.occurredAt))}</time></li>)}{!recentActivity.length&&<li className="empty-state"><span>هنوز فعالیتی ثبت نشده است.</span></li>}</ol></article>
          </section>}
        </> : <div className="panel empty-state empty-state--page"><FolderKanban size={48}/><strong>هنوز پروژه‌ای در دسترس شما نیست</strong><span>مدیر پروژه می‌تواند اعضا، گفت‌وگوی مرتبط و کارها را در یک فضای مشترک تعریف کند.</span>{mayCreateProject && <button className="button button--primary" onClick={() => setProjectDialogOpen(true)}><Plus size={18}/> ساخت اولین پروژه</button>}</div>}
      </main>
    </section>

    {projectDialogOpen && <ProjectDialog state={state} onClose={() => setProjectDialogOpen(false)} onSave={async(input) => {
      const ok = await execute('project-create', () => service.createProject(input), 'پروژه و فضای همکاری آن ساخته شد.');
      if (ok) {
        setPendingProjectTitle(input.title.trim());
        setProjectDialogOpen(false);
      }
    }}
    />}
    {editingProject && <ProjectDialog state={state} project={editingProject} onClose={()=>setEditingProject(undefined)} onSave={async(input)=>{const ok=await execute('project-update',()=>service.updateProject(editingProject.id,input,editingProject.version),'پروژه و اعضای آن به‌روز شد.');if(ok)setEditingProject(undefined);}}/>}
    {taskDialogOpen && selectedProject && <TaskDialog state={state} project={selectedProject} onClose={() => setTaskDialogOpen(false)} onSave={async(input) => {
      const ok = await execute('project-task-create', () => service.createProjectTasksBatch(input), input.assigneeUserIds.length > 1 ? 'برای هر مسئول یک کار مستقل ساخته شد.' : 'کار پروژه ساخته شد.');
      if (ok) setTaskDialogOpen(false);
    }}
    />}
    {editingTask && editingTaskProject && <TaskDialog state={state} project={editingTaskProject} task={editingTask} onClose={()=>setEditingTask(undefined)} onSave={async(input)=>{const ok=await execute('project-task-update',()=>service.updateProjectTask(editingTask.id,{...input,assigneeUserId:input.assigneeUserIds[0]},editingTask.version),'کار پروژه به‌روز شد.');if(ok)setEditingTask(undefined);}}/>}
    {linkingType&&selectedProject&&<ProjectRecordLinkDialog kind={linkingType} project={selectedProject} state={state} mayManage={mayManageProject} onClose={()=>setLinkingType(undefined)} onOpenRecord={(record)=>{setLinkingType(undefined);if(record.moduleId==='letter')onOpenLetters(record.id);else onOpenDocuments(record.id);}} onChange={async(record,link)=>{const ok=await execute('project-record-link',()=>service.linkRecordToProject(record.id,link?selectedProject.id:undefined,record.version),link?'رکورد به پرونده پروژه متصل شد.':'اتصال رکورد از پروژه برداشته شد.');if(ok)setLinkingType(undefined);}}/>}
  </div>;
}

function SummaryMetric({icon: Icon, value, label, tone, active=false, onClick}: {icon: typeof FolderKanban; value: number; label: string; tone: string; active?:boolean; onClick?:()=>void}) {
  const content=<><span><Icon size={19}/></span><div><strong>{value.toLocaleString('fa-IR')}</strong><small>{label}</small></div></>;
  return onClick?<button type="button" aria-pressed={active} onClick={onClick} className={`collaboration-metric collaboration-metric--${tone}${active?' collaboration-metric--active':''}`}>{content}</button>:<article className={`collaboration-metric collaboration-metric--${tone}`}>{content}</article>;
}

function ProjectHeader({project, state, onOpenConversation, mayManage, onEdit, onTransition}: {project: OperationalRecord; state: FoundationState; onOpenConversation: (chatId:string) => void; mayManage:boolean; onEdit:()=>void; onTransition: (status: 'active'|'paused'|'completed'|'archived', reason?: string) => void}) {
  const members = projectMemberUserIds(project).map((id) => state.users.find((user) => user.id === id)).filter(Boolean);
  const progress = progressForProject(state, project.id);
  const chatId = typeof project.payload.chatId === 'string' ? project.payload.chatId : undefined;
  const chat=chatId?state.operationalRecords.find((record)=>record.id===chatId&&record.moduleId==='chat'):undefined;
  const mayOpenChat=Boolean(chat&&can(state.activeUser,permissionFor('chat','view')));
  return <section className="project-header panel">
    <div className="project-header__title"><span className="state-badge">{projectStatusLabel(project.status)}</span><h2>{project.title}</h2><p>{project.description || 'برای این پروژه هنوز شرحی ثبت نشده است.'}</p></div>
    <div className="project-header__facts"><span><UsersRound size={17}/><b>{members.length.toLocaleString('fa-IR')}</b> عضو</span><span><CalendarClock size={17}/>{project.dueAt ? formatPersianDate(project.dueAt) : 'بدون سررسید'}</span><span><CheckCircle2 size={17}/>{progress.completed.toLocaleString('fa-IR')} از {progress.total.toLocaleString('fa-IR')} کار</span></div>
    <div className="project-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`پیشرفت پروژه ${progress.percent.toLocaleString('fa-IR')} درصد`}><i><b style={{width: `${progress.percent}%`}}/></i><strong>{progress.percent.toLocaleString('fa-IR')}٪</strong></div>
    <div className="project-members" aria-label="اعضای پروژه">{members.slice(0, 7).map((member) => <span key={member!.id} title={userDisplayLabel(member!, state)}>{member!.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>)}{members.length > 7 && <span>+{(members.length - 7).toLocaleString('fa-IR')}</span>}</div>
    <div className="project-header__actions">
      {chatId && mayOpenChat && <button className="button button--secondary button--small" onClick={()=>onOpenConversation(chatId)}><MessageCircle size={15}/> گفت‌وگوی پروژه</button>}
      {mayManage&&<button className="button button--secondary button--small" onClick={onEdit}><Pencil size={15}/> ویرایش پروژه و اعضا</button>}
      {mayManage&&project.status === 'draft' && <button className="button button--primary button--small" onClick={() => onTransition('active')}><Play size={15}/> شروع پروژه</button>}
      {mayManage&&project.status === 'active' && <button className="button button--secondary button--small" onClick={() => onTransition('paused', 'توقف موقت از میز همکاری')}><Pause size={15}/> توقف</button>}
      {mayManage&&project.status === 'paused' && <button className="button button--primary button--small" onClick={() => onTransition('active', 'ازسرگیری از میز همکاری')}><RotateCcw size={15}/> ازسرگیری</button>}
      {mayManage&&['active','paused'].includes(project.status) && <button className="button button--secondary button--small" onClick={() => onTransition('completed', 'همه خروجی‌های پروژه تکمیل شد')}><Check size={15}/> تکمیل</button>}
      {mayManage&&project.status === 'completed' && <button className="button button--secondary button--small" onClick={() => onTransition('archived', 'بایگانی پروژه تکمیل‌شده')}><Archive size={15}/> بایگانی</button>}
    </div>
  </section>;
}

function TaskLane({status, tasks, state, service, execute, onTransition, onEdit}: {status: TaskBoardState; tasks: OperationalRecord[]; state: FoundationState; service: LocalFoundationService; execute: Props['execute']; onTransition: (task: OperationalRecord, target: TaskBoardState) => void; onEdit:(task:OperationalRecord)=>void}) {
  return <section className={`task-lane task-lane--${status}`}><header><strong>{taskStatusLabel(status)}</strong><b>{tasks.length.toLocaleString('fa-IR')}</b></header><div>
    {tasks.map((task) => <TaskCard key={task.id} task={task} state={state} service={service} execute={execute} onTransition={onTransition} onEdit={onEdit}/>)}
    {!tasks.length && <div className="task-lane__empty">کاری در این ستون نیست.</div>}
  </div></section>;
}

function TaskCard({task, state, service, execute, onTransition, onEdit}: {task: OperationalRecord; state: FoundationState; service: LocalFoundationService; execute: Props['execute']; onTransition: (task: OperationalRecord, target: TaskBoardState) => void; onEdit:(task:OperationalRecord)=>void}) {
  const assignee = state.users.find((user) => user.id === task.assigneeUserId);
  const checklist = taskChecklist(task);
  const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.id===taskProjectId(task));
  const isProjectOwner=project?.assigneeUserId===state.activeUser.id;
  const resource=operationalRecordResource(state.activeUser,task);
  const isManager=authorize({persona:state.activeUser,permission:permissionFor('task','manage'),action:'edit',resource}).allowed;
  const mayEdit=(task.assigneeUserId===state.activeUser.id||task.createdByUserId===state.activeUser.id||isManager||isProjectOwner)&&can(state.activeUser,permissionFor('task','edit'))&&authorize({persona:state.activeUser,permission:permissionFor('task','edit'),action:'edit',resource}).allowed;
  const mayChecklist=(task.assigneeUserId===state.activeUser.id||isManager||isProjectOwner)&&mayEdit;
  const mayTransition=(task.assigneeUserId===state.activeUser.id||isManager||isProjectOwner)&&can(state.activeUser,permissionFor('task','transition'))&&authorize({persona:state.activeUser,permission:permissionFor('task','transition'),action:'transition',resource}).allowed;
  const checklistComplete=checklist.every((item)=>item.completed);
  const needsReassignment=task.payload.needsReassignment===true;
  return <article className={`task-card${needsReassignment?' task-card--needs-reassignment':''}`}>
    <header><span className={`task-priority task-priority--${task.priority}`}>{({low:'کم',normal:'عادی',high:'زیاد',critical:'بحرانی'} as Record<string,string>)[task.priority]}</span>{task.dueAt && <time><CalendarClock size={13}/>{formatPersianDate(task.dueAt)}</time>}</header>
    <h4>{task.title}</h4>{task.description && <p>{task.description}</p>}
    {!!taskLabels(task).length && <div className="task-labels">{taskLabels(task).map((label) => <span key={label}>{label}</span>)}</div>}
    {task.status==='blocked'&&typeof task.payload.waitingReason==='string'&&task.payload.waitingReason&&<div className="task-reassignment-alert"><CircleAlert size={16}/><span>مانع: {task.payload.waitingReason}</span></div>}
    {needsReassignment&&<div className="task-reassignment-alert"><CircleAlert size={16}/><span>مسئول قبلی از پروژه حذف شده؛ مدیر یا سازنده باید مسئول تازه انتخاب کند.</span></div>}
    {!!checklist.length && <div className="task-checklist"><strong>{taskCompletionLabel(task)}</strong>{checklist.map((item) => <label key={item.id}><input type="checkbox" checked={item.completed} disabled={task.status === 'done'||!mayChecklist} onChange={() => void execute('task-checklist', () => service.setTaskChecklistItem(task.id, item.id, !item.completed, task.version), 'چک‌لیست کار به‌روز شد.')}/><span>{item.title}</span></label>)}</div>}
    <footer><span title={assignee ? userDisplayLabel(assignee,state) : 'مسئول تعیین نشده'}>{needsReassignment?'نیازمند مسئول تازه':assignee?.name ?? 'بدون مسئول'}</span><div>{mayEdit&&<button onClick={()=>onEdit(task)} aria-label={`ویرایش ${task.title}`}><Pencil size={13}/></button>}{mayTransition&&task.status === 'todo' && <button onClick={() => onTransition(task, 'in_progress')}>شروع</button>}{mayTransition&&task.status === 'in_progress' && <button onClick={() => onTransition(task, 'blocked')}>ثبت مانع</button>}{mayTransition&&task.status === 'in_progress' && <button disabled={!checklistComplete} title={!checklistComplete?'ابتدا همه ردیف‌های چک‌لیست را انجام دهید.':undefined} onClick={() => onTransition(task, 'done')}>انجام شد</button>}{mayTransition&&task.status === 'blocked' && <button onClick={() => onTransition(task, 'in_progress')}>رفع مانع</button>}</div></footer>
  </article>;
}

function ProjectDialog({state, project, onClose, onSave}: {state: FoundationState; project?:OperationalRecord; onClose: () => void; onSave: (input: ProjectInput) => Promise<void>}) {
  const mayCreateChat=can(state.activeUser,permissionFor('chat','create'));
  const [title, setTitle] = useState(project?.title??'');
  const [description, setDescription] = useState(project?.description??'');
  const [unitId, setUnitId] = useState(project?.unitId??'');
  const [dueAt, setDueAt] = useState(project?.dueAt??'');
  const [memberUserIds, setMemberUserIds] = useState<string[]>(project?projectMemberUserIds(project):[state.activeUser.id]);
  const [createChat, setCreateChat] = useState(!project&&mayCreateChat);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const membersRef = useRef<HTMLFieldSetElement>(null);
  const candidates = state.users.filter((user) => user.status === 'active' && user.companyId === state.activeUser.companyId && (!query.trim() || userDisplayLabel(user,state).includes(query.trim())));
  const initialMembers=project?projectMemberUserIds(project):[state.activeUser.id];
  const dirty=title!==(project?.title??'')||description!==(project?.description??'')||unitId!==(project?.unitId??'')||dueAt!==(project?.dueAt??'')||JSON.stringify([...memberUserIds].sort())!==JSON.stringify([...initialMembers].sort())||createChat!==(!project&&mayCreateChat);
  const safeClose = () => {
    const workspaceDiscardConfirmed=titleRef.current?.closest<HTMLElement>('.drawer-scrim, .modal-layer, .modal-scrim')?.dataset.workspaceDiscard==='true';
    if (!saving&&(workspaceDiscardConfirmed||!dirty||window.confirm('تغییرات ذخیره‌نشده این پروژه بسته شود؟'))) onClose();
  };
  const submit = async() => {
    const next = validateRequired([{label: 'نام پروژه', value: title}, {label: 'اعضای پروژه', value: memberUserIds}]);
    setErrors(next);
    if (!title.trim()) { titleRef.current?.focus(); return; }
    if (!memberUserIds.length) { membersRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus(); return; }
    if (next.length) return;
    setSaving(true);
    try { await onSave({title, description, memberUserIds, unitId: unitId || undefined, dueAt: dueAt || undefined, createChat}); }
    finally { setSaving(false); }
  };
  const ownerUserId=project?.assigneeUserId??project?.createdByUserId??state.activeUser.id;
  return <RecordDialog ariaLabel={project?'ویرایش پروژه همکاری':'ساخت پروژه همکاری'} className="collaboration-dialog" onClose={safeClose}>
    <header><div><span className="eyebrow">{project?'تنظیم فضای کاری':'فضای کاری تازه'}</span><h2>{project?'ویرایش پروژه و اعضا':'ساخت پروژه همکاری'}</h2></div><button className="icon-button" data-window-close disabled={saving} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header>
    <fieldset className="drawer-body" disabled={saving} data-workspace-dirty={dirty?'true':undefined}>
      <FormValidationSummary errors={errors}/>
      <div className="form-grid"><label className="field field--wide"><RequiredLabel>نام پروژه</RequiredLabel><input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus/></label><label className="field field--wide"><OptionalLabel>شرح و خروجی مورد انتظار</OptionalLabel><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)}/></label><label className="field"><OptionalLabel>واحد مالک</OptionalLabel><select value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">بدون واحد مشخص</option>{state.units.filter((unit) => unit.status === 'active').map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="field"><OptionalLabel>تاریخ هدف</OptionalLabel><PersianDateInput value={dueAt} onChange={setDueAt} ariaLabel="تاریخ هدف پروژه"/></label></div>
      <fieldset ref={membersRef} className="collaboration-member-picker"><legend>اعضای پروژه <RequiredLabel>حداقل یک نفر</RequiredLabel></legend><label className="search-field"><Search size={16}/><input aria-label="جست‌وجوی اعضای پروژه" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، نام کاربری، واحد یا سمت…"/></label><div>{candidates.map((user) => <label key={user.id}><input type="checkbox" checked={memberUserIds.includes(user.id)} disabled={user.id === ownerUserId} onChange={() => setMemberUserIds((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current,user.id])}/><span><strong>{user.name}{user.id===ownerUserId?' · مالک پروژه':''}</strong><small>{userDisplayLabel(user,state)}</small></span></label>)}</div></fieldset>
      {mayCreateChat&&(!project||!projectChatId(project))&&<label className="collaboration-chat-choice"><input type="checkbox" checked={createChat} onChange={(event) => setCreateChat(event.target.checked)}/><MessageCircle size={20}/><span><strong>{project?'برای این پروژه گفت‌وگو ساخته شود':'گفت‌وگوی پروژه هم ساخته شود'}</strong><small>اعضای پروژه به گروه گفت‌وگوی مرتبط افزوده می‌شوند؛ دسترسی نامه و سند همچنان مستقل می‌ماند.</small></span></label>}
    </fieldset>
    <footer><button className="button button--secondary" disabled={saving} onClick={safeClose}>انصراف</button><button className="button button--primary" disabled={saving} onClick={() => void submit()}>{saving ? 'در حال ذخیره…' : project?'ذخیره تغییرات':'ساخت پروژه'}</button></footer>
  </RecordDialog>;
}

function TaskDialog({state, project, task, onClose, onSave}: {state: FoundationState; project: OperationalRecord; task?:OperationalRecord; onClose: () => void; onSave: (input: ProjectTaskBatchInput) => Promise<void>}) {
  const initialAssigneeUserIds=task?.assigneeUserId&&projectMemberUserIds(project).includes(task.assigneeUserId)?[task.assigneeUserId]:[];
  const [title, setTitle] = useState(task?.title??'');
  const [description, setDescription] = useState(task?.description??'');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>(initialAssigneeUserIds);
  const [dueAt, setDueAt] = useState(task?.dueAt??'');
  const [reminderAt, setReminderAt] = useState(typeof task?.payload.reminderAt==='string'?task.payload.reminderAt:'');
  const [labels, setLabels] = useState(task?taskLabels(task).join('، '):'');
  const [checklist, setChecklist] = useState(task?taskChecklist(task).map((item)=>item.title).join('\n'):'');
  const [priority, setPriority] = useState<OperationalRecord['priority']>(task?.priority??'normal');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const assigneesRef = useRef<HTMLFieldSetElement>(null);
  const members = projectMemberUserIds(project).map((id) => state.users.find((user) => user.id === id)).filter((user): user is FoundationState['users'][number] => Boolean(user && user.status === 'active'));
  const dirty=title!==(task?.title??'')||description!==(task?.description??'')||dueAt!==(task?.dueAt??'')||reminderAt!==(typeof task?.payload.reminderAt==='string'?task.payload.reminderAt:'')||labels!==(task?taskLabels(task).join('، '):'')||checklist!==(task?taskChecklist(task).map((item)=>item.title).join('\n'):'')||priority!==(task?.priority??'normal')||JSON.stringify(assigneeUserIds)!==JSON.stringify(initialAssigneeUserIds);
  const safeClose = () => {
    const workspaceDiscardConfirmed=titleRef.current?.closest<HTMLElement>('.drawer-scrim, .modal-layer, .modal-scrim')?.dataset.workspaceDiscard==='true';
    if (!saving&&(workspaceDiscardConfirmed||!dirty||window.confirm('تغییرات ذخیره‌نشده این کار بسته شود؟'))) onClose();
  };
  const submit = async() => {
    const next = validateRequired([{label: 'عنوان کار', value: title}, {label: 'مسئول کار', value: assigneeUserIds}]);
    setErrors(next);
    if (!title.trim()) { titleRef.current?.focus(); return; }
    if (!assigneeUserIds.length) { assigneesRef.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus(); return; }
    if (next.length) return;
    setSaving(true);
    try { await onSave({title, description, projectId: project.id, assigneeUserIds, dueAt: dueAt || undefined, reminderAt: reminderAt || undefined, labels: labels.split(/[،,]/).map((item) => item.trim()).filter(Boolean), checklist: checklist.split('\n').map((item) => item.trim()).filter(Boolean).map((item) => ({title: item})), priority}); }
    finally { setSaving(false); }
  };
  return <RecordDialog ariaLabel={task?`ویرایش کار ${project.title}`:`افزودن کار به ${project.title}`} className="collaboration-dialog" onClose={safeClose}>
    <header><div><span className="eyebrow">{project.title}</span><h2>{task?'ویرایش کار پروژه':'افزودن کار پروژه'}</h2></div><button className="icon-button" data-window-close disabled={saving} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header>
    <fieldset className="drawer-body" disabled={saving} data-workspace-dirty={dirty?'true':undefined}>
      <FormValidationSummary errors={errors}/><div className="form-grid"><label className="field field--wide"><RequiredLabel>عنوان کار</RequiredLabel><input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus/></label><label className="field field--wide"><OptionalLabel>شرح</OptionalLabel><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)}/></label><label className="field"><OptionalLabel>سررسید</OptionalLabel><PersianDateInput value={dueAt} onChange={setDueAt} ariaLabel="سررسید کار"/></label><label className="field"><OptionalLabel>یادآوری</OptionalLabel><PersianDateInput value={reminderAt} onChange={setReminderAt} ariaLabel="تاریخ یادآوری کار"/></label><label className="field"><RequiredLabel>اولویت</RequiredLabel><select value={priority} onChange={(event) => setPriority(event.target.value as OperationalRecord['priority'])}><option value="low">کم</option><option value="normal">عادی</option><option value="high">زیاد</option><option value="critical">بحرانی</option></select></label><label className="field"><OptionalLabel>برچسب‌ها</OptionalLabel><input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="مثلاً طراحی، مالی"/></label>{!task&&<label className="field field--wide"><OptionalLabel>چک‌لیست؛ هر مورد در یک خط</OptionalLabel><textarea rows={4} value={checklist} onChange={(event) => setChecklist(event.target.value)} placeholder={'جمع‌آوری نیازمندی\nتأیید خروجی\nتحویل نهایی'}/></label>}</div>
      <fieldset ref={assigneesRef} className="collaboration-member-picker"><legend>مسئول کار <RequiredLabel>{task?'یک نفر':'یک یا چند نفر'}</RequiredLabel></legend><p>{task?'تغییر مسئول با ثبت نسخه و تاریخچه انجام می‌شود؛ مسئول تازه باید عضو فعال همین پروژه باشد.':'برای جلوگیری از ابهام مسئولیت، اگر چند نفر انتخاب شوند برای هر نفر یک کار مستقل ساخته می‌شود.'}</p><div>{members.map((user) => <label key={user.id}><input type={task?'radio':'checkbox'} name={task?'project-task-assignee':undefined} checked={assigneeUserIds.includes(user.id)} onChange={() => setAssigneeUserIds((current) => task?[user.id]:current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current,user.id])}/><span><strong>{user.name}</strong><small>{userDisplayLabel(user,state)}</small></span></label>)}</div></fieldset>
    </fieldset>
    <footer><button className="button button--secondary" disabled={saving} onClick={safeClose}>انصراف</button><button className="button button--primary" disabled={saving} onClick={() => void submit()}>{saving ? 'در حال ذخیره…' : task?'ذخیره تغییرات':'ساخت کار'}</button></footer>
  </RecordDialog>;
}

function ProjectRecordLinkDialog({kind,project,state,mayManage,onClose,onChange,onOpenRecord}:{
  kind:'letter'|'document';
  project:OperationalRecord;
  state:FoundationState;
  mayManage:boolean;
  onClose:()=>void;
  onChange:(record:OperationalRecord,link:boolean)=>Promise<void>;
  onOpenRecord:(record:OperationalRecord)=>void;
}){
  const [query,setQuery]=useState('');
  const [busyId,setBusyId]=useState<string>();
  const records=state.operationalRecords.filter((record)=>record.moduleId===kind&&(mayManage?(!record.payload.projectId||record.payload.projectId===project.id):record.payload.projectId===project.id)&&authorize({persona:state.activeUser,permission:permissionFor(record.moduleId,'view'),action:'view',resource:operationalRecordResource(state.activeUser,record)}).allowed);
  const normalized=query.trim().toLocaleLowerCase('fa');
  const visible=records.filter((record)=>`${record.title} ${record.trackingCode}`.toLocaleLowerCase('fa').includes(normalized));
  const safeClose=()=>{if(!busyId)onClose();};
  const change=async(record:OperationalRecord,link:boolean)=>{if(busyId)return;setBusyId(record.id);try{await onChange(record,link);}finally{setBusyId(undefined);}};
  return <RecordDialog ariaLabel={`${mayManage?'مدیریت پیوند':'نمایش'} ${kind==='letter'?'نامه‌ها':'اسناد'}ی پروژه`} className="collaboration-dialog" onClose={safeClose}>
    <header><div><span className="eyebrow">{project.title}</span><h2>{mayManage?'پیوند':'فهرست'} {kind==='letter'?'نامه':'سند'} پروژه</h2></div><button className="icon-button" disabled={Boolean(busyId)} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="drawer-body">
      <p className="notice">پیوند پروژه فقط برای جمع‌کردن پرونده همکاری است و سطح محرمانگی یا مجوز اصلی نامه و سند را تغییر نمی‌دهد.</p>
      <label className="search-field"><Search size={17}/><input aria-label={`جست‌وجوی ${kind==='letter'?'نامه‌ها':'اسناد'}ی پروژه`} autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="جست‌وجوی موضوع یا شماره…"/></label>
      <div className="collaboration-record-link-list">{visible.map((record)=>{const linked=record.payload.projectId===project.id;return <article key={record.id}>
        <span><strong>{record.title}</strong><small dir="ltr">{record.trackingCode}</small></span>
        <div className="collaboration-record-link-actions">
          <button className="button button--small button--ghost" aria-label={`بازکردن ${record.title}، ${record.trackingCode}`} disabled={Boolean(busyId)} onClick={()=>onOpenRecord(record)}>بازکردن</button>
          {mayManage&&<button className={`button button--small ${linked?'button--danger':'button--secondary'}`} aria-label={`${linked?'برداشتن پیوند':'اتصال به پروژه'} برای ${record.title}، ${record.trackingCode}`} disabled={Boolean(busyId)} onClick={()=>void change(record,!linked)}>{busyId===record.id?'در حال ثبت…':linked?'برداشتن پیوند':'اتصال به پروژه'}</button>}
        </div>
      </article>;})}{!visible.length&&<div className="empty-state"><FileText size={30}/><strong>رکورد قابل نمایش پیدا نشد</strong><span>فقط رکوردهایی که مجوز مشاهده‌شان را دارید در این فهرست دیده می‌شوند.</span></div>}</div>
    </div>
    <footer><button className="button button--ghost" disabled={Boolean(busyId)} onClick={safeClose}>بستن</button></footer>
  </RecordDialog>;
}
