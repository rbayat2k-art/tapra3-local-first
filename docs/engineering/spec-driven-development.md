# Spec-driven Development با GitHub Spec Kit

> **وضعیت:** `CURRENT` — Spec Kit 1.0.1 با integration رسمی Codex و PowerShell در Repository نصب شده است.

## هدف

درخواست خام مالک محصول قبل از کدنویسی به Artifactهای قابل بازبینی تبدیل می‌شود. Spec Kit جای قواعد TAPRA یا تصمیم مالک محصول را نمی‌گیرد؛ فقط Requirement، Plan و Taskها را پایدار می‌کند تا به حافظه یک Chat وابسته نباشند.

## جریان Feature

```text
درخواست فارسی مالک محصول
→ $tapra-feature-delivery
→ $speckit-specify
→ $speckit-clarify (در صورت ابهام)
→ $speckit-plan
→ $speckit-tasks
→ $speckit-analyze (برای ریسک متوسط/بالا)
→ $speckit-implement
→ $speckit-converge
→ Test / Security / Independent Review
→ تست کاربر
→ PR و Merge با اجازه
```

## فایل‌های نصب‌شده

- `.specify/memory/constitution.md`: اصول حاکم بر Specها.
- `.specify/templates/`: قالب Requirement، Plan، Tasks و Checklist.
- `.specify/scripts/powershell/`: helperهای Windows.
- `.agents/skills/speckit-*`: Skillهای رسمی Codex.
- `.specify/init-options.json`: ثبت نسخه و گزینه‌های نصب برای بازتولید/Upgrade.

## قواعد استفاده در پروژه موجود

- برای رفتارهای موجود، بازنویسی کامل Specification لازم نیست؛ از Feature بعدی و bounded شروع شود.
- هر init/upgrade ابزار در کامیت جدا انجام و diff آن قبل از استفاده بررسی شود.
- Constitution فقط قواعد واقعاً موجود یا صریحاً تصویب‌شده را بیان می‌کند.
- Spec فناوری‌خنثی است؛ Plan مسیر واقعی Local Foundation، IndexedDB، Permission، Audit و UI را مشخص می‌کند.
- Artifact تولیدشده بدون تست یا Review دلیل Done بودن نیست.

## Upgrade

نسخه ابزار از `.specify/init-options.json` قابل مشاهده است. Upgrade باید روی Branch جدا، با نسخه مشخص، بازبینی manifest و اجرای همه Gateها انجام شود؛ فایل‌های تولیدشده نباید کورکورانه overwrite شوند.
