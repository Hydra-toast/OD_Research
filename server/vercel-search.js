// Vercel의 검색·공개 PDF 진입점. 로컬 PDF 수신함과 파일 저장 서비스는 열지 않는다.
import { createApp } from './app.js';
import { readConfig } from './env.js';
import { createDisabledAuth } from './auth.js';
import { createLiveSearch } from '../src/providers/live.js';
import { createGeminiShortlist } from './gemini-shortlist.js';
import { createGeminiQueries } from './gemini-queries.js';

const config = readConfig();
const search = config.searchEnabled ? createLiveSearch({ apiKey: config.openalexKey, mailto: config.mailto }) : null;
const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
// 공개 사용은 배포 환경에서 명시적으로 활성화한 경우에만 허용한다.
const geminiReady = !!geminiKey && process.env.GEMINI_PUBLIC_ENABLED?.trim().toLowerCase() === 'true';

export const app = createApp({
  root: process.cwd(),
  auth: createDisabledAuth(),
  projects: { forToken: () => null },
  search,
  geminiShortlist: geminiReady ? createGeminiShortlist({ apiKey: geminiKey }) : null,
  geminiQueries: geminiReady ? createGeminiQueries({ apiKey: geminiKey }) : null,
  geminiPublicEnabled: geminiReady,
  openalexContent: { apiKey: config.openalexKey },
  schedule: false,
  fulltext: { publicFetch: true, maxFileBytes: 3 * 1024 * 1024, mailto: config.mailto },
  config: { authEnabled: false, searchEnabled: config.searchEnabled },
});
