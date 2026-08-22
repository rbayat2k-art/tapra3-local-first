# سیاست نگه‌داری مستندات

> **وضعیت:** `Documented` — از این تاریخ برای تغییرات بعدی لازم‌الاجرا پیشنهاد می‌شود.

## اصل هم‌زمانی کد و سند

هر Pull Request یا تغییر پذیرفته‌شده که یکی از موارد زیر را عوض کند باید سند مرتبط را نیز به‌روزرسانی کند:

- معماری، dependency یا adapter
- object store/schema/seed/migration
- permission، role، scope یا maker/checker
- state، transition، route یا assignment گردش‌کار
- validation و فیلد اجباری
- فرمان build/test/deploy
- Backup، امنیت، Audit یا incident procedure

## برچسب اطمینان

هر ادعای غیر بدیهی باید یکی از `Verified`، `Implemented-Unverified`، `Documented`، `Inferred`، `Planned`، `Deprecated`، `Unknown` یا `Conflict` را داشته باشد. عبارت آینده نباید به‌عنوان قابلیت فعال نوشته شود.

## منابع و تقدم

1. کد و تست فعال
2. schema/config/runtime قابل بازتولید
3. تصمیم تصویب‌شده و سند جاری
4. اسناد تاریخی و Git history
5. inference، با برچسب روشن

## اطلاعات ممنوع

رمز، Token، Cookie، secret، connection string واقعی، مقدار env، Snapshot واقعی، شماره کارت/کدملی/موبایل یا PII نباید در docs، Issue، screenshot یا commit وارد شود. نمونه‌ها باید ساختگی و آشکارا نمونه باشند.

## چک‌لیست بازبینی سند

- لینک‌های داخلی معتبرند.
- نام route/store/permission/state با کد تطبیق دارد.
- فرمان‌ها از `package.json` گرفته شده‌اند.
- وضعیت Git/date و محدوده سند روشن است.
- تعارض با سند قدیمی صریحاً علامت خورده است.
- قابلیت Planned به‌عنوان موجود معرفی نشده است.
- هیچ داده حساس یا credential در متن جدید نیست.

## عمر اسناد تاریخی

اسناد قدیمی بدون تحلیل حذف نمی‌شوند. بالای سند یا در index باید «تاریخی/متعارض با runtime فعلی» مشخص شود. اگر archive رسمی ایجاد شد، redirect/link از index حفظ شود.

## مسئولیت

`Unknown` — مالک رسمی مستندات تعیین نشده است. تا تعیین مالک، نویسنده هر تغییر مسئول به‌روزرسانی سند همراه همان تغییر است.
