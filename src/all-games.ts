export function gameBatch(games: number[], batch: number, priorities: number[] = []): number[] {
  const unique = [...new Set(games)];
  const pins = [...new Set(priorities)].filter(id => unique.includes(id)).slice(0, 32);
  const rest = unique.filter(id => !pins.includes(id));
  const slots = 32 - pins.length;
  if (!slots || !rest.length) return pins;
  const start = (batch % Math.ceil(rest.length / slots)) * slots;
  return [...pins, ...rest.slice(start, start + slots)];
}

export function batchCount(games: number[], priorities: number[] = []): number {
  const unique = [...new Set(games)];
  const pins = [...new Set(priorities)].filter(id => unique.includes(id)).slice(0, 32);
  const slots = 32 - pins.length;
  return unique.length ? slots ? Math.max(1, Math.ceil((unique.length - pins.length) / slots)) : 1 : 0;
}
