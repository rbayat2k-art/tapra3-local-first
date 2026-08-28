# پیکربندی اجرای محلی

> **وضعیت:** `Verified` — runtime فعلی متغیر محیطی الزامی ندارد و فایل `.env` منبع حقیقت نیست.

## ماتریس پیکربندی

| نام یا محل | هدف | الزام | پیش‌فرض | Secret | رفتار خطا | منبع |
|---|---|---|---|---|---|---|
| Vite port | dev server | اختیاری | `3000` در script | خیر | اشغال بودن port باعث خطای/انتخاب Vite می‌شود | `package.json` |
| `FOUNDATION_DB_NAME` | نام IndexedDB | ثابت کد | `tapra2_local` | خیر | تغییر نام دیتابیس تازه می‌سازد | `model.ts` |
| `FOUNDATION_SCHEMA_VERSION` | upgrade ساختاری | ثابت کد | `9` | خیر | snapshot ناسازگار رد می‌شود | `model.ts` |
| `FOUNDATION_SEED_VERSION` | تشخیص seed قطعی | ثابت کد | نسخه فعال مدل | خیر | initialize نسخه را تطبیق می‌دهد | `model.ts`, `seed.ts` |
| UI preferences | theme/font/density/sidebar | اختیاری کاربر | UI defaults | خیر | مقدار خراب باید fallback شود | UI/localStorage |
| backup password | رمز snapshot | اختیاری هنگام export/import | ندارد | بله، transient | رمز غلط decrypt را رد می‌کند | `snapshot.ts` |

## موارد نامرتبط در این فاز

Backend URL، database URL، JWT secret، SMS provider، object storage، queue، cache و telemetry endpoint وجود ندارند. افزودن هرکدام تغییر معماری آینده و نیازمند ADR و threat model جدید است.

## اصل امنیتی

هیچ password، recovery code یا backup password نباید در `.env.example`، docs، log یا commit ثبت شود. credentialهای seed فقط برای پذیرش محلی‌اند و برای Production معتبر نیستند.

