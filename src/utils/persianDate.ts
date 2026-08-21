// Persian Date utility & Unique Tracking Code Generator

export function getJalaliNow(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    calendar: 'persian',
  };
  
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    const hour = parts.find(p => p.type === 'hour')?.value || '12';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    return `${year}/${month}/${day} - ${hour}:${minute}`;
  } catch {
    return '1403/05/10 - 12:00';
  }
}

/**
 * Same as getJalaliNow but includes seconds - used where the exact second of
 * registration matters (e.g. after-sales support call logging).
 */
export function getJalaliNowWithSeconds(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    calendar: 'persian',
  };

  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    const hour = parts.find(p => p.type === 'hour')?.value || '12';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const second = parts.find(p => p.type === 'second')?.value || '00';
    return `${year}/${month}/${day} - ${hour}:${minute}:${second}`;
  } catch {
    return '1403/05/10 - 12:00:00';
  }
}

/**
 * Generates unique tracking code: 5 digits with 1 Capital letter prefix
 * e.g. K50001, K50002
 */
export function getJalaliToday(): string {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    calendar: 'persian',
  };
  
  try {
    const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', options);
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '1403';
    const month = parts.find(p => p.type === 'month')?.value || '05';
    const day = parts.find(p => p.type === 'day')?.value || '10';
    return `${year}/${month}/${day}`;
  } catch {
    return '1403/05/10';
  }
}

// Jalali <-> Gregorian conversion (standard public-domain algorithm, e.g. jalaali-js).
// Needed because Intl only converts Gregorian->Jalali for display; picking a future
// Jalali date (transfer scheduling) requires the reverse direction too.
function jdiv(a: number, b: number): number { return Math.trunc(a / b); }
function jmod(a: number, b: number): number { return a - Math.floor(a / b) * b; }
const JALALI_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = JALALI_BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = JALALI_BREAKS[0];
  if (jy < jp || jy >= JALALI_BREAKS[bl - 1]) {
    throw new Error(`Jalali year out of supported range: ${jy}`);
  }
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = JALALI_BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + jdiv(jump, 33) * 8 + jdiv(jmod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + jdiv(n, 33) * 8 + jdiv(jmod(n, 33) + 3, 4);
  if (jmod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = jdiv(gy, 4) - jdiv((jdiv(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + jdiv(jump + 4, 33) * 33;
  let leap = jmod(jmod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy: number, gm: number, gd: number): number {
  let d = jdiv((gy + jdiv(gm - 8, 6) + 100100) * 1461, 4)
    + jdiv(153 * jmod(gm + 9, 12) + 2, 5)
    + gd - 34840408;
  d = d - jdiv(jdiv(gy + 100100 + jdiv(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + jdiv(jdiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = jdiv(jmod(j, 1461), 4) * 5 + 308;
  const gd = jdiv(jmod(i, 153), 5) + 1;
  const gm = jmod(jdiv(i, 153), 12) + 1;
  const gy = jdiv(j, 1461) - 100100 + jdiv(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - jdiv(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd: number;
  let jm: number;
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + jdiv(k, 31);
      jd = jmod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + jdiv(k, 30);
  jd = jmod(k, 30) + 1;
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { year: number; month: number; day: number } {
  const g = d2g(j2d(jy, jm, jd));
  return { year: g.gy, month: g.gm, day: g.gd };
}
export function gregorianToJalali(gy: number, gm: number, gd: number): { year: number; month: number; day: number } {
  const j = d2j(g2d(gy, gm, gd));
  return { year: j.jy, month: j.jm, day: j.jd };
}
export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 1;
}
export function getJalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/**
 * Converts a Jalali date + wall-clock time picked by the user into a standard,
 * sortable ISO timestamp for storage. Wall-clock time is treated as Asia/Tehran
 * local time — the same implicit-local-time assumption already used by
 * getJalaliNow()/getJalaliNowWithSeconds() elsewhere in this project (no server,
 * single-timezone prototype).
 */
export function jalaliDateTimeToIso(jy: number, jm: number, jd: number, hh: number, mm: number, ss = 0): string {
  const g = jalaliToGregorian(jy, jm, jd);
  return new Date(g.year, g.month - 1, g.day, hh, mm, ss, 0).toISOString();
}

/**
 * Reverse of jalaliDateTimeToIso — used to initialize/redisplay a picker from a
 * previously stored ISO timestamp.
 */
export function isoToJalaliDateTimeParts(iso: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const d = new Date(iso);
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return { year: j.year, month: j.month, day: j.day, hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
}

/** Formats an ISO timestamp as a Persian-calendar display string: YYYY/MM/DD - HH:mm:ss */
export function formatIsoAsJalaliDisplay(iso: string): string {
  const p = isoToJalaliDateTimeParts(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}/${pad(p.month)}/${pad(p.day)} - ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function generateAutoLetterNumber(seqCounter: number = 101): string {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const today = getJalaliToday();
  const year = today.split('/')[0] || '1403';
  return `${seqCounter}/${year}/ب-${hours}:${minutes}`;
}
export function generateTrackingCode(counter: number): string {
  const prefixes = ['K', 'P', 'A', 'M', 'S', 'T'];
  const prefix = prefixes[counter % prefixes.length];
  const numberPart = (50000 + counter).toString();
  return `${prefix}${numberPart}`;
}
