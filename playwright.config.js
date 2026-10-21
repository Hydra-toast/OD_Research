import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  timeout: 30000,
  reporter: 'list',
  // PW_CHANNEL=chrome 이면 설치된 Chrome으로 실행(Playwright 번들 Chromium이 없는 환경용).
  use: { baseURL: 'http://localhost:5173', acceptDownloads: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  // 기존 예시 회귀 검사는 외부 검색/개인 .env에 의존하지 않는다. 실검색 UI는 route fixture로 검사한다.
  webServer: { command: 'node scripts/serve.js', url: 'http://localhost:5173', reuseExistingServer: false, env: { SEARCH_ENABLED: 'false' } },
});
