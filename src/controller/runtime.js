// 서버가 켜져 있으면 키 없는 OpenAlex 공개 검색도 사용한다.
export const runtime = { search: false, auth: false };

/** 수신함은 이 PC의 로컬 서버에서만 동작한다. */
export function isLocalApp() {
  const host = globalThis.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** @type {Promise<any>|null} */
let pendingConfig = null;
export function loadRuntime() {
  return pendingConfig ??= readRuntime();
}

async function readRuntime() {
  try {
    const config = await (await fetch('/api/config')).json();
    runtime.search = !!config.search;
    runtime.auth = !!config.auth;
    return config;
  } catch {
    return null;
  }
}
