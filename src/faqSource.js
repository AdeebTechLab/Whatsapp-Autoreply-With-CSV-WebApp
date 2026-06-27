require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { loadJson, normalizeText } = require('./utils');

const LOCAL_FAQ_PATH = path.join(__dirname, '..', 'config', 'faqs.json');
const DEFAULT_LOCAL_CSV_PATH = path.join(__dirname, '..', 'config', 'auto-reply-sheet1.csv');

let cachedFaqs = null;
let cachedAt = 0;
let cachedSourceKey = null;
let lastSourceInfo = {
  source: 'local',
  loadedAt: null,
  error: null,
  count: 0
};

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function envNumber(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}

function resolveProjectPath(filePath) {
  if (!filePath) return DEFAULT_LOCAL_CSV_PATH;
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(process.cwd(), filePath);
}

function loadLocalFaqs() {
  const faqs = loadJson(LOCAL_FAQ_PATH, []);
  const safeFaqs = Array.isArray(faqs) ? faqs : [];
  lastSourceInfo = {
    source: 'local_json',
    loadedAt: new Date().toISOString(),
    error: null,
    count: safeFaqs.length
  };
  return safeFaqs;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return normalizeText(header).replace(/\s+/g, '_');
}

function splitKeywords(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[|;\n]+|,(?=\s*[^,]+(?:,|$))/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugifyId(value, fallback) {
  const slug = normalizeText(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function stripVisibleQuotationMarks(value) {
  const text = String(value || '');
  if (!envBool('STRIP_RESPONSE_QUOTES', true)) return text.trim();

  return text
    // Handles menu labels exported from Sheets like ''Tech'' without touching normal apostrophes such as You're.
    .replace(/''([^'\r\n]+?)''/g, '$1')
    // Handles straight and curly double quotation marks shown in WhatsApp responses.
    .replace(/["“”„‟]/g, '')
    .trim();
}

function looksLikeHeader(row = []) {
  const headers = row.map(normalizeHeader);
  const answerNames = ['answer', 'response', 'reply', 'message', 'bot_response'];
  const questionNames = ['id', 'question', 'questions', 'option', 'options', 'title', 'keyword', 'keywords', 'trigger', 'triggers'];
  return headers.some((header) => answerNames.includes(header)) && headers.some((header) => questionNames.includes(header));
}

function rowsToFaqs(rows) {
  if (!rows.length) return [];

  const hasHeader = looksLikeHeader(rows[0]);

  if (!hasHeader) {
    // Headerless two-column CSV format:
    // Column A = user trigger/question, Column B = bot response.
    return rows.map((row, index) => {
      const question = String(row[0] || '').trim();
      const answer = stripVisibleQuotationMarks(row[1] || '');
      const id = slugifyId(question, `csv-row-${index + 1}`);

      return {
        id,
        question,
        keywords: splitKeywords(question),
        answer
      };
    }).filter((faq) => faq.question && faq.answer);
  }

  const headers = rows[0].map(normalizeHeader);
  const getIndex = (...names) => names.map(normalizeHeader).map((name) => headers.indexOf(name)).find((index) => index >= 0);

  const idIndex = getIndex('id', 'faq id', 'key');
  const questionIndex = getIndex('question', 'questions', 'option', 'options', 'title');
  const keywordsIndex = getIndex('keywords', 'keyword', 'matching keywords', 'triggers', 'trigger');
  const answerIndex = getIndex('answer', 'response', 'reply', 'message', 'bot response');

  if (answerIndex === undefined || answerIndex < 0) {
    throw new Error('CSV/Google Sheet must contain an answer/response/reply column, or use headerless Column A trigger + Column B response format.');
  }

  return rows.slice(1).map((row, index) => {
    const question = questionIndex >= 0 ? String(row[questionIndex] || '').trim() : '';
    const answer = stripVisibleQuotationMarks(row[answerIndex] || '');
    const rawKeywords = keywordsIndex >= 0 ? row[keywordsIndex] : question;
    const id = idIndex >= 0 && row[idIndex] ? String(row[idIndex]).trim() : slugifyId(question, `sheet-row-${index + 2}`);

    return {
      id,
      question: question || id,
      keywords: splitKeywords(rawKeywords || question || id),
      answer
    };
  }).filter((faq) => faq.answer && (faq.question || faq.keywords.length));
}

function buildGoogleSheetCsvUrl() {
  if (process.env.GOOGLE_SHEET_CSV_URL) return process.env.GOOGLE_SHEET_CSV_URL;

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is missing in .env');

  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');

  if (process.env.GOOGLE_SHEET_GID) {
    url.searchParams.set('gid', process.env.GOOGLE_SHEET_GID);
  } else {
    url.searchParams.set('sheet', process.env.GOOGLE_SHEET_NAME || 'Sheet1');
  }

  return url.toString();
}

async function fetchGoogleSheetFaqs() {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18 or newer.');
  }

  const url = buildGoogleSheetCsvUrl();
  const response = await fetch(url, {
    headers: {
      'user-agent': 'whatsapp-automation-bot/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Sheet CSV request failed: HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const faqs = rowsToFaqs(parseCsv(csvText));

  if (!faqs.length) {
    throw new Error('Google Sheet loaded but no valid FAQ rows were found.');
  }

  lastSourceInfo = {
    source: 'google_sheet',
    loadedAt: new Date().toISOString(),
    error: null,
    count: faqs.length,
    stripResponseQuotes: envBool('STRIP_RESPONSE_QUOTES', true)
  };

  return faqs;
}

async function loadCsvFileFaqs() {
  const csvPath = resolveProjectPath(process.env.LOCAL_CSV_PATH);
  const csvText = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const faqs = rowsToFaqs(parseCsv(csvText));

  if (!faqs.length) {
    throw new Error(`CSV file loaded but no valid FAQ rows were found: ${csvPath}`);
  }

  lastSourceInfo = {
    source: 'csv_file',
    path: csvPath,
    loadedAt: new Date().toISOString(),
    error: null,
    count: faqs.length,
    stripResponseQuotes: envBool('STRIP_RESPONSE_QUOTES', true)
  };

  return faqs;
}

async function loadFaqs(options = {}) {
  const source = String(process.env.FAQ_SOURCE || 'csv_file').toLowerCase();
  const sourceKey = source === 'google_sheet'
    ? `google_sheet:${buildGoogleSheetCsvUrl()}`
    : source === 'csv_file' || source === 'csv' || source === 'local_csv'
      ? `csv_file:${resolveProjectPath(process.env.LOCAL_CSV_PATH)}`
      : `local_json:${LOCAL_FAQ_PATH}`;

  const refreshSeconds = envNumber('SHEET_REFRESH_SECONDS', envNumber('CSV_REFRESH_SECONDS', 15));
  const cacheIsFresh = cachedFaqs && cachedSourceKey === sourceKey && Date.now() - cachedAt < refreshSeconds * 1000;

  if (!options.forceRefresh && cacheIsFresh) return cachedFaqs;

  try {
    if (source === 'google_sheet') {
      cachedFaqs = await fetchGoogleSheetFaqs();
    } else if (source === 'csv_file' || source === 'csv' || source === 'local_csv') {
      cachedFaqs = await loadCsvFileFaqs();
    } else {
      cachedFaqs = loadLocalFaqs();
    }

    cachedAt = Date.now();
    cachedSourceKey = sourceKey;
    return cachedFaqs;
  } catch (error) {
    console.error('FAQ load failed:', error.message);
    lastSourceInfo = {
      source,
      loadedAt: lastSourceInfo.loadedAt,
      error: error.message,
      count: cachedFaqs ? cachedFaqs.length : 0,
      stripResponseQuotes: envBool('STRIP_RESPONSE_QUOTES', true)
    };

    if (cachedFaqs) return cachedFaqs;
    return loadLocalFaqs();
  }
}

function getFaqSourceInfo() {
  return lastSourceInfo;
}

module.exports = {
  loadFaqs,
  getFaqSourceInfo,
  parseCsv,
  rowsToFaqs,
  stripVisibleQuotationMarks
};
