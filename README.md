# Resume Outreach Studio

Memory-backed outreach tool for fresher marketing and HR applications. Users verify SMTP, upload a resume, paste recruiter contact text, preview personalized emails, and send from the browser.

## Run

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`.

## Checks

```bash
npm run check
```

## Environment

- `HOST`: bind host, default `127.0.0.1`
- `PORT`: bind port, default `3000`
- `NODE_ENV`: set to `production` to enable secure cookie flag

## Production Notes

- Session state is in process memory only. Restarting the server clears SMTP state, resume uploads, and history.
- Sessions expire automatically after 6 hours of inactivity.
- Resume uploads are limited to 5 MB and PDF/DOC/DOCX/TXT types.
- Recipient extraction is capped at 50 unique email addresses per saved resume session.
- History is capped at the 100 most recent send batches per session.

## Endpoints

- `GET /health`
- `GET /api/session`
- `POST /api/verify`
- `POST /api/resume`
- `POST /api/preview`
- `POST /api/send`
