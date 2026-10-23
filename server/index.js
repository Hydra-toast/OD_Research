// 개발 서버 진입점. 공개 검색은 계정·키 없이 가능하며 계정 저장은 인증 설정이 필요하다.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createApp } from './app.js';
import { loadEnv, readConfig } from './env.js';
import { createDisabledAuth, createSupabaseAuth } from './auth.js';
import { createSupabaseProjects } from './projects.js';
import { createLiveSearch } from '../src/providers/live.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {number} [port] */
export async function start(port) {
  await loadEnv(root);
  const config = readConfig();
  const auth = config.supabase ? createSupabaseAuth(config.supabase) : createDisabledAuth();
  const projects = config.supabase ? createSupabaseProjects(config.supabase) : { forToken() { return null; } };
  const search = config.searchEnabled ? createLiveSearch({ apiKey: config.openalexKey, mailto: config.mailto }) : null;
  const app = createApp({
    auth, projects, search, root,
    fulltext: { mailto: config.mailto, pdfDir: process.env.INBOX_DIR || join(root, 'data', 'inbox-pdfs') },
    inbox: {
      bridgeToken: process.env.INBOX_BRIDGE_TOKEN || '',
      inboxDir: process.env.INBOX_DIR || join(root, 'data', 'inbox-pdfs'),
      pdfDir: join(root, 'data', 'pdfs'),
      stateFile: process.env.INBOX_STATE || join(root, 'data', 'inbox-state.json'),
    },
    config: { authEnabled: config.authEnabled, searchEnabled: config.searchEnabled },
  });
  const listenPort = port ?? config.port;
  const server = await new Promise(resolve => {
    const s = app.listen(listenPort, '127.0.0.1', () => resolve(s));
  });
  const addr = /** @type {any} */ (server).address();
  if (!port) console.log(`http://127.0.0.1:${addr?.port ?? listenPort}`);
  return server;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) start();
