# نشر المنزل — Railway (رئيسي) + Render (احتياطي)

## الفكرة

1. **Railway** = الرابط الرئيسي الذي تشاركه مع المستخدمين.
2. **Render** = نفس المشروع، خطة مجانية، احتياطي.
3. عند تعطل Railway (انتهاء الرصيد، 502، 503…) يُحوَّل الزائر **تلقائياً** إلى رابط Render.

> إذا توقف Railway بالكامل ولا يُرجع أي صفحة، التحويل يحتاج أن يكون المستخدم قد فتح الموقع مرة واحدة على الأقل، أو استخدم **دومين مخصص** وانقله لاحقاً إلى Render (انظر الأسفل).

---

## الخطوة 1 — GitHub

```bash
git init
git add .
git commit -m "deploy"
git remote add origin https://github.com/YOUR_USER/downloader.git
git push -u origin main
```

---

## الخطوة 2 — Render (الاحتياطي أولاً)

1. [render.com](https://render.com) → **New** → **Blueprint** أو **Web Service**.
2. اربط المستودع.
3. **Runtime: Docker** (يستخدم `Dockerfile` و `render.yaml`).
4. خطة **Free**.
5. بعد النشر انسخ الرابط، مثال:  
   `https://almonzel.onrender.com`

**متغيرات البيئة على Render:**

| المتغير | القيمة |
|---------|--------|
| `DEPLOYMENT_PROVIDER` | `render` |
| `NEXT_PUBLIC_GITHUB_URL` | رابط مستودعك |
| (اختياري) Umami / Sentry | من `.env.example` |

**لا** تضع `NEXT_PUBLIC_FALLBACK_URL` على Render.

---

## الخطوة 3 — Railway (الرئيسي)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
2. اختر المستودع (يكتشف `Dockerfile` / `railway.toml`).
3. **Variables:**

| المتغير | القيمة |
|---------|--------|
| `DEPLOYMENT_PROVIDER` | `railway` |
| `NEXT_PUBLIC_FALLBACK_URL` | `https://almonzel.onrender.com` ← رابط Render |
| `NEXT_PUBLIC_GITHUB_URL` | رابط GitHub |
| (اختياري) Umami / Sentry | |

4. انشر وانسخ رابط Railway — هذا هو الرابط الذي تعلنه للمستخدمين.

---

## التحويل التلقائي

- سكربت في `<head>` يفحص `/api/health` خلال ~4.5 ثانية.
- إذا فشل الطلب أو وصلت `502` / `503` / `504` / `402` → `location.replace` إلى Render مع نفس المسار.
- `sessionStorage` يمنع حلقة تحويل في نفس الجلسة.

اختبار محلي (اختياري):

```env
NEXT_PUBLIC_FALLBACK_URL=http://localhost:3001
```

شغّل نسختين على منفذين مختلفين.

---

## بعد انتهاء رصيد Railway

| الحالة | ماذا يحدث |
|--------|-----------|
| Railway يعيد 502/503 | التحويل التلقائي إلى Render |
| Railway لا يفتح أبداً | شارك رابط Render مباشرة، أو انقل **الدومين** إلى Render في لوحة DNS |

---

## تحقق

- `https://YOUR-RAILWAY.app/api/deployment` → `"role":"primary"`, `"hasFailover":true`
- `https://YOUR-RENDER.app/api/deployment` → `"role":"fallback"`

---

## ملاحظات

- **ffmpeg** مثبت في Docker — مطلوب لدمج فيديو+صوت.
- أول طلب على Render المجاني قد يكون بطيئاً (خمول ~50 ثانية).
- حد الطلبات (rate limit) مفعّل في API — مناسب لأقل من ~1000 مستخدم نشط.
