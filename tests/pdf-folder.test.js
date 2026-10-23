import { describe, it, expect } from 'vitest';
import { pdfFolderName, safePdfFolder, savedPdfFolder } from '../src/research/pdf-folder.js';

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
});
