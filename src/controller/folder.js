import { folderState as F } from './folder-state.js';
import { S, paperById } from '../state/store.js';
import { looseDoi } from '../research/inbox-match.js';
import { render } from './render.js';
import { applyStoredPdf } from './research.js';

/** @type {Promise<any>} */
let writeQueue = Promise.resolve();

/** @param {Blob} pdf @param {any} paper */
export function savePdfToFolder(pdf, paper) {
  const projectId = S.projectId;
  const task = writeQueue.then(() => writePdf(pdf, paper, projectId));
  writeQueue = task.catch(() => {});
  return task;
}

/** @param {Blob} pdf @param {any} paper @param {string} projectId */
async function writePdf(pdf, paper, projectId) {
  if (!F.directory || F.projectId !== projectId || S.projectId !== projectId) return false;
  const base = `paper-${String(paper.doi || paper.id || 'paper').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150)}`;
  for (let i = 0; i < 100; i++) {
    const name = `${base}${i ? '-' + (i + 1) : ''}.pdf`;
    try { await F.directory.getFileHandle(name); }
    catch (e) {
      if (/** @type {any} */ (e)?.name !== 'NotFoundError') throw e;
      const file = await F.directory.getFileHandle(name, { create: true });
      const writer = await file.createWritable();
      try { await writer.write(pdf); await writer.close(); }
      catch (err) { await writer.abort().catch(() => {}); throw err; }
      return true;
    }
  }
  throw new Error('같은 이름의 파일이 너무 많아요.');
}

async function choose() {
  if (!S.projectId) { F.message = '먼저 조사를 열어 주세요.'; render(); return; }
  if (!('showDirectoryPicker' in window)) { F.message = '이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 이용하세요.'; render(); return; }
  try {
    const projectId = S.projectId;
    const root = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });
    if (S.projectId !== projectId) return;
    const parent = await root.getDirectoryHandle('Research Landscape', { create: true });
    // 날짜·주제 수정과 무관하게 같은 조사는 같은 폴더를 다시 찾는다.
    const name = `조사-${projectId}`;
    const dir = await parent.getDirectoryHandle(name, { create: true });
    F.root = root; F.directory = dir; F.projectId = projectId; F.name = `Research Landscape/${name}`; F.items = [];
    F.message = `선택한 폴더 아래 ${F.name}에 저장합니다.`;
  } catch (e) { F.message = /** @type {any} */ (e)?.name === 'AbortError' ? '폴더 선택을 취소했습니다.' : '폴더 접근에 실패했습니다. 권한을 확인하세요.'; }
  render();
}

async function scan() {
  if (!F.directory || F.projectId !== S.projectId) { F.message = '현재 조사에서 먼저 저장 폴더를 선택해 주세요.'; render(); return; }
  if (F.busy) return;
  F.busy = true; F.items = []; F.message = '폴더의 PDF를 확인하고 있습니다.'; render();
  const projectId = S.projectId;
  try {
    const pdfModuleUrl = new URL('../vendor/pdf.min.mjs', import.meta.url).href;
    const pdfjs = await import(pdfModuleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
    for await (const entry of F.directory.values()) {
      if (S.projectId !== projectId) break;
      if (entry.kind !== 'file' || !/\.pdf$/i.test(entry.name)) continue;
      const item = /** @type {any} */ ({ name: entry.name, pages: [], paperId: '', status: '확인 필요' });
      F.items.push(item);
      try {
        const file = await entry.getFile();
        if (file.size > 20 * 1024 * 1024) { item.status = '20MB 초과 · 직접 확인'; continue; }
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        const doc = await task.promise;
        item.pageCount = doc.numPages;
        for (let n = 1; n <= Math.min(doc.numPages, 100); n++) {
          const page = await doc.getPage(n), content = await page.getTextContent();
          item.pages.push({ page: n, text: content.items.map((/** @type {any} */ x) => x.str || '').join(' ').replace(/\s+/g, ' ').trim() });
          page.cleanup();
        }
        await task.destroy();
        const first = item.pages.slice(0, 2).map((/** @type {any} */ p) => p.text).join(' ').toLowerCase();
        if (S.projectId !== projectId) break;
        const found = new Set((first.match(/10\.\d{4,9}\/[^\s<>"\]]+/gi) || []).map(looseDoi));
        const matches = S.papers.filter((/** @type {any} */ p) => p.doi && found.has(looseDoi(p.doi)));
        if (matches.length === 1) {
          item.paperId = matches[0].id;
          item.status = 'DOI 일치 · 연결됨';
          await applyStoredPdf(matches[0], { status: item.pages.some((/** @type {any} */ p) => p.text) ? 'extracted' : 'scan_only', pages: item.pages, pageCount: item.pageCount, truncatedPages: item.pageCount > 100, source: '선택한 폴더 PDF', extractor: 'pdfjs-dist' });
        } else item.status = matches.length > 1 ? 'DOI가 여러 논문과 일치 · 직접 선택' : 'DOI 미확인 · 직접 선택';
      } catch { item.status = 'PDF를 읽지 못함 · 직접 확인'; }
    }
    F.message = `${F.items.length}개 PDF 확인. DOI가 하나의 논문과 일치하는 파일만 자동 연결했습니다.`;
  } catch { F.message = '폴더를 읽지 못했습니다. 권한을 확인하고 다시 선택하세요.'; }
  finally { F.busy = false; render(); }
}

export function initFolder() {
  document.addEventListener('click', async e => {
    const target = /** @type {any} */ (e.target)?.closest?.('[data-ract]');
    if (!target) return;
    if (target.dataset.ract === 'folder-select') await choose();
    if (target.dataset.ract === 'folder-scan') await scan();
    if (target.dataset.ract === 'folder-link') {
      const item = F.items[Number(target.dataset.index)];
      const select = /** @type {HTMLSelectElement|null} */ (document.querySelector(`[data-folder-pick="${target.dataset.index}"]`));
      const paper = paperById(select?.value || '');
      if (!item || !paper || F.projectId !== S.projectId || !item.pages.length) { F.message = '읽을 수 있는 PDF와 연결할 논문을 선택해 주세요.'; render(); return; }
      await applyStoredPdf(paper, { status: item.pages.some((/** @type {any} */ p) => p.text) ? 'extracted' : 'scan_only', pages: item.pages, pageCount: item.pageCount, truncatedPages: item.pageCount > 100, source: '선택한 폴더 PDF', extractor: 'pdfjs-dist' });
      item.paperId = paper.id; item.status = '직접 연결됨'; F.message = '선택한 논문에 연결했습니다.'; render();
    }
  });
}
