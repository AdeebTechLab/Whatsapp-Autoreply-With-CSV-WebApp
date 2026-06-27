const express = require('express');
const path = require('path');
const { readRecentLogs, paths } = require('./conversationLogger');
const { loadFaqs, getFaqSourceInfo } = require('./faqMatcher');
const { status } = require('./bot');
const { getOptOuts } = require('./optOutStore');

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/status', (req, res) => {
    res.json(status);
  });

  app.get('/api/faqs', async (req, res) => {
    try {
      const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
      res.json(await loadFaqs({ forceRefresh }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/faq-source', (req, res) => {
    res.json(getFaqSourceInfo());
  });

  app.get('/api/logs', (req, res) => {
    const limit = Number(req.query.limit || 100);
    res.json(readRecentLogs(limit));
  });

  app.get('/api/optouts', (req, res) => {
    res.json(getOptOuts());
  });

  app.get('/api/log-files', (req, res) => {
    res.json(paths);
  });

  return app;
}

module.exports = {
  createServer
};
