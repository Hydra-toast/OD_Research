// .env를 읽되 값은 로그에 남기지 않는다. 이미 있는 환경 변수는 덮어쓰지 않는다.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** @param {string} root */
export async function loadEnv(root) {
  let text = '';
  try { text = await readFile(resolve(root, '.env'), 'utf8'); } catch { return false; }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = value;
  }
  return true;
}

/** 공개 값과 서버 전용 비밀을 구분한다. 비밀은 반환 객체의 호출자만 갖고, 응답에 넣지 않는다. */
export function readConfig() {
  const url = process.env.SUPABASE_URL?.trim() || '';
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const authEnabled = !!(url && anonKey);
  return {
    authEnabled,
    port: Number(process.env.PORT || 5173),
    supabase: authEnabled ? { url, anonKey, serviceRoleKey } : null,
  };
}
