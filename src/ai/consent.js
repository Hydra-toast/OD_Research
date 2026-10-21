// 외부 AI 전송 동의. 검색 공급자에 보내는 검색어와 연구실 메모는 자동으로 포함하지 않는다.
export const CONSENT_TEXT_VERSION = 'consent-v1';
export const CONSENT_TEXT = '입력한 조사 내용, 연구실 정보, 선택한 발췌를 OpenAI로 보냅니다. 목적은 검색어 제안과 확보한 자료 안의 해석입니다. 동의하지 않아도 공개 논문 검색과 수동 정리, 예시 모드는 사용할 수 있습니다.';

/** @param {string[]} items */
export function scopeKey(items) {
  return [...new Set(items)].sort().join('|');
}

export function createConsentStore() {
  /** @type {Map<string, any>} */
  const rows = new Map();
  const idOf = (/** @type {string} */ projectId, /** @type {string} */ purpose, /** @type {string} */ key) => `${projectId}|${purpose}|${key}`;
  return {
    /** @param {{ projectId: string, purpose: string, items: string[] }} input */
    grant(input) {
      const key = scopeKey(input.items);
      const row = { projectId: input.projectId, purpose: input.purpose, items: [...new Set(input.items)], key, textVersion: CONSENT_TEXT_VERSION, at: new Date().toISOString(), withdrawnAt: null };
      rows.set(idOf(input.projectId, input.purpose, key), row);
      return row;
    },
    /** @param {string} projectId @param {string} purpose @param {string[]} items */
    allows(projectId, purpose, items) {
      const row = rows.get(idOf(projectId, purpose, scopeKey(items)));
      return !!row && !row.withdrawnAt;
    },
    /** @param {string} projectId */
    withdraw(projectId) {
      let n = 0;
      for (const row of rows.values()) if (row.projectId === projectId && !row.withdrawnAt) { row.withdrawnAt = new Date().toISOString(); n++; }
      return { stopped: n, providerDeletion: '공급자 쪽 저장분 삭제는 확인하지 않았어요.' };
    },
  };
}
