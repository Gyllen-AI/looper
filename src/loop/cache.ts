import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { JSON_INDENT } from "../config.ts";
import { fieldAt, reasonFrom } from "../fields.ts";
import { writeAtomically } from "../atomic.ts";

const KEPT_DIR = join(".looper", "seen");

const NAME_LENGTH = 12;

export type Kept = {
  readonly at: string;
  readonly ok: number;
  readonly broken: number;
  readonly blind: number;
  readonly failing: readonly string[];
};

export type Read =
  | { readonly kind: "never" }
  | { readonly kind: "unreadable"; readonly why: string }
  | { readonly kind: "kept"; readonly kept: Kept };

export function keptPath(root: string, home: string): string {
  const print = createHash("sha256").update(root).digest("hex").slice(0, NAME_LENGTH);
  return join(home, KEPT_DIR, `${basename(root)}-${print}.loop.json`);
}

export function keep(root: string, home: string, kept: Kept): void {
  writeAtomically(keptPath(root, home), `${JSON.stringify(kept, null, JSON_INDENT)}\n`);
}

function numberAt(held: unknown, key: string): number | undefined {
  const value = fieldAt(held, key);
  return typeof value === "number" ? value : undefined;
}

export function lastSeen(root: string, home: string): Read {
  const path = keptPath(root, home);
  if (!existsSync(path)) return { kind: "never" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    return { kind: "unreadable", why: reasonFrom(cause) };
  }

  const at = fieldAt(parsed, "at");
  const ok = numberAt(parsed, "ok");
  const broken = numberAt(parsed, "broken");
  const blind = numberAt(parsed, "blind");
  const failing = fieldAt(parsed, "failing");
  if (typeof at !== "string" || ok === undefined || broken === undefined || blind === undefined) {
    return { kind: "unreadable", why: `${path} does not hold a loop answer` };
  }
  const named = Array.isArray(failing)
    ? failing.filter((one): one is string => typeof one === "string")
    : [];
  return { kind: "kept", kept: { at, ok, broken, blind, failing: named } };
}
