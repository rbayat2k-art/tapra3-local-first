import type {OperationalRecord} from './model';

export interface RoleCartableCategory {
  id: string;
  label: string;
  matches: (record: OperationalRecord) => boolean;
}

const inStatuses = (...statuses: string[]) => (record: OperationalRecord) => statuses.includes(record.status);
const all = (_record: OperationalRecord) => true;

export function roleCartableCategories(moduleId: string, roleIds: string[], activeUserId: string): RoleCartableCategory[] {
  if (moduleId === 'employee-advance' && roleIds.includes('role-advance-branch-manager')) return [
    {id: 'advance-branch-action', label: 'بررسی مدیر شعبه', matches: (record) => record.status === 'branch_review'},
    {id: 'advance-branch-flow', label: 'در گردش شعبه', matches: inStatuses('accounting_review','final_review','sent_to_treasury')},
    {id: 'advance-branch-closed', label: 'پرداخت یا ردشده', matches: inStatuses('paid','rejected')},
    {id: 'advance-branch-all', label: 'همه مساعده‌های شعبه', matches: all},
  ];
  if (moduleId === 'employee-advance' && roleIds.includes('role-advance-accounting-reviewer')) return [
    {id: 'advance-accounting-action', label: 'نیازمند کنترل حسابداری', matches: (record) => record.status === 'accounting_review'},
    {id: 'advance-accounting-forwarded', label: 'ارسال‌شده از حسابداری', matches: inStatuses('final_review','sent_to_treasury','paid')},
    {id: 'advance-accounting-all', label: 'همه مساعده‌ها', matches: all},
  ];
  if (moduleId === 'employee-advance' && roleIds.includes('role-sales-advance-approver')) return [
    {id: 'advance-final-action', label: 'نیازمند تأیید اصلی', matches: (record) => record.status === 'final_review'},
    {id: 'advance-proxy', label: 'ثبت‌های نیابتی من', matches: (record) => record.createdByUserId === activeUserId},
    {id: 'advance-final-treasury', label: 'ارسال‌شده به خزانه', matches: inStatuses('sent_to_treasury','paid')},
    {id: 'advance-final-all', label: 'همه مساعده‌های محدوده من', matches: all},
  ];
  if (moduleId === 'employee-advance') return [
    {id: 'advance-my-action', label: 'نیازمند اقدام من', matches: (record) => ['draft','needs_correction'].includes(record.status) && (record.createdByUserId === activeUserId || record.assigneeUserId === activeUserId)},
    {id: 'advance-my-flow', label: 'در گردش', matches: inStatuses('branch_review','accounting_review','final_review')},
    {id: 'advance-my-treasury', label: 'خزانه', matches: inStatuses('sent_to_treasury')},
    {id: 'advance-my-closed', label: 'پرداخت یا ردشده', matches: inStatuses('paid','rejected')},
    {id: 'advance-my-all', label: 'همه درخواست‌های من', matches: all},
  ];
  if (moduleId === 'purchase-request' && roleIds.includes('role-purchase-requester')) return [
    {id: 'requester-action', label: 'نیازمند اقدام من', matches: inStatuses('draft', 'needs_correction')},
    {id: 'requester-approval', label: 'در انتظار تأیید', matches: inStatuses('submitted', 'purchase_review', 'purchase_approved')},
    {id: 'requester-treasury', label: 'در خزانه', matches: inStatuses('sent_to_treasury')},
    {id: 'requester-closed', label: 'پرداخت، رد یا بسته‌شده', matches: inStatuses('paid', 'rejected', 'cancelled')},
    {id: 'requester-all', label: 'همه درخواست‌های من', matches: all},
  ];

  if (moduleId === 'purchase-request' && roleIds.includes('role-purchase-approver')) return [
    {id: 'approver-action', label: 'نیازمند بررسی من', matches: (record) => ['submitted', 'purchase_review', 'purchase_approved'].includes(record.status) && record.assigneeUserId === activeUserId},
    {id: 'approver-chain', label: 'در گردش تأیید', matches: (record) => ['submitted', 'purchase_review', 'purchase_approved'].includes(record.status) && record.assigneeUserId !== activeUserId},
    {id: 'approver-correction', label: 'نیازمند اصلاح', matches: inStatuses('needs_correction')},
    {id: 'approver-treasury', label: 'در خزانه', matches: inStatuses('sent_to_treasury')},
    {id: 'approver-closed', label: 'پرداخت، رد یا بسته‌شده', matches: inStatuses('paid', 'rejected', 'cancelled')},
    {id: 'approver-all', label: 'همه درخواست‌ها', matches: all},
  ];

  if (moduleId === 'treasury-execution' && roleIds.includes('role-treasury-executor-v1')) return [
    {id: 'payer-action', label: 'در صف پرداخت', matches: inStatuses('queued', 'claimed')},
    {id: 'payer-recorded', label: 'پرداخت ثبت‌شده', matches: inStatuses('payment_recorded')},
    {id: 'payer-completed', label: 'تکمیل‌شده', matches: inStatuses('verified', 'completed')},
    {id: 'payer-all', label: 'همه پرداخت‌های من', matches: all},
  ];

  return [];
}
