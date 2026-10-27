import { test, expect } from '@playwright/test';

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
  await page.locator('.pw-paper-row').first().locator('[data-pact="open-detail"]').click();
  await page.getByRole('button', { name: '공개 원문 받기', exact: true }).click();
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
  await page.locator('.pw-paper-row').first().locator('[data-pact="open-detail"]').click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '공개 원문 받기', exact: true }).click()]);
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
  const form = page.locator('[data-rform="summary-import"]');
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=md]').fill('# 연구군\n가상 자료 [P1]\n| 단독 행\n#공백없음\n<img src=x onerror=alert(1)>');
  await page.locator('#ptab-detail').click();
  await page.locator('#ptab-cluster').click();
  await expect(form.locator('[name=md]')).toContainText('#공백없음');
  await form.locator('[type=submit]').click();
  await expect(page.locator('[data-summary-read]')).toContainText('| 단독 행');
  await expect(page.locator('[data-summary-read] img')).toHaveCount(0);
  await page.locator('[data-summary-read] [data-pact="open-detail"]').first().click();
  await expect(page.locator('#p-detail-title')).toContainText(papers[0].title);
  await page.locator('#ptab-cluster').click();
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('[name=md]').fill('# 두 번째 버전\n새로운 정리 [P2]');
  await form.locator('[type=submit]').click();
  await page.locator('[data-fk="sm-open-versions"]').click();
  await page.locator('[data-ract="summary-load"]').first().click();
  await expect(page.locator('[data-ract="summary-draft"]')).toContainText('# 연구군');
  await page.locator('[data-pact="quick-import"]').click();
  await form.locator('input[type=file]').setInputFiles({ name: 'example-summary.md', mimeType: 'text/markdown', buffer: Buffer.from('# 파일 정리본\n가상 예시 [P1]') });
  await page.locator('#ptab-detail').click();
  await page.locator('#ptab-cluster').click();
  expect(await form.locator('input[type=file]').evaluate(el => el.files[0]?.name)).toBe('example-summary.md');
  await form.locator('[type=submit]').click();
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
