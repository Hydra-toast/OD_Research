# Research Landscape

새 연구 주제를 받은 석사 신입과 초기 연구자를 위한 논문 탐색·랩미팅 근거 정리 도구(개발 중).

## 현재 상태
예시 모드와 OpenAlex 실제 검색을 지원합니다. 실제 검색은 키 없이 시작하며 Crossref로 결측 서지정보를 보완합니다. OpenAlex 장애 시에는 출처를 표시하고 Crossref 검색으로 대체합니다. 실제 검색 결과와 메모도 이 브라우저에 저장·복원할 수 있습니다. Supabase 프로젝트 주소와 테이블은 연결되어 있습니다. OpenAI·원문 PDF 3편 대조는 **실제 호출·대조 미검증**입니다. 검색 연결이 전체 서비스 출시 완료를 뜻하지 않습니다.

## 실행 (Windows PowerShell, Node 20 이상)
```powershell
npm install
npm start          # http://localhost:5173
```
ES 모듈을 쓰므로 `index.html`을 직접 열면 동작하지 않습니다. 서버를 통해 여세요.

## 검사
```powershell
npm run check      # 타입(checkJs)
npm test           # 단위 테스트(Vitest)
npx playwright install chromium   # 최초 1회
npm run e2e        # 브라우저 테스트(Playwright)
```

## 지금 할 수 있는 것
- 주제 입력 또는 EUV 포토레지스트 / ALD·High-k / HBM 예시 선택
- 조사 범위 조정(제외·더 보기·소재·강조·동향/방법 중심), 연구 갈래 필터, 정렬
- 연구실 정보(선택) 입력과 방향 카드 연결 항목 확인, 방향 비교
- 논문·방향 선택 → 랩미팅 준비: 논문 비교(수정 이력), 발표 문장·근거 편집, 근거 패널
- 자동 저장, 저장한 조사 열기/이름 변경/삭제
- 한 페이지 요약, 발표 가이드 복사·Markdown 다운로드

## 설정
`.env.example`을 복사한 `.env`에만 값을 넣습니다. Git에 올리지 않습니다.

| 이름 | 역할 |
|---|---|
| `SUPABASE_URL` | 프로젝트 주소 |
| `SUPABASE_ANON_KEY` | 공개 키. 로그인 요청에 사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. 사용자 토큰으로 쓰지 않음 |
| `APP_ORIGIN` | 인증 메일이 돌아올 주소 |
| `PORT` | 서버 포트. 기본 5173 |
| `OPENALEX_API_KEY` | 선택. 비어 있으면 소규모 공개 검색. 무료 키가 있으면 호출 가능량 확대. 서버에서만 사용 |
| `CROSSREF_MAILTO` | 본인 연락 이메일(Gmail 가능). 비밀번호·API 키가 아님. 입력하면 개별 논문의 결측 서지정보를 보완 |
| `SEARCH_ENABLED` | 기본 true. false면 실제 검색을 끄고 예시 모드만 사용 |
| `OPENAI_API_KEY` | AI 키. 단가 확인 전에는 실호출하지 않음 |
| `OPENAI_MODEL` | 기본 `gpt-5.4-mini`. 실패해도 다른 모델로 바꾸지 않음 |
| `AI_DAILY_BUDGET_USD` | 앱 추정 일일 예산. 청구 상한 아님 |
| `AI_PROJECT_BUDGET_USD` | 조사별 추정 예산 |

서버는 `npm start` 한 프로세스입니다. 작업 복구와 만료 파일 정리는 그 안에서 1분마다 돕니다. 별도 worker 프로세스는 없습니다. 테이블 SQL은 `supabase/migrations/20261014_projects.sql`이며, 이 저장소의 Supabase에는 이미 적용되어 있습니다.

문제 해결: 계정 버튼이 없으면 `SUPABASE_URL`과 `SUPABASE_ANON_KEY`를 저장한 뒤 서버를 다시 시작하세요. 일반 주제 입력은 실제 검색, ‘예시로 살펴보기’는 가상 자료입니다. 검색이 꺼져 있으면 `SEARCH_ENABLED=false` 설정과 서버 재시작 여부를 확인하세요. Semantic Scholar 키는 더 이상 사용하지 않습니다.

```env
OPENALEX_API_KEY=
CROSSREF_MAILTO=yourname@gmail.com
SEARCH_ENABLED=true
```

위 이메일은 실제 본인 주소로 바꿉니다. `.env` 수정 후 서버를 다시 시작하세요. 개인 `.env` 값은 이번 코드 수정에서 바꾸지 않았습니다.

원문은 `best_oa_location`과 제공된 PDF/XML 후보 위치만 보관하며, 링크가 있어도 접근 상태는 서지/초록으로 유지합니다. 이 변경에서 원문 자동 다운로드·본문 분석을 추가하지 않았습니다. 연구 방향 자동 분석도 별도 미연결 상태로 안내합니다. OpenAlex 공개 검색은 호출·일일 사용량 제한이 있고 모든 초록·원문을 보장하지 않습니다.

공식 문서: [OpenAlex 인증](https://help.openalex.org/api/authentication/), [OpenAlex 논문 필드](https://help.openalex.org/data/works/attributes/), [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).

## 문서
`docs/ACCEPTANCE.md`, `PRODUCT_CONTRACT.md`, `PROGRESS.md`, `DECISIONS.md`, `TEST_MATRIX.md`, `BACKLOG.md`

- [최신 PRD v2.0 — 개인 연구 도구 개발 기준](.cursor/Research-Landscape-PRD.md)
- [OpenAlex·Crossref 변경 인계 프롬프트](docs/prompts/2026-10-21-search-provider-handoff.md)

## 문서
`docs/PRODUCT_CONTRACT.md`, `PROGRESS.md`, `DECISIONS.md`, `TEST_MATRIX.md`, `BACKLOG.md`


## 보완 후 상태
새로고침·뒤로 가기 복원(`?project=`), 손상 데이터 복구 화면, 소재 반영, 논문 직접 추가, 구조화 비교 셀을 지원한다. 설치된 Chrome으로 e2e: `$env:PW_CHANNEL="chrome"; npm run e2e`.
