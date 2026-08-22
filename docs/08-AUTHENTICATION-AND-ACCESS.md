# احراز هویت و کنترل دسترسی

> **وضعیت سند:** `Verified` برای اجرای محلی؛ `Planned` برای Production

## ورود محلی

- کاربر با username/password وارد می‌شود؛ username case-insensitive مقایسه می‌شود.
- Hash رمز با PBKDF2/SHA-256 و salt تصادفی ساخته می‌شود؛ رمز خام در IndexedDB/Audit ذخیره نمی‌شود.
- session فعال در store `sessions` نگهداری می‌شود؛ Cookie، JWT یا refresh token وجود ندارد.
- حساب غیرفعال اجازه ورود ندارد.
- بازیابی رمز و یادآوری نام کاربری شبیه‌سازی SMS محلی است و ارسال خارجی انجام نمی‌دهد.

## مدل مجوز

```text
Active roles + user grants − user denials
→ permission check
→ company/scope check
→ resource policy
→ maker/checker
→ workflow transition guard
```

Scopeهای اصلی `COMPANY`، `UNIT`، `TEAM`، `SELF` و `RECORD` هستند. نقش فعال و مجوز فعال لازم است. مجوزهای اختصاصی کاربر می‌توانند مجوز مؤثر را اضافه یا منع کنند.

## Admin و QA

- `Verified` — Admin برای permissionهای عمومی bypass صریح دارد، اما context و Audit حفظ می‌شود.
- `Verified` — «ورود آزمایشی به‌عنوان این کاربر» فقط با `foundation.users.qa_login` و برای کاربر فعال مجاز است.
- `Verified` — در QA، `actingAdminUserId` و `effectiveUserId` جدا ثبت می‌شوند؛ maker/checker و scope هدف دور زده نمی‌شود.
- `Verified` — کاربران عادی کنترل Persona نمی‌بینند.

## Maker/Checker

`Verified` — سازنده رکورد نمی‌تواند همان رکورد را تأیید کند، مگر جایی که تصمیم محصول صریحاً مسیر self-approved نیابتی را در منطق مساعده تعریف کرده باشد. این استثنا باید در Audit و نسخه مسیر قابل تشخیص باشد.

## Resolution نقش‌های سازمانی

`Verified` — مدیر شعبه و نقش‌های scoped از انتساب جاری نقش + محدوده شعبه/واحد resolve می‌شوند؛ نام کاربر hard-code نیست. یک کاربر می‌تواند هم‌زمان چند نقش مانند مدیر شعبه و مدیر فروش داشته باشد و UI حاصل union مجوزها را نشان می‌دهد.

## ریسک‌های Production

- `Verified` — Local-only بودن یعنی کاربر دارای دسترسی کامل به پروفایل مرورگر می‌تواند داده محلی را دست‌کاری کند؛ این مدل مرز امنیتی Server نیست.
- `Planned` — احراز هویت مرکزی، MFA، session expiration، rate limiting، lockout، server-side authorization و secret management برای Production لازم‌اند.
- `Unknown` — سیاست نهایی password complexity، expiration و account recovery سازمان تصویب نشده است.
