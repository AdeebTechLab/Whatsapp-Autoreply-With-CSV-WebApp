const fs = require('fs');
const path = require('path');
const { ensureDir, nowIso } = require('./utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const JSONL_PATH = path.join(LOG_DIR, 'conversations.jsonl');
const CSV_PATH = path.join(LOG_DIR, 'conversations.csv');

function escapeCsv(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function ensureCsvHeader() {
  ensureDir(LOG_DIR);
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(
      CSV_PATH,
      'timestamp,direction,contactId,contactName,message,matchedFaq,confidence,reply\n'
    );
  }
}

function appendLog(entry) {
  ensureDir(LOG_DIR);
  ensureCsvHeader();

  const record = {
    timestamp: entry.timestamp || nowIso(),
    direction: entry.direction || 'inbound',
    contactId: entry.contactId || '',
    contactName: entry.contactName || '',
    message: entry.message || '',
    matchedFaq: entry.matchedFaq || '',
    confidence: entry.confidence ?? '',
    reply: entry.reply || ''
  };

  fs.appendFileSync(JSONL_PATH, JSON.stringify(record) + '\n');

  const csvRow = [
    record.timestamp,
    record.direction,
    record.contactId,
    record.contactName,
    record.message,
    record.matchedFaq,
    record.confidence,
    record.reply
  ].map(escapeCsv).join(',') + '\n';

  fs.appendFileSync(CSV_PATH, csvRow);
  return record;
}

function readRecentLogs(limit = 100) {
  ensureDir(LOG_DIR);
  if (!fs.existsSync(JSONL_PATH)) return [];

  const lines = fs.readFileSync(JSONL_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-Number(limit));

  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean).reverse();
}

module.exports = {
  appendLog,
  readRecentLogs,
  paths: {
    jsonl: JSONL_PATH,
    csv: CSV_PATH
  }
};
