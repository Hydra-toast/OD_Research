# Research Landscape

새 연구 주제를 받은 석사 신입과 초기 연구자를 위한 논문 탐색·랩미팅 근거 정리 도구(개발 중).

## 현재 상태: P0 예시 모드
**모든 논문과 근거는 가상 예시입니다(실제 논문 아님).** 실제 논문 검색, AI 분석, 계정, PDF 업로드는 아직 없습니다. 저장은 이 브라우저(IndexedDB)에만 됩니다.

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

## 아직 없는 것
실검색(Semantic Scholar/Crossref), AI 해석, 연결된 로그인·클라우드 저장(계정 설정이 없으면 메뉴를 숨김), PDF 업로드·원문 위치, 인쇄 레이아웃, 피드백 새 버전 UI. 서버는 Express이며 설정 예시는 `.env.example`이다. 단계별 계획과 검증 상태는 `docs/PROGRESS.md`를 보세요.

## 문서
`docs/PRODUCT_CONTRACT.md`, `PROGRESS.md`, `DECISIONS.md`, `TEST_MATRIX.md`, `BACKLOG.md`


## 보완 후 상태
새로고침·뒤로 가기 복원(`?project=`), 손상 데이터 복구 화면, 소재 반영, 논문 직접 추가, 구조화 비교 셀을 지원한다. 설치된 Chrome으로 e2e: `$env:PW_CHANNEL="chrome"; npm run e2e`.
