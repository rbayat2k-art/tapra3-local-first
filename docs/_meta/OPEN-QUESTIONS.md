# پرسش‌های باز ساختاریافته

> پاسخ اختراع نشده است؛ هر ردیف بر مبنای نبود شاهد قطعی `Unknown` است.

| ID | سؤال و اهمیت | شواهد موجود / شواهد مفقود | گزینه‌ها و اثر | مالک/اولویت |
|---|---|---|---|---|
| OQ-001 | حد نهایی Workflow Designer چیست؟ آزادی زیاد می‌تواند state را خراب کند. | V1 فقط stage/route را تغییر می‌دهد؛ rule expression تصویب نشده. | محدود فعلی / افزودن شرط مبلغ و Cost Center با DSL کنترل‌شده | Product + Tech / بالا / Blocking |
| OQ-002 | رکورد بدون assignee چگونه escalation شود؟ | resolver نقش جاری دارد؛ timer/escalation ندارد. | Admin queue / نقش جانشین / SLA escalation | Product + Operations / بالا |
| OQ-003 | چند تأییدکننده هم‌سطح چگونه تصمیم می‌گیرند؟ | stage فعلی roleIds دارد؛ quorum semantics ندارد. | ANY / ALL / quorum | Product / بالا |
| OQ-004 | self-approval مساعده در Production حفظ شود؟ | فعلاً برای نیابتی با تصمیم PO مجاز است. | حفظ با Audit / maker-checker اجباری | Finance + Security / بالا |
| OQ-005 | سقف و تعداد مساعده چیست؟ | در تصمیم فعلی محدود نشده؛ credit model وجود ندارد. | بدون سقف / Policy نقش-محور / اعتبار داخلی | Finance / متوسط |
| OQ-006 | سقف attachment و quota چیست؟ | data URL و Browser quota؛ عدد مصوب ندارد. | سقف فایل/رکورد/دستگاه + warning | Product + Tech / بالا |
| OQ-007 | retention و حذف قانونی چیست؟ | تاریخچه حذف‌ناپذیر طراحی شده؛ دوره قانونی معلوم نیست. | دائم / زمان‌بندی / archive رمزگذاری‌شده | Legal + Security / بالا |
| OQ-008 | RPO/RTO چیست؟ | Backup دستی؛ schedule/owner ندارد. | بر اساس criticality تصویب شود | Operations / بالا |
| OQ-009 | browser/device matrix چیست؟ | مرورگر مدرن لازم است؛ QA رسمی چندمرورگر ندارد. | Chrome/Edge حداقل، سپس mobile | QA / متوسط |
| OQ-010 | migration معنایی payloadها چگونه باشد؟ | schema upgrade store می‌سازد؛ transform versioned ندارد. | migration registry + rollback snapshot | Data lead / بالا |
| OQ-011 | Snapshot ساده مجاز بماند؟ | plain و encrypted هر دو فعال‌اند. | فقط encrypted / plain با warning و permission | Security + PO / بالا |
| OQ-012 | demo seed در release عمومی چه شود؟ | credential deterministic در source قدیمی دیده شد. | حذف در production build / feature flag | Security / بالا |
| OQ-013 | ماژول‌های generic با چه اولویتی عمیق شوند؟ | ۶۴ ماژول foundation عمومی دارند. | اولویت کسب‌وکار مرحله‌ای | Product / بالا |
| OQ-014 | hosting/release/rollback نهایی چیست؟ | CI build دارد؛ deployment target ندارد. | static host اکنون / server phase بعد | Tech + Ops / متوسط |
| OQ-015 | مالک رسمی Docs و cadence چیست؟ | policy هست؛ CODEOWNERS/owner ندارد. | Tech writer / component owners / quarterly audit | Tech lead / متوسط |
| OQ-016 | اسناد Server-backed قدیمی کجا بروند؟ | نگه‌داری شده اما با runtime تعارض دارند. | archive همین repo / repo جدا | Tech lead / پایین |

نسخه خلاصه و موضوعات محصول در [`../20-OPEN-QUESTIONS.md`](../20-OPEN-QUESTIONS.md) باقی مانده است.
