// Vercel의 검색·공개 PDF 진입점. 로컬 PDF 수신함과 파일 저장 서비스는 열지 않는다.
import { createApp } from './app.js';
import { readConfig } from './env.js';
import { createDisabledAuth } from './auth.js';
import { createLiveSearch } from '../src/providers/live.js';

const config = readConfig();
const search = config.searchEnabled ? createLiveSearch({ apiKey: config.openalexKey, mailto: config.mailto }) : null;

export const app = createApp({
  root: process.cwd(),
  auth: createDisabledAuth(),
  projects: { forToken: () => null },
  search,
  schedule: false,
  fulltext: { publicFetch: true, maxFileBytes: 3 * 1024 * 1024, mailto: config.mailto },
  config: { authEnabled: false, searchEnabled: config.searchEnabled },
});
