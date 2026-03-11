# Hiring Mail Sender

Single-user mail sender for non-technical usage.

The app is designed for this workflow:

1. One technical/admin person completes setup once.
2. SMTP, sender identity, resume, and default template are saved on disk in `app-data/state.json`.
3. After that, the day-to-day user only pastes hiring-team email IDs in the `Send Now` tab and clicks send.

## Run

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000`.

## Check

```bash
npm run check
```

## Persistent Setup

The one-time setup stores:

- SMTP host, port, username, password
- Sender name and sender email
- Resume file
- Default profile and template
- Optional default subject override
- Optional default additional note

The setup is persisted locally in `app-data/state.json`.

## Day-To-Day Use

The non-technical user only needs to:

1. Open `Send Now`
2. Paste recruiter / hiring-team emails
3. Review detected recipients and preview
4. Click `Send Emails`

## Endpoints

- `GET /health`
- `GET /api/state`
- `POST /api/setup`
- `POST /api/send/preview`
- `POST /api/send`
