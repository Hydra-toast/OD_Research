import config from './playwright.config.js';
export default {
  ...config,
  use: { ...config.use, baseURL: 'http://localhost:5174' },
  webServer: { ...config.webServer, url: 'http://localhost:5174', env: { ...config.webServer.env, PORT: '5174' } },
};
