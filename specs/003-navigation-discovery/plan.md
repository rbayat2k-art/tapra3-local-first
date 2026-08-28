# Implementation Plan: جست‌وجوی مسیرها و پرکاربردهای شخصی

## Architecture

- helper خالص `navigationDiscovery.ts`: normalization، search، usage versioning و ranking.
- `FoundationApp.tsx`: ساخت destination catalog فقط از `visibleNavigation` و moduleهای دارای `view`؛ navigation destination-aware و tracking انتخاب‌های ارادی.
- `NavigationSearch.tsx`: combobox/listbox فارسی و keyboard-aware برای sidebar باز و دکمه search در حالت collapsed.
- `ErpWorkspacePage.tsx`: اعلام انتخاب tab module به shell و remount صحیح route مستقیم/same-page/back-forward.
- Dashboard: بخش مستقل «منوهای پرکاربرد من»؛ میزکار مبتنی بر نقش فعلی حفظ می‌شود.
- persistence فقط preference محلی است؛ schema، service، audit و business stores تغییر نمی‌کنند.

## Brand boundary

- rename copyهای user-visible active runtime/index/print/recovery و seed defaults به «تیرا/Tira».
- compatibility identifiers، history قدیمی و فایل‌های deprecated/historical بازنویسی نمی‌شوند.
- تصمیم brand و allowlist فنی در اسناد جاری ثبت می‌شود.

## Verification

- unit برای normalization/search/ranking/storage corruption/user isolation و route page+module.
- E2E برای سه query نمونه، exact URL/tab، keyboard، frequent persistence، mobile و accessibility.
- static brand scan با allowlist شناسه‌های فنی.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` و targeted Playwright.
