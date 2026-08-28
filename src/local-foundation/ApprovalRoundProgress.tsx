import {CheckCircle2,Clock3,ShieldAlert} from 'lucide-react';
import type {FoundationState,OperationalRecord} from './model';

const modeLabel={ANY:'تأیید یک نفر کافی است',ALL:'تأیید همه لازم است',N_OF_M:'حد نصاب چندنفره'} as const;

export function ApprovalRoundProgress({state,record}:{state:FoundationState;record:OperationalRecord}){
  const round=[...(state.approvalRounds??[])]
    .filter((item)=>item.recordId===record.id&&item.entryRecordVersion===record.version&&item.stateId===record.status)
    .sort((left,right)=>right.createdAt.localeCompare(left.createdAt))[0];
  if(!round)return null;
  const mine=round.currentVote;
  return <section className={`approval-progress approval-progress--${round.status}`} aria-label="وضعیت دور تأیید">
    <header><span>{round.status==='needs_reassignment'?<ShieldAlert size={18}/>:round.status==='approved'?<CheckCircle2 size={18}/>:<Clock3 size={18}/>}<strong>{round.approvedCount.toLocaleString('fa-IR')} از {round.requiredCount.toLocaleString('fa-IR')} تأیید</strong></span><small>{round.legacyBootstrap?'قانون قدیمی — یک تصمیم‌گیر':modeLabel[round.mode]}</small></header>
    <div className="approval-progress__bar" aria-hidden="true"><span style={{width:`${Math.min(100,(round.approvedCount/Math.max(1,round.requiredCount))*100)}%`}}/></div>
    <div className="approval-progress__people">{round.pendingUserIds.map((userId)=>{const user=state.users.find((item)=>item.id===userId);return <span key={userId} className="is-pending"><b>{user?.name??'کاربر مجاز'}</b><small>در انتظار رأی</small></span>;})}</div>
    {mine&&<p>رأی شما ثبت شده است و در این دور قابل حذف یا جایگزینی نیست.</p>}
  </section>;
}
