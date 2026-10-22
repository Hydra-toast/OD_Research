import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const live = process.env.SCIHUB_LIVE_TEST === '1';
let server;
test.beforeAll(async () => {
  process.env.SEARCH_ENABLED = 'false';
  const { start } = await import('../server/index.js');
  server = await start(5187);
});
test.afterAll(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
// 실검증은 앞서 확인한 이 논문 한 편만 사용. 검색 응답은 고정하고 다운로드는 실제 서버를 통과한다.
const paper = {
  id: 'doi:10.1038/nature09492', providerId: '',
  doi: '10.1038/nature09492',
  title: 'Bottom-up effects of plant diversity on multitrophic interactions in a biodiversity experiment',
  authors: [], year: 2010, venue: 'Nature', citationCount: null,
  abstract: null, access: 'metadata', origin: 'provider', source: '검증용 고정 서지정보', collectedAt: '2026-10-22T00:00:00.000Z', fulltext: { status: 'not_fetched' },
};

test(live ? '실제 Sci-Hub 1편: 원문 확보·PDF 저장·재열기·프롬프트' : '가상 응답: 원문 보관·재열기·실패 시 원문 유지', async ({ page }) => {
  let calls = 0, downloaded;
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true, searchProvider: 'OpenAlex' } }));
  await page.route('**/api/search', r => r.fulfill({ json: { mode: 'real', papers: [paper], estimatedTotal: 1, collectedAt: paper.collectedAt, warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  if (!live) await page.route('**/api/fulltext/scihub', r => r.fulfill({ json: { status: 'extracted', source: 'Sci-Hub', pageCount: 1, pages: [{ page: 1, text: 'Fixture text 10.9999/fixture' }], pdfBase64: Buffer.from('%PDF-1.4\nfixture').toString('base64'), sha256: 'a'.repeat(64), doiVerified: true } }));
  page.on('request', req => { if (req.url().endsWith('/api/fulltext/scihub')) calls++; });
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill(live ? 'plant diversity' : 'fixture');
  await page.getByRole('button', { name: '조사 방향 정리하기', exact: true }).click();
  await page.getByRole('button', { name: '현재 내용으로 넓게 탐색하기', exact: true }).click();
  const panel = page.locator('#panel-explore');
  await expect(panel.locator('article.paper')).toHaveCount(1);
  const response = page.waitForResponse(r => r.url().endsWith('/api/fulltext/scihub'));
  await panel.getByRole('button', { name: 'Sci-Hub 원문 받기', exact: true }).click();
  downloaded = await (await response).json();
  expect(downloaded.status, JSON.stringify({ status: downloaded.status, attempts: downloaded.attempts })).toBe('extracted');
  await expect(panel.getByRole('button', { name: '보관 PDF 저장' })).toBeVisible();
  await expect(page.locator('#save-state')).toContainText('저장됨');
  const downloadEvent = page.waitForEvent('download');
  await panel.getByRole('button', { name: '보관 PDF 저장' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const browserDownloadFailure = await download.failure();
  if (browserDownloadFailure) test.info().annotations.push({ type: 'environment-limitation', description: `Browser file save: ${browserDownloadFailure}; independent plain-text download also canceled in this sandbox.` });
  const storedBase64 = await page.evaluate(async id => {
    const { S } = await import('/src/state/store.js');
    const { loadFulltextPdf } = await import('/src/repository/idb.js');
    const blob = await loadFulltextPdf(S.projectId, id);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value);
  }, paper.id);
  const bytes = Buffer.from(storedBase64, 'base64');
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  if (live) {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(downloaded.sha256);
    expect(downloaded.doiVerified).toBe(true);
  }
  await page.reload();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#saved-list').getByRole('button', { name: '열기' }).click();
  await expect(panel.getByRole('button', { name: '보관 PDF 저장' })).toBeVisible();
  const restoredPdf = await page.evaluate(async id => {
    const { S } = await import('/src/state/store.js');
    const { loadFulltextPdf } = await import('/src/repository/idb.js');
    const blob = await loadFulltextPdf(S.projectId, id);
    return blob?.size;
  }, paper.id);
  expect(restoredPdf).toBe(bytes.length);
  await panel.getByRole('button', { name: /^보이는 1편 모두 선택/ }).click();
  await panel.getByRole('button', { name: /연구군·읽기 순서 프롬프트/ }).click();
  const prompt = panel.locator('[data-ract=summary-prompt-edit]');
  await expect(prompt).toHaveValue(/원문 텍스트 포함 1편/);
  await expect(prompt).toHaveValue(/\[p\.1\]/);
  if (!live) {
    await page.route('**/api/fulltext/scihub', r => r.fulfill({ json: { status: 'challenge_required' } }));
    await panel.getByRole('button', { name: 'Sci-Hub 원문 받기', exact: true }).click();
    await expect(panel).toContainText('기존 자료 유지');
    await expect(panel.getByRole('button', { name: '보관 PDF 저장' })).toBeVisible();
    expect(await page.evaluate(async () => {
      const { S } = await import('/src/state/store.js');
      return S.fulltext[S.papers[0].id].status;
    })).toBe('extracted');
    const quota = await page.evaluate(async () => {
      const { saveFulltext, loadFulltextPdf, createIdbRepository } = await import('/src/repository/idb.js');
      const pdf = new Blob(['%PDF-fixture'], { type: 'application/pdf' });
      for (let i = 0; i < 5; i++) await saveFulltext('quota-fixture', `example:${i}`, [], pdf);
      let rejected = false;
      try { await saveFulltext('quota-fixture', 'example:6', [], pdf); } catch { rejected = true; }
      const previous = (await loadFulltextPdf('quota-fixture', 'example:0'))?.size;
      await createIdbRepository().delete('quota-fixture');
      return { rejected, previous, deleted: (await loadFulltextPdf('quota-fixture', 'example:0')) === null };
    });
    expect(quota).toEqual({ rejected: true, previous: 12, deleted: true });
  } else {
    expect(calls).toBe(1);
    await mkdir('docs/captures', { recursive: true });
    await panel.locator('article.paper').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'docs/captures/scihub-2026-10-22.png', fullPage: true });
    await writeFile('test-results/scihub-one-paper.pdf', bytes);
    const proof = { date: '2026-10-22', doi: paper.doi, realDownloadRequests: calls, search: 'fixed bibliographic input (not a live search test)', source: downloaded.source, bytes: bytes.length, pageCount: downloaded.pageCount, extractedCharacters: downloaded.pages.map(p => p.text).join('').length, sha256: downloaded.sha256, doiVerified: downloaded.doiVerified, persistedPdfBytes: restoredPdf, promptContainsExtractedText: true, browserDownloadFailure, transport: 'direct HTTP adapter; MCP not used' };
    await writeFile('docs/captures/scihub-2026-10-22.json', JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  }
});
