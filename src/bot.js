require('dotenv').config();
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { appendLog } = require('./conversationLogger');
const { loadFaqs, matchFaq } = require('./faqMatcher');
const { stripVisibleQuotationMarks } = require('./faqSource');
const { sleep, normalizeText } = require('./utils');
const { isOptedOut, optOut, optIn } = require('./optOutStore');
const { getBrowserPath } = require('./chromePath');

const status = {
  state: 'starting',
  message: 'Bot is starting...',
  qr: null,
  qrGeneratedAt: null,
  readyAt: null,
  lastError: null
};

const fallbackTracker = new Map();

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function envNumber(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}

function isOutsideBusinessHours() {
  if (!envBool('BUSINESS_HOURS_ENABLED', false)) return false;
  const startHour = envNumber('BUSINESS_START_HOUR', 9);
  const endHour = envNumber('BUSINESS_END_HOUR', 18);
  const now = new Date();
  const hour = now.getHours();
  return hour < startHour || hour >= endHour;
}

function canSendFallback(contactId) {
  const cooldownSeconds = envNumber('FALLBACK_COOLDOWN_SECONDS', 60);
  const lastTime = fallbackTracker.get(contactId) || 0;
  const now = Date.now();

  if (now - lastTime < cooldownSeconds * 1000) return false;
  fallbackTracker.set(contactId, now);
  return true;
}


function personalizeReply(reply, contactName = '') {
  const fallbackName = process.env.CONTACT_NAME_FALLBACK || 'Friend';
  const safeName = String(contactName || '').trim() || fallbackName;
  return stripVisibleQuotationMarks(String(reply || '').replace(/\{name\}/gi, safeName));
}

async function getContactName(message) {
  try {
    const contact = await message.getContact();
    return contact.pushname || contact.name || contact.shortName || '';
  } catch {
    return '';
  }
}

function createClient() {
  const browserPath = getBrowserPath();
  const authPath = process.env.WHATSAPP_AUTH_PATH || path.join(process.cwd(), 'data', 'whatsapp-session');
  const clientId = process.env.WHATSAPP_CLIENT_ID || 'internship-bot';

  if (browserPath) {
    console.log('Using installed browser:', browserPath);
  } else {
    console.log('No installed Chrome/Edge path found automatically. If startup fails, set PUPPETEER_EXECUTABLE_PATH in .env.');
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: authPath }),
    puppeteer: {
      headless: true,
      executablePath: browserPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  client.on('loading_screen', (percent, message) => {
    status.state = 'loading';
    status.message = `Loading WhatsApp session... ${percent || 0}% ${message || ''}`.trim();
    console.log(status.message);
  });

  client.on('change_state', (state) => {
    if (status.state !== 'ready' && status.state !== 'qr') {
      status.state = 'connecting';
      status.message = `WhatsApp client state: ${state}`;
    }
    console.log('WhatsApp client state:', state);
  });

  client.on('qr', async (qr) => {
    status.state = 'qr';
    status.message = 'Scan the QR code from WhatsApp > Linked devices.';
    status.qrGeneratedAt = new Date().toISOString();
    status.readyAt = null;
    status.qr = await QRCode.toDataURL(qr);

    console.log('\nScan this QR code with WhatsApp mobile app:\n');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('\nOpen dashboard: http://localhost:' + (process.env.PORT || 3000) + '\n');
  });

  client.on('ready', () => {
    status.state = 'ready';
    status.message = 'WhatsApp bot is connected and ready.';
    status.readyAt = new Date().toISOString();
    status.qr = null;
    status.lastError = null;
    console.log('WhatsApp bot is ready.');
  });

  client.on('authenticated', () => {
    status.state = 'authenticated';
    status.message = 'Authenticated. Loading WhatsApp session...';
    status.qr = null;
    console.log('WhatsApp authentication successful.');
  });

  client.on('auth_failure', (msg) => {
    status.state = 'auth_failure';
    status.message = 'Authentication failed. Delete data/whatsapp-session, .wwebjs_auth, and .wwebjs_cache, then scan again.';
    status.lastError = msg;
    console.error('Authentication failed:', msg);
  });

  client.on('remote_session_saved', () => {
    status.message = 'WhatsApp session saved. Future restarts should not need QR unless device is unlinked.';
    console.log('WhatsApp remote session saved.');
  });

  client.on('disconnected', (reason) => {
    status.state = 'disconnected';
    status.message = 'Bot disconnected. Restart the app and scan again if needed.';
    status.lastError = reason;
    console.log('Client disconnected:', reason);
  });

  client.on('message', async (message) => {
    try {
      if (message.fromMe) return;
      if (message.from === 'status@broadcast') return;

      const ignoreGroups = envBool('IGNORE_GROUPS', true);
      const chat = await message.getChat();
      if (ignoreGroups && chat.isGroup) return;

      const contactId = message.from;
      const contactName = await getContactName(message);
      const text = message.body || '';
      const normalized = normalizeText(text);

      appendLog({
        direction: 'inbound',
        contactId,
        contactName,
        message: text
      });

      if (['stop', 'unsubscribe', 'off'].includes(normalized)) {
        optOut(contactId);
        const reply = 'Auto-replies are now turned off for this chat. Type *start* to turn them on again.';
        await message.reply(reply);
        appendLog({ direction: 'outbound', contactId, contactName, matchedFaq: 'opt-out', confidence: 1, reply });
        return;
      }

      if (['start', 'on'].includes(normalized)) {
        optIn(contactId);
        const reply = 'Auto-replies are now turned on again. Type *menu* to see options.';
        await message.reply(reply);
        appendLog({ direction: 'outbound', contactId, contactName, matchedFaq: 'opt-in', confidence: 1, reply });
        return;
      }

      if (isOptedOut(contactId)) return;
      if (!envBool('AUTO_REPLY_ENABLED', true)) return;

      const faqs = await loadFaqs();
      const result = matchFaq(text, faqs);
      const minScore = envNumber('MIN_MATCH_SCORE', 0.45);
      let reply = '';
      let matchedFaq = '';
      let confidence = result.score || 0;

      if (result.faq && result.score >= minScore) {
        reply = personalizeReply(result.faq.answer, contactName);
        matchedFaq = result.faq.id;
      } else {
        if (!canSendFallback(contactId)) return;
        reply = personalizeReply(process.env.FALLBACK_REPLY || 'Thanks for your message. Type menu to see FAQ options.', contactName);
        matchedFaq = 'fallback';
      }

      if (isOutsideBusinessHours() && matchedFaq !== 'fallback') {
        reply += '\n\nNote: We may reply slowly outside working hours.';
      }

      const delayMs = envNumber('BOT_REPLY_DELAY_MS', 800);
      if (delayMs > 0) await sleep(delayMs);

      await message.reply(reply);
      appendLog({
        direction: 'outbound',
        contactId,
        contactName,
        matchedFaq,
        confidence,
        reply
      });
    } catch (error) {
      status.lastError = error.message;
      console.error('Message handling error:', error);
    }
  });

  return client;
}

module.exports = {
  createClient,
  status
};
