import { describe, it, expect } from 'vitest';
import { matchFolderPdf } from '../src/research/folder-match.js';

const papers = [
  { id: 'example:1', title: 'A hypothetical study of polymer fibers', doi: '10.9999/example-one' },
  { id: 'example:2', title: 'A hypothetical study of carbon fibers', doi: '10.9999/example-two' },
];

describe('선택한 폴더의 PDF 연결', () => {
  it('DOI 일치를 우선 연결한다', () => {
    expect(matchFolderPdf({ firstPage: 'Paper doi: 10.9999/example-one.' }, papers)).toMatchObject({ paper: papers[0], basis: 'doi' });
  });
  it('DOI가 없으면 첫 페이지나 메타데이터의 완전한 제목으로 연결한다', () => {
    expect(matchFolderPdf({ firstPage: 'A Hypothetical Study of Polymer Fibers Authors abstract' }, papers)).toMatchObject({ paper: papers[0], basis: 'title' });
    expect(matchFolderPdf({ firstPage: '', metadataTitle: 'A hypothetical study of polymer fibers' }, papers)).toMatchObject({ paper: papers[0], basis: 'title' });
  });
  it('상충 DOI, 서로 다른 DOI·제목과 중복 제목은 자동 연결하지 않는다', () => {
    expect(matchFolderPdf({ firstPage: 'A hypothetical study of polymer fibers DOI 10.9999/other' }, papers).paper).toBeNull();
    expect(matchFolderPdf({ firstPage: 'A hypothetical study of carbon fibers DOI 10.9999/example-one' }, papers).paper).toBeNull();
    expect(matchFolderPdf({ firstPage: 'A hypothetical study of polymer fibers' }, [...papers, { ...papers[0], id: 'example:3' }]).paper).toBeNull();
  });
  it('참고문헌에 나온 제목이나 DOI와 짧은 제목만으로는 연결하지 않는다', () => {
    expect(matchFolderPdf({ firstPage: 'Other article References A hypothetical study of polymer fibers DOI 10.9999/example-one' }, papers).paper).toBeNull();
    expect(matchFolderPdf({ firstPage: 'Polymer' }, [{ id: 'example:4', title: 'Polymer' }]).paper).toBeNull();
  });
});
