import {authorize} from '../authorization';
import type {DemoResource, LocalUser, PermissionCode, SecurityRole} from '../model';

export const TREASURY_MASTER_PERMISSIONS={
  view:'treasury.reference.view',
  manage:'treasury.reference.manage',
  officerView:'treasury.reference.officer.view',
  officerManage:'treasury.reference.officer.manage',
  bankMaskedView:'treasury.bank.masked.view',
  bankFullView:'treasury.bank.full.view',
  bankAccountManage:'treasury.bank_account.manage',
} as const satisfies Record<string,PermissionCode>;

export const treasuryMasterRouteAllowed=(user:LocalUser)=>user.permissions.includes(TREASURY_MASTER_PERMISSIONS.view);

export function treasuryMasterAllowed(user:LocalUser,roles:SecurityRole[],permission:PermissionCode,resource:DemoResource,action:'view'|'create'|'edit'='view'){
  if(user.permissionDenials?.includes(permission))return false;
  const assigned=roles.filter((role)=>role.status==='active'&&role.permissions.includes(permission)&&user.roleIds.includes(role.id));
  if(!assigned.length)return false;
  const persona:LocalUser={...user,isAdmin:false,permissions:[permission],permissionEntitlements:assigned.map((role)=>({permission,scope:role.scope,source:'role',sourceRoleId:role.id}))};
  return authorize({persona,permission,resource,action}).allowed;
}

export const treasuryMasterResource=(id:string,companyId:string,state='active'):DemoResource=>({id,companyId,createdBy:'system',state});
