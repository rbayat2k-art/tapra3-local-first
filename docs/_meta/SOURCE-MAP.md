# نقشه منشأ ادعاهای اسناد

> **Git evidence:** شاخه مستقل `fix/ocr-blockers-20260824` با پایه `feature/workflow-management@a0f02dd`، اعتبارسنجی 2026-08-24.

| سند | ادعاهای اصلی | Source/Test/Config | اطمینان |
|---|---|---|---|
| `README.md` | وضعیت، مخاطب، تقدم منبع | کل repo، git status، اجرای کیفیت | بالا |
| `01-PROJECT-OVERVIEW.md` | runtime، تعداد module/store/test | `App.tsx`, `model.ts`, `erpCatalog.ts`, Vitest | بالا |
| `02-REQUIREMENTS-AND-POLICIES.md` | تصمیم‌های محصول و validation | گفتگو، helpers دامنه، تست‌ها | mixed؛ برچسب‌دار |
| `03-ARCHITECTURE.md` | لایه‌ها و جریان فرمان | `FoundationApp`, `service`, `storage`, `authorization` | بالا |
| `04-DIRECTORY-STRUCTURE.md` | کد فعال/قدیمی | `tsconfig`, import graph، file inventory | بالا |
| `05-BUSINESS-RULES.md` | قواعد سازمان/فروش/خرید/مساعده | service و helperهای دامنه + تست مستقیم | بالا |
| `06-DATABASE.md` | IndexedDB، ۹۶ store، index، snapshot | `model.ts`, `storage.ts` | بالا |
| `07-API.md` | نبود HTTP و مرز Service | `service.ts`, search HTTP/router | بالا |
| `08-AUTHENTICATION-AND-ACCESS.md` | session، hash، scope، QA | service/auth/model + auth tests | بالا |
| `09-SECURITY.md` | crypto، trust boundary، risk | storage/service/model/config | بالا برای فعلی؛ آینده Planned |
| `10-RELIABILITY-AND-FAILURE-PREVENTION.md` | transaction/version/idempotency | storage/service/tests | بالا |
| `11-BACKUP-AND-DISASTER-RECOVERY.md` | export/import/reset | storage/service/UI | بالا؛ RPO/RTO Unknown |
| `12-OBSERVABILITY.md` | audit/event/notification | model/service/UI | بالا |
| `13-INCIDENT-RESPONSE.md` | runbook پیشنهادی | کنترل‌های موجود + inference عملیاتی | متوسط/Documented |
| `14-DEVELOPMENT.md` | فرمان‌های واقعی | `package.json`, CI/config؛ اجرای مستقیم | بالا |
| `15-TESTING.md` | ۲۲ فایل/۱۲۴ تست و gapها | Vitest config + اجرای 2026-08-24 | بالا |
| `16-DEPLOYMENT-AND-OPERATIONS.md` | build استاتیک و CI | Vite/package/CI + build | بالا |
| `17-DECISIONS.md` | ADRهای محصول/معماری | گفتگو + کد فعال | mixed؛ برچسب‌دار |
| `18-CHANGELOG-AND-PROJECT-STATUS.md` | Git و قابلیت فعلی | git status/log + تست/build | بالا |
| `19-ROADMAP.md` | پیشنهادهای آینده | gap analysis | Planned |
| `20-OPEN-QUESTIONS.md` | ابهام‌های تصمیم | نبود شاهد/Conflict | Unknown |
| `21-USER-FLOWS.md` | مسیر نقش‌ها و خطاها | UI/service/domain tests | بالا |
| `22-PERMISSION-MATRIX.md` | role/resource/action/scope | seed/catalog/auth helpers/tests | بالا برای نقش‌های اصلی |
| `23-DATA-DICTIONARY.md` | entity/field/lifecycle/sensitivity | model/domain interfaces/stores | بالا |
| `24-LOCAL-SERVICE-REFERENCE.md` | use-case contract | public methods `service.ts` + tests | بالا/mixed |
| `25-ARCHITECTURE-DIAGRAMS.md` | context/container/data/sequence/deploy | import/runtime/storage paths | بالا |
| `26-REQUIREMENTS-TRACEABILITY.md` | نیازمندی→شاهد→پذیرش | گفتگو، کد، تست، build | بالا/mixed |
| `27-CONFIGURATION.md` | تنظیمات runtime و موارد نامرتبط | package/model/storage/snapshot | بالا |
| `DOCUMENTATION-POLICY.md` | قواعد نگه‌داری | مأموریت کاربر + repository constraints | Documented |
| `DOCS-CHECKLIST.md` | اجرای بازبینی | تمام بررسی‌های همین مأموریت | بالا |
| `_meta/FEATURE-MATRIX.md` | قابلیت‌ها و ۶۷ module | catalog/pages/service/tests | بالا/mixed |
| `_meta/DOC-COVERAGE.md` | پوشش componentها | file inventory + docs | بالا |
| `_meta/OPEN-QUESTIONS.md` | تصمیم‌های مفقود | gap/conflict analysis | Unknown |

## منابع Deprecated

اسناد قدیمی `docs/architecture`, `docs/current-system`, `docs/engineering` و اسناد دامنه‌ای Server-backed برای بازیابی دانش تاریخی استفاده شدند، اما ادعای وضعیت جاری از آن‌ها بدون تأیید کد فعال پذیرفته نشده است.
