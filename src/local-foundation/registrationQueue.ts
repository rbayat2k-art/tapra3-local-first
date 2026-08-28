import type {RegistrationRequest} from './model';

export type RegistrationQueueLane = 'hr' | 'applicant' | 'activation' | 'closed';

export interface RegistrationQueueInsight {
  request: RegistrationRequest;
  lane: RegistrationQueueLane;
  nextAction: string;
  ageDays: number;
  stale: boolean;
}

const DAY_MS = 86_400_000;

export function registrationQueueInsight(request: RegistrationRequest, now = new Date()): RegistrationQueueInsight {
  const lane: RegistrationQueueLane = request.status === 'needs_correction'
    ? 'applicant'
    : request.status === 'approved'
      ? 'activation'
      : request.status === 'rejected' || request.status === 'activated'
        ? 'closed'
        : 'hr';
  const nextAction: Record<RegistrationRequest['status'], string> = {
    submitted: 'شروع بررسی توسط منابع انسانی',
    in_review: 'ثبت تصمیم منابع انسانی',
    needs_correction: 'در انتظار اصلاح اطلاعات متقاضی',
    approved: 'فعال‌سازی حساب توسط مدیر سامانه',
    rejected: 'پرونده بسته شده است',
    activated: 'حساب و پرونده پرسنلی ساخته شده است',
  };
  const updatedAt = new Date(request.updatedAt).getTime();
  const ageDays = Number.isFinite(updatedAt) ? Math.max(0, Math.floor((now.getTime() - updatedAt) / DAY_MS)) : 0;
  return {request, lane, nextAction: nextAction[request.status], ageDays, stale: lane !== 'closed' && ageDays >= 3};
}

export function registrationQueueLaneLabel(lane: RegistrationQueueLane) {
  return {hr: 'منابع انسانی', applicant: 'متقاضی', activation: 'مدیر سامانه', closed: 'بسته‌شده'}[lane];
}
