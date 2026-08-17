export class NotThere extends Error {
  constructor(what: string) {
    super(`looper looked for ${what} and it was not there`);
    this.name = "NotThere";
  }
}

export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new NotThere(what);
  return value;
}

export function countIn(counts: ReadonlyMap<string, number>, key: string): number {
  const held = counts.get(key);
  return held === undefined ? 0 : held;
}
