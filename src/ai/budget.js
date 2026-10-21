// 앱 안의 추정 예산. 공급자 청구 상한을 보장하지 않는다.
export function createBudget({ dailyUsd = 1, projectUsd = 0.25 } = {}) {
  /** @type {Map<string, { spent: number, reserved: number }>} */
  const days = new Map();
  /** @type {Map<string, { spent: number, reserved: number }>} */
  const projects = new Map();
  let chain = Promise.resolve();
  const run = (/** @type {() => any} */ fn) => {
    const job = chain.then(fn, fn);
    chain = job.then(() => {}, () => {});
    return job;
  };
  const dayKey = () => new Date().toISOString().slice(0, 10);
  const bag = (/** @type {Map<string, {spent:number, reserved:number}>} */ map, /** @type {string} */ id) => map.get(id) ?? { spent: 0, reserved: 0 };
  return {
    /** @param {string} projectId @param {number} amount */
    reserve(projectId, amount) {
      return run(() => {
        if (!(amount > 0)) throw Object.assign(new Error('예약 금액이 필요해요.'), { code: 'bad_budget' });
        const day = bag(days, dayKey());
        const proj = bag(projects, projectId);
        if (day.spent + day.reserved + amount > dailyUsd) throw Object.assign(new Error('오늘 앱 예산을 넘어요. 공급자 청구 상한은 아니에요.'), { code: 'budget_exceeded' });
        if (proj.spent + proj.reserved + amount > projectUsd) throw Object.assign(new Error('이 조사의 앱 예산을 넘어요.'), { code: 'budget_exceeded' });
        day.reserved += amount; proj.reserved += amount;
        days.set(dayKey(), day); projects.set(projectId, proj);
        return { reserved: amount };
      });
    },
    /** @param {string} projectId @param {number} reserved @param {number} actual */
    settle(projectId, reserved, actual) {
      return run(() => {
        const day = bag(days, dayKey());
        const proj = bag(projects, projectId);
        day.reserved = Math.max(0, day.reserved - reserved);
        proj.reserved = Math.max(0, proj.reserved - reserved);
        day.spent += actual; proj.spent += actual;
        days.set(dayKey(), day); projects.set(projectId, proj);
        return { spent: actual };
      });
    },
  };
}
