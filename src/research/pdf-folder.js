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
