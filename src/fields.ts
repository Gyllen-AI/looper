export function fieldAt(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

export function textAt(value: unknown, key: string): unknown {
  const held = fieldAt(value, key);
  return typeof held === "string" ? held : undefined;
}

export function isTyped(value: unknown, type: string): boolean {
  return fieldAt(value, "type") === type;
}

export function reasonFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
