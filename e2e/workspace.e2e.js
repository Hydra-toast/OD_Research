import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { knowledgeDocument, parseKnowledge, knowledgeKey } from '../src/research/knowledge.js';

test('지식 지도는 상세 결과에서 누적되고 다른 조사·새로고침·새 AI 프롬프트로 이어진다', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.selPapers = [S.papers[0].id]; S.pTask = 'cluster'; render();
  });
  await page.locator('[data-fk="summary-detail-make"]').click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.summaryPrompt)).toContain('후속 대화 활용 지침');
  await page.locator('[data-fk="summary-import-md"]').fill('### 가상 예시 · 실제 논문 아님\n\n누적할 상세 설명 [P1]');
  await page.locator('[data-import-purpose="detail"]').click();
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-ract="knowledge-download"]').click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe('research-knowledge.md');
  const originalEntries = parseKnowledge(readFileSync(await downloaded.path(), 'utf8'));
  expect(originalEntries[0].papers[0].title).toContain('가상 예시');
  const originalKey = knowledgeKey(originalEntries[0]);
  const projectId = await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { flushSave } = await import('/src/controller/persist.js');
    await flushSave(); return S.projectId;
  });
  // 같은 파일을 다른 조사로 옮긴다. 원 조사와 새 조사의 P1이 달라도 출처는 보존.
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.selPapers = [S.papers[1].id]; render();
  });
  const file = { name: 'research-knowledge.md', mimeType: 'text/markdown', buffer: Buffer.from(knowledgeDocument(originalEntries)) };
  await page.locator('[data-ract="knowledge-import"]').setInputFiles(file);
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
  await page.locator('[data-ract="knowledge-import"]').setInputFiles(file);
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
  const nextProjectId = await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { flushSave } = await import('/src/controller/persist.js');
    await flushSave(); return S.projectId;
  });
  expect(nextProjectId).not.toBe(projectId);
  await page.goto('/?project=' + nextProjectId);
  await page.locator('#nav-saved').click();
  await page.locator(`[data-act="open-saved"][data-id="${nextProjectId}"]`).click();
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
  const autoDownload = page.waitForEvent('download');
  await page.locator('[data-fk="summary-detail-make"]').click();
  const bundle = await autoDownload;
  const entries = parseKnowledge(readFileSync(await bundle.path(), 'utf8'));
  expect(knowledgeKey(entries[0])).toBe(originalKey);
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.summaryPrompt)).toContain('지식 지도(1건)');
  expect(await page.evaluate(async () => (await import('/src/state/store.js')).S.summaryPrompt)).not.toContain('누적할 상세 설명');
  await page.locator('[data-ract="knowledge-import"]').setInputFiles({ name: 'bad.md', mimeType: 'text/markdown', buffer: Buffer.from('# broken') });
  await expect(page.locator('.pw-summary-status')).toContainText('이 사이트에서 저장한');
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
  await page.locator('[data-ract="knowledge-clear"]').click();
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 0건');
  await page.goto('/?project=' + projectId);
  await page.locator('#nav-saved').click();
  await page.locator(`[data-act="open-saved"][data-id="${projectId}"]`).click();
  await expect(page.locator('[data-knowledge-status]')).toContainText('누적 정리 1건');
});

function fixturePdf(text) {
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

test('선택한 PC 폴더에 PDF를 저장하고 PDF 본문의 DOI로 연결한다', async ({ page }) => {
  const pdf = fixturePdf('Example article DOI 10.1234/fixture.123 for testing.');
  await page.addInitScript(() => {
    class Dir {
      constructor(name) { this.name = name; this.kind = 'directory'; this.entries = new Map(); }
      async getDirectoryHandle(name, options) { if (!this.entries.has(name) && options?.create) this.entries.set(name, new Dir(name)); return this.entries.get(name); }
      async getFileHandle(name, options) {
        if (!this.entries.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError');
        if (!this.entries.has(name)) { const entry = { name, kind: 'file', blob: new Blob([]), async getFile() { return new File([this.blob], name, { type: 'application/pdf' }); }, async createWritable() { return { write: async b => { entry.blob = b; }, close: async () => {}, abort: async () => {} }; } }; this.entries.set(name, entry); }
        return this.entries.get(name);
      }
      async *values() { yield* this.entries.values(); }
    }
    window.showDirectoryPicker = async () => new Dir('Downloads');
  });
  await page.route('**/api/fulltext/fetch', r => r.fulfill({ json: { status: 'extracted', source: 'fixture', pageCount: 1, pages: [{ page: 1, text: 'Example article DOI 10.1234/fixture.123 for testing.' }], pdfBase64: pdf.toString('base64') } }));
  await searchFixture(page);
  await page.evaluate(async () => { const { S } = await import('/src/state/store.js'); S.papers[0].origin = 'provider'; S.papers[0].doi = '10.1234/fixture.123'; });
  await page.locator('#nav-settings').click();
  await page.locator('[data-ract="folder-select"]').click();
  await expect(page.locator('#folder-status')).toContainText('Research Landscape/');
  await page.locator('#nav-workspace-main').click();
  await startSingleBulk(page);
  await expect.poll(() => page.evaluate(async () => { const { folderState: f } = await import('/src/controller/folder-state.js'); let n = 0; for await (const _ of f.directory.values()) n++; return n; })).toBe(1);
  await page.evaluate(async () => { const { folderState: f } = await import('/src/controller/folder-state.js'); const [key, entry] = f.directory.entries.entries().next().value; f.directory.entries.delete(key); entry.name = '이름이 다른 파일.pdf'; f.directory.entries.set(entry.name, entry); });
  await page.locator('#nav-settings').click();
  await page.locator('[data-ract="folder-scan"]').click();
  await expect(page.locator('#folder-status')).toContainText('1개 PDF 확인', { timeout: 20000 });
  await expect(page.getByText('DOI 일치 · 연결됨')).toBeVisible();
});

// 실제 논문·DOI가 없는 가상 자료. 실검색 저장 스키마의 사용자 자료 ID로 검사한다.
const papers = Array.from({ length: 30 }, (_, i) => ({
  id: `user:example-workspace-${i}`, providerId: null, doi: null,
  title: `가상 예시 · 실제 논문 아님 — polymer ${i + 1} ${i % 2 ? 'coating' : 'film'}`,
  authors: [], year: 2020 + i % 5, venue: null, citationCount: null,
  abstract: '가상 예시 · 실제 논문 아님. Polymer materials test fixture.',
  origin: 'user', access: 'abstract', source: 'test fixture', collectedAt: '2026-10-27T00:00:00Z', link: null,
}));
async function searchFixture(page) {
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true } }));
  await page.route('**/api/search', r => r.fulfill({ json: { mode: 'real', papers, warnings: [], estimatedTotal: 30, collectedAt: '2026-10-27T00:00:00Z', inputRevision: r.request().postDataJSON().inputRevision } }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill('polymer materials');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await expect(page.locator('.pw-paper-row')).toHaveCount(30);
}

async function startSingleBulk(page) {
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.selPapers = [S.papers[0].id]; S.pTask = 'cluster'; render();
  });
  await page.locator('[data-ract="ft-bulk"]').first().click();
}

test('초록 기반 정리와 결과 확인을 원문 받기보다 먼저 안내한다', async ({ page }) => {
  await searchFixture(page);
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 375) await page.locator('#pmob-work').click();
    const order = await page.locator('.pw-quick-bar [data-pact]').evaluateAll(els => els.map(e => e.dataset.pact));
    expect(order).toEqual(['quick-prompt', 'quick-import', 'quick-fulltext']);
    expect(await page.locator('#sm-h').evaluate(el => el.compareDocumentPosition(document.querySelector('#sm-latest-h')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await page.locator('#sm-latest-h').evaluate(el => el.compareDocumentPosition(document.querySelector('#bulk-h')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  // 기본 PDF 첨부와 1단계 초록 전달은 서로 독립적이다.
  await expect(page.locator('[data-fk="summary-detail-make"]')).toBeVisible();
  await expect(page.locator('[data-fk="summary-detail-text"]')).toBeHidden();
  await page.locator('[data-fk="summary-make"]').click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.summaryPrompt)).toContain('Polymer materials test fixture.');
  await expect(page.locator('#ppanel-work')).toContainText('초록만');
  const prompt = () => page.evaluate(async () => (await import('/src/state/store.js')).S.summaryPrompt);
  expect(await prompt()).toContain('1단계 · AI 초록 선별');
  expect(await prompt()).toContain('추천 논문 3~5편');
  expect(await prompt()).not.toContain('### 2. 연구군 지도');
  expect(await prompt()).not.toContain('파일은 여러 메시지로 추가될 수 있습니다');
  // 원문 보관 상태와 관계없이 두 1단계 버튼은 초록만 전달한다.
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    S.fulltext[S.papers[0].id] = { status: 'extracted' };
    S.papers[1].abstract = '';
  });
  await page.locator('[data-pact="quick-prompt"]').click();
  expect(await prompt()).toContain('원문 텍스트 포함 0편');
  expect(await prompt()).toContain('메타데이터만 1편');
  await page.locator('[data-fk="summary-detail-make"]').click();
  expect(await prompt()).toContain('파일은 여러 메시지로 추가될 수 있습니다');
  await page.getByText('PDF를 첨부할 수 없을 때', { exact: true }).click();
  await page.locator('[data-fk="summary-detail-text"]').click();
  await expect.poll(prompt).toContain('Polymer materials test fixture.');
  expect(await prompt()).not.toContain('파일은 여러 메시지로 추가될 수 있습니다');
  await page.evaluate(async () => { (await import('/src/state/store.js')).S.summaryMode = 'text'; });
  await page.locator('[data-fk="summary-detail-make"]').click();
  expect(await prompt()).toContain('파일은 여러 메시지로 추가될 수 있습니다');
  await page.locator('[data-fk="summary-make"]').click();
  expect(await prompt()).toContain('1단계 · AI 초록 선별');
  await page.locator('[data-pact="quick-import"]').click();
  await expect(page.locator('#sm-import-details')).toHaveAttribute('open', '');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.body.style.zoom = '200%'; });
  for (const target of ['[data-ract="summary-make"]', '#sm-import-h', '[data-ract="ft-bulk"]']) {
    const el = page.locator(target).first();
    await el.scrollIntoViewIfNeeded();
    const rect = await el.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1441);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('개별 원문 작업은 해당 사이트를 새 탭으로 직접 연다', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    S.papers[0].origin = 'provider'; S.papers[0].doi = '10.1234/fixture.123';
    S.papers[0].fulltext = { pdfUrl: 'https://example.org/article.pdf' };
  });
  await page.locator('.pw-paper-row').first().locator('[data-pact="open-detail"]').click();
  const pub = page.getByRole('link', { name: '공개 원문 사이트 열기' });
  const sci = page.getByRole('link', { name: 'Sci-Hub 사이트 열기' });
  await expect(pub).toHaveAttribute('href', 'https://example.org/article.pdf');
  await expect(sci).toHaveAttribute('href', 'https://sci-hub.kr/10.1234/fixture.123');
  await expect(pub).toHaveAttribute('target', '_blank');
  await expect(sci).toHaveAttribute('target', '_blank');
  await expect(page.locator('[data-ract="ft-fetch"], [data-ract="ft-scihub"]')).toHaveCount(0);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.papers[0].fulltext.contentPdfUrl = 'https://content.openalex.org/works/W123.pdf'; render();
  });
  await expect(page.getByRole('link', { name: 'OpenAlex 원문 열기' })).toHaveAttribute('href', '/api/openalex-pdf?work=W123');
});

test('기본 화면 통합, 이전 주소 연결, 예시 모음과 저장 표시', async ({ page, request }) => {
  const old = await request.get('/parallel.html?project=p-old1', { maxRedirects: 0 });
  expect(old.status()).toBe(308);
  expect(old.headers().location).toBe('/?project=p-old1');
  expect((await request.get('/parallel.css')).status()).toBe(404);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'workspace');
  await expect(page.locator('a[href="/parallel.html"]')).toHaveCount(0);
  await expect(page.locator('#hero-section')).not.toContainText('예시로 살펴보기');
  await page.locator('#nav-how').click();
  await expect(page.locator('.example-library')).toContainText('가상 예시 · 실제 논문 아님');
  await page.getByRole('button', { name: 'EUV 예시 열기' }).click();
  await expect(page.locator('.pw-paper-row')).toHaveCount(5);
  await page.locator('#nav-saved').click();
  await expect(page.locator('#saved-list')).toContainText('가상 예시 · 실제 논문 아님');
  expect(errors).toEqual([]);
});
test('검색 꺼짐을 가상 검색 성공으로 대체하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#brief').fill('EUV');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await expect(page.locator('#panel-explore')).toContainText('검색 서버에 연결되지 않았어요');
  await expect(page.locator('.pw-paper-row')).toHaveCount(0);
});
test('논문 상태와 비교 버튼은 화면 폭에 맞춰 오른쪽 정렬하고 경고 표시는 한 번만 나온다', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.papers[0].origin = 'provider';
    S.fulltext[S.papers[0].id] = { status: 'challenge_required' };
    render();
  });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const row = page.locator('.pw-paper-row').first();
    const status = row.locator('.paper-end');
    const compare = row.locator('.pw-compare-btn');
    await expect(status.locator('.tag.warn .ico')).toHaveCount(1);
    await expect(status.locator('.ft-mark.warn')).toHaveCount(0);
    const rowBox = await row.boundingBox();
    const statusBox = await status.boundingBox();
    const compareBox = await compare.boundingBox();
    expect(Math.abs((rowBox.x + rowBox.width - 14) - (compareBox.x + compareBox.width))).toBeLessThan(3);
    expect(statusBox.x).toBeGreaterThanOrEqual(rowBox.x);
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
test('보관한 PDF를 현재 PC의 브라우저 다운로드로 저장한다', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { saveFulltext } = await import('/src/repository/idb.js');
    const { render } = await import('/src/controller/render.js');
    const p = S.papers[0];
    p.origin = 'provider';
    S.fulltext[p.id] = { status: 'extracted', pageCount: 1, pdfAvailable: true };
    await saveFulltext(S.projectId, p.id, [{ page: 1, text: '가상 예시 · 실제 논문 아님' }], new Blob(['%PDF-1.4\nfixture'], { type: 'application/pdf' }));
    render();
  });
  await page.locator('.pw-paper-row').first().locator('[data-pact="open-detail"]').click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '이전에 보관한 PDF 다운로드', exact: true }).click()]);
  expect(file.suggestedFilename()).toMatch(/^paper-.*\.pdf$/);
  expect(await file.failure()).toBeNull();
});
test('원문 받기에서 새 PDF는 직접 다운로드하고 브라우저 DB에는 저장하지 않는다', async ({ page }) => {
  let requestBody;
  await page.route('**/api/fulltext/fetch', r => {
    requestBody = r.request().postDataJSON();
    return r.fulfill({ json: { status: 'extracted', source: 'fixture', pageCount: 1, pages: [{ page: 1, text: '가상 예시 · 실제 논문 아님' }], pdfBase64: Buffer.from('%PDF-1.4\nfixture').toString('base64') } });
  });
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { render } = await import('/src/controller/render.js');
    S.papers[0].origin = 'provider'; render();
  });
  const [file] = await Promise.all([page.waitForEvent('download'), startSingleBulk(page)]);
  expect(await file.failure()).toBeNull();
  expect(requestBody.saveLocal).toBe(false);
  await expect.poll(() => page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    return S.fulltext[S.papers[0].id]?.status;
  })).toBe('extracted');
  const stored = await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    const { loadFulltextPdf, loadFulltext } = await import('/src/repository/idb.js');
    return { pdf: await loadFulltextPdf(S.projectId, S.papers[0].id), pages: await loadFulltext(S.projectId, S.papers[0].id) };
  });
  expect(stored.pdf).toBeNull();
  expect(stored.pages).toHaveLength(1);
});
test('30편 검색, 선택·메모·비교·초점 보존과 저장본 재열기', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await searchFixture(page);
  const rows = page.locator('.pw-paper-row');
  await rows.first().locator('[data-act="toggle-paper"]').click();
  await page.locator('[data-pact="filter-toggle"]').click();
  await page.locator('[name=include]').fill('coating');
  await page.locator('[data-rform="refine"] [type=submit]').click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.selPapers.length)).toBe(29);
  await expect(rows).toHaveCount(15);
  await rows.first().locator('[data-pact="open-detail"]').click();
  const pid = await rows.first().getAttribute('data-paper-id');
  await page.locator('[data-act="note"]').fill('메모 보존 확인');
  await page.locator('#ptab-cluster').click();
  await page.locator('#summary-focus').fill('분류 기준과 처음 읽을 논문');
  await rows.first().locator('[data-pact="toggle-compare-paper"]').click();
  await rows.nth(1).locator('[data-pact="toggle-compare-paper"]').click();
  await page.locator('#ptab-utilize').click();
  await expect(page.locator('#cmp-h')).toContainText('2/4');
  await page.locator('[data-fk="exit-full-compare"]').click();
  await expect(page.locator('#summary-focus')).toHaveValue('분류 기준과 처음 읽을 논문');
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload();
  await page.locator('#nav-saved').click();
  await page.locator('[data-act="open-saved"]').first().click();
  await expect(page.locator('#summary-focus')).toHaveValue('분류 기준과 처음 읽을 논문');
  await page.locator(`.pw-paper-row[data-paper-id="${pid}"] [data-pact="open-detail"]`).click();
  await expect(page.locator('[data-act="note"]')).toHaveValue('메모 보존 확인');
  expect(errors).toEqual([]);
});
test('프롬프트 갱신과 정리본 가져오기·안전한 표시·버전 전환', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await searchFixture(page);
  await page.locator('#summary-focus').fill('첫 번째 초점');
  await page.locator('[data-pact="quick-prompt"]').click();
  await expect(page.locator('[data-ract="summary-prompt-edit"]')).toContainText('첫 번째 초점');
  await page.locator('#summary-focus').fill('새로운 두 번째 초점');
  await page.locator('[data-pact="quick-prompt"]').click();
  await expect(page.locator('[data-ract="summary-prompt-edit"]')).toContainText('새로운 두 번째 초점');
  await page.locator('[data-fk="summary-detail-make"]').click();
  const form = page.locator('[data-rform="summary-import"]');
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=md]').fill('# 연구군\n가상 자료 [P1]\n| 단독 행\n#공백없음\n<img src=x onerror=alert(1)>');
  await page.locator('#ptab-detail').click();
  await page.locator('#ptab-cluster').click();
  await expect(form.locator('[name=md]')).toContainText('#공백없음');
  await form.locator('[data-import-purpose="detail"]').click();
  await expect(page.locator('[data-summary-read]')).toContainText('| 단독 행');
  await expect(page.locator('[data-summary-read] img')).toHaveCount(0);
  await page.locator('[data-summary-read] [data-pact="open-detail"]').first().click();
  await expect(page.locator('#p-detail-title')).toContainText(papers[0].title);
  await page.locator('#ptab-cluster').click();
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=md]').fill('# 두 번째 버전\n새로운 정리 [P2]');
  await form.locator('[data-import-purpose="detail"]').click();
  await page.locator('[data-fk="sm-open-versions"]').click();
  await page.locator('[data-ract="summary-load"]').first().click();
  await expect(page.locator('[data-ract="summary-draft"]')).toContainText('# 연구군');
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('input[type=file]').setInputFiles({ name: 'example-summary.md', mimeType: 'text/markdown', buffer: Buffer.from('# 파일 정리본\n가상 예시 [P1]') });
  await page.locator('#ptab-detail').click();
  await page.locator('#ptab-cluster').click();
  expect(await form.locator('input[type=file]').evaluate(el => el.files[0]?.name)).toBe('example-summary.md');
  await form.locator('[data-import-purpose="detail"]').click();
  await expect(page.locator('[data-summary-read]')).toContainText('파일 정리본');
});
test('화면 크기별 목록 높이·주요 작업 접근·모바일 복귀', async ({ page }) => {
  await searchFixture(page);
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 1120) await page.locator('#pmob-list').click();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, body: getComputedStyle(document.body).fontSize }));
    expect(dimensions.width).toBeLessThanOrEqual(width);
    expect(dimensions.height).toBeLessThanOrEqual(902);
    expect(dimensions.body).toBe('16px');
    await page.locator('.pw-list-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const top = await page.locator('.pw-list-scroll').evaluate(el => el.scrollTop);
    await page.locator('.pw-paper-row').last().locator('[data-pact="open-detail"]').click();
    await expect(page.locator('[data-pact="quick-import"]')).toBeInViewport();
    if (width <= 1120) {
      await expect(page.locator('#panel-explore')).not.toBeVisible();
      await page.locator('#pmob-list').click();
      expect(await page.locator('.pw-list-scroll').evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(top - 5);
    }
    await page.screenshot({ path: `docs/captures/workspace-main-${width}.png`, fullPage: true });
  }
});


test('1단계 추천만 선택하고 원문 확보로 이동하며 오류 입력은 선택을 보존한다', async ({ page }) => {
  await searchFixture(page);
  await page.locator('[data-pact="quick-prompt"]').click();
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    S.selPapers = [S.papers[0].id];
    S.pCompareIds = [S.papers[0].id];
    S.notes[S.papers[0].id] = '메모 보존';
  });
  await page.locator('[data-pact="quick-import"]').click();
  const form = page.locator('[data-rform="summary-import"]');
  await form.locator('[name=md]').fill('연구군 설명 [P1]\n1. [P9] 가상 예시\n추천 이유 [P4]\n2. [P3] 가상 예시\n선택 논문: [P9], [P3]');
  await form.locator('[data-import-purpose="shortlist"]').click();
  const selection = () => page.evaluate(async () => (await import('/src/state/store.js')).S.selPapers);
  expect(await selection()).toEqual([papers[8].id, papers[2].id]);
  await expect(page.locator('#bulk-h')).toBeFocused();
  await expect(page.locator('#bulk-h')).toContainText('정리 대상 2편');
  await expect(page.locator('[data-summary-read]')).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    return [S.pCompareIds, S.notes[S.papers[0].id], S.summaries.at(-1).paperIds.length];
  })).toEqual([[papers[0].id], '메모 보존', 30]);
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=md]').fill('추천을 결정하지 못했습니다.');
  await form.locator('[data-import-purpose="shortlist"]').click();
  expect(await selection()).toEqual([papers[8].id, papers[2].id]);
  await expect(form.locator('[name=md]')).toHaveValue('추천을 결정하지 못했습니다.');
  await expect(page.locator('.pw-summary-status')).toContainText('기존 선택');
  await form.locator('[name=md]').fill('선택 논문: [P99]');
  await form.locator('[data-import-purpose="shortlist"]').click();
  expect(await selection()).toEqual([papers[8].id, papers[2].id]);
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload();
  await page.locator('#nav-saved').click();
  await page.locator('[data-act="open-saved"]').first().click();
  expect(await selection()).toEqual([papers[8].id, papers[2].id]);
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=file]').setInputFiles({ name: 'recommendations.md', mimeType: 'text/markdown', buffer: Buffer.from('선택 논문: [P5], [P2]') });
  await form.locator('[data-import-purpose="shortlist"]').click();
  expect(await selection()).toEqual([papers[4].id, papers[1].id]);
  await expect(page.locator('#bulk-h')).toBeFocused();
});

// 사용자 제공 응답 원문: 내용의 진위가 아니라 추천 번호 적용만 검사한다.
test('구버전 프롬프트로 받은 실제 형식의 1단계 결과도 추천 다섯 편만 적용한다', async ({ page }) => {
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    S.summaryCtx = { paperIds: S.papers.map(p => p.id), promptVersion: 'summary-v3-gemini' };
    S.summaryPrompt = '';
    S.selPapers = [S.papers[9].id];
  });
  await page.locator('[data-pact="quick-import"]').click();
  const form = page.locator('[data-rform="summary-import"]');
  await form.locator('[name=md]').fill(readFileSync(new URL('../tests/fixtures/shortlist-user-result.md', import.meta.url), 'utf8'));
  await form.locator('button[type=submit]').first().click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.selPapers)).toEqual([papers[0].id, papers[1].id, papers[2].id, papers[15].id, papers[3].id]);
  await expect(page.locator('#bulk-h')).toBeFocused();
  await expect(page.locator('#bulk-h')).toContainText('정리 대상 5편');
  await expect(page.locator('.pw-paper-row')).toHaveCount(5);
  await expect(page.locator('[data-fk="p-selected-only"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-summary-read]')).toHaveCount(0);
});


test('일괄 받기는 OpenAlex 인증 경로의 PDF를 직접 저장하고 텍스트를 연결한다', async ({ page }) => {
  const pdf = fixturePdf('Example OpenAlex article with enough text for extraction.');
  let openCount = 0, legacyCount = 0;
  await page.route('**/api/openalex-pdf?work=W123', r => { openCount++; return r.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: pdf }); });
  await page.route('**/api/fulltext/fetch', r => { legacyCount++; return r.fulfill({ json: { status: 'failed' } }); });
  await searchFixture(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/state/store.js');
    S.papers[0].origin = 'provider';
    S.papers[0].fulltext = { contentPdfUrl: 'https://content.openalex.org/works/W123.pdf' };
  });
  const downloadPromise = page.waitForEvent('download');
  await startSingleBulk(page);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.fulltext[(await import('/src/state/store.js')).S.papers[0].id]?.status)).toBe('extracted');
  expect(openCount).toBe(1);
  expect(legacyCount).toBe(0);
  await expect(page.locator('#bulk-h')).toContainText('확보 1');
});
