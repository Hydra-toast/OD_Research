import { describe, it, expect } from 'vitest';
import { pdfFolderName, safePdfFolder, savedPdfFolder, readablePdfFolderName, safeLocalPdfFolder } from '../src/research/pdf-folder.js';

describe('PDF 폴더 이름', () => {
  const day = new Date(2026, 9, 23);
  it('날짜와 주제 앞부분만 쓴다', () => {
    expect(pdfFolderName('가상 계측 불확실성 평가', day)).toBe('1023-가상계측불확실성평가');
    expect(pdfFolderName('EUV resist process control study', day)).toBe('1023-EUVresistpro');
    expect(pdfFolderName('  ', day)).toBe('1023-조사');
  });
  it('경로 문자는 거절한다', () => {
    expect(safePdfFolder('1023-가상계측')).toBe('1023-가상계측');
    expect(safePdfFolder('../비밀')).toBe('');
    expect(safePdfFolder('a/b')).toBe('');
    expect(safePdfFolder('a'.repeat(25))).toBe('');
  });
  it('이미 받은 PDF가 있으면 그 폴더를 유지한다', () => {
    expect(savedPdfFolder({ pdfFolder: '1023-가상계측' })).toBe('1023-가상계측');
    expect(savedPdfFolder({ fulltext: { a: { localFile: 'p-test1/paper.pdf' } } })).toBe('p-test1');
    expect(savedPdfFolder({ fulltext: { a: { localFile: 'paper.pdf' } } })).toBe('');
  });
  it('선택한 폴더 아래 날짜와 읽을 수 있는 주제를 사용한다', () => {
    expect(readablePdfFolderName('리그닌 / carbon fibers?', day)).toBe('2026-10-23 리그닌 carbon fibers');
    expect(readablePdfFolderName('', day)).toBe('2026-10-23 새 조사');
    expect(safeLocalPdfFolder('2026-10-23 리그닌 carbon fibers-2')).toBe('2026-10-23 리그닌 carbon fibers-2');
    expect(safeLocalPdfFolder('../비밀')).toBe('');
  });
});
