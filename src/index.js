require('dotenv').config();
const { createClient, status } = require('./bot');
const { createServer } = require('./server');

const PORT = process.env.PORT || 3000;

const app = createServer();
app.listen(PORT, () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
});

const client = createClient();
client.initialize().catch((error) => {
  status.state = 'error';
  status.message = 'Bot startup failed. Check Chrome/Edge path, server permissions, and terminal error logs.';
  status.lastError = error.message;
  console.error('Bot startup failed:', error);
});

process.on('unhandledRejection', (error) => {
  status.state = 'error';
  status.message = 'Unhandled bot error. Check terminal logs.';
  status.lastError = error && error.message ? error.message : String(error);
  console.error('Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down bot...');
  try {
    await client.destroy();
  } catch (error) {
    console.error(error.message);
  }
  process.exit(0);
});
