// 엔티티 11종의 JSDoc 계약. 런타임 검증은 schema.js, 레코드 전체 검증은 state/record.js.
// Paper, Project, Evidence, Claim은 schema.js에 정의되어 있다.

/** @typedef {import('./schema.js').Paper} Paper */
/** @typedef {import('./schema.js').Project} Project */
/** @typedef {import('./schema.js').Evidence} Evidence */
/** @typedef {import('./schema.js').Claim} Claim */

/**
 * 연구실 정보. 모두 사용자가 입력한 문자열이며 비워둘 수 있다.
 * @typedef {Object} LabProfile
 * @property {string} [papers] @property {string} [materials] @property {string} [processes]
 * @property {string} [equipment] @property {string} [measures] @property {string} [goal] @property {string} [constraints]
 * @property {string} [label] 예시 연구실 표시
 */
/**
 * 원문 문서(12단계에서 실사용).
 * @typedef {Object} SourceDocument
 * @property {string} id @property {string} paperId
 * @property {'metadata'|'abstract'|'fulltext'} access @property {'provider'|'user'|'example'} origin
 * @property {'none'|'ok'|'failed'|'scan_only'|'encrypted'} extraction
 */
/**
 * 연구 방향 후보.
 * @typedef {Object} Direction
 * @property {string} id @property {string} label @property {string} question @property {string} desc
 * @property {Paper[]} papers @property {Paper[]} readNext
 * @property {Paper[]} representative @property {Paper[]} recent
 */
/**
 * 사용자가 고른 자료.
 * @typedef {Object} Selection
 * @property {string[]} paperIds @property {string[]} directionIds
 */
/**
 * 랩미팅 피드백(11단계에서 실사용).
 * @typedef {Object} Feedback
 * @property {string} at @property {'no_equipment'|'weak_link'|'compare_other'|'need_recent'|'free'} kind @property {string} [text]
 */
/**
 * 분석 버전 기록.
 * @typedef {Object} AnalysisVersion
 * @property {string} at @property {string} label @property {string} scope
 */
/**
 * 백그라운드 작업(11단계에서 실사용).
 * @typedef {Object} Job
 * @property {string} id @property {'queued'|'running'|'succeeded'|'partial'|'failed'|'cancelled'} status
 */

export {};
