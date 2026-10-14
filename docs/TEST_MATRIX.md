# 검증 매트릭스

판정값: 실제 확인 / 고정 응답으로 확인 / 로컬 DB 검증 / 실패 / 외부 조건으로 미검증

## 도구
- 타입: `npm run check` (tsc checkJs, 2단계에서 생성)
- 단위/통합: `npm test` (Vitest, 2단계에서 생성)
- UI: Playwright (4단계부터)
- 화면: 1280px, 375px, 실제 브라우저 200% 확대(CSS 확대·deviceScaleFactor=2는 대체 불가, 축소 viewport는 보조 검사로 구분)

## 핵심 흐름
| 흐름 | 방법 | 단계 | 현재 |
|---|---|---|---|
| 입력 → 범위·추천 표시 | Playwright | 4 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 범위 수정 시 결과 갱신, 선택·메모 보존 | Playwright | 4 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 연구실 정보 없이 탐색 | Playwright | 4~5 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 방향 카드 8편/2편 기준 | Vitest | 5 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 탐색 선택 = 준비 화면 일치 | Playwright | 6 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 초록 전용 논문에 위치 미생성 | Vitest/Playwright | 2,4,7 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| Claim 수정 시 확인 해제 | Vitest/Playwright | 6 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 저장 후 새로고침 복원 | Playwright | 7 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 복사/Markdown, 출처·미확인·예시 라벨 유지 | Playwright | 7 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 오래된 응답이 최신 결과를 덮지 않음 | Vitest/Playwright | 4 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 모드 혼합 차단, 실패 시 예시 대체 없음 | Vitest | 2,9 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 실패 상태(0건/429/초록 없음/원문 없음/추출 실패/부분 성공/저장 실패) | 고정 응답 | 2,7,9~12 | 공급자 수준 단위 테스트와 0건·저장 실패 화면만 확인. 나머지 미검증 |
| 색 대비 4.5:1/3:1, 키보드, reduced-motion | 계산·Playwright | 3,7 | 예시 모드에서 확인(상세는 PROGRESS.md) |
| 인증·RLS·타 사용자 차단 | 모의 토큰, 가능 시 PGlite | 8 | 미검증 |
| 실제 Supabase/OpenAI/검색 | 키 필요 | 8~13 | 외부 조건으로 미검증 |




## 보완 후 회귀 (P0 결손 보완)
- 단위(98): 스키마·레코드(손상·참조·미래 버전·v0 이전)·로직(소재·방향 필드·셀·근거·내보내기)·AnalysisProvider·뷰 문자열·검색 러너 지연 역전·색 대비.
- e2e(29): `e2e/flow.e2e.js` + `e2e/repair.e2e.js`(새로고침, 뒤로 가기, 소재, 손상 복구, 근거 추가, 사용자 논문, 논문만 내보내기, 연속 검색, 렌더 대비, 375 카드, 640×400 보조).
- 브라우저: 기본 Chromium 또는 `PW_CHANNEL=chrome npm run e2e`.
- 미검증: 실제 브라우저 200% 확대, 외부 연동 전부.

## 보완 이후 독립 재감사 (2026-10-14)

| 검사 | 이번 판정 |
|---|---|
| checkJs / 기존 단위 98개 | 통과 (@ts-nocheck 없음, strictNullChecks:true, strict:false) |
| 기존 E2E 29개 | 설치된 Chrome에서 통과; 번들 Chromium은 현재 실행 파일 부재로 미재현 |
| 저장 대기 중 같은 조사 열기 | 실패: 최신 선택이 DB에 기록되지 않고 이전 선택으로 복원 |
| null Evidence를 가진 저장 레코드 | 실패: 검증 함수 예외, 복구 화면 없음, 저장 목록 전체 읽기 실패 |
| null Evidence.location | 실패: 검증 통과 후 근거 패널에서 예외 |
| 실제 구형 v1 비교 셀·수정 이력 이전 | 실패: 구조 오류로 복구 화면, 원본 JSON만 내보낼 수 있음 |
| 셀 Evidence / 방향 readNext 참조 | 실패: 없는 참조 ID가 검증 통과 |
| 논문만 선택한 요약 | 제목·메모·수정값 포함 확인 |
| 논문만 선택한 발표 가이드 | 제목 포함, 메모·수정값·측정 조건 누락 |
| 구형 프로젝트 ID의 URL 복원 | 확인 |
| 실제 200% 확대 / 외부 연동 | 계속 미검증 |

독립 관찰 스크립트의 `passed`는 위 결손을 재현했다는 뜻이며 제품 요구사항 통과가 아니다. 실행 자료는 `test-results/recheck-suite/independent.e2e.js`, `test-results/recheck-probe.mjs`; 상세는 `IMPLEMENTATION_AUDIT_1-7.md`의 독립 재감사 절을 따른다.

## 8단계 (2026-10-14)
| 검사 | 판정 |
|---|---|
| 인증 누락·만료·로그아웃·타인 프로젝트·revision 충돌·삭제 실패 | 고정 응답으로 확인 (`tests/server.test.js`) |
| 정적 경로 차단(`.env`, 문서, 서버 코드) | 고정 응답으로 확인 |
| 실제 Supabase 사용자 둘로 인증·RLS | 외부 조건으로 미검증 (계정 없음) |
| 예시 모드 기존 브라우저 흐름 | Playwright 31개, Express 서버로 확인 |

## 재감사 결손 수정 후 (2026-10-14)
| 검사 | 판정 |
|---|---|
| checkJs / Vitest 102개 | 통과 |
| Playwright 31개 | 번들 Chromium에서 통과 |
| 저장 대기 중 같은 조사 열기 | e2e에서 선택 1편 유지 확인 |
| null 근거가 있는 저장 레코드 | 복구 화면, 다른 조사 목록 유지, pageerror 없음 |
| v1 셀·없는 근거·readNext·null 위치·null 조건 | 단위 테스트 |
| 발표 가이드의 메모·수정 수치·조건 | 단위 + e2e |
| 실제 200% 확대 / 외부 연동 | 미검증 |
