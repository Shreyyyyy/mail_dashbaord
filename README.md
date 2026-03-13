# Hiring Mail Portal

Single-user SMTP mail portal designed to run locally or on Vercel.

The app:

1. saves one SMTP + resume + template setup
2. previews personalized mails for pasted recruiter emails
3. keeps a dashboard of sent mail history

## Local Run

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`.

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

Persistent storage on Vercel:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Without KV:

- local development uses in-memory fallback
- Vercel deployment will not reliably persist setup or dashboard history across invocations

## API Overview

- `GET /api/bootstrap`
- `POST /api/user/setup/verify-smtp`
- `POST /api/user/setup`
- `POST /api/user/send/preview`
- `POST /api/user/send`
- `GET /health`
