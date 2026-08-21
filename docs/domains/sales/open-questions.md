# پرسش‌های باز طراحی فروش

> Status: DRAFT
> Source of truth: این سند برای تصمیم‌های حل‌نشده فروش است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-15 against confirmed business decisions and the Sales Draft archive
> Supersedes: none
> Superseded by: none

این موارد نباید به‌عنوان requirement قطعی یا رفتار CURRENT پیاده‌سازی شوند. پس از تصمیم، نتیجه به [approved design](approved-design.md) منتقل و rationale در [decision log](../../decisions/DECISION_LOG.md) ثبت می‌شود.

## فاکتور، قیمت و مالی

- سیاست کسر/شناسایی مبلغ فاکتور وقتی کالا تحویل شده ولی خدمت باقی است چیست؟
- schema و integration دقیق reconciliation بانکی چگونه پیاده شود؟ رفتار Chargeback و financial hold در [fulfillment policy](fulfillment-policy.md) تصویب شده است.

## Customer و Import

- قواعد normalization شماره تماس، چند شماره برای یک شخص و شناسایی بدون شماره چیست؟
- در تعارض داده‌های import، اولویت منبع و workflow بازبینی چیست؟
- ساختار سابقه خرید legacy و وضعیت شماره نامعتبر، blocked یا do-not-contact چیست؟

## Lead و تخصیص

- scope دقیق مدیر دیتا و همه سطوح فروش برای مشاهده، تخصیص و override چیست؟
- حداقل تعداد/فاصله تلاش ناموفق و سیاست بازیافت Lead چیست؟
- جزئیات Rule، وزن‌دهی، ظرفیت، fairness و override موتور تخصیص چیست؟
- فرصت Upsell به فروشنده اصلی، تیم تخصصی یا سرپرست تخصیص می‌یابد؟
- SLA پایان شیفت، Lead دیرتخصیص‌یافته و تشخیص تلاش صوری چگونه محاسبه می‌شود؟

## شکایت و پشتیبانی

- دوره حفاظتی پس از بستن شکایت چقدر است و چه کسی آزادسازی نهایی را تأیید می‌کند؟
- شدت شکایت چگونه روی دوره انتظار اثر می‌گذارد؟
- چرخه/فاکتور نیمه‌کاره هنگام ثبت شکایت چه transitionهایی دارد؟
- ارتباط دقیق Sales Invoice با `SupportCase` فعلی و محاسبه عودت ردیفی چیست؟

## کالا، خدمت، انبار و ارسال

- نام و transitionهای دقیق stateهای Service، Shipment و Inventory در implementation چیست؟ قواعد کسب‌وکار آن‌ها در [fulfillment policy](fulfillment-policy.md) تصویب شده‌اند.
- ظرفیت، quota، entitlement و SLA escalation هر نوع Service چگونه تنظیم می‌شود؟
- کسر قطعی Inventory، adjustment و count reconciliation بعد از reservation چه مدل اجرایی دارد؟
- قرارداد شرکت پستی، fallback، مرجوعی و reconciliation تحویل چیست؟
- مسئولیت و کنترل بدهی/کسری موجودی امانی نماینده چگونه تفکیک می‌شود؟

## Platform و rollout

- ترتیب delivery فازهای Customer، Lead، Invoice، catalog، fulfillment و settlement چیست؟
- ترتیب و معیار reconciliation/cutover داده‌های Sales باقی‌مانده از `localStorage` به PostgreSQL چیست؟
- معیار پذیرش و تست end-to-end هر نقش در کل flow چیست؟
