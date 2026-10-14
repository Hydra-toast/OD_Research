import { validateProject } from '../schema.js';

/** 메모리 저장소(계약 확인용). IndexedDB 구현은 7단계. @returns {import('../providers/contracts.js').ProjectRepository} */
export function createMemoryRepository() {
  const store = new Map();
  return {
    async load(id) { return store.get(id) ?? null; },
    async save(p) {
      const errs = validateProject(p);
      if (errs.length) throw new Error(`잘못된 Project: ${errs.join(', ')}`);
      store.set(p.id, structuredClone(p));
    },
    async list() { return [...store.values()]; },
    async delete(id) { store.delete(id); },
  };
}
