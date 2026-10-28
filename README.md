# Register Cloud

A secure registration starter with email OTP verification, PostgreSQL, and an admin dashboard. See [README-AMHARIC.md](README-AMHARIC.md) for Android-first deployment steps.

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env` and fill in real values.
3. Run `npm install` then `npm start`.
4. Open `http://localhost:3000` and `http://localhost:3000/admin`.

Never commit `.env` or expose database/SMTP/admin secrets. Production deployment requires a PostgreSQL service, SMTP provider, and hosting environment variables.
