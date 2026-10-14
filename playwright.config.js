import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  timeout: 30000,
  reporter: 'list',
  // PW_CHANNEL=chrome 이면 설치된 Chrome으로 실행(Playwright 번들 Chromium이 없는 환경용).
  use: { baseURL: 'http://localhost:5173', acceptDownloads: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  webServer: { command: 'node scripts/serve.js', url: 'http://localhost:5173', reuseExistingServer: true },
});
