// 인증 어댑터. 클라이언트 토큰을 매 요청 검증하고, service-role 키는 사용자 토큰으로 받지 않는다.
import { HttpError } from './errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {string} email @param {string} password */
export function validateCredentials(email, password) {
  if (typeof email !== 'string' || !EMAIL.test(email) || email.length > 200) throw new HttpError(400, 'bad_input', '이메일을 확인해 주세요.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new HttpError(400, 'bad_input', '비밀번호는 8자 이상이어야 해요.');
  return { email: email.trim().toLowerCase(), password };
}

/** 설정이 없을 때의 인증. 모든 계정 요청을 거절한다. 예시 모드를 대신 열어 주지 않는다. */
export function createDisabledAuth() {
  const deny = async () => { throw new HttpError(503, 'auth_not_configured', '계정 연결이 설정되지 않았어요. 예시 모드만 사용할 수 있어요.'); };
  return { signup: deny, login: deny, logout: async () => { throw new HttpError(503, 'auth_not_configured', '계정 연결이 설정되지 않았어요. 예시 모드만 사용할 수 있어요.'); }, requestReset: deny, verify: async () => ({ ok: false, code: 'auth_not_configured' }) };
}

/**
 * 테스트용 고정 계정. 실제 사용자 저장소가 아니다.
 * @param {{users:{id:string,email:string,password:string,confirmed:boolean}[]}} seed
 */
export function createFixtureAuth(seed) {
  /** @type {Map<string, {id:string,email:string,password:string,confirmed:boolean}>} */
  const users = new Map(seed.users.map(u => [u.email.toLowerCase(), { ...u, email: u.email.toLowerCase() }]));
  /** @type {Map<string, {userId:string,email:string,exp:number}>} */
  const tokens = new Map();
  const issue = (/** @type {{id:string,email:string}} */ user) => {
    const token = `fx.${user.id}.${Math.random().toString(36).slice(2)}`;
    tokens.set(token, { userId: user.id, email: user.email, exp: Date.now() + 60 * 60 * 1000 });
    return token;
  };
  return {
    async signup(/** @type {{email:string,password:string}} */ input) {
      const { email, password } = validateCredentials(input.email, input.password);
      if (users.has(email)) throw new HttpError(409, 'email_taken', '이미 가입 요청이 있는 이메일이에요.');
      const user = { id: 'user-' + Math.random().toString(36).slice(2, 10), email, password, confirmed: false };
      users.set(email, user);
      return { status: 'confirmation_sent', email };
    },
    async login(/** @type {{email:string,password:string}} */ input) {
      const { email, password } = validateCredentials(input.email, input.password);
      const user = users.get(email);
      if (!user || user.password !== password) throw new HttpError(401, 'invalid_credentials', '이메일 또는 비밀번호가 올바르지 않아요.');
      if (!user.confirmed) throw new HttpError(403, 'email_unconfirmed', '이메일 확인이 끝나지 않았어요. 확인 메일의 링크를 연 뒤 다시 로그인해 주세요.');
      const token = issue(user);
      return { status: 'ok', token, user: { id: user.id, email: user.email } };
    },
    async logout(/** @type {string} */ token) {
      if (!tokens.has(token)) throw new HttpError(401, 'unauthorized', '로그인이 필요해요.');
      tokens.delete(token);
      return { status: 'ok' };
    },
    async requestReset(/** @type {string} */ email) {
      if (typeof email !== 'string' || !EMAIL.test(email)) throw new HttpError(400, 'bad_input', '이메일을 확인해 주세요.');
      return { status: 'reset_requested' };
    },
    async verify(/** @type {string} */ token) {
      const row = tokens.get(token);
      if (!row) return { ok: false, code: 'unauthorized' };
      if (row.exp <= Date.now()) return { ok: false, code: 'token_expired' };
      return { ok: true, user: { id: row.userId, email: row.email } };
    },
    /** 테스트에서 만료를 만든다. */
    expire(/** @type {string} */ token) { const row = tokens.get(token); if (row) row.exp = Date.now() - 1000; },
  };
}

/**
 * 실제 Supabase Auth. 환경이 있을 때만 서버가 선택한다. 테스트는 fetch를 주입한다.
 * service-role 키는 사용자 요청에 쓰지 않는다.
 * @param {{url:string, anonKey:string, serviceRoleKey?:string}} env
 * @param {any} [fetchImpl]
 */
export function createSupabaseAuth(env, fetchImpl = fetch) {
  const base = env.url.replace(/\/$/, '');
  const headers = (/** @type {string} */ token) => ({ authorization: `Bearer ${token}`, apikey: env.anonKey, 'content-type': 'application/json' });
  const privileged = (/** @type {string} */ token) => !!env.serviceRoleKey && token === env.serviceRoleKey;
  return {
    async signup(/** @type {{email:string,password:string}} */ input) {
      const { email, password } = validateCredentials(input.email, input.password);
      const res = await fetchImpl(`${base}/auth/v1/signup`, { method: 'POST', headers: headers(env.anonKey), body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status === 400 ? 400 : 502, 'signup_failed', '가입 요청을 끝내지 못했어요.');
      if (body.confirmation_sent_at || !body.access_token) return { status: 'confirmation_sent', email };
      return { status: 'ok', token: body.access_token, user: { id: body.user?.id, email } };
    },
    async login(/** @type {{email:string,password:string}} */ input) {
      const { email, password } = validateCredentials(input.email, input.password);
      const res = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: headers(env.anonKey), body: JSON.stringify({ email, password }) });
      const body = await res.json().catch(() => ({}));
      const msg = String(body.msg || body.error_description || body.message || '');
      if (/not confirmed|email_not_confirmed/i.test(msg)) throw new HttpError(403, 'email_unconfirmed', '이메일 확인이 끝나지 않았어요. 확인 메일의 링크를 연 뒤 다시 로그인해 주세요.');
      if (!res.ok || !body.access_token) throw new HttpError(401, 'invalid_credentials', '이메일 또는 비밀번호가 올바르지 않아요.');
      return { status: 'ok', token: body.access_token, user: { id: body.user?.id, email: body.user?.email } };
    },
    async logout(/** @type {string} */ token) {
      if (privileged(token)) throw new HttpError(401, 'unauthorized', '로그인이 필요해요.');
      const res = await fetchImpl(`${base}/auth/v1/logout`, { method: 'POST', headers: headers(token) });
      if (!res.ok && res.status !== 204) throw new HttpError(401, 'unauthorized', '로그인이 필요해요.');
      return { status: 'ok' };
    },
    async requestReset(/** @type {string} */ email) {
      if (typeof email !== 'string' || !EMAIL.test(email)) throw new HttpError(400, 'bad_input', '이메일을 확인해 주세요.');
      await fetchImpl(`${base}/auth/v1/recover`, { method: 'POST', headers: headers(env.anonKey), body: JSON.stringify({ email }) });
      return { status: 'reset_requested' };
    },
    async verify(/** @type {string} */ token) {
      if (!token || privileged(token)) return { ok: false, code: 'unauthorized' };
      const res = await fetchImpl(`${base}/auth/v1/user`, { headers: headers(token) });
      if (res.status === 401 || res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const msg = String(body.msg || body.message || '');
        return { ok: false, code: /expired/i.test(msg) ? 'token_expired' : 'unauthorized' };
      }
      if (!res.ok) return { ok: false, code: 'unauthorized' };
      const user = await res.json();
      if (!user?.id) return { ok: false, code: 'unauthorized' };
      return { ok: true, user: { id: user.id, email: user.email } };
    },
  };
}
