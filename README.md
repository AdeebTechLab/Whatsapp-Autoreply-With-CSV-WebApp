# WhatsApp Automation - CSV Trained Final

This project runs a WhatsApp Web based auto-reply bot with a browser dashboard.

## What is trained in this version

- The uploaded CSV is included at `config/auto-reply-sheet1.csv`.
- CSV format is headerless and supported directly:
  - Column A = user trigger / menu option
  - Column B = exact WhatsApp response
- The bot removes visible quotation marks from replies before sending them.
  - `"Main Menu"` becomes `Main Menu`
  - `''Tech''` becomes `Tech`
  - Normal apostrophes like `You're` are kept.
- `{name}` in CSV replies is replaced with the contact name when WhatsApp provides one, otherwise `Friend`.
- The CSV refreshes every 15 seconds, so updating the CSV file does not require code changes.

## Main startup file

```txt
src/index.js
```

Start command:

```bash
npm start
```

## Local setup

Install Node.js 18 or newer.

```bash
npm install --ignore-scripts
cp .env.example .env
npm start
```

On Windows PowerShell:

```powershell
npm install --ignore-scripts
copy .env.example .env
npm start
```

Open dashboard:

```txt
http://localhost:3000
```

Scan QR from WhatsApp mobile app > Linked devices > Link a device.

## CSV source setup

Default `.env` settings:

```env
FAQ_SOURCE=csv_file
LOCAL_CSV_PATH=./config/auto-reply-sheet1.csv
CSV_REFRESH_SECONDS=15
STRIP_RESPONSE_QUOTES=true
```

If you edit `config/auto-reply-sheet1.csv`, the next refresh cycle will pick it up automatically. No source-code change is needed.

## Google Sheet live setup

To make it read directly from Google Sheet Sheet1 instead of local CSV:

```env
FAQ_SOURCE=google_sheet
GOOGLE_SHEET_ID=1hCz8S0JFTFEESV7IRejWZipyB4isVDh7GKDRPH010dQ
GOOGLE_SHEET_NAME=Sheet1
SHEET_REFRESH_SECONDS=15
```

Your Google Sheet must be accessible to the server. If private access blocks CSV export, make the sheet readable to anyone with the link or use a published CSV URL:

```env
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/YOUR_ID/gviz/tq?tqx=out:csv&sheet=Sheet1
```

The same headerless two-column format works in Google Sheets:

```txt
Column A: trigger/menu option
Column B: response
```

## QR code issue fix

If QR appeared once but now it does not appear, the app may be trying to use an old saved WhatsApp Web session.

Stop the bot, then delete these folders if they exist:

```txt
.wwebjs_auth
.wwebjs_cache
data/whatsapp-session
```

Then run:

```bash
npm start
```

A fresh QR should appear on the terminal and dashboard.

## Permanent deployment without keeping laptop open

This bot cannot live inside the mobile WhatsApp app only. Your mobile phone links the account once by QR. The bot process still needs a machine running 24/7.

Recommended for this project:

- VPS/cloud server with Node.js 18+
- Chromium/Chrome installed
- PM2 process manager
- Persistent `data/whatsapp-session` folder

Example PM2 commands:

```bash
npm install --ignore-scripts
npm install -g pm2
pm2 start src/index.js --name whatsapp-bot
pm2 save
pm2 startup
```

After scanning QR once, do not delete `data/whatsapp-session`. That folder keeps the login session.

For official production/business automation at scale, use WhatsApp Business Platform / Cloud API instead of WhatsApp Web automation.

## Important safety note

Use this only for permission-based support and customer replies. Do not use it for spam, scraping, bulk marketing, or unsolicited messages.
