const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:8123' },
  webServer: {
    command: 'npx http-server -p 8123 -c-1 .',
    url: 'http://127.0.0.1:8123/chess.html',
    reuseExistingServer: true,
    timeout: 30000
  }
});
