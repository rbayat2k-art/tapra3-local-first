# Independent Review Integrations

> **وضعیت:** `CURRENT` برای فایل‌های Repository؛ فعال‌سازی سرویس‌های بیرونی جداگانه و با اجازه مالک Repository انجام می‌شود.

## Open Code Review

`.opencodereview/rule.json` قواعد TAPRA را برای مسیر Local Foundation، Workflowهای GitHub، کنترل‌های Agent و سایر فایل‌ها نگه می‌دارد. Rule سیستم OCR با Rule پروژه merge می‌شود. Token/API endpoint و تنظیم LLM در Repository ذخیره نمی‌شود و باید در محیط امن کاربر یا GitHub Secret قرار گیرد. اجرای محلی/آزمایشی باید روی diff شاخه بازبینی باشد و Finding را قبل از هر Fix در سه وضعیت استاندارد طبقه‌بندی کند.

## PR-Agent

`.pr_agent.toml` زمینه دائمی Repository، زبان فارسی، Review هنگام ایجاد PR و Push جدید، و تمرکز TAPRA را تعریف می‌کند. این فایل به‌تنهایی Bot را نصب نمی‌کند. GitHub App یا Workflow دارای Secret فقط با اجازه مالک Repository فعال می‌شود. هیچ کلید API داخل Git ذخیره نمی‌شود.

## Codex native review و Codex Security

`AGENTS.md` و Agentهای مستقل Review/Security زمینه Codex را فراهم می‌کنند. فعال‌سازی Review خودکار GitHub یا اجرای Codex Security یک تنظیم حساب/Repository است، نه فایل Branch. خروجی آن مانند Scannerهای دیگر باید triage شود و جای تست قطعی را نمی‌گیرد.

## مرز امنیتی

- PR از Fork و محتوای آن untrusted است؛ Secret نباید در workflow قابل‌دسترسی کد PR قرار گیرد.
- Review Bot حق Merge خودکار یا Push مستقیم به `main` ندارد.
- پیشنهاد AI بدون اجرای مسیر و تست، `VALID` محسوب نمی‌شود.
- متن Prompt، telemetry و artifact نباید PII، رمز، OTP، داده بانکی یا محتوای backup واقعی را منتشر کند.
