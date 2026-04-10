# نشر POS على Vercel

## المتطلبات

- حساب [Vercel](https://vercel.com)
- مستودع Git (GitHub/GitLab/Bitbucket) أو استخدام [Vercel CLI](https://vercel.com/docs/cli)
- قاعدة PostgreSQL جاهزة (مثلاً Supabase) وسلسلة اتصال صالحة

## هيكل المشروع

إذا كان المستودع على GitHub هو **محتويات مجلد `system` فقط** (مستودع [POS](https://github.com/HamataKhaireddine/POS))، اترك **Root Directory** فارغاً أو `.`.

إذا كان المستودع أعلى (مثلاً مجلد `Neol` كاملاً)، عيّن **Root Directory** إلى: `POS MiniZoo/system`

## أوامر البناء (مضبوطة في `vercel.json`)

| الإعداد            | القيمة                    |
|--------------------|---------------------------|
| Install Command    | `npm run install:all`     |
| Build Command      | `npm run build:vercel`    |
| Output Directory   | `client/dist`             |

`build:vercel` يشغّل: `prisma generate` + `prisma migrate deploy` + بناء الواجهة (Vite + PWA).

## متغيرات البيئة في Vercel

أضفها في **Project → Settings → Environment Variables**، وفعّلها لـ **Production** (و **Preview** إن رغبت)، وتأكد أنها **متاحة عند البناء (Build)** حيث يلزم.

### ضرورية للسيرفر (Runtime + غالباً Build للـ migrate)

| المتغير           | ملاحظات |
|-------------------|---------|
| `DATABASE_URL`    | اتصال PostgreSQL. إذا فشل `migrate deploy` أثناء البناء مع Supabase، جرّب **رابط المنفذ 5432 المباشر** بدل الـ pooler، أو أضف لاحقاً `directUrl` في Prisma حسب [وثائق Prisma + Supabase](https://www.prisma.io/docs/orm/overview/databases/supabase). |
| `JWT_SECRET`      | سلسلة عشوائية طويلة (لا تستخدم قيم التطوير). |

### من `server/.env` حسب ما يستخدمه المشروع لديك

- `SUPABASE_URL`، `SUPABASE_ANON_KEY` (إن وُجدت في الكود)
- `PUBLIC_IMAGE_BASE_URL` أو ما يعادلها لصور المنتجات

### واجهة Vite (لازمة **عند البناء**)

| المتغير                 | ملاحظات |
|-------------------------|---------|
| `VITE_SUPABASE_URL`     | من Supabase |
| `VITE_SUPABASE_ANON_KEY`| من Supabase |
| `VITE_IMAGE_URL_PREFIX` / `VITE_PUBLIC_IMAGE_BASE_URL` | اختياري حسب الصور |

**لا تضبط `VITE_API_URL`** في الإنتاج إذا كان الـ API على **نفس نطاق Vercel**؛ الطلبات تذهب إلى `/api/...` على نفس الأصل.

## خطوات سريعة (لوحة Vercel)

1. **New Project** → استورد المستودع.
2. **Root Directory**: `POS MiniZoo/system` (أو `.` إن كان المستودع هو `system` فقط).
3. Framework Preset: **Other** (أو اترك الاكتشاف التلقائي إن قرأ `vercel.json`).
4. أضف متغيرات البيئة أعلاه.
5. **Deploy**.

## بعد النشر

- افتح الرابط: يجب أن تظهر صفحة تسجيل الدخول، وطلبات `GET /api/health` أو `/api/auth/me` تعمل عبر نفس النطاق.
- إن ظهرت أخطاء 500: راجع **Functions → Logs** في Vercel، وتأكد من `DATABASE_URL` و`JWT_SECRET` ونجاح `prisma migrate deploy` في سجل البناء.

## نشر بدون Git (CLI)

من جهازك، داخل مجلد `system`:

```bash
npx vercel login
npx vercel
```

للإنتاج:

```bash
npx vercel --prod
```

(يُفضّل ربط المستودع لاحقاً للنشر التلقائي.)

## ملاحظة عن Prisma على Vercel

الدالة `api/[...slug].js` تعمل كـ Serverless؛ مع قواعد بعيدة يُنصح باستخدام **connection pooling** (مثلاً وضع Supabase Transaction pooler في `DATABASE_URL` مع `?pgbouncer=true` إن طلبت الوثائق). إذا واجهت أخطاء اتصال أو مهلة، راجع إعدادات الـ pool وحدود الاتصال.
