# نشر المنزل — Railway (رئيسي) + Render (احتياطي)

## لديك Netlify بالفعل؟ ([down-loader.netlify.app](https://down-loader.netlify.app/))

**Netlify يعرض الواجهة فقط** — لا يشغّل `yt-dlp` ولا مسارات `/api/info` و `/api/download`.  
لذلك ترى **يتصل…** و **تعذّر جلب معلومات الوسائط** عند الضغط على «تحليل».

| ما تفعله | لماذا |
|----------|--------|
| انشر التطبيق **الكامل** على **Railway** (Docker) | المحرك + API يعملان |
| انشر نسخة احتياطية على **Render** | عند انتهاء رصيد Railway |
| عدّل **`netlify.toml`** في المشروع | يحوّل الزوار من Netlify → Railway وتحتفظ بنفس الرابط المعروف |

بعد نشر Railway، افتح `netlify.toml` واستبدل:

الملف `netlify.toml` يوجّه حالياً إلى:

`https://almonzel.onrender.com`

بعد إضافة Railway، غيّر السطر في `netlify.toml` ثم **أعد النشر على Netlify**.  
الزائر يفتح `down-loader.netlify.app` → يُوجَّه فوراً إلى Railway (يعمل التحليل والتحميل).

---

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

## Railway — إذا فشل البناء

1. تأكد أن آخر commit على GitHub **ليس** `bf22f59` فقط — يجب أن يحتوي `Dockerfile` على `apt-get install yt-dlp` (بدون `curl`).
2. Railway → **Deployments** → **Redeploy** على أحدث commit.
3. أو: **Settings** → **Redeploy** مع **Clear build cache**.
4. **Variables** (بعد نشر Render):
   - `DEPLOYMENT_PROVIDER` = `railway`
   - `NEXT_PUBLIC_FALLBACK_URL` = `https://almonzel.onrender.com`
   - `YTDLP_PATH` = `/usr/bin/yt-dlp`

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

4. انشر وانسخ رابط Railway.
5. (اختياري) حدّث `netlify.toml` وأعد نشر Netlify — يبقى رابطك `down-loader.netlify.app` يعمل عبر التحويل.

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

- **ffmpeg** + **python3** + **yt-dlp** + **Deno** مثبتان في Docker (مطلوب ليوتيوب).
- بدون **JS runtime** (Deno/Node) يوتيوب يعرض **صورة الغلاف فقط** — محلياً يعمل لأن Node موجود على جهازك.
- بعد أي تعديل: Render → **Manual Deploy** → **Clear build cache & deploy**.
- في لوحة Render: **Runtime = Docker** (ليس Node).
- تحقق: `/api/health` يجب أن يعيد `"ready":true` و `"version":"..."`.
- أول طلب على Render المجاني قد يكون بطيئاً (خمول ~50 ثانية).
- حد الطلبات (rate limit) مفعّل في API — مناسب لأقل من ~1000 مستخدم نشط.

### خطأ بناء Docker: `python3: No such file or directory`

يعني أن النشر يستخدم **Dockerfile قديم** (خطوة `curl` لـ yt-dlp).  
ادفع آخر commit ثم **Clear build cache & deploy**.  
الـ Dockerfile الصحيح يثبت `python3` + `pip install yt-dlp` — بدون `curl`.

### إذا بقي `ready: false`

1. افتح **Logs** في Render أثناء البناء — يجب أن ترى `yt-dlp --version` ناجحاً.
2. أضف `DEPLOY_VERBOSE_ERRORS=true` وافتح `/api/health` لرؤية `initError`.

### يوتيوب يعمل محلياً لكن على Render يظهر «صورة» فقط

1. ادفع آخر commit (Dockerfile يثبت Deno + `unzip` ويفحص يوتيوب أثناء البناء).
2. Render → **Manual Deploy** → **Clear build cache & deploy** (مهم — بدونها يبقى صورة Docker قديمة).
3. بعد النشر جرّب: `POST /api/info` برابط يوتيوب — يجب أن يكون `videoFormats` غير فارغ.

### فشل البناء: `either unzip or 7z is required to install Deno`

الـ Dockerfile القديم نسي حزمة `unzip`. ادفع آخر commit ثم أعد النشر.

### فشل البناء عند خطوة `yt-dlp -J` / YouTube smoke test

Render أثناء **البناء** غالباً لا يستطيع استخراج فيديو يوتيوب (شبكة مراكز البيانات). تم إزالة هذا الفحص من Dockerfile — يُتحقق فقط من تثبيت Deno و Node و yt-dlp. بعد النشر اختبر `/api/info` برابط يوتيوب.
