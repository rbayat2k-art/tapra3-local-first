# جریان توسعه چندایجنته

> هدف: مالک محصول نیاز را توضیح دهد؛ سیستم آن را به تغییر مهندسی قابل بررسی تبدیل کند. همه Agentها برای هر Task فعال نمی‌شوند.

## نقش‌ها

| نقش | خروجی | اجازه ویرایش |
|---|---|---|
| `requirement_analyst` | Requirement brief و سؤال‌های محصول | خیر |
| `domain_architect` | invariantها، مسیر اجرا، scope فایل و migration/race impact | خیر |
| `ui_reviewer` | reuse map، UI states، RTL/responsive/a11y | خیر |
| `implementation_worker` | تغییر محدود و تست‌های مربوط | فقط scope واگذارشده |
| `test_reviewer` | risk-based test matrix و gapها | خیر |
| `security_reviewer` | Findingهای امنیتی اولویت‌دار | خیر |
| Primary agent | orchestration، تصمیم فنی نهایی، validation و تحویل | بله |

## انتخاب نقش بر اساس Task

- تغییر کوچک docs/mechanical: Primary فقط.
- Bug محدود: Domain/Explorer در صورت ابهام → Implementation → Test review.
- Feature UI: Requirement + Domain + UI به‌صورت موازی پس از brief → Implementation → Test.
- Finance/HR/Auth/Workflow/Migration: Requirement + Domain + Test + Security → Implementation → review دوباره.
- Audit کل Repository: بازرس‌های read-only موازی؛ هیچ Fix خودکار تا triage.

## قرارداد خروجی Requirement

```text
Goal
Actors
Current behavior
Expected behavior
Business rules
Edge cases
Permissions and scope
Data/persistence impact
UI impact
Acceptance criteria
Open product questions
```

## قرارداد Hand-off به Implementation

Implementation فقط با Requirement و Architecture کافی شروع می‌شود و باید `files in scope`، `files out of scope`، reuse target، migration impact، test matrix و rollback point داشته باشد.

## جلوگیری از آشفتگی

- Agentهای read-only مستقل می‌مانند و نتیجه را با path/symbol تحویل می‌دهند.
- دو Agent هم‌زمان یک فایل را ویرایش نمی‌کنند.
- Primary یافته‌ها را بدون شاهد قبول نمی‌کند و اختلاف‌ها را صریح حل می‌کند.
- Agent نویسنده Findings را کورکورانه Fix نمی‌کند؛ triage لازم است.
- خروجی نهایی یک گزارش واحد شامل تغییر، شاهد تست، ریسک باقی‌مانده و قدم Merge است.

