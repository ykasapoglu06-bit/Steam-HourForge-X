export function gameBatch(games: number[], batch: number, priorities: number[] = []): number[] {
  const unique = [...new Set(games)];
  const pins = [...new Set(priorities)].filter(id => unique.includes(id)).slice(0, 32);
  const rest = unique.filter(id => !pins.includes(id));
  const slots = 32 - pins.length;
  if (!slots || !rest.length) return pins;
  const start = (batch % Math.ceil(rest.length / slots)) * slots;
  // Wrap the final partial group so available playtime slots stay occupied.
  const rotating = Array.from({length: Math.min(slots, rest.length)}, (_, index) => rest[(start + index) % rest.length]!);
  return [...pins, ...rotating];
}

export function batchCount(games: number[], priorities: number[] = []): number {
  const unique = [...new Set(games)];
  const pins = [...new Set(priorities)].filter(id => unique.includes(id)).slice(0, 32);
  const slots = 32 - pins.length;
  return unique.length ? slots ? Math.max(1, Math.ceil((unique.length - pins.length) / slots)) : 1 : 0;
}
