# قرارداد UI و Design System

> **وضعیت:** `CURRENT` برای الگوهای موجود؛ بعضی Shared Primitiveها هنوز پوشش کامل محصول را ندارند.

## اصول ثابت

- زبان UI فارسی و جهت صفحه RTL است. Identifierهای کد انگلیسی و پایدار می‌مانند.
- از tokenهای معنایی `src/index.css` مانند `--surface`، `--border`، `--primary`، `--danger` و text tokenها استفاده شود؛ رنگ خام فقط وقتی token مناسب وجود ندارد و با دلیل.
- معنی وضعیت یا خطا فقط با رنگ منتقل نشود. متن/آیکن مکمل و contrast مناسب لازم است.
- Icon button باید `aria-label` یا label قابل‌دسترسی داشته باشد. Focus قابل‌مشاهده حذف نشود.
- فرم باید Label صریح، Required/Optional pattern، پیام خطای نزدیک فیلد و خلاصه خطا برای Submit ناموفق داشته باشد.
- تاریخ عملیاتی با `PersianDateInput`/الگوی شمسی موجود انتخاب و به مقدار ISO سرویس تبدیل شود.

## الگوهای Canonical فعلی

| نیاز | مرجع موجود |
|---|---|
| Semantic tokens و کلاس‌های عمومی | `src/index.css` |
| Button | کلاس‌های `.button` و variantهای آن در `src/index.css` |
| IconButton | `.icon-button` همراه `aria-label`/`title` در flowهای فعال |
| Validation label/summary | `src/local-foundation/FormValidation.tsx` |
| Search/sorting | `src/local-foundation/Sorting.tsx` |
| Modal عمومی | `.modal-scrim > .dialog`، header/body/footer در `src/index.css` |
| Modal عادی | `width: min(680px, 100%)` |
| Modal ثبت گسترده | `.dialog--registration` با سقف 900px |
| Modal policy گسترده | `.workflow-policy-dialog` با سقف 1040px |
| Form grid | `.form-grid` دو ستون، `.field--wide` برای تمام عرض و تک‌ستون در breakpoint مربوط |
| Field controls | `.field input/select/textarea` با tokenهای surface/border/focus |
| Operational table | `.operational-table-wrap` و `.operational-table` |
| تاریخ شمسی Local Foundation | فقط `src/local-foundation/PersianDate.tsx`؛ خروجی canonical آن ISO است |
| Validation | `src/local-foundation/FormValidation.tsx` و الگوهای Required/Optional همان flow |

## قواعد ساخت Form یا Modal

1. نزدیک‌ترین Flow تأییدشده را پیدا و structure آن را reuse کنید.
2. یکی از عرض‌های موجود را بر اساس محتوا انتخاب کنید؛ عدد جدید بدون use case مشخص اضافه نکنید.
3. Actionهای اصلی در Footer canonical قرار گیرند؛ ترتیب و tone دکمه‌ها با flow موجود سازگار باشد.
4. Loading، Error، Empty، Disabled، متن بلند، موبایل و Desktop بررسی شوند.
5. Business validation در Service تکرار شود؛ validation UI فقط تجربه کاربر است.

## Shared component policy

`src/components/ui/primitives.tsx` امروز در UI فعال Local Foundation استفاده عمومی ندارد و بعضی tokenهای موردنیاز آن نیز در `:root` جاری تعریف نشده‌اند؛ بنابراین canonical اعلام نمی‌شود. دو خانواده Modal (`modal-layer/modal-card` و `modal-scrim/dialog`) و دو خانواده Field نیز فعلاً هم‌زمان وجود دارند. کد جدید نزدیک‌ترین flow فعال را reuse می‌کند و consolidation در یک مأموریت مستقل با تست بصری انجام می‌شود. Component مشترک تازه فقط با دو مصرف‌کننده واقعی یا مأموریت consolidation تصویب‌شده ایجاد می‌شود.

Storybook روی اجزای واقعاً فعال `FormValidation`، `PersianDateInput` و `SortHeader` برقرار و build آن CI gate است. اضافه‌کردن Story به معنی canonical شدن خودکار یک Component نیست؛ جدول بالا و مصرف واقعی تعیین‌کننده‌اند. Visual snapshot baseline هنوز تأیید نشده و `Unverified` است.

## پنجره جزئیات رکورد عملیاتی

- پوسته canonical برای جزئیات و اقدام رکوردهای عملیاتی `src/local-foundation/RecordDialog.tsx` است.
- در دسکتاپ پنجره وسط viewport، با سقف ارتفاع و اسکرول داخلی نمایش داده می‌شود؛ در عرض موبایل به bottom sheet تمام‌عرض تبدیل می‌شود.
- `role="dialog"`، نام قابل‌دسترسی، ورود و بازگشت focus، Tab/Shift+Tab و Escape توسط پوسته مدیریت می‌شوند؛ تقویم و overlayهای portaled داخل target همان پوسته می‌مانند و Escape ابتدا overlay فعال را می‌بندد.
- header/body/footer، مجوزها و actionهای دامنه داخل مصرف‌کننده باقی می‌مانند و نباید به پوسته منتقل شوند.
- validation فیلدی داخل فرم می‌ماند؛ خطای عملیات سراسری باید با `role="alert"` بالاتر از scrim و در viewport دیده شود.
- کلاس‌های legacy با نام `drawer-*` فعلاً برای سازگاری CSS و چاپ خزانه باقی مانده‌اند، اما رفتار بصری کشوی کناری deprecated است.
