# Hiring Mail Portal

Multi-user OTP-based hiring mail portal designed to run serverless on Vercel.

Each user:

1. logs in with OTP on their own email
2. saves their own SMTP + resume + template setup
3. gets their own send screen and dashboard

## Local Run

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`.

## Local Development OTP

If OTP mailer env vars are not configured and `NODE_ENV` is not `production`, the OTP response includes a `devOtp` value for testing.

## Check

```bash
npm run check
```

## Vercel Deployment

This repo is Vercel-compatible through:

- [`api/index.js`](/home/shrey/projects/mail/api/index.js)
- [`vercel.json`](/home/shrey/projects/mail/vercel.json)
- exported Express app in [`server.js`](/home/shrey/projects/mail/server.js)

## Required Environment Variables For Production

OTP delivery:

- `OTP_SMTP_HOST`
- `OTP_SMTP_PORT`
- `OTP_SMTP_USER`
- `OTP_SMTP_PASS`
- `OTP_FROM_EMAIL`
- `OTP_SMTP_SECURE` optional, default `true`
- `OTP_SMTP_TLS_REJECT_UNAUTHORIZED` optional, default `true`

Persistent storage on Vercel:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Without KV:

- local development uses in-memory fallback
- Vercel deployment will not reliably persist users, sessions, OTPs, or dashboards across invocations

## API Overview

- `GET /api/bootstrap`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/logout`
- `POST /api/user/setup/verify-smtp`
- `POST /api/user/setup`
- `POST /api/user/send/preview`
- `POST /api/user/send`
- `GET /health`
