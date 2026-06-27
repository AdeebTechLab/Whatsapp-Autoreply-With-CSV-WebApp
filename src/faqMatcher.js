const { normalizeText } = require('./utils');
const { loadFaqs, getFaqSourceInfo } = require('./faqSource');

function tokenize(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ') : [];
}

function getMenuText(faqs) {
  const list = faqs
    .filter((faq) => faq.id !== 'greeting' && faq.id !== 'thanks')
    .map((faq, index) => `${index + 1}. ${faq.question}`)
    .join('\n');

  return `Here are the questions I can answer:\n\n${list}\n\nType your question, for example: pricing, services, hours, support.`;
}

function matchFaq(message, faqs = []) {
  const normalizedMessage = normalizeText(message);
  const messageTokens = new Set(tokenize(message));

  if (!normalizedMessage) {
    return { faq: null, score: 0, reason: 'empty-message' };
  }

  if (["menu", "help", "options", "option", "faq", "faqs"].includes(normalizedMessage)) {
    return {
      faq: {
        id: 'menu',
        question: 'FAQ menu',
        answer: getMenuText(faqs)
      },
      score: 1,
      reason: 'menu-command'
    };
  }

  let best = { faq: null, score: 0, reason: 'no-match' };

  for (const faq of faqs) {
    const keywordScores = (faq.keywords || []).map((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) return 0;

      if (normalizedMessage === normalizedKeyword) return 1;
      if (normalizedMessage.includes(normalizedKeyword)) return 0.92;

      const keywordTokens = tokenize(keyword);
      if (!keywordTokens.length) return 0;

      const matchedTokens = keywordTokens.filter((token) => messageTokens.has(token)).length;
      return matchedTokens / keywordTokens.length;
    });

    const questionTokens = tokenize(faq.question || '');
    const questionOverlap = questionTokens.length
      ? questionTokens.filter((token) => messageTokens.has(token)).length / questionTokens.length
      : 0;

    const keywordScore = keywordScores.length ? Math.max(...keywordScores) : 0;
    const score = Math.max(keywordScore, questionOverlap * 0.85);

    if (score > best.score) {
      best = { faq, score: Number(score.toFixed(2)), reason: 'keyword-or-question-match' };
    }
  }

  return best;
}

module.exports = {
  loadFaqs,
  getFaqSourceInfo,
  matchFaq,
  getMenuText
};
