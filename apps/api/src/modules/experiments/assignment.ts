/** Deterministic weighted A/B assignment (blueprint §3/§6). */

export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick an arm deterministically from `hashInput`, honoring arm weights. */
export function pickArm<T extends { weight: number }>(arms: T[], hashInput: string): T | undefined {
  if (arms.length === 0) return undefined;
  const total = arms.reduce((s, a) => s + Math.max(0, a.weight), 0);
  if (total <= 0) return arms[0];
  const point = (fnv1a(hashInput) % 100000) / 100000; // 0..1, stable
  let acc = 0;
  for (const arm of arms) {
    acc += Math.max(0, arm.weight) / total;
    if (point < acc) return arm;
  }
  return arms[arms.length - 1];
}
