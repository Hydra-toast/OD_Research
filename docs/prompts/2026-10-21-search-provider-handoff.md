# Research Landscape 검색 공급자 변경 인계 프롬프트

현재 프로젝트 C:/Users/USER/Dev/Research_Page의 기존 코드를 이어서 작업하세요. 아래 변경은 이미 적용되었으므로 새 프로젝트를 만들거나 같은 기능을 다시 작성하지 마세요.

먼저 AGENTS.md, .cursor/Research-Landscape-PRD.md(v1.1), docs/PRODUCT_CONTRACT.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/TEST_MATRIX.md, docs/BACKLOG.md를 읽고 실제 코드와 맞춰 확인하세요. 기존 사용자 변경·저장 데이터·개인 .env를 보존하고 자동 커밋·reset을 하지 마세요. research-landscape-prompts/의 원본 14개 프롬프트는 수정하지 마세요.

1. 검색 구성
Semantic Scholar를 사용하지 않습니다. OpenAlex를 주 검색으로 사용하고, Crossref는 결측 학술지·연도·초록 보완과 OpenAlex 장애 시 대체 검색에 사용합니다. 두 공급자의 결과를 매번 병렬 수집해 합치는 구현은 아닙니다. 정상 0건은 그대로 표시하고, 장애 대체는 Crossref 출처·경고·부분 성공으로 표시합니다. 양쪽 모두 실패하면 오류를 반환하며 예시 논문으로 바꾸지 마세요.

2. 설정
OPENALEX_API_KEY는 선택입니다. 비어 있어도 공개 검색이 활성화되고, 값이 있으면 OpenAlex Authorization 헤더에만 보냅니다. CROSSREF_MAILTO는 본인 연락 이메일이며 Gmail도 가능합니다. 이메일이 없으면 개별 논문 보완은 생략하지만 Crossref 공개 대체 검색은 가능합니다. SEARCH_ENABLED는 기본 true이고 false일 때만 실제 검색을 끕니다. SEMANTIC_SCHOLAR_API_KEY는 더 이상 사용하지 않습니다. 개인 이메일·키를 만들거나 설정 파일에 임의로 채우지 마세요.

3. 데이터와 화면
OpenAlex 초록은 abstract_inverted_index에서 복원합니다. DOI를 정규화하고 ID는 oa:/cr:로 구분합니다. ID·DOI 기준으로 중복을 제거하고 결측은 null, 보완 필드는 fieldSources로 출처를 보존합니다. 일반 입력은 실제 검색, 명시적인 예시 버튼은 가상 자료만 엽니다. 오류·0건·초록·준비 화면이 실제 자료를 가상 예시로 표시하지 않아야 합니다. 실제 자료의 미분석 비교 항목에 가상 요약을 넣지 마세요.

4. 저장과 원문
실제 검색 결과·선택·메모도 real 모드를 유지하며 IndexedDB에 저장·복원하도록 변경했습니다. 계정 동기화·보안을 의미하지 않습니다. 예시 문헌 혼합과 가상 데이터로의 복원을 막으세요. OpenAlex의 공개 PDF/XML 위치·라이선스·참고/관련 문헌 ID를 기록하지만 원문은 not_fetched 상태입니다. 링크가 있어도 본문 확보·분석 완료라고 표시하지 마세요. 이번 변경에서 자동 원문 다운로드·본문 분석을 추가한 것은 아닙니다. 실자료 연구 방향 자동 분석도 아직 미연결이며 별도 안내합니다. Sci-Hub/MCP는 추가하지 않습니다.

5. 변경 파일
검색은 src/providers/live.js, 설정·서버 연결은 server/env.js와 server/index.js, API 상태는 server/app.js를 확인하세요. 모드·저장 흐름은 src/controller/session.js, src/controller/persist.js, src/repository/idb.js, src/state/record.js를 확인하세요. 화면·비교·분석 안내는 src/views/, src/logic.js, src/controller/analysis.js에 반영되어 있습니다. 설정 안내는 README.md와 .env.example입니다.

6. 검증과 다음 행동
기존 기록상 키·메일 없는 OpenAlex EUV 검색 1회에서 50편 수집에 성공했습니다. checkJs와 최종 순수 단위 117개가 통과했습니다. Crossref 실호출·OpenAlex 키 인증·최종 로컬 HTTP·브라우저 회귀·원문 분석은 검증 완료가 아닙니다. e2e/live-search.e2e.js의 3개 시나리오는 작성·문법 확인만 했습니다. 이전 브라우저 실행 승인이 거절됐으므로 그것을 새 승인으로 간주하지 말고 현재 권한을 따르세요.

이후 요청받은 범위에서 남은 검증과 결손만 보완하세요. 우선순위는 최종 서버·UI 회귀, Crossref 실호출과 페이지/출처/상태 확인입니다. 긴 Retry-After 준수와 범위 재검색 시 선택·메모 보존도 확인하세요. 원문·AI·방향 분석은 별도 구현 범위로 유지하고 자동 착수하지 마세요. 검증 결과는 실제 확인/고정 응답 확인/실패/미검증으로 구분해 docs/PROGRESS.md와 TEST_MATRIX.md에 기록하세요.
