# نقشه پوشش مستندات

> **Last verified commit:** `853dac0` + working tree | **Accuracy basis:** کد، تست و اجرای 2026-08-22

| Component | مالک پیشنهادی | Source files | سند هدف | پوشش/دقت | Gap یا پرسش |
|---|---|---|---|---|---|
| App entry و Shell | Frontend lead | `main.tsx`, `App.tsx`, `FoundationApp.tsx` | 01, 03, 04, 14, 21 | کامل / `Verified` | Error Boundary رسمی Unknown |
| Navigation | Frontend lead | `navigationUrl.ts`, `FoundationApp.tsx` | 03, 21 | کامل / `Verified` | Router framework ندارد |
| UI preferences | Frontend lead | `FoundationApp.tsx`, `index.css` | 02, 03 | کافی / `Implemented-Unverified` | migration preference رسمی ندارد |
| Storage/Snapshot | Data lead | `storage.ts`, `model.ts` | 06, 09, 11, 23 | کامل / `Verified` | quota UX و semantic migration |
| Seed/Reset | QA lead | `seed.ts`, `seedConstants.ts` | 01, 06, 15 | کامل / `Verified` | credential demo برای Production |
| Authorization | Security lead | `authorization.ts`, `organizationAccess.ts` | 08, 09, 22 | کامل / `Verified` | server boundary وجود ندارد |
| Session/Recovery/QA | Security lead | `service.ts`, `FoundationApp.tsx`, `RegistrationPage.tsx` | 08, 09, 21, 24 | کافی / mixed | recovery UI E2E ندارد |
| Audit/Events | Platform lead | `service.ts`, `model.ts` | 03, 09, 12, 13, 23 | کامل / `Verified` | tamper evidence سروری ندارد |
| Notifications | Platform lead | `service.ts`, `purchaseFollowUp.ts` | 05, 12, 21 | کافی / `Verified` | push خارجی ندارد |
| Organization | HR product owner | `OrganizationPages.tsx`, `BranchesPage.tsx`, `service.ts` | 05, 21, 22 | کامل / `Verified` | E2E کامل مرورگر ندارد |
| Personnel/Profile | HR product owner | `PersonnelPages.tsx`, `MyAccountPage.tsx`, profile helpers | 05, 21, 23 | کامل / `Verified` | retention پرونده Unknown |
| Roles/Users | Security/HR | `OrganizationPages.tsx`, `service.ts`, `model.ts` | 08, 22, 24 | کامل / `Verified` | role governance owner Unknown |
| Sales structure | Sales owner | `SalesStructuresPage.tsx`, identity helpers, service | 05, 21 | کافی / `Implemented-Unverified` | transfer/version E2E gap |
| Customers | CRM owner | `CustomerPages.tsx`, service | 01, 05, Feature Matrix | کافی / `Verified` | domain depth محدود |
| ERP Registry | Product/Platform | `erpCatalog.ts`, `ErpWorkspacePage.tsx` | 01, 03, Feature Matrix | موجود / mixed | ۶۴ ماژول generic نیازمند تست تخصصی‌اند |
| Purchase request | Procurement owner | `purchaseRequest.ts`, `PurchaseRequestUi.tsx`, service | 05, 21, 24 | کامل / `Verified` | chain شرطی مبلغ Planned |
| Treasury execution | Treasury owner | `TreasuryExecutionUi.tsx`, service | 05, 21, 24 | کامل / `Verified` | supervisor workflow Unknown |
| Employee advance | HR/Finance owners | `employeeAdvance.ts`, `EmployeeAdvanceUi.tsx`, service | 05, 21, 24 | کامل / `Verified` | سقف/تعداد/SoD نهایی Unknown |
| Workflow policy | Workflow admin owner | `workflowPolicy.ts`, `WorkflowAdminPage.tsx`, service | 02, 03, 05, 17, 21 | کامل / `Verified` | quorum/escalation Planned |
| Persian formats | Frontend/QA | `PersianDate.tsx`, `FormValidation.tsx`, `Sorting.tsx` | 02, 15 | کافی / `Verified` | browser locale matrix ندارد |
| CI/Build | Technical lead | `package.json`, `.github/workflows/ci.yml`, configs | 14, 15, 16 | کامل / `Verified` | lint واقعی و E2E ندارد |
| Configuration | Technical lead | `package.json`, `model.ts`, `snapshot.ts`, preference UI | 14, 27 | کامل / `Verified` | env/server config نامرتبط با این فاز |
| Legacy docs/code | Technical lead | `docs/architecture`, `docs/current-system`, `prototype`, `foundation` | README, 18 | طبقه‌بندی / `Deprecated` | archive decision باز است |

## جمع‌بندی Coverage

- ۲۲ component اصلی: همه سند یا دلیل محدودیت دارند.
- سه جریان تخصصی خرید/خزانه/مساعده: کد و تست مستقیم دارند.
- ۶۴ ماژول باقی‌مانده Registry: foundation عمومی دارند ولی برای ادعای دامنه‌ای عمیق `Implemented-Unverified` هستند.
- Backend/Worker/Queue/Cache/API HTTP: نامرتبط با runtime فعلی و صریحاً ثبت شده‌اند.
