# پرسش‌های باز

> **وضعیت:** `Unknown` یا نیازمند تصمیم Product Owner/فنی

## محصول و گردش‌کار

1. سقف انعطاف Workflow Designer کجاست: فقط stage/role/scope یا شرط مبلغ و Cost Center هم در همین فاز؟
2. اگر هیچ کاربر فعالی برای stage یک رکورد پیدا نشود، escalation خودکار به چه نقش/مدتی انجام شود؟
3. تغییر route فعال با رکوردهای در جریان چه migration یا policy استثنایی دارد؟
4. برای چند تأییدکننده هم‌سطح، سیاست `ANY`، `ALL` یا quorum چگونه تعریف می‌شود؟
5. جداسازی وظایف نهایی مساعده نیابتی و self-approval در Production حفظ می‌شود یا فقط استثنای فاز محلی است؟

## داده و ظرفیت

6. سقف attachment و کل quota هر دستگاه چقدر است؟
7. retention برای Audit، فایل مالی، notification و session چیست؟
8. dataset هدف برای benchmark چند رکورد/فایل/سال است؟
9. migration معنایی بین schema/seed versionها چگونه نسخه‌بندی می‌شود؟

## امنیت

10. مالک security/privacy و طبقه‌بندی داده کیست؟
11. سیاست رسمی رمز، MFA، lockout، recovery و session timeout چیست؟
12. Snapshot ساده در نسخه قابل انتشار مجاز می‌ماند یا فقط رمزگذاری‌شده؟

## عملیات

13. browser matrix و دستگاه‌های پشتیبانی‌شده کدام‌اند؟
14. RPO/RTO و دوره Backup/Restore drill چیست؟
15. hosting و راهبرد release/rollback آینده چیست؟
16. آیا release عمومی باید demo credential و seed پذیرش را حذف کند؟

## مستندسازی

17. اسناد تاریخی Server-backed در همین مخزن archive شوند یا به مخزن جدا منتقل شوند؟
18. مالک بازبینی هر سند و cadence مرور دوره‌ای چه کسی است؟
