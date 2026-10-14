// 가상 예시의 분류·방향 정의. 실제 연구 내용이 아니라 화면 동작을 설명하기 위한 자체 작성 자료다.
export const ROLE_LABEL = { review: '입문 리뷰', approach: '주요 접근 연구', recent: '최근 변화·한계' };
export const ROLE_REASON = {
  review: '배경 용어와 전체 흐름을 먼저 잡기 위한 리뷰 역할이에요.',
  approach: '주요 접근법과 사용 조건을 비교하기 위한 연구 역할이에요.',
  recent: '최근 변화나 남은 한계를 확인하기 위한 연구 역할이에요.',
};

/**
 * @typedef {{id:string,label:string,desc:string,question:string,materialTags:string[],processTags:string[],tags:string[],needs:string[],interpretation:string}} Branch
 * @typedef {{role:'review'|'approach'|'recent',branches:string[],tags:string[]}} Spec
 */

/** @param {Omit<Branch,'tags'>} b @returns {Branch} */
const branch = b => ({ ...b, tags: [...b.materialTags, ...b.processTags] });

/** @type {Record<string,{name:string,keywords:string[],branches:Branch[],specs:Spec[]}>} */
export const TOPIC_DEFS = {
  euv: {
    name: 'EUV 포토레지스트',
    keywords: ['euv', '포토레지스트', 'photoresist', '레지스트', '금속산화물', '화학증폭'],
    branches: [
      branch({ id: 'euv-car', label: '화학증폭형 레지스트', desc: '산 촉매 반응을 이용하는 계열을 다룬 예시 갈래.', question: '화학증폭형에서 감도와 거칠기를 함께 보려면 어떤 조건을 맞춰야 할까?', materialTags: ['화학증폭형'], processTags: ['LER'], needs: ['스핀 코터', 'EUV 노광 접근'], interpretation: '[예시 해석] 감도와 거칠기를 같은 조건에서 비교해야 하는 갈래로 분류함' }),
      branch({ id: 'euv-mo', label: '금속산화물 레지스트', desc: '금속 포함 재료 계열을 다룬 예시 갈래.', question: '금속 포함 재료의 현상 조건 차이를 어떻게 비교할 수 있을까?', materialTags: ['금속산화물'], processTags: ['현상', '감도'], needs: ['현상 장비', '막 두께 측정'], interpretation: '[예시 해석] 현상 조건 차이가 결과 비교의 핵심 확인 항목으로 분류함' }),
      branch({ id: 'euv-sto', label: '확률적 결함', desc: '패턴 결함의 통계적 성격을 다룬 예시 갈래.', question: '결함 평가 조건이 논문마다 어떻게 다른가?', materialTags: [], processTags: ['확률적 결함', 'LER'], needs: ['패턴 측정 장비'], interpretation: '[예시 해석] 평가 정의가 논문마다 다른지 확인할 갈래로 분류함' }),
    ],
    specs: [
      { role: 'review', branches: ['euv-car'], tags: ['화학증폭형', '배경'] },
      { role: 'approach', branches: ['euv-car'], tags: ['화학증폭형', 'LER'] },
      { role: 'approach', branches: ['euv-mo'], tags: ['금속산화물', '감도'] },
      { role: 'approach', branches: ['euv-mo'], tags: ['금속산화물', '현상'] },
      { role: 'recent', branches: ['euv-sto'], tags: ['확률적 결함', 'LER'] },
      { role: 'recent', branches: ['euv-sto', 'euv-mo'], tags: ['확률적 결함', '감도'] },
      { role: 'approach', branches: ['euv-car', 'euv-mo'], tags: ['금속산화물', '화학증폭형'] },
      { role: 'review', branches: ['euv-car', 'euv-mo', 'euv-sto'], tags: ['배경', '확률적 결함'] },
    ],
  },
  ald: {
    name: 'ALD / High-k',
    keywords: ['ald', '원자층', 'high-k', 'highk', '고유전', '전구체', '박막'],
    branches: [
      branch({ id: 'ald-hk', label: 'High-k 박막 증착', desc: '고유전율 박막 성장 조건을 다룬 예시 갈래.', question: '증착 온도와 전구체 선택이 박막 특성 비교에 어떤 영향을 줄까?', materialTags: ['High-k'], processTags: ['온도창'], needs: ['ALD 장비', '전기 특성 측정'], interpretation: '[예시 해석] 증착 조건과 박막 특성을 함께 비교해야 하는 갈래로 분류함' }),
      branch({ id: 'ald-sel', label: '영역 선택적 증착', desc: '표면에 따라 성장을 달리하는 접근을 다룬 예시 갈래.', question: '선택성은 어떤 조건에서 유지되고 언제 무너질까?', materialTags: [], processTags: ['영역선택', '표면처리'], needs: ['표면 분석 장비'], interpretation: '[예시 해석] 선택성이 유지되는 조건을 확인할 갈래로 분류함' }),
      branch({ id: 'ald-pre', label: '전구체와 공정 온도창', desc: '전구체 특성과 온도창을 다룬 예시 갈래.', question: '전구체별 온도창을 같은 기준으로 비교할 수 있을까?', materialTags: ['전구체'], processTags: ['온도창'], needs: ['ALD 장비'], interpretation: '[예시 해석] 온도창 비교 기준을 맞추는 일이 핵심으로 분류함' }),
    ],
    specs: [
      { role: 'review', branches: ['ald-hk', 'ald-pre'], tags: ['High-k', '배경'] },
      { role: 'approach', branches: ['ald-hk'], tags: ['High-k', '온도창'] },
      { role: 'approach', branches: ['ald-pre'], tags: ['전구체', '온도창'] },
      { role: 'approach', branches: ['ald-sel'], tags: ['영역선택', '표면처리'] },
      { role: 'recent', branches: ['ald-sel'], tags: ['영역선택', '한계'] },
      { role: 'recent', branches: ['ald-hk', 'ald-pre'], tags: ['High-k', '전구체'] },
      { role: 'approach', branches: ['ald-hk'], tags: ['High-k', '표면처리'] },
      { role: 'review', branches: ['ald-sel', 'ald-pre'], tags: ['배경', '전구체'] },
    ],
  },
  hbm: {
    name: 'HBM',
    keywords: ['hbm', '적층', '패키징', 'tsv'],
    branches: [
      branch({ id: 'hbm-stack', label: '적층·패키징', desc: '적층 구조와 패키징 조건을 다룬 예시 갈래.', question: '적층 구조에서 확인할 조건을 논문 사이에 같은 기준으로 비교할 수 있을까?', materialTags: [], processTags: ['적층'], needs: ['적층·접합 장비'], interpretation: '[예시 해석] 적층 조건 비교 기준을 확인할 갈래로 분류함' }),
    ],
    specs: [
      { role: 'review', branches: ['hbm-stack'], tags: ['적층', '배경'] },
      { role: 'approach', branches: ['hbm-stack'], tags: ['적층'] },
      { role: 'recent', branches: ['hbm-stack'], tags: ['적층', '한계'] },
    ],
  },
};

export const EXAMPLE_LAB = {
  label: '예시 연구실(가상)',
  materials: '금속산화물, 박막',
  processes: '스핀 코팅, 현상',
  equipment: '스핀 코터, 현상 장비',
  measures: '막 두께 측정',
  goal: '',
  constraints: '',
};

export const COMPARE_ITEMS = ['연구 목적', '주요 접근법', '재료·공정', '주요 결과', '결과가 성립한 조건', '저자가 밝힌 한계', '이번 조사와의 연결'];
export const EMPTY_LABEL = {
  not_found_in_sources: '확보한 자료에서 찾지 못함',
  fulltext_unavailable: '원문 미확보',
  extraction_failed: '추출 실패',
  not_applicable: '해당 항목 적용 안 됨',
};
