import { User, SystemPermission } from '../types';
import { hasPermission } from './permissions';

// Pure, testable login validation — extracted from LoginRegisterModal.tsx's handleLogin so
// the exact same rules can be unit-tested without rendering the component. Behavior must
// stay identical to the UI: case-insensitive username match, strict password match (no
// universal bypass password — '123456' only works for an account whose REAL stored password
// is '123456'), inactive accounts rejected.
export function validateLogin(
  username: string,
  password: string,
  users: User[]
): { ok: true; user: User } | { ok: false; error: string } {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  if (!cleanUser || !cleanPass) {
    return { ok: false, error: 'لطفاً نام کاربری و رمز عبور را وارد نمایید.' };
  }

  const foundUser = users.find((u) => u.username.toLowerCase() === cleanUser);
  if (!foundUser) {
    return { ok: false, error: 'نام کاربری یا رمز عبور اشتباه است.' };
  }

  // Strict match only — no bypass password of any kind. '123456' passes here only when it
  // is literally this account's stored password, same as any other value would.
  if (foundUser.password && foundUser.password !== cleanPass) {
    return { ok: false, error: 'رمز عبور وارد شده نادرست است.' };
  }

  if (foundUser.isActive === false) {
    return { ok: false, error: 'حساب کاربری شما هنوز توسط مدیر سیستم تایید و فعال نشده است. لطفاً منتظر بررسی توسط ادمین باشید.' };
  }

  return { ok: true, user: foundUser };
}

// Pure, testable Impersonation start-gate. Having the `impersonate_users` permission is NOT
// sufficient by itself — the REAL underlying identity (realActor, never the currently-viewed
// impersonated identity) must also have base role 'admin'. This means even if a non-admin
// role is mistakenly granted `impersonate_users` (e.g. via a custom role or override), they
// still cannot start Impersonation, because the role check is independent and mandatory.
// Nested Impersonation is fully blocked (alreadyImpersonating !== null rejects outright,
// it does not just skip re-recording the original admin).
export function canStartImpersonation(
  realActor: User | null,
  alreadyImpersonating: User | null,
  targetUser: User | null,
  effectivePermissions: SystemPermission[] | null
): { ok: true } | { ok: false; reason: string } {
  if (!realActor) {
    return { ok: false, reason: 'هویت واقعی کاربر مشخص نیست.' };
  }
  if (realActor.role !== 'admin') {
    return { ok: false, reason: 'فقط ادمین ارشد سیستم مجاز به ورود به حساب کاربران دیگر است.' };
  }
  if (!hasPermission(effectivePermissions, ['impersonate_users'])) {
    return { ok: false, reason: 'این حساب مجوز Impersonation (impersonate_users) ندارد.' };
  }
  if (alreadyImpersonating !== null) {
    return { ok: false, reason: 'در حال حاضر یک نشست Impersonation دیگر باز است — Impersonation تودرتو مجاز نیست.' };
  }
  if (!targetUser) {
    return { ok: false, reason: 'کاربر مقصد یافت نشد.' };
  }
  if (targetUser.isActive === false) {
    return { ok: false, reason: 'کاربر مقصد غیرفعال است.' };
  }
  return { ok: true };
}
