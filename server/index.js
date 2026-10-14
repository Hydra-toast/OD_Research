// 개발 서버 진입점. 계정 설정이 없으면 예시 모드만 열고, 인증 API는 거절한다.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.js';
import { loadEnv, readConfig } from './env.js';
import { createDisabledAuth, createSupabaseAuth } from './auth.js';
import { createSupabaseProjects } from './projects.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {number} [port] */
export async function start(port) {
  await loadEnv(root);
  const config = readConfig();
  const auth = config.supabase ? createSupabaseAuth(config.supabase) : createDisabledAuth();
  const projects = config.supabase ? createSupabaseProjects(config.supabase) : { forToken() { return null; } };
  const app = createApp({ auth, projects, config: { authEnabled: config.authEnabled }, root });
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
