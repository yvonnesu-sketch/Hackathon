# Finance / Accounting BRD Automation

Step 1: an intake page where you submit the PRD and kick-off deck links for a project.

## Run

```bash
npm start
```

Open http://localhost:3000.

No dependencies are needed (Node 18+). Submissions are saved to `data/intakes.json`.

## Standalone page (no server)

```bash
npm run build
```

This writes `dist/brd-intake.html`, a single file you can open in any browser. Without the server, entries are saved in that browser only. The badge in the header shows where entries are being saved.

Each intake has a **Copy links for Claude** button, which copies its links so you can paste them into a Claude chat.

## API

- `GET /api/intakes`: list intakes
- `POST /api/intakes`: `{ projectName, owner?, financeArea?, notes?, prdLinks: [url], kickoffLinks: [url] }`
- `DELETE /api/intakes/:id`

Each link is tagged with its source (`google_doc`, `google_slides`, `confluence`, …), so a later step knows how to fetch it.

## Next steps

1. Fetch the document content (Google Drive API, Confluence API).
2. Pull out the finance-relevant requirements with Claude (accounting events, GL impacts, reconciliation, reporting, controls).
3. Write a BRD draft from a Finance BRD template.
