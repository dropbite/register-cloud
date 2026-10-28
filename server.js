require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const required = ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (String(process.env.SESSION_SECRET).length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
} } }));
app.use(express.json({ limit: '20kb' }));
app.use(session({
  store: new connectPgSimple({ pool, createTableIfMissing: true, tableName: 'user_sessions' }),
  name: 'registercloud.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'ብዙ ጊዜ ሞክረዋል። ከ15 ደቂቃ በኋላ ይሞክሩ።' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'ብዙ የመግባት ሙከራዎች ተደርገዋል። ቆይተው ይሞክሩ።' } });
const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
const hashOtp = (otp, email) => crypto.createHash('sha256').update(`${email.toLowerCase()}:${otp}:${process.env.SESSION_SECRET}`).digest('hex');
const cleanEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAdmin = (req, res, next) => req.session?.admin === true ? next() : res.status(401).json({ error: 'እባክዎ እንደ አስተዳዳሪ ይግቡ።' });

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS registrations (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pending_registrations (
    email VARCHAR(254) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    otp_expires_at TIMESTAMPTZ NOT NULL,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    detail VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`DELETE FROM pending_registrations WHERE otp_expires_at < NOW() - INTERVAL '1 day'`);
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Register Cloud API' }));

app.post('/api/register/start', otpLimiter, asyncRoute(async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'ሙሉ ስምዎን ያስገቡ (2–100 ቁምፊ).' });
  if (!validEmail(email)) return res.status(400).json({ error: 'ትክክለኛ ኢሜይል ያስገቡ።' });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'የይለፍ ቃሉ ቢያንስ 10 ቁምፊ መሆን አለበት።' });
  const existing = await pool.query('SELECT id FROM registrations WHERE email=$1', [email]);
  if (existing.rowCount) return res.status(409).json({ error: 'ይህ ኢሜይል ቀድሞ ተመዝግቧል።' });
  const previous = await pool.query('SELECT last_sent_at FROM pending_registrations WHERE email=$1', [email]);
  if (previous.rowCount && Date.now() - new Date(previous.rows[0].last_sent_at).getTime() < 60_000) {
    return res.status(429).json({ error: 'አዲስ ኮድ ከመጠየቅዎ በፊት 60 ሰከንድ ይጠብቁ።' });
  }
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ttl = Math.max(5, Math.min(30, Number(process.env.OTP_TTL_MINUTES || 10)));
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(`INSERT INTO pending_registrations(email, full_name, password_hash, otp_hash, otp_expires_at, last_sent_at, attempts)
    VALUES($1,$2,$3,$4,NOW()+($5 * INTERVAL '1 minute'),NOW(),0)
    ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,password_hash=EXCLUDED.password_hash,otp_hash=EXCLUDED.otp_hash,otp_expires_at=EXCLUDED.otp_expires_at,last_sent_at=NOW(),attempts=0`,
    [email, fullName, passwordHash, hashOtp(otp, email), ttl]);
  try {
    await mailer.sendMail({ from: process.env.MAIL_FROM, to: email, subject: `${process.env.APP_NAME || 'Register Cloud'} — Email verification code`,
      text: `Your verification code is ${otp}. It expires in ${ttl} minutes. If you did not request this, you can ignore this email. Do not share this code with anyone.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>${process.env.APP_NAME || 'Register Cloud'}</h2><p>Your email verification code is:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:18px;background:#f2f5f9;border-radius:12px;text-align:center">${otp}</div><p>This code expires in ${ttl} minutes. Do not share it with anyone.</p></div>` });
  } catch (e) {
    await pool.query('DELETE FROM pending_registrations WHERE email=$1', [email]);
    console.error('Email delivery failed:', e.message);
    return res.status(502).json({ error: 'ኢሜይሉን መላክ አልተቻለም። SMTP ቅንብርዎን ያረጋግጡ።' });
  }
  await pool.query("INSERT INTO admin_events(event_type,detail) VALUES('otp_sent','Verification email sent')");
  res.json({ message: 'የማረጋገጫ ኮድ ወደ ኢሜይልዎ ተልኳል።' });
}));

app.post('/api/register/verify', otpLimiter, asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email);
  const otp = String(req.body.otp || '').trim();
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'ኢሜይልና ባለ 6 አሃዝ ኮድ ያስገቡ።' });
  const result = await pool.query('SELECT * FROM pending_registrations WHERE email=$1', [email]);
  if (!result.rowCount) return res.status(400).json({ error: 'ኮዱ አልተገኘም። እንደገና ይመዝገቡ።' });
  const pending = result.rows[0];
  if (new Date(pending.otp_expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'ኮዱ ጊዜው አልፏል። አዲስ ኮድ ይጠይቁ።' });
  if (pending.attempts >= 5) return res.status(429).json({ error: 'ብዙ የተሳሳቱ ሙከራዎች። አዲስ ኮድ ይጠይቁ።' });
  if (hashOtp(otp, email) !== pending.otp_hash) {
    await pool.query('UPDATE pending_registrations SET attempts=attempts+1 WHERE email=$1', [email]);
    return res.status(400).json({ error: 'የማረጋገጫ ኮዱ ትክክል አይደለም።' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO registrations(full_name,email,password_hash,verified,verified_at) VALUES($1,$2,$3,TRUE,NOW()) ON CONFLICT(email) DO NOTHING', [pending.full_name, email, pending.password_hash]);
    await client.query('DELETE FROM pending_registrations WHERE email=$1', [email]);
    await client.query("INSERT INTO admin_events(event_type,detail) VALUES('registration_verified','A user completed email verification')");
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ message: 'ተመዝግበዋል! ኢሜይልዎ ተረጋግጧል።' });
}));

app.post('/api/admin/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  const emailMatches = email && email === cleanEmail(process.env.ADMIN_EMAIL);
  const passwordMatches = await bcrypt.compare(password, adminPasswordHash);
  if (!emailMatches || !passwordMatches) {
    await pool.query("INSERT INTO admin_events(event_type,detail) VALUES('admin_login_failed','Failed admin login attempt')");
    return res.status(401).json({ error: 'ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'የመግቢያ ክፍለ ጊዜ መፍጠር አልተቻለም።' });
    req.session.admin = true;
    req.session.adminEmail = email;
    req.session.save(async (saveErr) => {
      if (saveErr) return res.status(500).json({ error: 'የመግቢያ ክፍለ ጊዜ ማስቀመጥ አልተቻለም።' });
      await pool.query("INSERT INTO admin_events(event_type,detail) VALUES('admin_login','Administrator signed in')");
      res.json({ message: 'ገብተዋል።', email });
    });
  });
}));
app.post('/api/admin/logout', (req, res) => req.session.destroy(() => { res.clearCookie('registercloud.sid'); res.json({ message: 'ወጥተዋል።' }); }));
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ email: req.session.adminEmail }));
app.get('/api/admin/overview', requireAdmin, asyncRoute(async (req, res) => {
  const counts = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE verified=true)::int AS verified,
    COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours')::int AS last_24h FROM registrations`);
  const pending = await pool.query('SELECT COUNT(*)::int AS total FROM pending_registrations');
  const users = await pool.query('SELECT id,full_name,email,verified,created_at,verified_at FROM registrations ORDER BY created_at DESC LIMIT 100');
  const events = await pool.query('SELECT id,event_type,detail,created_at FROM admin_events ORDER BY created_at DESC LIMIT 20');
  res.json({ stats: { ...counts.rows[0], pending: pending.rows[0].total }, users: users.rows, events: events.rows });
}));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'የስርዓት ስህተት ተፈጥሯል። ቆይተው ይሞክሩ።' });
});

initDb().then(() => app.listen(port, () => console.log(`Register Cloud listening on ${port}`)))
  .catch((err) => { console.error('Database initialization failed:', err); process.exit(1); });
