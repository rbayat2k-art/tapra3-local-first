const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Phase 1 is intentionally a local, synthetic-data-only prototype. Browser
 * builds served from any non-local host fail closed; Vitest has no Location
 * and remains enabled for deterministic fixtures.
 */
export function legalSyntheticPrototypeEnabled(): boolean {
  const hostname = globalThis.location?.hostname;
  return hostname === undefined || LOCAL_HOSTS.has(hostname);
}

export function assertLegalSyntheticPrototypeEnabled(): void {
  if (!legalSyntheticPrototypeEnabled()) {
    throw new Error('واحد حقوقی آزمایشی فقط در محیط محلی و با داده کاملاً مصنوعی فعال است.');
  }
}

const SYNTHETIC_MARKER = /(آزمایشی|مصنوعی|ساختگی|\bqa\b|\btest\b)/iu;

export function assertSyntheticLabel(...values: Array<string | undefined>): void {
  if (!values.some((value) => value && SYNTHETIC_MARKER.test(value))) {
    throw new Error('برای جلوگیری از ورود داده واقعی، عنوان باید صریحاً شامل «آزمایشی»، «مصنوعی»، «ساختگی»، QA یا TEST باشد.');
  }
}
