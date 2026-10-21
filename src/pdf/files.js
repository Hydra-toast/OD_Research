// 프로젝트 소유 파일. 업로드는 AI 전송 동의가 아니다.
import { createHash, randomBytes } from 'node:crypto';
import { inspectPdf, LIMITS } from './policy.js';

export function createFileStore({ now = () => Date.now() } = {}) {
  /** @type {Map<string, any>} */
  const files = new Map();
  return {
    /** @param {{ ownerId: string, projectId: string, filename: string, bytes: Buffer }} input */
    add(input) {
      const owned = [...files.values()].filter(f => f.projectId === input.projectId && !f.deletedAt);
      if (owned.length >= LIMITS.files) return { error: 'too_many' };
      if (owned.reduce((s, f) => s + f.bytes.length, 0) + input.bytes.length > LIMITS.totalBytes) return { error: 'project_too_large' };
      const check = inspectPdf(input.bytes);
      if (!check.ok) return { error: check.code };
      const id = randomBytes(8).toString('hex');
      const row = {
        id, ownerId: input.ownerId, projectId: input.projectId, filename: input.filename, bytes: input.bytes,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        extractor: null, pages: /** @type {any[]} */ ([]), createdAt: now(), expiresAt: now() + LIMITS.retainMs, deletedAt: null,
      };
      files.set(id, row);
      return { file: publicFile(row) };
    },
    /** @param {string} ownerId @param {string} id */
    get(ownerId, id) {
      const row = files.get(id);
      if (!row || row.deletedAt || row.ownerId !== ownerId) return null;
      return row;
    },
    /** @param {string} ownerId @param {string} id @param {{ extractor: string, pages: any[], scanOnly?: boolean, damaged?: boolean }} extract */
    saveExtract(ownerId, id, extract) {
      const row = this.get(ownerId, id);
      if (!row) return null;
      row.extractor = extract.extractor; row.pages = extract.pages; row.scanOnly = !!extract.scanOnly; row.damaged = !!extract.damaged;
      return publicFile(row);
    },
    /** @param {string} ownerId @param {string} id */
    remove(ownerId, id) {
      const row = files.get(id);
      if (!row || row.ownerId !== ownerId) return { status: 'not_found' };
      row.deletedAt = now(); row.bytes = Buffer.alloc(0); row.pages = [];
      return { status: 'completed', kept: '사용자 노트와 서지정보는 파일과 따로 남아 있어요. 원문 위치를 쓰던 문장은 재확인이 필요해요.', providerDeletion: '백업에서의 즉시 영구 삭제는 보장하지 않아요.' };
    },
    purge() {
      const gone = [...files.values()].filter(f => !f.deletedAt && f.expiresAt <= now());
      for (const row of gone) { row.deletedAt = now(); row.bytes = Buffer.alloc(0); row.pages = []; }
      return gone.map(f => f.id);
    },
  };
}

function publicFile(/** @type {any} */ row) {
  return { id: row.id, projectId: row.projectId, sha256: row.sha256, filename: row.filename, expiresAt: new Date(row.expiresAt).toISOString(), scanOnly: !!row.scanOnly, damaged: !!row.damaged, pageCount: row.pages.length };
}
