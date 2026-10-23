/** 테스트용 한 페이지 PDF. 실제 논문이 아니다. @param {string} text */
export function buildSimplePdf(text) {
  const escaped = String(text).replace(/[()\\]/g, (ch) => '\\' + ch);
  const stream = `BT /F1 24 Tf 72 720 Td (${escaped}) Tj ET`;
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n',
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n',
  ];
  let body = '%PDF-1.4\n';
  /** @type {number[]} */
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body));
    body += obj;
  }
  const xref = Buffer.byteLength(body);
  body += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
