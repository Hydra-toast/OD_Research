// PDF 제한과 가져오기 URL 차단. 파일 이름은 저장 경로로 쓰지 않는다.
import { isIP } from 'node:net';

export const LIMITS = { fileBytes: 20 * 1024 * 1024, pages: 100, files: 5, totalBytes: 100 * 1024 * 1024, retainMs: 30 * 24 * 60 * 60 * 1000, redirects: 3 };

/** @param {Buffer} buf */
export function inspectPdf(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 5 || !buf.subarray(0, 5).toString().startsWith('%PDF')) return { ok: false, code: 'not_pdf' };
  if (buf.length > LIMITS.fileBytes) return { ok: false, code: 'too_large' };
  const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1');
  if (head.includes('/Encrypt')) return { ok: false, code: 'encrypted' };
  return { ok: true };
}

/** @param {string} raw */
export function blockedUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return 'bad_url'; }
  if (url.protocol !== 'https:') return 'not_https';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return 'blocked_host';
  if (isIP(host)) {
    if (host === '169.254.169.254' || host.startsWith('10.') || host.startsWith('127.') || host.startsWith('192.168.') || host.startsWith('169.254.') || host.startsWith('0.')) return 'blocked_host';
    const second = Number(host.split('.')[1]);
    if (host.startsWith('172.') && second >= 16 && second <= 31) return 'blocked_host';
  }
  return null;
}
