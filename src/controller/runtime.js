// 서버가 켜져 있으면 키 없는 OpenAlex 공개 검색도 사용한다.
export const runtime = { search: false, auth: false };

export async function loadRuntime() {
  try {
    const config = await (await fetch('/api/config')).json();
    runtime.search = !!config.search;
    runtime.auth = !!config.auth;
    return config;
  } catch {
    return null;
  }
}
