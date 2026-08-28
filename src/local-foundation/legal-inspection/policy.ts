import {authorize} from '../authorization';
import type {DemoResource, LocalUser, PermissionCode, SecurityRole} from '../model';
import type {CompanyBankAccountDetail, LegalCase, LegalEntity} from './model';

export const LEGAL_PERMISSIONS = {
  caseView: 'legal.case.basic.view',
  caseCreate: 'legal.case.basic.create',
  caseEdit: 'legal.case.basic.edit',
  partyIdentityView: 'legal.party.identity.view',
  partyManage: 'legal.party.identity.manage',
  bankMaskedView: 'legal.bank.masked.view',
  bankFullView: 'legal.bank.full.view',
  bankAccountManage: 'legal.bank_account.manage',
  masterDataView: 'legal.master_data.view',
  masterDataManage: 'legal.master_data.manage',
  invoiceSummaryView: 'legal.invoice.summary.view',
  proceedingView: 'legal.proceeding.summary.view',
  proceedingManage: 'legal.proceeding.manage',
  noticeView: 'legal.notice.metadata.view',
  noticeManage: 'legal.notice.manage',
  deadlineView: 'legal.deadline.view',
  deadlineManage: 'legal.deadline.manage',
  documentMetadataView: 'legal.document.metadata.view',
  documentMetadataManage: 'legal.document.metadata.manage',
} as const satisfies Record<string, PermissionCode>;

export function legalCaseResource(record: LegalCase, users: LocalUser[]): DemoResource {
  const owner = users.find((user) => user.id === record.primaryOwnerUserId);
  return {
    id: record.id,
    companyId: record.companyId,
    ownerId: owner?.actorId,
    createdBy: record.createdByActorId,
    state: record.status,
    allowedRecordActorIds: owner ? [owner.actorId] : [],
  };
}

export function legalEntityResource(entity: LegalEntity): DemoResource {
  return {id: entity.id, companyId: entity.companyId, createdBy: 'system', state: entity.status};
}

export function legalBankAccountResource(account: CompanyBankAccountDetail): DemoResource {
  return {id: account.id, companyId: account.companyId, createdBy: 'system', state: account.status};
}

export function legalAllowed(user: LocalUser, roles: SecurityRole[], permission: PermissionCode, resource: DemoResource, action: 'view'|'create'|'edit' = 'view'): boolean {
  if (user.permissionDenials?.includes(permission)) return false;
  const assignedRoles=roles.filter((role)=>role.status==='active'&&role.permissions.includes(permission)&&user.roleIds.includes(role.id));
  if (!assignedRoles.length) return false;
  const legalPersona:LocalUser={
    ...user,
    isAdmin:false,
    permissions:[permission],
    permissionEntitlements:assignedRoles.map((role)=>({permission,scope:role.scope,source:'role',sourceRoleId:role.id})),
  };
  return authorize({persona:legalPersona,permission,resource,action}).allowed;
}
