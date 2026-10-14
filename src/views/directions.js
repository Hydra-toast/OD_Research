// 연구 방향 카드와 방향 비교(표 + 모바일 카드).
import { h, tag, fmtTime } from './common.js';
import { labConnection } from '../logic.js';

/** @param {any} S */
export function directionsHtml(S) {
  const a = S.analysis;
  if (!a) return `<section class="card" aria-labelledby="dir-h"><h2 id="dir-h" style="font-size:1.25rem">연구 방향</h2><p role="status">방향 후보를 분석하는 중…</p></section>`;
  const notices = (a.notices ?? []).filter((/** @type {string} */ n) => n !== a.reason);
  const noticeHtml = (a.status === 'partial' ? `<p class="notice" role="status">${tag('warn', '부분 결과')} 일부 결과만 표시하고 있어요. 이전에 선택한 방향과 메모는 그대로예요.</p>` : '') +
    notices.map((/** @type {string} */ n) => `<p class="notice" role="status">${h(n)}</p>`).join('') +
    (a.error ? `<p class="error" role="alert">${h(a.error)}</p>` : '');
  if (!a.directions.length) return `<section class="card stack" aria-labelledby="dir-h"><h2 id="dir-h" style="font-size:1.25rem">연구 방향</h2>${noticeHtml}<p class="notice" role="status">${h(a.reason || '조건을 만족하는 방향 후보가 없어요.')}</p><p class="hint">검색 범위를 조정하거나 논문을 직접 추가한 뒤 다시 확인해 보세요. 아래 논문 목록은 그대로 사용할 수 있어요.</p></section>`;
  const cmp = S.compare.map((/** @type {string} */ id) => a.directions.find((/** @type {any} */ d) => d.id === id)).filter(Boolean);
  return `<section aria-labelledby="dir-h" class="stack"><h2 id="dir-h" style="font-size:1.25rem">연구 방향 <span class="count">${a.directions.length}</span></h2>
    ${noticeHtml}<p class="hint">검토할 질문 후보이며 실험 실행 승인이나 우선순위가 아니에요. 점수는 매기지 않아요.</p>
    <div class="dir-grid">${a.directions.map((/** @type {any} */ d) => dirCard(S, d)).join('')}</div>
    ${cmp.length >= 2 ? compareDirs(S, cmp) : '<p class="hint">방향 2~3개의 “비교에 담기”를 누르면 비교 표가 나타나요.</p>'}</section>`;
}

const names = (/** @type {any[]} */ ps) => ps.map(p => h(p.title)).join(', ') || '없음';

/** @param {any} S @param {any} d */
function dirCard(S, d) {
  const conn = labConnection(d, S.lab);
  const sel = S.selDirs.includes(d.id), cmp = S.compare.includes(d.id);
  const obs = d.observation;
  const lab = conn.status === 'none'
    ? '<p><strong>연구실과의 연결:</strong> 연구실 정보 미입력 — 맞춤 연결은 표시하지 않아요.</p>'
    : `<p><strong>재료 유사성:</strong> ${conn.materialCommon.length ? `공통 — ${conn.materialCommon.map(h).join(', ')}` : '공통 항목이 확인되지 않았어요'}</p>
       <p><strong>공정 유사성:</strong> ${conn.processCommon.length ? `공통 — ${conn.processCommon.map(h).join(', ')}` : '공통 항목이 확인되지 않았어요'}</p>
       <p><strong>약하거나 확인되지 않은 부분:</strong> ${conn.weak.length ? conn.weak.map(h).join(', ') : '없음(입력 기준)'}</p>`;
  return `<article class="card dir" aria-label="${h(d.label)}">
    <h3>${h(d.label)}</h3><p><strong>검토할 질문:</strong> ${h(d.question)}</p><p>${h(d.desc)}</p>
    <p><strong>수집 자료에서 관찰된 내용:</strong> 전체 ${obs.total}편 중 ${obs.inScope}편이 이 방향에 속함 · 수집 시점 ${h(fmtTime(obs.collectedAt))}. <span class="hint">${h(d.interpretation)} (실제 추세 분석 아님)</span></p>
    <p><strong>대표 논문:</strong> ${names(d.representative)}</p>
    <p><strong>최근 변화·한계를 다룬 논문:</strong> ${names(d.recent)}</p>
    ${lab}
    <p><strong>실험 가능성(장비·조건):</strong> ${d.needs.length ? d.needs.map((/** @type {string} */ n) => { const c = conn.needs.find((/** @type {any} */ x) => x.name === n); return `${h(n)} — ${tag('warn', c ? c.status : '확인 필요')}`; }).join('<br>') : '—'}</p>
    <div><strong>다음에 읽을 논문:</strong><ul class="plain">${d.readNextWhy.map((/** @type {any} */ x) => `<li>${h(x.paper.title)} <span class="hint">— ${h(x.why)}</span></li>`).join('')}</ul></div>
    <div class="row"><button class="btn" data-act="toggle-dir" data-id="${d.id}" aria-pressed="${sel}" data-fk="dir-${d.id}">${sel ? '✓ 준비 자료에 추가됨' : '준비 자료에 추가'}</button>
    <button class="btn" data-act="toggle-compare" data-id="${d.id}" aria-pressed="${cmp}" data-fk="cmp-${d.id}">${cmp ? '✓ 비교에 담음' : '비교에 담기'}</button></div></article>`;
}

/** @param {any} S @param {any[]} ds */
function compareDirs(S, ds) {
  const rows = /** @type {[string,(d:any)=>string][]} */ ([
    ['검토할 질문', d => d.question],
    ['근거 논문 수', d => `${d.papers.length}편(수집 자료 기준)`],
    ['재료 연결', d => { const c = labConnection(d, S.lab); return c.status === 'none' ? '연구실 정보 미입력' : c.materialCommon.join(', ') || '확인되지 않음'; }],
    ['공정 연결', d => { const c = labConnection(d, S.lab); return c.status === 'none' ? '연구실 정보 미입력' : c.processCommon.join(', ') || '확인되지 않음'; }],
    ['확인되지 않은 부분', d => d.needs.map((/** @type {string} */ n) => `${n}(확인 필요)`).join(', ') || '—'],
    ['다음 행동', d => `${d.readNext[0]?.title ?? '없음'}부터 읽기`],
  ]);
  const table = `<div class="scroll-x cmp-table" tabindex="0" role="region" aria-label="방향 비교 표"><table><caption class="hint" style="text-align:left;padding:8px 16px">방향 비교 (점수 없음)</caption><thead><tr><th scope="col">항목</th>${ds.map(d => `<th scope="col">${h(d.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><th scope="row">${l}</th>${ds.map(d => `<td>${h(f(d))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  // 좁은 화면에서는 표 대신 방향별 카드로 보여준다(가로 스크롤 없이).
  const cards = `<div class="cmp-cards" aria-label="방향 비교 카드">${ds.map(d => `<article class="card"><h3>${h(d.label)}</h3><dl class="kv">${rows.map(([l, f]) => `<dt>${l}</dt><dd>${h(f(d))}</dd>`).join('')}</dl></article>`).join('')}</div>`;
  return table + cards;
}
