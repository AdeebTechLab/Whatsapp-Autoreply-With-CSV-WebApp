/**
 * Stops Puppeteer from downloading its own Chrome during npm install.
 * The app uses your already installed Google Chrome or Microsoft Edge instead.
 */
module.exports = {
  skipDownload: true,
  chrome: {
    skipDownload: true
  },
  chromium: {
    skipDownload: true
  }
};
