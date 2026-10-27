// 허용한 정적 파일만 제공한다. .env, 문서, 서버 코드, 저장 파일은 경로에 없어도 거절한다.
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = { '.html': 'text/html;charset=utf-8', '.css': 'text/css;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8' };

/** @param {string} pathname */
export function isPublicPath(pathname) {
  if (pathname.includes('\\') || pathname.includes('\0')) return false;
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded !== pathname || decoded.includes('..') || decoded.includes('\\')) return false;
  if (pathname === '/' || pathname === '/index.html' || pathname === '/styles.css' || pathname === '/parallel.html' || pathname === '/workspace.css') return true;
  if (pathname === '/src/vendor/pdf.min.mjs' || pathname === '/src/vendor/pdf.worker.min.mjs') return true;
  return /^\/src\/[A-Za-z0-9._/-]+\.js$/.test(pathname);
}

/** @param {string} root */
export function createStatic(root) {
  const base = resolve(root);
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    if (pathname.startsWith('/api/')) return next();
    // 이전 북마크는 기본 화면으로 연결한다. 별도 패러렐 페이지는 제공하지 않는다.
    if (pathname === '/parallel.html') {
      res.redirect(308, '/' + new URL(req.url ?? '/', 'http://local').search);
      return;
    }
    if (!isPublicPath(pathname)) {
      res.status(404).json({ error: { code: 'not_found', message: '없는 경로예요.', requestId: req.id } });
      return;
    }
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = normalize(join(base, rel));
    if (file !== base && !file.startsWith(base + sep)) {
      res.status(404).json({ error: { code: 'not_found', message: '없는 경로예요.', requestId: req.id } });
      return;
    }
    try {
      const body = await readFile(file);
      res.setHeader('content-type', TYPES[extname(file)] || 'text/plain;charset=utf-8');
      res.setHeader('x-content-type-options', 'nosniff');
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    } catch {
      res.status(404).json({ error: { code: 'not_found', message: '없는 경로예요.', requestId: req.id } });
    }
  };
}
