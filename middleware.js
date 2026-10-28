import { next } from '@vercel/functions';

// Vercel에서 모든 페이지와 API 요청을 보호한다. 로컬 Express에는 적용되지 않는다.
export default async function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return new Response('사이트 비밀번호가 설정되지 않았습니다.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const authorization = request.headers.get('authorization') || '';
  let submitted = '';
  try {
    if (authorization.startsWith('Basic ')) {
      const decoded = atob(authorization.slice(6));
      const colon = decoded.indexOf(':');
      if (colon >= 0) submitted = decoded.slice(colon + 1);
    }
  } catch {
    // 잘못된 인증 헤더는 인증 실패로 처리한다.
  }
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const expected = await digest(password);
  const received = await digest(submitted);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ received[i];
  if (difference === 0 && submitted) return next();
  return new Response('비밀번호를 확인해 주세요.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ondot", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}
