/** 조사 PDF 폴더 이름. 날짜 4자리와 주제 앞 12자. 예: 1023-가상계측
 * @param {any} topic
 * @param {Date} [date]
 */
export function pdfFolderName(topic, date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const slug = String(topic || '').replace(/[^\p{Script=Hangul}A-Za-z0-9]/gu, '').slice(0, 12);
  return `${mm}${dd}-${slug || '조사'}`;
}

/** 사용자가 알아볼 수 있는 조사 주제와 날짜로 폴더 이름을 만든다. @param {any} topic @param {Date} [date] */
export function readablePdfFolderName(topic, date = new Date()) {
  const yyyy = date.getFullYear(), mm = String(date.getMonth() + 1).padStart(2, '0'), dd = String(date.getDate()).padStart(2, '0');
  const name = String(topic || '').normalize('NFKC').replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 48).trim();
  return `${yyyy}-${mm}-${dd} ${name || '새 조사'}`;
}

/** @param {any} value */
export function safeLocalPdfFolder(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= 80 && /^[\p{L}\p{N} _-]+$/u.test(name) ? name : '';
}

/** 경로로 쓸 수 있는 짧은 폴더 이름만 통과시킨다. @param {any} value */
export function safePdfFolder(value) {
  const name = String(value || '').trim();
  if (!/^[\p{Script=Hangul}A-Za-z0-9-]{3,24}$/u.test(name)) return '';
  return name;
}

/** 이미 정해진 폴더. 저장값, 없으면 예전에 받은 PDF 경로. @param {any} S */
export function savedPdfFolder(S) {
  const saved = safePdfFolder(S?.pdfFolder);
  if (saved) return saved;
  const rows = S?.fulltext && typeof S.fulltext === 'object' ? Object.values(S.fulltext) : [];
  for (const st of rows) {
    const file = /** @type {any} */ (st)?.localFile;
    if (typeof file !== 'string' || !file.includes('/')) continue;
    const dir = safePdfFolder(file.split('/')[0]);
    if (dir) return dir;
  }
  return '';
}
