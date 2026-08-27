import type {FoundationState, OperationalRecord} from './model';
import {chatUnreadCount} from './communications';
import {projectMemberUserIds, taskChecklist, taskProjectId} from './collaborationDomain';

const TERMINAL_TASK_STATES = new Set(['done', 'completed', 'cancelled', 'rejected', 'archived']);
const ACTIVE_PROJECT_STATES = new Set(['draft', 'active', 'paused']);
const LETTER_ACTION_STATES = new Set(['in_review', 'approved_for_send']);

export interface CollaborationSummary {
  activeProjects: number;
  todayTasks: number;
  overdueTasks: number;
  waitingOnOthers: number;
  unreadMessages: number;
  actionableLetters: number;
}

export interface ProjectProgress {
  completed: number;
  total: number;
  percent: number;
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`;
}

function dueDateKey(record: OperationalRecord): string | undefined {
  if (!record.dueAt) return undefined;
  const date = new Date(record.dueAt);
  return Number.isNaN(date.getTime()) ? undefined : localDateKey(date);
}

export function projectRecords(state: FoundationState): OperationalRecord[] {
  return state.operationalRecords
    .filter((record) => record.moduleId === 'project')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function projectTasks(state: FoundationState, projectId?: string): OperationalRecord[] {
  return state.operationalRecords
    .filter((record) => record.moduleId === 'task' && (!projectId || taskProjectId(record) === projectId))
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || b.updatedAt.localeCompare(a.updatedAt));
}

export function progressForProject(state: FoundationState, projectId: string): ProjectProgress {
  const tasks = projectTasks(state, projectId);
  const completed = tasks.filter((task) => TERMINAL_TASK_STATES.has(task.status)).length;
  return {completed, total: tasks.length, percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0};
}

export function collaborationSummary(state: FoundationState, now = new Date()): CollaborationSummary {
  const user = state.activeUser;
  const today = localDateKey(now);
  const tasks = projectTasks(state);
  const assignedOpenTasks = tasks.filter((record) => record.assigneeUserId === user.id && !TERMINAL_TASK_STATES.has(record.status));
  const chats = state.operationalRecords.filter((record) => record.moduleId === 'chat');
  const letters = state.operationalRecords.filter((record) => record.moduleId === 'letter');
  return {
    activeProjects: projectRecords(state).filter((record) => ACTIVE_PROJECT_STATES.has(record.status) && projectMemberUserIds(record).includes(user.id)).length,
    todayTasks: assignedOpenTasks.filter((record) => dueDateKey(record) === today).length,
    overdueTasks: assignedOpenTasks.filter((record) => {
      const due = dueDateKey(record);
      return Boolean(due && due < today);
    }).length,
    waitingOnOthers: tasks.filter((record) => record.createdByUserId === user.id && record.assigneeUserId !== user.id && !TERMINAL_TASK_STATES.has(record.status)).length,
    unreadMessages: chats.reduce((total, chat) => total + chatUnreadCount(state, chat.id, user.id), 0),
    actionableLetters: letters.filter((record) => record.assigneeUserId === user.id && LETTER_ACTION_STATES.has(record.status)).length,
  };
}

export function taskCompletionLabel(record: OperationalRecord): string {
  const checklist = taskChecklist(record);
  if (!checklist.length) return 'بدون چک‌لیست';
  const completed = checklist.filter((item) => item.completed).length;
  return `${completed.toLocaleString('fa-IR')} از ${checklist.length.toLocaleString('fa-IR')} مورد`;
}

export function taskStatusLabel(status: string): string {
  return ({todo: 'برای انجام', in_progress: 'در حال انجام', blocked: 'مسدود و منتظر رفع مانع', done: 'انجام‌شده'} as Record<string, string>)[status] ?? status;
}

export function projectStatusLabel(status: string): string {
  return ({draft: 'پیش‌نویس', active: 'فعال', paused: 'متوقف', completed: 'تکمیل‌شده', archived: 'بایگانی'} as Record<string, string>)[status] ?? status;
}
