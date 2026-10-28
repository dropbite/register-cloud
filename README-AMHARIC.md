# Register Cloud — ሙሉ Build (Android ስልክ ላይ ለማዘጋጀት)

ይህ ፕሮጀክት የሚያካትተው፦
- የተጠቃሚ መመዝገቢያ (Register)
- በኢሜይል የሚላክ ባለ 6 አሃዝ OTP ማረጋገጫ
- PostgreSQL Database
- በSession የተጠበቀ Admin Dashboard
- የተጠቃሚ ቁጥር፣ የምዝገባ ሁኔታ እና የስርዓት ክስተቶች

**ጠቃሚ:** ይህ ሙሉ የመተግበሪያ ኮድ ነው፣ ግን እስካሁን በእርስዎ የhosting/database/SMTP መለያዎች ላይ አልተዘረጋም። እነዚያን ማዋቀር ያስፈልጋል። የኢሜይል አቅራቢ ካልተዋቀረ OTP አይላክም።

## ከAndroid ስልክ ላይ የማዘጋጀት መንገድ

### 1) ZIP ክፈት
1. ZIP ፋይሉን በDownloads ውስጥ አውርድ።
2. Files by Google ወይም የስልክህን File Manager ክፈት።
3. ZIP ፋይሉን Extract/Unzip አድርግ።

### 2) GitHub ላይ አስገባ
1. በChrome `https://github.com/` ክፈት እና ግባ።
2. New repository ፍጠር፤ ለምሳሌ `register-cloud`።
3. የፕሮጀክቱን ፋይሎች አስገባ። GitHub በሞባይል ላይ ብዙ ፋይሎችን ማስገባት ካስቸገረ፣ GitHub ከሚደግፈው የUpload files መንገድ ወይም የሞባይል Git client ተጠቀም።
4. `.env` ፋይል አትጫን፤ በGitHub ላይ ሚስጥር አታስቀምጥ።

### 3) PostgreSQL Database ፍጠር
1. `https://neon.tech/` ወይም ሌላ PostgreSQL አቅራቢ ክፈት።
2. Project/Database ፍጠር።
3. Connection string ቅዳ። ይህን በhosting provider ውስጥ `DATABASE_URL` በሚለው Environment Variable ላይ አስገባ።
4. Connection string ሚስጥራዊ ነው፤ ለሰዎች አታጋራ።

### 4) SMTP Email አቅራቢ አዘጋጅ
1. ከSMTP የሚደግፍ የኢሜይል አቅራቢ ጋር መለያ ፍጠር። የላኪ አድራሻህን ካስፈለገ አረጋግጥ።
2. SMTP Host, Port, Username, Password አግኝ። መደበኛ የSTARTTLS ማዋቀር ብዙ ጊዜ Port `587` እና `SMTP_SECURE=false` ነው፤ የአቅራቢህን መመሪያ ተከተል።

### 5) Backend አስተናግድ
1. `https://render.com/` ክፈት እና GitHub አገናኝ።
2. New → Web Service ምረጥ እና repository `register-cloud` ምረጥ።
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables ውስጥ ከታች ያሉትን ጨምር።
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = ከPostgreSQL የተገኘው connection string
   - `SESSION_SECRET` = ረጅም እና የማይገመት ሚስጥር (ቢያንስ 32 ቁምፊ)
   - `ADMIN_EMAIL` = የአስተዳዳሪ ኢሜይል
   - `ADMIN_PASSWORD` = ጠንካራ እና ለዚህ ብቻ የሚጠቀሙበት የይለፍ ቃል
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` = ከSMTP አቅራቢው የተገኙ እሴቶች
   - `APP_NAME` = `Register Cloud`
   - `OTP_TTL_MINUTES` = `10`
   - `APP_ORIGIN` = የተሰጠው የsite URL (አሁን የሚጠቀምበትን ኮድ ለማስኬድ የግድ አይደለም)
6. Deploy ጠቅ አድርግ። መጀመሪያ ሲነሳ ዳታቤዙ ሰንጠረዦቹን በራሱ ይፈጥራል።

### 6) ፈትሽ
- የRender URL ክፈት፤ Register ገጹ ይታያል።
- በእውነተኛ ኢሜይልህ ተመዝገብ እና OTP መድረሱን ፈትሽ።
- `https://YOUR-RENDER-URL/admin` ክፈት፤ በ`ADMIN_EMAIL` እና `ADMIN_PASSWORD` ግባ።
- `/api/health` ላይ `{"ok":true,...}` ማየት አለብህ።

## የደህንነት ማስታወሻ
- Admin Dashboard የOTP ኮዶችን እና ጥሬ የይለፍ ቃሎችን አያሳይም።
- OTP በDB ውስጥ hash ሆኖ ይቀመጣል፤ በኢሜይል ብቻ ይላካል።
- የራስህን መተግበሪያ ለማረጋገጥ ብቻ ተጠቀም፤ የሌሎች ድረ-ገጾች OTP ለመሰብሰብ አትጠቀም።
- ለቀጥታ አገልግሎት ከመጠቀምህ በፊት የSMTP አቅራቢውን የማስረከቢያ ሁኔታ፣ backups፣ monitoring እና privacy policy አዘጋጅ።

## Files
- `public/index.html` — Register page
- `public/admin.html` — Admin login/dashboard
- `public/styles.css` — Design
- `public/app.js` — Registration browser logic
- `public/admin.js` — Admin browser logic
- `src/server.js` — API, security controls, email OTP, PostgreSQL
- `.env.example` — Environment variable sample; real values must be set privately in hosting settings
