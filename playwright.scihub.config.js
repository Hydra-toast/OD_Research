import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: 'e2e', testMatch: 'scihub.e2e.js', timeout: 150000, retries: 0, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5187', channel: 'chrome', acceptDownloads: true, launchOptions: { downloadsPath: resolve('test-results/scihub-downloads') }, viewport: { width: 1440, height: 1000 } },
});
