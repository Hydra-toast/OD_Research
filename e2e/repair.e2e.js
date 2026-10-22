// P0 결손 보완 회귀: 새로고침·뒤로 가기·소재·손상 복구·근거 추가·사용자 논문·논문만 내보내기·연속 검색·대비·좁은 화면.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const addPaper = page => page.locator('article.paper button[aria-pressed=false]').first().click();
async function startEuv(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '예시로 살펴보기' }).click();
  await expect(page.getByRole('heading', { name: '이런 내용을 중심으로 찾아봤어요' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '연구 방향' })).toHaveCount(0);
}
const projectOf = url => new URL(url).searchParams.get('project');
const savedItems = page => page.locator('#saved-list .saved-item');
const expandAll = async page => { const b = page.getByRole('button', { name: /추가 결과 펼치기/ }); if (await b.count()) await b.click(); };

async function addUserPaper(page, title, { abstract = '내가 적은 초록', branch = null } = {}) {
  if (!(await page.locator('#add-form').count())) await page.getByRole('button', { name: '논문 직접 추가' }).click();
  await page.locator('#add-form input[name=title]').fill(title);
  await page.locator('#add-form textarea[name=abstract]').fill(abstract);
  if (branch) await page.locator(`#add-form input[name=branches][value=${branch}]`).check();
  await page.locator('#add-form').getByRole('button', { name: '추가', exact: true }).click();
}

test('새로고침은 작업 화면을 비우고 저장 목록에서만 다시 연다', async ({ page }) => {
  await startEuv(page);
  const id = projectOf(page.url());
  expect(id).toMatch(/^p-/);
  await addPaper(page);
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
  await page.reload();
  expect(page.url()).not.toContain('project=');
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(savedItems(page)).toHaveCount(1);
  await page.reload();
  await expect(savedItems(page)).toHaveCount(1);
  await page.locator('#saved-list').getByRole('button', { name: '열기' }).click();
  await expect(page.locator('#sel-count')).toHaveText('1');
  expect(projectOf(page.url())).toBe(id);
});

test('뒤로 가기는 이전 조사와 화면으로 돌아간다', async ({ page }) => {
  await startEuv(page);
  const a = projectOf(page.url());
  await page.locator('#brief').fill('ALD High-k');
  await page.getByRole('button', { name: '조사 방향 정리하기' }).click();
  await expect(page.locator('.scope-list')).toContainText('ALD');
  const b = projectOf(page.url());
  expect(b).not.toBe(a);
  await page.goBack();
  await expect(page.locator('.scope-list')).toContainText('EUV');
  expect(projectOf(page.url())).toBe(a);
  await page.goBack();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.goForward();
  await expect(page.locator('.scope-list')).toContainText('EUV');
});

test('저장 대기 중 다시 열어도 마지막 선택이 남는다', async ({ page }) => {
  await startEuv(page);
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
  await page.evaluate(() => { window.__rl.saveDelayMs = 5000; });
  await addPaper(page);
  await expect(page.locator('.sel-bar')).toContainText('선택 1편');
  await page.locator('#saved-list').getByRole('button', { name: '열기' }).click();
  await expect(page.locator('.sel-bar')).toContainText('선택 1편');
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
});

test('손상된 근거가 있어도 다른 조사의 저장 목록은 남는다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await startEuv(page);
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('research-landscape');
    r.onsuccess = () => {
      const tx = r.result.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({
        id: 'p-nullevidence', name: '근거 깨짐', originalInput: 'x', dataMode: 'example', queries: ['x'], exclusions: [], topicKey: 'euv',
        claims: { a: { text: 't', evidence: [null], evidenceIds: [], history: [], state: { sourceLinked: false, aiInterpreted: false, userConfirmed: false, needsCheck: true } } },
      });
      tx.oncomplete = () => res(null);
      tx.onerror = () => rej(new Error('seed'));
    };
    r.onerror = () => rej(new Error('open'));
  }));
  await page.reload();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#saved-list')).toContainText('복구 필요');
  await expect(page.locator('#saved-list')).toContainText('EUV');
  await expect(page.locator('#saved-list')).not.toContainText('저장소를 읽지 못했어요');
  await page.locator('#saved-list').getByRole('button', { name: '상태 보기' }).click();
  await expect(page.getByRole('heading', { name: '저장된 조사를 열 수 없어요' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('?topic= 주소는 새 조사를 시작하고 ?project=로 바뀐다', async ({ page }) => {
  await page.goto('/?topic=euv');
  await expect(page.locator('.scope-list')).toContainText('EUV');
  await expect.poll(() => projectOf(page.url())).toMatch(/^p-/);
  expect(page.url()).not.toContain('topic=');
});

test('소재/대상이 순위와 필터에 반영되고, 불일치는 알려준다', async ({ page }) => {
  await startEuv(page);
  await page.getByRole('button', { name: '조정하기' }).click();
  await page.locator('input[name=material]').fill('금속산화물');
  await page.locator('input[name=materialOnly]').check();
  await page.getByRole('button', { name: '조정 내용 반영' }).click();
  await expandAll(page);
  const n = await page.locator('article.paper').count();
  expect(n).toBeGreaterThan(0); expect(n).toBeLessThan(8);
  await expect(page.locator('article.paper').first()).toContainText('소재/대상 "금속산화물"와 일치');
  await expect(page.locator('.scope-list')).toContainText('일치하는 논문만 보는 중');

  await page.getByRole('button', { name: '조정하기' }).click();
  await page.locator('input[name=material]').fill('HBM');
  await page.getByRole('button', { name: '조정 내용 반영' }).click();
  await expect(page.getByText(/일치하는 논문이 수집한 자료에 없어요/)).toBeVisible();
  await page.getByRole('button', { name: /HBM.*다시 구성/ }).click();
  await expect(page.locator('.scope-list')).toContainText('HBM');
  await expect(savedItems(page)).toHaveCount(2);
});

test('손상된 저장 데이터는 복구 화면으로 열리고 지워지지 않는다', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('research-landscape');
    r.onsuccess = () => { const tx = r.result.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ id: 'p-corrupt1', name: '깨진 조사', originalInput: 'x', dataMode: 'example', queries: [], exclusions: [], topicKey: 'missing', claims: null }); tx.oncomplete = () => res(null); tx.onerror = () => rej(new Error('seed')); };
    r.onerror = () => rej(new Error('open'));
  }));
  await page.goto('/?project=p-corrupt1');
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#saved-list').getByRole('button', { name: '상태 보기' }).click();
  await expect(page.getByRole('heading', { name: '저장된 조사를 열 수 없어요' })).toBeVisible();
  await expect(page.locator('#panel-explore')).toContainText('주제 정보를 알 수 없어');
  await expect(page.getByRole('button', { name: '원본 내보내기(JSON)' })).toBeVisible();
  await expect(savedItems(page).first()).toContainText('복구 필요');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '원본 내보내기(JSON)' }).click()]);
  expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('p-corrupt1');
  await page.reload();
  await expect(page.locator('#workspace')).toBeHidden();
  expect(errors).toEqual([]);
  await expect(savedItems(page)).toHaveCount(1); // 자동 삭제 없음
});

test('없는 프로젝트 주소는 저장본을 열지 않고 첫 화면으로 남긴다', async ({ page }) => {
  await page.goto('/?project=p-nothing1');
  await expect(page.locator('#workspace')).toBeHidden();
  expect(page.url()).not.toContain('project=');
  await expect(page.getByRole('heading', { name: '저장된 조사를 찾지 못했어요' })).toHaveCount(0);
});

test('직접 추가한 논문은 선택해 준비 화면으로 가져간다', async ({ page }) => {
  await startEuv(page);
  await addUserPaper(page, '내 논문 X');
  await expandAll(page);
  await page.locator('article.paper', { hasText: '내 논문 X' }).locator('button[aria-pressed=false]').click();
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await expect(page.locator('#panel-prepare')).toContainText('내 논문 X');
  await expect(page.getByRole('heading', { name: '연구 방향' })).toHaveCount(0);
});

test('논문 직접 추가: 검증, 사용자 제공 표시, 새로고침 후 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('#brief').fill('HBM 패키징');
  await page.getByRole('button', { name: '조사 방향 정리하기' }).click();
  await expect(page.locator('#panel-explore article.paper')).toHaveCount(3);
  await page.getByRole('button', { name: '논문 직접 추가' }).click();
  await page.locator('#add-form').getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.locator('#add-error')).toContainText('제목');
  await page.locator('#add-form input[name=title]').fill('x');
  await page.locator('#add-form input[name=doi]').fill('not-a-doi');
  await page.locator('#add-form').getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.locator('#add-error')).toContainText('DOI 형식');
  await page.locator('#add-form input[name=doi]').fill('');
  for (let i = 1; i <= 5; i++) await addUserPaper(page, `내 HBM 논문 ${i}`);
  await page.getByRole('button', { name: /추가 결과 펼치기/ }).click();
  await expect(page.locator('article.paper', { hasText: '내 HBM 논문 1' })).toContainText('사용자 제공 자료 · 확인 전');
  await expect.poll(async () => (await page.locator('#save-state').innerText())).toContain('저장됨');
  await page.reload();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#saved-list').getByRole('button', { name: '열기' }).click();
  await expect(page.locator('article.paper', { hasText: '내 HBM 논문 1' })).toBeVisible();
  await expandAll(page);
  await expect(page.locator('article.paper', { hasText: '내 HBM 논문 5' }).first()).toBeVisible();
});

test('예시 문서 보기는 근거 패널을 재사용한다', async ({ page }) => {
  await startEuv(page);
  await page.locator('article.paper').first().getByRole('button', { name: '예시 문서 보기' }).click();
  await expect(page.locator('#evidence-panel')).toContainText('가상 예시 문서');
  await expect(page.locator('#evidence-panel')).toContainText('위치 정보 없음');
  await page.keyboard.press('Escape');
  await expect(page.locator('article.paper').first().getByRole('button', { name: '예시 문서 보기' })).toBeFocused();
});

test('논문만 선택해도 내보내기에 논문·메모·수정값이 담긴다', async ({ page }) => {
  await startEuv(page);
  await addPaper(page);
  const title = await page.locator('article.paper h3').first().innerText();
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await page.locator('textarea[data-act=note]').fill('내가 남긴 메모');
  await page.locator('textarea[data-act=note]').blur();
  await page.getByRole('button', { name: '주요 결과 수정' }).first().click();
  await page.locator('input[name=value]').fill('12');
  await page.locator('input[name=unit]').fill('nm');
  await page.locator('input[name=condition]').fill('조건 A');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('근거 미연결')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '요약 Markdown 받기' }).click()]);
  const md = fs.readFileSync(await dl.path(), 'utf8');
  for (const t of [title, '내가 남긴 메모', '12 nm', '조건 A', '근거 미연결']) expect(md).toContain(t);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '가이드 Markdown 받기' }).click()]);
  const guide = fs.readFileSync(await dl2.path(), 'utf8');
  for (const t of [title, '내가 남긴 메모', '12 nm', '조건 A']) expect(guide).toContain(t);
});

test('셀 편집: 값을 비우려면 사유가 필요하다', async ({ page }) => {
  await startEuv(page);
  await addPaper(page);
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await page.getByRole('button', { name: '주요 결과 수정' }).first().click();
  await page.locator('input[name=value]').fill('');
  await page.locator('select[name=emptyReason]').selectOption('');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('#panel-prepare [role=alert]')).toContainText('빈값 사유');
  await page.locator('select[name=emptyReason]').selectOption('extraction_failed');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('추출 실패')).toBeVisible();
});

test('단위·조건이 다른 수치는 직접 비교 제한', async ({ page }) => {
  await startEuv(page);
  await page.locator('article.paper').nth(0).locator('button[aria-pressed=false]').first().click();
  await page.locator('article.paper').nth(1).locator('button[aria-pressed=false]').first().click();
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  for (const [i, unit] of [[0, 'nm'], [1, 'pm']]) {
    await page.getByRole('button', { name: '주요 결과 수정' }).nth(i).click();
    await page.locator('input[name=value]').fill('10');
    await page.locator('input[name=unit]').fill(unit);
    await page.locator('input[name=condition]').fill('같은 조건');
    await page.getByRole('button', { name: '저장', exact: true }).click();
  }
  await expect(page.getByText('직접 비교 제한')).toBeVisible();
});

test('연속 검색: 먼저 보낸 느린 응답이 나중에 와도 마지막 검색이 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__rl.searchDelays = [900, 0]; });
  await page.locator('#brief').fill('EUV 포토레지스트');
  await page.getByRole('button', { name: '조사 방향 정리하기' }).click();
  await page.locator('#brief').fill('ALD High-k');
  await page.getByRole('button', { name: '조사 방향 정리하기' }).click();
  await expect(page.locator('.scope-list')).toContainText('ALD');
  await page.waitForTimeout(1300);
  await expect(page.locator('.scope-list')).toContainText('ALD');
  await expect(page.locator('.scope-list')).not.toContainText('EUV');
  await expect(savedItems(page)).toHaveCount(1);
});

test('부분 결과·상태 아이콘 표시', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__rl.analysisScenario = 'partial'; });
  await page.getByRole('button', { name: '예시로 살펴보기' }).click();
  await expect(page.locator('article.paper').first()).toBeVisible();
  await expect(page.getByText('일부 결과만 표시하고 있어요')).toHaveCount(0);
  await expect(page.locator('.tag .ico').first()).toBeVisible();
});

// 렌더된 색 대비(실제 계산 스타일): 글자색과, 불투명해질 때까지 부모를 따라 합성한 배경색.
async function minContrast(page, selectors) {
  return page.evaluate(sels => {
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    const bgOf = el => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) layers.push(c); if (c.a >= 1) break; }
      let base = { r: 255, g: 255, b: 255 };
      for (const c of layers.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
      return base;
    };
    const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const out = {};
    for (const sel of sels) {
      let min = Infinity, n = 0;
      for (const el of document.querySelectorAll(sel)) {
        if (!el.offsetParent || !el.textContent.trim()) continue;
        const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
        const l1 = lum(fg), l2 = lum(bg);
        min = Math.min(min, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); n++;
      }
      out[sel] = { min: n ? Math.round(min * 100) / 100 : null, n };
    }
    return out;
  }, selectors);
}

test('렌더된 화면의 글자 대비가 4.5:1 이상', async ({ page }) => {
  await startEuv(page);
  await page.getByRole('button', { name: '연구실 정보 입력' }).click();
  await page.getByRole('button', { name: '예시 연구실 불러오기' }).click();
  await addPaper(page);
  const sels = ['body', '.hint', '.tag', '.tag.ok', '.tag.warn', '.tag.example', '.btn', '.btn.primary', 'h2', 'h3', '.notice', '.meta', '.card p'];
  const a = await minContrast(page, sels);
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  const b = await minContrast(page, [...sels, 'th', 'td', '.empty-cell', '.q-box']);
  for (const r of [a, b]) for (const [s, v] of Object.entries(r)) if (v.n) expect(v.min, `${s} ${v.min}`).toBeGreaterThanOrEqual(4.5);
});

test.describe('모바일 375px', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('논문 목록에서 가로 넘침 없음', async ({ page }) => {
    await startEuv(page);
    await expect(page.locator('article.paper').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: '연구 갈래' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

// 보조 확인: 640×400 뷰포트로 좁은 화면과 낮은 높이를 흉내 낸 것이며, 실제 브라우저 200% 확대 검증이 아니다.
test.describe('640×400 보조 확인(200% 확대의 대체 아님)', () => {
  test.use({ viewport: { width: 640, height: 400 } });
  test('가로 넘침 없음, 주요 조작이 보임', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '예시로 살펴보기' }).click();
    await expect(page.getByRole('heading', { name: '이런 내용을 중심으로 찾아봤어요' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' })).toBeVisible();
  });
});
